#!/bin/bash
#
# GFS Backup Script (Großvater-Vater-Sohn)
# =========================================
#
# Backup-Rotation:
#   - Stündlich (Sohn):    24 Backups (letzte 24 Stunden)
#   - Täglich (Vater):     7 Backups (letzte 7 Tage, 00:00 Uhr)
#   - Wöchentlich (Großvater): 4 Backups (letzte 4 Wochen, Sonntag)
#   - Monatlich (Urgroßvater): 12 Backups (letzte 12 Monate, 1. des Monats)
#
# Cronjob (stündlich):
#   0 * * * * /path/to/scripts/backup-gfs.sh >> /var/log/ramboflow-backup.log 2>&1
#

set -e

# ============================================
# Konfiguration
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_BASE_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
CONTAINER_NAME="${DB_CONTAINER:-ramboflow-db}"
DB_USER="${POSTGRES_USER:-timetracking}"
DB_NAME="${POSTGRES_DB:-timetracking}"

# Retention Einstellungen
HOURLY_KEEP=24      # Stündliche Backups: 24 Stunden
DAILY_KEEP=7        # Tägliche Backups: 7 Tage
WEEKLY_KEEP=4       # Wöchentliche Backups: 4 Wochen
MONTHLY_KEEP=12     # Monatliche Backups: 12 Monate

# Verzeichnisse
HOURLY_DIR="$BACKUP_BASE_DIR/hourly"
DAILY_DIR="$BACKUP_BASE_DIR/daily"
WEEKLY_DIR="$BACKUP_BASE_DIR/weekly"
MONTHLY_DIR="$BACKUP_BASE_DIR/monthly"

# Aktuelle Zeit
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
HOUR=$(date +"%H")
DAY_OF_WEEK=$(date +"%u")  # 1=Montag, 7=Sonntag
DAY_OF_MONTH=$(date +"%d")

# ============================================
# Farben & Logging
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}❌ $1${NC}" >&2
}

log_info() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}ℹ️  $1${NC}"
}

# ============================================
# Funktionen
# ============================================

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "PostgreSQL Container '$CONTAINER_NAME' läuft nicht!"
        exit 1
    fi
}

create_backup() {
    local target_dir="$1"
    local prefix="$2"
    local backup_file="$target_dir/${prefix}_${TIMESTAMP}.sql.gz"

    mkdir -p "$target_dir"

    if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists 2>/dev/null | gzip > "$backup_file"; then
        local size=$(du -h "$backup_file" | cut -f1)
        log_success "Backup erstellt: $backup_file ($size)"
        echo "$backup_file"
    else
        log_error "Backup fehlgeschlagen: $backup_file"
        rm -f "$backup_file"
        return 1
    fi
}

cleanup_old_backups() {
    local dir="$1"
    local keep="$2"
    local prefix="$3"

    if [ ! -d "$dir" ]; then
        return
    fi

    local count=$(ls -1 "$dir"/${prefix}_*.sql.gz 2>/dev/null | wc -l)

    if [ "$count" -gt "$keep" ]; then
        local delete_count=$((count - keep))
        log_info "Lösche $delete_count alte $prefix Backups (behalte $keep)"
        ls -1t "$dir"/${prefix}_*.sql.gz | tail -n "$delete_count" | xargs rm -f
    fi
}

promote_backup() {
    local source_file="$1"
    local target_dir="$2"
    local prefix="$3"

    if [ ! -f "$source_file" ]; then
        log_error "Quelldatei nicht gefunden: $source_file"
        return 1
    fi

    mkdir -p "$target_dir"
    local target_file="$target_dir/${prefix}_${TIMESTAMP}.sql.gz"

    cp "$source_file" "$target_file"
    log_success "Backup promoted: $prefix ($target_file)"
}

show_status() {
    log ""
    log "═══════════════════════════════════════════════════════════"
    log "  GFS Backup Status"
    log "═══════════════════════════════════════════════════════════"
    log ""

    for dir_info in "hourly:Stündlich:$HOURLY_KEEP" "daily:Täglich:$DAILY_KEEP" "weekly:Wöchentlich:$WEEKLY_KEEP" "monthly:Monatlich:$MONTHLY_KEEP"; do
        IFS=':' read -r dir label keep <<< "$dir_info"
        local full_dir="$BACKUP_BASE_DIR/$dir"

        if [ -d "$full_dir" ]; then
            local count=$(ls -1 "$full_dir"/*.sql.gz 2>/dev/null | wc -l)
            local size=$(du -sh "$full_dir" 2>/dev/null | cut -f1)
            local latest=$(ls -1t "$full_dir"/*.sql.gz 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "-")
            log "  $label: $count/$keep Backups ($size)"
            log "    Letztes: $latest"
        else
            log "  $label: Keine Backups"
        fi
        log ""
    done

    local total_size=$(du -sh "$BACKUP_BASE_DIR" 2>/dev/null | cut -f1 || echo "0")
    log "  Gesamt: $total_size"
    log ""
}

# ============================================
# Hauptlogik
# ============================================

main() {
    local action="${1:-backup}"

    case "$action" in
        backup)
            log "═══════════════════════════════════════════════════════════"
            log "  GFS Backup - $(date '+%Y-%m-%d %H:%M:%S')"
            log "═══════════════════════════════════════════════════════════"

            check_container

            # 1. Stündliches Backup (immer)
            log ""
            log_info "Erstelle stündliches Backup..."
            hourly_file=$(create_backup "$HOURLY_DIR" "hourly")
            cleanup_old_backups "$HOURLY_DIR" "$HOURLY_KEEP" "hourly"

            # 2. Tägliches Backup (um Mitternacht: 00:xx)
            if [ "$HOUR" = "00" ]; then
                log ""
                log_info "Mitternacht - erstelle tägliches Backup..."
                promote_backup "$hourly_file" "$DAILY_DIR" "daily"
                cleanup_old_backups "$DAILY_DIR" "$DAILY_KEEP" "daily"
            fi

            # 3. Wöchentliches Backup (Sonntag um Mitternacht)
            if [ "$HOUR" = "00" ] && [ "$DAY_OF_WEEK" = "7" ]; then
                log ""
                log_info "Sonntag Mitternacht - erstelle wöchentliches Backup..."
                promote_backup "$hourly_file" "$WEEKLY_DIR" "weekly"
                cleanup_old_backups "$WEEKLY_DIR" "$WEEKLY_KEEP" "weekly"
            fi

            # 4. Monatliches Backup (1. des Monats um Mitternacht)
            if [ "$HOUR" = "00" ] && [ "$DAY_OF_MONTH" = "01" ]; then
                log ""
                log_info "Monatsanfang - erstelle monatliches Backup..."
                promote_backup "$hourly_file" "$MONTHLY_DIR" "monthly"
                cleanup_old_backups "$MONTHLY_DIR" "$MONTHLY_KEEP" "monthly"
            fi

            log ""
            log_success "GFS Backup abgeschlossen"
            ;;

        status)
            show_status
            ;;

        init)
            log "Initialisiere GFS Backup-Struktur..."
            mkdir -p "$HOURLY_DIR" "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

            check_container

            # Erstelle initiales Backup in allen Kategorien
            log_info "Erstelle initiales Backup für alle Kategorien..."

            local init_file=$(create_backup "$HOURLY_DIR" "hourly")
            promote_backup "$init_file" "$DAILY_DIR" "daily"
            promote_backup "$init_file" "$WEEKLY_DIR" "weekly"
            promote_backup "$init_file" "$MONTHLY_DIR" "monthly"

            log_success "GFS Backup-Struktur initialisiert!"
            show_status
            ;;

        verify)
            log "Verifiziere letztes Backup..."

            local latest=$(ls -1t "$HOURLY_DIR"/*.sql.gz 2>/dev/null | head -1)

            if [ -z "$latest" ]; then
                log_error "Kein Backup gefunden!"
                exit 1
            fi

            log_info "Prüfe: $latest"

            # Prüfe ob Datei gültig ist
            if ! gzip -t "$latest" 2>/dev/null; then
                log_error "Backup-Datei ist korrupt!"
                exit 1
            fi

            # Zeige Inhalt
            local tables=$(zcat "$latest" | grep -c "^CREATE TABLE" || echo "0")
            local size=$(du -h "$latest" | cut -f1)
            local lines=$(zcat "$latest" | wc -l)

            log_success "Backup OK: $tables Tabellen, $lines Zeilen, $size"

            # Wichtige Tabellen prüfen
            log ""
            log_info "Wichtige Tabellen:"
            for table in users customers projects time_entries tickets organizations; do
                if zcat "$latest" | grep -q "CREATE TABLE.*${table}"; then
                    echo "  ✅ $table"
                else
                    echo "  ❌ $table (FEHLT!)"
                fi
            done
            ;;

        help|--help|-h)
            echo ""
            echo "GFS Backup Script (Großvater-Vater-Sohn)"
            echo "========================================"
            echo ""
            echo "Verwendung: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  backup    Backup erstellen (Standard)"
            echo "  status    Backup-Status anzeigen"
            echo "  init      Backup-Struktur initialisieren"
            echo "  verify    Letztes Backup verifizieren"
            echo "  help      Diese Hilfe anzeigen"
            echo ""
            echo "Rotation:"
            echo "  Stündlich:   $HOURLY_KEEP Backups"
            echo "  Täglich:     $DAILY_KEEP Backups (00:00 Uhr)"
            echo "  Wöchentlich: $WEEKLY_KEEP Backups (Sonntag)"
            echo "  Monatlich:   $MONTHLY_KEEP Backups (1. des Monats)"
            echo ""
            echo "Cronjob einrichten:"
            echo "  0 * * * * $SCRIPT_DIR/backup-gfs.sh >> /var/log/ramboflow-backup.log 2>&1"
            echo ""
            ;;

        *)
            log_error "Unbekannter Befehl: $action"
            echo "Verwende '$0 help' für Hilfe."
            exit 1
            ;;
    esac
}

main "$@"
