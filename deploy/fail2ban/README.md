# Fail2Ban Integration für TimeTracking App (Docker Production Setup)

## Installation

### 1. Fail2Ban installieren (falls noch nicht vorhanden)

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install fail2ban

# CentOS/RHEL
sudo yum install epel-release && sudo yum install fail2ban
```

### 2. Log-Verzeichnis prüfen

Das Log-Verzeichnis wird automatisch durch Docker erstellt unter:
```
/var/lib/ramboflow/logs/
```

Die Security-Logs werden dort als `security.log` geschrieben.

### 3. Environment Variable setzen

In deiner `.env.production` Datei:

```env
# Security Alert Email (empfängt Brute-Force-Warnungen)
SECURITY_ALERT_EMAIL=deine-email@beispiel.de
# oder
ADMIN_EMAIL=deine-email@beispiel.de
```

**Hinweis:** `SECURITY_LOG_PATH` ist bereits in docker-compose.production.yml konfiguriert.

### 4. Fail2Ban Konfiguration kopieren

```bash
# Ins Projekt-Verzeichnis wechseln
cd /pfad/zu/timetracking_app
# Filter kopieren
sudo cp filter.d/timetracking.conf /etc/fail2ban/filter.d/

# Jail-Konfiguration kopieren
sudo cp jail.d/timetracking.conf /etc/fail2ban/jail.d/
```

### 5. Fail2Ban neu starten

```bash
sudo systemctl restart fail2ban
```

### 6. Überprüfen

```bash
# Status prüfen
sudo fail2ban-client status timetracking

# Logs beobachten
sudo tail -f /var/log/fail2ban.log
```

## Nützliche Befehle

```bash
# Alle Jails anzeigen
sudo fail2ban-client status

# Status eines spezifischen Jails
sudo fail2ban-client status timetracking

# IP manuell sperren
sudo fail2ban-client set timetracking banip 192.168.1.100

# IP entsperren
sudo fail2ban-client set timetracking unbanip 192.168.1.100

# Gebannte IPs anzeigen
sudo fail2ban-client get timetracking banned
```

## Log-Format

Die App schreibt Security-Logs im folgenden Format:

```
[2024-12-01T10:30:00.000Z] AUTH_FAILED ip=192.168.1.1 user=admin
[2024-12-01T10:30:05.000Z] AUTH_FAILED ip=192.168.1.1 user=admin
[2024-12-01T10:31:00.000Z] AUTH_SUCCESS ip=192.168.1.2 user=max
```

## Email-Alerts

Die App sendet automatisch Email-Alerts, wenn:
- 5+ fehlgeschlagene Login-Versuche von derselben IP innerhalb von 15 Minuten

Konfiguriere `SECURITY_ALERT_EMAIL` in deiner `.env` Datei.

## Empfohlene Einstellungen

| Umgebung | maxretry | findtime | bantime |
|----------|----------|----------|---------|
| Entwicklung | 10 | 300 (5 min) | 600 (10 min) |
| Produktion | 5 | 900 (15 min) | 3600 (1 Stunde) |
| Hochsicher | 3 | 600 (10 min) | 86400 (24 Stunden) |

## Troubleshooting

### Log-Datei wird nicht erstellt
- Überprüfe die Berechtigungen des Log-Verzeichnisses
- Stelle sicher, dass `SECURITY_LOG_PATH` gesetzt ist

### Fail2Ban erkennt die Log-Datei nicht
```bash
# Filter testen
sudo fail2ban-regex /var/log/timetracking/security.log /etc/fail2ban/filter.d/timetracking.conf
```

### IPs werden nicht gebannt
- Überprüfe, ob iptables/nftables korrekt läuft
- Prüfe die Fail2Ban-Logs: `sudo tail -f /var/log/fail2ban.log`
