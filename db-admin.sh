#!/bin/bash

# =============================================================================
# Database Administration Script
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="ramboflow-db"
DB_USER="timetracking"
DB_NAME="timetracking"

# Helper functions
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check if container is running
check_container() {
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        print_error "Container $CONTAINER_NAME ist nicht aktiv!"
        exit 1
    fi
}

# Function: Open psql session
cmd_psql() {
    print_header "PostgreSQL Interactive Session"
    print_info "Verbinde mit Datenbank..."
    print_info "Nützliche Befehle:"
    echo "  \\dt              - Alle Tabellen anzeigen"
    echo "  \\d tablename     - Tabellen-Schema anzeigen"
    echo "  \\q               - Beenden"
    echo ""

    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"
}

# Function: List all users
cmd_users() {
    print_header "Alle Benutzer"

    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            id,
            username,
            email,
            account_type,
            TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as erstellt,
            TO_CHAR(last_login, 'YYYY-MM-DD HH24:MI') as letzter_login
        FROM users
        ORDER BY created_at DESC;
    "
}

# Function: Show user statistics
cmd_stats() {
    print_header "Datenbank Statistiken"

    print_info "Benutzer-Statistiken:"
    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            account_type as Konto_Typ,
            COUNT(*) as Anzahl
        FROM users
        GROUP BY account_type;
    "

    echo ""
    print_info "Zeiteinträge pro Benutzer:"
    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            u.username,
            COUNT(t.id) as Eintraege,
            COALESCE(SUM(t.duration), 0) as Gesamt_Minuten,
            ROUND(COALESCE(SUM(t.duration), 0) / 60.0, 2) as Gesamt_Stunden
        FROM users u
        LEFT JOIN time_entries t ON u.id = t.user_id
        GROUP BY u.username
        ORDER BY Eintraege DESC;
    "
}

# Function: Show audit log
cmd_audit() {
    print_header "Audit Log (letzte 20 Einträge)"

    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT
            TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') as Zeit,
            action as Aktion,
            u.username as Benutzer,
            details as Details
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY timestamp DESC
        LIMIT 20;
    "
}

# Function: Reset user password
cmd_reset_password() {
    print_header "Benutzer-Passwort zurücksetzen"

    if [ -z "$2" ]; then
        print_error "Bitte Username oder Email angeben!"
        echo ""
        echo "Verwendung: $0 reset-password <username_oder_email> [neues_passwort]"
        echo ""
        echo "Beispiele:"
        echo "  $0 reset-password john@example.com NewPassword123"
        echo "  $0 reset-password john                            (Passwort wird abgefragt)"
        exit 1
    fi

    USERNAME_OR_EMAIL="$2"
    NEW_PASSWORD="$3"

    # Check if user exists
    USER_EXISTS=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM users
        WHERE LOWER(username) = LOWER('$USERNAME_OR_EMAIL')
           OR LOWER(email) = LOWER('$USERNAME_OR_EMAIL');
    " | tr -d ' ')

    if [ "$USER_EXISTS" -eq 0 ]; then
        print_error "Benutzer '$USERNAME_OR_EMAIL' nicht gefunden!"
        exit 1
    fi

    # Get user info
    USER_INFO=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT username, email FROM users
        WHERE LOWER(username) = LOWER('$USERNAME_OR_EMAIL')
           OR LOWER(email) = LOWER('$USERNAME_OR_EMAIL');
    ")

    print_info "Benutzer gefunden: $USER_INFO"

    # If password not provided, ask for it
    if [ -z "$NEW_PASSWORD" ]; then
        echo ""
        read -sp "Neues Passwort eingeben: " NEW_PASSWORD
        echo ""
        read -sp "Passwort wiederholen: " NEW_PASSWORD_CONFIRM
        echo ""

        if [ "$NEW_PASSWORD" != "$NEW_PASSWORD_CONFIRM" ]; then
            print_error "Passwörter stimmen nicht überein!"
            exit 1
        fi

        if [ ${#NEW_PASSWORD} -lt 8 ]; then
            print_error "Passwort muss mindestens 8 Zeichen lang sein!"
            exit 1
        fi
    fi

    # Hash password using Node.js bcrypt (same as application)
    print_info "Hash Passwort..."

    # Create a temporary Node.js script to hash the password
    HASH_SCRIPT=$(cat <<'EOF'
const bcrypt = require('bcryptjs');
const password = process.argv[2];
bcrypt.hash(password, 10).then(hash => {
    console.log(hash);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
EOF
)

    # Hash password in backend container (has bcrypt installed)
    PASSWORD_HASH=$(docker exec ramboflow-backend node -e "$HASH_SCRIPT" "$NEW_PASSWORD")

    if [ -z "$PASSWORD_HASH" ]; then
        print_error "Fehler beim Hashen des Passworts!"
        exit 1
    fi

    # Update password in database
    print_info "Update Passwort in Datenbank..."
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
        UPDATE users
        SET password_hash = '$PASSWORD_HASH'
        WHERE LOWER(username) = LOWER('$USERNAME_OR_EMAIL')
           OR LOWER(email) = LOWER('$USERNAME_OR_EMAIL');
    "

    print_success "Passwort erfolgreich zurückgesetzt!"
    echo ""
    print_warning "Der Benutzer sollte sich jetzt mit dem neuen Passwort anmelden können."
}

# Function: Create backup
cmd_backup() {
    print_header "Datenbank Backup erstellen"

    BACKUP_DIR="./backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql"

    print_info "Erstelle Backup: $BACKUP_FILE"

    docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"

    # Compress backup
    print_info "Komprimiere Backup..."
    gzip "$BACKUP_FILE"

    BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    print_success "Backup erstellt: ${BACKUP_FILE}.gz (${BACKUP_SIZE})"

    # List all backups
    echo ""
    print_info "Verfügbare Backups:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || print_warning "Keine weiteren Backups gefunden"
}

# Function: Restore backup
cmd_restore() {
    print_header "Datenbank wiederherstellen"

    if [ -z "$2" ]; then
        print_error "Bitte Backup-Datei angeben!"
        echo ""
        echo "Verwendung: $0 restore <backup-datei>"
        echo ""
        print_info "Verfügbare Backups:"
        ls -lh ./backups/*.sql.gz 2>/dev/null || print_warning "Keine Backups gefunden"
        exit 1
    fi

    BACKUP_FILE="$2"

    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup-Datei nicht gefunden: $BACKUP_FILE"
        exit 1
    fi

    print_warning "ACHTUNG: Dies wird die aktuelle Datenbank überschreiben!"
    read -p "Fortfahren? (ja/nein): " CONFIRM

    if [ "$CONFIRM" != "ja" ]; then
        print_info "Abgebrochen."
        exit 0
    fi

    # Decompress if needed
    if [[ "$BACKUP_FILE" == *.gz ]]; then
        print_info "Entpacke Backup..."
        gunzip -k "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE%.gz}"
    fi

    print_info "Stelle Datenbank wieder her..."
    docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"

    print_success "Datenbank erfolgreich wiederhergestellt!"
}

# Function: Execute custom query
cmd_query() {
    print_header "SQL Query ausführen"

    if [ -z "$2" ]; then
        print_error "Bitte SQL-Query angeben!"
        echo ""
        echo "Verwendung: $0 query \"SELECT * FROM users;\""
        exit 1
    fi

    QUERY="$2"

    print_info "Führe Query aus: $QUERY"
    docker exec -it "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "$QUERY"
}

# Function: Show SSH tunnel instructions
cmd_tunnel() {
    print_header "SSH Tunnel für lokale DB-Tools"

    print_info "Um mit lokalen Tools (DBeaver, pgAdmin, etc.) zu verbinden:"
    echo ""
    echo "1. SSH Tunnel erstellen (in lokalem Terminal):"
    echo -e "   ${GREEN}ssh -L 5432:localhost:5432 user@dein-server${NC}"
    echo ""
    echo "2. In deinem DB-Tool verbinden mit:"
    echo "   Host:     localhost"
    echo "   Port:     5432"
    echo "   User:     $DB_USER"
    echo "   Database: $DB_NAME"
    echo "   Password: [aus .env.production]"
    echo ""
    print_warning "Der Tunnel bleibt aktiv, solange das SSH-Fenster offen ist."
}

# Function: Show help
cmd_help() {
    echo ""
    echo "Database Administration Script"
    echo "=============================="
    echo ""
    echo "Verwendung: $0 <command> [options]"
    echo ""
    echo "Verfügbare Befehle:"
    echo ""
    echo "  psql                              - Öffnet interaktive psql-Session"
    echo "  users                             - Zeigt alle Benutzer"
    echo "  stats                             - Zeigt Statistiken"
    echo "  audit                             - Zeigt Audit-Log"
    echo "  reset-password <user> [password]  - Setzt Benutzer-Passwort zurück"
    echo "  backup                            - Erstellt Datenbank-Backup"
    echo "  restore <file>                    - Stellt Backup wieder her"
    echo "  query \"SQL\"                       - Führt SQL-Query aus"
    echo "  tunnel                            - Zeigt SSH-Tunnel Anleitung"
    echo "  help                              - Zeigt diese Hilfe"
    echo ""
    echo "Beispiele:"
    echo "  $0 users"
    echo "  $0 reset-password john@example.com NewPass123"
    echo "  $0 backup"
    echo "  $0 query \"SELECT * FROM users WHERE account_type = 'business';\""
    echo ""
}

# =============================================================================
# Main
# =============================================================================

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker ist nicht installiert oder nicht im PATH!"
    exit 1
fi

# Get command
COMMAND="${1:-help}"

# Check container for most commands (except help and tunnel)
if [ "$COMMAND" != "help" ] && [ "$COMMAND" != "tunnel" ]; then
    check_container
fi

# Execute command
case "$COMMAND" in
    psql)
        cmd_psql
        ;;
    users)
        cmd_users
        ;;
    stats)
        cmd_stats
        ;;
    audit)
        cmd_audit
        ;;
    reset-password)
        cmd_reset_password "$@"
        ;;
    backup)
        cmd_backup
        ;;
    restore)
        cmd_restore "$@"
        ;;
    query)
        cmd_query "$@"
        ;;
    tunnel)
        cmd_tunnel
        ;;
    help)
        cmd_help
        ;;
    *)
        print_error "Unbekannter Befehl: $COMMAND"
        cmd_help
        exit 1
        ;;
esac
