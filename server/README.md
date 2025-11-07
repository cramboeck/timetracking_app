# TimeTracking Backend Server

Backend API für die TimeTracking App mit Express.js, SQLite und JWT-Authentifizierung.

## 🚀 Server starten

### Development-Modus (mit Auto-Reload)
```bash
cd server
npm run dev
```

Der Server startet auf **http://localhost:3001**

### Production-Modus
```bash
cd server
npm run build    # TypeScript kompilieren
npm start        # Server starten
```

## 📊 Datenbank einsehen

Um alle registrierten Benutzer, Teams und Audit-Logs anzuzeigen:

```bash
cd server
npm run db:view
```

Das zeigt dir:
- Alle registrierten User mit Details
- Anzahl der Zeiterfassungseinträge pro User
- Alle Teams
- Die letzten 10 Audit-Logs

## 🔌 API-Endpunkte testen

### 1. Benutzer registrieren

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test1234",
    "accountType": "freelancer"
  }'
```

Antwort:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "accountType": "freelancer"
  }
}
```

### 2. Benutzer anmelden

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "Test1234"
  }'
```

### 3. Mit Token auf geschützte Routen zugreifen

```bash
TOKEN="dein-jwt-token-hier"

curl -X GET http://localhost:3001/api/protected-route \
  -H "Authorization: Bearer $TOKEN"
```

## 📁 Datenbankdatei finden

Die SQLite-Datenbank wird hier gespeichert:
```
server/data/timetracking.db
```

Du kannst sie mit jedem SQLite-Tool öffnen, z.B.:
- **DB Browser for SQLite** (GUI)
- **sqlite3** (CLI): `sqlite3 server/data/timetracking.db`

### Wichtige Tabellen:
- `users` - Alle Benutzer
- `time_entries` - Zeiterfassungen
- `customers` - Kunden
- `projects` - Projekte
- `activities` - Tätigkeiten
- `teams` - Teams
- `team_invitations` - Einladungscodes
- `audit_logs` - Alle Benutzeraktionen
- `notifications` - Benachrichtigungseinstellungen

## 🔐 Umgebungsvariablen

Konfiguriere den Server über die `.env` Datei:

```env
# Server
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=dein-super-geheimes-secret-hier-mindestens-32-zeichen-lang

# Email (Test-Modus)
EMAIL_TEST_MODE=true
EMAIL_TEST_RECIPIENT=deine@email.de
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine@email.de
SMTP_PASS=dein-app-passwort

# Notifications
NOTIFICATIONS_ENABLED=true
```

### Email-Test-Modus

Im Test-Modus werden **ALLE** E-Mails an die `EMAIL_TEST_RECIPIENT` Adresse gesendet, nicht an die echten Kunden-E-Mails. Das verhindert Spam während der Entwicklung.

Um echte E-Mails zu versenden:
```env
EMAIL_TEST_MODE=false
```

## 🛡️ Security Features

Der Server ist mit folgenden Sicherheitsfeatures ausgestattet:

### Rate Limiting
- **API**: 100 Anfragen pro 15 Minuten
- **Auth**: 5 Versuche pro 15 Minuten (Schutz vor Brute-Force)
- **Export**: 10 Anfragen pro Stunde
- **Deletion**: 3 Anfragen pro Tag

### Helmet.js Security Headers
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options

### Input Validation
- Zod-Schemas für alle Eingaben
- Passwort: Min. 8 Zeichen, Groß-/Kleinbuchstaben, Zahl
- Username: 3-20 Zeichen, alphanumerisch
- Email: Valide E-Mail-Adresse

### Audit Logging
Alle sicherheitsrelevanten Aktionen werden geloggt:
- Registrierung, Login, Logout
- Datenexport, Account-Löschung
- API-Zugriffe

Logs werden nach 365 Tagen automatisch gelöscht (GDPR).

## 📝 Nützliche Befehle

```bash
# Server-Logs ansehen (im dev-Modus)
npm run dev

# Datenbank zurücksetzen (Vorsicht! Löscht alle Daten)
rm -f data/timetracking.db
npm run dev  # Datenbank wird automatisch neu erstellt

# Audit-Logs von einem User anzeigen
sqlite3 data/timetracking.db "SELECT * FROM audit_logs WHERE user_id='USER_ID' ORDER BY timestamp DESC LIMIT 20"

# Alle User anzeigen
sqlite3 data/timetracking.db "SELECT username, email, created_at FROM users"

# Zeiterfassungen zählen
sqlite3 data/timetracking.db "SELECT COUNT(*) as total FROM time_entries"
```

## 🐛 Troubleshooting

### Port bereits belegt
```bash
# Finde Prozess auf Port 3001
lsof -i :3001

# Töte Prozess
kill -9 <PID>
```

### Datenbank-Fehler
```bash
# Datenbank-Integrität prüfen
sqlite3 data/timetracking.db "PRAGMA integrity_check"

# Schema anzeigen
sqlite3 data/timetracking.db ".schema"
```

### E-Mails werden nicht versendet
1. Prüfe `.env` Konfiguration
2. Stelle sicher, dass `EMAIL_TEST_MODE=true` für Tests
3. Überprüfe SMTP-Zugangsdaten
4. Checke Server-Logs für Fehler

## 📈 Production Deployment

Für Production (Azure/AWS):

1. **Umgebungsvariablen setzen**:
   - `NODE_ENV=production`
   - `JWT_SECRET` mit sicherem Wert
   - `EMAIL_TEST_MODE=false`
   - SMTP-Credentials

2. **Build erstellen**:
   ```bash
   npm run build
   ```

3. **Server starten**:
   ```bash
   npm start
   ```

4. **Reverse Proxy** (nginx) konfigurieren für HTTPS

5. **Process Manager** verwenden (PM2):
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name timetracking-api
   pm2 save
   pm2 startup
   ```
