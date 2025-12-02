#!/bin/bash

# =============================================================================
# Database Administration Script - Ramboflow
# =============================================================================
# Version: 2.0
# Erweitert mit: Feature Flags, Portal-Verwaltung, MFA, Security, Tickets
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="ramboflow-db"
BACKEND_CONTAINER="ramboflow-backend"
DB_USER="timetracking"
DB_NAME="timetracking"

# =============================================================================
# Helper Functions
# =============================================================================

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

print_subheader() {
    echo ""
    echo -e "${CYAN}─── $1 ───${NC}"
    echo ""
}

# Check if container is running
check_container() {
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        print_error "Container $CONTAINER_NAME ist nicht aktiv!"
        exit 1
    fi
}

# Execute SQL query and return result
run_query() {
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//'
}

# Execute SQL query with formatted output
run_query_formatted() {
    docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "$1" 2>/dev/null
}

# =============================================================================
# Original Commands
# =============================================================================

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

    run_query_formatted "
        SELECT
            username as \"Username\",
            email as \"Email\",
            account_type as \"Typ\",
            CASE WHEN mfa_enabled THEN '✅' ELSE '❌' END as \"MFA\",
            TO_CHAR(created_at, 'YYYY-MM-DD') as \"Erstellt\",
            TO_CHAR(last_login, 'YYYY-MM-DD HH24:MI') as \"Letzter Login\"
        FROM users
        ORDER BY created_at DESC;
    "
}

# Function: Show user statistics
cmd_stats() {
    print_header "Datenbank Statistiken"

    print_subheader "Benutzer nach Kontotyp"
    run_query_formatted "
        SELECT
            account_type as \"Konto-Typ\",
            COUNT(*) as \"Anzahl\"
        FROM users
        GROUP BY account_type
        ORDER BY COUNT(*) DESC;
    "

    print_subheader "Zeiteinträge pro Benutzer (Top 10)"
    run_query_formatted "
        SELECT
            u.username as \"User\",
            COUNT(t.id) as \"Einträge\",
            ROUND(COALESCE(SUM(t.duration), 0) / 3600.0, 1) as \"Stunden\"
        FROM users u
        LEFT JOIN time_entries t ON u.id = t.user_id
        GROUP BY u.username
        ORDER BY \"Stunden\" DESC
        LIMIT 10;
    "

    print_subheader "Datenbank-Größe"
    run_query_formatted "
        SELECT
            pg_size_pretty(pg_database_size('$DB_NAME')) as \"Datenbank-Größe\";
    "
}

# Function: Show audit log
cmd_audit() {
    print_header "Audit Log (letzte 20 Einträge)"

    run_query_formatted "
        SELECT
            TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI') as \"Zeit\",
            action as \"Aktion\",
            COALESCE(u.username, 'System') as \"Benutzer\",
            LEFT(details, 50) as \"Details\"
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
        exit 1
    fi

    USERNAME_OR_EMAIL="$2"
    NEW_PASSWORD="$3"

    # Check if user exists
    USER_EXISTS=$(run_query "
        SELECT COUNT(*) FROM users
        WHERE LOWER(username) = LOWER('$USERNAME_OR_EMAIL')
           OR LOWER(email) = LOWER('$USERNAME_OR_EMAIL');
    ")

    if [ "$USER_EXISTS" -eq 0 ]; then
        print_error "Benutzer '$USERNAME_OR_EMAIL' nicht gefunden!"
        exit 1
    fi

    # Get user info
    USER_INFO=$(run_query "
        SELECT username || ' (' || email || ')' FROM users
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

    # Hash password using Node.js bcrypt
    print_info "Hash Passwort..."

    HASH_SCRIPT=$(cat <<'EOF'
const bcrypt = require('bcryptjs');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (password) => {
    bcrypt.hash(password, 10).then(hash => { console.log(hash); process.exit(0); });
});
EOF
)

    PASSWORD_HASH=$(echo "$NEW_PASSWORD" | docker exec -i "$BACKEND_CONTAINER" node -e "$HASH_SCRIPT")

    if [ -z "$PASSWORD_HASH" ]; then
        print_error "Fehler beim Hashen des Passworts!"
        exit 1
    fi

    # Update password in database
    run_query "
        UPDATE users
        SET password_hash = '$PASSWORD_HASH'
        WHERE LOWER(username) = LOWER('$USERNAME_OR_EMAIL')
           OR LOWER(email) = LOWER('$USERNAME_OR_EMAIL');
    "

    print_success "Passwort erfolgreich zurückgesetzt für: $USER_INFO"
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

    print_info "Komprimiere Backup..."
    gzip "$BACKUP_FILE"

    BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    print_success "Backup erstellt: ${BACKUP_FILE}.gz (${BACKUP_SIZE})"

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
    if [ -z "$2" ]; then
        print_error "Bitte SQL-Query angeben!"
        echo ""
        echo "Verwendung: $0 query \"SELECT * FROM users;\""
        exit 1
    fi

    run_query_formatted "$2"
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
}

# =============================================================================
# NEW: Feature Flag Management
# =============================================================================

cmd_features() {
    local ACTION="$2"
    local USER_IDENTIFIER="$3"
    local PACKAGE_NAME="$4"

    case "$ACTION" in
        ""|list)
            print_header "Feature Packages - Übersicht"

            run_query_formatted "
                SELECT
                    u.username as \"Username\",
                    u.email as \"Email\",
                    CASE WHEN EXISTS(SELECT 1 FROM feature_packages fp WHERE fp.user_id = u.id AND fp.package_name = 'support' AND fp.enabled = true) THEN '✅' ELSE '❌' END as \"Support\",
                    CASE WHEN EXISTS(SELECT 1 FROM feature_packages fp WHERE fp.user_id = u.id AND fp.package_name = 'business' AND fp.enabled = true) THEN '✅' ELSE '❌' END as \"Business\",
                    (SELECT TO_CHAR(MIN(expires_at), 'YYYY-MM-DD') FROM feature_packages fp WHERE fp.user_id = u.id AND fp.enabled = true AND fp.expires_at IS NOT NULL) as \"Läuft ab\"
                FROM users u
                ORDER BY u.username;
            "

            echo ""
            print_info "Verwendung:"
            echo "  $0 features show <email>              - Details für User"
            echo "  $0 features enable <email> <package>  - Paket aktivieren"
            echo "  $0 features disable <email> <package> - Paket deaktivieren"
            echo ""
            echo "Verfügbare Pakete: support, business"
            ;;

        show)
            if [ -z "$USER_IDENTIFIER" ]; then
                print_error "Bitte Email angeben!"
                exit 1
            fi

            print_header "Feature Packages für: $USER_IDENTIFIER"

            # Get user ID
            USER_ID=$(run_query "SELECT id FROM users WHERE LOWER(email) = LOWER('$USER_IDENTIFIER') LIMIT 1;")

            if [ -z "$USER_ID" ]; then
                print_error "Benutzer nicht gefunden: $USER_IDENTIFIER"
                exit 1
            fi

            run_query_formatted "
                SELECT
                    package_name as \"Paket\",
                    CASE WHEN enabled THEN '✅ Aktiv' ELSE '❌ Inaktiv' END as \"Status\",
                    TO_CHAR(enabled_at, 'YYYY-MM-DD HH24:MI') as \"Aktiviert am\",
                    COALESCE(TO_CHAR(expires_at, 'YYYY-MM-DD'), 'Unbegrenzt') as \"Läuft ab\"
                FROM feature_packages
                WHERE user_id = '$USER_ID'
                ORDER BY package_name;
            "

            # Show what's NOT enabled
            echo ""
            print_info "Nicht aktivierte Pakete:"
            NOT_ENABLED=$(run_query "
                SELECT 'support' WHERE NOT EXISTS (SELECT 1 FROM feature_packages WHERE user_id = '$USER_ID' AND package_name = 'support' AND enabled = true)
                UNION ALL
                SELECT 'business' WHERE NOT EXISTS (SELECT 1 FROM feature_packages WHERE user_id = '$USER_ID' AND package_name = 'business' AND enabled = true);
            ")
            if [ -z "$NOT_ENABLED" ]; then
                echo "  Alle Pakete sind aktiviert."
            else
                echo "$NOT_ENABLED" | while read pkg; do
                    [ -n "$pkg" ] && echo "  - $pkg"
                done
            fi
            ;;

        enable)
            if [ -z "$USER_IDENTIFIER" ] || [ -z "$PACKAGE_NAME" ]; then
                print_error "Bitte Email und Paket angeben!"
                echo "Verwendung: $0 features enable <email> <package>"
                exit 1
            fi

            # Validate package name
            if [ "$PACKAGE_NAME" != "support" ] && [ "$PACKAGE_NAME" != "business" ]; then
                print_error "Ungültiges Paket: $PACKAGE_NAME"
                echo "Verfügbare Pakete: support, business"
                exit 1
            fi

            USER_ID=$(run_query "SELECT id FROM users WHERE LOWER(email) = LOWER('$USER_IDENTIFIER') LIMIT 1;")

            if [ -z "$USER_ID" ]; then
                print_error "Benutzer nicht gefunden: $USER_IDENTIFIER"
                exit 1
            fi

            # Ask for expiration
            echo ""
            read -p "Ablaufdatum setzen? (YYYY-MM-DD oder leer für unbegrenzt): " EXPIRES_AT

            if [ -n "$EXPIRES_AT" ]; then
                run_query "
                    INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at, expires_at)
                    VALUES (gen_random_uuid(), '$USER_ID', '$PACKAGE_NAME', true, NOW(), '$EXPIRES_AT'::timestamp)
                    ON CONFLICT (user_id, package_name)
                    DO UPDATE SET enabled = true, enabled_at = NOW(), expires_at = '$EXPIRES_AT'::timestamp;
                "
            else
                run_query "
                    INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at, expires_at)
                    VALUES (gen_random_uuid(), '$USER_ID', '$PACKAGE_NAME', true, NOW(), NULL)
                    ON CONFLICT (user_id, package_name)
                    DO UPDATE SET enabled = true, enabled_at = NOW(), expires_at = NULL;
                "
            fi

            print_success "Paket '$PACKAGE_NAME' aktiviert für: $USER_IDENTIFIER"
            ;;

        disable)
            if [ -z "$USER_IDENTIFIER" ] || [ -z "$PACKAGE_NAME" ]; then
                print_error "Bitte Email und Paket angeben!"
                echo "Verwendung: $0 features disable <email> <package>"
                exit 1
            fi

            USER_ID=$(run_query "SELECT id FROM users WHERE LOWER(email) = LOWER('$USER_IDENTIFIER') LIMIT 1;")

            if [ -z "$USER_ID" ]; then
                print_error "Benutzer nicht gefunden: $USER_IDENTIFIER"
                exit 1
            fi

            run_query "
                UPDATE feature_packages
                SET enabled = false
                WHERE user_id = '$USER_ID' AND package_name = '$PACKAGE_NAME';
            "

            print_success "Paket '$PACKAGE_NAME' deaktiviert für: $USER_IDENTIFIER"
            ;;

        *)
            print_error "Unbekannte Aktion: $ACTION"
            echo "Verwendung: $0 features [list|show|enable|disable]"
            exit 1
            ;;
    esac
}

# =============================================================================
# NEW: Customer Portal Contacts
# =============================================================================

cmd_contacts() {
    local FILTER="$2"

    print_header "Kundenportal - Kontakte"

    if [ "$FILTER" == "--mfa" ]; then
        print_subheader "Kontakte mit MFA-Status"
        run_query_formatted "
            SELECT
                cc.name as \"Name\",
                cc.email as \"Email\",
                c.name as \"Kunde\",
                CASE WHEN cc.mfa_enabled THEN '✅' ELSE '❌' END as \"MFA\",
                (SELECT COUNT(*) FROM portal_trusted_devices ptd WHERE ptd.contact_id = cc.id AND ptd.expires_at > NOW()) as \"Geräte\",
                CASE WHEN cc.password_hash IS NOT NULL THEN '✅' ELSE '❌' END as \"Aktiv\"
            FROM customer_contacts cc
            JOIN customers c ON cc.customer_id = c.id
            WHERE cc.portal_access = true
            ORDER BY c.name, cc.name;
        "
    elif [ -n "$FILTER" ]; then
        # Show specific contact
        print_subheader "Details für: $FILTER"
        run_query_formatted "
            SELECT
                cc.name as \"Name\",
                cc.email as \"Email\",
                cc.phone as \"Telefon\",
                c.name as \"Kunde\",
                CASE WHEN cc.portal_access THEN '✅' ELSE '❌' END as \"Portal-Zugang\",
                CASE WHEN cc.mfa_enabled THEN '✅' ELSE '❌' END as \"MFA aktiviert\",
                CASE WHEN cc.can_create_tickets THEN '✅' ELSE '❌' END as \"Tickets erstellen\",
                CASE WHEN cc.can_view_all_tickets THEN '✅' ELSE '❌' END as \"Alle Tickets sehen\",
                TO_CHAR(cc.created_at, 'YYYY-MM-DD') as \"Erstellt\"
            FROM customer_contacts cc
            JOIN customers c ON cc.customer_id = c.id
            WHERE LOWER(cc.email) = LOWER('$FILTER');
        "

        # Show trusted devices
        CONTACT_ID=$(run_query "SELECT id FROM customer_contacts WHERE LOWER(email) = LOWER('$FILTER') LIMIT 1;")
        if [ -n "$CONTACT_ID" ]; then
            echo ""
            print_subheader "Vertrauenswürdige Geräte"
            run_query_formatted "
                SELECT
                    device_name as \"Gerät\",
                    browser as \"Browser\",
                    os as \"OS\",
                    TO_CHAR(created_at, 'YYYY-MM-DD') as \"Erstellt\",
                    TO_CHAR(expires_at, 'YYYY-MM-DD') as \"Läuft ab\"
                FROM portal_trusted_devices
                WHERE contact_id = '$CONTACT_ID'
                ORDER BY created_at DESC;
            "
        fi
    else
        # Show all contacts with portal access
        run_query_formatted "
            SELECT
                cc.name as \"Name\",
                cc.email as \"Email\",
                c.name as \"Kunde\",
                CASE WHEN cc.mfa_enabled THEN '✅' ELSE '❌' END as \"MFA\",
                CASE WHEN cc.password_hash IS NOT NULL THEN '✅' ELSE '❌' END as \"Aktiv\",
                TO_CHAR(cc.last_portal_login, 'YYYY-MM-DD HH24:MI') as \"Letzter Login\"
            FROM customer_contacts cc
            JOIN customers c ON cc.customer_id = c.id
            WHERE cc.portal_access = true
            ORDER BY cc.last_portal_login DESC NULLS LAST;
        "

        echo ""
        print_info "Verwendung:"
        echo "  $0 contacts                  - Alle Portal-Kontakte"
        echo "  $0 contacts --mfa            - Mit MFA-Details"
        echo "  $0 contacts <email>          - Details zu einem Kontakt"
    fi
}

# =============================================================================
# NEW: MFA Management
# =============================================================================

cmd_mfa() {
    local ACTION="$2"
    local USER_IDENTIFIER="$3"
    local USER_TYPE="$4"  # --portal for customer contacts

    case "$ACTION" in
        ""|status)
            if [ -z "$USER_IDENTIFIER" ]; then
                print_header "MFA Status - Übersicht"

                print_subheader "Benutzer (App)"
                run_query_formatted "
                    SELECT
                        username as \"Username\",
                        email as \"Email\",
                        CASE WHEN mfa_enabled THEN '✅ Aktiv' ELSE '❌ Inaktiv' END as \"MFA\",
                        (SELECT COUNT(*) FROM trusted_devices td WHERE td.user_id = u.id AND td.expires_at > NOW()) as \"Vertraute Geräte\"
                    FROM users u
                    ORDER BY mfa_enabled DESC, username;
                "

                print_subheader "Portal-Kontakte"
                run_query_formatted "
                    SELECT
                        cc.name as \"Name\",
                        cc.email as \"Email\",
                        CASE WHEN cc.mfa_enabled THEN '✅ Aktiv' ELSE '❌ Inaktiv' END as \"MFA\",
                        (SELECT COUNT(*) FROM portal_trusted_devices ptd WHERE ptd.contact_id = cc.id AND ptd.expires_at > NOW()) as \"Vertraute Geräte\"
                    FROM customer_contacts cc
                    WHERE cc.portal_access = true
                    ORDER BY cc.mfa_enabled DESC, cc.name;
                "
            else
                # Show status for specific user
                if [ "$USER_TYPE" == "--portal" ]; then
                    print_header "MFA Status (Portal): $USER_IDENTIFIER"
                    run_query_formatted "
                        SELECT
                            cc.name as \"Name\",
                            cc.email as \"Email\",
                            CASE WHEN cc.mfa_enabled THEN '✅ Aktiv' ELSE '❌ Inaktiv' END as \"MFA Status\",
                            CASE WHEN cc.mfa_secret IS NOT NULL THEN '✅' ELSE '❌' END as \"Secret vorhanden\"
                        FROM customer_contacts cc
                        WHERE LOWER(cc.email) = LOWER('$USER_IDENTIFIER');
                    "
                else
                    print_header "MFA Status (App): $USER_IDENTIFIER"
                    run_query_formatted "
                        SELECT
                            username as \"Username\",
                            email as \"Email\",
                            CASE WHEN mfa_enabled THEN '✅ Aktiv' ELSE '❌ Inaktiv' END as \"MFA Status\",
                            CASE WHEN mfa_secret IS NOT NULL THEN '✅' ELSE '❌' END as \"Secret vorhanden\"
                        FROM users
                        WHERE LOWER(email) = LOWER('$USER_IDENTIFIER')
                           OR LOWER(username) = LOWER('$USER_IDENTIFIER');
                    "
                fi
            fi
            ;;

        disable)
            if [ -z "$USER_IDENTIFIER" ]; then
                print_error "Bitte Email angeben!"
                echo "Verwendung: $0 mfa disable <email> [--portal]"
                exit 1
            fi

            print_warning "MFA wird deaktiviert für: $USER_IDENTIFIER"
            read -p "Fortfahren? (ja/nein): " CONFIRM
            if [ "$CONFIRM" != "ja" ]; then
                print_info "Abgebrochen."
                exit 0
            fi

            if [ "$USER_TYPE" == "--portal" ]; then
                run_query "
                    UPDATE customer_contacts
                    SET mfa_enabled = false, mfa_secret = NULL
                    WHERE LOWER(email) = LOWER('$USER_IDENTIFIER');
                "
                print_success "MFA deaktiviert (Portal) für: $USER_IDENTIFIER"
            else
                run_query "
                    UPDATE users
                    SET mfa_enabled = false, mfa_secret = NULL
                    WHERE LOWER(email) = LOWER('$USER_IDENTIFIER')
                       OR LOWER(username) = LOWER('$USER_IDENTIFIER');
                "
                print_success "MFA deaktiviert (App) für: $USER_IDENTIFIER"
            fi
            ;;

        clear-devices)
            if [ -z "$USER_IDENTIFIER" ]; then
                print_error "Bitte Email angeben!"
                echo "Verwendung: $0 mfa clear-devices <email> [--portal]"
                exit 1
            fi

            if [ "$USER_TYPE" == "--portal" ]; then
                CONTACT_ID=$(run_query "SELECT id FROM customer_contacts WHERE LOWER(email) = LOWER('$USER_IDENTIFIER') LIMIT 1;")
                if [ -z "$CONTACT_ID" ]; then
                    print_error "Kontakt nicht gefunden: $USER_IDENTIFIER"
                    exit 1
                fi

                DEVICE_COUNT=$(run_query "SELECT COUNT(*) FROM portal_trusted_devices WHERE contact_id = '$CONTACT_ID';")
                print_warning "Es werden $DEVICE_COUNT vertrauenswürdige Geräte gelöscht."
                read -p "Fortfahren? (ja/nein): " CONFIRM
                if [ "$CONFIRM" != "ja" ]; then
                    print_info "Abgebrochen."
                    exit 0
                fi

                run_query "DELETE FROM portal_trusted_devices WHERE contact_id = '$CONTACT_ID';"
                print_success "$DEVICE_COUNT Geräte gelöscht (Portal) für: $USER_IDENTIFIER"
            else
                USER_ID=$(run_query "SELECT id FROM users WHERE LOWER(email) = LOWER('$USER_IDENTIFIER') OR LOWER(username) = LOWER('$USER_IDENTIFIER') LIMIT 1;")
                if [ -z "$USER_ID" ]; then
                    print_error "Benutzer nicht gefunden: $USER_IDENTIFIER"
                    exit 1
                fi

                DEVICE_COUNT=$(run_query "SELECT COUNT(*) FROM trusted_devices WHERE user_id = '$USER_ID';")
                print_warning "Es werden $DEVICE_COUNT vertrauenswürdige Geräte gelöscht."
                read -p "Fortfahren? (ja/nein): " CONFIRM
                if [ "$CONFIRM" != "ja" ]; then
                    print_info "Abgebrochen."
                    exit 0
                fi

                run_query "DELETE FROM trusted_devices WHERE user_id = '$USER_ID';"
                print_success "$DEVICE_COUNT Geräte gelöscht (App) für: $USER_IDENTIFIER"
            fi
            ;;

        *)
            print_error "Unbekannte Aktion: $ACTION"
            echo ""
            echo "Verwendung:"
            echo "  $0 mfa                                  - Übersicht aller User"
            echo "  $0 mfa status <email>                   - Status für App-User"
            echo "  $0 mfa status <email> --portal          - Status für Portal-Kontakt"
            echo "  $0 mfa disable <email>                  - MFA deaktivieren (App)"
            echo "  $0 mfa disable <email> --portal         - MFA deaktivieren (Portal)"
            echo "  $0 mfa clear-devices <email>            - Geräte löschen (App)"
            echo "  $0 mfa clear-devices <email> --portal   - Geräte löschen (Portal)"
            exit 1
            ;;
    esac
}

# =============================================================================
# NEW: Ticket Statistics
# =============================================================================

cmd_tickets() {
    local FILTER="$2"

    print_header "Ticket Statistiken"

    print_subheader "Tickets nach Status"
    run_query_formatted "
        SELECT
            CASE status
                WHEN 'open' THEN '🔵 Offen'
                WHEN 'in_progress' THEN '🟡 In Bearbeitung'
                WHEN 'waiting' THEN '🟣 Wartend'
                WHEN 'resolved' THEN '🟢 Gelöst'
                WHEN 'closed' THEN '⚫ Geschlossen'
                WHEN 'archived' THEN '📦 Archiviert'
            END as \"Status\",
            COUNT(*) as \"Anzahl\"
        FROM tickets
        GROUP BY status
        ORDER BY
            CASE status
                WHEN 'open' THEN 1
                WHEN 'in_progress' THEN 2
                WHEN 'waiting' THEN 3
                WHEN 'resolved' THEN 4
                WHEN 'closed' THEN 5
                WHEN 'archived' THEN 6
            END;
    "

    print_subheader "Tickets nach Priorität (nur aktive)"
    run_query_formatted "
        SELECT
            CASE priority
                WHEN 'critical' THEN '🔴 Kritisch'
                WHEN 'high' THEN '🟠 Hoch'
                WHEN 'normal' THEN '🔵 Normal'
                WHEN 'low' THEN '⚪ Niedrig'
            END as \"Priorität\",
            COUNT(*) as \"Anzahl\"
        FROM tickets
        WHERE status NOT IN ('closed', 'archived')
        GROUP BY priority
        ORDER BY
            CASE priority
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'normal' THEN 3
                WHEN 'low' THEN 4
            END;
    "

    if [ "$FILTER" == "--sla" ]; then
        print_subheader "SLA Breaches"
        run_query_formatted "
            SELECT
                ticket_number as \"Ticket\",
                LEFT(title, 30) as \"Titel\",
                CASE
                    WHEN sla_first_response_breached AND sla_resolution_breached THEN '❌ Beide'
                    WHEN sla_first_response_breached THEN '⚠️ First Response'
                    WHEN sla_resolution_breached THEN '⚠️ Resolution'
                END as \"Breach\",
                c.name as \"Kunde\"
            FROM tickets t
            JOIN customers c ON t.customer_id = c.id
            WHERE sla_first_response_breached = true
               OR sla_resolution_breached = true
            ORDER BY t.created_at DESC
            LIMIT 20;
        "
    fi

    if [ "$FILTER" == "--tasks" ]; then
        print_subheader "Offene Aufgaben"
        run_query_formatted "
            SELECT
                t.ticket_number as \"Ticket\",
                LEFT(t.title, 25) as \"Ticket-Titel\",
                LEFT(tt.title, 30) as \"Aufgabe\",
                c.name as \"Kunde\"
            FROM ticket_tasks tt
            JOIN tickets t ON tt.ticket_id = t.id
            JOIN customers c ON t.customer_id = c.id
            WHERE tt.completed = false
              AND t.status NOT IN ('closed', 'archived')
            ORDER BY
                t.priority = 'critical' DESC,
                t.priority = 'high' DESC,
                t.created_at ASC
            LIMIT 20;
        "
    fi

    print_subheader "Tickets pro Kunde (Top 10)"
    run_query_formatted "
        SELECT
            c.name as \"Kunde\",
            COUNT(*) FILTER (WHERE t.status NOT IN ('closed', 'archived')) as \"Aktiv\",
            COUNT(*) FILTER (WHERE t.status IN ('closed', 'archived')) as \"Abgeschlossen\",
            COUNT(*) as \"Gesamt\"
        FROM tickets t
        JOIN customers c ON t.customer_id = c.id
        GROUP BY c.name
        ORDER BY \"Aktiv\" DESC
        LIMIT 10;
    "

    echo ""
    print_info "Verwendung:"
    echo "  $0 tickets          - Übersicht"
    echo "  $0 tickets --sla    - SLA-Breaches anzeigen"
    echo "  $0 tickets --tasks  - Offene Aufgaben anzeigen"
}

# =============================================================================
# NEW: Security Dashboard
# =============================================================================

cmd_security() {
    print_header "Security Dashboard"

    # === MFA ÜBERSICHT ===
    print_subheader "MFA Adoption"
    run_query_formatted "
        SELECT
            'App-Benutzer' as \"Typ\",
            COUNT(*) FILTER (WHERE mfa_enabled = true) as \"Mit MFA\",
            COUNT(*) FILTER (WHERE mfa_enabled = false OR mfa_enabled IS NULL) as \"Ohne MFA\",
            COUNT(*) as \"Gesamt\",
            COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE mfa_enabled = true) / NULLIF(COUNT(*), 0), 1), 0) || '%' as \"Quote\"
        FROM users
        UNION ALL
        SELECT
            'Portal-Kontakte' as \"Typ\",
            COUNT(*) FILTER (WHERE mfa_enabled = true) as \"Mit MFA\",
            COUNT(*) FILTER (WHERE mfa_enabled = false OR mfa_enabled IS NULL) as \"Ohne MFA\",
            COUNT(*) as \"Gesamt\",
            COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE mfa_enabled = true) / NULLIF(COUNT(*), 0), 1), 0) || '%' as \"Quote\"
        FROM customer_contacts
        WHERE portal_access = true;
    "

    # === TRUSTED DEVICES ===
    print_subheader "Vertrauenswürdige Geräte"
    run_query_formatted "
        SELECT
            'App-User' as \"Bereich\",
            COUNT(*) FILTER (WHERE expires_at > NOW()) as \"Aktiv\",
            COUNT(*) FILTER (WHERE expires_at <= NOW()) as \"Abgelaufen\",
            COUNT(*) as \"Gesamt\"
        FROM trusted_devices
        UNION ALL
        SELECT
            'Portal-User' as \"Bereich\",
            COUNT(*) FILTER (WHERE expires_at > NOW()) as \"Aktiv\",
            COUNT(*) FILTER (WHERE expires_at <= NOW()) as \"Abgelaufen\",
            COUNT(*) as \"Gesamt\"
        FROM portal_trusted_devices;
    "

    # === LOGIN-AKTIVITÄT ===
    print_subheader "Login-Aktivität (letzte 7 Tage)"
    run_query_formatted "
        SELECT
            action as \"Aktion\",
            COUNT(*) as \"Anzahl\",
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as \"Heute\"
        FROM mfa_audit_log
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY action
        ORDER BY COUNT(*) DESC;
    "

    # === LETZTE LOGINS ===
    print_subheader "Letzte erfolgreiche Logins"
    run_query_formatted "
        SELECT
            u.username as \"User\",
            TO_CHAR(u.last_login, 'YYYY-MM-DD HH24:MI') as \"Letzter Login\",
            CASE
                WHEN u.last_login > NOW() - INTERVAL '1 day' THEN '🟢 Heute'
                WHEN u.last_login > NOW() - INTERVAL '7 days' THEN '🟡 Diese Woche'
                WHEN u.last_login > NOW() - INTERVAL '30 days' THEN '🟠 Dieser Monat'
                ELSE '🔴 >30 Tage'
            END as \"Status\"
        FROM users u
        ORDER BY u.last_login DESC NULLS LAST
        LIMIT 10;
    "

    # === FEHLGESCHLAGENE LOGINS ===
    print_subheader "Fehlgeschlagene Logins (letzte 24h)"
    local FAILED_COUNT=$(run_query "
        SELECT COUNT(*)
        FROM mfa_audit_log
        WHERE action IN ('login_failed', 'mfa_failed', 'rate_limited')
          AND created_at > NOW() - INTERVAL '24 hours';
    ")

    if [ "$FAILED_COUNT" -gt 0 ] 2>/dev/null; then
        print_warning "$FAILED_COUNT fehlgeschlagene Login-Versuche in den letzten 24h"
        run_query_formatted "
            SELECT
                TO_CHAR(created_at, 'HH24:MI') as \"Zeit\",
                action as \"Typ\",
                ip_address as \"IP-Adresse\",
                LEFT(COALESCE(details::text, '-'), 50) as \"Details\"
            FROM mfa_audit_log
            WHERE action IN ('login_failed', 'mfa_failed', 'rate_limited')
              AND created_at > NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT 10;
        "
    else
        print_success "Keine fehlgeschlagenen Logins in den letzten 24h"
    fi

    # === RATE LIMITING ===
    print_subheader "Rate Limiting Status"
    local RATE_LIMITED=$(run_query "
        SELECT COUNT(DISTINCT ip_address)
        FROM mfa_audit_log
        WHERE action = 'rate_limited'
          AND created_at > NOW() - INTERVAL '1 hour';
    ")

    if [ "$RATE_LIMITED" -gt 0 ] 2>/dev/null; then
        print_warning "$RATE_LIMITED IP-Adressen in der letzten Stunde rate-limited"
    else
        print_success "Keine aktiven Rate-Limits"
    fi

    # === AUDIT LOG ZUSAMMENFASSUNG ===
    print_subheader "Letzte Security-Events"
    run_query_formatted "
        SELECT
            TO_CHAR(mal.created_at, 'MM-DD HH24:MI') as \"Zeit\",
            mal.action as \"Aktion\",
            COALESCE(u.username, cc.name, 'System') as \"User\",
            mal.ip_address as \"IP\"
        FROM mfa_audit_log mal
        LEFT JOIN users u ON mal.user_id = u.id
        LEFT JOIN customer_contacts cc ON mal.contact_id = cc.id
        ORDER BY mal.created_at DESC
        LIMIT 15;
    "

    echo ""
}

# =============================================================================
# NEW: Portal Password Reset
# =============================================================================

cmd_portal_reset() {
    print_header "Portal-Passwort zurücksetzen"

    if [ -z "$2" ]; then
        print_error "Bitte Email des Portal-Kontakts angeben!"
        echo ""
        echo "Verwendung: $0 portal-reset <email> [neues_passwort]"
        exit 1
    fi

    CONTACT_EMAIL="$2"
    NEW_PASSWORD="$3"

    # Check if contact exists
    CONTACT_INFO=$(run_query "
        SELECT cc.name || ' (' || c.name || ')'
        FROM customer_contacts cc
        JOIN customers c ON cc.customer_id = c.id
        WHERE LOWER(cc.email) = LOWER('$CONTACT_EMAIL')
        LIMIT 1;
    ")

    if [ -z "$CONTACT_INFO" ]; then
        print_error "Kontakt nicht gefunden: $CONTACT_EMAIL"
        exit 1
    fi

    print_info "Kontakt gefunden: $CONTACT_INFO"

    # Check portal access
    HAS_PORTAL=$(run_query "SELECT portal_access FROM customer_contacts WHERE LOWER(email) = LOWER('$CONTACT_EMAIL');")
    if [ "$HAS_PORTAL" != "t" ]; then
        print_warning "Dieser Kontakt hat keinen Portal-Zugang aktiviert!"
        read -p "Trotzdem fortfahren? (ja/nein): " CONFIRM
        if [ "$CONFIRM" != "ja" ]; then
            print_info "Abgebrochen."
            exit 0
        fi
    fi

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

    # Hash password
    print_info "Hash Passwort..."

    HASH_SCRIPT=$(cat <<'EOF'
const bcrypt = require('bcryptjs');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (password) => {
    bcrypt.hash(password, 10).then(hash => { console.log(hash); process.exit(0); });
});
EOF
)

    PASSWORD_HASH=$(echo "$NEW_PASSWORD" | docker exec -i "$BACKEND_CONTAINER" node -e "$HASH_SCRIPT")

    if [ -z "$PASSWORD_HASH" ]; then
        print_error "Fehler beim Hashen des Passworts!"
        exit 1
    fi

    # Update password
    run_query "
        UPDATE customer_contacts
        SET password_hash = '$PASSWORD_HASH'
        WHERE LOWER(email) = LOWER('$CONTACT_EMAIL');
    "

    print_success "Portal-Passwort zurückgesetzt für: $CONTACT_INFO"
    print_info "Der Kontakt kann sich jetzt mit dem neuen Passwort im Portal anmelden."
}

# =============================================================================
# Help
# =============================================================================

cmd_help() {
    echo ""
    echo -e "${BOLD}Database Administration Script - Ramboflow${NC}"
    echo "============================================="
    echo ""
    echo -e "${CYAN}Verwendung:${NC} $0 <command> [options]"
    echo ""
    echo -e "${YELLOW}── Basis-Befehle ──${NC}"
    echo "  psql                              Interaktive psql-Session"
    echo "  users                             Alle Benutzer anzeigen"
    echo "  stats                             Datenbank-Statistiken"
    echo "  audit                             Audit-Log anzeigen"
    echo "  query \"SQL\"                       SQL-Query ausführen"
    echo ""
    echo -e "${YELLOW}── Benutzerverwaltung ──${NC}"
    echo "  reset-password <user> [pass]      App-Passwort zurücksetzen"
    echo "  portal-reset <email> [pass]       Portal-Passwort zurücksetzen"
    echo ""
    echo -e "${YELLOW}── Feature Flags ──${NC}"
    echo "  features                          Feature-Pakete Übersicht"
    echo "  features show <email>             Pakete eines Users anzeigen"
    echo "  features enable <email> <pkg>     Paket aktivieren"
    echo "  features disable <email> <pkg>    Paket deaktivieren"
    echo ""
    echo -e "${YELLOW}── Portal & Kontakte ──${NC}"
    echo "  contacts                          Portal-Kontakte anzeigen"
    echo "  contacts --mfa                    Mit MFA-Details"
    echo "  contacts <email>                  Details zu Kontakt"
    echo ""
    echo -e "${YELLOW}── MFA-Verwaltung ──${NC}"
    echo "  mfa                               MFA-Status Übersicht"
    echo "  mfa status <email> [--portal]     Status für User/Kontakt"
    echo "  mfa disable <email> [--portal]    MFA deaktivieren"
    echo "  mfa clear-devices <email> [--portal]  Vertraute Geräte löschen"
    echo ""
    echo -e "${YELLOW}── Tickets ──${NC}"
    echo "  tickets                           Ticket-Statistiken"
    echo "  tickets --sla                     SLA-Breaches anzeigen"
    echo "  tickets --tasks                   Offene Aufgaben anzeigen"
    echo ""
    echo -e "${YELLOW}── Security ──${NC}"
    echo "  security                          Vollständiges Security-Dashboard"
    echo "                                    (MFA, Logins, Rate-Limits, Events)"
    echo ""
    echo -e "${YELLOW}── Backup & Restore ──${NC}"
    echo "  backup                            Backup erstellen"
    echo "  restore <file>                    Backup wiederherstellen"
    echo ""
    echo -e "${YELLOW}── Sonstiges ──${NC}"
    echo "  tunnel                            SSH-Tunnel Anleitung"
    echo "  help                              Diese Hilfe"
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

# Check container for most commands
if [ "$COMMAND" != "help" ] && [ "$COMMAND" != "tunnel" ]; then
    check_container
fi

# Execute command
case "$COMMAND" in
    psql)           cmd_psql ;;
    users)          cmd_users ;;
    stats)          cmd_stats ;;
    audit)          cmd_audit ;;
    reset-password) cmd_reset_password "$@" ;;
    portal-reset)   cmd_portal_reset "$@" ;;
    features)       cmd_features "$@" ;;
    contacts)       cmd_contacts "$@" ;;
    mfa)            cmd_mfa "$@" ;;
    tickets)        cmd_tickets "$@" ;;
    security)       cmd_security "$@" ;;
    backup)         cmd_backup ;;
    restore)        cmd_restore "$@" ;;
    query)          cmd_query "$@" ;;
    tunnel)         cmd_tunnel ;;
    help|--help|-h) cmd_help ;;
    *)
        print_error "Unbekannter Befehl: $COMMAND"
        echo "Verwende '$0 help' für eine Liste aller Befehle."
        exit 1
        ;;
esac
