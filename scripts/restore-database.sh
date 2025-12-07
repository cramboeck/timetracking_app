#!/bin/bash
#
# PostgreSQL Restore Script
#
# Verwendung:
#   ./restore-database.sh backup_file.sql.gz
#   ./restore-database.sh --list                    # Verfügbare Backups anzeigen
#   ./restore-database.sh --latest                  # Neuestes Backup wiederherstellen
#
# ACHTUNG: Dies überschreibt die aktuelle Datenbank!
#

set -e

# ============================================
# Konfiguration
# ============================================

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DB_CONTAINER="${DB_CONTAINER:-timetracking-postgres}"
DB_NAME="${POSTGRES_DB:-timetracking}"
DB_USER="${POSTGRES_USER:-timetracking}"

# ============================================
# Funktionen
# ============================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

list_backups() {
    echo "Verfügbare Backups in $BACKUP_DIR:"
    echo "========================================="
    if [ -d "$BACKUP_DIR" ]; then
        ls -lht "$BACKUP_DIR"/backup_*.sql* 2>/dev/null || echo "Keine Backups gefunden."
    else
        echo "Backup-Verzeichnis existiert nicht."
    fi
}

get_latest_backup() {
    find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql*" -type f -printf '%T@ %p\n' 2>/dev/null | \
        sort -n | tail -1 | cut -d' ' -f2-
}

# ============================================
# Argument-Parsing
# ============================================

case "${1:-}" in
    --list|-l)
        list_backups
        exit 0
        ;;
    --latest)
        BACKUP_FILE=$(get_latest_backup)
        if [ -z "$BACKUP_FILE" ]; then
            error "Kein Backup gefunden!"
            exit 1
        fi
        log "Neuestes Backup: $BACKUP_FILE"
        ;;
    --help|-h)
        echo "Verwendung: $0 [OPTION] [BACKUP_DATEI]"
        echo ""
        echo "Optionen:"
        echo "  --list, -l     Verfügbare Backups anzeigen"
        echo "  --latest       Neuestes Backup wiederherstellen"
        echo "  --help, -h     Diese Hilfe anzeigen"
        echo ""
        echo "Beispiele:"
        echo "  $0 backup_timetracking_2024-01-15_02-00-00.sql.gz"
        echo "  $0 --latest"
        exit 0
        ;;
    "")
        error "Keine Backup-Datei angegeben!"
        echo "Verwende: $0 --help für Hilfe"
        exit 1
        ;;
    *)
        BACKUP_FILE="$1"
        # Wenn nur Dateiname angegeben, Pfad ergänzen
        if [[ "$BACKUP_FILE" != /* ]]; then
            if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
                BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
            fi
        fi
        ;;
esac

# ============================================
# Validierung
# ============================================

if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup-Datei nicht gefunden: $BACKUP_FILE"
    exit 1
fi

# Prüfen ob Docker Container läuft
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    error "PostgreSQL Container '$DB_CONTAINER' läuft nicht!"
    exit 1
fi

# ============================================
# Bestätigung
# ============================================

BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           ⚠️  ACHTUNG - DATENBANK RESTORE            ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Dies wird die aktuelle Datenbank ÜBERSCHREIBEN!    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Backup-Datei: $BACKUP_FILE"
echo "Größe: $BACKUP_SIZE"
echo "Ziel-Datenbank: $DB_NAME"
echo ""
read -p "Bist du sicher? (ja/nein): " CONFIRM

if [ "$CONFIRM" != "ja" ]; then
    log "Abgebrochen."
    exit 0
fi

# ============================================
# Restore
# ============================================

log "=== Starte Datenbank-Restore ==="

# Aktive Verbindungen trennen
log "Trenne aktive Verbindungen..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = '$DB_NAME'
    AND pid <> pg_backend_pid();
" 2>/dev/null || true

# Datenbank droppen und neu erstellen
log "Erstelle Datenbank neu..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Backup einspielen
log "Spiele Backup ein..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
else
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"
fi

log "=== Restore abgeschlossen ==="
log "Datenbank '$DB_NAME' wurde aus Backup wiederhergestellt."
echo ""
echo "⚠️  Bitte Server neu starten, um Verbindungen zu erneuern!"
