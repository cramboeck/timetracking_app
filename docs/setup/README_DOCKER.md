# 🐳 Docker Setup - TimeTracking App

Diese Anleitung zeigt dir, wie du die TimeTracking App mit Docker lokal entwickeln kannst.

## 📋 Voraussetzungen

- **Docker Desktop** installiert ([Download](https://www.docker.com/products/docker-desktop/))
- **Git** installiert
- Mindestens **4 GB RAM** frei

## 🏗️ Architektur

Das Setup besteht aus 3 Services:

```
┌─────────────────────────────────────────────┐
│  Frontend (React + Vite)                    │
│  Port: 5173 (dev) / 8080 (prod)            │
└─────────────────┬───────────────────────────┘
                  │
                  │ API Calls
                  ▼
┌─────────────────────────────────────────────┐
│  Backend (Express + TypeScript)             │
│  Port: 3001                                 │
└─────────────────┬───────────────────────────┘
                  │
                  │ SQL Queries
                  ▼
┌─────────────────────────────────────────────┐
│  PostgreSQL Database                        │
│  Port: 5432                                 │
└─────────────────────────────────────────────┘
```

## 🚀 Schnellstart

### Option 1: Entwicklungsmodus (mit Hot-Reload) - EMPFOHLEN

```bash
# 1. Repository klonen (falls noch nicht geschehen)
git clone <your-repo-url>
cd timetracking_app

# 2. Environment Datei erstellen
cp .env.docker.example .env.docker

# 3. Environment Datei bearbeiten (optional für Entwicklung)
# Die Standardwerte funktionieren bereits!

# 4. Alles starten
docker-compose -f docker-compose.dev.yml up

# Oder im Hintergrund:
docker-compose -f docker-compose.dev.yml up -d
```

**Das war's!** 🎉

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Backend Health:** http://localhost:3001/health
- **Datenbank:** localhost:5432

### Option 2: Produktionsmodus (gebaut)

```bash
# 1. Environment Datei erstellen (falls nicht vorhanden)
cp .env.docker.example .env.docker

# 2. Alles starten
docker-compose up

# Oder im Hintergrund:
docker-compose up -d
```

- **Frontend:** http://localhost:8080
- **Backend API:** http://localhost:3001
- **Datenbank:** localhost:5432

## 📝 Wichtige Befehle

### Services starten

```bash
# Entwicklungsmodus
docker-compose -f docker-compose.dev.yml up

# Produktionsmodus
docker-compose up

# Im Hintergrund starten
docker-compose -f docker-compose.dev.yml up -d
```

### Services stoppen

```bash
# Entwicklungsmodus
docker-compose -f docker-compose.dev.yml down

# Produktionsmodus
docker-compose down

# Mit Volumes löschen (Datenbank wird gelöscht!)
docker-compose down -v
```

### Logs anschauen

```bash
# Alle Services
docker-compose -f docker-compose.dev.yml logs -f

# Nur Backend
docker-compose -f docker-compose.dev.yml logs -f backend

# Nur Frontend
docker-compose -f docker-compose.dev.yml logs -f frontend

# Nur Datenbank
docker-compose -f docker-compose.dev.yml logs -f database
```

### Services neu bauen

```bash
# Entwicklungsmodus
docker-compose -f docker-compose.dev.yml build

# Produktionsmodus
docker-compose build

# Neu bauen und starten
docker-compose -f docker-compose.dev.yml up --build
```

### In einen Container einsteigen

```bash
# Backend
docker exec -it timetracking-backend-dev sh

# Frontend
docker exec -it timetracking-frontend-dev sh

# Datenbank
docker exec -it timetracking-db-dev psql -U timetracking -d timetracking
```

## 🔧 Entwicklung

### Hot-Reload

Im Entwicklungsmodus (`docker-compose.dev.yml`) werden deine Änderungen automatisch erkannt:

- **Frontend:** Änderungen in `src/` werden sofort im Browser sichtbar
- **Backend:** Änderungen in `server/src/` starten den Server automatisch neu
- **Datenbank:** Daten bleiben in einem Volume erhalten

### Code bearbeiten

Bearbeite den Code normal in deinem Editor:
- Frontend: `src/`
- Backend: `server/src/`

Die Container erkennen Änderungen automatisch!

### Datenbank zurücksetzen

```bash
# Stoppe Services und lösche Volumes
docker-compose -f docker-compose.dev.yml down -v

# Starte neu
docker-compose -f docker-compose.dev.yml up
```

### Admin-User erstellen

```bash
# 1. In Backend Container einsteigen
docker exec -it timetracking-backend-dev sh

# 2. Admin Script ausführen
npm run admin:create

# 3. Folge den Anweisungen
```

## 🔍 Troubleshooting

### Port bereits belegt

**Fehler:** `Bind for 0.0.0.0:5432 failed: port is already allocated`

**Lösung:** Ein anderer Service nutzt bereits den Port.

```bash
# Finde den Prozess (Linux/Mac)
lsof -i :5432

# Finde den Prozess (Windows)
netstat -ano | findstr :5432

# Stoppe den Prozess oder ändere den Port in docker-compose
```

### Container startet nicht

```bash
# Logs checken
docker-compose -f docker-compose.dev.yml logs

# Status checken
docker-compose -f docker-compose.dev.yml ps

# Alles neu bauen
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up
```

### Datenbank-Verbindung schlägt fehl

**Warte ~10 Sekunden** nach dem Start. Die Datenbank braucht Zeit zum Initialisieren.

```bash
# Health Check der Datenbank
docker exec timetracking-db-dev pg_isready -U timetracking
```

### Frontend zeigt keine Daten

**Prüfe:**

1. **Backend läuft:**
   ```bash
   curl http://localhost:3001/health
   # Sollte: {"status":"ok", ...}
   ```

2. **Frontend nutzt richtige API URL:**
   - DevTools öffnen (F12) → Network Tab
   - Requests sollten zu `http://localhost:3001/api/...` gehen

3. **CORS-Fehler in Console?**
   - Backend `FRONTEND_URL` prüfen in `docker-compose.dev.yml`

### TypeScript Errors im Container

```bash
# Backend neu bauen
docker-compose -f docker-compose.dev.yml build backend

# Oder komplett neu
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build
```

### Alle Container löschen und neu starten

```bash
# ACHTUNG: Löscht ALLE Daten!
docker-compose -f docker-compose.dev.yml down -v
docker system prune -a
docker-compose -f docker-compose.dev.yml up --build
```

## 📊 Datenbank direkt nutzen

### Mit psql (im Container)

```bash
# In Datenbank Container einsteigen
docker exec -it timetracking-db-dev psql -U timetracking -d timetracking

# Nützliche SQL Befehle:
\dt              # Alle Tabellen anzeigen
\d users         # users Tabelle beschreiben
SELECT * FROM users;
\q               # Beenden
```

### Mit externem Tool (DBeaver, pgAdmin, etc.)

**Connection Details:**
- Host: `localhost`
- Port: `5432`
- Database: `timetracking`
- User: `timetracking`
- Password: (siehe `.env.docker` Datei)

## 🎯 Unterschiede Dev vs. Production

| Feature | Development | Production |
|---------|-------------|------------|
| **Frontend Port** | 5173 | 8080 |
| **Frontend Server** | Vite Dev Server | Nginx |
| **Backend Hot-Reload** | ✅ Ja | ❌ Nein |
| **Frontend Hot-Reload** | ✅ Ja | ❌ Nein |
| **Build Optimization** | ❌ Nein | ✅ Ja |
| **Container Size** | Größer | Kleiner |
| **Start Time** | Schnell | Langsamer (wegen Build) |
| **Use Case** | Entwicklung | Testen, Deployment |

## 🚀 Nächste Schritte

### Bereit für Production auf Hetzner?

Wenn deine App fertig entwickelt ist:

1. **Domain kaufen** (z.B. bei Namecheap, CloudFlare)
2. **Hetzner VPS erstellen** (€4.51/Monat)
3. **Docker auf VPS installieren**
4. **Code auf VPS deployen:**

```bash
# Auf VPS
git clone <your-repo>
cd timetracking_app

# Environment für Production
cp .env.docker.example .env.docker
nano .env.docker  # Sichere Passwörter setzen!

# Production starten
docker-compose up -d

# Nginx Reverse Proxy mit SSL
# (Separate Anleitung kommt bei Bedarf)
```

## 📚 Weitere Ressourcen

- [Docker Docs](https://docs.docker.com/)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

## 🆘 Hilfe benötigt?

Bei Problemen:

1. **Logs checken:** `docker-compose logs`
2. **Status checken:** `docker-compose ps`
3. **Health Checks:**
   - http://localhost:3001/health (Backend)
   - http://localhost:8080/health (Frontend in Production)
4. **Container neu starten:** `docker-compose restart <service>`

---

## ⚡ Cheat Sheet

```bash
# Starten (Dev)
docker-compose -f docker-compose.dev.yml up -d

# Stoppen
docker-compose -f docker-compose.dev.yml down

# Logs live
docker-compose -f docker-compose.dev.yml logs -f

# Neu bauen
docker-compose -f docker-compose.dev.yml up --build

# Alles löschen
docker-compose -f docker-compose.dev.yml down -v

# In Backend
docker exec -it timetracking-backend-dev sh

# In DB
docker exec -it timetracking-db-dev psql -U timetracking -d timetracking
```

---

**Viel Erfolg mit der Entwicklung! 🚀**
