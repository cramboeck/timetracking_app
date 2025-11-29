# 🚀 Hetzner VPS Deployment Guide

Diese Anleitung zeigt dir, wie du die TimeTracking App auf einem Hetzner VPS deployest.

**⚠️ Hinweis:** Diese Anleitung ist für **SPÄTER**, wenn deine App fertig entwickelt ist!

## 📋 Voraussetzungen

- ✅ App ist lokal mit Docker fertig entwickelt
- ✅ Domain gekauft (z.B. deine-app.de)
- ✅ Hetzner Account erstellt

## 💰 Kosten

- **Hetzner CPX11:** €4.51/Monat (2 vCPU, 2 GB RAM, 40 GB SSD)
- **Domain:** ~€1/Monat (je nach Anbieter)
- **Total:** ~€5.51/Monat

## 🏗️ Schritt-für-Schritt Anleitung

### 1. Hetzner VPS erstellen

1. **Login:** https://console.hetzner.cloud/
2. **Neues Projekt** erstellen: "TimeTracking Production"
3. **Server hinzufügen:**
   - **Location:** Nürnberg oder Falkenstein (Deutschland)
   - **Image:** Ubuntu 24.04
   - **Type:** CPX11 (Shared vCPU, €4.51/Monat)
   - **Networking:** IPv4 & IPv6
   - **SSH Key:** Erstelle/füge deinen SSH Key hinzu
   - **Name:** timetracking-production

4. **Server erstellen** → Warte ~1 Minute

**Notiere dir:**
- Server IP-Adresse (z.B. `123.45.67.89`)

### 2. SSH-Verbindung testen

```bash
# Von deinem lokalen Computer
ssh root@123.45.67.89
```

### 3. Server absichern

```bash
# System aktualisieren
apt update && apt upgrade -y

# Firewall installieren und konfigurieren
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable

# Fail2ban installieren (schützt vor Brute-Force)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Automatische Security Updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

### 4. Docker installieren

```bash
# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker Compose installieren
apt install -y docker-compose-plugin

# Prüfen
docker --version
docker compose version
```

### 5. Git installieren & Projekt klonen

```bash
# Git installieren
apt install -y git

# Projekt klonen
cd /opt
git clone https://github.com/DEIN-USERNAME/timetracking_app.git
cd timetracking_app
```

### 6. Environment Variables konfigurieren

```bash
# Environment Datei erstellen
cp .env.docker.example .env.docker

# Bearbeiten mit sichere Werten!
nano .env.docker
```

**Wichtig - Setze sichere Werte:**

```bash
# Generiere sicheres Passwort
openssl rand -base64 32

# Generiere JWT Secret
openssl rand -base64 64
```

Trage die generierten Werte ein:

```env
# Database
DB_PASSWORD=<generiertes-passwort>

# Backend
JWT_SECRET=<generiertes-jwt-secret>
EMAIL_TEST_MODE=false  # Oder true, wenn noch keine echte Email-Config

# Environment
NODE_ENV=production
```

### 7. Docker Services starten

```bash
# Production-Modus starten
docker compose up -d

# Logs checken
docker compose logs -f

# Status checken
docker compose ps
```

**Services sollten laufen:**
- ✅ timetracking-db (healthy)
- ✅ timetracking-backend (healthy)
- ✅ timetracking-frontend (healthy)

### 8. Admin-User erstellen

```bash
# In Backend Container
docker exec -it timetracking-backend sh

# Admin Script
npm run admin:create

# Folge den Anweisungen, dann exit
exit
```

### 9. Nginx Reverse Proxy mit SSL

```bash
# Nginx installieren
apt install -y nginx certbot python3-certbot-nginx

# Nginx Config erstellen
nano /etc/nginx/sites-available/timetracking
```

**Nginx Config:**

```nginx
# HTTP - Redirect zu HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name deine-app.de www.deine-app.de;

    # Let's Encrypt Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect alles andere zu HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name deine-app.de www.deine-app.de;

    # SSL Zertifikate (werden von certbot automatisch hinzugefügt)
    # ssl_certificate /etc/letsencrypt/live/deine-app.de/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/deine-app.de/privkey.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend (von Docker Container)
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (von Docker Container)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Aktivieren:**

```bash
# Symlink erstellen
ln -s /etc/nginx/sites-available/timetracking /etc/nginx/sites-enabled/

# Default Config deaktivieren
rm /etc/nginx/sites-enabled/default

# Syntax testen
nginx -t

# Nginx neu laden
systemctl reload nginx
```

### 10. Domain DNS konfigurieren

**Bei deinem Domain-Anbieter:**

Erstelle **A Records**:

```
Typ   Name    Wert (IP-Adresse)      TTL
A     @       123.45.67.89          3600
A     www     123.45.67.89          3600
```

**Warte 5-15 Minuten** bis DNS propagiert ist.

### 11. SSL-Zertifikat installieren

```bash
# SSL Zertifikat von Let's Encrypt
certbot --nginx -d deine-app.de -d www.deine-app.de

# Folge den Anweisungen:
# - Email eingeben
# - Terms akzeptieren
# - Redirect zu HTTPS wählen (empfohlen)

# Auto-Renewal testen
certbot renew --dry-run
```

### 12. Environment Variable im Backend aktualisieren

```bash
cd /opt/timetracking_app

# .env.docker bearbeiten
nano .env.docker

# FRONTEND_URL auf deine Domain setzen
# In docker-compose.yml oder direkt in .env.docker:
FRONTEND_URL=https://deine-app.de
```

**Neu starten:**

```bash
docker compose down
docker compose up -d
```

### 13. Testen 🎉

1. **Öffne:** https://deine-app.de
2. **SSL Check:** Sollte grünes Schloss zeigen
3. **Registriere Test-User**
4. **Login**
5. **Funktionalität testen**

## 🔄 Updates deployen

```bash
# SSH auf Server
ssh root@123.45.67.89

# Zu Projekt
cd /opt/timetracking_app

# Neuesten Code pullen
git pull

# Services neu bauen und starten
docker compose down
docker compose up -d --build

# Logs checken
docker compose logs -f
```

## 📊 Monitoring & Wartung

### Logs anschauen

```bash
# Alle Services
docker compose logs -f

# Nur Backend
docker compose logs -f backend

# Nginx Logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Disk Space checken

```bash
# Disk Usage
df -h

# Docker aufräumen
docker system prune -a
```

### Datenbank Backup

```bash
# Backup erstellen
docker exec timetracking-db pg_dump -U timetracking timetracking > backup_$(date +%Y%m%d).sql

# Backup auf lokalen Computer laden
scp root@123.45.67.89:/root/backup_*.sql ./backups/

# Automatisches Backup (Cron Job)
crontab -e

# Füge hinzu (täglich um 3 Uhr):
0 3 * * * cd /opt/timetracking_app && docker exec timetracking-db pg_dump -U timetracking timetracking > /opt/backups/backup_$(date +\%Y\%m\%d).sql
```

### System Updates

```bash
# Monatlich:
apt update && apt upgrade -y
reboot  # Bei Kernel-Updates
```

## 🔒 Security Best Practices

1. **SSH Key Only:** Deaktiviere Password-Login
   ```bash
   nano /etc/ssh/sshd_config
   # PasswordAuthentication no
   systemctl restart sshd
   ```

2. **Regelmäßige Updates:** System & Docker Images
3. **Starke Passwörter:** Für DB & JWT
4. **Firewall aktiv:** Nur 22, 80, 443 offen
5. **Backups:** Täglich automatisch
6. **Monitoring:** Uptime-Monitoring einrichten (z.B. UptimeRobot - kostenlos)

## 💰 Kosten optimieren

- **Snapshots:** €0.011/GB/Monat (für Backups)
- **Volumes:** Bei Bedarf separates Volume für DB
- **Monitoring:** Hetzner Cloud Graphs (kostenlos)

## 🆘 Troubleshooting

### Services laufen nicht

```bash
docker compose ps
docker compose logs
```

### Nginx Fehler

```bash
nginx -t
systemctl status nginx
tail -f /var/log/nginx/error.log
```

### SSL erneuert nicht

```bash
certbot renew
systemctl status certbot.timer
```

### Kein Zugriff auf App

1. DNS propagiert? `nslookup deine-app.de`
2. Firewall? `ufw status`
3. Nginx läuft? `systemctl status nginx`
4. Docker Services? `docker compose ps`

---

**Bei Fragen während des Deployments: Frag mich einfach! 🚀**
