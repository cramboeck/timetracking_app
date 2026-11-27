# RamboFlow MCP-Server (v2.1 – lesen, eng geschnittenes Schreiben, Agenten-Sicherheit)

Steuert RamboFlow aus Claude heraus (Claude Desktop, Claude Code, claude.ai
mit Connector). Dünner Wrapper über die RamboFlow-REST-API: alle Aufrufe
laufen mit einem API-Token durch die normalen Routen — Berechtigungen
(Paket S) und Audit-Log greifen unverändert.

## Tools

| Tool | Zweck |
|---|---|
| `abrechnung_uebersicht` | Offene/abgerechnete Zeiten pro Kunde mit Beträgen (Default: aktueller Monat) |
| `zeiten_liste` | Eigene Zeiteinträge (Datum, Projekt, Beschreibung, Dauer) |
| `tickets_liste` | Tickets filtern (status, searchText, assignedTo) |
| `ticket_details` | Ein Ticket inkl. letzter Kommentare (per `TKT-000123`) |
| `kunden_liste` | Kunden suchen (Name, Kundennummer, E-Mail) |
| `lizenz_ablauf` | Ablaufende Lizenzen/Abos |
| **`zeit_erfassen`** ✍️ | Abgeschlossenen Zeiteintrag anlegen (Projektzeit per Kunde/Projekt/Ticket oder interne Zeit) |
| **`ticket_kommentieren`** ✍️ | Kommentar an ein Ticket hängen — standardmäßig **interne Notiz** |

Die Lese-Tools tragen `readOnlyHint`, die beiden Schreib-Tools
`readOnlyHint: false, destructiveHint: false` — Claude fragt vor
Schreibaktionen nach Bestätigung (je nach Client-Einstellung).

### Leitplanken der Schreib-Tools

- **Nur anlegen**, nie ändern oder löschen. Korrekturen macht man in der App
  (die Antwort nennt die ID des neuen Eintrags).
- **Nie raten:** Passt ein Kunde/Projekt nicht eindeutig, wird nichts
  angelegt; die Antwort listet die Kandidaten.
- `zeit_erfassen`: Zeit per `von` + `bis` oder `von` + `dauerMinuten`
  (lokale Uhrzeit des Rechners, Datum Standard heute). Keine Buchungen in der
  Zukunft. Überschneidet sich der Eintrag mit einem eigenen bestehenden, wird
  nichts angelegt — außer mit `trotzdem: true`. Mit `ticketNumber` hängt der
  Eintrag am Ticket (Kunde/Projekt kommen aus dem Ticket; internes Ticket →
  interne Zeit). `intern: meeting|admin|…` bucht interne Zeit ohne Projekt.
- `ticket_kommentieren`: Ohne weiteres ist der Kommentar eine **interne
  Notiz** (Kunde sieht nichts, keine Mail). Erst `fuerKunde: true` macht ihn
  sichtbar und benachrichtigt den Kunden per Mail.

## Sicherheitsmodell (Phase A, 27.11.2026)

Ein Agent hat **nie mehr Rechte als sein User** – und zusätzlich nur:

| Schicht | Wirkung |
|---|---|
| **Endpunkt-Whitelist** (`server/src/utils/apiTokenPolicy.ts`) | Deny by default: nur die Endpunkte, die diese Werkzeuge brauchen. Admin, MFA, Postfächer, Löschen/Ändern und die Token-Verwaltung selbst sind für Zugänge gesperrt. |
| **Stufen pro Zugang** | `read` (immer), `time:write`, `tickets:write`. Betrachter bekommen nur `read`. |
| **Ablaufdatum** | Pflicht, 30–365 Tage (Standard 90), Erinnerungsmail 7 Tage vorher. |
| **Anfragelimit** | 120 Anfragen/Minute, davon max. 20 schreibend → 429 mit `Retry-After`. |
| **Protokoll** | Jede Anfrage (Methode, Pfad ohne Query, Status, IP, Client) – 90 Tage, in der App pro Zugang einsehbar; Audit-Log trägt `apiTokenId`. |
| **Herkunft** | Zeiteinträge und Ticket-Kommentare merken sich den Zugang → in der App „Agent“-Kennzeichen. |
| **Fremdinhalt** | Ticket-Titel, -Beschreibungen und Kommentare gehen als `<<FREMDINHALT …>>`-Block an das Modell; Marker im Kundentext werden entschärft; die Server-Hinweise verbieten, darin enthaltene Anweisungen auszuführen. |

Neue Werkzeuge brauchen einen Eintrag in der Whitelist (bewusst: jede
Erweiterung der Agenten-Rechte ist eine sichtbare Code-Änderung) und ein
Szenario in `test/scenarios.mjs`.

## 1. Zugang anlegen

In RamboFlow: **Einstellungen → KI-Agent & API → Neuer Zugang**
(Bezeichnung, Stufen, Gültigkeit). Der Schlüssel (`rbf_…`) wird **genau
einmal** angezeigt – inklusive fertigem Eintrag für Claude Desktop.
Dort auch: „zuletzt benutzt“, Protokoll und Widerrufen; Org-Admins sehen
und widerrufen die Zugänge der ganzen Organisation.

⚠️ Schlüssel niemals committen oder in Chats/Tickets posten.

### Schlüssel nicht im Klartext ablegen (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\save-token.ps1
```

speichert den Schlüssel per DPAPI verschlüsselt unter
`%APPDATA%\RamboFlow\mcp-token.dat` (nur dein Windows-Benutzer auf diesem
Rechner kann ihn lesen). In der Claude-Konfiguration dann statt
`RAMBOFLOW_API_TOKEN` den Eintrag `RAMBOFLOW_API_TOKEN_FILE` mit diesem Pfad
setzen. macOS/Linux: Datei mit `chmod 600`, sonst verweigert der Server den Start.

## 2. Bauen

```bash
cd mcp
npm install
npm run build
```

## 3. In Claude einbinden

**Claude Code:**

```bash
claude mcp add ramboflow \
  --env RAMBOFLOW_API_URL=https://app.ramboeck.it/api \
  --env RAMBOFLOW_API_TOKEN=rbf_DEIN_TOKEN \
  -- node /pfad/zu/timetracking_app/mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ramboflow": {
      "command": "node",
      "args": ["/pfad/zu/timetracking_app/mcp/dist/index.js"],
      "env": {
        "RAMBOFLOW_API_URL": "https://app.ramboeck.it/api",
        "RAMBOFLOW_API_TOKEN": "rbf_DEIN_TOKEN"
      }
    }
  }
}
```

Danach z.B. fragen: „Was ist diesen Monat noch nicht abgerechnet?",
„Zeig mir die offenen Tickets", „Details zu TKT-000123" — oder schreibend:
„Trag mir heute 9 bis 10:30 Server-Wartung bei Huber ein", „Buch 30 Minuten
auf TKT-000123 ab 14 Uhr: Drucker getauscht", „Schreib an TKT-000123 eine
interne Notiz: Ersatzteil bestellt".

## Betrieb

- Schlüssel wie ein Passwort behandeln; bei Verdacht sofort in der App widerrufen.
- In Claude die Schreib-Werkzeuge (`zeit_erfassen`, `ticket_kommentieren`)
  auf „immer fragen“ lassen.
- Anfragen mit `RAMBOFLOW_API_URL` ohne `https://` werden verweigert (Ausnahme: localhost).

## Tests

- `npm run test:server` (Repo-Root): Whitelist/Stufen/Anfragelimit als Unit-Tests.
- `npm run test:scenarios` (hier, nach `npm run build`): echter MCP-Client
  gegen eine **Dev-Instanz** – Fremdinhalt-Markierung inkl. Injection-Versuch,
  Lese-Zugang kann nicht buchen, Zukunftsbuchung, Herkunft am Eintrag,
  Stufen-Trennung, Widerruf. Variablen: `RBF_TEST_API`, `RBF_TEST_USER`,
  `RBF_TEST_PASSWORD`, `RBF_TEST_TICKET_ID` (läuft nur gegen localhost).
