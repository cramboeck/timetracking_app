# RamboFlow MCP-Server (Phase 1 lesen + Phase 2 schreiben)

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

## 1. API-Token erzeugen (einmalig, Admin)

Tokens verwaltet `/api/auth/api-tokens` (nur Admins; gespeichert wird nur
der SHA-256-Hash — der Klartext erscheint ausschließlich in der
Create-Response):

```bash
# 1. Einloggen (JWT holen)
TOKEN=$(curl -s https://app.ramboeck.it/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"DEINE_EMAIL","password":"DEIN_PASSWORT"}' | jq -r .token)

# 2. API-Token erstellen — das "token"-Feld (rbf_…) sicher ablegen!
curl -s https://app.ramboeck.it/api/auth/api-tokens \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"MCP Desktop"}' | jq .data

# Auflisten / Widerrufen:
curl -s https://app.ramboeck.it/api/auth/api-tokens -H "Authorization: Bearer $TOKEN" | jq .data
curl -s -X DELETE https://app.ramboeck.it/api/auth/api-tokens/<id> -H "Authorization: Bearer $TOKEN"
```

⚠️ Das `rbf_…`-Token niemals committen oder in Chats posten.

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

## Sicherheit

- Token = volle Rechte des erstellenden Users → nur Admin-Konten, Token
  wie ein Passwort behandeln, bei Verdacht sofort widerrufen (DELETE).
- Jeder MCP-Zugriff läuft durch `auditTrail` wie ein normaler API-Call;
  `last_used_at` am Token zeigt die letzte Nutzung.
- Schreibend sind nur `POST /entries` und `POST /tickets/:id/comments` angebunden —
  beide legen ausschließlich neue Datensätze für den Token-Inhaber an.
