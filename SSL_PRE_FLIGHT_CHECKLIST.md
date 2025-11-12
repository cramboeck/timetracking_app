# 🔍 SSL Setup Pre-Flight Checklist

## Vor dem Start - Diese Punkte MÜSSEN alle erfüllt sein!

### ✅ 1. DNS-Konfiguration überprüfen

```bash
# Auf deinem lokalen Computer oder Server ausführen:
dig app.ramboeck.it +short

# ODER
nslookup app.ramboeck.it

# ODER
ping app.ramboeck.it
```

**Erwartetes Ergebnis:** Die IP-Adresse deines Hetzner-Servers muss zurückkommen!

**Wenn NICHT:**
- Bei deinem Domain-Provider (z.B. Namecheap, CloudFlare, etc.) einen A-Record erstellen:
  - Type: A
  - Name: app
  - Value: <DEINE_HETZNER_SERVER_IP>
  - TTL: 3600
- 5-30 Minuten warten bis DNS propagiert ist
- Erneut testen

---

### ✅ 2. Hetzner Cloud Firewall überprüfen

**In der Hetzner Cloud Console:**
1. Gehe zu deinem Server
2. Klicke auf "Firewalls"
3. Prüfe ob Port 80 und 443 OFFEN sind

**Benötigte Regeln:**
```
Eingehend:
- TCP Port 80 (HTTP) → 0.0.0.0/0
- TCP Port 443 (HTTPS) → 0.0.0.0/0
- TCP Port 22 (SSH) → 0.0.0.0/0
```

---

### ✅ 3. UFW Firewall auf dem Server prüfen

```bash
# SSH zum Server
ssh root@<DEINE_SERVER_IP>

# UFW Status prüfen
ufw status verbose

# Falls Ports nicht offen sind:
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
```

---

### ✅ 4. Docker & Docker Compose installiert

```bash
docker --version
docker compose version
```

Sollte Docker Version 20+ und Docker Compose V2 zeigen.

---

### ✅ 5. .env.production Datei korrekt konfiguriert

```bash
cd /opt/ramboflow
cat .env.production
```

**Wichtige Variablen prüfen:**
- `DOMAIN=app.ramboeck.it`
- `FRONTEND_URL=https://app.ramboeck.it`
- `DB_PASSWORD` ist gesetzt (nicht leer!)
- `JWT_SECRET` ist gesetzt (nicht leer!)
- `CORS_ORIGINS=https://app.ramboeck.it`

---

### ✅ 6. Persistente Verzeichnisse existieren

```bash
ls -la /var/lib/ramboflow/
```

Sollte zeigen:
- `/var/lib/ramboflow/postgres/`
- `/var/lib/ramboflow/logs/`

**Falls nicht:**
```bash
mkdir -p /var/lib/ramboflow/postgres
mkdir -p /var/lib/ramboflow/logs
chmod 755 /var/lib/ramboflow/postgres
chmod 755 /var/lib/ramboflow/logs
```

---

### ✅ 7. Nginx-Konfiguration prüfen

```bash
cd /opt/ramboflow
grep "app.ramboeck.it" nginx/nginx.production.conf
```

Sollte mehrere Zeilen mit `app.ramboeck.it` zeigen.

---

## 🚨 Häufige Fehlerquellen beim letzten Mal

### Problem 1: Chicken-Egg-Problem
**Symptom:** Nginx startet nicht, weil SSL-Zertifikate fehlen

**Lösung:** Wir starten Nginx zuerst OHNE SSL-Block (nur HTTP), holen dann das Zertifikat, und aktivieren dann SSL.

### Problem 2: DNS nicht propagiert
**Symptom:** Certbot sagt "Failed to verify domain ownership"

**Lösung:** Warte bis DNS vollständig propagiert ist (siehe Checklist Punkt 1)

### Problem 3: Port 80 blockiert
**Symptom:** Certbot kann Challenge-Datei nicht erreichen

**Lösung:** Firewall-Regeln prüfen (siehe Checklist Punkt 2 & 3)

---

## ✅ Wenn ALLE Checkpunkte erfüllt sind → Weiter mit SSL_SETUP.md
