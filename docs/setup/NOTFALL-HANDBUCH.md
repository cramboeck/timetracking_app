# Notfall-Handbuch RamboFlow

> Ziel: Auch wenn Laptop, Server oder ein Zugang ausfällt, kommst du wieder an App, Daten und Server.
> **In diesem Dokument stehen KEINE Geheimnisse.** Alles Geheime gehört in den Passwort-Manager
> (Liste unten). Dieses Dokument zusätzlich als PDF außerhalb der Server ablegen
> (Passwort-Manager-Anhang, OneDrive, ausgedruckt) — BookStack liegt auf srv-docker01 und
> ist im Ernstfall selbst weg.
>
> Stand: 28.11.2026

---

## 1. Was läuft wo

| System | Wo | Zweck |
|---|---|---|
| **srv-docker01** | Hetzner Cloud, CAX21 (arm64), Ubuntu 24.04, öffentl. IP 91.98.95.60, NetBird-IP 100.87.235.106 | RamboFlow (App, Portal, Datenbank, nginx, certbot), BookStack |
| **NetBird-Server** | Hetzner Cloud, Debian 13, öffentl. IP 178.104.129.84, `netbird.ramboeck-it.com` | VPN für den SSH-Zugang (netbird-server, dashboard, proxy, traefik, crowdsec) |
| **Code** | GitHub `cramboeck/timetracking_app`, Branch `claude/next-version-roadmap-ks0D0` | Quelle für jeden Deploy |
| **Domains / DNS** | `app.ramboeck.it`, `portal.ramboeck.it`, `docs.ramboeck.it`, `netbird.ramboeck-it.com` | beim Domain-/DNS-Anbieter |
| **Microsoft 365 / Entra** | Tenant ramboeck-it | SSO-Login, Postfächer (Rechnungs-/Bestell-/Support-Postfach) |

## 2. Zugangswege (in dieser Reihenfolge probieren)

### srv-docker01
1. **SSH über NetBird:** NetBird-Client verbinden → `ssh christoph@100.87.235.106` (Schlüssel + Passphrase).
2. **Hetzner-Konsole:** console.hetzner.cloud → Projekt → srv-docker01 → `>_` (Konsole). Anmeldung als `christoph` mit Passwort. Funktioniert IMMER, auch ohne NetBird/SSH.
3. **Hetzner-Rettungssystem:** Reiter *Rescue* → Rescue aktivieren → Neustart → Platte mounten (`mount /dev/sda1 /mnt`) → z. B. `chroot /mnt passwd christoph`. Danach Rescue wieder **deaktivieren**.

Port 22 ist öffentlich **zu** (Hetzner Cloud Firewall). Nur über NetBird oder Konsole.

### NetBird-Server
1. **SSH direkt:** `ssh christoph@178.104.129.84` (nur Schlüssel, root-Login gesperrt).
2. **Hetzner-Konsole** als `root` oder `christoph` mit Passwort.
3. **Rettungssystem** wie oben.

⚠️ Nicht über NetBird auf den NetBird-Server — fällt NetBird aus, ist der Weg zu.

### Wenn NetBird ausfällt
srv-docker01 per Hetzner-Konsole erreichbar. Notfalls in der Hetzner Cloud Firewall von srv-docker01 **vorübergehend** TCP 22 für die eigene aktuelle IP öffnen — danach wieder schließen.

### App ohne Microsoft (Entra) erreichbar
Passwort-Login neben „Mit Microsoft anmelden“ bleibt als Notfallweg (Notfall-Admin mit langem Passwort + MFA).

## 3. Geheimnisse — gehören in den Passwort-Manager

| Eintrag | Wofür |
|---|---|
| Hetzner-Konto (Login + 2FA-Wiederherstellungscodes) | Konsole, Backups, Firewall, Rescue — **der wichtigste Zugang** |
| root-Passwort NetBird-Server | Hetzner-Konsole |
| Passwort `christoph` auf srv-docker01 und NetBird-Server | Hetzner-Konsole, `sudo` |
| SSH-Schlüssel-Passphrase (Laptop, Handy) | SSH |
| **Kopie des privaten SSH-Schlüssels** `id_ed25519` (verschlüsselt, mit Passphrase) | falls der Laptop ausfällt |
| NetBird-Dashboard-Login (Admin) | Geräte/Regeln |
| GitHub-Konto + 2FA-Wiederherstellungscodes | Code |
| Domain-/DNS-Anbieter-Login | Domains, DNS |
| Microsoft-365-Admin + Notfall-Admin (Break-Glass) | Entra, Conditional Access |
| RamboFlow Notfall-Admin (Passwort-Login + MFA-Wiederherstellungscodes) | App ohne SSO |
| **Inhalt von `.env.production`** (srv-docker01, `/home/timetracking_app/timetracking_app/.env.production`) | DB-Passwort, JWT_SECRET, Mail, Entra, VAPID … — ohne sie startet die App nach einer Neuinstallation nicht |
| `/root/docker-compose.yml` + `/root/config.yaml` vom NetBird-Server | NetBird-Neuinstallation |
| sevDesk-, Infinigate-, NinjaOne-, Anthropic-API-Schlüssel | stehen in der App (Einstellungen), Kopie im Passwort-Manager |

`.env.production` sichern (auf dem Server, Inhalt dann in den Passwort-Manager kopieren):
```bash
sudo cat /home/timetracking_app/timetracking_app/.env.production
```

## 4. Backups

| Was | Wie | Wo |
|---|---|---|
| Datenbank | `scripts/backup-gfs.sh` stündlich (cron, root): 24 stündlich / 7 täglich / 4 wöchentlich / 12 monatlich | `/home/timetracking_app/timetracking_app/backups/{hourly,daily,weekly,monthly}` |
| Ganzer Server (inkl. Uploads, .env, BookStack) | Hetzner-Server-Backups (täglich, 7 Versionen) | Hetzner Cloud → srv-docker01 → Backups |
| NetBird-Server | Hetzner-Server-Backups — **einschalten!** | Hetzner Cloud → NetBird-Server → Backups |

Prüfen: `sudo ./scripts/backup-gfs.sh status`

## 5. Wiederherstellen

### Einzelne Datenbank aus Backup
```bash
cd /home/timetracking_app/timetracking_app
ls -t backups/hourly/ | head            # gewünschtes Backup wählen
sudo ./scripts/restore-database.sh backups/hourly/<datei>.sql.gz
```
Vorher immer einen Hetzner-Snapshot anlegen.

### Ganzer Server weg
1. Hetzner Cloud → Backups → letztes Backup → „Als neuen Server wiederherstellen“ (oder Snapshot).
2. Öffentliche IP ändert sich ggf. → DNS (`app`, `portal`, `docs`) auf die neue IP.
3. NetBird-Client auf dem neuen Server neu verbinden (Setup-Key aus dem Dashboard), Gruppe `server-ramboflow`.
4. Hetzner Cloud Firewall an den neuen Server hängen (80/443/ICMP).

### Neuinstallation ohne Server-Backup (letzter Ausweg)
1. Ubuntu-Server, Docker installieren, Repo klonen (Branch `claude/next-version-roadmap-ks0D0`).
2. `.env.production` aus dem Passwort-Manager anlegen.
3. `scripts/setup-volumes.sh`, dann `./scripts/deploy.sh`.
4. Neuestes DB-Backup einspielen (Kopie muss außerhalb des Servers liegen — siehe 7.).

## 6. Wartung (Kurzfassung)

```bash
# Updates (beide Server)
sudo apt update && sudo apt full-upgrade
cat /var/run/reboot-required && sudo reboot

# App aktualisieren (srv-docker01, OHNE sudo)
cd /home/timetracking_app/timetracking_app && ./scripts/deploy.sh

# NetBird aktualisieren (NetBird-Server)
sudo -i; cd /root; docker compose pull && docker compose up -d; exit

# CrowdSec (srv-docker01)
sudo cscli alerts list
sudo cscli decisions delete --ip <IP>   # versehentliche Sperre aufheben
```
Vor jedem größeren Eingriff: Hetzner-Snapshot.

## 7. Offene Punkte (Stand 28.11.2026)

- [ ] NetBird-Server: Hetzner-Backups + Cloud Firewall (TCP 22/80/443, UDP 3478/51820, ICMP)
- [ ] NetBird-Dashboard: `srv-docker01` → Login expiration aus; Regel „WServer2025 Access“ nicht mehr Quelle „All“
- [ ] Handy: SSH-App mit eigenem Schlüssel + NetBird-App; danach auf srv-docker01 Passwort-Login per SSH abschalten
- [ ] Container-Images aktualisieren (`docker compose pull` + `build --pull`)
- [ ] DB-Backups zusätzlich außer Haus (z. B. Hetzner Storage Box) — bisher nur auf dem Server + im Server-Backup
- [ ] Nach dem Urlaub: CrowdSec Phase 2, Conditional Access mit konformen Geräten
