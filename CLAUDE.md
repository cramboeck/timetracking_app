# CLAUDE.md – RamboFlow Entwicklungskontext

> Diese Datei ist der primäre Kontext für KI-Assistenten (Claude Code, Manus, etc.).
> Sie beschreibt den aktuellen Stand, alle bereits durchgeführten Änderungen und die
> nächsten offenen Aufgaben. **Bitte vor jeder Arbeitssitzung lesen.**

---

## Projektübersicht

**RamboFlow** ist eine umfassende Business-Management-App für IT-Dienstleister und Freelancer.

| Eigenschaft | Wert |
|---|---|
| Frontend | React 18 + TypeScript + TailwindCSS + Vite |
| Backend | Node.js + Express + TypeScript |
| Datenbank | PostgreSQL (via `pg` Pool) |
| Auth | JWT (Access Token, kein Refresh-Token) |
| Validierung | Zod (Backend), React Hook Form (Frontend) |
| Deployment | Docker Compose (server + client + db) |

### Wichtige Verzeichnisse

```
/src                    → React Frontend
  /components           → Alle UI-Komponenten (monolithisch, noch kein Routing)
  /features/social-media → Social-Media-Modul (eigene Struktur)
  /services/api         → API-Client-Layer (authFetch, entriesApi, etc.)
  /contexts             → React Contexts (AuthContext, etc.)
  /utils                → Hilfsfunktionen (sanitize, offlineStorage, etc.)
/server/src
  /routes               → Express-Routen (eine Datei pro Domäne)
  /middleware           → auth, validation, organization
  /config/database.ts   → Gesamtes DB-Schema + alle Migrationen (3300+ Zeilen)
  /services             → auditLog, securityService, etc.
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

## Bereits durchgeführte Änderungen

### PR #43 – Epic 1: Sicherheits-Optimierungen

**Branch:** `feature/epic1-security-optimizations`

#### 1.1 XSS-Schutz mit DOMPurify
- **Neu:** `src/utils/sanitize.ts` – zentrale `sanitizeHtml()`-Funktion mit DOMPurify
- **Geändert:** `src/components/SupportInbox.tsx` – `dangerouslySetInnerHTML` wird jetzt über `sanitizeHtml()` gesichert
- **Geändert:** `src/components/TicketDetail.tsx` – `dangerouslySetInnerHTML` wird jetzt über `sanitizeHtml()` gesichert
- **Paket:** `dompurify` + `@types/dompurify` zu `package.json` hinzugefügt

#### 1.2 Auth-Middleware für ungeschützte Routen
- **Geändert:** `server/src/routes/auth.ts`
  - `PATCH /api/auth/profile` – `authenticateToken` Middleware nachgerüstet
  - `POST /api/auth/change-password` – `authenticateToken` Middleware nachgerüstet
  - Beide Routen waren zuvor ohne Authentifizierung erreichbar

#### 1.3 SELECT * durch explizite Spaltenlisten ersetzt
- **Geändert:** `server/src/routes/auth.ts` – `password_hash` wird nie mehr zurückgegeben
- **Geändert:** `server/src/routes/password-reset.ts` – `SELECT *` bereinigt
- **Geändert:** `server/src/routes/mfa.ts` – beide `SELECT *` bereinigt
- **Geändert:** `server/src/routes/user.ts` – GDPR-Export gibt kein `password_hash` mehr zurück
- **Geändert:** `server/src/routes/admin.ts` – `SELECT * FROM users` bereinigt

---

### PR #44 – Epic 2 & 3: Performance + DB-Konsistenz

**Branch:** `feature/epic2-3-performance-db-consistency`

#### 2.1 Paginierung für Zeiteinträge

**Backend – `server/src/routes/entries.ts`:**
- `GET /api/entries` unterstützt jetzt Paginierung und Filter:
  - `?page=1&limit=100` – Seite und Einträge pro Seite (max. 500)
  - `?startDate=ISO&endDate=ISO` – Datumsfilter
  - `?projectId=UUID` – Projektfilter
  - `?all=true` – **Legacy-Modus**: gibt alle Einträge zurück (rückwärtskompatibel, keine Daten gehen verloren)
- Antwort enthält jetzt `pagination: { page, limit, total, totalPages, hasMore }`
- Explizite Spaltenliste statt `SELECT *`

**Frontend – `src/services/api/core.ts`:**
- `entriesApi.getAll()` – unverändert, ruft intern `?all=true` auf (Legacy-Kompatibilität)
- `entriesApi.getPaginated(filters)` – **neu**, für Listenansichten empfohlen
- Neue Interfaces: `PaginationMeta`, `EntryFilters`

> **Hinweis:** `TimeEntriesList.tsx` sollte auf `getPaginated()` umgestellt werden.
> Dashboard und CalendarView können weiterhin `getAll()` verwenden.

#### 2.2 Frontend Code-Splitting mit React.lazy

**Geändert: `src/App.tsx`**
- `lazy` und `Suspense` aus React importiert
- Alle schweren Feature-Komponenten werden jetzt lazy geladen:
  - `TimeEntriesList`, `CalendarView`, `Dashboard`, `Settings`
  - `Tickets`, `Finanzen`, `DevicesView`, `AlertsView`
  - `MaintenanceView`, `TaskHub`, `Contracts`
  - `InvoiceInbox`, `SupportInbox`, `SocialMediaLayout`, `AdminPortal`
- Kern-Komponenten bleiben eager: `Stopwatch`, `ManualEntry`, `Auth`, `FloatingActionButton`, `OfflineBanner`
- `<Suspense>` Wrapper mit Lade-Spinner um den gesamten Hauptinhalt
- `SocialMediaProvider` bleibt eager (Context-Wrapper)

#### 3.1 Datenbank-Konsistenz: updated_at Migration

**Geändert: `server/src/config/database.ts`** (vor dem abschliessenden COMMIT)

Neue idempotente Migration – sicher für bestehende Datenbanken:
- Fügt `updated_at TIMESTAMP NOT NULL DEFAULT NOW()` zu folgenden Tabellen hinzu (nur wenn nicht vorhanden):
  `teams`, `customers`, `projects`, `activities`, `time_entries`,
  `ticket_comments`, `ticket_tasks`, `lead_activities`,
  `task_checklist_items`, `contract_positions`, `invoice_exports`,
  `social_media_post_platforms`, `social_media_templates`,
  `social_media_hashtag_groups`, `ticket_emails`
- Back-fill: `updated_at = COALESCE(created_at, NOW())` für bestehende Zeilen
- **Keine bestehenden Zeiteinträge oder andere Daten werden gelöscht oder verändert.**

#### 3.2 Datenbank-Konsistenz: Soft-Delete Migration

**Geändert: `server/src/config/database.ts`** (vor dem abschliessenden COMMIT)

Neue idempotente Migration für Soft-Delete:
- Fügt `deleted_at TIMESTAMP DEFAULT NULL` zu folgenden Tabellen hinzu:
  `customers`, `projects`, `activities`, `contracts`
- `NULL` = aktiver Datensatz (alle bestehenden Zeilen bleiben aktiv)
- `NOT NULL` = soft-gelöscht (wird in normalen Queries gefiltert)
- Erstellt partial index `WHERE deleted_at IS NULL` für Performance

> **WICHTIG – noch zu implementieren:** Die Backend-Routen müssen noch angepasst werden:
> - DELETE-Endpunkte: `UPDATE SET deleted_at = NOW()` statt `DELETE FROM`
> - GET-Endpunkte: `WHERE deleted_at IS NULL` zu allen Queries hinzufügen

#### 4.1 Hardcodierte Strings entfernt

**Geändert: `src/components/QuoteEditor.tsx`**
- `useAuth` importiert
- `'Christoph Ramböck'` durch `currentUser?.displayName || currentUser?.username || 'Ihr Ansprechpartner'` ersetzt
- `useCallback`-Abhängigkeiten um `currentUser` ergänzt

#### 4.2 Unfertige Navigationspunkte einheitlich gestaltet

**Geändert: `src/App.tsx`**
- Berichte-Platzhalter durch professionelle Coming-Soon-Ansicht ersetzt

**Geändert: `src/features/social-media/pages/ContentStudio/index.tsx`**
- Carousel Creator und Story Creator Platzhalter einheitlich gestaltet

---

## Offene Aufgaben (Backlog)

### 1. UI/UX & Design-System (Priorität: Hoch)

#### 1.1 Farbschema & Branding (ramboeck-it.com)
Die App muss das Corporate Design der Website übernehmen.
- **Primärfarbe (Accent):** Orange `#FF6A00` (oklch 68% .2 38)
- **Hintergrund (Dark Mode):** Navy-Blau `oklch(17% .07 295)`
- **Sekundär/Cards (Dark Mode):** Helles Navy `oklch(22% .08 295)`
- **Borders (Dark Mode):** `oklch(28% .09 295)`
- **Task:** Die `tailwind.config.ts` und `src/index.css` müssen so angepasst werden, dass diese Farben als Standard-Dark-Mode (z.B. `tone-ramboeck`) verfügbar sind.

#### 1.2 Mobile-Strategie (PWA)
Die App leidet auf Mobile unter "Feature Creep".
- **Fokus:** Zeiterfassung (Stoppuhr, Manuell) und Ticket-Listen müssen perfekt einhändig bedienbar sein.
- **Reduktion:** Komplexe Editoren (QuoteEditor, ContractDetail) und tiefe Admin-Settings (NinjaRMM API-Keys) werden auf Mobile ausgeblendet oder "Read-Only".
- **UI-Anpassungen:**
  - `ManualEntry.tsx`: Native HTML5 `<input type="time">` und `<input type="date">` für Mobile nutzen (bessere iOS/Android Walzen-UI).
  - `TicketKanban.tsx`: Auf Mobile deaktivieren, nur Listenansicht erlauben.
  - `CalendarView.tsx`: Auf Mobile standardmäßig `agenda` oder `day` View erzwingen.
  - Tabellen (z.B. Finanzen): Auf Mobile in ein "Card-Layout" umbauen (gestapelte Divs statt `<tr>`).

#### 1.3 Desktop & Interaktionsmuster
- **Globale Suche:** Implementierung einer `Cmd+K` (Command Palette) für schnelle Navigation zwischen Modulen, Tickets und Kunden.
- **Dialoge:** Alle verbleibenden `window.alert()` und `window.confirm()` (ca. 100 Vorkommen) durch die bestehende `ConfirmDialog`-Komponente ersetzen.
- **Ladezustände:** Skeleton-Loader für große Tabellen (Tickets, Finanzen) einführen.

### 2. Datenbank-Konsistenz & Multi-Tenancy (Priorität: Kritisch)

Die Datenbank hat 85 Tabellen, aber erhebliche Lücken in der Mandantenfähigkeit (Multi-Tenancy) und Indexierung.

#### 2.1 Multi-Tenancy Lücken schließen
Folgende Tabellen haben eine `user_id`, aber **keine** `organization_id`. Das bricht die Mandantenfähigkeit für Teams:
- `trusted_devices`, `customers`, `projects`, `activities`, `time_entries`, `company_info`, `email_notifications`, `password_reset_tokens`, `audit_logs`, `notification_settings`, `report_approvals`, `ninjarmm_config`, `ninjarmm_organizations`, `ninjarmm_alerts`, `ninjarmm_webhook_events`, `ninjarmm_alert_exclusions`, `customer_portal_roles`, `customer_portal_users`, `customer_portal_user_roles`, `customer_portal_user_devices`, `customer_portal_sessions`, `customer_portal_activity_log`, `ticket_comments`, `ai_config`, `ticket_ai_suggestions`, `feature_packages`, `maintenance_announcements`, `maintenance_templates`, `organizations`, `lead_activities`, `task_comments`, `task_activity_log`, `contracts`, `contract_activity_log`, `sevdesk_config`, `sevdesk_documents`, `invoice_exports`, `clockodo_config`
- **Task:** Migration schreiben, die `organization_id` zu diesen Tabellen hinzufügt und basierend auf der `user_id` befüllt.

#### 2.2 Fehlende Indexes
Für Performance-Optimierung fehlen Indexes auf `organization_id` in folgenden Tabellen:
- `teams`, `ninjarmm_alerts`, `ninjarmm_webhook_events`, `ticket_comments`, `ticket_tag_assignments`, `ticket_sequences_new`, `lead_activities`, `task_checklist_items`, `contracts`, `sevdesk_config`, `clockodo_config`, `social_media_post_platforms`, `social_media_hashtag_groups`, `social_media_queue_settings`, `social_media_content_categories`, `social_media_autopilot_settings`, `social_media_engagement_settings`, `social_media_image_settings`, `ticket_email_attachments`
- **Task:** `CREATE INDEX` Statements in `database.ts` ergänzen.

## Epic 4: UX & Usability Optimierungen (Geplant)

### 4.1 Zeiterfassung – Stabilität & Usability
- **Überlappende Timer verhindern:** Backend-Validierung in `entries.ts`, die prüft, ob bereits ein Timer für den User läuft (`is_running = true`). Falls ja, wird der alte Timer automatisch gestoppt oder der Start des neuen blockiert.
- **Heartbeat-Intervall konfigurierbar:** Das 5-Minuten-Intervall in `App.tsx` (Zeile 773) sollte über die User-Preferences einstellbar sein (z.B. 1, 5, 15 Minuten).
- **"Vergessener Timer"-Warnung:** Wenn ein Timer >8h läuft, sollte eine Push-Notification oder ein auffälliges App-Banner erscheinen.
- **Schnell-Wiederholung:** In `TimeEntriesList.tsx` gibt es bereits einen "Wiederholen"-Button (Zeile 848). Dieser sollte den Timer direkt mit Projekt, Aktivität und Beschreibung des alten Eintrags starten.
- **Wochenziel-Anzeige:** Ein Fortschrittsbalken "X von 40h diese Woche" direkt auf der Stoppuhr-Seite (Daten aus `ReportsPage.tsx` wiederverwenden).
- **Manuelle Eingabe (Dauer):** In `ManualEntryModern.tsx` sollte man neben Start/End-Zeit auch direkt "2h 30min" eingeben können.

### 4.2 Navigation & Routing
- **React Router einführen:** `App.tsx` ist mit 1100+ Zeilen zu groß und steuert die Navigation über State (`currentArea`, `currentSubView`). Dies verhindert Deep-Links (z.B. direkter Link zu einem Ticket) und macht den Browser-Back-Button nutzlos.
- **Command Palette Historie:** In `CommandPalette.tsx` (Cmd+K) sollte eine "Zuletzt verwendet"-Sektion hinzugefügt werden, die die letzten 3-5 Aktionen speichert.

### 4.3 UI-Konsistenz & Duplikate
- **ManualEntry vs ManualEntryModern:** `ManualEntry.tsx` wird nicht mehr genutzt (nur noch `ManualEntryModern.tsx` in `App.tsx` importiert). Das alte File sollte gelöscht werden.
- **Dashboard vs DashboardOverview:** `Dashboard.tsx` (1683 Zeilen) und `DashboardOverview.tsx` (484 Zeilen) überschneiden sich.
- **Billing vs BillingOverview vs BillingWidget:** `Billing.tsx` (632 Zeilen), `BillingOverview.tsx` (189 Zeilen) und `BillingWidget.tsx` (159 Zeilen) sollten konsolidiert werden.
- **TaskHub vs TasksOverview:** `TaskHub.tsx` (563 Zeilen) und `TasksOverview.tsx` (253 Zeilen) überschneiden sich.

### 4.4 Datenbank-Bereinigung
- **Tickets vs Tasks:** Funktionale Überschneidung. Tickets = Externer Kunden-Support, Tasks = Interne Aufgaben. `ticket_tasks` Tabelle klären.
- **Leads:** `leads`, `lead_activities`, `opportunities`, `pipeline_stages` existieren in der DB und als Backend-Routen, haben aber **kein Frontend**. Entweder CRM-Modul bauen oder Code entfernen.
- **Social Media:** 13 Tabellen (`social_media_*`) existieren, aber das Frontend postet nicht wirklich an Plattformen.
- **Push Subscriptions:** `push_subscriptions` und `portal_push_subscriptions` zusammenführen.

---

### 3. Funktions-Review & Duplikate (Priorität: Mittel)

#### 3.1 Tasks vs. Tickets
Es gibt eine massive funktionale Überschneidung zwischen `tasks` und `tickets`.
- Beide haben Status, Priorität, Zuweisung, Kunden-Verknüpfung.
- Im Frontend gibt es `TaskHub.tsx` und `TasksOverview.tsx` (Duplikat-Gefahr).
- **Strategie:** Klare Trennung definieren. Tickets = Externer Kunden-Support. Tasks = Interne Aufgaben (die optional an ein Ticket gehängt werden können). `TasksOverview.tsx` sollte in `TaskHub.tsx` integriert oder gelöscht werden.

#### 3.2 Leads (CRM)
- Die Datenbank hat eine vollständige `leads` Tabelle und eine `leads.ts` Route.
- Im Frontend gibt es jedoch **keine** UI dafür (außer einer Erwähnung im Social Media Manager).
- **Task:** Entweder das CRM-Modul (Leads) im Frontend bauen oder den toten Code entfernen.

#### 3.3 Billing vs. BillingWidget
- Es gibt `Billing.tsx` und `BillingWidget.tsx`.
- **Task:** Prüfen, ob Code geteilt werden kann (DRY-Prinzip).

### Kurzfristig – nächster Sprint

| Priorität | Task | Betroffene Dateien |
|---|---|---|
| Kritisch | Soft-Delete in Route-Handlern aktivieren | `server/src/routes/customers.ts`, `projects.ts`, `activities.ts`, `contracts.ts` |
| Kritisch | Soft-Delete in GET-Queries filtern (`WHERE deleted_at IS NULL`) | Alle oben genannten Routes |
| Hoch | `TimeEntriesList.tsx` auf `getPaginated()` umstellen | `src/components/TimeEntriesList.tsx`, `src/App.tsx` |
| Hoch | Zod-Validierung für `tickets.ts` nachrüsten | `server/src/routes/tickets.ts` |
| Hoch | Zod-Validierung für `ai.ts` nachrüsten | `server/src/routes/ai.ts` |
| Hoch | Zod-Validierung für `contracts.ts` nachrüsten | `server/src/routes/contracts.ts` |

### Mittelfristig

| Priorität | Task | Beschreibung |
|---|---|---|
| Hoch | React Router einführen | `App.tsx` (1100+ Zeilen) auf URL-basiertes Routing umstellen |
| Hoch | Refresh-Token-Mechanismus | JWT läuft ab → Nutzer wird ausgeloggt, kein Auto-Refresh |
| Mittel | Paginierung für Tickets | `server/src/routes/tickets.ts` + `src/components/Tickets.tsx` |
| Mittel | Vertrags-Stunden-Automatisierung | Cron-Job der Zeiteinträge gegen Inklusivstunden rechnet |

### Langfristig – Architektur

| Priorität | Task | Beschreibung |
|---|---|---|
| Mittel | Schichtenarchitektur (Controller/Repository) | Pilot: `tickets.ts` aufteilen |
| Mittel | Logging-Framework (pino) | `console.log` durch strukturiertes Logging ersetzen |
| Niedrig | Unit-Tests einführen | Jest für Backend-Services und -Routes |
| Niedrig | `any`-Typen eliminieren | Ca. 40+ Stellen im Backend |

---

## Verhaltensregeln für KI-Assistenten

1. **Keine Datenverluste:** Bei Datenbank-Änderungen IMMER `IF NOT EXISTS` oder `DO $$ BEGIN ... EXCEPTION ... END $$;` verwenden. Keine Tabellen droppen.
2. **Keine neuen `any`-Typen:** TypeScript strikt verwenden. Zod für API-Validierung nutzen.
3. **Mobile First:** Bei neuen UI-Komponenten immer prüfen, wie sie auf einem Smartphone aussehen.
4. **Keine nativen Alerts:** `window.alert` und `window.confirm` sind verboten. Nutze `Toast` und `ConfirmDialog`.
5. **Farben:** Nutze die CSS-Variablen aus dem RamboFlow-Theme, keine hartcodierten Tailwind-Farben (`bg-blue-500`), es sei denn, es ist semantisch zwingend (z.B. Fehler = Rot).
6. **Zod-Validierung ist Pflicht** – jede neue Route muss Eingaben mit Zod validieren
7. **Kein `SELECT *`** – immer explizite Spaltenlisten in SQL-Queries
8. **Soft-Delete beachten** – bei Queries auf `customers`, `projects`, `activities`, `contracts` immer `WHERE deleted_at IS NULL` hinzufügen (sobald Soft-Delete in Routes aktiviert ist)
9. **Paginierung bevorzugen** – neue Listenendpunkte immer mit Paginierung implementieren
10. **`password_hash` niemals zurückgeben** – in keiner API-Antwort
11. **Lazy Loading beibehalten** – neue schwere Komponenten in `App.tsx` als `lazy()` importieren
12. **Rückwärtskompatibilität** – Legacy-Clients müssen weiterhin funktionieren (`?all=true` für entries)
13. **Branch-Konvention beachten** – Feature-/Fix-Branches IMMER von `claude/next-version-roadmap-ks0D0` ausgehen, PRs gegen denselben Branch eröffnen (= Hetzner-Stand). Niemals direkt gegen `main`. Details siehe Sektion „Branch-Konvention" oben.

---

## Bekannte Probleme (pre-existing, nicht durch unsere Änderungen verursacht)

- `CalendarView.tsx` hat mehrere TypeScript-Fehler (react-big-calendar Typen)
- Social Media Modul postet aktuell nicht wirklich an Plattformen (nur Datenbankeinträge)
- Offline-Sync funktioniert nur für Zeiteinträge, nicht für andere Aktionen
- Lead-Modul hat Datenbankschema aber keine Frontend-Ansicht
- `database.ts` ist mit 3300+ Zeilen zu groß – sollte in separate Migrationsdateien aufgeteilt werden
