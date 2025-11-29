# 🚀 Quickstart - RamboFlow auf Hetzner CAX21 deployen

Diese Anleitung bringt dich in **30 Minuten** von Null zu einer laufenden Production-Installation.

## ⚡ Schnellstart (3 Befehle)

```bash
# 1. Repository klonen
git clone https://github.com/cramboeck/timetracking_app.git
cd timetracking_app

# 2. Setup-Script ausführen (beantwortet ein paar Fragen)
./setup-production.sh

# 3. Fertig! Deine App läuft jetzt auf deiner Domain
```

Das war's! 🎉

---

## 📋 Voraussetzungen

**Was du brauchst:**

1. ✅ **Hetzner CAX21 Server** (€4.51/Monat)
   - Ubuntu 24.04 LTS
   - SSH-Zugriff
   - Docker installiert

2. ✅ **Domain**
   - DNS A-Record zeigt auf Server-IP
   - Warte 5-10 Minuten nach DNS-Änderung

3. ✅ **E-Mail-Adresse**
   - Für Let's Encrypt SSL-Zertifikate

---

## 🔧 Detaillierte Anleitung

### Schritt 1: Server vorbereiten

```bash
# Mit Server verbinden
ssh root@<deine-server-ip>

# System aktualisieren
apt update && apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh

# Firewall konfigurieren
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Schritt 2: DNS konfigurieren

Bei deinem Domain-Provider (z.B. Namecheap, Cloudflare):

```
Type: A
Name: @ (oder deine Subdomain)
Value: <deine-server-ip>
TTL: 3600
```

**Wichtig:** Warte 5-10 Minuten und teste:

```bash
nslookup deine-domain.de
ping deine-domain.de
```

### Schritt 3: Repository klonen

```bash
cd ~
git clone https://github.com/cramboeck/timetracking_app.git
cd timetracking_app
```

### Schritt 4: Setup-Script ausführen

```bash
./setup-production.sh
```

Das Script fragt dich:

1. **Domain** - z.B. `meine-zeiterfassung.de`
2. **E-Mail** - für SSL-Benachrichtigungen
3. **E-Mail-Versand** - Test-Modus oder echte E-Mails?
4. **SMTP-Daten** - falls echte E-Mails (optional)
5. **Backup-Aufbewahrung** - Standard: 30 Tage
6. **SSL Staging-Modus** - Test oder Production?

Das Script macht dann automatisch:
- ✅ Generiert sichere Passwörter
- ✅ Erstellt `.env.production` Datei
- ✅ Passt Nginx-Konfiguration an
- ✅ Erstellt SSL-Zertifikate
- ✅ Startet alle Docker-Container
- ✅ Verifiziert das Deployment

### Schritt 5: Testen

```bash
# Im Browser öffnen
https://deine-domain.de

# Oder mit curl
curl https://deine-domain.de/health
```

---

## 📁 Welche Dateien brauchst du?

Du musst **NICHTS manuell bearbeiten**! Das Setup-Script macht alles.

Aber zur Info, diese Dateien werden erstellt/verwendet:

| Datei | Beschreibung | Manuell bearbeiten? |
|-------|--------------|---------------------|
| `.env.production` | Deine Secrets & Konfiguration | ❌ Nein (wird generiert) |
| `docker-compose.production.yml` | Docker-Services | ❌ Nein (fertig konfiguriert) |
| `nginx/nginx.production.conf` | Nginx-Config | ❌ Nein (Domain wird ersetzt) |
| `setup-production.sh` | Setup-Automation | ❌ Nein (nur ausführen) |

---

## 🆘 Was tun bei Problemen?

### Problem: "Domain nicht erreichbar"

```bash
# DNS-Propagierung testen
nslookup deine-domain.de
ping deine-domain.de

# Firewall prüfen
ufw status

# Nginx-Logs checken
docker logs ramboflow-nginx
```

### Problem: "SSL-Zertifikat-Fehler"

**Ursache:** Domain zeigt noch nicht auf Server

**Lösung:**
1. DNS nochmal prüfen (siehe oben)
2. 10 Minuten warten
3. Setup-Script nochmal ausführen

### Problem: "Backend nicht erreichbar"

```bash
# Service-Status prüfen
docker compose -f docker-compose.production.yml ps

# Backend-Logs ansehen
docker compose -f docker-compose.production.yml logs backend

# Services neu starten
docker compose -f docker-compose.production.yml restart
```

### Problem: "Datenbank-Verbindungsfehler"

```bash
# Datenbank-Health prüfen
docker exec ramboflow-db pg_isready -U timetracking

# Datenbank-Logs
docker compose -f docker-compose.production.yml logs database

# 30 Sekunden warten (DB braucht Zeit zum Starten)
sleep 30
docker compose -f docker-compose.production.yml restart backend
```

---

## 🔄 Updates deployen

```bash
# Code aktualisieren
cd ~/timetracking_app
git pull

# Neu bauen und starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Alte Images aufräumen
docker image prune -f
```

---

## 💾 Backup erstellen

```bash
# Manuelles Backup
docker exec ramboflow-db pg_dump -U timetracking timetracking | gzip > backup_$(date +%Y%m%d).sql.gz

# Backup wiederherstellen
gunzip < backup_20240315.sql.gz | docker exec -i ramboflow-db psql -U timetracking timetracking
```

---

## 📊 Nützliche Befehle

```bash
# Logs live verfolgen
docker compose -f docker-compose.production.yml logs -f

# Nur Backend-Logs
docker compose -f docker-compose.production.yml logs -f backend

# Service-Status
docker compose -f docker-compose.production.yml ps

# Ressourcen-Nutzung
docker stats

# Einzelnen Service neu starten
docker compose -f docker-compose.production.yml restart backend

# Alle Services neu starten
docker compose -f docker-compose.production.yml restart

# Services stoppen
docker compose -f docker-compose.production.yml down

# Services stoppen + Volumes löschen (ACHTUNG: Daten weg!)
docker compose -f docker-compose.production.yml down -v
```

---

## 🔒 Sicherheit

Das Setup ist bereits sicher konfiguriert mit:

- ✅ **HTTPS** mit Let's Encrypt (A+ Rating)
- ✅ **Rate Limiting** (10 req/s API, 5 req/min Login)
- ✅ **Security Headers** (HSTS, CSP, X-Frame-Options, etc.)
- ✅ **Sichere Passwörter** (32+ Zeichen, auto-generiert)
- ✅ **JWT Tokens** mit sicheren Secrets
- ✅ **Isolated Network** (DB nicht von außen erreichbar)
- ✅ **Non-root Container** (alle Container als unprivileged user)

**Optional (empfohlen):**

```bash
# Fail2Ban installieren (schützt vor Brute-Force)
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 💰 Kosten

| Service | Kosten |
|---------|--------|
| Hetzner CAX21 | €4.51/Monat |
| Domain | ~€10-15/Jahr |
| SSL-Zertifikat | Kostenlos (Let's Encrypt) |
| **Gesamt** | **~€5-6/Monat** |

---

## ✅ Checkliste

Vor dem Deployment:
- [ ] Hetzner CAX21 Server gebucht
- [ ] Ubuntu 24.04 installiert
- [ ] SSH-Zugriff funktioniert
- [ ] Docker installiert
- [ ] Firewall konfiguriert (Ports 22, 80, 443)
- [ ] Domain gekauft
- [ ] DNS A-Record konfiguriert (zeigt auf Server-IP)
- [ ] DNS-Propagierung abwarten (5-10 Min)

Deployment:
- [ ] Repository geklont
- [ ] `./setup-production.sh` ausgeführt
- [ ] Alle Fragen beantwortet
- [ ] SSL-Zertifikat erfolgreich erstellt
- [ ] Services gestartet

Verifizierung:
- [ ] `https://deine-domain.de` im Browser öffnet
- [ ] `https://deine-domain.de/health` zeigt `{"status":"ok"}`
- [ ] Registrierung funktioniert
- [ ] Login funktioniert
- [ ] Zeiterfassung funktioniert

---

## 📚 Weitere Ressourcen

- **Vollständige Anleitung:** [DEPLOYMENT_HETZNER.md](DEPLOYMENT_HETZNER.md)
- **Docker-Entwicklung:** [README_DOCKER.md](README_DOCKER.md)
- **GitHub Issues:** https://github.com/cramboeck/timetracking_app/issues

---

## 🎉 Geschafft!

Deine RamboFlow-Installation läuft jetzt sicher in der Cloud!

**Nächste Schritte:**
1. ✅ Admin-Account erstellen
2. ✅ Kunden anlegen
3. ✅ Projekte einrichten
4. ✅ Zeit erfassen
5. ✅ Profitieren! 💰

**Pro-Tipp:** Richte automatische Backups ein:

```bash
# Backup-Script erstellen
nano /root/backup.sh
```

Inhalt:
```bash
#!/bin/bash
docker exec ramboflow-db pg_dump -U timetracking timetracking | gzip > /root/backups/db_$(date +%Y%m%d_%H%M%S).sql.gz
find /root/backups -name "db_*.sql.gz" -mtime +30 -delete
```

```bash
chmod +x /root/backup.sh

# Cronjob (täglich 2:00 Uhr)
crontab -e
# Füge hinzu: 0 2 * * * /root/backup.sh
```

---

**Bei Fragen:** https://github.com/cramboeck/timetracking_app/issues

**Viel Erfolg! 🚀**
