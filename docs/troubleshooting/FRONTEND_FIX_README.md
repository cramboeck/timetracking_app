# Frontend Startup Fix für Hetzner

## 🔴 Problem

Der Frontend-Container wird als "unhealthy" markiert und startet nicht korrekt:

```
✘ Container ramboflow-frontend  Error
dependency failed to start: container ramboflow-frontend is unhealthy
```

## ✅ Ursache

Das Problem lag im Dockerfile. Der nginx-Container lief als non-root User (`USER nginx`), aber die notwendigen Verzeichnisse und der PID-File-Pfad waren nicht korrekt für non-root Betrieb konfiguriert.

### Spezifische Probleme:

1. **PID-File**: Nginx versuchte `/var/run/nginx.pid` zu schreiben, aber der nginx-User hatte keine Schreibrechte
2. **Cache-Verzeichnisse**: Fehlende nginx Cache-Verzeichnisse mit korrekten Berechtigungen
3. **Permissions**: Unvollständige Berechtigungen für /var/cache/nginx und /var/log/nginx

## 🔧 Lösung

Das Dockerfile wurde angepasst:

1. ✅ Alle nginx Cache-Verzeichnisse werden erstellt
2. ✅ Korrekte Berechtigungen für den nginx-User gesetzt
3. ✅ PID-File nach `/tmp/nginx.pid` verschoben (beschreibbar für non-root)
4. ✅ Health-Check Start-Period erhöht (mehr Zeit zum Starten)

## 🚀 So wendest du den Fix an

### Option 1: Automatisches Rebuild (Empfohlen)

```bash
# 1. Neueste Änderungen pullen
git pull origin claude/fix-hetzner-server-startup-011CUzxCenEts8ueuBzcBqDe

# 2. Rebuild-Script ausführen
./rebuild-frontend.sh
```

Das Script wird automatisch:
- Alte Container stoppen
- Frontend-Image neu bauen (ohne Cache)
- Alle Services in der richtigen Reihenfolge starten
- Health-Checks durchführen

### Option 2: Manuelle Schritte

```bash
# 1. Neueste Änderungen pullen
git pull origin claude/fix-hetzner-server-startup-011CUzxCenEts8ueuBzcBqDe

# 2. Container stoppen
docker compose -f docker-compose.production.yml down

# 3. Frontend neu bauen (ohne Cache)
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache frontend

# 4. Alle Services starten
docker compose --env-file .env.production -f docker-compose.production.yml up -d

# 5. Logs ansehen
docker compose -f docker-compose.production.yml logs -f
```

## 📊 Nach dem Fix prüfen

### Container Status

```bash
docker ps --filter "name=ramboflow"
```

Erwartetes Ergebnis:
```
ramboflow-frontend   Up X minutes (healthy)
ramboflow-backend    Up X minutes (healthy)
ramboflow-db         Up X minutes (healthy)
ramboflow-nginx      Up X minutes
```

### Health Checks

```bash
# Frontend Health
docker inspect ramboflow-frontend --format='{{.State.Health.Status}}'
# Sollte: healthy

# Backend Health
curl https://deine-domain.de/health
# Sollte: {"status":"ok",...}

# Frontend erreichbar
curl https://deine-domain.de
# Sollte: HTML-Seite
```

## 🛠️ Troubleshooting

Wenn es immer noch nicht funktioniert:

### 1. Diagnose ausführen

```bash
./diagnose-frontend-logs.sh
```

Das Script zeigt detaillierte Informationen über:
- Container Status
- Logs
- Health-Check Ergebnisse
- Nginx-Konfiguration
- Dateiberechtigungen

### 2. Frontend-Logs ansehen

```bash
docker logs ramboflow-frontend
```

Achte auf Fehler wie:
- `nginx: [emerg] open() "/var/run/nginx.pid" failed`
- `Permission denied`
- `bind() to 0.0.0.0:8080 failed`

### 3. In Container einsteigen

```bash
docker exec -it ramboflow-frontend sh

# Im Container:
nginx -t              # Test nginx config
ps aux                # Check ob nginx läuft
ls -la /tmp/nginx.pid # Check PID-File
```

## 📝 Geänderte Dateien

- ✅ `Dockerfile` - Nginx non-root Konfiguration gefixt
- ✅ `rebuild-frontend.sh` - Automatisches Rebuild-Script
- ✅ `diagnose-frontend-logs.sh` - Diagnose-Tool
- ✅ `TROUBLESHOOTING_FRONTEND.md` - Umfassendes Troubleshooting-Handbuch
- ✅ `fix-hetzner-startup.sh` - Allgemeines Setup-Fix-Script

## ⚡ Quick Fix Command

Wenn du es eilig hast:

```bash
git pull && ./rebuild-frontend.sh
```

## 🎯 Erwartetes Ergebnis

Nach dem Fix solltest du sehen:

```
✔ Container ramboflow-db         Healthy
✔ Container ramboflow-backend    Healthy
✔ Container ramboflow-frontend   Healthy
✔ Container ramboflow-nginx      Started
```

Und deine App ist erreichbar unter: `https://deine-domain.de`

## 📚 Weitere Hilfe

- **Allgemeines Troubleshooting**: `TROUBLESHOOTING_FRONTEND.md`
- **Deployment-Guide**: `DEPLOYMENT_HETZNER.md`
- **Docker-Dokumentation**: `README_DOCKER.md`
- **GitHub Issues**: https://github.com/cramboeck/timetracking_app/issues

---

**Fix erstellt am**: 2024-11-10
**Branch**: `claude/fix-hetzner-server-startup-011CUzxCenEts8ueuBzcBqDe`
