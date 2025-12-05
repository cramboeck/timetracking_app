#!/bin/bash

# =============================================================================
# RamboFlow Production Setup Script
# =============================================================================
# Dieses Script hilft dir, dein Production-Deployment schnell einzurichten
# =============================================================================

set -e  # Exit on error

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

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

generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

generate_jwt_secret() {
    openssl rand -base64 64 | tr -d "=+/" | cut -c1-64
}

# =============================================================================
# Banner
# =============================================================================

clear
echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    ____                  __           ________               ║
║   / __ \____ _____ ___  / /_  ____   / ____/ /___ _      __ ║
║  / /_/ / __ `/ __ `__ \/ __ \/ __ \ / /_  / / __ \ | /| / / ║
║ / _, _/ /_/ / / / / / / /_/ / /_/ / __/ / / /_/ / |/ |/ /  ║
║/_/ |_|\__,_/_/ /_/ /_/_.___/\____/_/   /_/\____/|__/|__/   ║
║                                                              ║
║           Production Deployment Setup                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# =============================================================================
# Pre-flight Checks
# =============================================================================

print_header "Pre-flight Checks"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Du führst dieses Script als root aus."
    print_info "Es ist empfohlen, einen normalen User mit sudo zu verwenden."
    read -p "Trotzdem fortfahren? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker ist nicht installiert!"
    print_info "Installiere Docker mit: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
print_success "Docker gefunden: $(docker --version)"

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    print_error "Docker Compose ist nicht installiert!"
    print_info "Installiere Docker Compose Plugin"
    exit 1
fi
print_success "Docker Compose gefunden: $(docker compose version)"

# Check if .env.production.example exists
if [ ! -f ".env.production.example" ]; then
    print_error ".env.production.example nicht gefunden!"
    exit 1
fi
print_success ".env.production.example gefunden"

# =============================================================================
# User Input
# =============================================================================

print_header "Konfiguration"

print_info "Ich stelle dir jetzt ein paar Fragen, um dein Deployment zu konfigurieren."
echo

# Domain
read -p "$(echo -e ${BLUE}1/7${NC}) Deine Domain (ohne https://): " DOMAIN
if [ -z "$DOMAIN" ]; then
    print_error "Domain darf nicht leer sein!"
    exit 1
fi
print_success "Domain: $DOMAIN"

# Email
read -p "$(echo -e ${BLUE}2/7${NC}) Deine E-Mail-Adresse (für Let's Encrypt): " EMAIL
if [ -z "$EMAIL" ]; then
    print_error "E-Mail darf nicht leer sein!"
    exit 1
fi
print_success "E-Mail: $EMAIL"

# Email Mode
echo -e "\n$(echo -e ${BLUE}3/7${NC}) E-Mail-Versand aktivieren?"
print_info "Im Test-Modus werden E-Mails nur geloggt, nicht versendet."
read -p "Test-Modus aktiv lassen? (y/n) [y]: " EMAIL_TEST_MODE
EMAIL_TEST_MODE=${EMAIL_TEST_MODE:-y}

if [[ $EMAIL_TEST_MODE =~ ^[Nn]$ ]]; then
    EMAIL_TEST_MODE_VALUE="false"
    echo
    print_info "E-Mail-SMTP konfigurieren:"
    read -p "  SMTP Host (z.B. smtp.gmail.com): " EMAIL_HOST
    read -p "  SMTP Port (meist 587): " EMAIL_PORT
    read -p "  SMTP User: " EMAIL_USER
    read -sp "  SMTP Password: " EMAIL_PASSWORD
    echo
    read -p "  From-Adresse (z.B. noreply@$DOMAIN): " EMAIL_FROM
else
    EMAIL_TEST_MODE_VALUE="true"
    EMAIL_HOST="smtp.example.com"
    EMAIL_PORT="587"
    EMAIL_USER="user@example.com"
    EMAIL_PASSWORD="dummy"
    EMAIL_FROM="noreply@$DOMAIN"
fi
print_success "E-Mail-Konfiguration gespeichert"

# Generate passwords
echo -e "\n$(echo -e ${BLUE}4/7${NC}) Sichere Passwörter generieren..."
DB_PASSWORD=$(generate_password)
print_success "Datenbank-Passwort generiert"

echo -e "\n$(echo -e ${BLUE}5/7${NC}) JWT Secret generieren..."
JWT_SECRET=$(generate_jwt_secret)
print_success "JWT Secret generiert"

# Backup retention
echo -e "\n$(echo -e ${BLUE}6/7${NC}) Backup-Aufbewahrung in Tagen [30]: "
read -p "" BACKUP_RETENTION
BACKUP_RETENTION=${BACKUP_RETENTION:-30}
print_success "Backups werden $BACKUP_RETENTION Tage aufbewahrt"

# Confirmation
echo -e "\n$(echo -e ${BLUE}7/7${NC}) Staging-Modus für SSL-Zertifikate?"
print_info "Im Staging-Modus werden Test-Zertifikate erstellt (keine Rate-Limits)"
print_info "Für Production: Staging-Modus deaktivieren!"
read -p "Staging-Modus aktivieren? (y/n) [n]: " STAGING_MODE
STAGING_MODE=${STAGING_MODE:-n}

if [[ $STAGING_MODE =~ ^[Yy]$ ]]; then
    CERTBOT_STAGING="true"
    print_warning "Staging-Modus aktiviert - Test-Zertifikate werden erstellt"
else
    CERTBOT_STAGING="false"
    print_success "Production-Modus - Echte Zertifikate werden erstellt"
fi

# =============================================================================
# Create .env.production
# =============================================================================

print_header "Environment-Datei erstellen"

cat > .env.production <<EOF
# =============================================================================
# RamboFlow Production Environment
# Generiert am: $(date)
# =============================================================================

# Domain
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN
BACKEND_URL=https://$DOMAIN

# Datenbank
DB_PASSWORD=$DB_PASSWORD
DB_NAME=timetracking
DB_USER=timetracking
DB_HOST=database
DB_PORT=5432
DB_SSL=false

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=604800

# Email
EMAIL_TEST_MODE=$EMAIL_TEST_MODE_VALUE
EMAIL_HOST=$EMAIL_HOST
EMAIL_PORT=$EMAIL_PORT
EMAIL_SECURE=false
EMAIL_USER=$EMAIL_USER
EMAIL_PASSWORD=$EMAIL_PASSWORD
EMAIL_FROM=$EMAIL_FROM

# SSL / Certbot
CERTBOT_EMAIL=$EMAIL
CERTBOT_STAGING=$CERTBOT_STAGING

# Node
NODE_ENV=production
BACKEND_PORT=3001
FRONTEND_PORT=8080

# Security
API_RATE_LIMIT=10
LOGIN_RATE_LIMIT=5
CORS_ORIGINS=https://$DOMAIN

# Backup
BACKUP_RETENTION_DAYS=$BACKUP_RETENTION
BACKUP_CRON=0 2 * * *

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=30

# App Settings
DEFAULT_TIME_ROUNDING=15
MAX_CSV_SIZE=10
SESSION_TIMEOUT=60
EOF

print_success ".env.production erstellt"

# =============================================================================
# Update Nginx Configuration
# =============================================================================

print_header "Nginx-Konfiguration anpassen"

# Replace domain in nginx config
sed -i "s/<<<DEINE_DOMAIN>>>/$DOMAIN/g" nginx/nginx.production.conf
print_success "Domain in nginx.production.conf ersetzt: $DOMAIN"

# =============================================================================
# Create necessary directories
# =============================================================================

print_header "Verzeichnisse erstellen"

sudo mkdir -p /var/lib/ramboflow/{postgres,logs,backups}
sudo chown -R $(whoami):$(whoami) /var/lib/ramboflow
print_success "Verzeichnisse erstellt: /var/lib/ramboflow"

# =============================================================================
# Setup SSL Certificates
# =============================================================================

print_header "SSL-Zertifikate einrichten"

print_info "Erstelle temporäre Nginx-Konfiguration für Certbot..."

# Create temp nginx config for certbot
cat > nginx/nginx.temp.conf <<EOF
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name $DOMAIN www.$DOMAIN;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF

print_success "Temporäre Nginx-Config erstellt"

# Create temp docker-compose for SSL setup
print_info "Starte temporären Nginx für SSL-Zertifikat..."

docker compose -f - up -d <<EOF
version: '3.9'
services:
  nginx-temp:
    image: nginx:alpine
    container_name: ramboflow-nginx-temp
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.temp.conf:/etc/nginx/nginx.conf:ro
      - certbot_data:/var/www/certbot

volumes:
  certbot_data:
EOF

sleep 5
print_success "Temporärer Nginx gestartet"

# Request SSL certificate
print_info "Fordere SSL-Zertifikat von Let's Encrypt an..."

STAGING_FLAG=""
if [ "$CERTBOT_STAGING" = "true" ]; then
    STAGING_FLAG="--staging"
    print_warning "Staging-Modus: Test-Zertifikat wird erstellt"
fi

docker run --rm \
    -v certbot_data:/var/www/certbot \
    -v letsencrypt:/etc/letsencrypt \
    certbot/certbot:arm64v8-latest \
    certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    $STAGING_FLAG \
    -d $DOMAIN \
    -d www.$DOMAIN

if [ $? -eq 0 ]; then
    print_success "SSL-Zertifikat erfolgreich erstellt!"
else
    print_error "Fehler beim Erstellen des SSL-Zertifikats"
    print_info "Prüfe, ob die Domain auf deinen Server zeigt:"
    print_info "  nslookup $DOMAIN"
    print_info "  ping $DOMAIN"
    exit 1
fi

# Stop temp nginx
docker stop ramboflow-nginx-temp
docker rm ramboflow-nginx-temp
print_success "Temporärer Nginx gestoppt"

# =============================================================================
# Start Production Services
# =============================================================================

print_header "Production Services starten"

print_info "Docker Images werden gebaut (das kann einige Minuten dauern)..."

docker compose --env-file .env.production -f docker-compose.production.yml build

print_success "Images erfolgreich gebaut"

print_info "Starte alle Services..."

docker compose --env-file .env.production -f docker-compose.production.yml up -d

print_success "Alle Services gestartet!"

# =============================================================================
# Wait for services to be healthy
# =============================================================================

print_header "Warte auf Services"

print_info "Warte auf Datenbank..."
sleep 10

print_info "Warte auf Backend..."
sleep 10

print_info "Warte auf Frontend..."
sleep 5

# =============================================================================
# Verify Deployment
# =============================================================================

print_header "Deployment verifizieren"

# Check services
echo
print_info "Service-Status:"
docker compose -f docker-compose.production.yml ps

# Test health endpoints
echo
print_info "Health-Checks:"

if curl -f -s "https://$DOMAIN/health" > /dev/null; then
    print_success "Backend Health: OK"
else
    print_warning "Backend Health: Nicht erreichbar (evtl. noch am Starten)"
fi

if curl -f -s "https://$DOMAIN" > /dev/null; then
    print_success "Frontend: OK"
else
    print_warning "Frontend: Nicht erreichbar (evtl. noch am Starten)"
fi

# =============================================================================
# Summary
# =============================================================================

print_header "Deployment abgeschlossen! 🎉"

echo -e "${GREEN}"
cat << "EOF"
    ____  ____  _ ____________
   / __ \/ __ \/ / ____/ ____/
  / /_/ / /_/ / / / __/ __/
 / _, _/ _, _/ / /_/ / /___
/_/ |_/_/ |_/_/\____/_____/
EOF
echo -e "${NC}"

echo
print_success "Dein RamboFlow ist jetzt live!"
echo
print_info "Frontend:        https://$DOMAIN"
print_info "Backend API:     https://$DOMAIN/api"
print_info "Health Check:    https://$DOMAIN/health"
echo
print_warning "WICHTIG: Speichere diese Datei an einem sicheren Ort:"
print_warning "         .env.production"
echo
print_info "Nützliche Befehle:"
echo -e "  ${BLUE}# Logs ansehen${NC}"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo
echo -e "  ${BLUE}# Services neu starten${NC}"
echo "  docker compose -f docker-compose.production.yml restart"
echo
echo -e "  ${BLUE}# Services stoppen${NC}"
echo "  docker compose -f docker-compose.production.yml down"
echo
echo -e "  ${BLUE}# Datenbank-Backup erstellen${NC}"
echo "  docker exec ramboflow-db pg_dump -U timetracking timetracking > backup.sql"
echo
print_info "Mehr Infos in: DEPLOYMENT_HETZNER.md"
echo
print_success "Viel Erfolg mit deiner Zeiterfassung! 🚀"
echo
