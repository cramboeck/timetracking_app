# Ramboflow - Vollständige Feature-Dokumentation

## Inhaltsverzeichnis

1. [Zeiterfassung](#zeiterfassung)
2. [Ticket-System](#ticket-system)
3. [Kundenportal](#kundenportal)
4. [Wissensdatenbank](#wissensdatenbank)
5. [Kunden & Projekte](#kunden--projekte)
6. [Finanzen / Billing](#finanzen--billing)
7. [Einstellungen & Personalisierung](#einstellungen--personalisierung)
8. [Sicherheit](#sicherheit)
9. [Tastenkürzel](#tastenkürzel)

---

## Zeiterfassung

### Stoppuhr (Timer)
- **Live-Timer** mit Start, Pause und Stop
- Automatische Speicherung bei Stop
- Timer läuft im Hintergrund weiter (PWA)
- Verknüpfung mit Kunde, Projekt und Aktivität
- Optional: Direkte Verknüpfung mit Ticket

### Manuelle Zeiterfassung
- Nachträgliche Buchung von Zeiten
- Datum, Start- und Endzeit wählbar
- Beschreibung und Notizen
- Abrechenbar/Nicht abrechenbar markieren

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

### PDF-Reports
- Zeitnachweis pro Kunde/Projekt/Zeitraum
- Firmenlogo einbindbar
- Unterschriftsfeld
- Detaillierte Auflistung aller Einträge
- Summen und Gesamtbeträge

### Zeitrundung
Einstellbare Rundungsintervalle:
- 1 Minute (keine Rundung)
- 5 Minuten
- 10 Minuten
- 15 Minuten
- 30 Minuten
- 60 Minuten

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

### Kundenkontakte
- Mehrere Ansprechpartner pro Kunde
- Name, E-Mail, Telefon
- Portal-Zugang aktivierbar
- MFA-Status

### Projektverwaltung
- Name und Beschreibung
- Kunde zuweisen
- Farbcode
- Aktiv/Inaktiv

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

### Dokumentenübersicht
- Rechnungen aus sevDesk
- Angebote aus sevDesk
- Status und Beträge

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

---

*Zuletzt aktualisiert: Dezember 2024*
