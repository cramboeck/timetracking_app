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
  /routes               → Express-Routen (eine Datei pro Domäne; tickets/ ist in 8 Module + shared.ts gesplittet — Mount-Reihenfolge heilig!)
  /middleware           → auth, validation, organization
  /config/database.ts   → Pool/query + initializeDatabase (schlank)
  /config/migrations    → nummerierte Migrationsdateien 001–016 (Split 6.9.2026)
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
- **Daten-Fetching:** Ticket-Subtree + AlertsView + TimeEntriesList + Stopwatch + TaskHub auf TanStack Query migriert. Restliche useEffects im features/social-media-Modul und diversen Detail-Views.
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
- **Lücken:** SLA-Warnungen nur im Detail-View. (~~Tickets ohne Bulk-Actions~~ — waren komplett gebaut, nur route-geshadowed; reaktiviert in b895df0. ~~`AlertsView` muss manuell refreshed werden~~ — gelöst in PR #81: TanStack Query mit `refetchInterval: 30 s` polled jetzt automatisch.)

### CRM
- Fragmentiert: `CustomerHub.tsx` ist sehr umfangreich (360°), aber `Leads.tsx` und `SalesPipeline.tsx` wirken wie separate Apps
- **Verbesserungsidee:** Sales Pipeline → Angebots-Editor verknüpfen; bei Lead „Won" automatisch Projekt + Vertrag anlegen

### Arbeiten (Zeiterfassung)
- ~~**Verbesserungsidee:**~~ ✅ Erledigt in PR #73 — `GlobalTimerWidget.tsx` zeigt laufenden Timer app-weit als persistentes Bottom-Bar-Widget.

---

## Aktueller Stand (Stand 5.9.2026)

### Rechnungseingang-Sprint Teil 1 (5.9.2026) — ✅ abgeschlossen (167b176)

> Anlass: „die rechnungseingangsfunktion nochmal genauer analysieren". Analyse ergab: Liste zeigte nur Absender/Betreff (obwohl Lieferant/Betrag/Fälligkeit extrahiert in der DB lagen), Dedup nur auf E-Mail-Ebene, Entwürfe entstanden still per Cron.

| Bereich | Änderung |
|---|---|
| **Sprechende Liste** | Spalten Lieferant/Rechnung (Nr.+Betreff)/Betrag/Fällig (rot überfällig, amber ≤7 Tage) in Tabelle + Mobile-Karte; `dueDate`/`hasDuplicate` in Liste-API ergänzt |
| **Duplikat-Warnung** | `findPossibleDuplicates()` (gleiche Re-Nr. in weiterem Beleg der Org): „Duplikat?"-Chip in der Liste (EXISTS im Query), roter Warn-Block in der Review-Ansicht vor dem Freigeben |
| **Benachrichtigung** | Cron mailt/pusht Org-Admins bei neuen Belegen (nur bei processedCount>0); Desktop-Sidebar: Entwurfs-Badge am „Rechnungen"-Eintrag (5-Min-Refetch, Admin+Business) |
| **Bugfix** | Ohne M365-Postfach blockierte die Ansicht komplett — obwohl manueller Upload/sevDesk-Import kein Postfach brauchen. Jetzt Banner statt Vollsperre. |

**Teil 2 ✅ (18a5b33):** Fälligkeits-Radar (Voucher-Sync schreibt `payment_status`/`paid_at` mit → bezahlte Belege werden nicht angemahnt; rote/amber Karten überfällig/≤7 Tage mit Summen; werktags 08:15 Erinnerungs-Mail an Admins), Lieferanten-Gedächtnis (`supplier_sevdesk_contacts`: Kontakt beim Bestätigen merken, nächster Beleg kommt vorbelegt), Batch-Freigabe (Checkboxen + `POST /invoices/batch-approve`, überspringt Duplikat-Verdacht mit Begründung). Damit ist der Rechnungseingangs-Sprint komplett.


### Formular-Kit-Sprint (5.9.2026) — 🟡 Pass 1 abgeschlossen (0868ab4)

> Letzter Punkt aus dem UX-Programm. Bestandsaufnahme: `ui/Input.tsx` (Input/Textarea/Select/Label/HelperText/FormGroup/FormRow) existierte komplett, wurde aber nur von 7 Dateien genutzt — daneben 324 rohe `<input>` + 113 rohe `<select>` mit variierenden Paddings/Focus-Styles.

| Bereich | Änderung |
|---|---|
| **Kit gehärtet** | EINE Feldgröße app-weit (`px-3.5 py-2.5`); FormRow mobile-first (`grid-cols-1 sm:grid-cols-N`); `label`-Prop akzeptiert ReactNode (Inline-Icons). **Look modernisiert (a910be0):** Soft-Filled (getönte Fläche, `rounded-xl`, Fokus = weißer Grund + Accent-Glow `ring-4/15`) — nur in `ui/Input.tsx`, alle Kit-Nutzer erben ihn. |
| **Pass 1 migriert** | CreateTicketDialog + TaskModal komplett auf Kit-Komponenten. TaskModal: `text-left` aufs Panel (Wrapper-`text-center` zentrierte alle Labels). |
| **Bugfix nebenbei** | „Erstellen" blieb bei INTERNEN Tickets deaktiviert (disabled verlangte weiter einen Kunden) — interne Tickets waren per UI gar nicht anlegbar. |

**Pass 2 ✅ (2c28273):** Zeiterfassung migriert — ManualEntryModern + Stopwatch (Selects/Textareas/Labels), Edit-Dialog (lokale `inputClasses` = Kit-Look, Karten-Layout unverändert) + Massenbearbeitung. Bewusst nicht: kompakte Filterleiste, Spezial-Widgets (SearchableSelect/DatePicker/Dauer-Feld). **Pass 3 ✅ (c41ad30):** CRM + Settings per Klassen-Vereinheitlichung (48 Felder): Settings (26, davon 5 ganz OHNE Dark-Klassen!), Leads (12), CustomerContacts (3), InteractionsTimeline (7). **Offen (optional, bei Gelegenheit):** restliche Settings-Untermasken (NinjaRMM/Ticket/KB), QuoteEditor, ContractDetail, MaintenanceView-Dialoge — gleiche Klassen-Substitution; echte Komponenten-Migration nur bei Neubau/Umbau.

### Kleinkram-Sprint: VAPID-Setup + Theme-Cleanup (5.9.2026) — ✅ abgeschlossen (fd7c334)

| Bereich | Änderung |
|---|---|
| **VAPID im Admin-UI (Prio 4)** | Einstellungen → Benachrichtigungen: Admin-Warn-Block mit „Schlüssel erzeugen" → fertiger `.env`-Block + Copy-Button + Deploy-Anleitung. **Bugfix:** `GET /push/generate-vapid` lehnte JEDEN ab (Inline-Check las `req.user.role`, das `authenticateToken` nie setzt) → `requireAdmin`. `POST /push/subscribe` → 503 statt toter DB-Subscriptions ohne Keys. |
| **text-gray-Cleanup (Prio 5 Rest)** | Finanzen.tsx (12) + MaintenanceView.tsx (26) manuell: `dark:text-dark-400/-300` ergänzt, STATUS_COLORS-Badges mit Dark-Varianten. Damit ist der pausierte Cleanup-Punkt abgeschlossen. |
| **A5-Reste** | ModernDatePicker: deutsches numerisches Format inkl. Jahr („Fr., 05.09.2026"). Bereits erledigt vorgefunden: Mobile Bottom-Nav (flex-1/min-w-0), Anträge-Badge in Berichte-Tabs. |

### UX-Paket 4: Undo-Toast + globale Suche (5.9.2026) — ✅ abgeschlossen (de83d38)

> Fortsetzung des UX-Programms nach Paket S. Verbleibender UX-Punkt: Formular-Kit vereinheitlichen (größter Brocken, eigener Sprint).

| Bereich | Änderung |
|---|---|
| **Undo statt Confirm** | `Toast` mit Aktions-Button, `showUndoToast()` im UIContext (6 s, info). Zeiteintrag löschen (Liste + Wochenraster) löscht sofort → „Eintrag gelöscht – Rückgängig"; Undo legt den Eintrag mit denselben Daten neu an (neue ID, nur Create-Schema-Felder) + invalidiert `['entries']`. Beide Lösch-ConfirmDialoge raus. Delete-Callbacks reichen den Eintrag mit durch (paginierte Liste ≠ globaler entries-State). Laufende Timer: kein Undo (würde zweiten laufenden Timer erzeugen). |
| **CommandPalette = globale Suche** | Ab 2 Zeichen zusätzlich zu Befehlen: Tickets (Server `?searchText=`, debounced 250 ms, TanStack Query `['tickets','palette-search']`), Kunden + Projekte (clientseitig aus App-State), je max. 5, Sektions-Header. Treffer öffnen direkt: Ticket→Detail, Kunde→CustomerHub, Projekt→CustomerHub des Kunden. Gating: Tickets nur mit `hasFeature('tickets')` + `isSubViewAllowed`, Kunden/Projekte nur bei erlaubter Kunden-View. Flache Ergebnisliste für Tastatur-Navigation. |

### Berechtigungs-Härtung „Paket S" (3.9.2026) — ✅ abgeschlossen (c913521)

> Anlass: „wie können wir sicherstellen dass die dashboard ansicht für normale mitarbeiter nicht alles zeigt … jeder mitarbeiter nur seine eigene stunden einsehen kann". Audit ergab echte Lücken: GET/PUT/DELETE /entries waren org-weit (jedes Mitglied konnte fremde Einträge lesen/ändern/löschen), Vertrags-API komplett ungeschützt (UI-Gating ≠ API-Gating), Stundensätze gingen an alle. Abgestimmter Scope: „nur der teamlead sollte alle zeiten sehen dürfen aber gerne in einer eigenen ansicht" + „auch die projektzeiten wären wichtig zu trennen".

| Bereich | Änderung |
|---|---|
| **Zeiten nur eigene** | `GET /entries` liefert jedem nur die EIGENEN Einträge (auch Admins — Teamsicht bleibt `/entries/team` unter Berichte → Team). `GET/PUT/DELETE /:id` + bulk-update: fremde Einträge nur für Org-Admin/Owner (Korrekturen), sonst 403/404. Dashboard-Kacheln (abrechenbare Stunden etc.) sind damit automatisch nur-eigene. |
| **Verträge API-geschützt** | Alle contracts-Routen mit `requireOrgRole`: Mitglieder nur Liste + je-Kunde-Lesen (fürs Ticket), alles andere Admin/Owner. `stripPricesForNonAdmins()` nullt basePrice/hourlyRate/overageRate; Inklusiv-Stunden + SLA bleiben sichtbar (braucht der Support). |
| **Vertrags-Org-Scope** | contractService von Ersteller- auf Org-Scope (Zweit-Admins sahen sonst NIE Verträge): gemeinsames `orgScopeSql`-Fragment in allen Queries, INSERT schreibt endlich `organization_id`, Legacy-NULL-Zeilen über die Org-Mitgliedschaft des Erstellers zugerechnet, User ohne Org behalten Eigen-Scope. |
| **Stundensätze gestrippt** | `GET /projects` + `GET /customers` nullen `hourlyRate` für Nicht-Admins — fürs Zeiterfassen reicht der Projektname. |

Verifiziert per Zwei-User-Test (Owner + eingeladenes Mitglied, lokale DB): eigene/fremde Einträge, Teamsicht-403, Preis-Stripping, Owner-Sicht unverändert. **Bewusst offen:** feingranulare „Abrechnungs-Rolle" (z.B. Buchhaltung ohne Owner-Rechte) — lässt sich später auf die Org-Rollen aufsetzen; Rollenmodell bleibt owner/admin/member/viewer. Feature-Schalter sind Lizenz-Pakete, KEINE Berechtigungen.

### UX-Programm Pakete 1–3 + Interne Tickets (1.–2.9.2026) — ✅ abgeschlossen

> Aus dem UX-Review („was würdest du generell verbessern…") mit Freigabe „starte durch und lass uns dazwischen immer wieder validieren".

| Sprint | Änderung | Commit |
|---|---|---|
| **E-Mail-Beschreibung sauber** | `emailText.ts`: HTML→Text mit Entity-Decode + Block→Newline, `stripEmailSignature()` (deutsche/englische Marker + Firmen-Footer-Fallback, MIN_KEEP_CHARS 40) — Mail-Tickets ohne Signatur-Müll | a5e7ffe |
| **Login-503-Vorfall (nginx)** | SSE-Streams zählten in die per-IP `limit_conn`-Zone (HTTP/2: jeder Stream = 1 Conn) → Login bekam 503. SSE eigene Location ohne Shared-Zone + eigene `sse_conn`-Zone (20/IP, 1h Timeouts), `/api/` 10→25, Login 5→10. Brute-Force-Schutz unverändert (limit_req 5r/m + authLimiter). | a81d7c9, dff06c3 |
| **Edit-Dialog repariert + neu** | ModernDatePicker sprengte das Grid → Zeitfelder außerhalb des Modals („kann Zeiten nicht mehr verändern"). `compact`-Prop, Karten-Layout Datum & Zeitraum, VON/BIS, Heute/Gestern-Chips, Enter speichert; SearchableSelect zeigt Sublabel (Kunde) im zugeklappten Zustand; Fehler beim Speichern → Toast + Dialog bleibt offen (vorher still verschluckt). Lehre: Playwright scrollt unsichtbare Elemente an — Layout nur mit Screenshots verifizieren. | f9ae1f3, ea3414b, b3d3cb0 |
| **UX-Paket 1+2** | Modal-Kette beim Erststart entzerrt (Wizard wartet auf Cookie-Entscheidung, Notification-Prompt erst ab 2. Session +30 s), RamboFlow-Branding statt TimeTrack, ~30 Sie→Du (kundenseitige Templates + Portal bleiben Sie), Deep-Links schlagen gespeicherte Prefs (`enteredAtRootRef`) | c5c3165 |
| **Stepper-Submit-Bug (Klasse)** | Pfeil-Klick im Zeit-Stepper legte Eintrag an: ui/Button + IconButton ohne `type` → implizites Submit im `<form>`. Root-Fix: Default `type='button'`; alle 19 onSubmit-Formulare haben genau einen expliziten `type="submit"`. | 82cae24 |
| **UX-Paket 3** | „Heute im Fokus"-Leiste auf dem Dashboard (Meine Tickets / Unzugewiesen / SLA-Fokus, gated auf `hasFeature('tickets')`; Gestern-Lücke via Coverage → Deep-Link auf Tages-Timeline); Sidebar: Ein-SubView-Bereiche als Einzeleintrag | aca8b47 |
| **Interne Tickets + Bereiche** | ⚠️ Nachtrag 5.9. (f46236a): Prod-Tabelle trug noch NOT NULL auf `tickets.customer_id` — interne Tickets schlugen dort mit 500 fehl, guarded `DROP NOT NULL`-Migration nachgeliefert. `customer_id NULL` = internes Ticket (Toggle im CreateTicketDialog blendet Kunde/Projekt aus, Badge „Intern", Listen-Filter `customer=none`, Vertragswarnung unterdrückt); `category` als leichte Queue (Freitext + datalist „1st Level/2nd Level/Intern-IT/…", in Sidebar editierbar, Filter); Timer aus internem Ticket → `entry_scope='internal'`/`internal_support`. Echte Bearbeitergruppen (Mitgliedschaften) bewusst verschoben bis das Team wächst. | 8dfc505 |

### Ticket-Zuweisungs-Sprint (27.8.2026) — ✅ abgeschlossen (80efbea)

> Anlass: „das ticketsystem hat noch keine möglichkeit die zuordnung an support mitarbeiter durchzuführen“. Ist-Analyse: Fundament existierte komplett (tickets.assigned_to, PUT-Endpoint, fertige Push-/Mail-Benachrichtigungen inkl. Prefs), aber der einzige UI-Weg war die Bulk-Aktion in der Liste — und genau die benachrichtigte nicht. Kein „Meine Tickets“, kein Bearbeiter im Detail/Liste sichtbar setzbar.

| Bereich | Änderung |
|---|---|
| **Zuweisen überall** | Detail-Sidebar-Dropdown + „Mir zuweisen“, Bearbeiter-Feld im CreateTicketDialog (POST /tickets mit assignedToUserId + Aktivität + Benachrichtigung), Aufgaben-Zuweisung im Ticket (Backend konnte es, UI sendete es nie) |
| **Meine Tickets** | Server-Filter `GET /tickets?assignedTo=` (`none` = unzugewiesen), Liste: Filter Alle/Meine/Unzugewiesen/Mitglied + Bearbeiter-Name in der Zeile (Listen-Query joint jetzt users), Kanban: „Meine Tickets“-Shortcut |
| **Benachrichtigung immer** | `sendAssignedNotifications()`-Helfer; Bulk benachrichtigt jetzt („+N weitere“ statt Spam) — vorher erfuhr praktisch niemand von einer Zuweisung |
| **Konsistenz** | PUT prüft Org-Mitgliedschaft (hatte nur Bulk), `.uuid()`-Zwang weg (users.id ist TEXT), Aktivitäts-Feed/Dashboard zeigen Namen statt roher User-ID (`newValueLabel`), PUT-Response liefert assignee_name |

**Bewusst offen (bei Bedarf):** Auto-Zuweisung (Round-Robin, Kunde→Mitarbeiter-Regeln, Default-Bearbeiter in Vorlagen) — lohnt erst ab mehr Teamgröße. `tickets.assigned_to_user_id` bleibt tote Legacy-Spalte (nur `assigned_to` wird genutzt).

### E-Mail-Ticket-Sprint „Support-Inbox produktionsreif" (27.8.2026) — ✅ abgeschlossen (860bc0c)

> Anlass: „mir gefällt das support ticket handling bzw. anhängen von mails zu vorhandenen tickets noch nicht". Ist-Analyse ergab: kein automatischer Eingang (nur pull-on-demand aus dem UI), Threading nur über Graph-`conversationId` (brach bei Antworten auf SMTP-Benachrichtigungen), „Mit Ticket verknüpfen" nur bei conversationId-Vorschlag, Anhängen ohne Statuswechsel/Aktivität/Benachrichtigung.

| Bereich | Änderung |
|---|---|
| **Zuordnungs-Kaskade** | `findTicketForEmail()`: Ticket-Nummer im Betreff (`TKT-\d{6}`) → `conversationId` → In-Reply-To/References gegen `ticket_emails.internet_message_id` (wird jetzt bei jedem Eingang erfasst; Header-Abruf nur als letzte Stufe). SMTP-Benachrichtigungs-Betreffs trugen die Nummer schon immer → deren Antworten matchen jetzt. |
| **Automatik** | `supportInboxCron` (alle 2 Min, Gate: `microsoft365_config.features_enabled.inboxMonitoring` — Settings-Toggle war „Bald verfügbar", jetzt funktional). Treffer → Mail+Anhänge ans Ticket, Status waiting/resolved/closed→open, Aktivität `email_received`, Push an Bearbeiter, als gelesen markiert. Kein Treffer → bleibt ungelesen als Triage. Loop-Schutz (eigene Absender), >14 Tage geschlossene Tickets nie auto-reopen. |
| **Triage-UX** | Neuer `TicketPickerDialog`: „An Ticket anhängen…" für beliebige Tickets (Suche Nummer/Titel/Kunde, Absender-Kunde zuoberst). Vorher ging Verknüpfen nur bei conversationId-Vorschlag. `ticket-info`-Vorschlag nutzt die volle Kaskade. |
| **Anhängen = Seiteneffekte** | `applyInboundEmailSideEffects()` bei manuellem UND automatischem Anhängen (vorher: Ticket blieb unsichtbar auf „Wartend"). |
| **Paket-0-Bugs** | „Dringend"-400 (`urgent`→`critical`), Mail-Tickets ohne SLA/created-Aktivität, zwei konkurrierende Nummern-Generatoren (→ zentrale `ticket_sequences`), Merge ließ `ticket_emails` zurück, E-Mail-Verlauf nur bei `source='email'` sichtbar, outbound-Zeilen leer (`from_email='support'`, kein Body), `replyViaEmail` fire-and-forget → `emailReplySent` in Response + Toast. |


### Tech-Debt-Sprint „TS-Fehler 374 → 0" (22.8.2026) — ✅ abgeschlossen

> Methode: NICHT Interfaces aufblähen, bis der Compiler schweigt — sondern jede Meldung gegen die **echte Server-Response** prüfen (Route lesen!). Viele „fehlende Properties" waren Phantom-Felder, die die API nie liefert; die zugehörigen UI-Zweige waren still tot. Dabei fielen 12 echte Laufzeitbugs.

| Task | Commit |
|---|---|
| **Stufe 1**: alle 132 TS6133 (71 Import-Specifier automatisiert via Skript, 64 manuell: Props aus Destrukturierung, tote Helfer, Setter-only-State) | 46ad2ef |
| **Stufe 2a — Phantom-Felder + Dashboard-Bugs**: `TicketDashboardData` komplett neu nach echter Response (overview/sla/urgentTickets/trends/topCustomers); **CRM-Dashboard lud NIE Daten** (nicht existente API-Methode `getPendingFollowUps` → synchroner TypeError, dazu `oppsRes.data` statt `.opportunities` und Stage-Gruppierung gegen hartkodierte Keys, die es im dynamischen `pipeline_stages`-Modell nie gab → jetzt nach `stage_id`); `TimeEntry.date/billed`, `Customer.isActive/phone/website`, `Contract.monthlyValue` existieren nirgends → Code auf echte Felder (`startTime`, `isBillable`, `basePrice`), Label „Nicht abgerechnet" → „Abrechenbar" (war immer „Offen"); `accent-light0` (10 Stellen) = kaputtes Sed-Artefakt der Farbmigration → `purple-500`; WeeklyGridView: Einträge ohne Projekt raus aus dem Raster (Bearbeiten hätte Eintrag mit projectId "undefined" erzeugt) | 919f972 |
| **Stufe 2b — tote Module + API-Verträge**: `SocialMediaManager.tsx` (6482 Z.) **gelöscht** (seit features/social-media nirgends importiert — Roadmap-Punkt „splitten" obsolet), `settings/AccountSettings.tsx` gelöscht (Barrel unbenutzt, rief nicht existierende APIs); Social-Media: Posts-Liste lieferte nie Plattformen (jetzt Aggregation als string[]), Vorlagen-Bearbeiten crashte (PUT /templates/:id + /hashtags/:id neu, Zod), EngagementBot-Historie/Competitor-Analyse auf echte Response-Formen gemappt; Kanban: Fälligkeits-Badge nie sichtbar (`transformTicket` ließ `due_date` fallen → `dueDate` gemappt), Assignee-Filter auf `assignedToUserId`; Kalender: Drag/Resize von Wartungs-Events crashte, Agenda-Datumszelle bekam `{day}` statt `{event}`; InteractionForm/LeadForm: Abbrechen tat nichts (`onClose` vs `onCancel`); PersonalInbox: UnknownCustomerDialog mit falschem Prop-Vertrag; Firmendaten-Kundennummer wurde nie gespeichert; Settings-Speicherplatz-Tab für Org-Owner unsichtbar; **guarded Migration** `notification_preferences.email_on_new_ticket` (fehlte in Prod, wird in SELECTs referenziert!); Typen ehrlich angeglichen: TicketActivity/TicketComment/CannedResponse/TicketTag/NotificationPreferences, `TimeEntryUpdate` (activityId: null = Tätigkeit entfernen), AccountType inkl. Legacy `'freelancer'` | 1ad5bd8 |

**Regel ab jetzt: `npx tsc --noEmit` (Root und server/) bleibt bei 0** — neue Fehler sofort fixen.


### Team-Onboarding-Sprint Ende Juli 2026 — ✅ abgeschlossen

> Anlass: neuer Mitarbeiter. Reihenfolge D → B → V3 → C wie mit dem User geplant.

| Task | Commit |
|---|---|
| **Rollenkonzept UI (D)**: zentrale Matrix in `AreaNavigation` (`ADMIN_ONLY_AREAS`/`ADMIN_ONLY_SUBVIEWS` + `isSubViewAllowed`), Desktop+Mobile+CommandPalette gefiltert, Deep-Link-Guard in App.tsx. Member sehen kein Finanzen/Inbox/CRM-Sales/Social-Media | ca57919 |
| **Arbeitszeiterfassung (B)**: `work_sessions` (Kommen/Gehen/Pausen, max. 1 offene Session/User), Routen mit Audit-Log, `AttendanceBar` im Arbeiten-Bereich (ArbZG-Warnungen >6h ohne Pause / >10h), Admin-Tab „Arbeitszeit" unter Berichte mit CSV-Export | 4120fab, 7b9b3a8 |
| **„Mein Bereich" (V3 Phase 1)**: neuer Nav-Bereich `personal` für alle Rollen — Arbeitszeitkonto (Soll aus `users.weekly_hours` inline editierbar, Ist, Überstunden-Saldo, Urlaubs-/Kranktage, Monats-Tagesliste, Stundenzettel-CSV) + Abwesenheits-Tab (AbsenceCalendar dorthin umgezogen, war für Member unsichtbar). Phase 2 ✅ (3bfe9e5): Urlaubsanträge — Antrag in „Mein Bereich“, Admin-Genehmigung unter Berichte → „Anträge“, genehmigt = automatische Abwesenheits-Einträge, E-Mail-Benachrichtigungen beidseitig | 9f98bac, 3bfe9e5 |
| **Lückenlose Protokollierung (C)**: `auditTrail`-Middleware loggt JEDE Mutation (Methode/Pfad/Status/Params, nie Bodies) + 403-Versuche; vorher deckten manuelle Logs nur 14/35 Routen-Dateien ab | 3bbddac |
| **Beleg-Kette Rechnungseingang komplett repariert** (5 Bugs, noch nie durchgelaufen): Token-Lookup (`sevdesk_config` hat keine `organization_id`!), Multipart-Upload (form-data npm ≠ undici fetch), Revert (processed_at NOT NULL), Anhang (uploadTempFile liefert filename, keine id), **C/D-Semantik: sevDesk `C`=Kreditor=AUSGABE** (auch Sync-Filter + Finanzen-Anzeige gedreht) | 1c8e7d2–9ac8be6 |
| Beleg-Komfort: explizite `sumNet`/`sumGross` (Betrag stimmt ohne manuelles Umstellen), Buchungskategorie-Vorauswahl via Keyword-Matching gegen echte sevDesk-AccountingTypes, saubere Belegnummer | 572c217, e89b5ac |
| **Zod-Audit: 16 Schemas repariert**, die gültige Frontend-Requests ablehnten (MFA-Recovery, KI-Feedback/Config, Clockodo, SLA `all`, Task-dueDate, Social-Schedule, Interactions-Enums inkl. DB-CHECK, Ninja-Exclusions, Push strict()) → Verhaltensregel 14 | 41933b2, 12f63cf, ec890b1 |
| **Infinigate Phase 1** (siehe Sprint-J-Tabelle) | 8df3259 |
| **portal.ramboeck.it**: eigener Portal-Host (isPortalHost, nginx server_name, Zertifikats-Script `add-portal-cert.sh`), Portal-Login mit Ramboeck-Logo | 9b66c7e, 22d595e |
| sevDesk-Kunden-Auto-Sync-Job (Toggle war totes Feld) mit E-Mail-Benachrichtigung + „Jetzt synchronisieren"-Button | 1d46580 |
| **Positions-Klassifizierung**: `item_type` (Lizenz/Abo/Hardware/Dienstleistung) auto-klassifiziert (Infinigate-Signale + Keywords), Status `internal` für Eigenbedarf, CRM-Tab „Lizenzen & Abos" + **Hardware-Käufe-Register** (Seriennummern), Auswertung „Interne Ausgaben" unter Berichte → Intern, Review-Endpoint liefert endlich camelCase | 94167f0 |

### Go-Live-Sprint Kundenportal + Stabilität (Anfang August 2026) — ✅ abgeschlossen

> Auslöser: Portal sollte live gehen. Ein Audit fand 8 Go-Live-Blocker; beim Testen kamen vier **Phantom-Spalten-Bugs** zutage (SQL referenzierte nie angelegte Spalten, Fehler wurden in try/catch verschluckt) — daraus entstand der Schema-Sweep (s.u.).

| Task | Commit |
|---|---|
| **Portal-Härtung (8 Blocker)**: Ticket-Liste-500 (Phantom-SLA-Spalten), Berechtigungs-Identität (JWT trägt `customer_contacts.id` ODER `customer_portal_users.id` — `getContactPermissions` löst jetzt beide auf), unauthentifizierter Debug-Endpoint GELÖSCHT, neue Berechtigung `can_view_licenses`, `is_active` beim Login erzwungen, `can_view_all_tickets` wirklich durchgesetzt, sevDesk-Entwürfe gefiltert, Portal-Passwort-Reset (Self-Service, `reset_token`-Spalten), Zeitreport/Vertrag erreichbar + 3 neue Berechtigungs-Checkboxen im Kontakte-Dialog, `PORTAL_URL` env | 834fdb9 |
| Phantom-Spalten-Fixes: `PORTAL_USER_COLUMNS` erfand `invitation_token/…` (Kontakt-Speichern 500), `customer_portal_users` fehlten `mfa_enabled/mfa_secret` (**Portal-Login war serverseitig nie lauffähig**) → guarded Migrationen | 57942fd |
| Phantom-Spalten-Fixes: `contracts.monthly_hours/sla_response_time_hours` (Portal-Vertrag immer leer) → echte Spalten `included_hours_monthly/sla_response_hours`; `tickets.contact_id` existiert nicht (**Kommentar-/Status-Mails gingen NIE raus**) → `created_by_contact_id` + portal_user_id-Auflösung, Fallback Hauptkontakt; auch E-Mail-Diagnose | a903d40 |
| Impressum + Datenschutzerklärung mit echten Anbieterdaten (Pillham 4B, USt-IdNr., VHV, § 18 MStV), Support-Adresse im Login | eb457d7, 55a36c0 |
| Neues Ramboeck-Logo überall (Light/Dark im Login App+Portal, Header-Icon, alle Favicons/PWA-Icons aus Navy-Kachel #211C38) | 57942fd |
| Portal-Branding: eigener Tab-Titel „Kundenportal", eigenes portal-manifest.json; VitePWA-Manifest repariert (zeigte nicht existente Icons) | 24569d5 |
| **Passwort-Reset Haupt-App repariert**: `/reset-password` wurde von der App-Catch-all kanonisiert (Token verworfen) → eigene Route; `/join/:code` gleicher Guard | c7b988c |
| **Nachtrags-Protokoll**: `time_entry_changes` (Vorher/Nachher-JSONB), Mutationen an Einträgen in abgeschlossenen Monaten → Log + Admin-Mail, Tab Berichte → „Nachträge", Hinweis in der Erfassung | 3afcbec |
| **„Still kaputt"-Klasse behoben (3 Geschwister)**: Feature-Pakete (TanStack-Query, 3 Retries, localStorage-Cache — Module verschwanden nach Login), Eintrag-Speichern (JEDER Fehler → Offline-Queue + Toast statt Datenverlust bei Session-Ablauf) + proaktiver Session-Keep-Alive (JWT-Exp-Check jede Minute, Refresh <15 min Rest, Login-Screen ≤60 s nach endgültigem Tod), Stammdaten-Boot (`Promise.allSettled` + Retries + Fokus-Retry statt Promise.all-Alles-oder-Nichts → „Unbekanntes Projekt") | 9e20270, cd7bf10, 94d165d |
| **„App down nach Deploy"-Vorfall (03.08.) gelöst**: veraltete index.html im Client-Cache zeigte auf gelöschte Bundle-Hashes. index.html no-store, sw/registerSW/manifeste no-cache (beide nginx-Ebenen — Asset-Regex hatte sw.js 1 Jahr immutable gecacht!), Haupt-Bundle in SW-Precache (5 MB Limit), `vite:preloadError` → einmaliger Selbst-Reload | 426113c |
| **Arbeitszeit ↔ Projektzeit Paket 1+2**: `GET /work-sessions/coverage`, Abdeckungs-Balken in der AttendanceBar, Ausstempel-Abgleich-Dialog (nachtragen / als intern buchen / trotzdem raus) bei >15 min nicht zugeordneter Zeit | 3b5eb59 |
| **Arbeitszeit-Korrekturen NUR für Admin/Owner** (Berichte → Arbeitszeit): nachtragen für beliebige Mitglieder, Beginn/Ende/Pause korrigieren, offene Sessions schließen, Fehlbuchungen löschen — alles mit Vorher/Nachher im Audit-Log | a91667f |
| Wochenraster: Beschreibungs-Stift pro Zelle UND pro Tag (Tages-Total) — Panel mit allen Einträgen, einzeln editierbar, Autocomplete aus früheren Beschreibungen; entsperrt auch ×2-Zellen | 5b7b061, dca3079 |
| Edit-Dialog Zeiteinträge: 2xl-Desktop-Layout, SearchableSelect fürs Projekt, 24h-Zeitfelder mit Auto-Format (statt AM/PM-Locale-Falle), Live-Dauer-Chip, letzte Projekt-Beschreibung als übernehmbarer Vorschlag | 1b48689, e6f39f8 |
| Kontakte-Dialog zeigt Server-Fehlermeldungen im Toast (Diagnose statt Generik) | 6aeeef8 |
| nginx: docs.ramboeck.it (BookStack) ins Repo übernommen — proxy_pass über Variable+Resolver, damit ein fehlender BookStack-Container nicht App+Portal beim nginx-Start mitreißt | 8e29c92 |

### Stabilitäts-Sprint Anfang Juli 2026 — ✅ abgeschlossen

| Task | Commit |
|---|---|
| **NinjaRMM: Kritische Alerts erzeugten keine Tickets** (Priority-Check-Bug) | 65e9a4d |
| Vulnerability-Sync: Endpoint-Diagnose im Toast, Typisierung statt `any` | b6d53ab, b1d49f6 |
| **NinjaOne-API-Limitierung verifiziert** (offizielle OpenAPI-Spec 2.0.9): kein Lese-Endpoint für native CVEs — Details siehe Hinweis-Box in der NinjaRMM-Sektion. Dashboard zeigt Hinweis-Banner | 3ac440b |
| **React #310 Crash auf /support/tickets** — `useCallback` nach Early-Return in TicketKanban; App-weiter `rules-of-hooks`-Sweep fand + fixte 2 weitere (PortalInvoices `useEffect`, SocialMediaManager `useTemplate`→`applyTemplate`) | cc16ba9 |
| **Sleep-Mode-Logout behoben** (3 Ursachen): (1) Frontend wertete JEDE Nicht-OK-Antwort vom Refresh als Session-Tod inkl. 429/5xx → jetzt nur 401/403 fatal. (2) `/auth/refresh` hing am 5/15min-Login-Brute-Force-Limiter → eigener `refreshLimiter` (60/15min). (3) Multi-Tab-Rotation-Race → Web-Locks Cross-Tab-Mutex in `tryRefreshAccessToken` | 45fc233 |
| **Deploy-Script** `scripts/deploy.sh` — git pull + `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build` + Health-Checks; `--no-pull`-Option; Preflight für root-owned `.git` | e12758b, 80de596 |
| **E-Mail-Anhänge → Ticket** + Attachment-Handling-Fixes (Details siehe Bug-Tabelle „Tickets") | 1603e4d |
| **Static-Serving eingeschränkt** auf `uploads/tickets` — Rechnungs-PDFs nur noch über den authentifizierten Download-Endpoint | a7604e8 |
| **Route-Shadowing-Sweep: 6 tote Routen reaktiviert** — Bulk Actions, Ticket Templates, Task-Reorder, Maintenance-Bulk-Delete, Pipeline-Stage-Reorder, Line-Items-Bulk-Contract (Details siehe Tabelle „Ticket System Verbesserungen") | b895df0 |
| **TanStack Query: TimeEntriesList + Stopwatch** — damit Zeiterfassung komplett migriert | f01807f |

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

### 🎯 Offene Punkte auf einen Blick (Stand 5.7.2026 — Basis für nächste Planungsrunde)

> Konsolidierte Sicht über alle Sprints/Epics hinweg. Sprints 1–4, A–F, G1–G5 und der Juli-Stabilitäts-Sprint sind komplett ✅ — das hier ist ALLES, was noch offen ist, sortiert nach empfohlener Priorität.

| Prio | Task | Aufwand | Kontext |
|---|---|---|---|
| ~~1~~ ✅ | ~~**NinjaRMM: Diagnose-Endpoint + device-health-Aggregatzähler**~~ | erledigt | **Commit ad0d5ca (30.7.2026):** `GET /api/ninjarmm/diagnose` probt 7 Endpoints mit gespeichertem OAuth-Token (Diagnose-Karte im Sync-Tab der NinjaRMM-Settings); `syncDeviceHealthCounts()` synct `critical/high/medium/low_vuln_count` + `health_status` aus `/v2/queries/device-health` (cursor-paginiert, non-fatal in syncAll, manuell via `POST /sync-health`); VulnerabilitiesDashboard zeigt Tabelle „Schwachstellen-Zähler pro Gerät". CVE-Details bleiben API-bedingt unmöglich (siehe Limitierungs-Box). |
| ~~2~~ ✅ | ~~**SocialMediaManager.tsx splitten**~~ | obsolet (22.8.) | Datei war seit dem features/social-media-Modul (SocialMediaLayout) **nirgends mehr importiert** → GELÖSCHT (1ad5bd8) statt gesplittet. Live-UI ist `src/features/social-media/`. |
| ~~3~~ ✅ | ~~**TS-Fehler 374 → 0**~~ | erledigt (22.8.) | Commits 46ad2ef, 919f972, 1ad5bd8 — siehe Tech-Debt-Sprint-Tabelle. **Neue Regel: `npx tsc --noEmit` muss bei 0 bleiben.** |
| ~~4~~ ✅ | ~~**Push-Notifications: VAPID-Keys im Admin-Setup erzwingen**~~ | erledigt (5.9.) | fd7c334: Admin-UI erzeugt Keys (fertiger .env-Block + Anleitung), subscribe → 503 ohne Keys, generate-vapid-403-Bug gefixt (req.user.role war nie gesetzt). |
| ~~5~~ ✅ | ~~**text-gray-* Cleanup**~~ | erledigt (5.9.) | fd7c334: Finanzen + MaintenanceView manuell bereinigt (inkl. STATUS_COLORS-Dark-Varianten). |
| ~~6~~ ✅ | ~~**React Router v7 Upgrade**~~ | erledigt (5.9.) | 45046ea: react-router@7.18 (react-router-dom raus), 9 Dateien umgestellt, Runtime-Smoke grün. Offen bleibt optional Pass 5 (App.tsx switch → echte `<Route>`-Elemente). |
| 7 | **Epic G Rest: Distributor-Integrationen** | je 1-3 Tage | ADN-Lizenzimport, Infinigate, Lywand-Security-Audits im Portal, Microsoft Security Center Scores. Reihenfolge nach Business-Priorität festlegen. |
| 8 | **Social Media: echtes Posten an Plattformen** | 3-5 Tage | Aktuell nur DB-Einträge. Meta/LinkedIn-APIs, OAuth-Flows, Fehlerbehandlung. |
| ~~9~~ ✅ | ~~**database.ts splitten**~~ | erledigt (6.9.) | 49cb3ee: 16 nummerierte Dateien unter `config/migrations/`, Schema-Dump byte-identisch verifiziert. Inkl. Fresh-Install-Regression-Fix (email_on_new_ticket-Guard lief vor dem CREATE). |
| ~~10~~ ✅ | ~~**Schichtenarchitektur-Pilot**~~ | erledigt (6.9.) | f34e9b2: tickets.ts → `routes/tickets/01–08` + `shared.ts` (Schemas/Helfer als Repository-Ansatz), 6-Zeilen-Shim hält Importpfade. Routen-Tabelle vorher/nachher identisch (53 Routen), 19-Endpoint-Smoke grün. ⚠️ Mount-Reihenfolge in index.ts nie umsortieren (Route-Shadowing). |

**Neu hinzugekommen (August 2026):**

| Prio | Task | Aufwand | Kontext |
|---|---|---|---|
| ~~A1~~ ✅ | ~~**Schema-Sweep**~~ | erledigt (21.8.) | 3 Agenten prüften ALLE Server-Queries gegen das **echte Prod-Schema** (Export: `docs/prod-schema-columns.md`). Ergebnis: 14 echte Laufzeit-Bugs gefixt (3e5731f: Vertragsstunden-Cron, Health-Score, Firmendaten, Checklisten, Gerätedetail, Wartung, Merge, Carousel, Report-Kontakte, Mail-Verlauf, tote sla-policies.ts entfernt) + database.ts per Migrationen an Prod angeglichen (b29ee3a: ticket_activities/kb_*/ticket_sequences-CREATEs, ticket_comments.content, tickets-SLA/Merge/Satisfaction-Spalten u.v.m.). ⚠️ Merke: **Prod-DB ist der gewachsenen Wahrheit voraus** — bei Konflikten gilt docs/prod-schema-columns.md, nicht database.ts-Historie. |
| ~~A2~~ ✅ | ~~**Fresh-Install-Bugs in database.ts**~~ | erledigt (21.8.) | Mit b29ee3a: organizations/customer_contacts idempotent vorgezogen, ticket_comments-Migration hinter CREATE, invoice_line_items-Guards, ticket_sequences-CREATE. **Verifiziert: leere PostgreSQL 16 bootet fehlerfrei durch (112 Tabellen)** — Dev-Umgebungen funktionieren jetzt auf Anhieb. |
| ~~A3~~ ✅ | ~~**Zeiterfassung Paket 3+4**~~ | erledigt (21.8.) | Paket 3 (c6448ea): Tab „Tag" unter Zeiten — Timeline mit Anwesenheits-/Eintrags-Spur, Lücken ≥10 min klickbar → Schnell-Erfassung mit vorausgefüllten Grenzen, deep-linkbar (`?view=day&date=`). Paket 4 (ea97551): `GET /work-sessions/team-coverage`, Tabelle „Abdeckung & Verrechenbarkeit" (inkl. € und Offen-Schätzung) unter Berichte → Arbeitszeit, Cron 08:30 Erinnerungs-Mail (<85 % Abdeckung, Deep-Link auf Timeline) + Mo 08:00 Admin-Wochenmail. Kette Anwesenheit→Abdeckung→Abgleich→Timeline→€-Auswertung komplett. |
| A4 | **Portal-Pilotphase** | — | 1–2 echte Kunden, Feedback einsammeln. Technisch bereit: Nice-to-haves erledigt (052de6a: Session-Ablauf-Banner statt stiller 401s, Hardware/Lizenz-Trennung, Debug-Logs raus). |
| A5 | Kleinkram | je <2h | Anträge-Badge in Berichte-Tabs · deutsches Datumsformat im Edit-Dialog (ModernDatePicker) · Massenbearbeitungs-Dialog aufhübschen · Beleg-Komfort-Rest (Duplikat-Warnung, Fälligkeits-Radar) · **Mobile Bottom-Navigation: alle Bereiche bedienbar machen** (Finanzen läuft rechts aus dem Viewport — scrollbar mit Indikator oder kompaktere Items; Screenshot 21.8.) |

**Verschoben/bewusst offen:** Authentifiziertes Attachment-Serving (Capability-URLs reichen vorerst, siehe Hinweis-Box bei den Ticket-Bugs) · Offline-Sync für andere Aktionen als Zeiteinträge · React 19 Upgrade (Abhängigkeiten prüfen).

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
| ✅ | **Vertrags-Stunden-Cron** — automatische Stunden-Abrechnung aus Verträgen | `server/src/jobs/contractHoursCron.ts` | 4-6h | Commit e165343. Cron-Job läuft täglich um 6:00 Uhr, prüft Stundenverbrauch gegen Kontingent. Schwellen: 80% Warning, 90% Critical, 100%+ Exceeded. API-Endpoints: `GET /api/contracts/hours-check/status`, `POST /api/contracts/hours-check/run`. |
| ✅ | **CommandPalette-Historie** — letzte 3-5 Aktionen anzeigen | `src/components/CommandPalette.tsx` | 2-3h | Commit e37a668. Letzte 5 Befehle in localStorage, „Zuletzt verwendet" Sektion beim Öffnen. |
| ✅ | **CRM-Finanzen-Brücke** — Angebote direkt aus Sales Pipeline erstellen | `src/components/SalesPipeline.tsx` + `QuoteEditor.tsx` | 4-6h | Commit 7fb86c7. Bei Opportunity in „Won"-Stage → Dialog „Angebot erstellen" → öffnet QuoteEditor mit vorausgefülltem sevDesk-Kontakt. |
| ✅ | **SSE für Echtzeit-Updates** — NinjaRMM Alerts ohne Polling | `server/src/routes/sse.ts` + `src/hooks/useSSE.ts` | 1-2 Tage | Commit ae64770. Backend: `/api/sse/events` mit JWT-Auth. Frontend: `useSSE` Hook invalidiert TanStack Query bei Events. Polling bleibt als Fallback. |
| ✅ | **Mobile-Strategie** — TicketKanban auf Mobile deaktivieren, Tabellen → Card-Layout | `src/components/TicketKanban.tsx` | 3-4h | Commit 2b854c3. Mobile (<768px): collapsible card list per Status. Desktop: Kanban mit Drag-and-Drop. |

### 🔵 Sprint 5 — Tech-Debt & Architektur (unabhängig, jederzeit einschiebbar)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **TS-Fehler reduzieren** (374 → **0**, 22.8.2026) | diverse | erledigt | Commits 46ad2ef (132× TS6133), 919f972 + 1ad5bd8 (alle Typ-Mismatches: Interfaces an echte API-Responses angeglichen statt Properties zu erfinden; 12 Laufzeitbugs nebenbei gefixt). |
| ✅ | **Ticket Detail Desktop-Layout** | `src/components/TicketDetail.tsx` + ticket-detail/* | 2h | Commit 1266a09. Desktop: 2-Spalten-Layout (Hauptinhalt links, Sidebar rechts sticky). Mobile: Metadata oben. Source-Badge, Assigned-User in Sidebar. |
| ✅ | **TanStack Query** für TaskHub, TimeEntriesList, Stopwatch | diverse | 4-6h | TaskHub ✅ (efbb042). TimeEntriesList + Stopwatch ✅ (f01807f): Entries-Fetch → useQuery mit `keepPreviousData` + `staleTime 0`, AI-Config als geteilter `['ai','config']`-Key (TicketDetail/Stopwatch/TimeEntriesList teilen einen Request). |
| ✅ | ~~**SocialMediaManager.tsx splitten**~~ | — | obsolet | Datei war toter Code (nirgends importiert; Live-UI = `features/social-media`) → gelöscht (1ad5bd8). |
| ✅ | **Test-Setup** (Vitest) + erste Unit-Tests | `vite.config.ts`, `src/test/`, `src/utils/*.test.ts`, `src/hooks/*.test.ts` | 1 Tag | 57 Tests für utils (time, timeRounding, uuid, sanitize) und hooks (useMediaQuery, useOnlineStatus). `npm run test` / `test:run` / `test:coverage`. |
| ✅ | **React Router v7 Upgrade** | `package.json` + alle Router-Imports | erledigt (5.9.) | 45046ea: react-router@7.18, Imports auf 'react-router', keine API-Änderungen nötig (nur BrowserRouter/Routes/Hooks in Verwendung). |
| ✅ | **Push Subscriptions zusammenführen** | `server/src/config/database.ts` + Routes | 2-3h | Migration: `subscription_type` + `contact_id` Spalten, Daten-Migration, Routes aktualisiert. |

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
| ~~CRM-Finanzen-Brücke: Angebote direkt aus Sales Pipeline erstellen~~ | ✅ Erledigt (Commit 7fb86c7) |
| ~~Push-Notifications: VAPID-Keys im Admin-Setup erzwingen~~ | ✅ Erledigt (fd7c334) |
| Social Media: Echtes Posten an Plattformen (aktuell nur DB-Einträge) | Offen |
| ~~Push Subscriptions: `push_subscriptions` + `portal_push_subscriptions` zusammenführen~~ | ✅ Erledigt |

### Langfristig — Architektur

| Task | Beschreibung |
|---|---|
| ~~Schichtenarchitektur (Controller/Repository)~~ ✅ (f34e9b2) | tickets.ts in 8 Module + shared.ts gesplittet; echte Controller/Service-Trennung optional bei künftigem Umbau |
| `any`-Typen eliminieren | ca. 40+ Stellen im Backend |
| ~~React Router v7 Upgrade~~ ✅ (45046ea) | Offen bleibt optional: echte `<Routes>`/`<Route>` statt App.tsx-switch (Pass 5) |
| React 19 Upgrade | Server Components, `use()` Hook (Drittanbieter-Kompatibilität prüfen) |

---

## Verhaltensregeln für KI-Assistenten

1. **Keine Datenverluste:** Bei Datenbank-Änderungen IMMER `IF NOT EXISTS` oder `DO $$ BEGIN ... EXCEPTION ... END $$;` verwenden. Keine Tabellen droppen.
2. **Keine neuen `any`-Typen:** TypeScript strikt verwenden. Zod für API-Validierung nutzen.
3. **Mobile First:** Bei neuen UI-Komponenten immer prüfen, wie sie auf einem Smartphone aussehen.
4. **Keine nativen Alerts:** `window.alert` und `window.confirm` sind verboten. Nutze `Toast` und `ConfirmDialog`.
5. **Farben & Theme-Tokens:** Nutze die CSS-Variablen-Tokens (`bg-dark-50/100/200/300`, `border-dark-border`, `text-dark-400/500`, `bg-accent-primary`, `text-accent-dark` etc.), **niemals hartcodierte** Tailwind-Farben wie `dark:bg-gray-800` oder `dark:border-gray-700`. Die `dark-*` Tokens werden durch die `tone-*` Klasse (`tone-medium`/`tone-dark`/`tone-ramboeck`) per CSS-Variable umgesetzt — hardcodete `gray`-Klassen bleiben fix und ignorieren den Theme-Switch. Ausnahmen sind nur semantisch zwingende Stellen (Status-Color, Error-Badge = Rot, Info-Toast = Blau, Brand-Logos wie Facebook).
6. **Zod-Validierung ist Pflicht** — jede neue Route muss Eingaben mit Zod + `validate()` middleware validieren.
7. **Kein `SELECT *`** — immer explizite Spaltenlisten in SQL-Queries. ⚠️ **Vor dem Ersetzen von `SELECT *` zwingend `server/src/config/migrations/` für die betreffende Tabelle lesen** (CREATE TABLE + alle ALTER TABLE; bis 6.9.2026 lag alles in database.ts). Spalten, die nur in einer Migration stehen aber nicht im CREATE TABLE, können in der Praxis fehlen. Erfahrung aus Sprint 3 (12.6.2026): 5 aufeinanderfolgende Fix-Commits nötig, weil `is_active` und `deleted_at` in `activities` referenziert wurden, die dort nicht existieren.
8. **Soft-Delete beachten** — Queries auf `customers`, `projects`, `activities`, `contracts` immer mit `WHERE deleted_at IS NULL` filtern. DELETE-Endpoints nutzen `UPDATE SET deleted_at = NOW()`, nicht `DELETE FROM`.
9. **Paginierung bevorzugen** — neue Listenendpunkte immer mit `?page=&limit=` implementieren. Legacy-Clients via `?all=true` rückwärtskompatibel halten.
10. **`password_hash` niemals zurückgeben** — in keiner API-Antwort.
11. **Lazy Loading beibehalten** — neue schwere Komponenten in `App.tsx` als `lazy()` importieren.
12. **Rückwärtskompatibilität** — Legacy-Clients müssen weiterhin funktionieren (`?all=true` für entries, ältere Field-Defaults).
13. **Branch-Konvention beachten** — Feature-/Fix-Branches IMMER von `claude/next-version-roadmap-ks0D0` ausgehen, PRs gegen denselben Branch eröffnen (= Hetzner-Stand). Niemals direkt gegen `main`. Details siehe Sektion „Branch-Konvention" oben.
14. **Zod-Schemas IMMER gegen den echten Frontend-Aufruf schreiben** — vor dem Definieren/Ändern eines Schemas zwingend den API-Client (`src/services/api/*.ts`) und die aufrufende Komponente lesen: exakte Feldnamen, String vs. Objekt, Enum-Wertemengen, Datumsformate (`<input type="date">` sendet `YYYY-MM-DD`, `datetime-local` ohne Sekunden — beides scheitert an `z.string().datetime()`!), und ob PUT-Routen Partial-Updates bekommen (`.partial()`). ⚠️ `users.id` ist TEXT, kein `.uuid()` erzwingen. Erfahrung vom 6.7.2026: Audit fand 16 Schemas, die gültige Frontend-Requests mit 400 ablehnten (u.a. MFA-Recovery-Codes, KI-Feedback, Clockodo-Import, SLA-Policies) — Commits 41933b2, 12f63cf, ec890b1.

---

## Bekannte Probleme (pre-existing)

- ~~**TS-Fehler-Baseline**~~ ✅ **0 Fehler seit 22.8.2026** (vorher 374). Frontend UND Backend kompilieren fehlerfrei. **Regel für alle künftigen Änderungen: `npx tsc --noEmit` (Root + server/) muss bei 0 bleiben — neue Fehler sofort fixen, keine neue Baseline aufbauen.**
- Social Media Modul postet aktuell nicht wirklich an Plattformen (nur Datenbankeinträge).
- Offline-Sync funktioniert nur für Zeiteinträge, nicht für andere Aktionen.
- ~~`database.ts` zu groß~~ ✅ Gesplittet 6.9. (49cb3ee) in `config/migrations/001–016` + index.ts. Neue Migrationen als NEUE nummerierte Datei ans Ende der MIGRATIONS-Liste — bestehende nie umsortieren.
- ~~**Fresh-Install kaputt**~~ ✅ Behoben 21.8. (b29ee3a) — leere DB bootet fehlerfrei durch; siehe A2.

### Tickets — Offene Bugs & Verbesserungen (Stand 14.6.2026)

| Priorität | Problem | Beschreibung |
|---|---|---|
| ~~🔴 Hoch~~ | ~~**KI-generierter Text nicht lesbar**~~ | ✅ Gelöst in Commit 8a08304. Dark-Mode-Kontrast verbessert: `purple-400` → `purple-200`, `prose-invert` → explizite `gray-100`. |
| ~~🟠 Mittel~~ | ~~**Ticket-Darstellung optimieren**~~ | ✅ Gelöst in Commit 3541f1a. Sidebar-Layout mit Tasks, Activities, Email-History. Collapsible Sections. |
| ~~🟡 Normal~~ | ~~**Schnittstellen-Optimierung**~~ | ✅ Gelöst in Commit 3541f1a. NinjaRMM Device-Linking im Ticket. E-Mail-Diagnose im Admin-Bereich. |
| ~~🟠 Mittel~~ | ~~**Attachment-Handling verbessern**~~ | ✅ Gelöst in Commit 1603e4d. Delete-File-Leak gefixt (basename statt URL-Join), Multer-Limit 5→10 (Route versprach 10), Upload-Fehler (zu groß/zu viele/Dateityp) als 400 mit deutscher Meldung bis in den Toast, `uploadAttachments` via `authFetchMultipart`, `CREATE TABLE ticket_attachments` nachgerüstet, accept-Liste an Backend-Whitelist angeglichen. |
| ~~🟠 Mittel~~ | ~~**E-Mail-Anhänge verarbeiten**~~ | ✅ Gelöst in Commit 1603e4d. `saveEmailToTicket` holt Anhänge von MS Graph (solange die Mail noch im Postfach liegt), speichert sie lokal + in `ticket_email_attachments` (hatte vorher **null Schreiber**). E-Mail-Verlauf zeigt Download-Chips, Attachment-Liste des Tickets zeigt E-Mail-Anhänge read-only mit Badge. |

> **Verbleibende bekannte Schwäche (Attachments):** `/api/uploads/tickets` wird via `express.static` **ohne Auth** ausgeliefert (`server/src/index.ts`) — seit Commit a7604e8 ist das Serving auf das tickets-Unterverzeichnis beschränkt, Rechnungs-PDFs (`uploads/invoices`) laufen ausschließlich über den authentifizierten Download-Endpoint. Schutz der Ticket-Dateien ist die Nicht-Erratbarkeit der UUID-Dateinamen (Capability-URLs). Ein authentifizierter Streaming-Endpoint würde `<img>`-Previews und Portal-Zugriff brechen und braucht ein eigenes Konzept (z.B. signierte Kurzzeit-URLs). Bewusst zurückgestellt.

### Ticket System Verbesserungen (14.6.2026)

| Task | Commit |
|---|---|
| **E-Mail-Diagnose Endpoint** — `GET /api/admin/email/diagnose` mit Provider-Status, Fehler-Analyse, Empfehlungen | 674445b |
| **E-Mail-Diagnose UI** — Neuer Tab „E-Mail-Diagnose" in Settings mit vollständiger Diagnose + Test-Button | 3541f1a |
| **Ticket-Sidebar überarbeitet** — Tasks, Aktivitätsverlauf, E-Mail-Verlauf in rechte Sidebar verschoben | 3541f1a |
| **Aufgaben mit Fälligkeitsdatum** — Datepicker, überfällige Tasks rot, heute orange, aufklappbar | 3541f1a |
| **NinjaRMM Geräteverknüpfung** — Gerät mit Ticket verknüpfen, Status-Anzeige, Dropdown zur Auswahl | 3541f1a |
| **Quick Status/Priority Change** — Status und Priorität direkt per Dropdown ändern ohne Edit-Modus | f961f2e |
| **Ticket Templates** — Vorlagen für häufige Ticket-Typen. UI (CreateTicketDialog, TicketSettings) und Backend waren komplett — `GET /tickets/templates` wurde aber von `GET /:id` geschluckt (Route-Order), die Liste lieferte immer 404 | b895df0 |
| **Bulk Actions** — Mehrfachauswahl + Massenaktionen (Status/Priorität/Zuweisen/Archivieren/Löschen) in TicketList. War komplett gebaut — nur `DELETE /tickets/bulk` wurde von `DELETE /:id` geschluckt | b895df0 |
| **Route-Shadowing-Sweep** — Scanner über alle Route-Dateien fand 6 tote Routen (Express-Registrierungsreihenfolge): tickets bulk-delete/templates/task-reorder, admin maintenance-bulk-delete, opportunities stages-reorder, sevdesk line-items bulk-contract. Alle vor die param-Routen verschoben | b895df0 |

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

### ✅ Sprint C — Portal-Fundament bereinigen

**Abhängigkeit:** keiner | **Status:** Komplett (Commit 465bb53)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Einheitliches Berechtigungsmodell** | `customer-portal.ts`, `database.ts` | 2h | `getContactPermissions()` liest nun ausschließlich aus `customer_portal_users`. Neue Spalten `can_view_time_report`, `can_view_contract` mit Migration. |
| ✅ | **Einladungsfluss reparieren** | `CustomerHub.tsx` | 3h | `handleEnablePortalAccess` implementiert. Ruft `/api/contacts/:id/portal-access`, kopiert Einladungslink in Zwischenablage, zeigt Toast. |
| ✅ | **PortalSettings konsolidieren** | `portal.ts`, `tickets.ts`, `index.ts` | 1h | Kanonisches Interface in `portal.ts` mit allen Feldern inkl. `showTimeReport`, `showContractInfo`. Duplikat aus `tickets.ts` entfernt. |

---

### ✅ Sprint D — Kundenportal: Stundentransparenz und Vertragsansicht

**Abhängigkeit:** Sprint A + Sprint C vollständig | **Status:** Komplett (Commit 8a08304)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Backend: Portal-Zeitreport-Route** | `server/src/routes/customer-portal.ts` | 2h | `GET /api/customer-portal/time-report?month=YYYY-MM` + `GET /api/customer-portal/time-report/months`. Prüft `can_view_time_report`. Filtert `time_entries` nach `customer_id`, `customer_visibility IN ('summary','detailed')`, `entry_scope = 'customer_project'`. Response: `{ month, totalHours, billableHours, byProject, detailedEntries?, entryCount }`. |
| ✅ | **Frontend: PortalTimeReport-Komponente** | `src/components/portal/PortalTimeReport.tsx` | 3h | Monatsauswahl (Dropdown), 4 Summary-Cards (Gesamt, Verrechenbar, Projekte, Einträge), Projekttabelle mit aufklappbaren Details. In `CustomerPortal.tsx` als View `'time-report'`, Tab „Stunden" in `PortalLayout.tsx`. |
| ✅ | **Backend: Portal-Vertragsroute** | `server/src/routes/customer-portal.ts` | 1h | `GET /api/customer-portal/contract`. Prüft `can_view_contract`. Gibt aktiven Vertrag zurück: Name, Laufzeit, enthaltene Stunden/Monat, verbrauchte Stunden aktueller Monat, SLA-Reaktionszeit, Status, Ansprechpartner, Hinweise. |
| ✅ | **Frontend: PortalContract-Komponente** | `src/components/portal/PortalContract.tsx` | 2h | Kontingent-Fortschrittsbalken, SLA-Reaktionszeiten, Vertragslaufzeit, Ansprechpartner. Status-Badge (Aktiv/Ausstehend/Abgelaufen). Tab „Vertrag" in PortalLayout. |

---

### ✅ Sprint E — Kundenportal: Qualitätsverbesserungen

**Abhängigkeit:** Sprint C vollständig | **Status:** Komplett (Commits 5faba28, e392a55)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Ticket-Liste: Informationsdichte erhöhen** | `src/components/portal/PortalTicketList.tsx` | 2h | Commit 5faba28. Letztes Update (relativ), zuständiger Mitarbeiter, SLA-Ampel, Prioritäts-Badge. `waiting_for_customer` → „Ihre Rückmeldung". |
| ✅ | **Ticket-Erstellung: Formular verbessern** | `src/components/portal/PortalCreateTicket.tsx` | 2h | Commit e392a55. Gerät aus Kundenliste wählbar. Anhänge: max 3 Dateien (Bilder/PDF/Word/Excel/Text), max 10 MB. Dringlichkeit war bereits vorhanden (low/normal/high/critical). |
| ✅ | **Geräte: Warnungen prominenter** | `src/components/portal/PortalDevices.tsx` | 1h | Commit 5faba28. Sortierung nach Kritikalität (Warnungen oben). Zusammenfassungskarte „X Geräte mit Warnungen". |
| ✅ | **Portal-Dashboard als Startseite** | `src/components/portal/PortalDashboard.tsx` (neu) | 2h | Commit 5faba28. Startseite mit Tickets-/Geräte-/Stunden-/Vertrags-Übersicht. Quick-Action für neues Ticket. |

---

### ✅ Sprint F — Abwesenheitskalender und Teamübersicht

**Abhängigkeit:** Sprint B vollständig | **Status:** Komplett (Commit 95ba593)

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **Abwesenheitskalender (eigene Einträge)** | `src/components/AbsenceCalendar.tsx` | 3h | Monatskalender mit farbcodierten Abwesenheiten (Urlaub=grün, Krankheit=rot, Sonderurlaub=gelb). Monats-/Jahresstatistik. Erreichbar unter „Berichte" → „Abwesenheit". |
| ✅ | **Teamübersicht für Admin/Manager** | `src/components/TeamAbsenceOverview.tsx` | 3h | Gantt-artige Jahresübersicht aller Teammitglieder. Heute-Marker, Monatsheader, Jahresnavigation. Nutzt `GET /api/entries/team?entryScope=absence`. Erreichbar unter „Berichte" → „Team-Urlaub" (nur Admin/Owner). |
| ✅ | **Admin-Zeitenübersicht (alle Teammitglieder)** | `src/components/AdminTeamTimeView.tsx`, `server/src/routes/entries.ts` | 3-4h | Dashboard mit Dropdown zur Mitarbeiterauswahl, Zeiten-Liste org-weit, Filter, CSV-Export. Erreichbar unter „Berichte" → „Team" (nur Admin/Owner). |

---

*Zuletzt aktualisiert: 6.9.2026 — Portal-Lizenzansicht hart deaktiviert 🔒 (97ed079): zeigte EK-Preise der Distributoren-Rechnungen; Reaktivierung erst mit VK-Preiskonzept (fester Preis pro Kunde/Produkt, kein Prozentsatz — neuer Sprint-J-Punkt). Davor Portal-Politur ✅ (052de6a): Session-Ablauf-Banner, Hardware/Lizenz-Trennung, Logs raus — Portal-Pilot technisch bereit. Davor tickets.ts-Split ✅ (f34e9b2): 8 Route-Module + shared.ts, Routen-Tabelle identisch verifiziert, 19-Endpoint-Smoke. Davor Anhänge-Vorschau ✅ (d517845): Bild-Lightbox + PDF-iframe im Ticket. Davor database.ts-Split ✅ (49cb3ee): 16 nummerierte Migrationsdateien, Schema byte-identisch verifiziert (Fresh-DB-Dump-Diff), Fresh-Install-Regression gefixt (email_on_new_ticket-Guard). Davor Interne-Tickets-Prod-Fix ✅ (f46236a: tickets.customer_id DROP NOT NULL). Davor Rechnungseingang Teil 2 ✅ (18a5b33): Fälligkeits-Radar (inkl. sevDesk-Zahlstatus-Sync + werktägliche Erinnerung), Lieferanten-Gedächtnis, Batch-Freigabe. Davor Teil 1 ✅ (167b176): sprechende Liste (Betrag/Fälligkeit/Duplikat-Chip), Duplikat-Warnung im Review, Admin-Benachrichtigung + Sidebar-Badge, Postfach-Vollsperre-Bugfix. Davor Formular-Kit Pass 3 ✅ (c41ad30): CRM + Settings vereinheitlicht (48 Felder, inkl. 5 Dark-Mode-Bugfixes). Damit sind alle Alltagsformulare auf dem Soft-Filled-Kit-Look; UX-Programm abgeschlossen. Davor Pass 2 (2c28273): Zeiterfassung komplett auf Kit-Look (Manuell/Stoppuhr/Edit-/Bulk-Dialog). Davor Pass 1 (0868ab4): Kit gehärtet (eine Feldgröße, FormRow mobile-first, ReactNode-Labels), CreateTicketDialog + TaskModal migriert, Bugfix: interne Tickets waren nicht anlegbar (Erstellen-Button blieb deaktiviert). Davor React Router v7 ✅ (45046ea): react-router@7.18, Smoke-Test grün. Davor Kleinkram-Sprint ✅ (fd7c334): VAPID-Setup im Admin-UI (inkl. generate-vapid-403-Bugfix), text-gray-Cleanup Finanzen/Wartung abgeschlossen, deutsches Datumsformat im Edit-Dialog. Davor UX-Paket 4 ✅ (de83d38): Undo-Toast beim Zeiteintrag-Löschen (Confirm-Dialoge raus, Wiederherstellen per Neuanlage), CommandPalette → globale Suche (Tickets/Kunden/Projekte, feature-/rollen-gegated). Offen aus UX-Programm: nur noch Formular-Kit. — Vorheriger Stand 3.9.2026: Berechtigungs-Härtung „Paket S" ✅ (c913521): Zeiten nur-eigene (Teamsicht bleibt Admin-Ansicht), Verträge API-geschützt + Org-Scope (INSERT schrieb nie organization_id!), Stundensätze für Nicht-Admins genullt. Davor (1.–2.9.): UX-Pakete 1–3, Signatur-Filter, nginx-SSE-Login-Vorfall, Edit-Dialog-Redesign, Button-type-Root-Fix, interne Tickets + Bereiche. Offen aus UX-Programm: Undo-Toast statt Confirm, CommandPalette→globale Suche, Formular-Kit. — Vorheriger Stand 27.8.2026: Ticket-Zuweisungs-Sprint ✅ (80efbea): Zuweisen im Detail/Erstellen/Aufgaben, „Meine Tickets“-Filter, Bulk benachrichtigt endlich, Namen statt UUIDs im Feed. Davor: E-Mail-Ticket-Sprint ✅ (860bc0c): Zuordnungs-Kaskade (Betreff/conversationId/References), Support-Inbox-Cron mit Auto-Attach, TicketPickerDialog, 8 Bugs (u.a. Dringend-400, Mail-Tickets ohne SLA, Merge verlor Mails). — Vorheriger Stand 22.8.2026: Tech-Debt-Sprint ✅: TS-Fehler 374 → 0 (Frontend + Backend kompilieren fehlerfrei), SocialMediaManager.tsx als toter Code gelöscht (Split obsolet), 12 Laufzeitbugs nebenbei gefixt (CRM-Dashboard lud nie Daten!), guarded Migration email_on_new_ticket. Nächstes: React Router v7, text-gray-Cleanup (Finanzen/MaintenanceView), Portal-Pilot. — Vorheriger Stand 4.8.2026: Go-Live-Sprint Kundenportal + Stabilität ✅: Portal-Härtung (8 Blocker), 4 Phantom-Spalten-Prod-Bugs gefixt (Kommentar-Mails gingen NIE raus!), „still kaputt"-Klasse behoben (Features/Speichern/Boot), Session-Keep-Alive, Cache-Härtung nach Deploy-Vorfall, Arbeitszeit-Admin-Korrekturen, Nachtrags-Protokoll, neues Logo + Rechtstexte. Offen: Schema-Sweep (läuft), Fresh-Install-Fixes, Zeiterfassung Paket 3+4, Portal-Pilot — siehe „Neu hinzugekommen (August 2026)".*

---

---

## Nächste Sprints für Claude Code (Stand 5.7.2026)

> **Für Claude Code:** Sprints 1–4 + A–F + G sind vollständig abgeschlossen ✅. TanStack Query für TimeEntriesList/Stopwatch ✅. Sprint H ist teilweise offen (TS-Fehler, Router v7, text-gray-Cleanup, SocialMedia-Split zuletzt). Die folgenden Sprints H–J sind die nächsten priorisierten Aufgaben. Reihenfolge: H → I → J. Branch-Konvention beachten.

### 🔴 Sprint H — Tech-Debt-Abschluss (Sprint 5 Rest)

**Abhängigkeit:** keine | **Geschätzter Aufwand:** 3–4 Tage

> **Priorisierung (5.7.2026):** SocialMediaManager-Split bewusst nach hinten gestellt — kein fachlicher Mehrwert, nur Code-Hygiene. Reihenfolge: TS-Fehler → Router v7 → text-gray-Cleanup → SocialMedia (zuletzt).

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **TS-Fehler auf 0 reduziert** | diverse | 22.8.2026 | 46ad2ef + 919f972 + 1ad5bd8. Wichtig: Die "fehlenden Properties" (`date`, `billed`, `trends`, `sla`) waren größtenteils **Phantom-Felder, die die API nie liefert** — gefixt wurde der Code (echte Feldnamen), nicht die Interfaces aufgebläht. Dabei 12 echte Laufzeitbugs gefunden (CRM-Dashboard lud NIE Daten, Kanban-Fälligkeits-Badge nie sichtbar, Vorlagen-Bearbeiten crashte, u.a.). |
| ✅ | **React Router v7 Upgrade** | `package.json` + alle Router-Imports | erledigt (5.9.) | 45046ea: react-router@7.18 (Hauptpaket statt react-router-dom-Shim), Playwright-Smoke: Back/Forward, Deep-Links, Legacy-Redirects, reset-password-Token. |
| ✅ | **TanStack Query für TimeEntriesList + Stopwatch** | `src/components/TimeEntriesList.tsx`, `src/components/Stopwatch.tsx` | 3–4h | Commit f01807f. Entries-Fetch → useQuery mit `keepPreviousData` + `staleTime 0`, AI-Config als geteilter `['ai','config']`-Key. |
| ✅ | **text-gray-* Cleanup (priorisiert)** | `Finanzen.tsx`, `MaintenanceView.tsx` | erledigt (5.9.) | fd7c334: manuell bereinigt inkl. STATUS_COLORS-Dark-Varianten. |
| ✅ | ~~**SocialMediaManager.tsx splitten**~~ | — | obsolet (22.8.) | Toter Code — seit dem features/social-media-Modul nirgends mehr importiert → gelöscht (1ad5bd8). |

---

### 🟠 Sprint I — Attachment-Handling & E-Mail-Anhänge

**Abhängigkeit:** keine | **Status:** Kern erledigt im Juli-Stabilitäts-Sprint (5.7.2026), nur zwei Ausbaustufen offen

> **Hinweis (5.7.2026):** Dieser Sprint wurde am 2.7. geplant, bevor der Juli-Stabilitäts-Sprint lief. Die drei Kernpunkte (E-Mail-Anhänge persistieren, Attachment-Handling reparieren, Größenlimit) sind seither erledigt (Commit 1603e4d + a7604e8). Es bleiben zwei optionale Ausbaustufen offen.

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ✅ | **E-Mail-Anhänge ans Ticket hängen** | `server/src/routes/microsoft365.ts` | 3–4h | Commit 1603e4d. `saveEmailToTicket` holt Anhänge von MS Graph, speichert lokal + in `ticket_email_attachments` (hatte vorher null Schreiber). E-Mail-Verlauf zeigt Download-Chips, Attachment-Liste zeigt E-Mail-Anhänge read-only. |
| ✅ | **Ticket-Attachments: Handling reparieren** | `src/components/ticket-detail/TicketAttachments.tsx`, `server/src/routes/tickets.ts`, `server/src/middleware/upload.ts` | 2–3h | Commit 1603e4d. Delete-File-Leak (basename), Multer-Limit 5→10, Upload-Fehler als 400 mit deutscher Meldung, `authFetchMultipart`, `CREATE TABLE ticket_attachments`, accept-Liste angeglichen. Static-Serving auf `uploads/tickets` beschränkt (a7604e8). |
| ✅ | **Attachment-Größenlimit serverseitig** | `server/src/middleware/upload.ts` | 30min | War bereits `fileSize: 10 MB`; Commit 1603e4d ergänzte MulterError-Handling (LIMIT_FILE_SIZE/COUNT/Dateityp) mit klarer Fehler-Response bis in den Toast. |
| ✅ | **Attachment-Vorschau ausbauen** | `src/components/ticket-detail/TicketAttachments.tsx` | erledigt (6.9.) | d517845: Bild-Lightbox (Zähler, Pfeiltasten-Blättern, Esc), PDF als eingebettete iframe-Vorschau. Dev-Hinweis: CORP blockt Bilder nur bei getrennten Origins — Prod (nginx, same-origin) unbetroffen. |
| ⬜ | **Offline-Sync für weitere Aktionen** | `src/hooks/useOfflineEntrySync.ts` | 2–3h | Aktuell nur Zeiteinträge. Erweiterung: Ticket-Kommentare und Task-Updates offline puffern. Gleiche `clientId`-Idempotenz-Strategie wie bei Einträgen. |

---

### 🟡 Sprint J — Distributor-Integrationen (Epic G Fortsetzung)

**Abhängigkeit:** Epic G vollständig (✅) | **Geschätzter Aufwand:** 5–8 Tage

| Status | Task | Datei | Aufwand | Hinweis |
|---|---|---|---|---|
| ⬜ | **ADN API-Anbindung** | `server/src/routes/sevdesk.ts` oder neue `server/src/routes/adn.ts` | 2–3 Tage | ADN Distributor-API: Lizenz-Import mit Preisen. Neue Tabelle `adn_licenses` (analog zu `invoice_line_items`). Matching über `CustomerMatchingService`. Cron-Job für täglichen Sync. |
| 🟡 | **Infinigate-Integration** | `server/src/routes/infinigate.ts`, `services/infinigateService.ts`, `jobs/infinigateSync.ts`, `InfinigateSettings.tsx` | 2–3 Tage | **Phase 1 ✅ (Commit 8df3259):** Rechnungs-/Lizenz-Sync gegen offizielle Reseller-API (StarterKit-OpenAPI verifiziert). Kein Lizenz-Endpoint in der API — PurchaseInvoice-Zeilen liefern `endCustomerDto` + `contractInformationDto` (licenseId, serialNumber, Laufzeiten) → `invoice_line_items` (source `infinigate_api`), Matching via CustomerMatchingService, täglicher Cron 06:45 + Settings-UI in Finanzen. **Offen (Phase 2):** Preislisten-/SKU-Suche mit EK-Preisen + Lagerbestand, Angebots-Abruf/-Annahme, Lizenz-Ablauf-Warnungen. |
| ⬜ | **Lywand Security-Daten im Portal** | `server/src/routes/customer-portal.ts`, `src/components/portal/PortalSecurity.tsx` (neu) | 2–3 Tage | Security-Audit-Daten von Lywand-API abrufen, im Kundenportal als neuer Tab „Sicherheit" anzeigen. Score, offene Findings, Empfehlungen. Berechtigung: `can_view_security` (neue Spalte in `customer_portal_users`). |
| ⬜ | **Microsoft Security Center** | `server/src/routes/microsoft365.ts` | 2 Tage | Security-Scores und Empfehlungen aus M365 Defender/Secure Score API abrufen. Neuer SubView unter Support → „M365 Security". |
| ⬜ | **Portal: VK-Preiskonzept für Lizenzansicht** (VORAUSSETZUNG) | `invoice_line_items` + Review-UI + `customer-portal.ts` | 1–2 Tage | ⚠️ Die Portal-Lizenzansicht ist HART deaktiviert (97ed079): sie zeigte die EK-Preise der Distributoren-Rechnungen. Entscheidung: fester angebotener Preis pro Kunde/Produkt (KEIN Prozentaufschlag) — z.B. `resell_price`-Spalte an der Position, gepflegt im LineItemReview, Portal zeigt nur diesen. Erst danach die Ansicht wieder freigeben (403 + canViewLicenses-Override in customer-portal.ts entfernen). |
| ⬜ | **Portal: Lizenz-Self-Service** | `src/components/portal/PortalLicenses.tsx`, `server/src/routes/customer-portal.ts` | 3–4 Tage | Kunde kann Lizenzen bestellen/ändern. Genehmigungsworkflow: Anfrage → Admin-Benachrichtigung → Bestätigung → Provisionierung. Neue Tabelle `license_requests`. Setzt das VK-Preiskonzept voraus. |

---

## ✅ Epic G — Lizenz-Management & Beleg-Positionen (abgeschlossen)

> **Status:** ✅ Vollständig abgeschlossen (Stand 15.6.2026) | **Aufwand:** ~25 Tage | **Abhängigkeit:** Sprint 3 (Tickets-Paginierung) ✅

### Übersicht

MSP/Reseller-Feature: Eingangsrechnungen von Distributoren (Microsoft CSP, Hornetsecurity, Mailstore, Elovade, Lywand, ADN) enthalten oft dutzende Positionen für verschiedene Endkunden. Diese sollen automatisch erkannt, Kunden zugeordnet und bei der Abrechnung berücksichtigt werden.

### Sprint G1 — Datenbank & Extraktion ✅

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **Tabelle `invoice_line_items`** | Positionen mit customer_id, match_confidence, rebilling_status. Commit 4502672 |
| ✅ | **Kunden-Erweiterung** | `primary_domain`, `distributor_identifiers` (JSONB) für Microsoft Tenant-ID, Hornetsecurity-Nr, etc. |
| ✅ | **pg_trgm Extension** | Fuzzy-Matching für Kundennamen |
| ✅ | **Line-Items persistieren** | Nach KI-Extraktion in DB speichern (`persistLineItems()` in invoiceProcessorService) |

### Sprint G2 — Matching-Engine ✅

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **CustomerMatchingService** | 6 Algorithmen: customer_number (95%), domain (95%), distributor_id (90%), exact_name (85%), alias (80%), fuzzy (60-75%). Commit 5ba40ba |
| ✅ | **Batch-Matching** | `batchMatchLineItems()` + `applyBestMatches()` mit minConfidence-Schwelle |
| ✅ | **"Als Alias speichern"** | `customer_aliases` Tabelle + `saveAsAlias` Flag bei manueller Zuordnung |

### Sprint G3 — API & Review-UI ✅

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **Line-Item CRUD Endpoints** | GET/PATCH/POST für Positionen, Bulk-Assignment, Status-Update. Commit 5ba40ba |
| ✅ | **Position-Review-Modal** | `LineItemReview.tsx` in InvoiceInbox: Auto-Match, Kundensuche, Confidence-Badges, Alias-Option. Commit 3b8ae19 |
| ✅ | **Unmatched-Dashboard API** | `GET /api/sevdesk/unmatched-items` mit Pagination |

### Sprint G4 — Rebilling-Workflow ✅

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **Rebilling-Status** | Dropdown in LineItemReview: pending → included / billed / skipped. Commit 3b8ae19 |
| ✅ | **InvoiceCreationDialog erweitern** | Ausgaben-Positionen pro Kunde anzeigen, Aufschlag-Option. Commit 849b4e0 |
| ✅ | **sevDesk-Integration** | Positionen als Rechnungspositionen übernehmen, Status auf "billed" setzen. Commit 849b4e0 |

### Sprint G5 — Lizenzen in CRM & Portal ✅

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **CRM: Lizenzen-Tab** | Neuer Tab in CustomerHub: Aktive Lizenzen aus invoice_line_items aggregiert. CustomerLicenses.tsx mit Trend-Chart + Produkt-Liste |
| ✅ | **Lizenz-Übersicht** | Monatliche wiederkehrende Kosten, Produkte, Mengen, Historie. Summary-Cards + Monthly-Breakdown |
| ✅ | **Kundenportal: Lizenz-Info** | PortalLicenses.tsx mit GET /api/customer-portal/licenses. Zeigt billed/included Items. Commit 679933c |
| ✅ | **Vertragsverknüpfung** | contract_id Spalte, PATCH Endpoints für Verknüpfung, Vertragsanzeige in CRM + Portal. Commit 64e4c4c |

### ✅ Komplett: NinjaRMM Erweiterungen

| Status | Task | Beschreibung |
|---|---|---|
| ✅ | **Vulnerability-Tracking Backend** | Commit 6c3676d. Tabelle `ninjarmm_vulnerabilities`, Sync-Service, API-Endpoints (GET/PATCH/POST). Schweregrade, CVSS-Scores, Status-Management. |
| ✅ | **Ninja-Ticket-Darstellung verbessert** | Commit 16fa38b. Source-Badges in TicketList (NinjaRMM/E-Mail/Portal/Manuell), Geräte-Name, TicketNinjaInfo-Komponente in Sidebar mit Device-Details. |
| ✅ | **Vulnerability-Frontend** | Commit 3969549. `VulnerabilitiesDashboard.tsx` mit Summary-Cards, Filter, Status-Management. Neuer SubView "Schwachstellen" unter Support. Ticket-Erstellung aus Vulnerability. NVD-Links für CVE-Details. |

> **⚠️ API-Limitierung Vulnerability-Sync (verifiziert 3.7.2026 gegen die offizielle NinjaOne Public API 2.0 OpenAPI-Spec, v2.0.9-draft):**
> Die Public API bietet **keinen Lese-Endpoint für native Software-Scanning-CVEs pro Gerät**. Vulnerability-Management existiert dort nur als `GET /v2/vulnerability/scan-groups`, `GET /v2/vulnerability/scan-groups/{id}` und `POST /v2/vulnerability/scan-groups/{id}/upload` — d.h. ausschließlich **CSV-Import** von Drittanbieter-Scannern (Mapping via Hostname/IP/MAC + CVE-ID, max 200 MB). Lesbar sind nur **aggregierte Zähler** pro Gerät via `GET /v2/queries/device-health` (`criticalVulnerabilityCount`, `highVulnerabilityCount`, …). Die im NinjaOne-Portal sichtbaren CVE-Details laufen über die interne `/swb/s4/vulnerability-mgmt/*`-API (Session-Auth, nicht per OAuth2-Token erreichbar).
> **Konsequenz:** Der Probe-Mechanismus in `ninjarmmService.ts` (`VULN_ENDPOINT_CANDIDATES`) findet erwartungsgemäß keinen funktionierenden Endpoint (alle 404). `VulnerabilitiesDashboard.tsx` zeigt bei 0 Einträgen einen Hinweis-Banner mit Deep-Link ins NinjaOne-Portal. Sobald NinjaOne einen Read-Endpoint veröffentlicht, kann er in `VULN_ENDPOINT_CANDIDATES` ergänzt werden — Rest der Pipeline (DB, Sync, UI) funktioniert dann unverändert. Alternative bis dahin: Aggregat-Zähler aus `device-health` syncen (nur Counts, keine CVE-Details).

### Geplant: Distributor- & Sicherheits-Integrationen

| Status | Task | Beschreibung |
|---|---|---|
| ⬜ | **ADN API-Anbindung** | Automatischer Lizenz-Import von ADN mit Preisen |
| 🟡 | **Infinigate-Integration** | Phase 1 ✅ (8df3259): Rechnungs-/Lizenz-Sync + Kundenzuordnung. Offen: Preisliste, Angebote, Ablauf-Warnungen |
| ⬜ | **Lywand-Integration** | Security-Audit-Daten im Kundenportal anzeigen |
| ⬜ | **Microsoft Security Center** | Security-Scores und Empfehlungen aus M365 abrufen |
| ⬜ | **Portal: Lizenz-Self-Service** | Kunde kann Lizenzen bestellen/ändern (mit Genehmigungsworkflow) |
| ⬜ | **Automatische Provisionierung** | Bei Lizenzbestellung → Microsoft CSP / Hornetsecurity API aufrufen |

---
