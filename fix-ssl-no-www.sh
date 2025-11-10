#!/bin/bash

# =============================================================================
# SSL-Zertifikat Setup ohne www
# =============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== SSL Setup für app.ramboeck.it (ohne www) ===${NC}\n"

# 1. Cleanup - alle temporären Container stoppen
echo -e "${BLUE}[1/7]${NC} Stoppe temporäre Container..."
docker stop ramboflow-nginx-temp 2>/dev/null || true
docker rm ramboflow-nginx-temp 2>/dev/null || true
echo -e "${GREEN}✓${NC} Cleanup abgeschlossen\n"

# 2. Temporäre Nginx-Config erstellen (nur app.ramboeck.it, kein www)
echo -e "${BLUE}[2/7]${NC} Erstelle temporäre Nginx-Config..."
cat > nginx/nginx.temp.conf <<'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name app.ramboeck.it;

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
echo -e "${GREEN}✓${NC} Temporäre Config erstellt\n"

# 3. Temporären Nginx starten
echo -e "${BLUE}[3/7]${NC} Starte temporären Nginx..."
docker run -d \
  --name ramboflow-nginx-temp \
  -p 80:80 \
  -v $(pwd)/nginx/nginx.temp.conf:/etc/nginx/nginx.conf:ro \
  -v certbot_data:/var/www/certbot \
  nginx:alpine

echo -e "${GREEN}✓${NC} Temporärer Nginx läuft\n"

# 4. Warte kurz
echo -e "${BLUE}[4/7]${NC} Warte 5 Sekunden..."
sleep 5
echo -e "${GREEN}✓${NC} Bereit\n"

# 5. SSL-Zertifikat anfordern (nur app.ramboeck.it)
echo -e "${BLUE}[5/7]${NC} Fordere SSL-Zertifikat an..."
echo -e "${BLUE}Domain:${NC} app.ramboeck.it"
echo -e "${BLUE}Email:${NC} $(grep CERTBOT_EMAIL .env.production | cut -d= -f2)\n"

docker run --rm \
  -v certbot_data:/var/www/certbot \
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot:arm64v8-latest \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $(grep CERTBOT_EMAIL .env.production | cut -d= -f2) \
  --agree-tos \
  --no-eff-email \
  -d app.ramboeck.it

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✓${NC} SSL-Zertifikat erfolgreich erstellt!\n"
else
    echo -e "\n${RED}✗${NC} Fehler beim Erstellen des Zertifikats"
    echo -e "${RED}Prüfe:${NC}"
    echo "  1. DNS: nslookup app.ramboeck.it"
    echo "  2. Port 80 erreichbar: curl http://app.ramboeck.it"
    exit 1
fi

# 6. Temporären Nginx stoppen
echo -e "${BLUE}[6/7]${NC} Stoppe temporären Nginx..."
docker stop ramboflow-nginx-temp
docker rm ramboflow-nginx-temp
echo -e "${GREEN}✓${NC} Temporärer Nginx gestoppt\n"

# 7. Production Nginx-Config anpassen (www entfernen)
echo -e "${BLUE}[7/7]${NC} Passe Production Nginx-Config an..."

# Backup der Original-Config
cp nginx/nginx.production.conf nginx/nginx.production.conf.backup

# Ersetze alle Vorkommen von "www.app.ramboeck.it" und behalte nur "app.ramboeck.it"
sed -i 's/server_name app\.ramboeck\.it www\.app\.ramboeck\.it;/server_name app.ramboeck.it;/g' nginx/nginx.production.conf
sed -i 's/ssl_certificate \/etc\/letsencrypt\/live\/app\.ramboeck\.it\/fullchain\.pem;/ssl_certificate \/etc\/letsencrypt\/live\/app.ramboeck.it\/fullchain.pem;/g' nginx/nginx.production.conf
sed -i 's/ssl_certificate_key \/etc\/letsencrypt\/live\/app\.ramboeck\.it\/privkey\.pem;/ssl_certificate_key \/etc\/letsencrypt\/live\/app.ramboeck.it\/privkey.pem;/g' nginx/nginx.production.conf
sed -i 's/ssl_trusted_certificate \/etc\/letsencrypt\/live\/app\.ramboeck\.it\/chain\.pem;/ssl_trusted_certificate \/etc\/letsencrypt\/live\/app.ramboeck.it\/chain.pem;/g' nginx/nginx.production.conf

echo -e "${GREEN}✓${NC} Nginx-Config angepasst\n"

# 8. Services starten
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Starte Production Services${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${BLUE}Baue Docker Images...${NC}"
docker compose --env-file .env.production -f docker-compose.production.yml build

echo -e "\n${BLUE}Starte Services...${NC}"
docker compose --env-file .env.production -f docker-compose.production.yml up -d

echo -e "\n${GREEN}✓ Services gestartet!${NC}\n"

# 9. Warte auf Services
echo -e "${BLUE}Warte auf Services (30 Sekunden)...${NC}"
sleep 30

# 10. Status prüfen
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Service-Status${NC}"
echo -e "${BLUE}========================================${NC}\n"

docker compose -f docker-compose.production.yml ps

# 11. Health-Checks
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Health-Checks${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${BLUE}Testing https://app.ramboeck.it/health...${NC}"
if curl -f -s https://app.ramboeck.it/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend Health: OK${NC}"
else
    echo -e "${RED}✗ Backend Health: Nicht erreichbar${NC}"
    echo -e "  Prüfe Logs: docker compose -f docker-compose.production.yml logs backend"
fi

echo -e "\n${BLUE}Testing https://app.ramboeck.it...${NC}"
if curl -f -s https://app.ramboeck.it > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend: OK${NC}"
else
    echo -e "${RED}✗ Frontend: Nicht erreichbar${NC}"
    echo -e "  Prüfe Logs: docker compose -f docker-compose.production.yml logs nginx"
fi

# 12. Fertig!
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}    ✓ Deployment abgeschlossen!${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${GREEN}Deine App läuft jetzt auf:${NC}"
echo -e "  ${BLUE}https://app.ramboeck.it${NC}\n"

echo -e "${BLUE}Nützliche Befehle:${NC}"
echo -e "  Logs ansehen:"
echo -e "    ${BLUE}docker compose -f docker-compose.production.yml logs -f${NC}"
echo
echo -e "  Services neu starten:"
echo -e "    ${BLUE}docker compose -f docker-compose.production.yml restart${NC}"
echo
echo -e "  Services stoppen:"
echo -e "    ${BLUE}docker compose -f docker-compose.production.yml down${NC}"
echo

echo -e "${GREEN}Viel Erfolg! 🚀${NC}\n"
