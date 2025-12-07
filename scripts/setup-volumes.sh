#!/bin/bash
# =============================================================================
# setup-volumes.sh - Erstellt die Docker Volumes für Ramboflow Production
# =============================================================================
#
# Dieses Script muss einmalig vor dem ersten docker-compose up ausgeführt werden.
# Es erstellt die Volumes mit den richtigen Einstellungen.
#
# Usage: sudo ./scripts/setup-volumes.sh
# =============================================================================

set -e

echo "🔧 Ramboflow Volume Setup"
echo "========================="

# Verzeichnisse erstellen (falls nicht vorhanden)
echo ""
echo "📁 Erstelle Verzeichnisse..."
sudo mkdir -p /var/lib/ramboflow/postgres
sudo mkdir -p /var/lib/ramboflow/logs
sudo mkdir -p /var/lib/ramboflow/uploads
sudo mkdir -p /var/lib/ramboflow/backups

# Berechtigungen setzen
echo "🔑 Setze Berechtigungen..."
sudo chown -R 999:999 /var/lib/ramboflow/postgres  # PostgreSQL User
sudo chmod 700 /var/lib/ramboflow/postgres
sudo chmod 755 /var/lib/ramboflow/logs
sudo chmod 755 /var/lib/ramboflow/uploads
sudo chmod 755 /var/lib/ramboflow/backups

# Docker Volumes erstellen (falls nicht vorhanden)
echo ""
echo "🐳 Erstelle Docker Volumes..."

# Postgres Data Volume (bind mount)
if ! docker volume inspect timetracking_app_postgres_data &> /dev/null; then
    echo "  → postgres_data"
    docker volume create \
        --driver local \
        --opt type=none \
        --opt device=/var/lib/ramboflow/postgres \
        --opt o=bind \
        timetracking_app_postgres_data
else
    echo "  ✓ postgres_data existiert bereits"
fi

# Backend Logs Volume (bind mount)
if ! docker volume inspect timetracking_app_backend_logs &> /dev/null; then
    echo "  → backend_logs"
    docker volume create \
        --driver local \
        --opt type=none \
        --opt device=/var/lib/ramboflow/logs \
        --opt o=bind \
        timetracking_app_backend_logs
else
    echo "  ✓ backend_logs existiert bereits"
fi

# Backend Uploads Volume (bind mount)
if ! docker volume inspect timetracking_app_backend_uploads &> /dev/null; then
    echo "  → backend_uploads"
    docker volume create \
        --driver local \
        --opt type=none \
        --opt device=/var/lib/ramboflow/uploads \
        --opt o=bind \
        timetracking_app_backend_uploads
else
    echo "  ✓ backend_uploads existiert bereits"
fi

# Backend Backups Volume (bind mount)
if ! docker volume inspect timetracking_app_backend_backups &> /dev/null; then
    echo "  → backend_backups"
    docker volume create \
        --driver local \
        --opt type=none \
        --opt device=/var/lib/ramboflow/backups \
        --opt o=bind \
        timetracking_app_backend_backups
else
    echo "  ✓ backend_backups existiert bereits"
fi

# Certbot Volumes (Docker-managed)
if ! docker volume inspect timetracking_app_certbot_data &> /dev/null; then
    echo "  → certbot_data"
    docker volume create timetracking_app_certbot_data
else
    echo "  ✓ certbot_data existiert bereits"
fi

if ! docker volume inspect timetracking_app_letsencrypt &> /dev/null; then
    echo "  → letsencrypt"
    docker volume create timetracking_app_letsencrypt
else
    echo "  ✓ letsencrypt existiert bereits"
fi

if ! docker volume inspect timetracking_app_certbot_logs &> /dev/null; then
    echo "  → certbot_logs"
    docker volume create timetracking_app_certbot_logs
else
    echo "  ✓ certbot_logs existiert bereits"
fi

echo ""
echo "✅ Volume Setup abgeschlossen!"
echo ""
echo "Du kannst jetzt starten mit:"
echo "  docker compose -f docker-compose.production.yml up -d"
