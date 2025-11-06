# Zeiterfassungs-App

Professionelle Progressive Web App (PWA) für Zeiterfassung mit Kunden- und Projektverwaltung, Stundensätzen und automatischem Export.

## Features

### Zeiterfassung
- ⏱️ **Stoppuhr** - Live-Zeiterfassung mit Start/Stop/Pause
- ✍️ **Manuelle Erfassung** - Nachträgliche Zeitbuchung mit Datum/Uhrzeit
- ✏️ **Bearbeiten** - Zeiteinträge nachträglich anpassen
- 📊 **Übersicht** - Alle Zeiteinträge gruppiert nach Datum mit Gesamtzeit

### Verwaltung
- 👥 **Kundenverwaltung** - Kunden mit individuellen Farben anlegen
- 📁 **Projektverwaltung** - Projekte mit Kundenzuordnung und Stundensätzen
- 💰 **Stundensätze** - Pro Projekt definierbar
- 🎨 **Farbcodierung** - Visuelle Unterscheidung der Kunden

### Export & Reports
- 📥 **CSV Export** - Vollständiger Export mit Stundensätzen und Beträgen
- 📈 **Automatische Berechnung** - Zeit × Stundensatz = Betrag

### Technisch
- 💾 **Offline-Speicherung** - Alle Daten werden lokal gespeichert
- 📱 **Responsive Design** - Optimiert für Mobile und Desktop
- 🚀 **PWA** - Installierbar wie eine native App
- ⚡ **Moderne UI** - Mit Modals, Bestätigungsdialogen und Touch-Optimierung

## Installation & Start

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev

# Production Build erstellen
npm run build

# Preview des Production Builds
npm run preview
```

## Technologie-Stack

- **React 18** - UI Framework
- **TypeScript** - Typsicherheit
- **Vite** - Build Tool
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Vite PWA** - Progressive Web App Funktionalität

## Nutzung auf dem Handy

1. Öffne die App im Browser (z.B. Chrome oder Safari)
2. Wähle "Zum Startbildschirm hinzufügen"
3. Die App läuft jetzt wie eine native App

## Workflow

1. **Einstellungen** - Füge Kunden und Projekte mit Stundensätzen hinzu
2. **Stoppuhr** - Wähle ein Projekt und starte die Zeiterfassung
3. **Übersicht** - Sieh alle erfassten Zeiten, bearbeite oder lösche Einträge
4. **Export** - Exportiere als CSV für Excel/Buchhaltung

## Geplante Features (Phase 2)

- 📄 Automatische PDF-Stundennachweise
- 🔌 sevDesk/Papierkram API-Integration
- 📊 Dashboard mit Statistiken und Charts
- ☁️ Cloud-Synchronisierung (Azure Backend)
- 📅 Kalender-Ansicht
- 🔔 Erinnerungen
- 🏷️ Tags und Kategorien
