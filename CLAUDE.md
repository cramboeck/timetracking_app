# CLAUDE.md – RamboFlow Entwicklungskontext

> Single Source of Truth für KI-Assistenten (Claude Code, Manus, etc.).
> Beschreibt Architektur, Tech-Stack, Branch-Konvention, aktuellen Stand und Roadmap.
> **Bitte vor jeder Arbeitssitzung vollständig lesen.**

---

## Projektübersicht

**RamboFlow** ist eine umfassende Business-Management-App für IT-Dienstleister und Freelancer.

| Eigenschaft | Wert |
|---|---|
| Frontend | React 18.3 + TypeScript 5.3 + Tailwind CSS 3.4 + Vite 5.1 |
| Backend | Node.js + Express 4.18 + TypeScript |
| Datenbank | PostgreSQL 16 (via `pg` Pool) |
| Auth | JWT (Access Token, kein Refresh-Token) |
| Validierung | Zod (Backend, eingeführt durch PR #48 + #61), React Hook Form (Frontend) |
| Background Jobs | node-cron |
| Deployment | Docker Compose (server + client + db) auf Hetzner |

### Wichtige Verzeichnisse

```
/src                    → React Frontend
  /components           → UI-Komponenten (monolithisch, noch kein Routing)
  /features/social-media → Social-Media-Modul (eigene Struktur)
  /services/api         → API-Client-Layer (authFetch, entriesApi, etc.)
  /contexts             → React Contexts (AuthContext, etc.)
  /utils                → Hilfsfunktionen (sanitize, offlineStorage, etc.)
/server/src
  /routes               → Express-Routen (eine Datei pro Domäne)
  /middleware           → auth, validation, organization
  /config/database.ts   → DB-Schema + alle Migrationen (3300+ Zeilen)
  /services             → auditLog, securityService, etc.
  /utils/logger.ts      → strukturiertes Logging (eingeführt durch PR #48)
```

---

## Branch-Konvention

> **Wichtig für alle KI-Assistenten:** Hier wird zentral festgelegt, gegen welchen Branch
> Feature- und Fix-Branches eröffnet werden. Bitte vor dem ersten Commit prüfen.

| Branch | Rolle |
|---|---|
| `claude/next-version-roadmap-ks0D0` | **Entwicklungs-Basis** — entspricht dem Stand auf dem Hetzner-Produktionsserver. Alle Feature-/Fix-Branches gehen von hier aus, PRs werden gegen diesen Branch eröffnet. |
| `main` | **Release-Target** — wird nicht direkt per Feature-PR aktualisiert, sondern in regelmäßigen Abständen per Release-Merge aus `claude/next-version-roadmap-ks0D0` synchronisiert. |

### Standard-Workflow

```bash
# 1. neueste Basis holen
git fetch origin claude/next-version-roadmap-ks0D0

# 2. Feature-Branch davon abzweigen
git checkout -b <feature-name> origin/claude/next-version-roadmap-ks0D0

# 3. Entwickeln, committen, pushen

# 4. PR öffnen mit base = claude/next-version-roadmap-ks0D0
#    (NICHT base = main!)
```

Periodisch — nur auf explizite User-Anweisung — wird `claude/next-version-roadmap-ks0D0 → main` als Release-Merge ausgeführt.

### Warum

Der Hetzner-Produktionsserver zieht den Code aus `claude/next-version-roadmap-ks0D0`. Wenn Features stattdessen in `main` landen, sieht der Server sie nicht — das ist am 17.5.2026 mit PR #48 (Logger + Zod) versehentlich passiert und musste mit einem Fast-Forward von `main` nach `claude/next-version-roadmap-ks0D0` nachträglich korrigiert werden. Diese Konvention soll das verhindern.

---

## Tech-Stack-Analyse & Modernisierungs-Potenzial

Der Stack ist solide, aber teilweise veraltet. Eine Modernisierung lohnt sich vor allem dort, wo aktuell viel Boilerplate entsteht.

### Frontend

- **Architektur-Problem:** `App.tsx` (1100+ Zeilen) steuert die gesamte Navigation über State (`currentArea`, `currentSubView`). Es gibt kein echtes URL-Routing → kein Deep-Linking, Browser-Back funktioniert nicht.
- **Daten-Fetching:** fast ausschließlich über `useEffect` und lokales State-Management. Race-Conditions, doppelte Requests, kein Caching.
- **Modernisierungs-Potenzial (2026):**
  - **React Router v7** für echte URL-Routen
  - **TanStack Query (React Query)** ersetzt hunderte `useEffect`-Boilerplate-Zeilen, automatisches Caching + Background-Updates (ideal für NinjaRMM Alerts)
  - **Tailwind v4** — 5× schnellere Builds, CSS-first Konfig
  - **Zustand** für globales State-Management (z.B. laufender Timer als Singleton statt durch Context Drilling)

### Backend

- **Architektur-Problem:** Polling-basierte Architektur — Frontend fragt regelmäßig ab, statt Backend zu pushen.
- **Modernisierungs-Potenzial:**
  - **Server-Sent Events (SSE)** oder **WebSockets** für Echtzeit-Updates bei NinjaRMM Alerts und eingehenden E-Mails
  - **BullMQ + Redis** für robustere Background-Jobs (aktuell node-cron, bei Skalierung problematisch)

---

## Modul-Status

### Finanzen (Abrechnung & Dokumente)
- Workflow umständlich: `Finanzen.tsx` → „Offene Posten" → Kunde wählen → `InvoiceCreationDialog.tsx` Wizard
- **Verbesserungsidee:** „One-Click-Billing" Dashboard mit Direkt-Aktionen pro Kunde
- `QuoteEditor.tsx` funktioniert, ist aber vom CRM (Sales Pipeline) isoliert

### Support & NinjaRMM Integration
- Backend-Webhook `/webhook/:userId` ist solide (Secret-Validierung, Auto-Ticket aus Alerts, Exclusion-Rules mit Regex, OAuth2 Token-Refresh, 5-Min Auto-Sync via Cron) ✅
- **Lücken:** `AlertsView` muss manuell refreshed werden (kein Push); Tickets ohne Bulk-Actions; SLA-Warnungen nur im Detail-View

### CRM
- Fragmentiert: `CustomerHub.tsx` ist sehr umfangreich (360°), aber `Leads.tsx` und `SalesPipeline.tsx` wirken wie separate Apps
- **Verbesserungsidee:** Sales Pipeline → Angebots-Editor verknüpfen; bei Lead „Won" automatisch Projekt + Vertrag anlegen

### Arbeiten (Zeiterfassung)
- `ManualEntry.tsx` existiert noch als toter Code neben `ManualEntryModern.tsx` (todo: löschen)
- **Verbesserungsidee:** Stoppuhr als persistentes, schwebendes Widget in der gesamten App (nicht nur im „Arbeiten"-Tab)

---

## Aktueller Stand (Stand 17.5.2026)

### Sprint „Kurzfristig" — ✅ abgeschlossen

| Task | PR |
|---|---|
| Soft-Delete in Route-Handlern aktivieren (`customers`, `projects`, `activities`, `contracts`) | #60 |
| Soft-Delete `WHERE deleted_at IS NULL` in GET-Queries | #60 |
| Zod-Validierung für `tickets.ts` (16 Endpoints) | #61 |
| Zod-Validierung für `ai.ts` (10 Endpoints) | #61 |
| Zod-Validierung für `contracts.ts` (5 Endpoints) | #61 |
| `TimeEntriesList.tsx` auf `getPaginated()` umstellen | #62 |
| Backend `customerId` + `searchText` Filter für `/api/entries` | #63 |

### Epic 4.1 — Zeiterfassung Stabilität & Usability — ✅ abgeschlossen

| Task | PR |
|---|---|
| Manual-Entry „Heute"-Timezone-Bugfix | #53 |
| Überlappende Timer verhindern (Auto-Stop server-side) | #54 |
| Manuelle Eingabe der Dauer (H:MM Input neben Picker) | #55 |
| Schnell-Wiederholung (Repeat-Button startet Timer direkt) | #59 |
| „Vergessener Timer"-Warnung (>8h Banner) | #59 |
| Wochenziel-Anzeige auf Stoppuhr-Seite | #59 |
| Heartbeat-Intervall konfigurierbar (1/5/15 Min, in User-Pref) | #59 |

### Branding (Backlog-Punkt 1.1) — ✅ abgeschlossen

| Task | PR |
|---|---|
| Branch-Konvention in CLAUDE.md verankert | #56 |
| RamboFlow brand (Orange `#FF6A00` + Dark-Indigo) als Default für neue User | #57 |
| Phase 1: 306 `dark:*-blue-*` Inkonsistenzen → `accent-primary` | #57 |
| Phase 2: 97 weitere semantisch blau-vs-brand Stellen → `accent-primary` (46 Files) | #65 |
| 15 verbliebene blue-Stellen (Status „open", Info-Toast, Facebook-Brand, etc.) — intentional semantisch blau | — |

---

## Offene Aufgaben (Roadmap)

### Epic 5 — Architektur-Modernisierung (Priorität: Hoch)

1. **React Router einführen** — `App.tsx` (1100+ Zeilen) refactoren, echtes URL-Routing implementieren. `react-router-dom` v6.22 ist bereits installiert (wird aktuell nur für `/portal` und `/admin` genutzt).
2. **TanStack Query (React Query)** — `useEffect`-Datenabfragen schrittweise ersetzen (Start mit `Tickets.tsx` und `AlertsView.tsx`).
3. **Toten Code entfernen** — `ManualEntry.tsx` löschen (nur noch `ManualEntryModern.tsx` in `App.tsx` importiert).

### Epic 6 — UI/UX-Polish (Priorität: Mittel)

1. **Skeleton Loaders** für alle Haupt-Listen (Tickets, Kunden, Einträge) — aktuell zeigen Listen während des Loadings nichts an.
2. **Globaler Timer** als persistentes, schwebendes Element in der App-Shell (Picture-in-Picture oder Bottom-Bar), nicht nur im „Arbeiten"-Tab.
3. **Bento-Grid Dashboard** — `DashboardOverview.tsx` als modulares KPI-Grid.

### Epic 7 — Echtzeit & Automatisierung (Priorität: Mittel)

1. **Server-Sent Events (SSE)** für NinjaRMM Alerts und eingehende E-Mails.
2. **Push-Notifications** robuster — Service Worker (`push-sw.js`) härten, VAPID-Keys im Admin-Setup erzwingen.
3. **CRM-Finanzen-Brücke** — Angebote direkt aus der Sales Pipeline erstellen.
4. **Refresh-Token-Mechanismus** — JWT läuft ab → aktuell wird der Nutzer ausgeloggt, keine automatische Verlängerung.

### Epic 8 — Tech-Stack-Upgrade-Plan (schrittweise, Risiko-bewertet)

| Schritt | Was | Warum | Risiko |
|---|---|---|---|
| 1 | **Tailwind v4** | 5× schnellere Builds, CSS-first Konfig via `@theme`. Utility-Klassen bleiben weitestgehend gleich | Gering |
| 2 | **TanStack Query** | Aktuell ~83 Komponenten / 380+ `useEffect`-Hooks für Daten-Fetching → Race-Conditions, doppelte Requests. Lässt sich parallel zum alten System einführen | Mittel |
| 3 | **React Router v7** | App.tsx ist 1100+ Zeilen Navigation-State. Upgrade von bereits installiertem v6.22 → v7, dann App.tsx in Layout-Komponenten zerlegen | Hoch |
| 4 | **React 19** | Server Components, `use()` Hook, bessere Performance. Hängt von Drittanbieter-Kompatibilität ab (`react-big-calendar` ✓, `recharts` prüfen) | Mittel |

### Datenbank-Konsistenz & Multi-Tenancy (Priorität: Kritisch)

#### Multi-Tenancy Lücken schließen
~38 Tabellen haben `user_id`, aber **keine** `organization_id` — bricht Mandantenfähigkeit für Teams:
`trusted_devices`, `customers`, `projects`, `activities`, `time_entries`, `company_info`, `email_notifications`, `password_reset_tokens`, `audit_logs`, `notification_settings`, `report_approvals`, `ninjarmm_config`, `ninjarmm_organizations`, `ninjarmm_alerts`, `ninjarmm_webhook_events`, `ninjarmm_alert_exclusions`, `customer_portal_*`, `ticket_comments`, `ai_config`, `ticket_ai_suggestions`, `feature_packages`, `maintenance_*`, `lead_activities`, `task_comments`, `task_activity_log`, `contracts`, `contract_activity_log`, `sevdesk_*`, `invoice_exports`, `clockodo_config`

**Task:** Migration schreiben, die `organization_id` zu diesen Tabellen hinzufügt und basierend auf `user_id` befüllt.

#### Fehlende Indexes
Indexes auf `organization_id` fehlen in: `teams`, `ninjarmm_alerts`, `ninjarmm_webhook_events`, `ticket_comments`, `ticket_tag_assignments`, `ticket_sequences_new`, `lead_activities`, `task_checklist_items`, `contracts`, `sevdesk_config`, `clockodo_config`, `social_media_*` (mehrere), `ticket_email_attachments`.

**Task:** `CREATE INDEX IF NOT EXISTS` Statements in `database.ts` ergänzen.

### Sonstige Mittelfristige Tasks

| Task | Datei |
|---|---|
| Tickets-Paginierung (analog zu PR #62) | `server/src/routes/tickets.ts`, `src/components/Tickets.tsx` |
| Vertrags-Stunden-Automatisierung (Cron rechnet Zeiteinträge gegen Inklusivstunden) | neue cron-job in `server/src/jobs/` |
| Mobile-Strategie: TicketKanban auf Mobile deaktivieren, Tabellen → Card-Layout | diverse |
| Command Palette `Cmd+K` mit Historie (letzte 3–5 Aktionen) | `CommandPalette.tsx` |
| Alle verbleibenden `window.alert()`/`confirm()` durch `ConfirmDialog` (~100 Stellen) | global |

### UI-Konsistenz / Duplikat-Auflösung (Epic 4.3)

| Duplikat | Empfehlung |
|---|---|
| `ManualEntry.tsx` vs `ManualEntryModern.tsx` | Altes File löschen (in Epic 5.3 abgedeckt) |
| `Dashboard.tsx` (1683 Z.) vs `DashboardOverview.tsx` (484 Z.) | Konsolidieren |
| `Billing.tsx` (632) vs `BillingOverview.tsx` (189) vs `BillingWidget.tsx` (159) | Konsolidieren, geteilten Code extrahieren |
| `TaskHub.tsx` (563) vs `TasksOverview.tsx` (253) | Klare Trennung Tasks vs Tickets, ggf. zusammenführen |

### Funktions-Review

- **Tickets vs Tasks** — beide haben Status, Priorität, Zuweisung, Kunden-Link. Strategie: Tickets = externer Kunden-Support, Tasks = interne Aufgaben (optional an Tickets gehängt).
- **Leads (CRM)** — Tabellen und Backend-Routen existieren, aber **kein Frontend** außer Erwähnung im Social Media Manager. Entscheidung: CRM-Modul bauen oder toten Code entfernen.
- **Social Media** — 13 `social_media_*` Tabellen existieren, aber Frontend postet nicht wirklich an Plattformen (nur DB-Einträge).
- **Push Subscriptions** — `push_subscriptions` und `portal_push_subscriptions` zusammenführen.

### Langfristig — Architektur

| Task | Beschreibung |
|---|---|
| Schichtenarchitektur (Controller/Repository) | Pilot: `tickets.ts` aufteilen |
| Unit-Tests einführen | Jest für Backend-Services und Routes |
| `any`-Typen eliminieren | ca. 40+ Stellen im Backend |

---

## Verhaltensregeln für KI-Assistenten

1. **Keine Datenverluste:** Bei Datenbank-Änderungen IMMER `IF NOT EXISTS` oder `DO $$ BEGIN ... EXCEPTION ... END $$;` verwenden. Keine Tabellen droppen.
2. **Keine neuen `any`-Typen:** TypeScript strikt verwenden. Zod für API-Validierung nutzen.
3. **Mobile First:** Bei neuen UI-Komponenten immer prüfen, wie sie auf einem Smartphone aussehen.
4. **Keine nativen Alerts:** `window.alert` und `window.confirm` sind verboten. Nutze `Toast` und `ConfirmDialog`.
5. **Farben:** Nutze die CSS-Variablen aus dem RamboFlow-Theme (`accent-primary`, `bg-dark-100`), keine hartcodierten Tailwind-Farben (`bg-blue-500`), es sei denn, es ist semantisch zwingend (z.B. Fehler = Rot, Info-Toast = Blau, Status „open" = Blau).
6. **Zod-Validierung ist Pflicht** — jede neue Route muss Eingaben mit Zod + `validate()` middleware validieren.
7. **Kein `SELECT *`** — immer explizite Spaltenlisten in SQL-Queries.
8. **Soft-Delete beachten** — Queries auf `customers`, `projects`, `activities`, `contracts` immer mit `WHERE deleted_at IS NULL` filtern. DELETE-Endpoints nutzen `UPDATE SET deleted_at = NOW()`, nicht `DELETE FROM`.
9. **Paginierung bevorzugen** — neue Listenendpunkte immer mit `?page=&limit=` implementieren. Legacy-Clients via `?all=true` rückwärtskompatibel halten.
10. **`password_hash` niemals zurückgeben** — in keiner API-Antwort.
11. **Lazy Loading beibehalten** — neue schwere Komponenten in `App.tsx` als `lazy()` importieren.
12. **Rückwärtskompatibilität** — Legacy-Clients müssen weiterhin funktionieren (`?all=true` für entries, ältere Field-Defaults).
13. **Branch-Konvention beachten** — Feature-/Fix-Branches IMMER von `claude/next-version-roadmap-ks0D0` ausgehen, PRs gegen denselben Branch eröffnen (= Hetzner-Stand). Niemals direkt gegen `main`. Details siehe Sektion „Branch-Konvention" oben.

---

## Bekannte Probleme (pre-existing)

- `CalendarView.tsx` hat mehrere TypeScript-Fehler (react-big-calendar Typen) — Teil der 476 Frontend-TS-Baseline.
- Social Media Modul postet aktuell nicht wirklich an Plattformen (nur Datenbankeinträge).
- Offline-Sync funktioniert nur für Zeiteinträge, nicht für andere Aktionen.
- Lead-Modul hat Datenbankschema aber keine Frontend-Ansicht.
- `database.ts` ist mit 3300+ Zeilen zu groß — sollte in separate Migrationsdateien aufgeteilt werden.

---

*Zuletzt aktualisiert: 17.5.2026 — nach Sprint-Abschluss (Soft-Delete + Zod + Pagination) und Epic 4.1 + Branding-Komplettierung.*
