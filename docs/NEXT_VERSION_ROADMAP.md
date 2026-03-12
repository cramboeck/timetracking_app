# RamboFlow - Next Version Roadmap

## Inhaltsverzeichnis
1. [Aktuelle Systemübersicht](#aktuelle-systemübersicht)
2. [Modul-Status](#modul-status)
3. [Datenbank-Schema](#datenbank-schema)
4. [Identifizierte Lücken](#identifizierte-lücken)
5. [CRM-Entwicklungsplan](#crm-entwicklungsplan)
6. [Roadmap Phase 2](#roadmap-phase-2)

---

## Aktuelle Systemübersicht

### Architektur
- **Frontend**: React mit TypeScript
- **Backend**: Node.js/Express mit TypeScript
- **Datenbank**: PostgreSQL
- **Authentifizierung**: JWT + MFA (TOTP)
- **Multi-Tenant**: Organization-basierte Mandantenfähigkeit

### Drei Hauptbereiche

| Bereich | Beschreibung | Module |
|---------|--------------|--------|
| **ARBEITEN** | Zeiterfassung | Stoppuhr, Manuelle Einträge, Liste, Kalender |
| **SUPPORT** | Ticketsystem & Geräte | Tickets, Email-Inbox, Geräte, Alerts, Wartung |
| **BUSINESS** | Finanzen & Strategie | Dashboard, Rechnungen, Verträge, Finanzen, Social Media, Reports |

---

## Modul-Status

### Vollständig implementiert

| Modul | Features | Dateien |
|-------|----------|---------|
| **Zeiterfassung** | Timer, manuelle Einträge, Kalender, Offline-Support | `Stopwatch.tsx`, `ManualEntry.tsx`, `CalendarView.tsx` |
| **Tickets** | Kanban, Liste, Dashboard, SLA, Kommentare, Anhänge | `Tickets.tsx`, `TicketDetail.tsx` (117 KB Backend) |
| **Support-Inbox** | Email-Integration, Auto-Ticket-Erstellung, Domain-Mapping | `SupportInbox.tsx`, `mailboxMonitorService.ts` |
| **Aufgaben** | Wiederkehrend, Templates, Checklisten, Kategorien | `TaskHub.tsx`, `tasks.ts` (46 KB) |
| **Dashboard** | Analysen, PDF-Reports, Zeiträume | `Dashboard.tsx` |
| **Finanzen** | Rechnungserstellung, sevDesk-Export | `Finanzen.tsx`, `sevdeskService.ts` |
| **Geräte** | NinjaRMM-Sync, Monitoring, Software-Inventar | `DevicesView.tsx`, `ninjarmmService.ts` |
| **Wartung** | Ankündigungen, Genehmigungen, Vorlagen | `MaintenanceView.tsx` |
| **Social Media** | Post-Planung, AI-Generierung, Multi-Platform | `social-media/` Feature-Modul |
| **Kundenportal** | Login, Tickets, Geräte, Rechnungen, KB | `portal/` Komponenten |
| **Einstellungen** | Umfangreiche Konfiguration aller Module | `Settings.tsx` (3.707 Zeilen) |

### Teilweise implementiert

| Modul | Status | Fehlend |
|-------|--------|---------|
| **Verträge** | CRUD vorhanden | Vorlagen, Automatisierung |
| **Leads** | Backend vorhanden | Frontend-Komponenten fehlen |
| **Knowledge Base** | Basis vorhanden | SEO, Versionierung |
| **Reports** | Placeholder | Vollständige Implementierung |

### Nicht implementiert

| Modul | Priorität | Beschreibung |
|-------|-----------|--------------|
| **CRM-Dashboard** | Hoch | Unified Customer View |
| **Sales Pipeline** | Hoch | Opportunity-Tracking |
| **Kundenaktivitäten** | Mittel | Timeline pro Kunde |
| **Kommunikationslog** | Mittel | Zentrale Kontakthistorie |
| **Customer Health** | Niedrig | KPIs, Churn-Prediction |

---

## Datenbank-Schema

### Kern-Entitäten (30+ Tabellen)

```
AUTHENTIFIZIERUNG & BENUTZER
├── users (MFA, Preferences, Feature Flags)
├── trusted_devices
├── password_reset_tokens
├── audit_logs
└── security_alerts

MULTI-TENANT SYSTEM
├── organizations
├── organization_members (owner/admin/member/viewer)
└── organization_invitations

ZEITERFASSUNG
├── customers (CRM-Kern, NinjaRMM-Link, sevDesk-Link)
├── projects (Stundensatz, Tagessatz)
├── activities (Stündlich, Pauschal)
└── time_entries (Ticket/Task/Vertrag-Verknüpfung)

TICKETSYSTEM
├── tickets (Status, Priorität, SLA, Email-Integration)
├── ticket_comments (Intern/Extern)
├── ticket_tasks (Subtasks)
├── ticket_tags & ticket_tag_assignments
├── ticket_ai_suggestions
├── ticket_emails & ticket_email_attachments
├── ticket_sequences (Ticket-Nummern)
└── canned_responses

CRM & LEADS
├── leads (Pipeline-Status, Wert, Wahrscheinlichkeit)
└── lead_activities (Calls, Emails, Meetings)

AUFGABEN
├── tasks (Wiederkehrend, Kategorien, Tags)
├── task_checklist_items
├── task_comments
├── task_activity_log
└── task_templates

VERTRÄGE
├── contracts (Service, Support, Subscription)
├── contract_positions
├── contract_hourly_tracking
└── contract_activity_log

WARTUNG
├── maintenance_announcements
├── maintenance_announcement_customers
├── maintenance_announcement_devices
├── maintenance_templates
└── maintenance_activity_log

KUNDENPORTAL
├── customer_portal_users
├── customer_portal_roles
├── customer_portal_user_roles
├── customer_portal_user_devices
├── customer_portal_sessions
└── customer_portal_activity_log

INTEGRATIONEN
├── ninjarmm_config, _organizations, _devices, _alerts
├── microsoft365_config
├── sevdesk_config, sevdesk_documents
├── clockodo_config
└── ai_config

SOCIAL MEDIA (Vollständiges Modul)
├── social_media_accounts, _posts, _templates
├── social_media_hashtag_groups
├── social_media_queue_settings, _autopilot_settings
├── social_media_stories, _story_templates
├── social_media_generated_images
└── social_media_competitors, _engagement_history

BENACHRICHTIGUNGEN
├── notification_preferences
├── push_subscriptions
├── portal_push_subscriptions
└── email_logs
```

### Schema-Inkonsistenzen

| Problem | Beschreibung | Empfehlung |
|---------|--------------|------------|
| Fehlende `customer_contacts` Tabelle | `customer_portal_users` wird als Workaround genutzt | Separate CRM-Kontakte-Tabelle erstellen |
| Namenskonventionen | Mix aus `user_id` und `owner_user_id` | Standardisieren auf `organization_id` |
| SLA-Policies | Referenziert aber nicht definiert | Explizite `sla_policies` Tabelle erstellen |
| Legacy Teams | Durch Organizations ersetzt | Deprecation planen |
| Timestamps | Mix aus TIMESTAMP und TIMESTAMPTZ | Auf TIMESTAMPTZ standardisieren |

---

## Identifizierte Lücken

### CRM-Modul (Kritisch)

**Aktueller Zustand:**
- Kunden-CRUD in Settings verstreut
- Kontakte nur für Portal-Zugang
- Keine zentrale Kundenansicht
- Keine Interaktionshistorie

**Fehlende Features:**

1. **Unified Customer Module**
   - Zentrale Kundenübersicht mit allen Informationen
   - Aktivitäts-Timeline (Tickets, Zeiteinträge, Verträge)
   - Dokumente & Notizen pro Kunde
   - Quick Actions (Ticket erstellen, Anrufen, Email)

2. **Sales Pipeline**
   - Lead → Opportunity → Deal Workflow
   - Pipeline-Stages (konfgurierbar)
   - Forecast & Wahrscheinlichkeiten
   - Aktivitäten-Tracking

3. **Kontaktmanagement**
   - Mehrere Kontakte pro Kunde
   - Rollen (Entscheider, Technisch, Buchhaltung)
   - Kommunikationshistorie
   - Beziehungsmapping

4. **Kommunikations-Hub**
   - Zentrale Log aller Interaktionen
   - Email-Integration (Eingang & Ausgang)
   - Anruf-Logging
   - Meeting-Notizen

5. **Customer Health Dashboard**
   - Revenue pro Kunde
   - Ticket-Trend (steigend = Problem?)
   - Vertragsstatus
   - Letzte Aktivität

### Reports-Modul (Placeholder)

**Aktueller Zustand:**
- Zeigt "Berichte-Modul kommt bald..."
- Dashboard hat Basic-Reporting

**Fehlende Features:**
- Report Builder
- Custom Templates
- Scheduled Reports
- Export-Formate (PDF, Excel, CSV)

### Weitere Lücken

| Bereich | Feature | Priorität |
|---------|---------|-----------|
| Projekte | Portfolio-Management | Niedrig |
| Ressourcen | Kapazitätsplanung | Mittel |
| Automatisierung | Workflow Builder | Mittel |
| API | Webhook-System | Niedrig |

---

## CRM-Entwicklungsplan

### Phase 1: Datenbank-Erweiterungen

```sql
-- 1. Echte Kontakte-Tabelle (nicht nur Portal-User)
CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID NOT NULL REFERENCES customers(id),

  -- Basis-Info
  first_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),

  -- Position
  job_title VARCHAR(100),
  department VARCHAR(100),

  -- Rolle im Unternehmen
  role VARCHAR(50) DEFAULT 'contact', -- decision_maker, technical, billing, contact
  is_primary BOOLEAN DEFAULT false,

  -- Portal-Verknüpfung (optional)
  portal_user_id UUID REFERENCES customer_portal_users(id),

  -- Kommunikationspräferenzen
  preferred_contact_method VARCHAR(20) DEFAULT 'email', -- email, phone, portal
  notify_on_ticket_update BOOLEAN DEFAULT true,

  -- Notizen
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Interaktions-Log
CREATE TABLE customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  contact_id UUID REFERENCES customer_contacts(id),
  user_id UUID NOT NULL REFERENCES users(id),

  -- Interaktionstyp
  type VARCHAR(50) NOT NULL, -- call, email, meeting, note, ticket, quote, invoice
  direction VARCHAR(10), -- inbound, outbound (für calls/emails)

  -- Details
  subject VARCHAR(255),
  content TEXT,

  -- Verknüpfungen
  ticket_id UUID REFERENCES tickets(id),
  lead_id UUID REFERENCES leads(id),
  quote_id UUID,

  -- Timing
  duration_minutes INTEGER,
  scheduled_at TIMESTAMP,
  occurred_at TIMESTAMP DEFAULT NOW(),

  -- Follow-up
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. SLA-Policies (fehlte)
CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,

  -- Response-Zeiten (in Stunden)
  response_time_low INTEGER DEFAULT 24,
  response_time_normal INTEGER DEFAULT 8,
  response_time_high INTEGER DEFAULT 4,
  response_time_critical INTEGER DEFAULT 1,

  -- Lösungszeiten (in Stunden)
  resolution_time_low INTEGER DEFAULT 120,
  resolution_time_normal INTEGER DEFAULT 48,
  resolution_time_high INTEGER DEFAULT 24,
  resolution_time_critical INTEGER DEFAULT 8,

  -- Arbeitszeiten
  business_hours_only BOOLEAN DEFAULT true,
  business_hours_start TIME DEFAULT '08:00',
  business_hours_end TIME DEFAULT '18:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Mo-Fr

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Customer Metrics (für Health Dashboard)
CREATE TABLE customer_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Zeitraum
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Metriken
  revenue DECIMAL(12,2) DEFAULT 0,
  hours_billed DECIMAL(8,2) DEFAULT 0,
  tickets_opened INTEGER DEFAULT 0,
  tickets_resolved INTEGER DEFAULT 0,
  avg_resolution_time_hours DECIMAL(8,2),
  sla_breaches INTEGER DEFAULT 0,

  -- Berechnet
  health_score INTEGER, -- 0-100

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(customer_id, period_start, period_end)
);

-- 5. Pipeline-Stages (für Sales)
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3B82F6',

  probability INTEGER DEFAULT 0, -- 0-100%
  sort_order INTEGER NOT NULL,

  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Opportunities (Sales)
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),

  name VARCHAR(255) NOT NULL,
  description TEXT,

  stage_id UUID REFERENCES pipeline_stages(id),

  value DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  probability INTEGER, -- Override stage probability

  expected_close_date DATE,
  actual_close_date DATE,

  assigned_to UUID REFERENCES users(id),

  -- Won/Lost
  status VARCHAR(20) DEFAULT 'open', -- open, won, lost
  lost_reason VARCHAR(255),
  competitor VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 2: Frontend-Komponenten

```
src/components/crm/
├── CRMLayout.tsx              # CRM-Bereich Layout
├── CustomerHub.tsx            # Zentrale Kundenübersicht
├── CustomerDetail.tsx         # Einzelkunden-Ansicht
├── CustomerTimeline.tsx       # Aktivitäts-Timeline
├── CustomerMetrics.tsx        # Health & KPIs
├── ContactList.tsx            # Kontaktliste
├── ContactDetail.tsx          # Kontaktdetails
├── InteractionLog.tsx         # Kommunikationslog
├── InteractionForm.tsx        # Neue Interaktion
├── SalesPipeline.tsx          # Kanban Pipeline
├── OpportunityCard.tsx        # Deal-Karte
├── OpportunityDetail.tsx      # Deal-Details
├── LeadList.tsx               # Lead-Übersicht (existiert Backend)
├── LeadDetail.tsx             # Lead-Details
└── LeadConvert.tsx            # Lead → Customer Konvertierung
```

### Phase 3: Backend-Erweiterungen

```
server/src/routes/
├── crm.ts                     # CRM-Haupt-Router
├── contacts.ts                # Kontakt-CRUD
├── interactions.ts            # Interaktions-Log
├── opportunities.ts           # Sales Pipeline
└── customer-metrics.ts        # Metriken-Berechnung

server/src/services/
├── crmService.ts              # CRM-Logik
├── metricsCalculationService.ts # Metriken berechnen
└── pipelineService.ts         # Pipeline-Logik
```

---

## Roadmap Phase 2

### Sprint 1: CRM Foundation (2 Wochen)

**Woche 1:**
- [ ] Datenbank-Migrationen (customer_contacts, customer_interactions)
- [ ] Backend-Routes für Kontakte
- [ ] Backend-Routes für Interaktionen
- [ ] API-Tests

**Woche 2:**
- [ ] CustomerHub Frontend-Komponente
- [ ] ContactList & ContactDetail
- [ ] InteractionLog & InteractionForm
- [ ] Integration in Settings

### Sprint 2: Unified Customer View (2 Wochen)

**Woche 3:**
- [ ] CustomerDetail mit Tabs (Übersicht, Kontakte, Tickets, Zeiteinträge, Verträge)
- [ ] CustomerTimeline (alle Aktivitäten chronologisch)
- [ ] Quick Actions (Ticket erstellen, Anruf loggen)

**Woche 4:**
- [ ] Suche & Filter für Kunden
- [ ] Kundengruppen/Tags
- [ ] Export-Funktionen
- [ ] Mobile-Optimierung

### Sprint 3: Sales Pipeline (2 Wochen)

**Woche 5:**
- [ ] Datenbank: pipeline_stages, opportunities
- [ ] Backend: Pipeline-CRUD, Opportunity-Management
- [ ] Lead-Frontend-Komponenten (LeadList, LeadDetail)

**Woche 6:**
- [ ] SalesPipeline Kanban-Board
- [ ] Drag & Drop zwischen Stages
- [ ] Opportunity-Details
- [ ] Lead → Kunde Konvertierung

### Sprint 4: Metriken & Reports (2 Wochen)

**Woche 7:**
- [ ] Datenbank: customer_metrics, sla_policies
- [ ] Metriken-Berechnungs-Service
- [ ] SLA-Policy Management in Settings
- [ ] Automatische Metriken-Updates (Cron)

**Woche 8:**
- [ ] Customer Health Dashboard
- [ ] Report Builder (Basic)
- [ ] Scheduled Reports
- [ ] PDF/Excel Export

### Sprint 5: Integration & Polish (1 Woche)

- [ ] CRM in Navigation integrieren
- [ ] Bestehende Kunden-Verwaltung migrieren
- [ ] Dokumentation aktualisieren
- [ ] Performance-Optimierung
- [ ] Benutzer-Feedback einarbeiten

---

## Technische Empfehlungen

### Code-Organisation

```
src/
├── features/                  # Feature-basierte Module (wie social-media/)
│   ├── crm/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types.ts
│   ├── tickets/
│   ├── time-tracking/
│   └── billing/
```

### State Management

Aktuell: Zentral in `App.tsx` mit Props-Drilling

**Empfehlung:**
- React Context für globalen State (Auth, User, Organization)
- Feature-spezifische Hooks (useCustomers, useTickets)
- React Query für Server State Management

### API-Konsistenz

**Aktuell:** Unterschiedliche Response-Formate

**Empfehlung:** Standardisiertes Format:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    total?: number;
    hasMore?: boolean;
  };
}
```

### Datenbank-Standards

1. **Timestamps:** Immer `TIMESTAMPTZ` verwenden
2. **IDs:** UUID für alle primären Schlüssel
3. **Soft Deletes:** `deleted_at` statt hartem DELETE
4. **Audit:** `created_by`, `updated_by` für wichtige Tabellen
5. **Indizes:** Für alle Fremdschlüssel und häufige Abfragen

---

## Zusammenfassung

### Aktueller Stand
- 30+ Datenbanktabellen
- 18+ Frontend-Module
- Vollständiges Ticketsystem
- Solide Integrationen (NinjaRMM, sevDesk, M365)

### Hauptziele Phase 2
1. **CRM vereinheitlichen** - Zentrale Kundenansicht
2. **Sales Pipeline** - Lead → Opportunity → Deal
3. **Interaktionshistorie** - Alle Touchpoints tracken
4. **Metriken** - Customer Health Dashboard
5. **Reports** - Vollständiges Reporting-Modul

### Geschätzter Aufwand
- **5 Sprints** (ca. 9 Wochen)
- **Datenbank:** 6 neue Tabellen
- **Backend:** 5 neue Route-Dateien
- **Frontend:** 15+ neue Komponenten

---

*Erstellt: März 2026*
*Version: 2.0 Roadmap*
