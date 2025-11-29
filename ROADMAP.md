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

## Weitere geplante Features

### NinjaRMM Integration
- [ ] Systeme/Geräte pro Kunde importieren
- [ ] Gerätestatus live abfragen
- [ ] Alerts in Tickets umwandeln
- [ ] Remote-Zugriff aus Ticket starten

### Ticket-System Erweiterungen
- [ ] SLA-Eskalation per E-Mail/Push
- [ ] Ticket-Vorlagen pro Kategorie
- [ ] Automatische Ticket-Zuweisung
- [ ] Kundenzufriedenheits-Umfrage nach Abschluss

### Dashboard & Reporting
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
