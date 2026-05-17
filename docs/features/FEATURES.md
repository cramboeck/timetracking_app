# Ramboflow - Vollständige Feature-Dokumentation

## Inhaltsverzeichnis

1. [Zeiterfassung](#zeiterfassung)
2. [Ticket-System](#ticket-system)
3. [Support Inbox](#support-inbox)
4. [Kundenportal](#kundenportal)
5. [Wissensdatenbank](#wissensdatenbank)
6. [Kunden & Projekte](#kunden--projekte)
7. [Angebote (Quotes)](#angebote-quotes)
8. [Finanzen / Billing](#finanzen--billing)
9. [Invoice Inbox (Rechnungseingang)](#invoice-inbox-rechnungseingang)
10. [Vendor Hub (Lieferanten)](#vendor-hub-lieferanten)
11. [Social Media Manager](#social-media-manager)
12. [Integrationen](#integrationen)
13. [Admin Portal](#admin-portal)
14. [Einstellungen & Personalisierung](#einstellungen--personalisierung)
15. [Sicherheit](#sicherheit)
16. [Offline Support](#offline-support)
17. [Tastenkürzel](#tastenkürzel)

---

## Zeiterfassung

### Stoppuhr (Timer)
- **Live-Timer** mit Start, Pause und Stop
- Automatische Speicherung bei Stop
- Timer läuft im Hintergrund weiter (PWA)
- Verknüpfung mit Kunde, Projekt und Aktivität
- Optional: Direkte Verknüpfung mit Ticket
- **SearchableSelect** - Type-to-Filter für schnelle Auswahl
- **Toast-Benachrichtigung** bei erfolgreicher Speicherung
- Loading-State und Feedback beim Stoppen

### Manuelle Zeiterfassung
- Nachträgliche Buchung von Zeiten
- Datum, Start- und Endzeit wählbar
- Beschreibung und Notizen
- **Non-billable Flag** - Zeiten als nicht abrechenbar markieren
- **Kundenfilter** - Projekte nach Kunde filtern
- Mobile-optimiertes Layout (Scroll zum Save-Button)
- Toast-Benachrichtigung bei Speicherung

### Kalender-Ansicht
- Wochenübersicht aller Zeiteinträge
- Farbliche Kodierung nach Kunde
- Drag & Drop zum Verschieben (geplant)
- Klick zum Bearbeiten

### Dashboard
- **Heute**: Aktuelle Arbeitszeit
- **Diese Woche**: Wochenstunden
- **Dieser Monat**: Monatsstunden
- Grafische Auswertungen
- Letzte Zeiteinträge
- **Projekt-Breakdown** mit Mobile-Optimierung
- Kunden-Stundensatz Fallback

### PDF-Reports
- Zeitnachweis pro Kunde/Projekt/Zeitraum
- Firmenlogo einbindbar
- Unterschriftsfeld
- Detaillierte Auflistung aller Einträge
- Summen und Gesamtbeträge
- **Lange Kundennamen** mit Zeilenumbruch/Truncation

### Zeitrundung
Einstellbare Rundungsintervalle:
- 1 Minute (keine Rundung)
- 5 Minuten
- 10 Minuten
- 15 Minuten
- 30 Minuten
- 60 Minuten

### Import
#### Clockodo Import
- **API-Import** (zusätzlich zu CSV)
- Deutsches Datumsformat (DD.MM.YYYY)
- Multiple Datumsformate unterstützt
- **Duplikat-Erkennung** in Vorschau
- 100% zuverlässige Duplikat-Verhinderung
- Default-Projekt pro Kunde als Fallback
- Password-Manager-Ignore für API-Felder

---

## Ticket-System

### Ticket-Verwaltung

#### Ansichten
| Ansicht | Beschreibung | Tastenkürzel |
|---------|--------------|--------------|
| Dashboard | Übersicht mit Statistiken | `g+d` |
| Liste | Alle Tickets mit Filter/Suche | `g+l` |
| Kanban | Drag & Drop Board | `g+k` |
| Aufgaben | Alle Tasks über alle Tickets | `g+t` |

#### Status-Workflow
```
Offen → In Bearbeitung → Wartend → Gelöst → Geschlossen
                                      ↓
                                  Archiviert
```

#### Prioritäten
- **Kritisch** (Rot) - Sofortige Bearbeitung
- **Hoch** (Orange) - Dringend
- **Normal** (Blau) - Standard
- **Niedrig** (Grau) - Bei Gelegenheit

### Ticket-Details

#### Grunddaten
- Ticket-Nummer (auto-generiert: TKT-000001)
- Titel und Beschreibung
- Kunde und Projekt
- Status und Priorität
- Erstellt/Aktualisiert Zeitstempel

#### Aufgaben (Tasks)
- Checklisten pro Ticket
- Drag & Drop Sortierung
- Checkbox zum Abhaken
- Sichtbarkeit für Kunden (optional)
- Fortschrittsanzeige (2/5 erledigt)

#### Lösungsdokumentation
Beim Schließen eines Tickets:
- **Pflicht**: Lösung beschreiben
- **Lösungstyp** wählen:
  - Gelöst
  - Nicht reproduzierbar
  - Duplikat
  - Wird nicht behoben
  - Hat sich erledigt
  - Workaround

#### Tags
- Farbige Tags zur Kategorisierung
- Eigene Tags erstellen
- Mehrere Tags pro Ticket
- Filter nach Tags

#### Dateianhänge
- Bilder (mit Vorschau)
- Dokumente (PDF, Word, Excel)
- Download-Links
- Löschen möglich

#### Kommentare
- Öffentliche Kommentare (für Kunde sichtbar)
- Interne Notizen (nur für Team)
- Zeitstempel und Autor
- E-Mail-Benachrichtigung an Kunde

#### Textbausteine (Canned Responses)
- Vordefinierte Antworten
- Template-Variablen:
  - `{{customer_name}}` - Kundenname
  - `{{ticket_number}}` - Ticketnummer
  - `{{ticket_title}}` - Titel
  - `{{current_date}}` - Aktuelles Datum
  - `{{status}}` - Status
- Nutzungsstatistik

### SLA-Management

#### First Response Time
- Zeit bis zur ersten Antwort
- Konfigurierbar pro Priorität
- Warnung bei drohender Überschreitung
- Markierung bei Breach

#### Resolution Time
- Zeit bis zur Lösung
- Konfigurierbar pro Priorität
- Pausiert bei Status "Wartend"
- SLA-Anzeige im Ticket

#### SLA-Policies
- Mehrere Policies möglich
- Zuweisung zu Kunden
- Standardzeiten:
  - Kritisch: 1h Response, 4h Resolution
  - Hoch: 4h Response, 8h Resolution
  - Normal: 8h Response, 24h Resolution
  - Niedrig: 24h Response, 72h Resolution

### Ticket-Merge
- Duplikate zusammenführen
- Kommentare werden übertragen
- Quell-Ticket wird geschlossen
- Verweis auf Ziel-Ticket

### Aktivitätsverlauf
Protokolliert alle Änderungen:
- Status-Änderungen
- Priorität-Änderungen
- Kommentare hinzugefügt
- Tags hinzugefügt/entfernt
- Zuweisungen
- Zeitbuchungen

### E-Mail-Benachrichtigungen
- Neues Ticket erstellt (an Admin)
- Neuer Kommentar (an Kunde)
- Status geändert (an Kunde)
- Konfigurierbar pro Benutzer

---

## Support Inbox

E-Mail-basiertes Ticket-Management über Microsoft 365 Integration.

### E-Mail-zu-Ticket-Konvertierung
- **Shared Mailbox** Unterstützung
- Automatische Ticket-Erstellung aus E-Mails
- E-Mail-Betreff wird Ticket-Titel
- E-Mail-Body wird Ticket-Beschreibung
- Anhänge werden übernommen

### Microsoft 365 Integration
- Azure Entra ID Authentifizierung
- Shared Mailbox Zugriff
- Automatische Mailbox-Überwachung
- Verbindungstest mit Debug-Logging

### Workflow
1. E-Mail kommt in Shared Mailbox an
2. System erkennt neue E-Mail
3. Ticket wird automatisch erstellt
4. Mitarbeiter bearbeitet Ticket
5. Antworten werden per E-Mail gesendet

---

## Kundenportal

Separates Portal für Kunden unter eigener URL (z.B. portal.example.com)

### Authentifizierung
- Login mit E-Mail und Passwort
- Passwort vergessen / Reset per E-Mail
- MFA/2FA mit Authenticator-App
- "Gerät vertrauen" für 30 Tage

### Ticket-Übersicht
- Alle eigenen Tickets einsehen
- Neues Ticket erstellen
- Nach Status filtern
- Sortierung nach Datum

### Ticket-Details
- Titel, Beschreibung, Status
- Kommentare lesen und schreiben
- Anhänge hochladen
- Sichtbare Tasks sehen

### Wissensdatenbank
- Öffentliche Kategorien durchsuchen
- Artikel lesen
- Suche über alle Artikel

### Profil
- Passwort ändern
- MFA aktivieren/deaktivieren
- Vertrauenswürdige Geräte verwalten

Siehe [CUSTOMER_PORTAL.md](CUSTOMER_PORTAL.md) für Details.

---

## Wissensdatenbank

### Kategorien
- Hierarchische Struktur
- Icons pro Kategorie
- Sortierung anpassbar
- Öffentlich/Intern markierbar

### Artikel
- Rich-Text Editor
- Formatierung (Überschriften, Listen, Code)
- Öffentlich oder nur intern
- Erstelldatum und Autor
- Zuletzt aktualisiert

### Integration
- Artikel aus Ticket-Lösung erstellen
- Artikel in Ticket verlinken
- Suche aus Ticket-Ansicht

---

## Kunden & Projekte

### Kundenverwaltung
- Name und Kontaktdaten
- Kundennummer (optional)
- Farbcode für Visualisierung
- E-Mail-Adresse
- Anschrift
- Stundensatz (optional)
- sevDesk-Verknüpfung (optional)
- NinjaRMM-Verknüpfung (optional)
- **Kundentyp** - Firma oder Einzelperson
- **Display-Name** und Import-Aliase
- **Default-Projekt** pro Kunde (für Imports)
- Reorganisiertes Modal mit Sektionen

### Kundenkontakte
- Mehrere Ansprechpartner pro Kunde
- Name, E-Mail, Telefon
- Portal-Zugang aktivierbar
- MFA-Status
- **Direktes Passwort-Setzen** (Admin-Funktion)

### Projektverwaltung
- Name und Beschreibung
- Kunde zuweisen
- Farbcode
- Aktiv/Inaktiv

### sevDesk Kunden-Import
- **Import-UI** mit Checkboxen
- Filter: Alle anzeigen oder nur nicht importierte
- **Ansprechpartner** (Sub-Contacts) importieren
- Kundentyp-Filter (nur Kunden, keine Lieferanten)
- Firma/Einzelperson Unterscheidung

---

## Angebote (Quotes)

### Angebotsverwaltung
- Angebote erstellen und bearbeiten
- Positionen mit Beschreibung und Preis
- Kundenzuordnung
- **KI-gestützte Positionsbeschreibungen**
- Validierung bei Erstellung

### KI-Features
- Automatische Positionsbeschreibung generieren
- Textvorschläge basierend auf Kontext
- Optimierung für professionelle Formulierung

---

## Finanzen / Billing

### sevDesk-Integration
- API-Token in Einstellungen
- Verbindungstest
- Kunden mit sevDesk-Kontakten verknüpfen

### Abrechenbare Zeiten
- Übersicht unbezahlter Zeiten
- Gruppiert nach Kunde
- Rechnung in sevDesk erstellen
- **Zeitraum-Filter** (Monat/Quartal/Jahr)
- **Quartals-Abrechnung**
- **Jahres-Abrechnung**
- Überlappende Abrechnungszeiträume erkennen
- Timezone-Korrektur für Datumsformatierung
- Stunden-Abgleich mit Dashboard

### Dokumentenübersicht
- Rechnungen aus sevDesk
- Angebote aus sevDesk
- Status und Beträge
- Dokumentenliste mit Sortierung

### Belege (Vouchers)
- **Belege-Tab** in Finanzen
- **Upload** von Bildern und PDFs
- Automatische sevDesk-Verknüpfung
- Vorschau und Download

---

## Invoice Inbox (Rechnungseingang)

Automatisierte Verarbeitung von Eingangsrechnungen per E-Mail.

### E-Mail-Integration
- **Shared Mailbox** für Rechnungen (Microsoft 365)
- Automatische PDF-Extraktion aus Anhängen
- E-Mail-Metadaten als Fallback

### OCR / Datenextraktion
- **OpenAI Vision** für Rechnungsdaten-Extraktion
- Automatische Erkennung von:
  - Rechnungsnummer
  - Datum
  - Betrag (Netto/Brutto)
  - Lieferant/Kreditor
- **Line Items Extraktion** für MSP-Weiterverrechnung
- Debug-Logging für Extraktion

### Workflow
1. E-Mail mit Rechnung kommt an
2. PDF wird extrahiert
3. **OCR** liest Rechnungsdaten
4. **Bestätigungsmodal** mit editierbaren Feldern
5. sevDesk-Beleg wird automatisch erstellt

### Status-Management
- **Draft-Status** für manuelle Prüfung
- Approved/Processed Status
- **Reprocess** - Bereits gelesene E-Mails neu verarbeiten
- **Revert** - Verarbeitete Rechnung zurücksetzen
- **Clear Failed** - Fehlgeschlagene Einträge löschen

### Dokument-Handling
- Download und Vorschau
- Mobile-optimierte Ansicht

---

## Vendor Hub (Lieferanten)

Zentrale Verwaltung von Lieferanten und Kreditoren.

### Lieferantenverwaltung
- Lieferanten-Übersicht
- Stammdaten verwalten
- Verknüpfung mit Rechnungen
- sevDesk-Integration

### Features
- Zentrale Lieferanten-Datenbank
- Historie aller Rechnungen pro Lieferant
- Schnellzugriff auf Kontaktdaten

---

## Social Media Manager

Komplettes Content-Management-System für Social Media Marketing.

### Content Calendar
- Kalenderansicht aller Posts
- **Edit-Modal** für schnelle Bearbeitung
- Status-Übersicht (Draft/Scheduled/Published)
- Multi-Plattform-Ansicht

### Content Studio

#### Content Wizard
- **KI-gestützte** Post-Generierung
- Themen-Auswahl
- Zielgruppen-Definition
- **Save & Schedule** Funktionalität

#### Post Editor
- Rich-Text-Bearbeitung
- **KI-Assistent** für Textoptimierung
- Medien-Upload
- Plattform-Vorschau

#### Batch Generator
- **Massenproduktion** von Posts
- Vorlagen-basierte Generierung
- Bulk-Scheduling

### Automation

#### Autopilot
- Automatisches Posting
- Zeitplan-Konfiguration
- Regelbasierte Veröffentlichung

#### Engagement Bot
- Automatische Interaktionen
- Kommentar-Vorschläge
- Engagement-Tracking

### Insights

#### Analytics
- Performance-Metriken
- Reichweiten-Analyse
- Engagement-Raten

#### Competitors
- Wettbewerber-Analyse
- Benchmark-Vergleiche

#### Trends
- Trend-Erkennung
- Hashtag-Analyse

### Library

#### Posts
- Alle Posts verwalten
- **Edit-Modal** für Bearbeitung
- Filter und Suche

#### Templates
- Wiederverwendbare Vorlagen
- Kategorie-basiert
- Schnell-Einfügung

#### Hashtags
- Hashtag-Sammlung
- Performance-Tracking
- Gruppen-Management

### Theme Selection Engine
- **Strategische Content-Empfehlungen**
- **Hook & CTA Formeln** - Bewährte Textmuster
- **Tonality Checking** - Stilprüfung
- **Platform Character Limits** - Zeichenbegrenzungen

### Qualitätssicherung
- **Auto-Improve** auf 90% Qualitätsziel
- **Self-Critique Quality Gate**
- Iterative Verbesserung

### Plattformen
- LinkedIn
- Instagram
- (Weitere geplant)

Siehe [social-media-system.md](/docs/social-media-system.md) für Details.

---

## Integrationen

### sevDesk
- API-Token Konfiguration
- Verbindungstest
- Kunden-Synchronisation
- Rechnungen und Angebote
- Belege-Upload
- **Kunden-Import** mit UI

### Clockodo
- **API-Import** von Zeiteinträgen
- CSV-Import als Alternative
- Duplikat-Erkennung
- Default-Projekt-Mapping

### Microsoft 365
- **Azure Entra ID** Authentifizierung
- **Mailbox-Monitoring** für Shared Mailboxes
- Invoice Mailbox Integration
- Support Mailbox Integration
- Verbindungstest mit Debug-Logging
- db-admin Diagnose-Befehle

Siehe [AZURE_SETUP.md](/docs/AZURE_SETUP.md) für Setup-Anleitung.

### NinjaRMM
- API-Konfiguration
- Verbindungstest
- Geräte-Übersicht
- Alert-Management
- Timestamp-Fix (1.1.1970 Bug behoben)

### OpenAI / KI
- Invoice OCR (Vision API)
- Content-Generierung (Social Media)
- Positionsbeschreibungen (Angebote)
- Auto-Improve für Texte

---

## Admin Portal

Dedizierte Administrationsoberfläche unter `/admin`.

### User Management
- Benutzer anlegen und verwalten
- Rollen zuweisen
- Passwörter zurücksetzen
- MFA-Status überwachen

### Audit Logs
- Sicherheits-Ereignisse protokollieren
- Login-Versuche
- Konfigurationsänderungen
- Daten-Änderungen

### Feature Management
- **Feature Flags** aktivieren/deaktivieren
- A/B-Testing Steuerung
- Beta-Features freischalten

### Backup Management
- Datenbank-Backups
- Export-Funktionen
- Wiederherstellung

### Organisationsverwaltung
- Multi-Tenant-Unterstützung
- Team-Einstellungen
- Billing-Informationen

---

## Einstellungen & Personalisierung

### Erscheinungsbild
- **Dark Mode**: Auto / Hell / Dunkel
- **Akzentfarbe**: Blau, Grün, Orange, Lila, Rot, Pink
- **Grautöne**: Hell, Mittel, Dunkel

### Zeiterfassung
- Zeitrundung (1-60 Min)
- Zeitformat (12h/24h)
- Standard-Aktivität

### Firmendaten
- Firmenname und Anschrift
- Logo hochladen
- Kontaktdaten
- Für Reports und E-Mails

### Benachrichtigungen
- E-Mail bei neuen Tickets
- E-Mail bei Kommentaren
- Push-Benachrichtigungen (PWA)

### Account-Typen
| Typ | Beschreibung |
|-----|--------------|
| Personal | Einzelbenutzer |
| Business | Erweiterte Features |
| Team | Mehrbenutzer mit Rollen |

---

## Sicherheit

### Benutzer-Authentifizierung
- JWT-basierte Sessions
- Sichere Passwort-Hashing (bcrypt)
- Session-Timeout konfigurierbar

### MFA/2FA
- TOTP mit Authenticator-Apps
- QR-Code zum Einrichten
- Backup-Codes (geplant)
- Aktivierung in Einstellungen

### Vertrauenswürdige Geräte
- Gerät für 30 Tage merken
- Browser und OS erkennung
- Geräteliste einsehen
- Einzelne Geräte entfernen

### Rate Limiting
- Login: 5 Versuche / 15 Min
- MFA: 5 Versuche / 15 Min
- API: 100 Requests / Min
- Schutz vor Brute-Force

### Audit-Logging
Protokolliert:
- Login-Versuche
- MFA-Aktivierung
- Passwort-Änderungen
- Geräte-Vertrauen

---

## Tastenkürzel

### Globale Navigation
| Kürzel | Aktion |
|--------|--------|
| `?` | Hilfe anzeigen |
| `Escape` | Zurück / Schließen |

### Ticket-Ansicht
| Kürzel | Aktion |
|--------|--------|
| `g+d` | Zum Dashboard |
| `g+l` | Zur Liste |
| `g+k` | Zum Kanban |
| `g+t` | Zu Aufgaben |
| `n` | Neues Ticket |
| `/` | Suche fokussieren |
| `r` | Aktualisieren |
| `j` / `↓` | Nächstes Ticket |
| `k` / `↑` | Vorheriges Ticket |
| `Enter` | Ticket öffnen |

---

## Datenbank-Schema (Übersicht)

### Haupttabellen
- `users` - Benutzerkonten
- `customers` - Kunden
- `customer_contacts` - Kundenkontakte
- `projects` - Projekte
- `time_entries` - Zeiteinträge
- `tickets` - Tickets
- `ticket_comments` - Kommentare
- `ticket_tasks` - Aufgaben
- `ticket_tags` - Tags
- `ticket_attachments` - Anhänge
- `sla_policies` - SLA-Richtlinien
- `kb_categories` - KB-Kategorien
- `kb_articles` - KB-Artikel

### Audit-Tabellen
- `ticket_activities` - Ticket-Historie
- `mfa_audit_log` - Sicherheits-Events
- `trusted_devices` - Vertrauenswürdige Geräte
- `invoices` - Eingangsrechnungen
- `vendors` - Lieferanten
- `social_media_*` - Social Media Tabellen

---

## Offline Support

PWA-basierte Offline-Funktionalität.

### LocalStorage
- Daten werden lokal gespeichert
- Schnellerer Zugriff bei wiederholten Besuchen
- Reduzierte Server-Last

### Auto-Sync
- **Automatische Synchronisation** bei Wiederverbindung
- Conflict Resolution
- Queue für ausstehende Änderungen

### Auth-Persistenz
- Login bleibt bei Netzwerkfehlern erhalten
- Verbesserte Netzwerkfehler-Erkennung
- Keine versehentlichen Logouts

### Offline-Banner
- Visuelle Anzeige des Offline-Status
- Automatische Aktualisierung bei Reconnect

---

*Zuletzt aktualisiert: Januar 2025*
