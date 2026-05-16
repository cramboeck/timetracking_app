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
| Hoch | Globale Suche (Cmd+K) | `cmdk` Library, Suche über Tickets, Kunden, Projekte |
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

1. **Keine neuen `any`-Typen** – immer konkrete TypeScript-Typen oder `unknown` verwenden
2. **Zod-Validierung ist Pflicht** – jede neue Route muss Eingaben mit Zod validieren
3. **Kein `SELECT *`** – immer explizite Spaltenlisten in SQL-Queries
4. **Soft-Delete beachten** – bei Queries auf `customers`, `projects`, `activities`, `contracts` immer `WHERE deleted_at IS NULL` hinzufügen (sobald Soft-Delete in Routes aktiviert ist)
5. **Paginierung bevorzugen** – neue Listenendpunkte immer mit Paginierung implementieren
6. **Datensicherheit** – Migrationen müssen idempotent sein (`IF NOT EXISTS`), niemals bestehende Daten löschen
7. **`password_hash` niemals zurückgeben** – in keiner API-Antwort
8. **Lazy Loading beibehalten** – neue schwere Komponenten in `App.tsx` als `lazy()` importieren
9. **Rückwärtskompatibilität** – Legacy-Clients müssen weiterhin funktionieren (`?all=true` für entries)

---

## Bekannte Probleme (pre-existing, nicht durch unsere Änderungen verursacht)

- `CalendarView.tsx` hat mehrere TypeScript-Fehler (react-big-calendar Typen)
- Social Media Modul postet aktuell nicht wirklich an Plattformen (nur Datenbankeinträge)
- Offline-Sync funktioniert nur für Zeiteinträge, nicht für andere Aktionen
- Lead-Modul hat Datenbankschema aber keine Frontend-Ansicht
- `database.ts` ist mit 3300+ Zeilen zu groß – sollte in separate Migrationsdateien aufgeteilt werden
