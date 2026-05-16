# RamboFlow – Weiterentwicklungsplan für Claude Code

Dieses Dokument dient als Leitfaden und Kontext für Claude Code bei der Weiterentwicklung des RamboFlow-Projekts. Es fasst die architektonischen Herausforderungen zusammen und definiert priorisierte Arbeitspakete (Epics).

## Projektkontext

RamboFlow ist eine Full-Stack-Anwendung (React/Vite Frontend, Express/Node.js Backend, PostgreSQL), die sich von einer einfachen Zeiterfassung zu einem umfassenden PSA-System (Professional Services Automation) entwickelt hat.

**Tech-Stack:**

| Schicht | Technologie |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Backend | Node.js, Express, TypeScript |
| Datenbank | PostgreSQL |
| Auth | JWT, bcrypt, TOTP (MFA) |
| Deployment | Docker, Nginx, Vercel/Render |

**Bekannte Architektur-Herausforderungen:**

Die Codebasis ist organisch gewachsen. Die wichtigsten Schwachstellen sind: sehr große Dateien, die mehrere Verantwortlichkeiten vermischen (`tickets.ts` >3000 Zeilen, `database.ts` >3300 Zeilen), keine versionierten Datenbank-Migrationen, häufige Verwendung von `any`-Typen (~400x), fehlende Paginierung bei großen Datensätzen und das Fehlen automatisierter Tests.

---

## Priorisierte Arbeitspakete (Epics)

### Epic 1: Sicherheit – ABGESCHLOSSEN ✅

Dieser Epic wurde mit dem Branch `feature/epic1-security-optimizations` umgesetzt.

| Task | Status | Beschreibung |
|---|---|---|
| 1.1 XSS-Schutz | ✅ | DOMPurify in `SupportInbox.tsx` und `TicketDetail.tsx` integriert. Neue Utility `src/utils/sanitize.ts` erstellt. |
| 1.2 Auth-Middleware | ✅ | `POST /change-password` und `PATCH /profile` in `auth.ts` verwenden jetzt `authenticateToken`. Passwort-Stärke-Validierung hinzugefügt. |
| 1.3 SELECT * bereinigt | ✅ | `SELECT *` in `auth.ts`, `mfa.ts`, `user.ts`, `admin.ts`, `password-reset.ts` durch explizite Spaltenlisten ersetzt. `password_hash` und `mfa_secret` werden nicht mehr unnötig geladen. |

---

### Epic 2: Performance & Skalierbarkeit (Nächste Priorität)

**Task 2.1: Paginierung für Zeiteinträge**

Betrifft: `server/src/routes/entries.ts`, `src/services/api/core.ts`, `src/components/TimeEntriesList.tsx`

Der `GET /api/entries` Endpunkt gibt aktuell alle Einträge einer Organisation ohne Limit zurück. Bei wachsenden Datenmengen führt dies zu massiven Performance-Problemen.

Vorgehen: Query-Parameter `limit` (Standard: 100) und `offset` (Standard: 0) im Backend einführen. Frontend-API-Call anpassen. Paginierungs-UI oder Infinite-Scroll in `TimeEntriesList.tsx` implementieren.

**Task 2.2: Paginierung für Tickets**

Betrifft: `server/src/routes/tickets.ts`, `src/services/api/tickets.ts`, `src/components/Tickets.tsx`

Analog zu Task 2.1 für die Ticket-Liste.

**Task 2.3: Frontend Code-Splitting**

Betrifft: `src/App.tsx`, `src/main.tsx`

Große, selten genutzte Komponenten (`AdminPortal`, `Settings`, `Finanzen`, `SocialMediaManager`) mit `React.lazy()` und `<Suspense>` asynchron laden, um die initiale Bundle-Größe zu reduzieren.

---

### Epic 3: Architektur-Refactoring Backend (Mittlere Priorität)

**Task 3.1: Versionierte Datenbank-Migrationen**

Betrifft: `server/src/config/database.ts` → neues Verzeichnis `server/src/migrations/`

Die monolithische `initializeDatabase()`-Funktion (>3300 Zeilen) durch ein versioniertes Migrations-System ersetzen. Empfehlung: `node-pg-migrate` oder ein eigener einfacher Runner, der Migrationsdateien sequenziell ausführt und den Stand in einer `schema_migrations`-Tabelle verfolgt.

**Task 3.2: Schichtenarchitektur (Pilot: Tickets)**

Betrifft: `server/src/routes/tickets.ts` → neue Verzeichnisse `server/src/controllers/`, `server/src/repositories/`

Die 3000-Zeilen-Route in drei Schichten aufteilen: `TicketRepository` (nur SQL), `TicketService` (Geschäftslogik), `TicketController` (Request/Response). Die Route selbst sollte nur noch Middleware-Konfiguration und Controller-Aufrufe enthalten.

**Task 3.3: Zod-Validierung vervollständigen**

Betrifft: `server/src/routes/tickets.ts`, `server/src/routes/ai.ts`, `server/src/routes/contracts.ts`, `server/src/routes/ninjarmm.ts`

Diese Routen parsen `req.body` manuell ohne Zod-Schemas. Alle Eingaben müssen durch Zod-Schemas validiert werden.

---

### Epic 4: Code-Qualität (Laufend)

**Task 4.1: Logging-Framework einführen**

Aktuell gibt es >500 `console.log`-Aufrufe im produktiven Code, darunter jede einzelne Datenbankabfrage (`database.ts` Zeile 40). `pino` oder `winston` einführen und alle `console.log`/`console.error` durch strukturierte Log-Calls mit Loglevel ersetzen. In Produktion sollte nur `warn` und `error` geloggt werden.

**Task 4.2: `any`-Typen eliminieren**

Schrittweises Ersetzen von `: any` und `as any` durch konkrete Interfaces. Priorität haben Route-Handler und Service-Funktionen.

**Task 4.3: Unit-Tests einführen**

Setup von Vitest im Backend. Schreiben von Tests für: Zeiterfassungs-Berechnungen (`utils/time.ts`), Berechtigungsprüfungen (`middleware/organization.ts`), Rechnungslogik.

---

## Verhaltensregeln für Claude Code

Wenn du an diesem Projekt arbeitest, beachte bitte folgende Regeln:

1. **Isolierte Änderungen:** Ändere immer nur das, was für den aktuellen Task unbedingt notwendig ist. Keine "Drive-by Refactorings" in unbeteiligten Dateien.
2. **Kein `SELECT *`:** Verwende immer explizite Spaltenlisten. Niemals `password_hash`, `mfa_secret` oder `mfa_recovery_codes` in API-Antworten zurückgeben.
3. **Typensicherheit:** Keine neuen `any`-Typen einführen. Neue Datenstrukturen brauchen saubere TypeScript-Interfaces.
4. **Validierung:** Neue API-Endpunkte müssen zwingend mit Zod-Schemas validiert werden.
5. **Parametrisierte Queries:** Immer `$1`, `$2` etc. für SQL-Parameter verwenden. Niemals String-Konkatenation für Werte.
6. **Kein direkter Push auf `main`:** Immer einen Feature-Branch erstellen und einen Pull Request öffnen.
