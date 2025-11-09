# 🔐 Admin Panel Setup Guide

Diese Anleitung zeigt dir, wie du das Admin Panel einrichtest und den ersten Admin-User erstellst.

## 📋 Voraussetzungen

- Backend ist deployed auf Render
- PostgreSQL Datenbank läuft
- Node.js ist lokal installiert (für das Setup-Script)

---

## 🚀 Admin-User erstellen

Du hast **2 Optionen** um einen Admin-User zu erstellen:

### Option 1: Setup-Script (Empfohlen)

Das einfachste und sicherste Verfahren:

1. **Klone das Repository lokal** (falls noch nicht geschehen)
   ```bash
   git clone <your-repo-url>
   cd timetracking_app
   ```

2. **Gehe in den Server-Ordner**
   ```bash
   cd server
   ```

3. **Installiere Dependencies**
   ```bash
   npm install
   ```

4. **Setze die DATABASE_URL Environment Variable**

   Hole dir die Connection String aus dem Render Dashboard:
   - Gehe zu deiner PostgreSQL Database
   - Kopiere die "External Connection String"

   Dann:
   ```bash
   # Linux/Mac:
   export DATABASE_URL="postgresql://user:password@host:port/database"

   # Windows (PowerShell):
   $env:DATABASE_URL="postgresql://user:password@host:port/database"

   # Windows (CMD):
   set DATABASE_URL=postgresql://user:password@host:port/database
   ```

5. **Führe das Admin-Setup-Script aus**
   ```bash
   npm run admin:create
   ```

6. **Folge den Anweisungen**

   Du kannst wählen zwischen:
   - **Option 1**: Existierenden User zum Admin machen
   - **Option 2**: Neuen Admin-User erstellen

   **Beispiel:**
   ```
   🔐 Admin User Setup

   Choose an option:
   1. Make existing user an admin
   2. Create new admin user

   Your choice (1 or 2): 2

   📝 Create new admin user

   Username: admin
   Email: admin@example.com
   Password (min 8 chars): ********

   ✅ Admin user created successfully!
      Username: admin
      Email: admin@example.com
      User ID: abc123...
      Role: admin

   🔑 You can now login with these credentials
   ```

---

### Option 2: Direkt in der Datenbank (Fortgeschritten)

Falls du direkten Zugriff auf die Datenbank bevorzugst:

1. **Verbinde dich mit der PostgreSQL Datenbank**

   Im Render Dashboard:
   - Gehe zu deiner PostgreSQL Database
   - Klicke auf "Connect" → "External Connection"
   - Nutze psql oder einen DB-Client

2. **Mache einen User zum Admin**
   ```sql
   UPDATE users
   SET role = 'admin'
   WHERE email = 'deine@email.de';
   ```

3. **Verifiziere**
   ```sql
   SELECT username, email, role
   FROM users
   WHERE role = 'admin';
   ```

---

## 🔑 Admin-Login testen

Nachdem du einen Admin-User erstellt hast:

1. **Öffne dein Frontend** (lokal oder deployed)

2. **Logge dich ein** mit den Admin-Credentials

3. **Verifiziere Admin-Zugriff:**

   Teste die Admin-API:
   ```bash
   # Ersetze TOKEN mit deinem JWT Token nach dem Login
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://timetracking-backend.onrender.com/api/admin/stats
   ```

   Erwartete Antwort:
   ```json
   {
     "totalUsers": 5,
     "totalEntries": 123,
     "totalHours": "45.50",
     "newUsers": 2,
     "activeUsers": 3,
     "todayEntries": 8
   }
   ```

---

## 📊 Admin-API-Endpunkte

Sobald du als Admin eingeloggt bist, hast du Zugriff auf:

### Dashboard & Statistics
- `GET /api/admin/stats` - Übersichts-Statistiken
- `GET /api/admin/analytics` - Detaillierte Analytics

### User-Management
- `GET /api/admin/users` - Alle User auflisten (mit Pagination)
- `GET /api/admin/users/:id` - User-Details
- `PUT /api/admin/users/:id/role` - Rolle ändern
- `DELETE /api/admin/users/:id` - User löschen

### Audit-Logs
- `GET /api/admin/audit-logs` - Audit-Logs (mit Filtern)

**Beispiele:**

```bash
# User-Liste abrufen (Seite 1, 50 pro Seite)
GET /api/admin/users?page=1&limit=50

# User suchen
GET /api/admin/users?search=john

# User zum Admin machen
PUT /api/admin/users/abc123/role
Body: { "role": "admin" }

# Audit-Logs eines Users
GET /api/admin/audit-logs?userId=abc123

# Audit-Logs nach Aktion filtern
GET /api/admin/audit-logs?action=user.register
```

---

## 🛡️ Sicherheitshinweise

### Wichtig:

1. **Schütze Admin-Credentials**
   - Verwende ein starkes Passwort (min. 12 Zeichen)
   - Aktiviere MFA wenn verfügbar
   - Teile Admin-Zugänge nicht

2. **Nur vertrauenswürdige Personen**
   - Gib Admin-Rechte nur an Personen, die sie wirklich brauchen
   - Nutze das Audit-Log um Aktionen zu überwachen

3. **Regelmäßige Überprüfung**
   - Checke regelmäßig die Admin-Liste
   - Entferne Admin-Rechte wenn nicht mehr benötigt

4. **Backup**
   - Mache regelmäßige Datenbank-Backups
   - Teste Wiederherstellung

---

## 🔧 Troubleshooting

### "Error: DATABASE_URL environment variable is not set"

**Lösung:** Setze die DATABASE_URL Variable (siehe Schritt 4 oben)

### "User not found"

**Lösung:** Registriere zuerst einen User im Frontend, dann mache ihn zum Admin

### "Cannot connect to database"

**Lösung:**
1. Überprüfe, dass die DATABASE_URL korrekt ist
2. Checke ob die Render DB läuft
3. Verifiziere Firewall-Einstellungen

### Script schlägt fehl

**Lösung:**
```bash
# Stelle sicher, dass Dependencies installiert sind:
npm install

# Versuche es mit tsx direkt:
npx tsx src/scripts/createAdmin.ts
```

---

## 📝 Nächste Schritte

Nach dem Admin-Setup:

1. **Frontend-Admin-Panel nutzen** (wenn fertig implementiert)
   - `/admin` Route öffnen
   - User verwalten
   - Analytics einsehen

2. **Monitoring einrichten**
   - Audit-Logs regelmäßig prüfen
   - Verdächtige Aktivitäten überwachen

3. **Weitere Admins erstellen** (falls benötigt)
   - Wiederhole den Prozess
   - Oder nutze das Admin-Panel

---

## 🆘 Support

Bei Problemen:
1. Checke die Logs im Render Dashboard
2. Verifiziere Database-Connection
3. Teste API-Endpoints mit curl/Postman
4. Prüfe Audit-Logs für Fehler

**API-Logs ansehen (Render Dashboard):**
- Gehe zu deinem Web Service
- Klicke auf "Logs"
- Filtere nach Errors

---

## ✅ Checkliste

Nach dem Setup solltest du haben:

- [ ] Mindestens 1 Admin-User erstellt
- [ ] Admin-Login erfolgreich getestet
- [ ] Admin-API erreichbar
- [ ] Credentials sicher gespeichert
- [ ] Audit-Logs funktionieren
- [ ] Frontend kann auf Admin-Endpunkte zugreifen

---

**Viel Erfolg mit deinem Admin-Panel!** 🚀
