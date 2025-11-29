#!/bin/bash

echo "=== Database Connection Debug ==="
echo ""

# Load .env.production
source .env.production

echo "1. Variables from .env.production:"
echo "   DB_USER: ${DB_USER:-timetracking}"
echo "   DB_PASSWORD: ${DB_PASSWORD}"
echo "   DB_NAME: ${DB_NAME:-timetracking}"
echo ""

echo "2. Built DATABASE_URL:"
DB_URL="postgresql://${DB_USER:-timetracking}:${DB_PASSWORD}@database:5432/${DB_NAME:-timetracking}"
echo "   $DB_URL"
echo ""

echo "3. Test from database container (should work):"
docker exec ramboflow-db psql -U timetracking -d timetracking -c "SELECT 'DB is accessible' as status;" 2>&1
echo ""

echo "4. Test connection with URL from outside:"
docker run --rm --network timetracking_app_ramboflow-network postgres:16-alpine \
  psql "$DB_URL" -c "SELECT 'Connection OK' as status;" 2>&1
echo ""

echo "5. Backend container environment (when running):"
sleep 2
docker exec ramboflow-backend printenv | grep -E "DATABASE_URL|DB_|POSTGRES" 2>&1 || echo "Backend not running or restarting"

