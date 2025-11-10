#!/bin/bash

echo "========================================="
echo "FRONTEND CONTAINER QUICK CHECK"
echo "========================================="
echo ""

echo "1. Container Status:"
docker ps -a --filter "name=ramboflow-frontend" --format "table {{.Names}}\t{{.Status}}"
echo ""

echo "2. Health Status:"
docker inspect ramboflow-frontend --format='Health: {{.State.Health.Status}}' 2>/dev/null || echo "No health info"
echo ""

echo "3. Last 50 Log Lines:"
echo "========================================="
docker logs --tail 50 ramboflow-frontend 2>&1
echo "========================================="
echo ""

echo "4. Health Check Details:"
docker inspect ramboflow-frontend --format='{{json .State.Health}}' 2>/dev/null | python3 -m json.tool 2>/dev/null || docker inspect ramboflow-frontend --format='{{json .State.Health}}'
echo ""

echo "5. Nginx Process Check (if running):"
if docker ps --filter "name=ramboflow-frontend" --filter "status=running" | grep -q "ramboflow-frontend"; then
    docker exec ramboflow-frontend ps aux 2>/dev/null || echo "Cannot exec into container"
else
    echo "Container not running"
fi
echo ""

echo "6. Port 8080 Check (if running):"
if docker ps --filter "name=ramboflow-frontend" --filter "status=running" | grep -q "ramboflow-frontend"; then
    docker exec ramboflow-frontend wget --spider -q http://localhost:8080/ 2>&1 && echo "Port 8080 is responding" || echo "Port 8080 NOT responding"
else
    echo "Container not running"
fi
echo ""

echo "7. Files in /usr/share/nginx/html:"
if docker ps --filter "name=ramboflow-frontend" --filter "status=running" | grep -q "ramboflow-frontend"; then
    docker exec ramboflow-frontend ls -lh /usr/share/nginx/html/ 2>/dev/null || echo "Cannot list files"
else
    echo "Container not running - trying to start temporarily..."
    docker start ramboflow-frontend 2>/dev/null
    sleep 3
    docker exec ramboflow-frontend ls -lh /usr/share/nginx/html/ 2>/dev/null || echo "Cannot list files"
fi
echo ""

echo "========================================="
echo "RECOMMENDATIONS:"
echo "========================================="
echo ""
echo "If you see errors above, try:"
echo "  1. Check if nginx config is valid:"
echo "     docker exec ramboflow-frontend nginx -t"
echo ""
echo "  2. View full logs:"
echo "     docker logs ramboflow-frontend"
echo ""
echo "  3. Interactive debugging:"
echo "     docker exec -it ramboflow-frontend sh"
echo ""
