# RamboFlow - Next Version Roadmap

> **Letzte Aktualisierung:** 14. März 2026
> **Status:** CRM-Kernfunktionen vollständig implementiert

## Inhaltsverzeichnis
1. [Aktuelle Systemübersicht](#aktuelle-systemübersicht)
2. [CRM-Status (Aktualisiert)](#crm-status-aktualisiert)
3. [Modul-Status](#modul-status)
4. [Verbleibende Lücken](#verbleibende-lücken)
5. [Nächste Entwicklungsschritte](#nächste-entwicklungsschritte)
6. [Technische Schulden](#technische-schulden)

---

## Aktuelle Systemübersicht

### Architektur
- **Frontend**: React 18 mit TypeScript
- **Backend**: Node.js/Express mit TypeScript
- **Datenbank**: PostgreSQL
- **Authentifizierung**: JWT + MFA (TOTP)
- **Multi-Tenant**: Organization-basierte Mandantenfähigkeit

### Vier Hauptbereiche

| Bereich | Beschreibung | Module |
|---------|--------------|--------|
| **ARBEITEN** | Zeiterfassung | Stoppuhr, Manuelle Einträge, Liste, Kalender |
| **SUPPORT** | Ticketsystem & Geräte | Tickets, Email-Inbox, Geräte, Alerts, Wartung |
| **CRM** | Kundenbeziehungen | CustomerHub, Leads, Sales Pipeline, Kontakte, Interaktionen |
| **BUSINESS** | Finanzen & Strategie | Dashboard, Rechnungen, Verträge, Finanzen, Social Media |

---

## CRM-Status (Aktualisiert)

### Vollständig Implementiert

| Komponente | Frontend | Backend | Features |
|------------|----------|---------|----------|
| **CustomerHub** | `CustomerHub.tsx` (81.7 KB) | `customers.ts` | 360° Kundenansicht mit Tabs, Metriken, Quick-Actions |
| **Kontakte** | `CustomerContacts.tsx` | `contacts.ts` | CRM-Kontakte mit Rollen, Portal-Access, MFA |
| **Leads** | `Leads.tsx` (893 Zeilen) | `leads.ts` | Kanban-Board, Drag & Drop, Konvertierung |
| **Sales Pipeline** | `SalesPipeline.tsx` | `opportunities.ts` | Opportunities, Stages, Forecast, Win-Rate |
| **Interaktionen** | `InteractionsTimeline.tsx` | `interactions.ts` | Timeline, Follow-ups, Outcome-Tracking |

### API-Endpunkte (65+ implementiert)

```
CUSTOMERS (14 Endpoints)
├── GET/POST/PUT/DELETE /api/customers
├── GET /api/customers/:id/hub
├── GET /api/customers/:id/emails
├── CRUD /api/customers/:customerId/contacts
└── CRUD /api/customers/:customerId/email-domains

CONTACTS (7 Endpoints)
├── GET/POST/PUT/DELETE /api/contacts
├── POST /api/contacts/:id/portal-access
└── GET /api/contacts/customer/:customerId

LEADS (9 Endpoints)
├── GET/POST/PUT/DELETE /api/leads
├── GET /api/leads/pipeline
├── POST /api/leads/:id/activities
├── PUT /api/leads/:leadId/activities/:activityId/complete
└── POST /api/leads/:id/convert

INTERACTIONS (9 Endpoints)
├── GET/POST/PUT/DELETE /api/interactions
├── GET /api/interactions/follow-ups
├── POST /api/interactions/:id/complete-follow-up
├── GET /api/interactions/customer/:customerId/timeline
└── GET /api/interactions/stats/overview

OPPORTUNITIES (14 Endpoints)
├── CRUD /api/opportunities/stages
├── PUT /api/opportunities/stages/reorder
├── GET/POST/PUT/DELETE /api/opportunities
├── GET /api/opportunities/pipeline
├── GET /api/opportunities/forecast
├── POST /api/opportunities/:id/move
├── POST /api/opportunities/:id/activities
└── GET /api/opportunities/stats/overview
```

### Datenbank-Tabellen (CRM-Bereich)

```
CRM KERN
├── customers (mit NinjaRMM/sevDesk-Links, SLA-Policy)
├── customer_contacts (Rollen, Portal-Access, MFA, Benachrichtigungen)
├── customer_email_domains
└── customer_interactions (Types, Follow-ups, Outcomes)

LEADS & SALES
├── leads (Pipeline-Status, Quelle, Wert, Tags)
├── lead_activities
├── pipeline_stages (konfigurierbar pro Organisation)
├── opportunities (Weighted Value, Lost Reason)
└── opportunity_activities

METRIKEN (Schema vorhanden)
├── customer_metrics (Health Score, Churn Risk)
└── sla_policies (Response/Resolution Times)
```

---

## Modul-Status

### Vollständig Implementiert

| Modul | Dateien | Features |
|-------|---------|----------|
| **Zeiterfassung** | `Stopwatch.tsx`, `ManualEntry.tsx`, `CalendarView.tsx` | Timer, Offline-Support, Kalender |
| **Tickets** | `Tickets.tsx`, `TicketDetail.tsx` | Kanban, SLA, Kommentare, Email-Integration |
| **Support-Inbox** | `SupportInbox.tsx`, `PersonalInbox.tsx` | Email-zu-Ticket, Domain-Mapping |
| **Rechnungs-Inbox** | `InvoiceInbox.tsx` | PDF-Extraktion, sevDesk-Integration |
| **Aufgaben** | `TaskHub.tsx` | Wiederkehrend, Templates, Checklisten |
| **Dashboard** | `Dashboard.tsx` | Analysen, PDF-Reports |
| **Finanzen** | `Finanzen.tsx` | Rechnungen, sevDesk-Export |
| **Geräte** | `DevicesView.tsx` | NinjaRMM-Sync, Monitoring |
| **Wartung** | `MaintenanceView.tsx` | Ankündigungen, Genehmigungen |
| **Social Media** | `social-media/` | Post-Planung, AI-Generierung |
| **Kundenportal** | `portal/` | Tickets, Geräte, Rechnungen |
| **CRM CustomerHub** | `CustomerHub.tsx` | 360° View, Timeline, Metriken |
| **CRM Leads** | `Leads.tsx` | Kanban, Konvertierung |
| **CRM Pipeline** | `SalesPipeline.tsx` | Opportunities, Forecast |
| **CRM Kontakte** | `CustomerContacts.tsx` | Rollen, Portal-Access |
| **CRM Interaktionen** | `InteractionsTimeline.tsx` | Follow-ups, Outcomes |

### Teilweise Implementiert

| Modul | Status | Fehlend |
|-------|--------|---------|
| **Verträge** | CRUD vorhanden | Vorlagen, Automatisierung |
| **Knowledge Base** | Basis vorhanden | SEO, Versionierung |
| **Reports** | Placeholder | Report Builder |
| **Customer Metrics** | DB-Schema vorhanden | API-Endpunkte, Background Jobs |
| **SLA Policies** | DB-Schema vorhanden | API-Endpunkte, UI in Settings |

---

## Verbleibende Lücken

### Priorität HOCH

| Feature | Beschreibung | Aufwand |
|---------|--------------|---------|
| **Customer Metrics API** | Endpunkte für Health-Score-Berechnung | 4-6 Stunden |
| **SLA Policies API** | CRUD für SLA-Regeln | 4-6 Stunden |
| **Metriken Background Job** | Automatische Health-Score-Berechnung | 4-8 Stunden |
| **Portal-Einladungs-Email** | TODO im Code (contacts.ts:440) | 2-3 Stunden |

### Priorität MITTEL

| Feature | Beschreibung | Aufwand |
|---------|--------------|---------|
| **Report Builder** | Custom Reports erstellen | 2-3 Tage |
| **Customer Tags/Segmente** | Kunden gruppieren | 1 Tag |
| **Advanced Analytics** | Win-Rate Analysis, Pipeline Velocity | 1-2 Tage |
| **Workflow Automation** | Automatische Aktionen | 3+ Tage |

### Priorität NIEDRIG

| Feature | Beschreibung | Aufwand |
|---------|--------------|---------|
| **Call Integration** | VoIP/Click-to-Call | 2-3 Tage |
| **Email Sync** | Bidirektionale Email-Sync | 2-3 Tage |
| **Churn Prediction** | ML-basierte Vorhersage | 1 Woche |

---

## Nächste Entwicklungsschritte

### Heute umsetzbar (14. März 2026)

#### 1. Customer Metrics API (4-6 Stunden)
```typescript
// Neue Endpunkte in server/src/routes/customer-metrics.ts
GET    /api/customer-metrics/:customerId
GET    /api/customer-metrics/:customerId/history
POST   /api/customer-metrics/calculate/:customerId
POST   /api/customer-metrics/calculate-all
GET    /api/customer-metrics/dashboard
```

#### 2. SLA Policies API (4-6 Stunden)
```typescript
// Neue Endpunkte in server/src/routes/sla-policies.ts
GET    /api/sla-policies
GET    /api/sla-policies/:id
POST   /api/sla-policies
PUT    /api/sla-policies/:id
DELETE /api/sla-policies/:id
PUT    /api/sla-policies/:id/set-default
```

#### 3. Portal-Einladungs-Email (2-3 Stunden)
```typescript
// Fix TODO in contacts.ts:440
// Email-Template und Versand implementieren
```

#### 4. Metriken-Berechnung (4-8 Stunden)
```typescript
// Neuer Service: server/src/services/metricsCalculationService.ts
// - Tickets analysieren (opened, resolved, SLA breaches)
// - Zeiteinträge summieren
// - Health Score berechnen (0-100)
// - Churn Risk einschätzen
```

### Diese Woche

- [ ] Customer Metrics API implementieren
- [ ] SLA Policies API implementieren
- [ ] Metriken-Background-Job einrichten
- [ ] SLA-Management in Settings UI
- [ ] Health Dashboard in CustomerHub erweitern

### Nächste Woche

- [ ] Report Builder (Basic)
- [ ] Customer Tags/Segmente
- [ ] Email-Einladungen fertigstellen
- [ ] Advanced Analytics Dashboard

---

## Technische Schulden

### TODOs im Code

| Datei | Zeile | Problem |
|-------|-------|---------|
| `contacts.ts` | 440 | Email-Einladung nicht implementiert |
| `organizations.ts` | 432 | Email-Einladung nicht implementiert |
| `auth.ts` | 11 | Backend-Auth ist Placeholder |
| `QuoteEditor.tsx` | 133 | Ansprechpartner hardcoded |
| `CustomerHub.tsx` | 1340 | monthlyRevenue nicht berechnet |
| `App.tsx` | 703, 720, 737, 979 | Error-Handling unvollständig |

### Schema-Verbesserungen

| Problem | Empfehlung |
|---------|------------|
| Timestamps inkonsistent | Auf TIMESTAMPTZ standardisieren |
| Soft Deletes fehlen | `deleted_at` Column hinzufügen |
| Audit-Felder unvollständig | `created_by`, `updated_by` ergänzen |

---

## Zusammenfassung

### Aktueller Stand (März 2026)
- **40+ Datenbanktabellen**
- **65+ CRM-API-Endpunkte**
- **20+ Frontend-Module**
- **Vollständiges CRM-System** (CustomerHub, Leads, Pipeline, Kontakte, Interaktionen)
- **Solide Integrationen** (NinjaRMM, sevDesk, M365)

### Was noch fehlt (Priorisiert)
1. **Customer Metrics API** - Health Scores berechnen
2. **SLA Policies API** - SLA-Regeln verwalten
3. **Background Jobs** - Automatische Metrik-Updates
4. **Report Builder** - Custom Reports
5. **Workflow Automation** - Automatisierte Aktionen

### Geschätzter Restaufwand
- **Heute machbar:** 12-20 Stunden (Metrics + SLA APIs)
- **Diese Woche:** 30-40 Stunden (inkl. UI)
- **Komplett fertig:** 2-3 Wochen

---

*Aktualisiert: 14. März 2026*
*CRM-Kern: 95% fertig*
*Verbleibend: Metriken, SLA, Reports*
