# 🔧 Frontend Startup Troubleshooting (Hetzner)

Schnelle Lösungen für häufige Frontend-Startup-Probleme auf Hetzner.

## 🚨 Schnelldiagnose

Führe das automatische Diagnose-Script aus:

```bash
./fix-hetzner-startup.sh
```

Das Script überprüft und behebt automatisch die häufigsten Probleme.

## 📋 Häufige Probleme und Lösungen

### Problem 1: Domain-Platzhalter nicht ersetzt

**Symptom:** Nginx startet nicht, Error: "SSL certificate not found"

**Ursache:** Die Platzhalter `<<<DEINE_DOMAIN>>>` in `nginx/nginx.production.conf` wurden nicht ersetzt.

**Lösung:**

```bash
# Manuelle Lösung:
# 1. Ersetze die Domain-Platzhalter
DOMAIN="deine-domain.de"
sed -i "s/<<<DEINE_DOMAIN>>>/$DOMAIN/g" nginx/nginx.production.conf

# 2. Oder verwende das Setup-Script
./setup-production.sh
```

### Problem 2: SSL-Zertifikate fehlen

**Symptom:** Nginx kann nicht starten, Error beim Laden der SSL-Zertifikate

**Ursache:** Let's Encrypt Zertifikate wurden nicht erstellt.

**Lösung:**

```bash
# Option A: Vollständiges Setup ausführen
./setup-production.sh

# Option B: Nur SSL-Zertifikate erstellen
# 1. Temporären Nginx für Certbot starten
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

# 2. Zertifikat erstellen
docker run --rm \
  -v certbot_data:/var/www/certbot \
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot:arm64v8-latest \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email deine-email@domain.de \
  --agree-tos \
  --no-eff-email \
  -d deine-domain.de \
  -d www.deine-domain.de

# 3. Temporären Nginx stoppen
docker stop ramboflow-nginx-temp
docker rm ramboflow-nginx-temp

# 4. Production Services starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

### Problem 3: Verzeichnisse für Volumes fehlen

**Symptom:** Database oder Backend können nicht starten, Permission Errors

**Ursache:** Die Verzeichnisse `/var/lib/ramboflow/*` existieren nicht.

**Lösung:**

```bash
# Verzeichnisse erstellen
sudo mkdir -p /var/lib/ramboflow/{postgres,logs,backups}
sudo chown -R $(whoami):$(whoami) /var/lib/ramboflow

# Services neu starten
docker compose --env-file .env.production -f docker-compose.production.yml restart
```

### Problem 4: Frontend Container startet nicht

**Symptom:** Frontend Container ist "unhealthy" oder crasht beim Start

**Ursache:** Build-Fehler oder Nginx-Konfiguration im Container

**Lösung:**

```bash
# 1. Logs ansehen
docker logs ramboflow-frontend

# 2. Neu bauen ohne Cache
docker compose -f docker-compose.production.yml down
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache frontend
docker compose --env-file .env.production -f docker-compose.production.yml up -d

# 3. In Container einsteigen für Debugging
docker exec -it ramboflow-frontend sh
# Im Container:
ls -la /usr/share/nginx/html  # Check ob Build-Dateien vorhanden
nginx -t                       # Check Nginx-Konfiguration
```

### Problem 5: Port 80/443 nicht erreichbar

**Symptom:** "Connection refused" beim Zugriff auf die Domain

**Ursache:** Firewall blockiert Ports

**Lösung:**

```bash
# UFW Firewall konfigurieren
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Firewall-Status prüfen
sudo ufw status

# Ports prüfen
sudo netstat -tlnp | grep -E ':(80|443)'
```

### Problem 6: DNS-Problem - Domain zeigt nicht auf Server

**Symptom:** SSL-Zertifikat kann nicht erstellt werden, "Domain not found"

**Ursache:** DNS-Einträge sind falsch oder nicht propagiert

**Lösung:**

```bash
# DNS-Auflösung testen
nslookup deine-domain.de
ping deine-domain.de

# Sollte deine Server-IP zeigen!

# Bei deinem Domain-Provider (z.B. Namecheap, Cloudflare):
# A-Record erstellen:
#   Type: A
#   Name: @
#   Value: <deine-server-ip>
#   TTL: 3600
#
# Optional: CNAME für www
#   Type: CNAME
#   Name: www
#   Value: @
#   TTL: 3600

# Warte 5-10 Minuten und teste erneut
```

### Problem 7: Backend ist nicht erreichbar

**Symptom:** Frontend lädt, aber API-Calls schlagen fehl (404/502)

**Ursache:** Backend Container läuft nicht oder Nginx Proxy ist falsch konfiguriert

**Lösung:**

```bash
# 1. Backend-Status prüfen
docker ps --filter "name=ramboflow-backend"

# 2. Backend-Logs ansehen
docker logs ramboflow-backend

# 3. Backend Health-Check
docker exec ramboflow-backend wget -q -O- http://localhost:3001/health

# 4. Nginx-Logs prüfen
docker logs ramboflow-nginx | grep -i error

# 5. Backend neu starten
docker compose -f docker-compose.production.yml restart backend
```

### Problem 8: Database Connection Failed

**Symptom:** Backend startet nicht, "ECONNREFUSED" oder "Database connection failed"

**Ursache:** PostgreSQL läuft nicht oder Passwort ist falsch

**Lösung:**

```bash
# 1. Database-Status prüfen
docker ps --filter "name=ramboflow-db"

# 2. Database-Logs ansehen
docker logs ramboflow-db

# 3. Database Health Check
docker exec ramboflow-db pg_isready -U timetracking

# 4. In Database einsteigen
docker exec -it ramboflow-db psql -U timetracking

# 5. Passwort in .env.production prüfen
grep DB_PASSWORD .env.production

# 6. Services komplett neu starten
docker compose -f docker-compose.production.yml down
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

## 🛠️ Debugging-Befehle

### Logs ansehen

```bash
# Alle Logs live
docker compose -f docker-compose.production.yml logs -f

# Nur Frontend
docker logs -f ramboflow-frontend

# Nur Backend
docker logs -f ramboflow-backend

# Nur Database
docker logs -f ramboflow-db

# Nur Nginx
docker logs -f ramboflow-nginx

# Letzte 100 Zeilen
docker logs --tail 100 ramboflow-frontend
```

### Container-Status

```bash
# Alle RamboFlow Container
docker ps -a --filter "name=ramboflow"

# Formatiert mit Health-Status
docker ps --filter "name=ramboflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Nur laufende Container
docker ps --filter "name=ramboflow" --filter "status=running"
```

### Services neu starten

```bash
# Alle Services
docker compose -f docker-compose.production.yml restart

# Einzelner Service
docker compose -f docker-compose.production.yml restart frontend

# Komplett neu starten (ohne Rebuild)
docker compose -f docker-compose.production.yml down
docker compose --env-file .env.production -f docker-compose.production.yml up -d

# Komplett neu bauen und starten
docker compose -f docker-compose.production.yml down
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

### In Container einsteigen

```bash
# Frontend (Alpine Linux)
docker exec -it ramboflow-frontend sh

# Backend (Node)
docker exec -it ramboflow-backend sh

# Database (PostgreSQL)
docker exec -it ramboflow-db psql -U timetracking

# Nginx
docker exec -it ramboflow-nginx sh
```

### Network-Debugging

```bash
# Überprüfe ob Container sich erreichen können
docker exec ramboflow-nginx ping -c 3 frontend
docker exec ramboflow-nginx ping -c 3 backend
docker exec ramboflow-backend ping -c 3 database

# Überprüfe Ports
docker exec ramboflow-nginx wget -q -O- http://frontend:8080/
docker exec ramboflow-nginx wget -q -O- http://backend:3001/health
```

## 🔄 Kompletter Reset (Nuclear Option)

**⚠️ ACHTUNG: Dies löscht alle Container und Volumes (inkl. Datenbank)!**

```bash
# Alle Container und anonyme Volumes löschen
docker compose -f docker-compose.production.yml down -v

# Alle ramboflow Images löschen
docker images | grep ramboflow | awk '{print $3}' | xargs docker rmi -f

# Neu starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

**Datenbank behalten:**

```bash
# Ohne -v flag (behält named volumes)
docker compose -f docker-compose.production.yml down

# Neu starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

## 📊 Health Checks

```bash
# Frontend Health
curl -I https://deine-domain.de
curl http://localhost:80

# Backend Health
curl https://deine-domain.de/health
docker exec ramboflow-backend wget -q -O- http://localhost:3001/health

# API Test
curl https://deine-domain.de/api/health

# SSL Test
openssl s_client -connect deine-domain.de:443 -servername deine-domain.de

# SSL Rating (online)
# https://www.ssllabs.com/ssltest/analyze.html?d=deine-domain.de
```

## 🆘 Wenn nichts funktioniert

1. **Vollständiges Setup neu ausführen:**
   ```bash
   # Sicherstelle dass Domain-DNS korrekt ist
   nslookup deine-domain.de

   # Setup ausführen
   ./setup-production.sh
   ```

2. **Prüfe die Systemressourcen:**
   ```bash
   # Disk Space
   df -h

   # Memory
   free -h

   # Docker Stats
   docker stats --no-stream
   ```

3. **Prüfe Docker-Installation:**
   ```bash
   docker --version
   docker compose version
   sudo systemctl status docker
   ```

4. **Firewall-Logs prüfen:**
   ```bash
   sudo tail -f /var/log/ufw.log
   ```

5. **System-Logs prüfen:**
   ```bash
   sudo journalctl -u docker -f
   ```

## 📚 Weitere Ressourcen

- **Setup-Guide:** `DEPLOYMENT_HETZNER.md`
- **Docker-Dokumentation:** `README_DOCKER.md`
- **Production-Setup:** `./setup-production.sh`
- **GitHub Issues:** https://github.com/cramboeck/timetracking_app/issues

## 🎯 Häufigste Lösung (80% der Fälle)

```bash
# 1. Fix nginx config
./fix-hetzner-startup.sh

# 2. Services neu starten
docker compose -f docker-compose.production.yml down
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# 3. Logs prüfen
docker compose -f docker-compose.production.yml logs -f
```

Viel Erfolg! 🚀
