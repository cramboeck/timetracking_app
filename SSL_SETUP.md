# 🔒 SSL/HTTPS Setup mit Let's Encrypt

## Für Domain: app.ramboeck.it

**WICHTIG:** Lies zuerst die `SSL_PRE_FLIGHT_CHECKLIST.md` und stelle sicher, dass ALLE Punkte erfüllt sind!

---

## ✅ Voraussetzungen

1. **Hetzner CAX21 Server** mit Ubuntu läuft
2. **Docker & Docker Compose** sind installiert
3. **Domain app.ramboeck.it** ist registriert
4. **SSH-Zugriff** zum Server
5. **ALLE Punkte in SSL_PRE_FLIGHT_CHECKLIST.md sind erfüllt** ⚠️

---

## 🔥 NEUER 2-PHASEN-ANSATZ (vermeidet Chicken-Egg-Problem!)

Dieses Setup besteht aus 2 Phasen:

**Phase 1:** Nginx mit HTTP-only starten → Zertifikat holen
**Phase 2:** Zu HTTPS-Konfiguration wechseln → Nginx neu starten

**Warum?** Nginx kann nicht mit SSL-Config starten, wenn die Zertifikate noch nicht existieren. Deshalb starten wir erst HTTP-only, holen die Zertifikate, und aktivieren dann SSL.

---

## Schritt 1: DNS-Konfiguration prüfen 🌐

**SIEHE SSL_PRE_FLIGHT_CHECKLIST.md Punkt 1**

```bash
# Prüfen ob DNS auf deinen Server zeigt:
dig app.ramboeck.it +short
```

✅ **Weiter nur wenn:** Die IP deines Hetzner-Servers zurückkommt!

⚠️ **Wenn nicht:** DNS muss beim Provider konfiguriert werden und 5-30 Min propagieren.

---

## Schritt 2: Server vorbereiten 🛠️

### SSH zum Server

```bash
ssh root@<DEINE_SERVER_IP>
```

### Projekt-Verzeichnis vorbereiten

```bash
# Projekt-Verzeichnis erstellen
cd /opt
git clone https://github.com/<DEIN_USER>/timetracking_app.git ramboflow
cd /opt/ramboflow

# Oder wenn bereits vorhanden:
cd /opt/ramboflow
git pull origin main
```

### Persistente Verzeichnisse erstellen

```bash
# Persistente Verzeichnisse für Docker Volumes
mkdir -p /var/lib/ramboflow/postgres
mkdir -p /var/lib/ramboflow/logs

# Berechtigungen setzen
chmod 755 /var/lib/ramboflow/postgres
chmod 755 /var/lib/ramboflow/logs
```

---

## Schritt 3: Environment-Variablen konfigurieren 🔧

### .env.production Datei erstellen

```bash
cd /opt/ramboflow
cp .env.production.example .env.production
nano .env.production
```

### Wichtige Werte anpassen:

```bash
# Domain
DOMAIN=app.ramboeck.it

# Frontend
FRONTEND_URL=https://app.ramboeck.it
FRONTEND_PORT=8080

# Backend
BACKEND_PORT=3001

# PostgreSQL Database
DB_NAME=ramboflow
DB_USER=ramboflow
DB_PASSWORD=HIER_EIN_SICHERES_PASSWORT_GENERIEREN

# JWT Secret (generiere mit: openssl rand -base64 32)
JWT_SECRET=HIER_DEIN_JWT_SECRET
JWT_EXPIRES_IN=604800

# CORS
CORS_ORIGINS=https://app.ramboeck.it

# Email (später konfigurieren)
EMAIL_TEST_MODE=true
EMAIL_TEST_RECIPIENT=deine@email.de

# Logging
LOG_LEVEL=info
```

**Sichere Passwörter generieren:**
```bash
# DB Password
openssl rand -base64 32

# JWT Secret
openssl rand -base64 32
```

---

## Schritt 4: Firewall konfigurieren 🔥

### Hetzner Cloud Firewall (in der Cloud Console)

Stelle sicher, dass folgende Ports offen sind:
- TCP Port 80 (HTTP)
- TCP Port 443 (HTTPS)
- TCP Port 22 (SSH)

### UFW Firewall (auf dem Server)

```bash
# UFW Status prüfen
ufw status verbose

# Ports öffnen (falls nötig)
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp

# UFW aktivieren (falls noch nicht aktiv)
ufw enable
```

---

## Schritt 5: PHASE 1 - HTTP-only Nginx starten 🚀

### Nginx auf HTTP-only Konfiguration umschalten (temporär!)

```bash
cd /opt/ramboflow

# Backup der SSL-Config erstellen
cp nginx/nginx.production.conf nginx/nginx.production.conf.backup

# HTTP-only Config aktivieren
cp nginx/nginx.production.http-only.conf nginx/nginx.production.conf
```

### Services starten

```bash
# Services im Hintergrund starten
docker compose -f docker-compose.production.yml up -d

# Logs ansehen
docker compose -f docker-compose.production.yml logs -f
```

**CTRL+C zum Beenden der Logs**

### Test: HTTP sollte funktionieren

```bash
# Vom Server
curl http://localhost

# Von außen (in deinem Browser)
http://app.ramboeck.it
```

✅ **Weiter wenn:** Die App über HTTP erreichbar ist

⚠️ **Wenn nicht erreichbar:**
- Firewall prüfen (siehe SSL_PRE_FLIGHT_CHECKLIST.md Punkt 2 & 3)
- Nginx Logs prüfen: `docker compose -f docker-compose.production.yml logs nginx`
- Services Status: `docker compose -f docker-compose.production.yml ps`

---

## Schritt 6: SSL-Zertifikat holen 🔐

### Let's Encrypt Zertifikat anfordern

```bash
cd /opt/ramboflow

# Certbot Container für Zertifikatsanforderung ausführen
docker compose -f docker-compose.production.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email deine@email.de \
  --agree-tos \
  --no-eff-email \
  -d app.ramboeck.it \
  -d www.app.ramboeck.it
```

**Wichtig:** Ersetze `deine@email.de` mit deiner echten E-Mail!

### Erwartete Ausgabe:

```
Saving debug log to /var/log/letsencrypt/letsencrypt.log
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/app.ramboeck.it/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/app.ramboeck.it/privkey.pem
```

✅ **Erfolg!** Dein Zertifikat ist erstellt.

### Zertifikat prüfen

```bash
# Prüfen ob Zertifikat existiert
docker exec ramboflow-nginx ls -la /etc/letsencrypt/live/app.ramboeck.it/
```

Sollte zeigen:
- `fullchain.pem`
- `privkey.pem`
- `chain.pem`
- `cert.pem`

⚠️ **Falls Fehler:**
```
Failed authorization procedure. app.ramboeck.it (http-01): ...
```

**Mögliche Ursachen:**
1. DNS zeigt nicht auf den Server → Nochmal prüfen mit `dig app.ramboeck.it`
2. Port 80 blockiert → Firewall prüfen
3. Nginx läuft nicht → `docker compose -f docker-compose.production.yml ps`

---

## Schritt 7: PHASE 2 - SSL-Konfiguration aktivieren 🔄

### Zurück zur vollständigen SSL-Konfiguration wechseln

```bash
cd /opt/ramboflow

# SSL-Config wiederherstellen
cp nginx/nginx.production.conf.backup nginx/nginx.production.conf
```

### Nginx neu starten um SSL-Zertifikat zu laden

```bash
# Nginx neu starten
docker compose -f docker-compose.production.yml restart nginx

# Logs prüfen (WICHTIG!)
docker compose -f docker-compose.production.yml logs nginx
```

### Prüfen ob alles läuft:

```bash
docker compose -f docker-compose.production.yml ps
```

Alle Services sollten "healthy" oder "running" sein.

⚠️ **Wenn Nginx nicht startet:**
```bash
# Detaillierte Logs ansehen
docker compose -f docker-compose.production.yml logs nginx | tail -50

# Häufigster Fehler: "certificate file not found"
# → Prüfen ob Zertifikat existiert:
docker exec ramboflow-nginx ls -la /etc/letsencrypt/live/app.ramboeck.it/
```

---

## Schritt 8: HTTPS testen 🎉

### In deinem Browser

```
https://app.ramboeck.it
```

**Das Schloss-Symbol sollte grün sein!** 🔒✅

### Erweiteter Test

```bash
# SSL-Verbindung testen
curl -I https://app.ramboeck.it

# Sollte zeigen:
# HTTP/2 200
# strict-transport-security: max-age=31536000; includeSubDomains; preload
```

### SSL-Rating testen (optional)

Besuche: https://www.ssllabs.com/ssltest/

Gib deine Domain ein: `app.ramboeck.it`

**Ziel:** A oder A+ Rating (sollte mit unserer Config erreicht werden)

---

## Schritt 9: Auto-Renewal aktivieren ✨

Der Certbot-Container ist bereits so konfiguriert, dass er alle 12 Stunden prüft ob Zertifikate erneuert werden müssen.

### Prüfen ob Auto-Renewal läuft:

```bash
# Certbot Container sollte laufen
docker ps | grep certbot

# Test dry-run (simuliert Erneuerung)
docker compose -f docker-compose.production.yml run --rm certbot renew --dry-run
```

Erwartete Ausgabe:
```
Congratulations, all simulated renewals succeeded
```

✅ **Zertifikate werden automatisch erneuert** (90 Tage Gültigkeit, Erneuerung nach 60 Tagen)

---

## 🎯 Fertig!

Deine App läuft jetzt sicher über HTTPS:
- ✅ HTTPS mit Let's Encrypt
- ✅ A+ SSL Rating
- ✅ Auto-Renewal alle 90 Tage
- ✅ HTTP → HTTPS Redirect
- ✅ Security Headers
- ✅ Rate Limiting

---

## 🔧 Troubleshooting

### Problem: Zertifikat-Anforderung schlägt fehl

**Ursache:** DNS noch nicht propagiert oder Port 80 blockiert

```bash
# DNS prüfen
dig app.ramboeck.it +short

# Firewall prüfen
ufw status verbose

# Certbot Logs ansehen
docker compose -f docker-compose.production.yml logs certbot

# Nginx Logs ansehen
docker compose -f docker-compose.production.yml logs nginx
```

### Problem: Nginx startet nicht nach SSL-Aktivierung

**Ursache:** Zertifikat-Pfade stimmen nicht

```bash
# Prüfen ob Zertifikate existieren
docker exec ramboflow-nginx ls -la /etc/letsencrypt/live/app.ramboeck.it/

# Nginx Logs ansehen
docker compose -f docker-compose.production.yml logs nginx

# Nginx Config testen
docker exec ramboflow-nginx nginx -t
```

### Problem: "Connection timed out"

**Ursache:** Firewall blockiert

```bash
# Hetzner Cloud Firewall prüfen (in Hetzner Console)
# Ports 80 und 443 müssen offen sein

# UFW Firewall prüfen
ufw status verbose

# Ports öffnen
ufw allow 80/tcp
ufw allow 443/tcp
```

### Problem: "mixed content" Warnung im Browser

**Ursache:** Frontend lädt noch HTTP-Ressourcen

```bash
# .env.production prüfen
cat /opt/ramboflow/.env.production | grep URL

# FRONTEND_URL muss https:// sein!
FRONTEND_URL=https://app.ramboeck.it
CORS_ORIGINS=https://app.ramboeck.it
```

Nach Änderung:
```bash
docker compose -f docker-compose.production.yml restart backend frontend
```

---

## 📚 Nützliche Befehle

```bash
# Alle Services neu starten
docker compose -f docker-compose.production.yml restart

# Logs ansehen
docker compose -f docker-compose.production.yml logs -f

# Einzelnen Service neu starten
docker compose -f docker-compose.production.yml restart nginx

# Services stoppen
docker compose -f docker-compose.production.yml down

# Services starten
docker compose -f docker-compose.production.yml up -d

# SSL-Zertifikat manuell erneuern
docker compose -f docker-compose.production.yml run --rm certbot renew

# Services Status prüfen
docker compose -f docker-compose.production.yml ps

# In Container einsteigen (für Debugging)
docker exec -it ramboflow-nginx sh
docker exec -it ramboflow-backend sh
```
