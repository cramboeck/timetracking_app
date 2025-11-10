#!/bin/bash

# =============================================================================
# RamboFlow Hetzner Frontend Startup Fix Script
# =============================================================================
# Dieses Script diagnostiziert und behebt häufige Frontend-Startup-Probleme
# =============================================================================

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# =============================================================================
# Banner
# =============================================================================

clear
echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║        RamboFlow Frontend Startup Diagnostic & Fix           ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# =============================================================================
# Check 1: Nginx Configuration Domain Placeholders
# =============================================================================

print_header "Check 1: Nginx Configuration"

if grep -q "<<<DEINE_DOMAIN>>>" nginx/nginx.production.conf 2>/dev/null; then
    print_error "Domain-Platzhalter in nginx/nginx.production.conf gefunden!"

    if [ -f ".env.production" ]; then
        DOMAIN=$(grep "^DOMAIN=" .env.production | cut -d '=' -f2)
        if [ -n "$DOMAIN" ]; then
            print_info "Domain aus .env.production: $DOMAIN"
            read -p "Soll ich die Domain jetzt ersetzen? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sed -i "s/<<<DEINE_DOMAIN>>>/$DOMAIN/g" nginx/nginx.production.conf
                print_success "Domain ersetzt in nginx/nginx.production.conf"
            fi
        else
            print_warning "DOMAIN nicht in .env.production gefunden"
            read -p "Bitte gib deine Domain ein (z.B. example.com): " DOMAIN
            sed -i "s/<<<DEINE_DOMAIN>>>/$DOMAIN/g" nginx/nginx.production.conf
            print_success "Domain ersetzt in nginx/nginx.production.conf"
        fi
    else
        print_error ".env.production nicht gefunden!"
        read -p "Bitte gib deine Domain ein (z.B. example.com): " DOMAIN
        if [ -n "$DOMAIN" ]; then
            sed -i "s/<<<DEINE_DOMAIN>>>/$DOMAIN/g" nginx/nginx.production.conf
            print_success "Domain ersetzt in nginx/nginx.production.conf"
        fi
    fi
else
    print_success "Nginx-Konfiguration: Domain bereits konfiguriert"
fi

# =============================================================================
# Check 2: Required Directories
# =============================================================================

print_header "Check 2: Required Directories"

DIRS_MISSING=false

if [ ! -d "/var/lib/ramboflow/postgres" ]; then
    print_warning "Verzeichnis fehlt: /var/lib/ramboflow/postgres"
    DIRS_MISSING=true
fi

if [ ! -d "/var/lib/ramboflow/logs" ]; then
    print_warning "Verzeichnis fehlt: /var/lib/ramboflow/logs"
    DIRS_MISSING=true
fi

if [ ! -d "/var/lib/ramboflow/backups" ]; then
    print_warning "Verzeichnis fehlt: /var/lib/ramboflow/backups"
    DIRS_MISSING=true
fi

if [ "$DIRS_MISSING" = true ]; then
    read -p "Fehlende Verzeichnisse erstellen? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo mkdir -p /var/lib/ramboflow/{postgres,logs,backups}
        sudo chown -R $(whoami):$(whoami) /var/lib/ramboflow
        print_success "Verzeichnisse erstellt und Berechtigungen gesetzt"
    fi
else
    print_success "Alle benötigten Verzeichnisse existieren"
fi

# =============================================================================
# Check 3: SSL Certificates
# =============================================================================

print_header "Check 3: SSL Certificates"

# Check if domain is set
if [ -z "$DOMAIN" ] && [ -f ".env.production" ]; then
    DOMAIN=$(grep "^DOMAIN=" .env.production | cut -d '=' -f2)
fi

if [ -z "$DOMAIN" ]; then
    print_warning "Domain nicht gesetzt. SSL-Check wird übersprungen."
    print_info "Führe setup-production.sh aus für vollständiges Setup"
else
    # Check if SSL certificates exist in Docker volume
    SSL_EXISTS=$(docker run --rm \
        -v letsencrypt:/etc/letsencrypt \
        alpine:latest \
        sh -c "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem && echo 'yes' || echo 'no'")

    if [ "$SSL_EXISTS" = "yes" ]; then
        print_success "SSL-Zertifikate gefunden für $DOMAIN"
    else
        print_error "SSL-Zertifikate fehlen für $DOMAIN"
        print_info "Optionen:"
        echo "  1) Führe setup-production.sh aus (empfohlen für Neuinstallation)"
        echo "  2) Starte ohne SSL (nur für Tests/Debugging)"
        echo "  3) Überspringe diesen Schritt"
        read -p "Wähle eine Option (1/2/3): " -n 1 -r
        echo

        if [[ $REPLY = "2" ]]; then
            print_warning "Erstelle HTTP-only nginx Konfiguration..."

            # Backup current config
            cp nginx/nginx.production.conf nginx/nginx.production.conf.backup

            # Create HTTP-only config
            cat > nginx/nginx.production.conf <<EOF
events {
    worker_connections 2048;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    upstream frontend_upstream {
        server frontend:8080;
    }

    upstream backend_upstream {
        server backend:3001;
    }

    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;

        location /api/ {
            proxy_pass http://backend_upstream/api/;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        }

        location /health {
            proxy_pass http://backend_upstream/health;
        }

        location / {
            proxy_pass http://frontend_upstream/;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
        }
    }
}
EOF
            print_success "HTTP-only Konfiguration erstellt"
            print_warning "ACHTUNG: Nur für Tests! Keine SSL-Verschlüsselung!"
        fi
    fi
fi

# =============================================================================
# Check 4: Docker Containers Status
# =============================================================================

print_header "Check 4: Docker Container Status"

if docker ps -a --format "{{.Names}}" | grep -q "ramboflow"; then
    print_info "Aktuelle Container:"
    docker ps -a --filter "name=ramboflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo

    # Check for unhealthy containers
    UNHEALTHY=$(docker ps --filter "name=ramboflow" --filter "health=unhealthy" --format "{{.Names}}")
    if [ -n "$UNHEALTHY" ]; then
        print_error "Unhealthy Container gefunden: $UNHEALTHY"
        read -p "Logs anzeigen? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker logs --tail 50 $UNHEALTHY
        fi
    fi

    # Check if frontend is running
    if docker ps --filter "name=ramboflow-frontend" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
        print_success "Frontend Container läuft"
    else
        print_error "Frontend Container läuft nicht!"
        if docker ps -a --filter "name=ramboflow-frontend" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
            print_info "Container existiert aber ist gestoppt"
            read -p "Logs anzeigen? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker logs --tail 100 ramboflow-frontend
            fi
        fi
    fi
else
    print_warning "Keine RamboFlow Container gefunden"
    print_info "Container müssen noch gestartet werden"
fi

# =============================================================================
# Check 5: Environment File
# =============================================================================

print_header "Check 5: Environment Configuration"

if [ -f ".env.production" ]; then
    print_success ".env.production gefunden"

    # Check for critical variables
    CRITICAL_VARS=("DOMAIN" "DB_PASSWORD" "JWT_SECRET" "FRONTEND_URL")
    MISSING_VARS=()

    for VAR in "${CRITICAL_VARS[@]}"; do
        if ! grep -q "^${VAR}=" .env.production; then
            MISSING_VARS+=("$VAR")
        fi
    done

    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        print_error "Fehlende kritische Variablen: ${MISSING_VARS[*]}"
        print_info "Führe setup-production.sh aus für vollständige Konfiguration"
    else
        print_success "Alle kritischen Variablen vorhanden"
    fi
else
    print_error ".env.production nicht gefunden!"
    print_info "Führe setup-production.sh aus oder kopiere .env.production.example"
fi

# =============================================================================
# Recommendations
# =============================================================================

print_header "Empfehlungen & Nächste Schritte"

echo -e "${YELLOW}Basierend auf den Checks:${NC}\n"

# Determine what to do
NEEDS_SETUP=false
NEEDS_RESTART=false
NEEDS_SSL=false

if [ ! -f ".env.production" ] || grep -q "<<<DEINE_DOMAIN>>>" nginx/nginx.production.conf 2>/dev/null; then
    NEEDS_SETUP=true
fi

if [ "$SSL_EXISTS" = "no" ] && [ -n "$DOMAIN" ]; then
    NEEDS_SSL=true
fi

if docker ps -a --filter "name=ramboflow" --format "{{.Names}}" | grep -q "ramboflow"; then
    if ! docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
        NEEDS_RESTART=true
    fi
fi

if [ "$NEEDS_SETUP" = true ]; then
    echo -e "${BLUE}1.${NC} Führe das vollständige Setup aus:"
    echo "   ${GREEN}./setup-production.sh${NC}"
    echo
elif [ "$NEEDS_SSL" = true ]; then
    echo -e "${BLUE}1.${NC} SSL-Zertifikate einrichten:"
    echo "   Siehe: DEPLOYMENT_HETZNER.md Abschnitt 6"
    echo
    NEEDS_RESTART=true
elif [ "$NEEDS_RESTART" = true ]; then
    echo -e "${BLUE}1.${NC} Services neu starten:"
    echo "   ${GREEN}docker compose --env-file .env.production -f docker-compose.production.yml down${NC}"
    echo "   ${GREEN}docker compose --env-file .env.production -f docker-compose.production.yml up -d --build${NC}"
    echo
fi

echo -e "${BLUE}Debugging-Befehle:${NC}"
echo "  ${GREEN}# Alle Logs anzeigen${NC}"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo
echo "  ${GREEN}# Nur Frontend-Logs${NC}"
echo "  docker logs -f ramboflow-frontend"
echo
echo "  ${GREEN}# Nur Nginx-Logs${NC}"
echo "  docker logs -f ramboflow-nginx"
echo
echo "  ${GREEN}# Container Status${NC}"
echo "  docker ps -a --filter 'name=ramboflow'"
echo

# =============================================================================
# Interactive Fix
# =============================================================================

print_header "Automatische Reparatur"

read -p "Soll ich versuchen, die Services neu zu starten? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f ".env.production" ] && [ -f "docker-compose.production.yml" ]; then
        print_info "Stoppe alle Container..."
        docker compose -f docker-compose.production.yml down 2>/dev/null || true

        print_info "Starte Services neu..."
        docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

        print_info "Warte auf Services (30 Sekunden)..."
        sleep 30

        print_info "Service Status:"
        docker ps --filter "name=ramboflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

        echo
        print_success "Services neu gestartet!"
        print_info "Prüfe die Logs mit: docker compose -f docker-compose.production.yml logs -f"
    else
        print_error "Notwendige Dateien fehlen. Führe setup-production.sh aus."
    fi
fi

print_header "Diagnose abgeschlossen"

echo -e "${GREEN}Für weitere Hilfe siehe:${NC}"
echo "  - DEPLOYMENT_HETZNER.md"
echo "  - README_DOCKER.md"
echo "  - GitHub Issues: https://github.com/cramboeck/timetracking_app/issues"
echo
