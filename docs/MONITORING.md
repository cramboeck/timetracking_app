# Monitoring & Backup Setup

Diese Anleitung erklärt, wie Sie Monitoring und automatische Backups für RamboFlow einrichten.

---

## 1. Health Endpoints

RamboFlow bietet zwei Health-Endpoints für Monitoring:

### `/health` - Liveness Probe
Prüft ob der Server läuft. Schnell und leichtgewichtig.

```bash
curl https://app.ihredomain.de/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400,
  "environment": "production"
}
```

### `/ready` - Readiness Probe
Prüft ob der Server bereit ist, Anfragen zu verarbeiten (inkl. Datenbank).

```bash
curl https://app.ihredomain.de/ready
```

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "database": { "status": "ok", "latency": 5 },
    "uploads": { "status": "ok" },
    "memory": { "status": "ok", "latency": 128 }
  }
}
```

**Status-Codes:**
- `200 OK` - Alles funktioniert
- `503 Service Unavailable` - Ein oder mehrere Checks fehlgeschlagen

---

## 2. Uptime Monitoring einrichten

### Option A: UptimeRobot (kostenlos)

1. Registrieren bei [uptimerobot.com](https://uptimerobot.com)
2. "Add New Monitor" klicken
3. Konfiguration:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** RamboFlow Production
   - **URL:** `https://app.ihredomain.de/ready`
   - **Monitoring Interval:** 5 Minuten
4. Alert-Kontakte hinzufügen (E-Mail, Telegram, etc.)

### Option B: Uptime Kuma (Self-Hosted)

```bash
docker run -d \
  --name uptime-kuma \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma:1
```

Dann im Browser `http://server:3001` öffnen und Monitors einrichten.

### Option C: Healthchecks.io (kostenlos bis 20 Checks)

1. Registrieren bei [healthchecks.io](https://healthchecks.io)
2. Projekt erstellen
3. Check hinzufügen
4. Cronjob einrichten:
```bash
# Alle 5 Minuten Health-Check pingen
*/5 * * * * curl -fsS --retry 3 https://hc-ping.com/YOUR-UUID > /dev/null
```

---

## 3. Automatische Datenbank-Backups

### Cronjob einrichten

```bash
# Crontab bearbeiten
crontab -e

# Täglich um 2:00 Uhr Backup erstellen
0 2 * * * /pfad/zu/timetracking_app/scripts/backup-database.sh >> /var/log/db-backup.log 2>&1

# Optional: Wöchentlich um 3:00 Uhr aufräumen (Backups älter als 30 Tage)
0 3 * * 0 /pfad/zu/timetracking_app/scripts/backup-database.sh --retention 30 >> /var/log/db-backup.log 2>&1
```

### Backup-Script Parameter

```bash
# Standard-Backup (7 Tage behalten, komprimiert)
./scripts/backup-database.sh

# 14 Tage behalten
./scripts/backup-database.sh --retention 14

# Ohne Komprimierung
./scripts/backup-database.sh --no-compress

# Anderes Backup-Verzeichnis
./scripts/backup-database.sh --backup-dir /mnt/backup
```

### Backups manuell prüfen

```bash
# Backups auflisten
./scripts/restore-database.sh --list

# Backup-Verzeichnis direkt prüfen
ls -lh /var/lib/ramboflow/backups/
```

### Backup wiederherstellen

```bash
# Neuestes Backup wiederherstellen
./scripts/restore-database.sh --latest

# Bestimmtes Backup wiederherstellen
./scripts/restore-database.sh backup_timetracking_2024-01-15_02-00-00.sql.gz
```

---

## 4. Log-Monitoring

### Docker Logs anzeigen

```bash
# Alle Container-Logs
docker compose -f docker-compose.production.yml logs -f

# Nur Backend-Logs
docker compose -f docker-compose.production.yml logs -f backend

# Letzte 100 Zeilen
docker compose -f docker-compose.production.yml logs --tail=100 backend
```

### Log-Dateien auf dem Host

```bash
# Backend-Logs
tail -f /var/lib/ramboflow/logs/*.log

# Backup-Logs
tail -f /var/log/db-backup.log
```

---

## 5. Disk-Space Überwachung

### Einfacher Check via Cronjob

```bash
# In crontab hinzufügen - Alert wenn <10% frei
0 */6 * * * df -h / | awk 'NR==2 {if (int($5) > 90) print "WARNUNG: Disk fast voll: "$5" belegt"}' | mail -s "Disk Alert" admin@ihredomain.de
```

### Empfohlene Limits

| Verzeichnis | Empfohlen | Kritisch |
|-------------|-----------|----------|
| `/var/lib/ramboflow/postgres` | 80% | 90% |
| `/var/lib/ramboflow/uploads` | 70% | 85% |
| `/var/lib/ramboflow/backups` | 60% | 80% |

---

## 6. Container-Neustart bei Fehler

Die Docker-Container sind bereits mit `restart: always` konfiguriert. Das bedeutet:
- Container werden bei Absturz automatisch neu gestartet
- Container starten nach Server-Neustart automatisch

### Manueller Neustart

```bash
# Alle Container neustarten
docker compose -f docker-compose.production.yml restart

# Nur Backend neustarten
docker compose -f docker-compose.production.yml restart backend
```

---

## 7. Alerting-Empfehlungen

| Event | Alert-Kanal | Priorität |
|-------|-------------|-----------|
| Server Down (5+ Min) | SMS/Anruf | Kritisch |
| Datenbank nicht erreichbar | E-Mail + Push | Kritisch |
| Backup fehlgeschlagen | E-Mail | Hoch |
| Disk > 80% voll | E-Mail | Mittel |
| Hohe Memory-Nutzung | E-Mail | Niedrig |

---

## Checkliste für Go-Live

- [ ] `/health` und `/ready` Endpoints erreichbar
- [ ] Uptime-Monitoring eingerichtet (z.B. UptimeRobot)
- [ ] Backup-Cronjob aktiv (`crontab -l`)
- [ ] Backup-Verzeichnis existiert und beschreibbar
- [ ] Test-Backup erfolgreich erstellt
- [ ] Test-Restore erfolgreich durchgeführt
- [ ] Alert-E-Mail-Adresse konfiguriert
- [ ] Disk-Space ausreichend (>50% frei)
