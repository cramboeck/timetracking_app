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
| Auth | JWT (Access Token + Refresh-Token seit PR #71) |
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
- **Lücken:** Tickets ohne Bulk-Actions; SLA-Warnungen nur im Detail-View. (~~`AlertsView` muss manuell refreshed werden~~ — gelöst in PR #81: TanStack Query mit `refetchInterval: 30 s` polled jetzt automatisch.)

### CRM
- Fragmentiert: `CustomerHub.tsx` ist sehr umfangreich (360°), aber `Leads.tsx` und `SalesPipeline.tsx` wirken wie separate Apps
- **Verbesserungsidee:** Sales Pipeline → Angebots-Editor verknüpfen; bei Lead „Won" automatisch Projekt + Vertrag anlegen

### Arbeiten (Zeiterfassung)
- **Verbesserungsidee:** Stoppuhr als persistentes, schwebendes Widget in der gesamten App (nicht nur im „Arbeiten"-Tab)

---

## Aktueller Stand (Stand 18.5.2026)

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
| Theme-Token-Fix: 3049 `dark:*-gray-*` → `dark-*` Tokens (136 Files) — sonst hatten die `tone-*` Klassen keinen visuellen Effekt | #66 |
| 15 verbliebene blue-Stellen (Status „open", Info-Toast, Facebook-Brand, etc.) — intentional semantisch blau | — |

### Epic 6 — UI/UX-Polish — ✅ abgeschlossen

| Task | PR |
|---|---|
| Globaler Timer als persistentes Bottom-Bar-Widget in der App-Shell (Mobile) | #73 |
| `GlobalTimerWidget.tsx` neu — Live-Counter, Tap-to-Stopwatch, integrierter Stop-Button | #73 |
| FAB-Guard (Widget übernimmt Running-State, FAB nur noch Start-Modus) | #73 |
| Skeleton Loaders für `TicketList.tsx` (6× `SkeletonListItem`) | #78 |
| Skeleton Loaders für `TimeEntriesList.tsx` + Bug-Fix (kein „Keine Einträge gefunden"-Flash mehr während Initial-Load) | #78 |
| Skeleton Loaders für `CustomerHub.tsx` via `isInitialDataLoading`-Prop | #78 |
| App-Level `isInitialDataLoading` State (gefüttert aus `Promise.all`-Boot-Fetch) | #78 |
| Bento-Grid Dashboard: `DashboardOverview.tsx` rewrite mit Hero-Kachel (2×2), Live-Ticker bei laufendem Timer, Wochenziel-Progress, 4 KPI-Tiles | #78 |
| `sumDurationSeconds()` Helper extrahiert (war 4× dupliziert) | #78 |
| Pre-existing Wochen-Montag-Off-by-one gefixt | #78 |

### Refresh-Token (Epic 7 Punkt 4) — ✅ abgeschlossen

| Task | PR |
|---|---|
| Refresh-Token-Mechanismus (Access + Refresh, smoke-tested 10/10) | #71 |
| Hotfix: `refresh_tokens` FK Type-Mismatch (`users.id` ist TEXT, nicht UUID) | #72 |

### Epic 5 Pass 1 — Toten Code entfernen — ✅ abgeschlossen

| Task | PR |
|---|---|
| `Dashboard.tsx` (1683 LOC) gelöscht — Saved-Reports + PDF-Export bereits in `ReportsPage.tsx` / `ReportAssistant.tsx` abgedeckt | #80 |
| `Billing.tsx` (632 LOC) gelöscht — `BillingOverview.tsx` ist die lebende Variante in `Finanzen.tsx` | #80 |
| `BillingWidget.tsx` (159 LOC) gelöscht — wurde nur von `Dashboard.tsx` genutzt (transitiv tot) | #80 |
| `Navigation.tsx` (122 LOC) gelöscht — durch `AreaNavigation.tsx` ersetzt, nirgends mehr importiert | #80 |
| `ARCHITECTURE.md` + `docs/NEXT_VERSION_ROADMAP.md` an den Stand angeglichen | #80 |

Gesamt: **2596 LOC tot entfernt**. TS-Errors sanken von 474 auf 468 (die toten Files hatten eigene Errors). Verbleibender Konsolidierungspunkt: `TaskHub.tsx` vs `TasksOverview.tsx` — beide live, kein toter Code.

### Epic 5 Pass 2 — TanStack Query Pilot (AlertsView) — ✅ abgeschlossen

| Task | PR |
|---|---|
| `@tanstack/react-query` v5.100 installiert | #81 |
| `src/lib/queryClient.ts` — QueryClient mit Defaults (staleTime 30 s, retry 1, refetchOnWindowFocus) | #81 |
| `QueryClientProvider` in `main.tsx` zwischen `ErrorBoundary` und `BrowserRouter` gewrapped | #81 |
| `AlertsView.tsx`: 2 `useEffect`+`loadData` → 2 `useQuery`-Hooks (config, alerts) | #81 |
| `AlertsView.tsx`: 3 `handle*`-Funktionen → 3 `useMutation`-Hooks (sync, createTicket, resolve) mit optimistic `setQueryData` | #81 |
| `selectedAlert` als State-Kopie → `selectedAlertId` + `useMemo`-Lookup (Modal-State synct sich automatisch mit Polling) | #81 |
| `refetchInterval: 30 s` auf Alerts — löst die „AlertsView muss manuell refreshed werden"-Lücke aus dem Modul-Status | #81 |

TS-Errors: 466 (von 468 — der Refactor entfernte 2 nebenher). Bundle +40 KB für TanStack Query. Verbleibend für Epic 5: `Tickets.tsx`-Subtree (TicketList/TicketDashboard/TicketKanban/TasksOverview) auf useQuery umstellen, danach React Router-Refactor.

### Epic 5 Pass 3a — TanStack Query: Tickets-Übersichten — ✅ abgeschlossen

| Task | PR |
|---|---|
| `TasksOverview.tsx`: useEffect+loadTasks → useQuery, updateTask → useMutation mit optimistic `setQueriesData` | #82 |
| `TicketDashboard.tsx`: useEffect+loadDashboard → useQuery (nutzt `dataUpdatedAt` für lastRefresh) | #82 |
| `TicketList.tsx`: 2 useEffects (load + debounced search) → 3 useQuery-Hooks (list/stats/search) mit `keepPreviousData` für flüssige Search | #82 |
| `TicketKanban.tsx`: kombinierter tickets+tags Fetch in 1 useQuery, teamMembers in eigener useQuery (staleTime 5 min, shared cache), drag-update → useMutation mit `onMutate` optimistic + `onSettled` invalidate | #82 |
| `Tickets.tsx`: `refreshKey`-Pattern (5 Stellen) komplett raus → `queryClient.invalidateQueries({ queryKey: ['tickets'] })`, `refreshKey` prop aus `TicketKanban` entfernt | #82 |

TS-Errors: 465 (von 466 — TasksOverview `EyeOff`-Import nebenher entfernt). Bundle unverändert. Cross-Component-Sync gratis: Kanban-Drag → Dashboard/List/Tasks refetchen automatisch beim nächsten Mount.

### Epic 5 Pass 3b — TanStack Query: TicketDetail — ✅ abgeschlossen

| Task | PR |
|---|---|
| 10 Reads als `useQuery`: `['ticket', id]` (mit comments/timeEntries), `['ticket', id, 'tags'\|'attachments'\|'tasks'\|'activities'\|'emails'\|'aiSuggestions']`, plus `['org','current']`, `['tickets','allTags']`, `['tickets','cannedResponses']`, `['ai','config']` | #83 |
| Lazy-Load via `enabled:`-Gate für Activities (manual onLoad), AI-Suggestions (gated auf `showAiPanel`), Email-History (gated auf `ticket.source === 'email'`) | #83 |
| Tag-Mutations (add/remove/create) → `setQueryData` auf `['ticket', id, 'tags']` + `['tickets','allTags']`; createTag kettet `addTag` direkt durch | #83 |
| `updateTicketMutation` mit Variable für Status (handleArchive/Restore teilen sich denselben Codepfad), `setQueryData(['ticket', id])` + `invalidateQueries(['tickets'])` — Liste/Kanban/Dashboard synct automatisch | #83 |
| `saveSolutionMutation`, `addCommentMutation` (refetch nur bei !isInternal für SLA), `deleteMutation` (mit onTicketDeleted-Callback) | #83 |
| 6 Task-Mutations mit `setQueryData(['ticket', id, 'tasks'])` + `invalidateQueries(['tasks'])` — TasksOverview synct bei nächstem Mount | #83 |
| Attachment-Mutations: `handleUploadFiles` bleibt async (FormData-Bau), schreibt direkt in den Cache; `handleDeleteAttachment` als `useMutation` mit confirm-Gate | #83 |
| AI-Generation: `generateAiMutation` prepended in `aiSuggestions`-Cache; `feedbackMutation` refetcht. `aiError` bleibt local für Inline-Feedback | #83 |
| Render-Loading-Flags durchgängig aus `query.isLoading`/`mutation.isPending` abgeleitet — eigene `deleting`/`archiving`/`savingSolution`/etc. raus | #83 |
| Aufgeräumt: 4 nie genutzte Imports (Button, MarkdownEditor, MarkdownRenderer, sanitizeEmailHtml — tot seit Aufsplittung in `ticket-detail/*`), `useCallback` unused, 2 pre-existing Type-Errors gefixt nebenbei | #83 |

TS-Errors: 458 (von 465 — 7 weniger durch Aufräumarbeit). Bundle unverändert. Diff: +296 / -348 in 1 File. Damit ist die TanStack-Query-Migration für den Ticket-Subtree komplett.

---

## Offene Aufgaben (Roadmap)

### Epic 5 — Architektur-Modernisierung (Priorität: Hoch)

1. **React Router einführen** — `App.tsx` (1100+ Zeilen) refactoren, echtes URL-Routing implementieren. `react-router-dom` v6.22 ist bereits installiert (wird aktuell nur für `/portal` und `/admin` genutzt).
2. ~~**TanStack Query (React Query)** — Setup + AlertsView (#81) + Tickets-Übersichten (#82) + TicketDetail (#83) erledigt.~~ ✅ Ticket-Subtree komplett auf TanStack Query.
3. **Toten Code entfernen** — Erster Pass (PR #80) entfernte `Dashboard.tsx`, `Billing.tsx`, `BillingWidget.tsx`, `Navigation.tsx` (2596 LOC tot). Verbleibender Konsolidierungspunkt: `TaskHub.tsx` vs `TasksOverview.tsx` (beide live, Details unten in „Duplikat-Auflösung"). `ManualEntry.tsx` wurde bereits mit PR #67 gelöscht.

### Epic 7 — Echtzeit & Automatisierung (Priorität: Mittel)

1. **Server-Sent Events (SSE)** für NinjaRMM Alerts und eingehende E-Mails.
2. **Push-Notifications** robuster — Service Worker (`push-sw.js`) härten, VAPID-Keys im Admin-Setup erzwingen.
3. **CRM-Finanzen-Brücke** — Angebote direkt aus der Sales Pipeline erstellen.
4. ~~**Refresh-Token-Mechanismus**~~ — ✅ in PR #71 + #72 erledigt, siehe „Aktueller Stand".

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

| Duplikat | Status |
|---|---|
| ~~`Dashboard.tsx` (1683 Z.) vs `DashboardOverview.tsx`~~ | ✅ `Dashboard.tsx` als tot gelöscht (PR #80). `DashboardOverview.tsx` ist die lebende Variante. |
| ~~`Billing.tsx` (632) + `BillingWidget.tsx` (159) vs `BillingOverview.tsx`~~ | ✅ `Billing.tsx` + `BillingWidget.tsx` als tot gelöscht (PR #80). `BillingOverview.tsx` (in `Finanzen.tsx` eingebunden) ist die lebende Variante. |
| `TaskHub.tsx` (563) vs `TasksOverview.tsx` (253) | Beide live, klare Trennung Tasks vs Tickets, ggf. zusammenführen. |

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
5. **Farben & Theme-Tokens:** Nutze die CSS-Variablen-Tokens (`bg-dark-50/100/200/300`, `border-dark-border`, `text-dark-400/500`, `bg-accent-primary`, `text-accent-dark` etc.), **niemals hartcodierte** Tailwind-Farben wie `dark:bg-gray-800` oder `dark:border-gray-700`. Die `dark-*` Tokens werden durch die `tone-*` Klasse (`tone-medium`/`tone-dark`/`tone-ramboeck`) per CSS-Variable umgesetzt — hardcodete `gray`-Klassen bleiben fix und ignorieren den Theme-Switch. Ausnahmen sind nur semantisch zwingende Stellen (Status-Color, Error-Badge = Rot, Info-Toast = Blau, Brand-Logos wie Facebook).
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

*Zuletzt aktualisiert: 18.5.2026 — nach Epic 6 Komplettierung (#73 + #78), Refresh-Token (#71 + #72), Epic 5 Pass 1 „Toten Code entfernen" (#80, -2596 LOC), Epic 5 Pass 2 „TanStack Query Pilot AlertsView" (#81), Epic 5 Pass 3a „TanStack Query: Tickets-Übersichten" (#82) und Epic 5 Pass 3b „TanStack Query: TicketDetail" (#83). Damit ist der Ticket-Subtree komplett auf TanStack Query.*
