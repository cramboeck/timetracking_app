# 🚀 Deployment auf Hetzner CAX21 (ARM)

Diese Anleitung zeigt dir Schritt für Schritt, wie du RamboFlow auf einem Hetzner CAX21 Cloud-Server (ARM64) mit Docker und SSL deployest.

## 📋 Voraussetzungen

- **Hetzner CAX21** Server (4 GB RAM, 2 vCPUs ARM64, 40 GB SSD) - €4.51/Monat
- **Domain** (z.B. von Namecheap, CloudFlare, etc.)
- **SSH-Zugang** zum Server

## 🏗️ Server-Architektur

```
Internet
   │
   ▼
Nginx Reverse Proxy (Port 80/443)
   │
   ├─► Frontend Container (Port 8080)
   │
   ├─► Backend Container (Port 3001)
   │
   └─► PostgreSQL Container (Port 5432, nur intern)
```

## 1️⃣ Server erstellen & einrichten

### 1.1 Hetzner Server erstellen

1. Gehe zu https://console.hetzner.cloud/
2. Projekt erstellen oder vorhandenes auswählen
3. **Add Server** klicken
4. **Servertyp:** CAX21 (ARM64)
5. **Image:** Ubuntu 24.04 LTS
6. **Datacenter:** Falkenstein (Deutschland) oder Nürnberg
7. **SSH-Key** hinzufügen oder erstellen
8. **Firewall** später konfigurieren (weiter unten)
9. Server erstellen

### 1.2 SSH-Verbindung testen

```bash
# Mit deinem Server verbinden (IP-Adresse aus Hetzner Console)
ssh root@<deine-server-ip>
```

### 1.3 System aktualisieren

```bash
# System aktualisieren
apt update && apt upgrade -y

# Hilfreiche Tools installieren
apt install -y curl git wget htop nano ufw

# Reboot (optional, empfohlen)
reboot
```

## 2️⃣ Docker installieren (ARM64-kompatibel)

```bash
# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker ohne sudo verwenden (optional)
usermod -aG docker $USER

# Docker Compose installieren (aktuellste Version)
apt install -y docker-compose-plugin

# Installation prüfen
docker --version
docker compose version
```

## 3️⃣ Firewall konfigurieren

```bash
# UFW Firewall aktivieren
ufw allow OpenSSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# Status prüfen
ufw status
```

## 4️⃣ Domain konfigurieren

### 4.1 DNS-Einträge bei deinem Domain-Provider erstellen

```
Type: A
Name: @ (oder deine Subdomain)
Value: <deine-server-ip>
TTL: 3600
```

Optional für www:
```
Type: CNAME
Name: www
Value: @
TTL: 3600
```

### 4.2 DNS-Propagierung testen

```bash
# Warte 5-10 Minuten, dann teste:
nslookup deine-domain.de
ping deine-domain.de
```

## 5️⃣ Application deployen

### 5.1 Repository klonen

```bash
# In das Home-Verzeichnis wechseln
cd ~

# Repository klonen
git clone https://github.com/cramboeck/timetracking_app.git
cd timetracking_app

# Zum production branch wechseln (falls vorhanden)
git checkout main  # oder dein production branch
```

### 5.2 Environment-Variablen konfigurieren

```bash
# Production .env erstellen
cp .env.docker.example .env.production
nano .env.production
```

**Wichtig:** Sichere, starke Passwörter verwenden!

```env
# Datenbank
DB_PASSWORD=<generiere-ein-sicheres-passwort>

# JWT Secret (mindestens 32 Zeichen)
JWT_SECRET=<generiere-einen-langen-zufälligen-string>

# Email (für Passwort-Reset, etc.)
EMAIL_TEST_MODE=false
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=dein-email@gmail.com
EMAIL_PASSWORD=<app-passwort>
EMAIL_FROM=noreply@deine-domain.de

# URLs
FRONTEND_URL=https://deine-domain.de
BACKEND_URL=https://deine-domain.de/api
```

**Passwort generieren:**
```bash
# Sicheres Passwort generieren
openssl rand -base64 32
```

### 5.3 Production Docker Compose erstellen

Erstelle `docker-compose.production.yml`:

```bash
nano docker-compose.production.yml
```

Inhalt:

```yaml
version: '3.9'

services:
  # PostgreSQL Database
  database:
    image: postgres:16-alpine
    container_name: ramboflow-db
    restart: always
    environment:
      POSTGRES_DB: timetracking
      POSTGRES_USER: timetracking
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U timetracking"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ramboflow-network

  # Backend API
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: ramboflow-backend
    restart: always
    depends_on:
      database:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://timetracking:${DB_PASSWORD}@database:5432/timetracking
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
      EMAIL_TEST_MODE: ${EMAIL_TEST_MODE:-true}
      EMAIL_HOST: ${EMAIL_HOST}
      EMAIL_PORT: ${EMAIL_PORT}
      EMAIL_USER: ${EMAIL_USER}
      EMAIL_PASSWORD: ${EMAIL_PASSWORD}
      EMAIL_FROM: ${EMAIL_FROM}
    volumes:
      - backend_logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - ramboflow-network

  # Frontend
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_API_URL: /api
    container_name: ramboflow-frontend
    restart: always
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - ramboflow-network

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: ramboflow-nginx
    restart: always
    depends_on:
      - frontend
      - backend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - certbot_data:/var/www/certbot:ro
      - letsencrypt:/etc/letsencrypt:ro
    networks:
      - ramboflow-network

  # Certbot für SSL-Zertifikate
  certbot:
    image: certbot/certbot:arm64v8-latest
    container_name: ramboflow-certbot
    volumes:
      - certbot_data:/var/www/certbot
      - letsencrypt:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  postgres_data:
    driver: local
  backend_logs:
    driver: local
  certbot_data:
    driver: local
  letsencrypt:
    driver: local

networks:
  ramboflow-network:
    driver: bridge
```

### 5.4 Nginx-Konfiguration erstellen

```bash
# Nginx-Ordner erstellen
mkdir -p nginx

# Nginx-Konfiguration erstellen
nano nginx/nginx.conf
```

Inhalt:

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # Upstream servers
    upstream frontend {
        server frontend:8080;
    }

    upstream backend {
        server backend:3001;
    }

    # HTTP -> HTTPS Redirect
    server {
        listen 80;
        server_name _;

        # Certbot challenge
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL-Zertifikate (werden von Certbot erstellt)
        ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;

        # SSL-Konfiguration (A+ Rating)
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security Headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # API Proxy
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            proxy_pass http://backend/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 90;
        }

        # Backend Health Check
        location /health {
            proxy_pass http://backend/health;
            access_log off;
        }

        # Frontend (React App)
        location / {
            proxy_pass http://frontend/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

**WICHTIG:** Ersetze `DOMAIN` in der Nginx-Config durch deine echte Domain!

```bash
# Domain in nginx.conf ersetzen
sed -i 's/DOMAIN/deine-domain.de/g' nginx/nginx.conf
```

## 6️⃣ SSL-Zertifikate einrichten

### 6.1 Temporäre Nginx-Config für Certbot

Erstelle zuerst eine temporäre Config ohne SSL:

```bash
nano nginx/nginx-temp.conf
```

```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
```

### 6.2 Nginx mit temporärer Config starten

```bash
# Erstelle docker-compose.temp.yml nur für Nginx
cat > docker-compose.temp.yml <<EOF
version: '3.9'
services:
  nginx:
    image: nginx:alpine
    container_name: ramboflow-nginx-temp
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx-temp.conf:/etc/nginx/nginx.conf:ro
      - certbot_data:/var/www/certbot

  certbot:
    image: certbot/certbot:arm64v8-latest
    volumes:
      - certbot_data:/var/www/certbot
      - letsencrypt:/etc/letsencrypt

volumes:
  certbot_data:
  letsencrypt:
EOF

# Nginx temporär starten
docker compose -f docker-compose.temp.yml up -d nginx
```

### 6.3 SSL-Zertifikat erstellen

```bash
# Zertifikat mit Certbot erstellen
docker compose -f docker-compose.temp.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email deine-email@domain.de \
  --agree-tos \
  --no-eff-email \
  -d deine-domain.de \
  -d www.deine-domain.de

# Temporären Nginx stoppen
docker compose -f docker-compose.temp.yml down
```

## 7️⃣ Application starten

```bash
# Alle Container mit production config starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Logs verfolgen
docker compose -f docker-compose.production.yml logs -f

# Status prüfen
docker compose -f docker-compose.production.yml ps
```

## 8️⃣ Verifizierung

### 8.1 Services testen

```bash
# Frontend (über Nginx)
curl -I https://deine-domain.de

# Backend Health
curl https://deine-domain.de/health

# API Test
curl https://deine-domain.de/api/health
```

### 8.2 Im Browser testen

1. Öffne https://deine-domain.de
2. Registriere einen Account
3. Teste die Funktionen

### 8.3 SSL-Zertifikat prüfen

Teste dein SSL-Rating:
- https://www.ssllabs.com/ssltest/analyze.html?d=deine-domain.de

## 9️⃣ Wartung & Monitoring

### Logs ansehen

```bash
# Alle Logs
docker compose -f docker-compose.production.yml logs -f

# Nur Backend
docker compose -f docker-compose.production.yml logs -f backend

# Nur Nginx
docker compose -f docker-compose.production.yml logs -f nginx
```

### Container neu starten

```bash
# Einzelner Service
docker compose -f docker-compose.production.yml restart backend

# Alle Services
docker compose -f docker-compose.production.yml restart
```

### Updates deployen

```bash
# Code aktualisieren
git pull

# Neu bauen und starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Alte Images aufräumen
docker image prune -f
```

### Datenbank-Backup

```bash
# Backup erstellen
docker exec ramboflow-db pg_dump -U timetracking timetracking > backup_$(date +%Y%m%d).sql

# Backup wiederherstellen
cat backup_YYYYMMDD.sql | docker exec -i ramboflow-db psql -U timetracking timetracking
```

### Automatisches Backup-Script

```bash
nano /root/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/backups"
mkdir -p $BACKUP_DIR

# DB Backup
docker exec ramboflow-db pg_dump -U timetracking timetracking | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Alte Backups löschen (älter als 30 Tage)
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db_backup_$DATE.sql.gz"
```

```bash
chmod +x /root/backup.sh

# Cronjob erstellen (täglich um 2:00 Uhr)
crontab -e
# Füge hinzu:
0 2 * * * /root/backup.sh >> /var/log/backup.log 2>&1
```

### System-Monitoring

```bash
# Docker Stats
docker stats

# Disk Usage
df -h

# Memory Usage
free -h

# Container Health
docker compose -f docker-compose.production.yml ps
```

## 🔒 Sicherheit

### Fail2Ban installieren (optional, empfohlen)

```bash
apt install -y fail2ban

# Fail2Ban konfigurieren
nano /etc/fail2ban/jail.local
```

```ini
[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
```

```bash
systemctl enable fail2ban
systemctl start fail2ban
```

### Auto-Updates aktivieren (Ubuntu)

```bash
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

## 📊 Kosten-Übersicht

- **Hetzner CAX21:** €4.51/Monat
- **Domain:** €10-15/Jahr
- **SSL-Zertifikat:** Kostenlos (Let's Encrypt)

**Gesamt:** ~€5-6/Monat

## 🆘 Troubleshooting

### Port 80/443 nicht erreichbar

```bash
# Firewall prüfen
ufw status

# Nginx Logs checken
docker compose -f docker-compose.production.yml logs nginx
```

### SSL-Zertifikat-Fehler

```bash
# Zertifikat erneuern
docker compose -f docker-compose.production.yml run --rm certbot renew

# Nginx neu starten
docker compose -f docker-compose.production.yml restart nginx
```

### Datenbank-Verbindung schlägt fehl

```bash
# DB Health Check
docker exec ramboflow-db pg_isready -U timetracking

# DB Logs
docker compose -f docker-compose.production.yml logs database
```

### Application neu deployen

```bash
# Alles stoppen
docker compose -f docker-compose.production.yml down

# Volumes behalten, nur Container löschen
docker compose -f docker-compose.production.yml up -d --build
```

## ✅ Checkliste

- [ ] Hetzner CAX21 Server erstellt
- [ ] Docker & Docker Compose installiert
- [ ] Firewall konfiguriert (Ports 22, 80, 443)
- [ ] Domain DNS konfiguriert
- [ ] Repository geklont
- [ ] `.env.production` mit sicheren Passwörtern erstellt
- [ ] SSL-Zertifikat erstellt
- [ ] Application mit `docker-compose.production.yml` gestartet
- [ ] HTTPS funktioniert (Test im Browser)
- [ ] Backup-Script eingerichtet
- [ ] Monitoring eingerichtet

---

**Viel Erfolg mit deinem Deployment! 🚀**

Bei Fragen: https://github.com/cramboeck/timetracking_app/issues
