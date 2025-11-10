#!/bin/bash

echo "========================================="
echo "NGINX PORT BINDING DEBUG"
echo "========================================="
echo ""

echo "1. Check which ports nginx is listening on:"
docker exec ramboflow-frontend netstat -tlnp 2>/dev/null || \
docker exec ramboflow-frontend ss -tlnp 2>/dev/null || \
echo "netstat/ss not available, trying alternative..."

echo ""
echo "2. Check nginx error log:"
docker exec ramboflow-frontend cat /var/log/nginx/error.log 2>/dev/null || echo "No error log"

echo ""
echo "3. Test nginx configuration:"
docker exec ramboflow-frontend nginx -t 2>&1

echo ""
echo "4. Show nginx.conf content:"
echo "--- /etc/nginx/nginx.conf ---"
docker exec ramboflow-frontend cat /etc/nginx/nginx.conf

echo ""
echo "--- /etc/nginx/conf.d/default.conf ---"
docker exec ramboflow-frontend cat /etc/nginx/conf.d/default.conf

echo ""
echo "5. Check if nginx is running:"
docker exec ramboflow-frontend ps aux | grep nginx

echo ""
echo "6. Try to connect to different ports:"
for port in 80 8080 443; do
    echo -n "Port $port: "
    docker exec ramboflow-frontend wget --spider -q http://localhost:$port/ 2>&1 && echo "OK" || echo "FAILED"
done

echo ""
echo "========================================="
