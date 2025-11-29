#!/bin/bash

# =============================================================================
# Frontend Rebuild Script
# =============================================================================
# Baut den Frontend-Container neu mit den neuesten Fixes
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

clear
echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║              Frontend Container Rebuild                      ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# =============================================================================
# Step 1: Stop running containers
# =============================================================================

print_header "Step 1: Stoppe laufende Container"

print_info "Stoppe alle RamboFlow Container..."
docker compose -f docker-compose.production.yml down 2>/dev/null || true
print_success "Container gestoppt"

# =============================================================================
# Step 2: Remove old frontend image
# =============================================================================

print_header "Step 2: Entferne altes Frontend-Image"

if docker images | grep -q "timetracking_app-frontend"; then
    print_info "Entferne altes Frontend-Image..."
    docker rmi timetracking_app-frontend 2>/dev/null || true
    print_success "Altes Image entfernt"
else
    print_info "Kein altes Image gefunden"
fi

# =============================================================================
# Step 3: Rebuild frontend
# =============================================================================

print_header "Step 3: Baue Frontend-Container neu"

print_info "Dies kann einige Minuten dauern..."

if [ -f ".env.production" ]; then
    docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache frontend
else
    print_error ".env.production nicht gefunden!"
    exit 1
fi

print_success "Frontend-Image erfolgreich gebaut!"

# =============================================================================
# Step 4: Start all services
# =============================================================================

print_header "Step 4: Starte alle Services"

print_info "Starte Database..."
docker compose --env-file .env.production -f docker-compose.production.yml up -d database

print_info "Warte auf Database (15 Sekunden)..."
sleep 15

print_info "Starte Backend..."
docker compose --env-file .env.production -f docker-compose.production.yml up -d backend

print_info "Warte auf Backend (15 Sekunden)..."
sleep 15

print_info "Starte Frontend..."
docker compose --env-file .env.production -f docker-compose.production.yml up -d frontend

print_info "Warte auf Frontend (30 Sekunden)..."
sleep 30

print_info "Starte Nginx..."
docker compose --env-file .env.production -f docker-compose.production.yml up -d nginx

print_success "Alle Services gestartet!"

# =============================================================================
# Step 5: Check status
# =============================================================================

print_header "Step 5: Überprüfe Service-Status"

docker ps --filter "name=ramboflow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# =============================================================================
# Step 6: Check health
# =============================================================================

print_header "Step 6: Health Checks"

print_info "Warte 20 Sekunden auf Health-Checks..."
sleep 20

echo ""
print_info "Frontend Container Status:"
docker ps --filter "name=ramboflow-frontend" --format "table {{.Names}}\t{{.Status}}"

if docker ps --filter "name=ramboflow-frontend" --filter "status=running" | grep -q "ramboflow-frontend"; then
    print_success "Frontend Container läuft!"

    # Check health status
    HEALTH=$(docker inspect ramboflow-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    print_info "Health Status: $HEALTH"

    if [ "$HEALTH" = "healthy" ]; then
        print_success "Frontend ist HEALTHY! 🎉"
    elif [ "$HEALTH" = "starting" ]; then
        print_info "Frontend startet noch... warte weitere 30 Sekunden"
        sleep 30
        HEALTH=$(docker inspect ramboflow-frontend --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
        if [ "$HEALTH" = "healthy" ]; then
            print_success "Frontend ist jetzt HEALTHY! 🎉"
        else
            print_error "Frontend ist noch nicht healthy: $HEALTH"
            print_info "Führe aus: docker logs ramboflow-frontend"
        fi
    else
        print_error "Frontend ist UNHEALTHY!"
        print_info "Führe Diagnose aus: ./diagnose-frontend-logs.sh"
    fi
else
    print_error "Frontend Container läuft nicht!"
    docker logs --tail 50 ramboflow-frontend
fi

# =============================================================================
# Step 7: Final checks
# =============================================================================

print_header "Abschließende Checks"

if [ -f ".env.production" ]; then
    DOMAIN=$(grep "^DOMAIN=" .env.production | cut -d '=' -f2)

    if [ -n "$DOMAIN" ]; then
        echo ""
        print_info "Teste Endpunkte..."

        # Test Frontend
        if curl -f -s "http://localhost:80" > /dev/null 2>&1; then
            print_success "Frontend erreichbar über Port 80"
        else
            print_error "Frontend nicht erreichbar über Port 80"
        fi

        # Test Backend Health
        if docker exec ramboflow-backend wget -q -O- http://localhost:3001/health > /dev/null 2>&1; then
            print_success "Backend Health Check OK"
        else
            print_error "Backend Health Check fehlgeschlagen"
        fi
    fi
fi

# =============================================================================
# Summary
# =============================================================================

print_header "Zusammenfassung"

echo ""
print_info "Alle Container:"
docker compose -f docker-compose.production.yml ps

echo ""
print_info "Nützliche Befehle:"
echo ""
echo -e "  ${GREEN}# Live Logs ansehen${NC}"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo ""
echo -e "  ${GREEN}# Nur Frontend-Logs${NC}"
echo "  docker logs -f ramboflow-frontend"
echo ""
echo -e "  ${GREEN}# Container Status${NC}"
echo "  docker ps --filter 'name=ramboflow'"
echo ""
echo -e "  ${GREEN}# Diagnose ausführen${NC}"
echo "  ./diagnose-frontend-logs.sh"
echo ""

if docker ps --filter "name=ramboflow-frontend" --filter "health=healthy" | grep -q "ramboflow-frontend"; then
    echo -e "${GREEN}"
    cat << "EOF"
    ╔════════════════════════════════════════╗
    ║     Frontend läuft erfolgreich! 🎉     ║
    ╚════════════════════════════════════════╝
EOF
    echo -e "${NC}"
else
    echo -e "${YELLOW}"
    cat << "EOF"
    ╔════════════════════════════════════════╗
    ║  Frontend benötigt weitere Diagnose   ║
    ╚════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo ""
    print_info "Führe aus: ./diagnose-frontend-logs.sh"
fi

echo ""
