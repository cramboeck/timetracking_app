#!/bin/bash

# =============================================================================
# Frontend Container Diagnostic Script
# =============================================================================

set -e

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

print_header "Frontend Container Diagnostic"

# =============================================================================
# Check 1: Container Status
# =============================================================================

print_header "Container Status"

if docker ps -a --filter "name=ramboflow-frontend" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    STATUS=$(docker ps -a --filter "name=ramboflow-frontend" --format "{{.Status}}")
    print_info "Frontend Container Status: $STATUS"

    if docker inspect ramboflow-frontend --format='{{.State.Health.Status}}' 2>/dev/null; then
        HEALTH=$(docker inspect ramboflow-frontend --format='{{.State.Health.Status}}')
        print_info "Health Status: $HEALTH"
    fi
else
    print_error "Frontend Container nicht gefunden!"
    exit 1
fi

# =============================================================================
# Check 2: Container Logs
# =============================================================================

print_header "Container Logs (Letzte 100 Zeilen)"

docker logs --tail 100 ramboflow-frontend

# =============================================================================
# Check 3: Health Check Logs
# =============================================================================

print_header "Health Check Logs"

docker inspect ramboflow-frontend --format='{{json .State.Health}}' | jq '.' 2>/dev/null || \
docker inspect ramboflow-frontend --format='{{json .State.Health}}'

# =============================================================================
# Check 4: Nginx Configuration Test
# =============================================================================

print_header "Nginx Configuration Test"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    print_info "Teste Nginx-Konfiguration im Container..."
    docker exec ramboflow-frontend nginx -t 2>&1 || print_error "Nginx-Konfiguration ist fehlerhaft!"
else
    print_warning "Container läuft nicht - kann Nginx-Config nicht testen"
fi

# =============================================================================
# Check 5: Files in Container
# =============================================================================

print_header "Files in /usr/share/nginx/html"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    docker exec ramboflow-frontend ls -lah /usr/share/nginx/html
else
    print_warning "Container läuft nicht - kann Dateien nicht auflisten"

    # Try to start it temporarily
    print_info "Versuche Container temporär zu starten..."
    docker start ramboflow-frontend 2>/dev/null || true
    sleep 3

    if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
        docker exec ramboflow-frontend ls -lah /usr/share/nginx/html
    else
        print_error "Container kann nicht gestartet werden"
    fi
fi

# =============================================================================
# Check 6: Port Test
# =============================================================================

print_header "Port 8080 Test"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    print_info "Teste Port 8080 im Container..."
    docker exec ramboflow-frontend wget --no-verbose --tries=1 --spider http://localhost:8080/ 2>&1 || \
    print_error "Port 8080 nicht erreichbar!"

    print_info "Teste ob Nginx läuft..."
    docker exec ramboflow-frontend ps aux | grep nginx || print_error "Nginx läuft nicht!"
else
    print_warning "Container läuft nicht - kann Port nicht testen"
fi

# =============================================================================
# Check 7: Nginx Error Log
# =============================================================================

print_header "Nginx Error Log"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    print_info "Nginx Error Log:"
    docker exec ramboflow-frontend cat /var/log/nginx/error.log 2>/dev/null || \
    print_warning "Error log nicht verfügbar"
else
    print_warning "Container läuft nicht"
fi

# =============================================================================
# Check 8: Permissions
# =============================================================================

print_header "File Permissions Check"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" --format "{{.Names}}" | grep -q "ramboflow-frontend"; then
    print_info "Überprüfe Berechtigungen..."
    docker exec ramboflow-frontend ls -la /usr/share/nginx/html/index.html 2>/dev/null || \
    print_error "index.html nicht gefunden!"

    print_info "Nginx User:"
    docker exec ramboflow-frontend id nginx 2>/dev/null || print_error "nginx user nicht gefunden"
fi

# =============================================================================
# Recommendations
# =============================================================================

print_header "Empfehlungen"

echo -e "${YELLOW}Basierend auf den Logs:${NC}\n"

echo -e "${BLUE}1.${NC} Wenn Nginx-Config fehlerhaft ist:"
echo "   Überprüfe nginx.conf in deinem Repository"
echo

echo -e "${BLUE}2.${NC} Wenn Port 8080 nicht erreichbar ist:"
echo "   Nginx startet möglicherweise nicht korrekt"
echo

echo -e "${BLUE}3.${NC} Wenn Dateien fehlen:"
echo "   Build-Prozess ist fehlgeschlagen - rebuild erforderlich"
echo

echo -e "${BLUE}4.${NC} Wenn Berechtigungsfehler:"
echo "   Dockerfile-Anpassung erforderlich"
echo

print_header "Nächste Schritte"

echo -e "${GREEN}Option 1: Nginx-Config-Fix (häufigste Lösung)${NC}"
echo "  Führe aus: ./fix-frontend-nginx.sh"
echo

echo -e "${GREEN}Option 2: Rebuild Frontend${NC}"
echo "  docker compose -f docker-compose.production.yml build --no-cache frontend"
echo "  docker compose --env-file .env.production -f docker-compose.production.yml up -d"
echo

echo -e "${GREEN}Option 3: Komplett neu starten${NC}"
echo "  docker compose -f docker-compose.production.yml down"
echo "  docker compose --env-file .env.production -f docker-compose.production.yml up -d --build"
echo
