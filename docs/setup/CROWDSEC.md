# CrowdSec auf srv-docker01

CrowdSec liest die Logs von nginx (Docker-Container) und das Login-Protokoll
des Backends, erkennt Scanner/Brute-Force/bekannte Angriffe und sperrt die IPs
über einen Firewall-Bouncer. Konfiguration liegt in `deploy/crowdsec/`.

**Voraussetzungen (Stand 28.11.2026):** SSH nur über NetBird (Port 22 in der
Hetzner-Firewall zu), nginx sieht echte Client-IPs, `security.log` liegt unter
`/var/lib/ramboflow/logs/` und enthält seit 8f68caa nur bereinigte Zeilen.

## Phase 1 — nur beobachten (keine Sperren)

```bash
cd /home/timetracking_app/timetracking_app && git pull

# Paketquelle + Engine
curl -s https://install.crowdsec.net | sudo sh
sudo apt install crowdsec

# Standard-Sammlungen (nginx, HTTP-Angriffe, bekannte CVEs, SSH, Linux)
sudo cscli collections install crowdsecurity/nginx crowdsecurity/linux crowdsecurity/sshd crowdsecurity/http-cve crowdsecurity/base-http-scenarios

# RamboFlow-eigene Dateien
sudo cp deploy/crowdsec/acquis-ramboflow.yaml      /etc/crowdsec/acquis.d/ramboflow.yaml
sudo cp deploy/crowdsec/parser-ramboflow-auth.yaml /etc/crowdsec/parsers/s01-parse/ramboflow-auth.yaml
sudo cp deploy/crowdsec/scenario-ramboflow-bf.yaml /etc/crowdsec/scenarios/ramboflow-bf.yaml
sudo cp deploy/crowdsec/whitelist-ramboflow.yaml   /etc/crowdsec/parsers/s02-enrich/ramboflow-whitelist.yaml

sudo systemctl restart crowdsec
sudo cscli metrics          # Acquisition: Zeilen aus docker:ramboflow-nginx + security.log?
```

### Prüfen, ob die Logs richtig gelesen werden

```bash
# nginx-Zeile (Format "main" = combined + X-Forwarded-For)
sudo cscli explain --type nginx --log '1.2.3.4 - - [28/Nov/2026:12:00:00 +0000] "GET /wp-login.php HTTP/1.1" 404 153 "-" "Mozilla/5.0" "-"'

# Login-Zeile
sudo cscli explain --type ramboflow-auth --log '[2026-11-28T12:00:00.000Z] AUTH_FAILED ip=1.2.3.4 user=test'
```
Beide müssen mit ✅ durch den Parser laufen (`s01-parse` grün).

### Beobachten (ein paar Tage)

```bash
sudo cscli alerts list            # was wäre gesperrt worden?
sudo cscli alerts inspect <ID> -d # Details zu einem Alarm
sudo cscli decisions list         # aktive Entscheidungen (ohne Bouncer wirkungslos)
```
Auf **Fehlalarme** achten: eigene IP, Kunden-IPs, Monitoring (UptimeRobot).
Eine eigene IP fälschlich erkannt → in `whitelist-ramboflow.yaml` ergänzen, neu
kopieren, `sudo systemctl reload crowdsec`.

## Phase 2 — Sperren einschalten

```bash
sudo apt install crowdsec-firewall-bouncer-iptables
sudoedit /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml
#   mode: iptables
#   iptables_chains:
#     - INPUT
#     - DOCKER-USER      ← Pflicht, sonst gilt die Sperre nicht für App/Portal
sudo systemctl restart crowdsec-firewall-bouncer
sudo iptables -S DOCKER-USER      # muss jetzt einen CROWDSEC-Sprung enthalten
```

## Notfall: IP entsperren

Über NetBird (100.64.0.0/10 ist auf der Whitelist) oder die Hetzner-Konsole:
```bash
sudo cscli decisions delete --ip <IP>
# alles zurücknehmen:
sudo systemctl stop crowdsec-firewall-bouncer
```

## Später (optional)
- **Geo-Blocking** (nur DACH) — erst, wenn niemand mehr regelmäßig aus dem Ausland zugreift.
- **CrowdSec AppSec** (Web-Application-Firewall mit virtuellem Patching).
- **CrowdSec-Konsole** (app.crowdsec.net, `cscli console enroll`) für eine Übersicht im Browser.
