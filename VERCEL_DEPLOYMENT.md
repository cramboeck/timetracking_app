# Vercel Deployment Guide

Diese Anleitung zeigt dir, wie du das TimeTracking Frontend auf Vercel deployest.

## Voraussetzungen

- GitHub/GitLab/Bitbucket Repository mit dem Code
- Vercel Account (kostenlos auf https://vercel.com)

## Deployment Schritte

### Option 1: Über Vercel Dashboard (Empfohlen)

1. **Gehe zu Vercel**
   - Öffne https://vercel.com
   - Klicke auf **Sign Up** oder **Log In**
   - Verbinde dein GitHub/GitLab/Bitbucket Account

2. **Neues Projekt erstellen**
   - Klicke auf **Add New...** → **Project**
   - Wähle dein Repository: `timetracking_app`
   - Klicke auf **Import**

3. **Projekt konfigurieren**
   - **Framework Preset:** Vite (wird automatisch erkannt)
   - **Root Directory:** `./` (Standardwert)
   - **Build Command:** `npm run build` (automatisch)
   - **Output Directory:** `dist` (automatisch)
   - **Install Command:** `npm install` (automatisch)

4. **Environment Variables setzen**

   Klicke auf **Environment Variables** und füge hinzu:

   ```
   Name:  VITE_API_URL
   Value: https://timetracking-backend-86s7.onrender.com/api
   ```

   Wähle **Production, Preview, and Development** aus.

5. **Deploy**
   - Klicke auf **Deploy**
   - Warte ~2-3 Minuten
   - ✅ Fertig! Du bekommst eine URL wie: `https://timetracking-app-xxx.vercel.app`

### Option 2: Über Vercel CLI

```bash
# Vercel CLI installieren
npm i -g vercel

# Im Projekt-Verzeichnis
cd /path/to/timetracking_app

# Login
vercel login

# Deployment
vercel

# Environment Variables setzen
vercel env add VITE_API_URL
# Eingeben: https://timetracking-backend-86s7.onrender.com/api
# Wählen: Production, Preview, Development

# Production Deployment
vercel --prod
```

## Nach dem Deployment

### 1. Backend CORS konfigurieren

Gehe zu Render.com → Dein Backend Service → Environment:

```
Key:   FRONTEND_URL
Value: https://deine-vercel-url.vercel.app
```

(Ersetze mit deiner echten Vercel-URL)

### 2. Testen

1. Öffne deine Vercel-URL
2. DevTools öffnen (F12) → Network Tab
3. Registriere einen Test-User
4. Du solltest Requests sehen zu: `https://timetracking-backend-86s7.onrender.com/api/auth/register`
5. Status 201 = Erfolg ✅

### 3. Custom Domain (Optional)

Falls du eine eigene Domain hast:

1. Gehe zu Vercel → Dein Projekt → **Settings** → **Domains**
2. Füge deine Domain hinzu
3. Folge den DNS-Anweisungen
4. Aktualisiere `FRONTEND_URL` im Backend auf deine Custom Domain

## Automatische Deployments

Vercel deployed automatisch bei jedem Git Push:

- **Push zu `main` Branch** → Production Deployment
- **Push zu anderen Branches** → Preview Deployment
- **Pull Requests** → Preview Deployment mit eigener URL

## Vorteile von Vercel

✅ **Free Tier:**
- 100 GB Bandbreite/Monat
- Unbegrenzte Deployments
- Automatische HTTPS
- Globales CDN
- Serverless Functions (falls benötigt)

✅ **Developer Experience:**
- Automatische Deployments von Git
- Preview Deployments für PRs
- Schnelle Build-Zeiten
- Einfaches Rollback

## Troubleshooting

### Build schlägt fehl

```bash
# Lokal testen
npm install
npm run build

# Logs prüfen
# Vercel Dashboard → Deployments → [Dein Deployment] → Build Logs
```

### Environment Variables werden nicht erkannt

- Environment Variables sind nur nach einem **neuen Deployment** verfügbar
- Gehe zu **Deployments** → **Redeploy** (mit den 3 Punkten)
- Oder: Mache einen neuen Git Commit & Push

### CORS Fehler

- Stelle sicher, dass `FRONTEND_URL` im Backend auf deine Vercel-URL gesetzt ist
- Render Backend neu starten nach Environment Variable Änderung

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Community: https://github.com/vercel/vercel/discussions
