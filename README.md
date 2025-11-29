# TimeTracking App

Professionelle Progressive Web App (PWA) für Zeiterfassung mit Kunden- und Projektverwaltung, Ticketing, sevDesk-Integration und mehr.

## Features

### Zeiterfassung
- **Stoppuhr** - Live-Zeiterfassung mit Start/Stop/Pause
- **Manuelle Erfassung** - Nachträgliche Zeitbuchung
- **Kalender-Ansicht** - Wochenübersicht aller Zeiteinträge
- **Dashboard** - Statistiken und Auswertungen

### Finanzen / Billing
- **sevDesk-Integration** - Verbindung mit sevDesk API
- **Angebotserstellung** - Angebote direkt aus Zeiteinträgen erstellen
- **Rechnungsübersicht** - Dokumente aus sevDesk anzeigen
- **Kundenverknüpfung** - Kunden mit sevDesk-Kontakten verbinden

### Ticketing
- **Ticket-System** - Tickets erstellen und verwalten
- **Kundenbezug** - Tickets mit Kunden verknüpfen
- **Zeiterfassung** - Zeit direkt auf Tickets buchen
- **Status-Tracking** - Offen, In Bearbeitung, Erledigt

### Team-Funktionen
- **Mehrbenutzer** - Team-basiertes System
- **Berechtigungen** - Admin, User, Viewer Rollen
- **Freigaben** - Zeitnachweise zur Genehmigung

### Technisch
- **PWA** - Installierbar auf Mobilgeräten
- **Responsive** - Optimiert für Mobile und Desktop
- **Docker** - Einfaches Deployment

## Schnellstart

```bash
# Mit Docker Compose (empfohlen)
docker-compose up -d

# Oder lokal entwickeln
npm install
npm run dev
```

## Dokumentation

| Thema | Datei |
|-------|-------|
| **Schnellstart** | [docs/setup/QUICKSTART.md](docs/setup/QUICKSTART.md) |
| **Hetzner Deployment** | [docs/setup/DEPLOYMENT_HETZNER.md](docs/setup/DEPLOYMENT_HETZNER.md) |
| **Docker Setup** | [docs/setup/README_DOCKER.md](docs/setup/README_DOCKER.md) |
| **SSL Einrichtung** | [docs/setup/SSL_SETUP.md](docs/setup/SSL_SETUP.md) |
| **Roadmap** | [docs/features/ROADMAP.md](docs/features/ROADMAP.md) |
| **Troubleshooting** | [docs/troubleshooting/](docs/troubleshooting/) |

## Projektstruktur

```
timetracking_app/
├── src/                    # React Frontend
│   ├── components/         # UI Komponenten
│   ├── contexts/           # React Contexts
│   └── services/           # API Services
├── server/                 # Express Backend
│   ├── src/routes/         # API Endpoints
│   ├── src/services/       # Business Logic
│   └── src/config/         # Datenbank & Konfiguration
├── docs/                   # Dokumentation
│   ├── setup/              # Installation & Deployment
│   ├── features/           # Feature-Dokumentation
│   └── troubleshooting/    # Fehlerbehebung
├── scripts/                # Utility Scripts
└── nginx/                  # Nginx Konfiguration
```

## Technologie-Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, PostgreSQL
- **Deployment**: Docker, Nginx
- **Integrationen**: sevDesk API, NinjaRMM (in Entwicklung)

## Scripts

Nützliche Scripts im `scripts/` Ordner:

- `db-admin.sh` - Datenbank-Administration
- `setup-production.sh` - Produktions-Setup
- `rebuild-frontend.sh` - Frontend neu bauen

## Lizenz

Privates Projekt
