# Roadmap - TimeTracking App

## sevDesk Integration

### Phase 1: Basis-Integration ✅ ABGESCHLOSSEN
- [x] Feature-Flag in Datenbank (`billing_enabled`)
- [x] API-Token Konfiguration in Einstellungen
- [x] Verbindungstest zu sevDesk
- [x] Kunden mit sevDesk-Kontakten verknüpfen
- [x] Billing-UI für unbezahlte Zeiten
- [x] sevDesk API-Endpoints (Contact, Invoice, Order)
- [x] Rechnungserstellung in sevDesk
- [x] Zeiten als "abgerechnet" markieren (invoice_export_id)

### Phase 2: Dokumente indexieren ✅ ABGESCHLOSSEN
- [x] Rechnungen aus sevDesk synchronisieren (syncInvoices)
- [x] Angebote aus sevDesk synchronisieren (syncQuotes)
- [x] Dokumenten-Datenbank aufbauen (sevdesk_documents Tabelle)
- [x] Volltextsuche über alle Dokumente (searchDocuments)
- [x] Dokumenten-Vorschau (Finanzen Hub)
- [x] Positions-Suche für Angebotserstellung (searchPositions)
- [x] Angebotserstellung aus App heraus (createQuote)
- [ ] Automatische Synchronisation (Webhook oder Polling) - optional

### Phase 3: Intelligente Angebotserstellung

#### Schnellere Angebote
- [ ] Ähnliche Angebote anhand Kunde/Leistung/Betrag finden
- [ ] Positionen aus vergangenen Angeboten vorschlagen
- [ ] Autovervollständigung für Leistungsbeschreibungen
- [ ] Preisvorschläge basierend auf Kundenhistorie
- [ ] Stundensatz-Historie pro Kunde/Projekttyp

#### KI-Textverbesserung
- [ ] Stichworte → professionelle Beschreibungen
- [ ] Technische Details kundenfreundlich formulieren
- [ ] Einheitlicher Schreibstil über alle Angebote
- [ ] Rechtschreibung/Grammatik-Korrektur
- [ ] Branchenspezifische Terminologie

#### Beispiel-Workflow
```
Eingabe vom Benutzer:
  "Server Migration, 3 VMs, Downtime minimieren"

KI-generierter Text:
  "Migration der bestehenden Serverinfrastruktur (3 virtuelle
  Maschinen) auf die neue Plattform. Die Migration erfolgt mit
  minimaler Ausfallzeit durch parallelen Betrieb und schrittweise
  Umschaltung. Inklusive Funktionstest und Dokumentation."
```

#### Technische Umsetzung
- [ ] OpenAI/Anthropic API Integration
- [ ] Kontext aus bisherigen Angeboten als Few-Shot Examples
- [ ] Firmenspezifisches Fine-Tuning der Texte
- [ ] Opt-in pro Benutzer (DSGVO-konform)
- [ ] Lokale Verarbeitung als Alternative (Ollama)

---

## NinjaRMM Integration

### Phase 1: Geräte-Sync (In Arbeit)
- [x] Datenbank-Schema (ninjarmm_config, organizations, devices, alerts)
- [x] Feature-Flag System (feature_flags JSONB auf users)
- [ ] NinjaRMM API Service (OAuth2, Geräte abrufen)
- [ ] Organisationen mit Kunden verknüpfen
- [ ] Geräteliste im Kunden-Hub anzeigen
- [ ] Einstellungen-UI für NinjaRMM Credentials

### Phase 2: Alerts → Tickets
- [ ] Alerts aus NinjaRMM synchronisieren
- [ ] Automatische Ticket-Erstellung aus Alerts
- [ ] Alert-Status zurückmelden

### Phase 3: Quick-Actions
- [ ] Remote-Zugriff Button (Deep-Link zu NinjaRMM)
- [ ] Gerätestatus live im Ticket
- [ ] Geräte-Auswahl bei Ticket-Erstellung

---

## Kundenportal (NEU)

### Phase 1: Basis-Portal
- [x] Datenbank-Schema (portal_users, roles, sessions, activity_log)
- [ ] Separate Login-Seite für Kundenportal
- [ ] Portal-User Verwaltung (anlegen, einladen, deaktivieren)
- [ ] Rollen-System mit Berechtigungen

### Phase 2: Dokumente & Geräte
- [ ] Rechnungen einsehen/downloaden (sevDesk)
- [ ] Angebote einsehen/akzeptieren (sevDesk)
- [ ] Dienstleistungsreports einsehen
- [ ] NinjaRMM Geräte sehen (je nach Rolle: alle/eigene)

### Phase 3: Tickets & Support
- [ ] Tickets erstellen aus Portal
- [ ] Ticket-Historie einsehen
- [ ] Ticket-Kommentare (öffentlich/intern)
- [ ] Support-Anfrage für Gerät

### Standard-Rollen
| Rolle | Rechnungen | Angebote | Reports | Geräte | Tickets |
|-------|------------|----------|---------|--------|---------|
| Geschäftsführung | ✅ | ✅ | ✅ | ❌ | Alle sehen |
| Buchhaltung | ✅ | ✅ | ❌ | ❌ | ❌ |
| IT-Techniker | ❌ | ❌ | ❌ | ✅ Alle | Erstellen + Alle |
| Mitarbeiter | ❌ | ❌ | ❌ | Nur eigene | Nur eigene |

---

## Ticket-System

### Phase 1: Basis-Tickets (In Arbeit)
- [x] Datenbank-Schema (tickets, ticket_comments)
- [x] Ticket ↔ Zeiterfassung Verknüpfung (ticket_id auf time_entries)
- [ ] Ticket-Liste und Detail-Ansicht
- [ ] Ticket erstellen (manuell, aus Alert, aus Portal)
- [ ] Status-Workflow (open → in_progress → resolved → closed)

### Phase 2: Erweiterungen
- [ ] SLA-Eskalation per E-Mail/Push
- [ ] Ticket-Vorlagen pro Kategorie
- [ ] Automatische Ticket-Zuweisung
- [ ] Kundenzufriedenheits-Umfrage nach Abschluss

---

## Kunden-Hub (Intern)

- [ ] Neuer Haupt-Menüpunkt "Kunden"
- [ ] 360° Kundenansicht:
  - Stammdaten & Kontakte
  - NinjaRMM Geräte
  - Offene Tickets
  - Zeiterfassung-Historie
  - sevDesk Dokumente (Rechnungen/Angebote)
  - Statistiken (Umsatz, Stunden)
- [ ] Quick-Actions (Remote, Ticket, Zeit erfassen)
- [ ] Portal-User Verwaltung pro Kunde

---

## Dashboard & Reporting

- [ ] Umsatz-Prognose basierend auf offenen Angeboten
- [ ] Auslastungs-Übersicht pro Mitarbeiter
- [ ] Projektrentabilität (Ist vs. Angebot)
- [ ] Export für Steuerberater

---

## Changelog

### 2024-11 - sevDesk Phase 1 & 2
- Feature-Flag System implementiert
- SevdeskSettings Komponente
- Billing Komponente mit Rechnungserstellung
- CustomerSevdeskLink Komponente
- Backend-Routes für sevDesk API
- Dokumenten-Sync (Rechnungen & Angebote)
- Volltextsuche über sevDesk-Dokumente
- Finanzen Hub mit Dokumenten-Übersicht
- Angebotserstellung direkt aus der App
- Positions-Suche für schnellere Angebote
