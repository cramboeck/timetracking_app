# Datenbank Administration

Dieses Dokument beschreibt, wie du die PostgreSQL-Datenbank sicher administrieren kannst.

## Schnellstart

```bash
# Alle verfügbaren Befehle anzeigen
./db-admin.sh help

# Alle Benutzer anzeigen
./db-admin.sh users

# Statistiken anzeigen
./db-admin.sh stats

# Passwort zurücksetzen
./db-admin.sh reset-password user@example.com
```

## Verfügbare Befehle

### 1. Interaktive psql-Session

```bash
./db-admin.sh psql
```

Öffnet eine interaktive PostgreSQL-Session. Nützliche psql-Befehle:
- `\dt` - Alle Tabellen anzeigen
- `\d tablename` - Schema einer Tabelle anzeigen
- `\q` - Beenden

**Beispiel SQL-Queries in psql:**
```sql
-- Alle Benutzer anzeigen
SELECT id, username, email, account_type, created_at FROM users;

-- Zeiteinträge eines Benutzers
SELECT * FROM time_entries WHERE user_id = 'user-uuid-hier';

-- Audit Log anzeigen
SELECT timestamp, action, details FROM audit_logs ORDER BY timestamp DESC LIMIT 10;
```

### 2. Benutzer anzeigen

```bash
./db-admin.sh users
```

Zeigt eine übersichtliche Liste aller Benutzer mit:
- ID
- Username
- Email
- Konto-Typ
- Erstellungsdatum
- Letzter Login

### 3. Statistiken anzeigen

```bash
./db-admin.sh stats
```

Zeigt wichtige Statistiken:
- Anzahl Benutzer pro Konto-Typ
- Zeiteinträge pro Benutzer
- Gesamtstunden pro Benutzer

### 4. Passwort zurücksetzen (WICHTIG!)

```bash
# Interaktiv (Passwort wird sicher abgefragt)
./db-admin.sh reset-password john@example.com

# Oder direkt mit Passwort
./db-admin.sh reset-password john@example.com NewPassword123
```

**Wichtige Hinweise:**
- ✅ Funktioniert mit Username oder Email (case-insensitive)
- ✅ Passwort wird mit bcrypt gehasht (wie im Backend)
- ✅ Mindestens 8 Zeichen erforderlich
- ✅ Benutzer kann sich sofort mit neuem Passwort anmelden

**Beispiele:**
```bash
# Mit Email
./db-admin.sh reset-password john.doe@company.com

# Mit Username
./db-admin.sh reset-password johndoe

# Direktes Passwort (für Scripts)
./db-admin.sh reset-password admin@example.com "TempPassword123!"
```

### 5. Audit-Log anzeigen

```bash
./db-admin.sh audit
```

Zeigt die letzten 20 Audit-Log-Einträge:
- Zeitstempel
- Aktion (z.B. user.login, user.change_password)
- Benutzer
- Details

### 6. Backup erstellen

```bash
./db-admin.sh backup
```

Erstellt ein komprimiertes Backup im `./backups/` Verzeichnis:
- Format: `backup_YYYYMMDD_HHMMSS.sql.gz`
- Automatisch komprimiert
- Zeigt Backup-Größe an

**Empfehlung:** Regelmäßige Backups erstellen (täglich/wöchentlich)

### 7. Backup wiederherstellen

```bash
./db-admin.sh restore ./backups/backup_20250111_120000.sql.gz
```

**⚠️ ACHTUNG:** Überschreibt die aktuelle Datenbank!

### 8. SQL-Query ausführen

```bash
./db-admin.sh query "SELECT COUNT(*) FROM users;"
```

Führt eine beliebige SQL-Query aus.

**Beispiele:**
```bash
# Anzahl Zeiteinträge heute
./db-admin.sh query "SELECT COUNT(*) FROM time_entries WHERE DATE(start_time) = CURRENT_DATE;"

# Benutzer suchen
./db-admin.sh query "SELECT username, email FROM users WHERE email LIKE '%@company.com';"

# Kunden anzeigen
./db-admin.sh query "SELECT name, email FROM customers ORDER BY name;"
```

### 9. SSH Tunnel (für lokale Tools)

```bash
./db-admin.sh tunnel
```

Zeigt Anleitung zum Einrichten eines SSH-Tunnels für lokale DB-Tools wie:
- DBeaver
- pgAdmin
- TablePlus
- DataGrip

## Sicherheit

### ✅ Was ist sicher?

1. **Datenbank ist nicht nach außen exponiert**
   - Nur über Docker-Netzwerk erreichbar
   - Port 5432 ist NICHT öffentlich

2. **Zugriff nur über SSH**
   - Script funktioniert nur auf dem Server
   - Oder via SSH-Tunnel für lokale Tools

3. **Passwort-Reset mit bcrypt**
   - Gleiches Hashing wie im Backend
   - Sichere Passwort-Speicherung

### ⚠️ Wichtige Hinweise

- Script muss auf dem Hetzner Server ausgeführt werden (oder via SSH)
- Backups sollten regelmäßig erstellt werden
- Backups an sicherem Ort aufbewahren
- Bei Passwort-Reset dem Benutzer Bescheid geben

## Häufige Aufgaben

### Neuen Benutzer manuell anlegen

```bash
./db-admin.sh psql
```

Dann in psql:
```sql
-- UUID generieren und Passwort hashen im Backend
-- Besser: Über die Register-Funktion im Frontend
```

**Empfehlung:** Nutze die Register-Funktion im Frontend statt manuellem Anlegen!

### Benutzer-Email ändern

```bash
./db-admin.sh query "UPDATE users SET email = 'newemail@example.com' WHERE username = 'johndoe';"
```

**Hinweis:** Besser über die neue Profil-Edit-Funktion im Frontend!

### Zeiteinträge eines Benutzers anzeigen

```bash
./db-admin.sh psql
```

Dann:
```sql
SELECT
    t.start_time,
    t.end_time,
    t.duration,
    t.description,
    c.name as customer,
    p.name as project
FROM time_entries t
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.user_id = (SELECT id FROM users WHERE username = 'johndoe')
ORDER BY t.start_time DESC
LIMIT 20;
```

### Gelöschte Einträge wiederherstellen

Wenn du Backups hast:
```bash
./db-admin.sh restore ./backups/backup_20250110_120000.sql.gz
```

## Troubleshooting

### Container läuft nicht

```bash
docker ps | grep ramboflow

# Wenn nicht läuft:
cd /pfad/zu/timetracking_app
docker compose --env-file .env.production -f docker-compose.production.yml up -d database
```

### Passwort-Reset funktioniert nicht

Prüfe, ob bcrypt im Backend-Container verfügbar ist:
```bash
docker exec ramboflow-backend node -e "console.log(require('bcryptjs'))"
```

### Backup zu groß

Alte Backups löschen:
```bash
rm ./backups/backup_*.sql.gz
# Oder nur alte Backups (älter als 30 Tage):
find ./backups -name "backup_*.sql.gz" -mtime +30 -delete
```

## Automatische Backups einrichten

Erstelle einen Cron-Job für tägliche Backups:

```bash
# Crontab öffnen
crontab -e

# Tägliches Backup um 3 Uhr nachts
0 3 * * * cd /pfad/zu/timetracking_app && ./db-admin.sh backup

# Alte Backups automatisch löschen (älter als 30 Tage)
0 4 * * * find /pfad/zu/timetracking_app/backups -name "backup_*.sql.gz" -mtime +30 -delete
```

## Support

Bei Problemen oder Fragen:
1. Logs prüfen: `docker logs ramboflow-db`
2. Backend-Logs: `docker logs ramboflow-backend`
3. Script mit `bash -x` ausführen für Debug-Output: `bash -x ./db-admin.sh users`
