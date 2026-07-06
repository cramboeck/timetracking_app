#!/bin/bash

# =============================================================================
# Portal-Subdomain: SSL-Zertifikat erweitern
# =============================================================================
# Erweitert das bestehende Let's-Encrypt-Zertifikat (Lineage app.ramboeck.it)
# um portal.ramboeck.it und lädt nginx neu.
#
# VORAUSSETZUNGEN (in dieser Reihenfolge!):
#   1. DNS-Eintrag portal.ramboeck.it → Server-IP ist gesetzt und aufgelöst
#      (Prüfen: nslookup portal.ramboeck.it — muss die Server-IP zeigen)
#   2. Die aktualisierte nginx-Config ist bereits deployt (./scripts/deploy.sh),
#      d.h. Port 80 beantwortet die ACME-Challenge auch für portal.ramboeck.it
#
# Aufruf: sudo ./scripts/add-portal-cert.sh
# =============================================================================

set -e

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }

cd "$(dirname "$0")/.."

if [ ! -f ".env.production" ]; then
    print_error ".env.production nicht gefunden."
    exit 1
fi

EMAIL=$(grep CERTBOT_EMAIL .env.production | cut -d= -f2)

# DNS-Vorabprüfung — ohne aufgelösten A-Record scheitert die ACME-Challenge.
print_info "Prüfe DNS für portal.ramboeck.it..."
if ! getent hosts portal.ramboeck.it > /dev/null 2>&1; then
    print_error "portal.ramboeck.it löst nicht auf. Erst den DNS-Eintrag setzen und Propagation abwarten."
    exit 1
fi
print_success "DNS aufgelöst: $(getent hosts portal.ramboeck.it | awk '{print $1}' | head -1)"

# Zertifikat erweitern. --cert-name app.ramboeck.it hält die bestehende
# Lineage (nginx zeigt auf /etc/letsencrypt/live/app.ramboeck.it/), --expand
# fügt den neuen Namen additiv hinzu — bestehende Namen bleiben erhalten.
print_info "Erweitere Zertifikat um portal.ramboeck.it..."
sudo docker run --rm \
  -v certbot_data:/var/www/certbot \
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot:arm64v8-latest \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --expand \
  --cert-name app.ramboeck.it \
  -d app.ramboeck.it \
  -d portal.ramboeck.it

if [ $? -ne 0 ]; then
    print_error "Zertifikatserweiterung fehlgeschlagen."
    echo "  Prüfe: nslookup portal.ramboeck.it  und  curl http://portal.ramboeck.it/.well-known/acme-challenge/test"
    exit 1
fi
print_success "Zertifikat erweitert."

# nginx neu laden, damit das erweiterte Zertifikat aktiv wird (kein Rebuild nötig).
print_info "Lade nginx neu..."
sudo docker exec ramboflow-nginx nginx -s reload
print_success "nginx neu geladen."

echo ""
print_success "portal.ramboeck.it ist jetzt per HTTPS erreichbar und zeigt das Kundenportal."
