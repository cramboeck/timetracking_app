# Roadmap - Ramboflow

## Status-Legende
- [x] Fertig
- [ ] Geplant
- [~] In Arbeit

---

## Abgeschlossene Features

### Zeiterfassung
- [x] Live-Stoppuhr mit Start/Stop/Pause
- [x] Manuelle Zeiterfassung
- [x] Kalender-Wochenansicht
- [x] Dashboard mit Statistiken
- [x] PDF-Reports mit Logo (inkl. lange Kundennamen)
- [x] Zeitrundung (1-60 Min)
- [x] Zeitformat-Einstellung (12h/24h)
- [x] Non-billable Flag für nicht abrechenbare Zeiten
- [x] Kundenfilter in manueller Erfassung
- [x] SearchableSelect (Type-to-Filter) in Dropdowns
- [x] Toast-Benachrichtigung bei Speicherung
- [x] Mobile-optimierte Ansichten

### Ticket-System
- [x] Ticket-CRUD (Erstellen, Bearbeiten, Löschen)
- [x] Status-Workflow (Offen → Geschlossen)
- [x] Prioritäten (Kritisch, Hoch, Normal, Niedrig)
- [x] Ticket-Dashboard mit Statistiken
- [x] Ticket-Liste mit Suche und Filter
- [x] Kanban-Board mit Drag & Drop
- [x] Aufgabenübersicht über alle Tickets
- [x] Ticket-Tasks/Checklisten
- [x] Lösungsdokumentation beim Schließen
- [x] Lösungstypen (Gelöst, Nicht reproduzierbar, etc.)
- [x] SLA-Management (First Response, Resolution)
- [x] Tags und Kategorien
- [x] Textbausteine (Canned Responses)
- [x] Ticket-Merge
- [x] Dateianhänge
- [x] Kommentare (öffentlich/intern)
- [x] Aktivitätsverlauf
- [x] E-Mail-Benachrichtigungen
- [x] Keyboard Shortcuts

### Support Inbox (NEU)
- [x] E-Mail-Postfach für Support-Anfragen
- [x] E-Mail-zu-Ticket-Konvertierung
- [x] Microsoft 365 Mailbox-Integration

### Kundenportal
- [x] Separater Login für Kundenkontakte
- [x] Passwort-Reset per E-Mail
- [x] MFA/2FA mit TOTP
- [x] "Gerät vertrauen" Feature
- [x] Ticket-Übersicht für Kunden
- [x] Ticket erstellen aus Portal
- [x] Kommentare im Portal
- [x] Wissensdatenbank-Zugang
- [x] Profilverwaltung (Passwort, MFA)
- [x] Vertrauenswürdige Geräte verwalten
- [x] Direktes Passwort-Setzen für Kontakte (Admin)

### Wissensdatenbank
- [x] Kategorien mit Icons
- [x] Artikel-Editor
- [x] Öffentlich/Intern-Markierung
- [x] Integration in Kundenportal

### Sicherheit
- [x] JWT-Authentifizierung
- [x] MFA/2FA für Hauptanwendung
- [x] MFA/2FA für Kundenportal
- [x] Rate Limiting
- [x] Audit-Logging
- [x] Vertrauenswürdige Geräte
- [x] ErrorBoundary für Fehlerbehandlung

### Kunden & Projekte
- [x] Kundenverwaltung
- [x] Kundenkontakte mit Portal-Zugang
- [x] Projektverwaltung
- [x] Kundenspezifische Stundensätze
- [x] Kundentyp-Unterscheidung (Firma/Einzelperson)
- [x] Reorganisiertes Kunden-Modal mit Sektionen
- [x] Default-Projekt pro Kunde
- [x] Kunden-Displaynamen und Import-Aliase

### Angebote (Quotes) (NEU)
- [x] Angebote erstellen und bearbeiten
- [x] KI-gestützte Positionsbeschreibungen
- [x] Validierung bei Angebotserstellung

### sevDesk Integration
- [x] API-Token Konfiguration
- [x] Verbindungstest
- [x] Kunden mit sevDesk verknüpfen
- [x] Unbezahlte Zeiten anzeigen
- [x] **Kunden-Import UI** mit Checkboxen und Filter
- [x] Ansprechpartner (Sub-Contacts) importieren
- [x] Kundentyp-Filter (nur Kunden, keine Lieferanten)
- [x] **Belege-Upload** (Vouchers) mit Bild/PDF
- [x] Belege-Tab in Finanzen
- [x] Dokumentenliste mit Sortierung

### Clockodo Import (NEU)
- [x] **API-Import** (nicht nur CSV)
- [x] Deutsches Datumsformat (DD.MM.YYYY)
- [x] Multiple Datumsformate unterstützt
- [x] **Duplikat-Erkennung** in Vorschau
- [x] 100% zuverlässige Duplikat-Verhinderung
- [x] Default-Projekt pro Kunde als Fallback
- [x] Debug-Logging und API-Test-Script
- [x] Password-Manager-Ignore für Eingabefelder

### Rechnungseingang (Invoice Inbox) (NEU)
- [x] E-Mail-Postfach für Eingangsrechnungen
- [x] PDF-Anhänge automatisch extrahieren
- [x] **OpenAI Vision OCR** für Rechnungsdaten
- [x] Line Items Extraktion für MSP-Weiterverrechnung
- [x] Bestätigungsmodal mit editierbaren Feldern
- [x] sevDesk-Beleg automatisch erstellen
- [x] **Draft-Status** für manuelle Prüfung
- [x] Reprocess/Revert Funktionalität
- [x] Failed Entries löschen
- [x] Dokument-Download und Vorschau
- [x] Mobile-optimierte Ansicht

### Vendor Hub (Lieferanten) (NEU)
- [x] Zentrale Lieferantenverwaltung
- [x] Lieferanten-Übersicht
- [x] Verknüpfung mit Rechnungen

### Microsoft 365 Integration (NEU)
- [x] Konfiguration UI
- [x] Azure Entra ID Setup-Anleitung
- [x] **Mailbox-Monitoring** für Shared Mailboxes
- [x] Invoice Mailbox Support
- [x] Support Mailbox Support
- [x] Verbindungstest mit Debug-Logging
- [x] db-admin Diagnose-Befehle

### Admin Portal (NEU)
- [x] Dedizierte /admin Route
- [x] **User Management** (Benutzer verwalten)
- [x] **Audit Logs** (Sicherheits-Ereignisse)
- [x] **Feature Management** (Feature Flags)
- [x] **Backup Management**
- [x] Organisationsverwaltung

### Social Media Manager (NEU - Komplett)
- [x] **Modulare Feature-Architektur**
- [x] **Content Calendar** mit Edit-Modal
- [x] **Content Studio**
  - [x] Content Wizard mit KI-Generierung
  - [x] Post Editor mit KI-Assistent
  - [x] Batch Generator für Massenproduktion
  - [x] Save & Schedule Funktionalität
- [x] **Automation**
  - [x] Autopilot Tab
  - [x] Engagement Bot Tab
- [x] **Insights**
  - [x] Analytics Tab
  - [x] Competitors Tab
  - [x] Trends Tab
- [x] **Library**
  - [x] Posts Tab mit Edit-Modal
  - [x] Templates Tab
  - [x] Hashtags Tab
- [x] **Theme Selection Engine**
  - [x] Strategische Content-Empfehlungen
  - [x] Hook & CTA Formeln
  - [x] Tonality Checking
  - [x] Platform Character Limits
- [x] **Auto-Improve** auf 90% Qualitätsziel
- [x] Self-Critique Quality Gate
- [x] Multi-Plattform (LinkedIn, Instagram)
- [x] Umfassende Dokumentation

### Finanzen / Billing
- [x] Zeitraum-Filter (Monat/Quartal/Jahr)
- [x] Quartals-Abrechnung
- [x] Jahres-Abrechnung
- [x] Überlappende Abrechnungszeiträume erkennen
- [x] Timezone-Korrektur für Datumsformatierung
- [x] Stunden-Abgleich mit Dashboard

### Offline Support (NEU)
- [x] **LocalStorage** für Offline-Daten
- [x] **Auto-Sync** bei Wiederverbindung
- [x] Auth-Persistenz bei Netzwerkfehlern
- [x] Verbesserte Netzwerkfehler-Erkennung
- [x] Offline-Banner Anzeige

### Technisch
- [x] PWA (Progressive Web App)
- [x] Dark Mode
- [x] Responsive Design
- [x] Docker Deployment
- [x] SSL/Let's Encrypt
- [x] **API Refactoring** in modulare Services
- [x] **ErrorBoundary** für Fehlerbehandlung
- [x] **ARCHITECTURE.md** Dokumentation
- [x] Nginx Health-Check Endpoint

### NinjaRMM Integration
- [x] API-Konfiguration
- [x] Verbindungstest
- [x] Alert-Timestamp-Fix (1.1.1970 Bug)
- [x] Decimal Timestamp Migration

---

## Geplante Features

### Invoice Inbox Erweiterungen
- [ ] **Azure Document Intelligence** für Rechnungs-OCR
  - Spezialisiertes Invoice-Modell (höhere Genauigkeit)
  - Kein poppler/Canvas nötig
  - Line Items nativ extrahieren
  - Deutsche Rechnungen optimiert
- [ ] Weiterverrechnung: Positionen an Kunden zuordnen
- [ ] MSP-Rechnungen: Kundennamen aus Line Items matchen
- [ ] Automatische Rechnungserstellung für Endkunden

### sevDesk Integration (Erweiterung)
- [ ] Rechnungserstellung in sevDesk
- [ ] Zeiten als "abgerechnet" markieren
- [ ] Dokumenten-Synchronisation
- [ ] Angebote aus sevDesk anzeigen

### NinjaRMM Integration (Erweiterung)
- [ ] Systeme/Geräte pro Kunde importieren
- [ ] Gerätestatus live abfragen
- [ ] Alerts in Tickets umwandeln
- [ ] Remote-Zugriff aus Ticket starten

### Ticket-System Erweiterungen
- [ ] SLA-Eskalation per E-Mail/Push
- [ ] Ticket-Vorlagen pro Kategorie
- [ ] Automatische Ticket-Zuweisung
- [ ] Kundenzufriedenheits-Umfrage
- [ ] Wiederkehrende Tickets

### Zeiterfassung Erweiterungen
- [ ] Arbeitszeiten-Zuschläge (Wochenende, Nacht)
- [ ] Überstunden-Tracking
- [ ] Feiertags-Kalender
- [ ] Drag & Drop im Kalender

### KI-Features
- [ ] Intelligente Angebotserstellung (erweitert)
- [ ] Textverbesserung für Beschreibungen
- [ ] Ticket-Kategorisierung
- [ ] Ähnliche Tickets finden

### Dashboard & Reporting
- [ ] Umsatz-Prognose
- [ ] Auslastungs-Übersicht
- [ ] Projektrentabilität
- [ ] Export für Steuerberater

### Team-Features
- [ ] Team-Kalender
- [ ] Ressourcenplanung
- [ ] Abwesenheitsverwaltung

### CRM - Kunden-/Lieferanten-360°-Ansicht
- [ ] **E-Mail-Historie pro Kunde/Lieferant**
  - Microsoft 365 E-Mails synchronisieren
  - Eingehend + Ausgehend anzeigen
  - Nach Absender/Empfänger filtern
  - Volltextsuche in E-Mails
  - E-Mails direkt aus App versenden
- [ ] **Dokumente pro Kunde/Lieferant**
  - Beliebige Dateien hochladen (PDF, Word, Excel)
  - Kategorien (Vertrag, Angebot, Dokumentation, Sonstiges)
  - Versionierung bei Änderungen
  - sevDesk-Dokumente automatisch verknüpfen
- [ ] **Unified Timeline / Aktivitätsverlauf**
  - Alle Interaktionen chronologisch
  - Tickets, E-Mails, Anrufe, Notizen
  - Dokumente hochgeladen
  - Rechnungen/Angebote erstellt
  - Filter nach Aktivitätstyp
- [ ] **Kontakt-Erweiterungen**
  - Rollen (Entscheider, Technisch, Buchhaltung)
  - Kommunikationspräferenzen
  - Notizen pro Kontakt
- [ ] **Quick Actions**
  - Schnell-Notiz hinzufügen
  - Anruf protokollieren
  - E-Mail direkt senden
  - Ticket erstellen

---

## Changelog

### Januar 2025 (PR #42 - Major Release)

#### Neue Module
- **Social Media Manager** - Komplettes Content-Management-System
  - Content Calendar, Studio, Automation, Insights, Library
  - Theme Selection Engine mit KI-gestützter Strategie
  - Auto-Improve auf 90% Qualitätsziel
- **Invoice Inbox** - E-Mail-basierter Rechnungseingang
  - OpenAI Vision OCR für Rechnungsdaten
  - Line Items Extraktion für MSP-Weiterverrechnung
  - sevDesk-Beleg automatisch erstellen
  - Draft-Status für manuelle Prüfung
- **Support Inbox** - E-Mail-zu-Ticket-Konvertierung
- **Vendor Hub** - Zentrale Lieferantenverwaltung
- **Admin Portal** - User Management, Audit Logs, Feature Flags
- **Microsoft 365 Integration** - Mailbox-Monitoring, Entra ID

#### Clockodo Import
- API-Import (nicht nur CSV)
- Duplikat-Erkennung in Vorschau
- Default-Projekt pro Kunde als Fallback
- Multiple Datumsformate unterstützt

#### sevDesk Integration
- Kunden-Import UI mit Checkboxen und Filter
- Ansprechpartner (Sub-Contacts) importieren
- Belege-Upload (Vouchers) mit Bild/PDF
- Kundentyp-Filter (nur Kunden, keine Lieferanten)

#### Angebote (Quotes)
- Angebote erstellen und bearbeiten
- KI-gestützte Positionsbeschreibungen

#### UI/UX Verbesserungen
- SearchableSelect (Type-to-Filter) in Dropdowns
- Toast-Benachrichtigungen
- Mobile-Optimierungen (ManualEntry, Dashboard, TimeEntriesList)
- Kundenfilter in manueller Erfassung

#### Finanzen / Billing
- Zeitraum-Filter (Monat/Quartal/Jahr)
- Quartals- und Jahres-Abrechnung
- Überlappende Abrechnungszeiträume erkennen
- Timezone-Korrektur für Datumsformatierung

#### Offline Support
- LocalStorage für Offline-Daten
- Auto-Sync bei Wiederverbindung
- Auth-Persistenz bei Netzwerkfehlern

#### Technisch
- API Refactoring in modulare Services
- ErrorBoundary für Fehlerbehandlung
- ARCHITECTURE.md Dokumentation
- Nginx Health-Check Endpoint
- NinjaRMM Alert-Timestamp-Fix (1.1.1970 Bug)

### Dezember 2024
- Ticket-Tasks mit Drag & Drop
- Lösungsdokumentation beim Schließen
- Kanban-Board für Tickets
- Aufgabenübersicht über alle Tickets
- MFA im Kundenportal
- "Gerät vertrauen" Feature
- Docker Volume-Fix für Production
- Dokumentation aktualisiert

### November 2024
- SLA-Management implementiert
- Kundenportal Basis
- sevDesk Integration Basis
- Textbausteine
- Ticket-Merge
- Aktivitätsverlauf

### Oktober 2024
- Wissensdatenbank
- E-Mail-Benachrichtigungen
- Ticket-Tags
- Dateianhänge
- MFA für Hauptanwendung

### September 2024
- Ticket-System Basis
- PDF-Reports
- Dashboard-Statistiken
- Dark Mode

### August 2024
- Initiale Version
- Zeiterfassung
- Kunden & Projekte
- PWA Setup

---

*Zuletzt aktualisiert: Januar 2025*
