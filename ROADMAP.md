# Roadmap - TimeTracking App

## sevDesk Integration

### Phase 1: Basis-Integration (In Arbeit)
- [x] Feature-Flag in Datenbank (`billing_enabled`)
- [x] API-Token Konfiguration in Einstellungen
- [x] Verbindungstest zu sevDesk
- [x] Kunden mit sevDesk-Kontakten verknüpfen
- [x] Billing-UI für unbezahlte Zeiten
- [ ] sevDesk API-Endpoints verifizieren und testen
- [ ] Rechnungserstellung in sevDesk
- [ ] Zeiten als "abgerechnet" markieren

### Phase 2: Dokumente indexieren
- [ ] Rechnungen aus sevDesk synchronisieren
- [ ] Angebote aus sevDesk synchronisieren
- [ ] Dokumenten-Datenbank aufbauen
  ```sql
  sevdesk_documents (
    id, sevdesk_id, type, customer_id,
    document_number, date, total_amount,
    status, positions JSONB, full_text, synced_at
  )
  ```
- [ ] Volltextsuche über alle Dokumente
- [ ] Dokumenten-Vorschau im Dashboard
- [ ] Automatische Synchronisation (Webhook oder Polling)

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

### 2024-11 - sevDesk Basis
- Feature-Flag System implementiert
- SevdeskSettings Komponente
- Billing Komponente
- CustomerSevdeskLink Komponente
- Backend-Routes für sevDesk API
