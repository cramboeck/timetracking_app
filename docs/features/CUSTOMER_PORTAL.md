# Kundenportal - Dokumentation

Das Kundenportal ermöglicht Kunden den Zugriff auf ihre Tickets und die Wissensdatenbank über eine separate, sichere Web-Oberfläche.

## Übersicht

| Feature | Beschreibung |
|---------|--------------|
| URL | Eigene Domain (z.B. `portal.example.com`) |
| Login | E-Mail + Passwort |
| MFA | Optional, TOTP-basiert |
| Sprache | Deutsch |

---

## Für Administratoren

### Kundenkontakt anlegen

1. **Kunden öffnen** → Kontakte-Tab
2. **Neuer Kontakt** klicken
3. Pflichtfelder ausfüllen:
   - Name
   - E-Mail-Adresse
4. **Portal-Zugang aktivieren**:
   - Checkbox "Portal-Zugang" setzen
   - Initiales Passwort wird per E-Mail gesendet

### Portal-Zugang verwalten

```
Kunden → [Kunde wählen] → Kontakte → [Kontakt bearbeiten]
```

Optionen:
- **Portal-Zugang**: Aktiviert/Deaktiviert
- **MFA-Status**: Zeigt ob 2FA aktiviert ist
- **Passwort zurücksetzen**: Sendet Reset-Link

### E-Mail-Benachrichtigungen

Kunden erhalten E-Mails bei:
- Erstem Portal-Zugang (Willkommens-Mail)
- Neuen Kommentaren an ihren Tickets
- Statusänderungen ihrer Tickets
- Passwort-Reset-Anfragen

---

## Für Kunden

### Erster Login

1. E-Mail mit Zugangsdaten erhalten
2. Portal-URL öffnen (z.B. `portal.example.com`)
3. Mit E-Mail und Initial-Passwort anmelden
4. Passwort ändern (empfohlen)
5. Optional: MFA aktivieren

### Navigation

```
┌─────────────────────────────────────────┐
│  [Logo]           Tickets | KB | Profil │
├─────────────────────────────────────────┤
│                                         │
│           Hauptbereich                  │
│                                         │
└─────────────────────────────────────────┘
```

### Tickets

#### Ticket-Übersicht
- Alle eigenen Tickets auf einen Blick
- Filterbar nach Status:
  - Alle
  - Offen
  - In Bearbeitung
  - Geschlossen
- Sortierung nach Erstelldatum

#### Neues Ticket erstellen
1. Button "Neues Ticket" klicken
2. **Titel** eingeben (Pflicht)
3. **Beschreibung** eingeben
4. **Priorität** wählen (optional)
5. **Dateien anhängen** (optional)
6. Absenden

#### Ticket-Details
- Vollständige Beschreibung lesen
- Status und Priorität sehen
- Kommentarverlauf einsehen
- Eigene Kommentare hinzufügen
- Sichtbare Aufgaben sehen (falls vorhanden)
- Lösung lesen (bei geschlossenen Tickets)

### Wissensdatenbank

- Kategorien durchsuchen
- Artikel lesen
- Volltextsuche
- Nur öffentliche Inhalte sichtbar

### Profil

#### Passwort ändern
1. Profil öffnen
2. Aktuelles Passwort eingeben
3. Neues Passwort eingeben
4. Bestätigen

#### MFA aktivieren
1. Profil → Sicherheit
2. "MFA aktivieren" klicken
3. QR-Code mit Authenticator-App scannen
4. 6-stelligen Code eingeben
5. MFA ist aktiv

#### MFA deaktivieren
1. Profil → Sicherheit
2. "MFA deaktivieren" klicken
3. Aktuellen MFA-Code eingeben
4. Bestätigen

#### Vertrauenswürdige Geräte
- Liste aller gemerkten Geräte
- Browser und Betriebssystem angezeigt
- Einzelne Geräte entfernen möglich
- "Alle entfernen" für kompletten Reset

---

## Technische Details

### API-Endpunkte

```
POST   /api/portal/auth/login        # Login
POST   /api/portal/auth/logout       # Logout
POST   /api/portal/auth/verify-mfa   # MFA verifizieren
GET    /api/portal/tickets           # Tickets abrufen
POST   /api/portal/tickets           # Ticket erstellen
GET    /api/portal/tickets/:id       # Ticket-Details
POST   /api/portal/tickets/:id/comments  # Kommentar
GET    /api/portal/kb/categories     # KB-Kategorien
GET    /api/portal/kb/articles/:id   # KB-Artikel
GET    /api/portal/profile           # Profil abrufen
PUT    /api/portal/profile/password  # Passwort ändern
POST   /api/portal/profile/mfa/setup # MFA einrichten
POST   /api/portal/profile/mfa/verify # MFA aktivieren
DELETE /api/portal/profile/mfa       # MFA deaktivieren
```

### Authentifizierung

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Login  │────▶│  MFA?   │────▶│ Session │
└─────────┘     └─────────┘     └─────────┘
                    │
                    ▼ (wenn MFA aktiv)
               ┌─────────┐
               │MFA-Code │
               └─────────┘
                    │
                    ▼
               ┌─────────┐
               │Vertrauen│
               │ Gerät?  │
               └─────────┘
```

### Session-Handling
- JWT-Token im Cookie
- 24h Gültigkeit
- Refresh bei Aktivität
- Logout löscht Token

### MFA Flow

1. **Login** mit E-Mail/Passwort
2. Server prüft ob MFA aktiv
3. Falls ja: `requiresMfa: true` Response
4. Frontend zeigt MFA-Eingabe
5. User gibt 6-stelligen Code ein
6. Server validiert TOTP
7. Optional: "Gerät vertrauen" Checkbox
8. Bei Erfolg: Session erstellt

### Trusted Devices

Wenn "Gerät vertrauen" aktiviert:
1. Server generiert Device-Token
2. Token wird im Cookie gespeichert (30 Tage)
3. Bei nächstem Login: MFA übersprungen
4. Geräteinformationen gespeichert:
   - Browser (User-Agent)
   - Betriebssystem
   - Erstelldatum
   - Letzte Nutzung

### Rate Limiting

| Endpunkt | Limit |
|----------|-------|
| Login | 5 Versuche / 15 Min |
| MFA-Verify | 5 Versuche / 15 Min |
| Passwort-Reset | 3 Versuche / Stunde |

Nach Überschreitung: 15 Min Sperre

---

## Deployment

### Nginx-Konfiguration

Das Portal läuft unter einer separaten Domain/Subdomain:

```nginx
server {
    listen 443 ssl http2;
    server_name portal.example.com;

    # SSL-Zertifikate
    ssl_certificate /etc/letsencrypt/live/portal.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.example.com/privkey.pem;

    # Frontend (Portal-UI)
    location / {
        proxy_pass http://frontend:80;
    }

    # Backend-API
    location /api/portal/ {
        proxy_pass http://backend:3001;
    }
}
```

### Umgebungsvariablen

```env
# Portal-URL (für E-Mail-Links)
PORTAL_URL=https://portal.example.com

# E-Mail-Einstellungen
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@example.com

# JWT für Portal (kann gleich sein wie Haupt-App)
JWT_SECRET=your-secret-key
```

---

## Sicherheit

### Best Practices
- HTTPS-only (kein HTTP)
- Sichere Cookie-Einstellungen (HttpOnly, Secure, SameSite)
- CORS nur für Portal-Domain
- Rate Limiting aktiv
- MFA empfohlen

### Passwort-Anforderungen
- Mindestens 8 Zeichen
- Keine weiteren Einschränkungen (Benutzerfreundlichkeit)

### Session-Sicherheit
- Token-Rotation bei kritischen Aktionen
- Automatischer Logout bei Inaktivität
- "Alle Geräte abmelden" Funktion

---

## Fehlerbehebung

### "Login fehlgeschlagen"
- E-Mail-Adresse prüfen
- Passwort korrekt?
- Rate-Limit erreicht? (15 Min warten)
- Portal-Zugang aktiviert?

### "MFA-Code ungültig"
- Zeit auf dem Gerät korrekt?
- Richtigen Account in der App?
- Code abgelaufen? (30 Sek Gültigkeit)

### "Passwort-Reset E-Mail kommt nicht"
- Spam-Ordner prüfen
- E-Mail-Adresse korrekt?
- SendGrid-Konfiguration prüfen

### "Portal nicht erreichbar"
- DNS-Einträge prüfen
- SSL-Zertifikat gültig?
- Nginx läuft?
- Backend-Container läuft?

---

*Zuletzt aktualisiert: Dezember 2024*
