# Ramboflow - Zeiterfassung & Ticketing

Professionelle Progressive Web App (PWA) für Zeiterfassung, Ticketing und Kundenverwaltung mit Kundenportal, sevDesk-Integration und mehr.

## Hauptfunktionen

### Zeiterfassung
- **Live-Stoppuhr** - Start/Stop/Pause mit Echtzeitanzeige
- **Manuelle Erfassung** - Nachträgliche Zeitbuchung
- **Kalender-Ansicht** - Wochenübersicht aller Zeiteinträge
- **Dashboard** - Statistiken, Tages-/Wochen-/Monatsübersicht
- **Zeitrundung** - Konfigurierbare Rundungsintervalle (1/5/10/15/30/60 Min)
- **PDF-Reports** - Detaillierte Berichte mit Logo und Unterschrift

### Ticket-System
- **Ticket-Verwaltung** - Erstellen, bearbeiten, zuweisen
- **Kanban-Board** - Drag & Drop Statusänderung
- **Aufgaben/Tasks** - Checklisten pro Ticket mit Drag & Drop
- **Lösungsdokumentation** - Pflichtfeld beim Schließen mit Lösungstyp
- **SLA-Management** - First Response & Resolution Time Tracking
- **Tags & Kategorien** - Farbige Tags zur Organisation
- **Textbausteine** - Canned Responses für häufige Antworten
- **Ticket-Merge** - Duplikate zusammenführen
- **Dateianhänge** - Bilder und Dokumente hochladen
- **Aktivitätsverlauf** - Vollständige Historie aller Änderungen
- **E-Mail-Benachrichtigungen** - Bei neuen Tickets und Kommentaren

### Kundenportal
- **Separater Login** - Kunden-Authentifizierung mit E-Mail
- **MFA/2FA** - TOTP-basierte Zwei-Faktor-Authentifizierung
- **Gerät vertrauen** - 30 Tage ohne erneute MFA-Abfrage
- **Ticket-Übersicht** - Eigene Tickets einsehen und erstellen
- **Kommentare** - Kommunikation direkt im Portal
- **Wissensdatenbank** - Öffentliche Artikel einsehen
- **Profilverwaltung** - Passwort und MFA-Einstellungen

### Wissensdatenbank (Knowledge Base)
- **Kategorien** - Strukturierte Artikelorganisation
- **Artikel-Editor** - Rich-Text mit Formatierung
- **Öffentlich/Intern** - Sichtbarkeit pro Artikel/Kategorie
- **Ticket-Verknüpfung** - Artikel aus Tickets erstellen
- **Suche** - Volltextsuche über alle Artikel

### Kunden & Projekte
- **Kundenverwaltung** - Kontaktdaten, Farbcodes
- **Kundenkontakte** - Mehrere Ansprechpartner pro Kunde
- **Projektverwaltung** - Projekte mit Kunden verknüpfen
- **Stundensätze** - Kundenspezifische Preise

### Finanzen / Billing
- **sevDesk-Integration** - API-Anbindung
- **Rechnungserstellung** - Aus Zeiteinträgen generieren
- **Dokumentenübersicht** - Angebote und Rechnungen
- **Kundenverknüpfung** - Mit sevDesk-Kontakten synchronisieren

### Team-Funktionen
- **Mehrbenutzer-System** - Separate Datenbereiche
- **Team-Accounts** - Owner, Admin, Member Rollen
- **Einladungs-Links** - Team-Mitglieder einladen

### Sicherheit
- **MFA/2FA** - TOTP mit Authenticator-Apps
- **Vertrauenswürdige Geräte** - Mit Geräteerkennung
- **Rate Limiting** - Schutz vor Brute-Force
- **Audit-Logging** - Sicherheitsrelevante Ereignisse

### Technisch
- **PWA** - Installierbar auf allen Geräten
- **Dark Mode** - Automatisch oder manuell
- **Responsive Design** - Mobile-first
- **Keyboard Shortcuts** - Schnelle Navigation
- **Docker Deployment** - Production-ready

## Schnellstart

```bash
# Mit Docker Compose (empfohlen)
docker compose -f docker-compose.production.yml up -d

# Oder lokal entwickeln
npm install
npm run dev
```

## Dokumentation

| Thema | Datei |
|-------|-------|
| **Feature-Übersicht** | [docs/features/FEATURES.md](docs/features/FEATURES.md) |
| **Kundenportal** | [docs/features/CUSTOMER_PORTAL.md](docs/features/CUSTOMER_PORTAL.md) |
| **Schnellstart** | [docs/setup/QUICKSTART.md](docs/setup/QUICKSTART.md) |
| **Hetzner Deployment** | [docs/setup/DEPLOYMENT_HETZNER.md](docs/setup/DEPLOYMENT_HETZNER.md) |
| **Docker Setup** | [docs/setup/README_DOCKER.md](docs/setup/README_DOCKER.md) |
| **SSL Einrichtung** | [docs/setup/SSL_SETUP.md](docs/setup/SSL_SETUP.md) |
| **E-Mail Setup** | [docs/setup/EMAIL_SETUP_SENDGRID.md](docs/setup/EMAIL_SETUP_SENDGRID.md) |
| **Roadmap** | [docs/features/ROADMAP.md](docs/features/ROADMAP.md) |

## Projektstruktur

```
ramboflow/
├── src/                    # React Frontend
│   ├── components/         # UI Komponenten
│   ├── contexts/           # React Contexts (Auth, Theme)
│   ├── hooks/              # Custom Hooks
│   └── services/           # API Services
├── server/                 # Express Backend
│   ├── src/routes/         # API Endpoints
│   ├── src/services/       # Business Logic (E-Mail, Push)
│   └── src/config/         # Datenbank & Konfiguration
├── docs/                   # Dokumentation
│   ├── setup/              # Installation & Deployment
│   ├── features/           # Feature-Dokumentation
│   └── troubleshooting/    # Fehlerbehebung
├── scripts/                # Utility Scripts
└── nginx/                  # Nginx Konfiguration
```

## Technologie-Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Datenbank | PostgreSQL |
| Auth | JWT, TOTP (speakeasy) |
| E-Mail | SendGrid API |
| Deployment | Docker, Nginx, Let's Encrypt |
| Integrationen | sevDesk API, NinjaRMM (geplant) |

## Scripts

```bash
# Datenbank-Administration
./scripts/db-admin.sh

# Volume Setup (einmalig vor erstem Start)
sudo ./scripts/setup-volumes.sh

# Frontend neu bauen
./scripts/rebuild-frontend.sh
```

## Umgebungsvariablen

Siehe `.env.example` für alle verfügbaren Variablen:

```env
# Datenbank
DB_HOST=localhost
DB_USER=timetracking
DB_PASSWORD=secret
DB_NAME=timetracking

# JWT
JWT_SECRET=your-secret-key

# E-Mail (SendGrid)
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@example.com

# sevDesk (optional)
SEVDESK_API_TOKEN=xxx

# URLs
FRONTEND_URL=https://app.example.com
PORTAL_URL=https://portal.example.com
```

## Lizenz

Privates Projekt - Alle Rechte vorbehalten
