# RamboFlow MCP-Server (Phase 1 — read-only)

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

Alles **read-only** — Phase 2 (Zeiteintrag anlegen, Ticket kommentieren)
kommt separat mit eng geschnittenen Schreib-Tools.

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

Danach z.B. fragen: „Was ist diesen Monat noch nicht abgerechnet?" oder
„Zeig mir die offenen Tickets" oder „Details zu TKT-000123".

## Sicherheit

- Token = volle Rechte des erstellenden Users → nur Admin-Konten, Token
  wie ein Passwort behandeln, bei Verdacht sofort widerrufen (DELETE).
- Jeder MCP-Zugriff läuft durch `auditTrail` wie ein normaler API-Call;
  `last_used_at` am Token zeigt die letzte Nutzung.
- Der MCP-Server selbst hat keinerlei Schreib-Endpunkte angebunden.
