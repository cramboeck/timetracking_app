#!/bin/bash

# =============================================================================
# RamboFlow Deploy Script (Hetzner Produktion)
# =============================================================================
# Holt den neuesten Stand von claude/next-version-roadmap-ks0D0 und baut
# alle Container neu:
#
#   sudo docker compose -f docker-compose.production.yml \
#        --env-file .env.production up -d --build
#
# Aufruf vom Repo-Root oder von überall:  ./scripts/deploy.sh
# Nur bauen ohne git pull:                ./scripts/deploy.sh --no-pull
# =============================================================================

set -e

BRANCH="claude/next-version-roadmap-ks0D0"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }

# Immer vom Repo-Root arbeiten, egal von wo das Script aufgerufen wird
cd "$(dirname "$0")/.."

if [ ! -f ".env.production" ]; then
    print_error ".env.production nicht gefunden — bitte im Repo-Root anlegen."
    exit 1
fi

# -----------------------------------------------------------------------------
# Schritt 1: Neuesten Stand holen
# -----------------------------------------------------------------------------
if [ "$1" != "--no-pull" ]; then
    # Häufige Falle: Repo wurde als root geklont, dann scheitert git fetch mit
    # "cannot open '.git/FETCH_HEAD': Permission denied".
    if [ ! -w ".git" ]; then
        print_error "Keine Schreibrechte auf .git — das Repo gehört einem anderen Benutzer."
        print_info  "Einmalig beheben mit:"
        echo "        sudo chown -R $(whoami):$(whoami) $(pwd)"
        print_info  "(Unbedenklich: alle Produktionsdaten liegen in Docker-Volumes, nicht im Repo.)"
        exit 1
    fi
    print_info "Hole neuesten Stand von origin/${BRANCH}..."
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    print_success "Stand: $(git log -1 --format='%h %s')"
else
    print_info "git pull übersprungen (--no-pull)"
fi

# -----------------------------------------------------------------------------
# Schritt 2: Container neu bauen und starten
# -----------------------------------------------------------------------------
print_info "Baue und starte Container (kann einige Minuten dauern)..."
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
print_success "Container gebaut und gestartet"

# -----------------------------------------------------------------------------
# Schritt 3: Status + Health prüfen
# -----------------------------------------------------------------------------
print_info "Container-Status:"
sudo docker compose -f docker-compose.production.yml ps

print_info "Warte 20 Sekunden auf Health-Checks..."
sleep 20

if sudo docker exec ramboflow-backend wget -q -O- http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Backend Health Check OK"
else
    print_error "Backend Health Check fehlgeschlagen — Logs: sudo docker logs ramboflow-backend"
fi

FRONTEND_HEALTH=$(sudo docker inspect ramboflow-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
if [ "$FRONTEND_HEALTH" = "healthy" ]; then
    print_success "Frontend ist healthy 🎉"
else
    print_info "Frontend Health: ${FRONTEND_HEALTH} — ggf. noch am Starten (prüfen mit: sudo docker ps)"
fi

echo ""
print_success "Deploy abgeschlossen."
