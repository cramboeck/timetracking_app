#!/bin/bash
#
# Automatisches PostgreSQL Backup Script
#
# Verwendung:
#   ./backup-database.sh              # Backup mit Standardeinstellungen
#   ./backup-database.sh --retention 14  # Backups 14 Tage behalten
#
# Cronjob einrichten (täglich um 2:00 Uhr):
#   0 2 * * * /pfad/zu/scripts/backup-database.sh >> /var/log/db-backup.log 2>&1
#

set -e

# ============================================
# Konfiguration
# ============================================

# Backup-Verzeichnis
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"

# Retention in Tagen (wie viele Tage Backups behalten)
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Docker Container Name für PostgreSQL
DB_CONTAINER="${DB_CONTAINER:-timetracking-postgres}"

# Datenbank-Credentials (aus .env oder Umgebung)
DB_NAME="${POSTGRES_DB:-timetracking}"
DB_USER="${POSTGRES_USER:-timetracking}"

# Komprimierung aktivieren
COMPRESS="${COMPRESS:-true}"

# Timestamp für Backup-Datei
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE_TODAY=$(date +"%Y-%m-%d")

# ============================================
# Argument-Parsing
# ============================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --no-compress)
            COMPRESS="false"
            shift
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        *)
            echo "Unbekannte Option: $1"
            exit 1
            ;;
    esac
done

# ============================================
# Funktionen
# ============================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# ============================================
# Hauptlogik
# ============================================

log "=== Starte Datenbank-Backup ==="
log "Backup-Verzeichnis: $BACKUP_DIR"
log "Retention: $RETENTION_DAYS Tage"
log "Komprimierung: $COMPRESS"

# Backup-Verzeichnis erstellen
mkdir -p "$BACKUP_DIR"

# Backup-Dateiname
if [ "$COMPRESS" = "true" ]; then
    BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"
else
    BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql"
fi

# Prüfen ob Docker Container läuft
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    error "PostgreSQL Container '$DB_CONTAINER' läuft nicht!"
    exit 1
fi

# Backup erstellen
log "Erstelle Backup: $BACKUP_FILE"

if [ "$COMPRESS" = "true" ]; then
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
else
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
fi

# Backup-Größe prüfen
BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
log "Backup erstellt: $BACKUP_SIZE"

# Alte Backups löschen
log "Lösche Backups älter als $RETENTION_DAYS Tage..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql*" -type f -mtime +$RETENTION_DAYS -delete -print | wc -l)
log "Gelöschte alte Backups: $DELETED_COUNT"

# Aktuelle Backups auflisten
CURRENT_BACKUPS=$(find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql*" -type f | wc -l)
log "Aktuelle Backups im Verzeichnis: $CURRENT_BACKUPS"

# Zusammenfassung
log "=== Backup abgeschlossen ==="
log "Datei: $BACKUP_FILE"
log "Größe: $BACKUP_SIZE"
log "Verbleibende Backups: $CURRENT_BACKUPS"

# Optional: Backup-Status für Monitoring ausgeben
echo "BACKUP_STATUS=success"
echo "BACKUP_FILE=$BACKUP_FILE"
echo "BACKUP_SIZE=$BACKUP_SIZE"
echo "BACKUP_DATE=$DATE_TODAY"
