# 🚀 Deployment Anleitung - Render.com

Diese Anleitung erklärt Schritt für Schritt, wie du das TimeTracking Backend auf Render.com deployen kannst.

## 📋 Voraussetzungen

- ✅ Render.com Account (kostenlos): https://render.com
- ✅ GitHub Account mit verknüpftem Repository
- ✅ Code ist in GitHub gepusht

## 🎯 Deployment mit render.yaml (Empfohlen)

Die einfachste Methode! Die `render.yaml` Datei ist bereits konfiguriert.

### Schritt 1: Repository mit Render verbinden

1. Gehe zu https://dashboard.render.com
2. Klicke auf **"New +"** → **"Blueprint"**
3. Wähle **"Connect a repository"**
4. Wähle dein GitHub Repository aus
5. Render erkennt automatisch die `render.yaml` Datei

### Schritt 2: Service-Name bestätigen

- Render zeigt eine Preview der Services aus der `render.yaml`
- Service: **timetracking-backend**
- Klicke auf **"Apply"**

### Schritt 3: Environment Variables konfigurieren

Render erstellt automatisch die in `render.yaml` definierten Variablen. Du musst nur noch optionale Variablen hinzufügen:

**Pflicht-Variablen (bereits gesetzt):**
- ✅ `NODE_ENV=production`
- ✅ `PORT=10000`
- ✅ `JWT_SECRET` (automatisch generiert)
- ✅ `EMAIL_TEST_MODE=true`
- ✅ `NOTIFICATIONS_ENABLED=true`

**Optional - E-Mail-Konfiguration:**

Falls du E-Mails versenden möchtest:

1. Gehe zu deinem Service → **"Environment"** Tab
2. Füge hinzu:
   ```
   EMAIL_USER=deine@gmail.com
   EMAIL_PASSWORD=dein-app-passwort
   EMAIL_TEST_RECIPIENT=test@example.com
   ```

**FRONTEND_URL aktualisieren:**

Nach dem Frontend-Deployment:
1. Gehe zu **"Environment"** Tab
2. Bearbeite `FRONTEND_URL`
3. Setze auf deine Frontend-URL (z.B. `https://timetracking.vercel.app`)

### Schritt 4: Deployment starten

- Render startet automatisch das Deployment
- Der Build-Prozess dauert ca. 2-5 Minuten
- Status kannst du im **"Logs"** Tab verfolgen

### Schritt 5: Backend-URL erhalten

Nach erfolgreichem Deployment:
- Deine Backend-URL: `https://timetracking-backend.onrender.com`
- Health-Check: `https://timetracking-backend.onrender.com/health`

### Schritt 6: Frontend aktualisieren

Aktualisiere die Backend-URL in deinem Frontend:

```typescript
// src/services/api.ts
const API_BASE_URL = 'https://timetracking-backend.onrender.com/api';
```

---

## 🔧 Alternative: Manuelles Deployment

Falls du die `render.yaml` nicht nutzen möchtest:

### 1. Web Service erstellen

1. Gehe zu https://dashboard.render.com
2. Klicke auf **"New +"** → **"Web Service"**
3. Verbinde dein Repository
4. Wähle das Repository aus

### 2. Service konfigurieren

```
Name: timetracking-backend
Runtime: Node
Region: Frankfurt (EU Central)
Branch: main (oder dein Haupt-Branch)
Root Directory: (leer lassen)

Build Command:
cd server && npm install && npm run build

Start Command:
cd server && npm start

Plan: Free
```

### 3. Environment Variables hinzufügen

Klicke auf **"Advanced"** → **"Add Environment Variable"**

```
NODE_ENV=production
PORT=10000
JWT_SECRET=<generiere-ein-sicheres-64-zeichen-secret>
EMAIL_TEST_MODE=true
NOTIFICATIONS_ENABLED=true
FRONTEND_URL=https://deine-frontend-url.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### 4. Persistent Disk hinzufügen

**WICHTIG:** Ohne Disk gehen deine Daten bei jedem Deployment verloren!

1. Scrolle zu **"Disk"**
2. Klicke auf **"Add Disk"**
3. Konfiguration:
   ```
   Name: timetracking-db
   Mount Path: /opt/render/project/src/server/data
   Size: 1 GB (kostenlos)
   ```

### 5. Service erstellen

- Klicke auf **"Create Web Service"**
- Deployment startet automatisch

---

## 🔍 Deployment verifizieren

### Health-Check testen

```bash
curl https://timetracking-backend.onrender.com/health
```

Erwartete Antwort:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "production",
  "emailTestMode": true
}
```

### API-Endpoint testen

```bash
# Benutzer registrieren
curl -X POST https://timetracking-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test1234",
    "accountType": "freelancer"
  }'
```

---

## 📊 Logs und Monitoring

### Logs ansehen

1. Gehe zu deinem Service im Dashboard
2. Klicke auf **"Logs"** Tab
3. Du siehst Echtzeit-Logs

### Events überwachen

Im **"Events"** Tab siehst du:
- Deployments
- Crashes
- Restarts

---

## ⚡ Automatisches Deployment

Render deployed automatisch bei jedem Git-Push zu deinem Branch!

**Workflow:**
1. Code ändern
2. `git add .`
3. `git commit -m "Update"`
4. `git push`
5. Render deployed automatisch (ca. 2-3 Min)

### Auto-Deploy deaktivieren

Falls du manuelles Deployment möchtest:
1. Gehe zu **"Settings"** → **"Build & Deploy"**
2. Deaktiviere **"Auto-Deploy"**

---

## 🛠️ Troubleshooting

### Build schlägt fehl

**Symptom:** Build-Fehler in Logs

**Lösung:**
1. Prüfe ob Build lokal funktioniert:
   ```bash
   cd server
   npm install
   npm run build
   npm start
   ```
2. Checke Node-Version in `package.json`
3. Überprüfe Build-Command in Render

### Service startet nicht

**Symptom:** Service zeigt "Unhealthy" Status

**Lösung:**
1. Checke Logs im Dashboard
2. Verifiziere `PORT` Variable ist gesetzt
3. Prüfe ob Health-Check Endpoint funktioniert

### Datenbank-Daten gehen verloren

**Symptom:** Nach Deployment sind User/Daten weg

**Lösung:**
1. Persistent Disk hinzufügen (siehe oben)
2. Mount Path muss exakt sein: `/opt/render/project/src/server/data`
3. Service neu deployen

### Langsame erste Anfrage

**Symptom:** Erste Anfrage nach Pause dauert 30+ Sekunden

**Grund:** Free Plan - Service schläft nach 15 Min Inaktivität

**Lösungen:**
- Upgrade auf Paid Plan ($7/Monat) für 24/7
- Akzeptieren (normale für Free Plan)
- Cron-Job einrichten, der alle 10 Min Health-Check aufruft

### CORS-Fehler vom Frontend

**Symptom:** Frontend kann Backend nicht erreichen

**Lösung:**
1. Setze `FRONTEND_URL` im Backend richtig
2. Überprüfe CORS-Konfiguration in `server/src/index.ts`
3. Frontend muss HTTPS nutzen (HTTP → HTTPS)

---

## 💰 Kosten-Übersicht

### Free Plan
- ✅ 750 Stunden/Monat
- ✅ 512 MB RAM
- ✅ Automatisches SSL
- ✅ 1 GB Persistent Disk (kostenlos)
- ⚠️ Service schläft nach 15 Min Inaktivität
- ⚠️ Shared CPU

### Starter Plan ($7/Monat)
- ✅ 24/7 Verfügbarkeit (kein Sleep)
- ✅ 512 MB RAM
- ✅ Dedizierte CPU
- ✅ Custom Domains

---

## 🔐 Sicherheit in Production

### JWT Secret ändern

**Wichtig:** Render generiert automatisch ein sicheres `JWT_SECRET`.

Falls du es manuell setzen möchtest:
```bash
# Generiere sicheres Secret (64 Zeichen)
openssl rand -base64 64
```

### E-Mail-Test-Modus

**Empfehlung für Production:**
- Lass `EMAIL_TEST_MODE=true` während der Testphase
- Setze auf `false` wenn du echte E-Mails versenden willst
- Verwende dedizierte E-Mail-Service (SendGrid, Mailgun) für hohe Volumina

### Datenbank-Backup

**Automatisches Backup:**
1. Gehe zu deinem Service → **"Disks"**
2. Klicke auf den Disk
3. **"Create Snapshot"** für manuelles Backup

**Regelmäßige Backups:** Nur in Paid Plans verfügbar

---

## 📈 Nach dem Deployment

### 1. Frontend-URL aktualisieren
- Setze Backend-URL im Frontend
- Deploy Frontend neu

### 2. Ersten User registrieren
- Teste Registration-Endpoint
- Verifiziere Login funktioniert

### 3. Monitoring einrichten
- Checke Logs regelmäßig
- Überwache Performance im Dashboard

### 4. Domain konfigurieren (optional)
- Füge Custom Domain hinzu
- Update DNS-Einträge
- SSL wird automatisch konfiguriert

---

## 🎉 Fertig!

Dein Backend läuft jetzt auf Render!

**Nächste Schritte:**
- Frontend deployen (Vercel, Netlify)
- Custom Domain einrichten
- Monitoring/Alerting konfigurieren
- Performance optimieren

**Support:**
- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
