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
  /config/database.ts   → DB-Schema + alle Migrationen (4400+ Zeilen)
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

- ~~**Architektur-Problem:**~~ ✅ Gelöst in Epic 5 Pass 4. App.tsx jetzt 1185 Zeilen, URL ist single source of truth (React Router). Deep-Linking und Browser Back/Forward funktionieren.
- **Daten-Fetching:** Ticket-Subtree + AlertsView auf TanStack Query migriert. ~50 useEffects verbleiben (TaskHub, TimeEntriesList, SocialMediaManager, Stopwatch etc.).
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
- ~~**Verbesserungsidee:**~~ ✅ Erledigt in PR #73 — `GlobalTimerWidget.tsx` zeigt laufenden Timer app-weit als persistentes Bottom-Bar-Widget.

---

## Aktueller Stand (Stand 10.6.2026)

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

### Epic 5 Pass 4a — React Router: URL ↔ State Sync — ✅ abgeschlossen

| Task | PR |
|---|---|
| `AreaNavigation.tsx`: Helpers `pathToAreaSubView()` + `areaSubViewToPath()` mit Standalone-Pfaden für `settings`/`social-media` | #85 |
| `App.tsx`: `useLocation`/`useNavigate` Hooks; Initial-State priorisiert URL → localStorage → Default | #85 |
| Bidirektionaler Sync via zwei `useEffect`s mit Path-Equality-Guards gegen Loops | #85 |
| Erster `navigate()` macht `replace: true` (verhindert Phantom-History-Entry beim Landing auf `/` oder ungültigen Pfaden) | #85 |
| Browser Back/Forward funktioniert; URLs sind bookmarkbar; Deep-Linking (`/support/tickets`, `/finanzen/billing`, etc.) | #85 |

Additive Migration — der `currentArea`/`currentSubView` State bleibt erstmal als Single-Source-of-Truth, URL ist gespiegelt. Pass 4b extrahiert Layout-Komponenten aus App.tsx (1437 Z.), Pass 4c entfernt den State zugunsten von `useParams`/`useLocation`.

TS-Errors: 458 (unverändert). Bundle +10 KB für Routing-Logik.

### Epic 5 Pass 4b — App.tsx schlanker machen via Custom Hooks — ✅ abgeschlossen

| Task | PR |
|---|---|
| `useSidebarCollapsed` neu (`src/hooks/`) — listening auf localStorage + `sidebar-toggle` event, returnt boolean | #86 |
| `useUserPreferences` neu — Load auf mount, debounced save (500 ms) bei area/subView-Änderung, localStorage als Fallback | #86 |
| `useAreaSync` neu — die Pass-4a-Logik (URL ↔ State bidirektional, Equality-Guards, replace beim ersten navigate) | #86 |
| `useSwipeNavigation` neu — Mobile Swipe-Gesten (Top 30 % SubView-Wechsel, Bottom 30 % Area-Wechsel, Mitte 40 % normales Scrollen), nutzt `useSwipeGesture` intern | #86 |
| App.tsx: alte useState/useEffect/useCallback-Blöcke ersetzt durch Hook-Aufrufe; `useLocation`/`useNavigate`/`useSwipeGesture`/`userApi` Imports raus | #86 |

App.tsx: **1437 → 1310 Zeilen** (-127), Diff +32/-194. TS-Errors: 458 (unverändert). Bundle unverändert.

### Epic 5 Pass 4b-extension — Offline-Sync-Hook — ✅ abgeschlossen

| Task | PR |
|---|---|
| `useOfflineEntrySync` neu — kapselt 4 State-Felder (isSyncing/syncError/pendingCount/failedCount), syncMutex-ref, `syncPendingEntries` (idempotent via `clientId`), Auto-Sync bei `online`-Transition, 30 s Periodic-Retry und Retry/Discard-Handler für die OfflineBanner | #87 |
| Hook nimmt `setEntries` als Arg (da der Sync den server-returned Entry zurück in App-State schreibt, und Discard das lokale Entry entfernt) | #87 |
| `refreshCounts()` aus dem Hook expose’d und an die 3 Entry-Handler-Stellen geleitet (Z. 438/487/549), die nach `addPendingEntry` den Counter aktualisieren mussten | #87 |
| `syncPendingEntries` als Methode des Hooks expose’d, von OfflineBanner als „Retry All" konsumiert | #87 |
| App.tsx: 9 offlineStorage-Imports + `useCallback` raus; ~100 Z. State+Sync-Logik durch einen Hook-Aufruf ersetzt | #87 |

App.tsx: **1310 → 1220 Zeilen** (-90 weitere, ‑217 vs. Pass-4a-Start). Hook ist 170 Zeilen, sauber kapselt. TS-Errors: 458 (unverändert). Bundle unverändert. Verbleibend für Pass 4: Pass 4c (echte `<Routes>`/`<Route>`, `currentArea`/`currentSubView` State entfernen, `useParams`/`useLocation` als single source).

### Epic 5 Pass 4c — URL als single source of truth — ✅ abgeschlossen

| Task | PR |
|---|---|
| `useCurrentNavigation` neu — derived `currentArea`/`currentSubView` direkt aus `useLocation`/`pathToAreaSubView` (kein React-State mehr); exposed `navigateToArea`/`navigateToSubView`/`navigateTo` als Setter-Ersatz | #88 |
| `useAreaSync` gelöscht (65 Zeilen) — der bidirektionale Sync ist obsolet, weil State nicht mehr existiert | #88 |
| `useUserPreferences` umgebaut — nimmt `navigateTo` statt `setCurrentArea`/`setCurrentSubView`; server-prefs werden nun via `navigate` angewendet | #88 |
| App.tsx: alle ~25 `setCurrentArea`/`setCurrentSubView`-Calls (Deep-Link-Handler, SW-Message, FAB, Forgotten-Timer-Banner, Dashboard onNavigate, CRMDashboard, CustomerHub, Tickets, Finanzen, GlobalTimerWidget) → `navigateTo(area, sub)` bzw. `navigateToSubView(sub)` | #88 |
| `handleAreaChange`/`handleSubViewChange` zu Aliassen für `navigateToArea`/`navigateToSubView` (weil AreaNavigation, CommandPalette und useSwipeNavigation diese Namen erwarten) | #88 |
| Unused imports raus: `Area`, `getAreaFromSubView`, `getDefaultSubView` | #88 |

App.tsx: **1220 → 1185 Zeilen** (-35 weitere, **‑252 vs. Pass-4a-Start**, −18 %). TS-Errors: 458 → **452** (-6 durch Cleanup). Hook-Datei `useAreaSync` weg, neue `useCurrentNavigation` mit 81 Zeilen. Bundle unverändert.

**Was sich verhaltensmäßig ändert:** Die URL ist jetzt **wirklich** die einzige Wahrheit. Bei einem Reload auf `/support/tickets` greift die URL, **bevor** Server-Prefs laden — vorher hätten beide Wege denselben State-Endwert produziert, aber prefs hatte das letzte Wort. Jetzt zwingt prefs zwar weiterhin per `navigate(prefs.area, prefs.subView)` zu der gespeicherten Ansicht (gleiches alte Verhalten); eine Optimierung „URL explicit gewählt → prefs ignorieren" könnte in Pass 5 nachgereicht werden.

Damit ist Pass 4 (React Router) komplett. Pass 5 könnte echte `<Routes>`/`<Route>`-Definitionen + Layout-Komponente einführen — aktuell rendert App.tsx noch ein switch via `currentSubView`, das funktioniert aber tadellos.

### UI-Polish — Globale Toast/ConfirmDialog Migration — ✅ abgeschlossen

| Task | PR |
|---|---|
| `src/contexts/UIContext.tsx` neu — globaler `UIProvider` mit `useToast(message, type?, duration?)` und `useConfirm({title, message, variant?, ...}) → Promise<boolean>` Hooks. Re-mount-via-key Pattern für wiederholte Toasts | — |
| `UIProvider` in `main.tsx` zwischen `FeaturesProvider` und `<Routes>` eingehängt — gilt für alle Routes inkl. Customer/Admin/Maintenance/Report-Portale | — |
| 116 native `window.alert()` / `window.confirm()` Calls in 27 Files migriert — Heuristik: „Fehler/konnte nicht" → error, „erfolgreich/gespeichert/kopiert" → success, „Bitte wähle/ist erforderlich" → warning, pure Info → info; Lösch/Entfern/Trenn-Confirms → variant `danger`, Konvertieren/VACUUM/Schließen → variant `warning` | — |
| Confirm-Pattern: `const ok = await confirm({...}); if (!ok) return;` — die enclosing Funktion wird async wo nötig. Lokaler Variable-Shadowing von `window.confirm` ist intentional | — |
| `ManualEntryModern.tsx`: lokaler `useToast`-State raus, nutzt jetzt globalen Hook (kein doppelter Toast-Render mehr) | — |
| `TeamContext.tsx` migriert: Provider rendert innerhalb von `UIProvider` (via Settings.tsx → App.tsx → main.tsx), daher Hook-Aufruf möglich | — |

TS-Errors: 452 (= Baseline). Bundle: +3 KB für UIContext. 33 Files geändert, +512/-158. Damit ist der Roadmap-Punkt „alle verbleibenden `window.alert()`/`confirm()` durch `ConfirmDialog`" erledigt.

### Zeiterfassung — Neue Features (Mai/Juni 2026)

| Task | Commit |
|---|---|
| **WeeklyGridView** — Wochenraster-Ansicht für Zeiteinträge | ef09a61 |
| Schnell-Edit Beschreibungen im Wochenraster | 0908505 |
| Beschreibungs-Vorlagen aus alten Einträgen | d4f8dca |
| Tätigkeit als Pille in der Eintragsliste | 1515ca0 |
| Zeiten-Konsolidierung: Wochenraster/Liste/Kalender unter „Zeiten" | ecbd0ae |

### Finanzen/Belege — SSOT-Migration (Phase 1-3)

| Task | Commit |
|---|---|
| **Belege-SSOT Phase 1**: Schema-SSOT + persistierte OCR-Extraktion | 80eebc8 |
| **Belege-SSOT Phase 2**: Manual-Upload + SourceBadge + ON-CONFLICT-Fix | ce45f2b |
| **Belege-SSOT Phase 3**: sevDesk-Voucher-Cache + UI-Konsolidierung | 80bb6df |
| Globale Dokumenten-Suche (Rechnungen + Angebote + Belege) | ef3deaf |
| Volltextsuche für Eingangsrechnungen | 7af0362 |
| sevDesk Kunden-Mapping-Fix | 498d7db |
| Kundenspezifisches Position-Template mit Vertrags-Bezug | e590c12 |

### Tasks & Auth (Mai/Juni 2026)

| Task | Commit |
|---|---|
| **TaskHub integrativ** — Union, Inbox, Quick-Add, Cross-Nav | efbb042 |
| Toast bei Session-Ablauf + focus-Revalidierung | 7c7e4a6 |
| Access-Token-TTL: 1h → 8h | 9ac6879 |
| Mobile Logout-Schleife behoben | ff2b493 |
| Race-Fix: edit/delete vor Refetch in TimeEntriesList | b567096 |

---

## Offene Aufgaben (Roadmap) — Priorisiert nach Sprints

> **Für Claude Code:** Sprints der Reihe nach abarbeiten. Nach jedem PR die Checkbox in der jeweiligen Tabelle auf ✅ setzen und PR-Nummer eintragen. Branch-Konvention beachten (immer von `claude/next-version-roadmap-ks0D0` abzweigen, PR gegen denselben Branch).

### 🔴 Sprint 1 — Sicherheit (kritisch, sofort umsetzen)

Diese Punkte sind **Sicherheitslücken** und müssen vor allen anderen Aufgaben behoben werden.

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Zod-Schemas für sevdesk.ts** — alle ~15 Endpoints validieren | `server/src/routes/sevdesk.ts` | 4-6h | 14 Endpoints + 20 Schemas. Commit 96c2aa3. |
| ✅ | **Zod für Belege-Routen** — Phase-1-3-Endpoints nachrüsten | `server/src/routes/sevdesk.ts` | 2-3h | Mit obigem Commit erledigt (vouchers/upload, vouchers/create). |
| ✅ | **Bounds-Checks** für page/limit in admin.ts | `server/src/routes/admin.ts` | 1h | 3 Endpoints (users, audit-logs, maintenance). Commit 96c2aa3. |
| ✅ | **Zod für alle Backend-Module** — komplette Validierung | 10 weitere Dateien | 4-6h | Commit 3a42d62 + 3e66805: microsoft365.ts (11), admin.ts (10), ninjarmm.ts (5), mfa.ts (4), features.ts (1), organizations.ts (4), push.ts (3), import.ts (6), knowledge-base.ts (6). Alle Routes mit POST/PUT/PATCH haben jetzt Zod. |

**Hinweis:** `customer-portal.ts` und `customer-metrics.ts` verwenden `safeParse()`-Muster statt `validate()`-Middleware — funktional äquivalent, nur anderes Pattern.

### 🟠 Sprint 2 — Farb-Cleanup & Toter Code

Diese Punkte betreffen die visuelle Konsistenz (Theme-Switch) und Code-Hygiene.

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Purple-Cleanup** — ~194 `purple-*` Klassen auf Design-Tokens umstellen | 34 Dateien | 3-4h | Commit 0d31ef5. Alle purple-* → accent-* Tokens. Ausnahmen belassen: AI-Kontext (lila = KI), Social-Media Gradients (Instagram Brand). |
| ✅ | **Toter Code entfernen** — 4 Komponenten ohne Imports | diverse | 1h | Commit 0d31ef5. `CustomerView.tsx`, `SevdeskDocuments.tsx`, `SwipeableRow.tsx`, `VendorHub.tsx` gelöscht. |
| ⏸️ | **text-gray-* Cleanup** — `text-gray-*` ohne `dark:`-Pendant auf `text-dark-400/500` umstellen | ~495 Stellen | 4-6h | **Pausiert:** Viele "fehlende" dark: Varianten sind auf separaten Zeilen (z.B. Button.tsx). Automatische Ersetzung birgt hohes Regressionsrisiko. Manuelle Prüfung pro Datei erforderlich. Priorität: SocialMediaManager.tsx (118), Finanzen.tsx (29), MaintenanceView.tsx (26). |

### ✅ Sprint 3 — Performance & Konsistenz

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Tickets-Paginierung** im Main-Endpoint | `server/src/routes/tickets.ts` | 3-4h | Commit 1d46536. `?page=&limit=50` (max 200), `?all=true` Legacy, `?searchText=` Filter, SELECT * eliminiert. |
| ✅ | **SELECT * eliminieren** — batch-weise in allen Routes | 31 Dateien | 6-8h | Alle direkten Tabellen-SELECT * durch explizite Spaltenlisten ersetzt (Commits 238a621, 8d76960, 2ff11a9, 29e5abe). Verbleibend nur: `SELECT * FROM (subquery)` Patterns (OK). |
| ✅ | **Multi-Tenancy**: `organization_id` für ~30 Tabellen nachrüsten | `server/src/config/database.ts` | 4-6h | Commit d750b30. 21 Tabellen mit `organization_id` erweitert, Backfill via `user_id` → `organization_members` bzw. Parent-Tabellen. |
| ✅ | **Fehlende DB-Indexes** auf `organization_id` | `server/src/config/database.ts` | 1-2h | Commit d750b30. 24 Indexes erstellt (21 neue Tabellen + `ticket_tag_assignments`, `ticket_sequences_new`, `ticket_email_attachments`). |

### 🟢 Sprint 4 — Features (unabhängig, jederzeit einschiebbar)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **Vertrags-Stunden-Cron** — automatische Stunden-Abrechnung aus Verträgen | neue Datei `server/src/jobs/contractHoursCron.ts` | 4-6h | Tabellen `contracts` + `contract_hours` existieren bereits. Job soll täglich prüfen ob gebuchte Stunden das Kontingent überschreiten und eine Warnung erstellen. |
| ⬜ | **CommandPalette-Historie** — letzte 3-5 Aktionen anzeigen | `src/components/CommandPalette.tsx` | 2-3h | Via `localStorage` persistieren. Beim Öffnen der Palette als erste Sektion „Zuletzt verwendet" anzeigen. |
| ⬜ | **CRM-Finanzen-Brücke** — Angebote direkt aus Sales Pipeline erstellen | `src/components/SalesPipeline.tsx` + `QuoteEditor.tsx` | 4-6h | Bei Lead-Status „Won" Button „Angebot erstellen" → öffnet `QuoteEditor` mit vorausgefülltem Kunden. |
| ⬜ | **SSE für Echtzeit-Updates** — NinjaRMM Alerts ohne Polling | neuer Endpoint `server/src/routes/sse.ts` + Frontend | 1-2 Tage | `EventSource` im Frontend, `res.write('data: ...\n\n')` im Backend. Ersetzt den 30s-Poll in `AlertsView.tsx`. |
| ⬜ | **Mobile-Strategie** — TicketKanban auf Mobile deaktivieren, Tabellen → Card-Layout | `src/components/TicketKanban.tsx` + diverse | 3-4h | Kanban-Board auf `md:` breakpoint verstecken, stattdessen Card-Liste zeigen. |

### 🔵 Sprint 5 — Tech-Debt & Architektur (unabhängig, jederzeit einschiebbar)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **TS-Fehler auf 0** (~16 verbleibend) | `PostsTab.tsx`, `TemplatesTab.tsx`, `CRMDashboard.tsx`, `CalendarView.tsx` | 2-3h | Hauptsächlich Platform-Type-Mismatch im Social-Media-Modul. |
| ⬜ | **TanStack Query** für TaskHub, TimeEntriesList, Stopwatch | diverse | 4-6h | Analog Epic 5 Pass 3. `useEffect`+`loadData` → `useQuery`, Mutations via `useMutation`. |
| ⬜ | **SocialMediaManager.tsx splitten** (6482 Zeilen) | `src/components/SocialMediaManager.tsx` | 1 Tag | In `PostsTab`, `TemplatesTab`, `AnalyticsTab`, `CalendarTab` aufteilen. Lazy-Import in App.tsx. |
| ⬜ | **Test-Setup** (Vitest) + erste Unit-Tests | neue Dateien | 1 Tag | Fokus: `src/utils/`, `src/hooks/`, Backend-Middleware. |
| ⬜ | **React Router v7 Upgrade** | `package.json` + alle Router-Imports | 1 Tag | Von v6.22 → v7. Breaking Changes: `<Routes>` → `<Routes>` (kompatibel), aber `useNavigate`-API leicht geändert. |
| ⬜ | **Push Subscriptions zusammenführen** | `server/src/config/database.ts` + Routes | 2-3h | `push_subscriptions` + `portal_push_subscriptions` in eine Tabelle mit `type`-Spalte. |

---

## Abgeschlossene Epics (Referenz)

### Epic 5 — Architektur-Modernisierung ✅

- ~~**React Router**~~ — Pass 4 komplett (#85-#88). App.tsx: 1437 → 1185 Z. (−18 %). URL ist single source of truth.
- ~~**TanStack Query**~~ — Ticket-Subtree + AlertsView komplett migriert (#81-#83).
- ~~**Toter Code**~~ — 2596 LOC entfernt (#80). TaskHub/TasksOverview klar getrennt.
- ~~**alert/confirm Migration**~~ — 116 Calls → UIContext.

### Epic 7.4 — Refresh-Token ✅
- PR #71 + #72 erledigt.

### Epic 6 — UI/UX-Polish ✅
- GlobalTimerWidget, Skeleton Loaders, Bento-Grid Dashboard.

---

## Weitere offene Tasks (mittelfristig)

### Datenbank-Konsistenz & Multi-Tenancy

#### ~~Multi-Tenancy Lücken schließen~~ ✅
**Gelöst in Sprint 3 (Commit d750b30):** 21 Tabellen mit `organization_id` erweitert. Backfill via `user_id` → `organization_members` bzw. Parent-Tabellen (tickets → ticket_comments, leads → lead_activities, tasks → task_checklist_items).

#### ~~Fehlende Indexes~~ ✅
**Gelöst in Sprint 3 (Commit d750b30):** 24 Indexes auf `organization_id` erstellt.

### Sonstige Aufgaben

| Task | Status |
|---|---|
| Mobile-Strategie: TicketKanban auf Mobile deaktivieren, Tabellen → Card-Layout | Offen |
| CRM-Finanzen-Brücke: Angebote direkt aus Sales Pipeline erstellen | Offen |
| Push-Notifications: VAPID-Keys im Admin-Setup erzwingen | Offen |
| Social Media: Echtes Posten an Plattformen (aktuell nur DB-Einträge) | Offen |
| Push Subscriptions: `push_subscriptions` + `portal_push_subscriptions` zusammenführen | Offen |

### Langfristig — Architektur

| Task | Beschreibung |
|---|---|
| Schichtenarchitektur (Controller/Repository) | Pilot: `tickets.ts` aufteilen |
| `any`-Typen eliminieren | ca. 40+ Stellen im Backend |
| React Router v7 Upgrade | von v6.22 → v7, dann echte `<Routes>`/`<Route>` |
| React 19 Upgrade | Server Components, `use()` Hook (Drittanbieter-Kompatibilität prüfen) |

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

- **TS-Fehler-Baseline: ~16 Fehler** (von ehemals 452). Hauptsächlich in Social-Media-Modul (Platform-Type-Mismatch in PostsTab/TemplatesTab), CRMDashboard, CalendarView. Backend kompiliert fehlerfrei.
- Social Media Modul postet aktuell nicht wirklich an Plattformen (nur Datenbankeinträge).
- Offline-Sync funktioniert nur für Zeiteinträge, nicht für andere Aktionen.
- `database.ts` ist mit 4400+ Zeilen zu groß — sollte in separate Migrationsdateien aufgeteilt werden.

### Tickets — Offene Bugs & Verbesserungen (Stand 12.6.2026)

| Priorität | Problem | Beschreibung |
|---|---|---|
| 🔴 Hoch | **KI-generierter Text nicht lesbar** | Text bei KI-Antworten in Tickets hat Kontrastprobleme (vermutlich Dark-Mode-Token fehlen) |
| 🟠 Mittel | **Attachment-Handling verbessern** | Upload/Download/Vorschau von Anhängen bei Tickets unzureichend |
| 🟠 Mittel | **E-Mail-Anhänge verarbeiten** | Anhänge aus eingehenden E-Mails werden nicht korrekt ans Ticket gehängt |
| 🟡 Normal | **Ticket-Darstellung optimieren** | Allgemeine UI/UX-Verbesserungen für Ticket-Ansicht und -Handling |
| 🟡 Normal | **Schnittstellen-Optimierung** | Integration mit externen Systemen (NinjaRMM, E-Mail) verbessern |

### ✅ Sicherheitslücken — Alle behoben

- ~~**`sevdesk.ts` hat KEINE Zod-Validierung**~~ ✅ Gelöst in Sprint 1 (Commit 96c2aa3). 14 Endpoints + 20 Schemas validiert.
- ~~**`SELECT *` in 31 Dateien**~~ ✅ Gelöst in Sprint 3 (Commits 238a621, 8d76960, 2ff11a9, 29e5abe). Alle direkten Tabellen-SELECT * durch explizite Spaltenlisten ersetzt.
- ~~**`parseInt` ohne Bounds in admin.ts**~~ ✅ Gelöst in Sprint 1 (Commit 96c2aa3). Bounds-Checks mit `Math.min(limit, 200)` eingeführt.

---


---

## Neue Anforderungen — Interne Arbeitszeiterfassung & Kundenportal (Stand 12.6.2026)

> **Für Claude Code:** Sprints 1–3 sind abgeschlossen ✅. **Empfohlene Reihenfolge:**
> 1. **Sprint A** (DB-Fundament) — Voraussetzung für B, D, F
> 2. **Sprint C** (Portal-Fundament) — kann parallel zu A, Voraussetzung für D, E
> 3. **Sprints B, D, E, F** — nach ihren Abhängigkeiten
> 4. **Sprints 4 + 5** (Features + Tech-Debt) — unabhängig, können jederzeit eingeschoben werden
>
> Alle Architekturentscheidungen sind bereits getroffen und verbindlich — keine Rückfragen nötig.

### Architekturentscheidungen (verbindlich)

| Entscheidung | Festlegung |
|---|---|
| Wer darf `customer_visibility` setzen? | **Nur Admin und Manager** — Feld für andere Rollen read-only |
| Bulk-Aktion für Altdaten? | **Ja** — einmalige Admin-Aktion mit Vorschau + Bestätigungsdialog |
| Stunden nach Mitarbeiter im Portal? | **Nein** — nur Projektsummen (Datenschutz) |
| Einladungslink? | **E-Mail primär + Clipboard-Fallback** |
| Abwesenheitskalender? | **Ja** — als Sprint F nach Sprint B |

---

### ✅ Sprint A — Datenbankfundament: Buchungsarten und Kundensichtbarkeit

**Abhängigkeit:** keiner | **Kann parallel zu:** Sprint C

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Migration: `entry_scope` + `internal_category` + `customer_visibility`** | `server/src/config/database.ts` | 2h | Commit c23b069. Alle Spalten + project_id DROP NOT NULL + 2 Indexes. |
| ✅ | **Zod-Schema aktualisieren** | `server/src/routes/entries.ts` | 1h | Commit c23b069. projectId optional, .refine() Regel, neue Felder in INSERT/UPDATE. |
| ✅ | **TypeScript-Interface aktualisieren** | `src/types.ts` | 30min | Commit c23b069. EntryScope + CustomerVisibility Types, TimeEntry erweitert. |

---

### ✅ Sprint B — UI: Erfassungsmaske für interne Arbeitszeit

**Abhängigkeit:** Sprint A vollständig | **Status:** Komplett

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Buchungsart-Auswahl in Stopwatch + ManualEntry** | `src/components/Stopwatch.tsx`, `src/components/ManualEntryModern.tsx` | 3h | Commit 21a8352. Segmented Control: „Projektzeit" / „Intern" / „Abwesenheit". Bei Intern/Abwesenheit: Projekt-Dropdown ausblenden, Kategorie-Dropdown einblenden. Interne Kategorien: Admin, Vertrieb, Marketing, Weiterbildung, Meeting, Interner Support, Reise. Abwesenheits-Kategorien: Urlaub, Krankheit, Sonderurlaub. `is_billable` bei Abwesenheit auto=false. |
| ✅ | **Buchungsart-Badge in Zeitliste** | `src/components/TimeEntriesList.tsx` | 1h | Commit 923cf62. Grau + Coffee-Icon = Interne Zeit, Orange + Calendar-Icon = Abwesenheit. Badge zeigt Kategorie-Label. |
| ✅ | **Filter nach Buchungsart** | `src/components/TimeEntriesList.tsx` | 1h | Commit 923cf62. Dropdown-Filter: Alle / Projektzeit / Interne Zeit / Abwesenheit. |
| ✅ | **Neuer Tab: Interne Auswertung** | `src/components/InternalTimeReport.tsx` (neu) | 2h | Commit 64a682a. Unter „Berichte" → Tab „Interne Auswertung". Summary-Cards, Kategorie-Aufteilung mit Balken, Abwesenheitsübersicht, Detail-Tabelle. **Export:** CSV für Steuerberater/Lohnabrechnung, Kopieren, E-Mail-Versand. |

---

### 🟡 Sprint C — Portal-Fundament bereinigen

**Abhängigkeit:** keiner | **Kann parallel zu:** Sprint A, B

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **Einheitliches Berechtigungsmodell** | `server/src/routes/customer-portal.ts`, `server/src/config/database.ts` | 2h | `getContactPermissions()` liest ausschließlich aus `customer_portal_users`. Felder aus `customer_contacts` nur als Vorschlagswerte beim Einladen. Migration: `ALTER TABLE customer_portal_users ADD COLUMN IF NOT EXISTS can_view_time_report BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS can_view_contract BOOLEAN NOT NULL DEFAULT false;` |
| ⬜ | **Einladungsfluss reparieren** | `src/components/CustomerHub.tsx`, `server/src/routes/contacts.ts` | 3h | Button „Portal-Zugang aktivieren" ist Placeholder → vollständiger Fluss: POST `/api/contacts/:id/portal-invite` → Aktivierungstoken + E-Mail-Versand (wenn SMTP konfiguriert) + Clipboard-Fallback. Aktivierungsseite `/portal/activate?token=...`. Statusanzeige: Eingeladen / Aktiv / Deaktiviert. Button „Einladung erneut senden". |
| ⬜ | **PortalSettings konsolidieren** | `src/services/api/portal.ts`, `src/services/api/tickets.ts`, `src/components/KnowledgeBaseSettings.tsx` | 1h | Zwei `PortalSettings`-Interfaces zusammenführen → kanonisches Interface in `portal.ts`. Interface in `tickets.ts` entfernen. Neue Felder: `showTimeReport: boolean`, `showContractInfo: boolean`, `welcomeMessage: string \| null`, `companyName: string \| null`. |

---

### 🟢 Sprint D — Kundenportal: Stundentransparenz und Vertragsansicht

**Abhängigkeit:** Sprint A + Sprint C vollständig

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **Backend: Portal-Zeitreport-Route** | `server/src/routes/customer-portal.ts` | 2h | `GET /api/portal/time-report?month=YYYY-MM`. Prüft `can_view_time_report`. Filtert `time_entries` nach `customer_id`, `customer_visibility IN ('summary','detailed')`, `entry_scope = 'customer_project'`. Response: `{ month, totalHours, billableHours, byProject: [{projectId, projectName, hours, billableHours}], byCategory? }`. Keine Mitarbeiternamen in der Response (Datenschutz). |
| ⬜ | **Frontend: PortalTimeReport-Komponente** | `src/components/portal/PortalTimeReport.tsx` (neu) | 3h | Monatsauswahl, Übersichtskarte (Gesamtstunden, verrechenbar, Restkontingent wenn Vertrag), Tabelle pro Projekt, aufklappbare Detailansicht bei `customer_visibility = 'detailed'`. In `CustomerPortal.tsx` als View `'time-report'` einbinden. In `PortalLayout.tsx` Navigationspunkt „Stunden" (nur wenn `contact.canViewTimeReport`). |
| ⬜ | **Backend: Portal-Vertragsroute** | `server/src/routes/customer-portal.ts` | 1h | `GET /api/portal/contract`. Prüft `can_view_contract`. Gibt aktiven Vertrag zurück: Name, Laufzeit, enthaltene Stunden/Monat, verbrauchte Stunden aktueller Monat, SLA-Reaktionszeit, Status. |
| ⬜ | **Frontend: PortalContract-Komponente** | `src/components/portal/PortalContract.tsx` (neu) | 2h | Kontingent-Fortschrittsbalken, SLA-Reaktionszeiten, Vertragslaufzeit, Ansprechpartner. In `CustomerPortal.tsx` als View `'contract'` einbinden. |

---

### 🔵 Sprint E — Kundenportal: Qualitätsverbesserungen

**Abhängigkeit:** Sprint C vollständig | **Kann parallel zu:** Sprint D

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **Ticket-Liste: Informationsdichte erhöhen** | `src/components/portal/PortalTicketList.tsx` | 2h | Pro Zeile: letztes Update (relativ), zuständiger Mitarbeiter (Vorname), SLA-Ampel (grün/gelb/rot), Prioritäts-Badge. Statusbezeichnungen kundenfreundlich: `in_progress` → „In Bearbeitung", `waiting_for_customer` → „Ihre Rückmeldung erforderlich". |
| ⬜ | **Ticket-Erstellung: Formular verbessern** | `src/components/portal/PortalCreateTicket.tsx` | 2h | Neue Felder: Gerät (Dropdown aus Kundengeräten, optional), Dringlichkeit (Normal/Dringend/Kritisch), Anhänge (max. 3 Dateien, max. 10 MB). Bestätigungsseite mit Ticket-Nummer nach Absenden. |
| ⬜ | **Geräte: Warnungen prominenter** | `src/components/portal/PortalDevices.tsx` | 1h | Geräte mit Warnungen oben (Sortierung nach Kritikalität). Zusammenfassungskarte: „X Geräte mit Warnungen". TeamViewer-Link als prominenter Button. |
| ⬜ | **Portal-Dashboard als Startseite** | `src/components/portal/PortalDashboard.tsx` (neu) | 2h | Ersetzt leere Ticket-Ansicht als Einstieg. Zeigt: offene Tickets (Anzahl + letztes Update), Geräte mit Warnungen, Stunden diesen Monat (wenn `canViewTimeReport`), Restkontingent (wenn Vertrag). Ticket-Liste bleibt als eigener View erhalten. |

---

### ✅ Sprint F — Abwesenheitskalender und Teamübersicht

**Abhängigkeit:** Sprint B vollständig | **Status:** Komplett (Commit 95ba593)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Abwesenheitskalender (eigene Einträge)** | `src/components/AbsenceCalendar.tsx` | 3h | Monatskalender mit farbcodierten Abwesenheiten (Urlaub=grün, Krankheit=rot, Sonderurlaub=gelb). Monats-/Jahresstatistik. Erreichbar unter „Berichte" → „Abwesenheit". |
| ✅ | **Teamübersicht für Admin/Manager** | `src/components/TeamAbsenceOverview.tsx` | 3h | Gantt-artige Jahresübersicht aller Teammitglieder. Heute-Marker, Monatsheader, Jahresnavigation. Nutzt `GET /api/entries/team?entryScope=absence`. Erreichbar unter „Berichte" → „Team-Urlaub" (nur Admin/Owner). |
| ✅ | **Admin-Zeitenübersicht (alle Teammitglieder)** | `src/components/AdminTeamTimeView.tsx`, `server/src/routes/entries.ts` | 3-4h | Dashboard mit Dropdown zur Mitarbeiterauswahl, Zeiten-Liste org-weit, Filter, CSV-Export. Erreichbar unter „Berichte" → „Team" (nur Admin/Owner). |

---

*Zuletzt aktualisiert: 12.6.2026 — Sprints 1–3 + Sprint A + Sprint B + Sprint F ✅ komplett. Interne Zeiterfassung mit Buchungsarten, Abwesenheitskalender, Team-Zeitübersicht, Team-Urlaubsübersicht. Verbleibend: Sprint C-E (Portal-Features).*
