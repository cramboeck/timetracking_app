# 📧 SendGrid E-Mail Setup für RamboFlow

## Domain: app.ramboeck.it
## E-Mail-Absender: noreply@app.ramboeck.it

---

## Schritt 1: SendGrid Account erstellen 🚀

### 1.1 Account registrieren

Besuche: https://signup.sendgrid.com/

**Registrierungsdaten:**
- Name/Firma
- E-Mail (deine bestehende E-Mail für Verifizierung)
- Passwort

### 1.2 Account verifizieren

- SendGrid sendet dir eine Verifizierungs-E-Mail
- Klicke auf den Link zur Bestätigung

### 1.3 Sender Identity erstellen (wichtig!)

SendGrid fragt nach deiner "Sender Identity":

**Single Sender Verification (einfach):**
- E-Mail: `noreply@app.ramboeck.it` (oder deine temporäre E-Mail)
- Das ist nur temporär → wird später durch Domain Authentication ersetzt

**ODER direkt weiter zu Schritt 2** (Domain Authentication)

---

## Schritt 2: Domain Authentication (DNS-Konfiguration) 🔐

### 2.1 Domain Authentication starten

1. Gehe zu: **Settings** → **Sender Authentication**
2. Klicke auf: **Authenticate Your Domain**
3. Wähle deinen DNS-Provider aus (oder "Other Host")

### 2.2 Domain eingeben

**Domain to authenticate:** `app.ramboeck.it`

**Wichtig:**
- ✅ **Use automated security** aktivieren (DKIM, SPF, DMARC)
- ✅ **Link Branding** aktivieren (optional, empfohlen)
- DNS Host: Wähle deinen Provider (oder "Other")

### 2.3 DNS Records erhalten

SendGrid zeigt dir **3 DNS Records** zum Eintragen:

**Beispiel (deine werden anders aussehen!):**

```
1. CNAME Record (DKIM 1):
   Name: s1._domainkey.app.ramboeck.it
   Value: s1.domainkey.u12345678.wl123.sendgrid.net

2. CNAME Record (DKIM 2):
   Name: s2._domainkey.app.ramboeck.it
   Value: s2.domainkey.u12345678.wl123.sendgrid.net

3. CNAME Record (Mail CNAME):
   Name: em1234.app.ramboeck.it
   Value: u12345678.wl123.sendgrid.net
```

**⚠️ WICHTIG:** Kopiere DEINE Records - die obigen sind nur Beispiele!

---

## Schritt 3: DNS Records beim Domain-Provider eintragen 🌐

### Wo ist dein Domain-Provider?

Bei wem hast du `ramboeck.it` registriert?
- Hetzner DNS Console?
- CloudFlare?
- Namecheap?
- GoDaddy?
- Andere?

### DNS Records eintragen

**Beispiel für Hetzner DNS Console:**

1. Gehe zu: https://dns.hetzner.com/
2. Wähle Domain: `ramboeck.it`
3. Füge die 3 CNAME Records hinzu:

```
Type: CNAME
Name: s1._domainkey.app
Value: s1.domainkey.u12345678.wl123.sendgrid.net  (dein echter Wert!)
TTL: 3600

Type: CNAME
Name: s2._domainkey.app
Value: s2.domainkey.u12345678.wl123.sendgrid.net  (dein echter Wert!)
TTL: 3600

Type: CNAME
Name: em1234.app
Value: u12345678.wl123.sendgrid.net  (dein echter Wert!)
TTL: 3600
```

**Beispiel für CloudFlare:**
- DNS → Add Record
- Type: CNAME
- Name: (siehe oben)
- Target: (siehe oben)
- Proxy: OFF (wichtig!)

### DNS Propagierung warten

DNS braucht 5-60 Minuten zur Propagierung.

**Prüfen:**
```bash
# Auf deinem lokalen Computer oder Server
dig s1._domainkey.app.ramboeck.it CNAME
dig s2._domainkey.app.ramboeck.it CNAME
```

Sollte die SendGrid-Werte zurückgeben.

---

## Schritt 4: Domain Verification in SendGrid ✅

1. Zurück zu SendGrid: **Settings** → **Sender Authentication**
2. Klicke auf **Verify** bei deiner Domain
3. SendGrid prüft die DNS Records

**Status sollte sein:** ✅ **Verified**

Falls nicht:
- DNS Records nochmal prüfen
- 10-30 Minuten warten
- Erneut versuchen

---

## Schritt 5: SMTP Credentials erstellen 🔑

### 5.1 API Key erstellen

SendGrid nutzt API Keys statt Passwörter.

1. Gehe zu: **Settings** → **API Keys**
2. Klicke auf: **Create API Key**
3. Name: `RamboFlow Production SMTP`
4. Permissions: **Restricted Access**
5. Aktiviere: **Mail Send** → **Full Access**
6. Klicke: **Create & View**

**⚠️ WICHTIG:** Kopiere den API Key SOFORT! Er wird nur einmal angezeigt!

**Beispiel:**
```
SG.abcd1234efgh5678ijkl9012mnop3456.qrstuvwxyz1234567890ABCDEFGHIJKLMNOP
```

### 5.2 SMTP Zugangsdaten

SendGrid SMTP Daten sind immer gleich:

```
SMTP Host: smtp.sendgrid.net
SMTP Port: 587
SMTP User: apikey  (ja, wirklich "apikey" als Username!)
SMTP Password: <DEIN_API_KEY>
```

---

## Schritt 6: .env.production auf dem Server konfigurieren 🔧

### 6.1 SSH zum Server

```bash
ssh root@<DEINE_SERVER_IP>
cd /home/timetracking_app/timetracking_app
```

### 6.2 .env.production bearbeiten

```bash
nano .env.production
```

### 6.3 E-Mail-Variablen ändern

**VORHER:**
```bash
EMAIL_TEST_MODE=true
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=
```

**NACHHER:**
```bash
# E-Mail-Konfiguration (SendGrid)
EMAIL_TEST_MODE=false
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.abcd1234efgh5678ijkl9012mnop3456.qrstuvwxyz1234567890ABCDEFGHIJKLMNOP
EMAIL_FROM=RamboFlow <noreply@app.ramboeck.it>

# Test-Empfänger (für ersten Test)
EMAIL_TEST_RECIPIENT=deine-echte-email@domain.de
```

**⚠️ WICHTIG:**
- `EMAIL_PASSWORD` = Dein SendGrid API Key
- `EMAIL_USER` = Exakt `apikey` (nicht ändern!)
- `EMAIL_FROM` = Name + deine Subdomain-E-Mail
- `EMAIL_TEST_RECIPIENT` = Deine echte E-Mail zum Testen

**Speichern:** CTRL+O → ENTER → CTRL+X

---

## Schritt 7: Backend neu starten 🔄

```bash
cd /home/timetracking_app/timetracking_app

# Backend neu starten
docker compose -f docker-compose.production.yml --env-file .env.production restart backend

# Logs ansehen (wichtig!)
docker compose -f docker-compose.production.yml logs backend --tail=50
```

**Erwartete Log-Ausgabe:**
```
✅ Email transporter initialized
```

**Falls Fehler:**
```
❌ Failed to initialize email transporter: ...
```
→ .env.production Werte nochmal prüfen

---

## Schritt 8: Test-E-Mail senden 🧪

### 8.1 Test über die App

**Variante 1: Neuen User registrieren**
1. Gehe zu: https://app.ramboeck.it
2. Registriere einen Test-User
3. → Sollte Willkommens-E-Mail erhalten

**Variante 2: Passwort-Reset anfordern**
1. Login-Seite
2. "Passwort vergessen?"
3. E-Mail eingeben
4. → Sollte Reset-E-Mail erhalten

### 8.2 Backend-Logs prüfen

```bash
docker compose -f docker-compose.production.yml logs backend | grep -i "email\|mail"
```

**Erfolgreiche E-Mail:**
```
✅ Email sent successfully: <message-id>
```

**Fehler:**
```
❌ Failed to send email: ...
```

---

## Schritt 9: SendGrid Activity überprüfen 📊

1. Gehe zu: **Activity** in SendGrid Dashboard
2. Hier siehst du alle versendeten E-Mails
3. Status: Delivered, Bounced, etc.

**Statistiken:**
- **Activity Feed:** Zeigt einzelne E-Mails
- **Stats:** Übersicht über Zustellrate

---

## 🎉 Fertig! E-Mail-Versand läuft!

Deine App versendet jetzt E-Mails von:
```
RamboFlow <noreply@app.ramboeck.it>
```

### Was wird automatisch versendet?

✅ **Willkommens-E-Mail** bei Registrierung
✅ **Passwort-Reset-E-Mails**
✅ **Team-Einladungen**
✅ **Monatliche Erinnerungen** (wenn aktiviert)
✅ **Wöchentliche Reports** (wenn aktiviert)

---

## 🔧 Troubleshooting

### Problem: DNS Records nicht verifiziert

**Lösung:**
```bash
# Prüfen ob DNS propagiert ist
dig s1._domainkey.app.ramboeck.it CNAME
dig s2._domainkey.app.ramboeck.it CNAME

# Sollte SendGrid-Werte zurückgeben
# Falls nicht: 30-60 Min warten
```

### Problem: "Failed to initialize email transporter"

**Ursache:** Falsche SMTP-Zugangsdaten

**Lösung:**
```bash
# .env.production prüfen
cat /home/timetracking_app/timetracking_app/.env.production | grep EMAIL

# Wichtig:
# EMAIL_USER muss exakt "apikey" sein (nicht deine E-Mail!)
# EMAIL_PASSWORD muss dein SendGrid API Key sein
```

### Problem: E-Mails kommen nicht an

**Mögliche Ursachen:**

1. **E-Mail im Spam?**
   - Prüfe Spam-Ordner
   - SendGrid braucht 1-2 Tage für gute Reputation

2. **Domain nicht verifiziert?**
   - SendGrid → Settings → Sender Authentication
   - Status muss "Verified" sein

3. **API Key falsch?**
   - Neuen API Key erstellen
   - In .env.production eintragen
   - Backend neu starten

4. **Firewall blockiert Port 587?**
   ```bash
   # Auf Server testen
   telnet smtp.sendgrid.net 587
   ```
   Sollte verbinden. Falls nicht: Firewall prüfen.

### Problem: "Authentication failed"

**Lösung:**
```bash
# .env.production prüfen
EMAIL_USER=apikey  # MUSS exakt "apikey" sein!
EMAIL_PASSWORD=SG.dein-echter-api-key-hier
```

---

## 📚 Nützliche Links

- **SendGrid Dashboard:** https://app.sendgrid.com/
- **API Keys:** https://app.sendgrid.com/settings/api_keys
- **Activity Feed:** https://app.sendgrid.com/email_activity
- **Sender Authentication:** https://app.sendgrid.com/settings/sender_auth
- **Docs:** https://docs.sendgrid.com/

---

## 🔒 Sicherheit

**API Key schützen:**
- ❌ NIEMALS in Git committen!
- ✅ Nur in `.env.production` auf dem Server
- ✅ `.env.production` ist in `.gitignore`
- ✅ Regelmäßig API Keys rotieren (alle 3-6 Monate)

**API Key erneuern:**
1. Neuen API Key in SendGrid erstellen
2. In `.env.production` ersetzen
3. Backend neu starten
4. Alten API Key in SendGrid löschen

---

## 💰 Kosten & Limits

**SendGrid Free Plan:**
- ✅ 100 E-Mails/Tag (kostenlos)
- ✅ Unbegrenzte Kontakte
- ✅ Domain Authentication
- ✅ API & SMTP Zugang

**Wenn du mehr brauchst:**
- **Essentials Plan:** 19,95$/Monat (50.000 E-Mails/Monat)
- **Pro Plan:** 89,95$/Monat (1,5 Mio E-Mails/Monat)

**Aktuelles Limit prüfen:**
- SendGrid Dashboard → Settings → Account Details
- Zeigt: Versendete E-Mails heute/Monat

---

## ✅ Checkliste

- [ ] SendGrid Account erstellt
- [ ] Domain Authentication gestartet
- [ ] 3 DNS CNAME Records beim Provider eingetragen
- [ ] DNS Propagierung abgewartet (10-60 Min)
- [ ] Domain in SendGrid verifiziert (Status: Verified)
- [ ] API Key erstellt und kopiert
- [ ] .env.production mit SendGrid-Daten aktualisiert
- [ ] Backend neu gestartet
- [ ] Backend-Logs geprüft (✅ Email transporter initialized)
- [ ] Test-E-Mail versendet (Registrierung oder Passwort-Reset)
- [ ] E-Mail erhalten und Spam-Ordner geprüft
- [ ] SendGrid Activity Feed zeigt erfolgreichen Versand

**Wenn alle Punkte ✅ sind → E-Mail-Versand läuft! 🎉**
