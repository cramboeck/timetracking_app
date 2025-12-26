# Microsoft Graph API - Entra ID Setup Anleitung

Diese Anleitung erklärt Schritt für Schritt, wie Sie eine App-Registrierung in Microsoft Entra ID (früher Azure AD) erstellen, um E-Mails über die Microsoft Graph API zu senden und zu lesen.

---

## Übersicht: Benötigte Berechtigungen

| Berechtigung | Typ | Beschreibung | Wann benötigt |
|--------------|-----|--------------|---------------|
| `Mail.Send` | Application | E-Mails im Namen eines Benutzers senden | **Pflicht** für E-Mail-Versand |
| `Mail.Read` | Application | E-Mails aus Postfächern lesen | Für Inbox-Überwachung |
| `Mail.ReadWrite` | Application | E-Mails lesen und als gelesen markieren | Für Inbox-Überwachung |
| `User.Read.All` | Application | Benutzerinformationen lesen | Für Verbindungstest |

> **Wichtig:** Wir verwenden **Application permissions** (nicht Delegated), da die App im Hintergrund ohne Benutzerinteraktion arbeitet.

---

## Voraussetzungen

- Microsoft 365 Tenant (Business, Enterprise oder Education)
- Entra ID Administrator-Rechte (Global Admin oder Application Administrator)
- E-Mail-Postfach für den Versand (z.B. `noreply@ihredomain.de`)
- Optional: Support-Postfach für Inbox-Überwachung (z.B. `support@ihredomain.de`)

---

## Schritt 1: Entra Admin Center öffnen

1. Öffnen Sie **[https://entra.microsoft.com](https://entra.microsoft.com)**
   - Alternativ: [https://portal.azure.com](https://portal.azure.com) → "Microsoft Entra ID"
2. Melden Sie sich mit Ihrem Administrator-Konto an

---

## Schritt 2: App-Registrierung erstellen

1. Navigieren Sie zu: **Identity** → **Applications** → **App registrations**
   - Oder suchen Sie nach "App registrations" in der Suchleiste
2. Klicken Sie auf **"+ New registration"**

3. Füllen Sie das Formular aus:

   | Feld | Wert |
   |------|------|
   | **Name** | `TimeTrack Email Service` (oder Ihr gewünschter Name) |
   | **Supported account types** | `Accounts in this organizational directory only` |
   | **Redirect URI** | Leer lassen (nicht benötigt) |

4. Klicken Sie auf **"Register"**

---

## Schritt 3: Wichtige IDs notieren

Nach der Registrierung werden Sie zur Übersichtsseite weitergeleitet. Notieren Sie sich diese Werte:

| Feld in Entra | Wert kopieren | Konfiguration |
|---------------|---------------|---------------|
| **Application (client) ID** | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Tenant ID in App |
| **Directory (tenant) ID** | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Client ID in App |

> 💡 Diese IDs finden Sie jederzeit wieder unter "Overview" Ihrer App-Registrierung.

---

## Schritt 4: Client Secret erstellen

Das Client Secret ist wie ein Passwort für Ihre Anwendung.

1. Gehen Sie zu **"Certificates & secrets"** im linken Menü
2. Wählen Sie den Tab **"Client secrets"**
3. Klicken Sie auf **"+ New client secret"**
4. Füllen Sie aus:

   | Feld | Empfehlung |
   |------|------------|
   | **Description** | `TimeTrack Production` |
   | **Expires** | `24 months` (730 days) |

5. Klicken Sie auf **"Add"**

6. ⚠️ **WICHTIG: Kopieren Sie den "Value" SOFORT!**
   - Der Wert wird nur einmal angezeigt
   - Nach dem Verlassen der Seite ist er nicht mehr sichtbar
   - Dieser Wert ist Ihr **Client Secret**

> 🔒 Speichern Sie das Secret sicher (Passwort-Manager, nicht in Code/Git)

---

## Schritt 5: API-Berechtigungen hinzufügen

### 5.1 Berechtigungen öffnen

1. Gehen Sie zu **"API permissions"** im linken Menü
2. Sie sehen bereits `User.Read` (Delegated) - diese können wir ignorieren oder entfernen

### 5.2 Microsoft Graph Berechtigungen hinzufügen

1. Klicken Sie auf **"+ Add a permission"**
2. Wählen Sie **"Microsoft Graph"**
3. Wählen Sie **"Application permissions"** (NICHT "Delegated permissions"!)

### 5.3 Berechtigungen auswählen

Suchen Sie und aktivieren Sie folgende Berechtigungen:

#### Für E-Mail-Versand (Pflicht)
```
Mail.Send
```
- Ermöglicht das Senden von E-Mails im Namen jedes Benutzers
- Benötigt für: System-E-Mails, Benachrichtigungen, Ticket-Antworten

#### Für Inbox-Überwachung (Optional, aber empfohlen)
```
Mail.Read
Mail.ReadWrite
```
- `Mail.Read`: Lesen von E-Mails aus Postfächern
- `Mail.ReadWrite`: Lesen UND als gelesen markieren
- Benötigt für: Support-Inbox → automatische Ticket-Erstellung

#### Für Verbindungstest (Optional)
```
User.Read.All
```
- Ermöglicht das Abrufen von Benutzerinformationen
- Benötigt für: Anzeige des verbundenen Postfach-Namens beim Test

4. Klicken Sie auf **"Add permissions"**

### 5.4 Übersicht Ihrer Berechtigungen

Nach dem Hinzufügen sollte Ihre Berechtigungsliste so aussehen:

| API / Permission | Type | Status |
|-----------------|------|--------|
| Microsoft Graph / Mail.Send | Application | ⚠️ Not granted |
| Microsoft Graph / Mail.Read | Application | ⚠️ Not granted |
| Microsoft Graph / Mail.ReadWrite | Application | ⚠️ Not granted |
| Microsoft Graph / User.Read.All | Application | ⚠️ Not granted |

---

## Schritt 6: Admin Consent erteilen

Application Permissions erfordern die Zustimmung eines Administrators.

1. In der Berechtigungsübersicht sehen Sie den Button **"Grant admin consent for [Ihr Tenant-Name]"**
2. Klicken Sie darauf
3. Ein Dialog erscheint - klicken Sie auf **"Yes"**
4. Warten Sie kurz, bis alle Berechtigungen aktualisiert sind

### Erfolgreiche Konfiguration

Nach dem Admin Consent sollte die Tabelle so aussehen:

| API / Permission | Type | Status |
|-----------------|------|--------|
| Microsoft Graph / Mail.Send | Application | ✅ Granted for [Tenant] |
| Microsoft Graph / Mail.Read | Application | ✅ Granted for [Tenant] |
| Microsoft Graph / Mail.ReadWrite | Application | ✅ Granted for [Tenant] |
| Microsoft Graph / User.Read.All | Application | ✅ Granted for [Tenant] |

> ⚠️ Wenn Sie keinen "Grant admin consent" Button sehen, haben Sie nicht die erforderlichen Admin-Rechte. Wenden Sie sich an Ihren Global Administrator.

---

## Schritt 7: In der Anwendung konfigurieren

### Option A: Über die Benutzeroberfläche

1. Gehen Sie in der Anwendung zu **Einstellungen** → **Microsoft 365**
2. Geben Sie ein:
   - **Tenant ID**: Die "Directory (tenant) ID" aus Schritt 3
   - **Client ID**: Die "Application (client) ID" aus Schritt 3
   - **Client Secret**: Der kopierte "Value" aus Schritt 4
   - **Mail From**: Ihr Absender-Postfach (z.B. `noreply@ihredomain.de`)
   - **Support Mailbox**: Für Inbox-Überwachung (z.B. `support@ihredomain.de`)
3. Klicken Sie auf **"Verbindung testen"**
4. Bei Erfolg: **"Speichern"**

### Option B: Über Umgebungsvariablen (Server)

Fügen Sie zur `.env`-Datei hinzu:

```env
# Microsoft Graph API Konfiguration
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=Ihr-Client-Secret-Wert

# E-Mail Konfiguration
GRAPH_MAIL_FROM=noreply@ihredomain.de
GRAPH_SUPPORT_MAILBOX=support@ihredomain.de

# E-Mail Provider
EMAIL_PROVIDER=graph
```

---

## Schritt 8: Testen

### Verbindungstest in der App

Nach erfolgreicher Konfiguration zeigt die Anwendung:
- ✅ Verbunden
- Verbunden als: [Anzeigename des Postfachs]

### Server-Logs prüfen

Bei korrekter Konfiguration erscheint im Server-Log:
```
✅ Microsoft Graph API initialized
📧 Email provider: Microsoft Graph API
```

### Test-E-Mail senden

Senden Sie eine Test-E-Mail über die Anwendung (z.B. Passwort-Reset an sich selbst).

---

## Fehlerbehebung

### "AADSTS700016: Application not found"
- **Ursache:** Client ID ist falsch
- **Lösung:** Prüfen Sie die "Application (client) ID" in Entra

### "AADSTS7000215: Invalid client secret"
- **Ursache:** Client Secret ist falsch oder abgelaufen
- **Lösung:** Erstellen Sie ein neues Secret (Schritt 4)

### "AADSTS90002: Tenant not found"
- **Ursache:** Tenant ID ist falsch
- **Lösung:** Prüfen Sie die "Directory (tenant) ID" in Entra

### "Insufficient privileges to complete the operation"
- **Ursache:** Admin Consent fehlt oder falsche Berechtigungsart
- **Lösung:**
  1. Prüfen Sie, ob Admin Consent erteilt wurde (Schritt 6)
  2. Stellen Sie sicher, dass Sie "Application permissions" gewählt haben (nicht Delegated)

### "User not found" für Mail From
- **Ursache:** Das Postfach existiert nicht oder hat keine Lizenz
- **Lösung:**
  - Erstellen Sie das Postfach im M365 Admin Center
  - Shared Mailboxes funktionieren auch (ohne Lizenz)

### E-Mails landen im Spam
- **Ursache:** Fehlende E-Mail-Authentifizierung
- **Lösung:** Konfigurieren Sie SPF, DKIM und DMARC für Ihre Domain

---

## Sicherheitsempfehlungen

### 1. Least Privilege Prinzip
Fügen Sie nur die Berechtigungen hinzu, die Sie wirklich benötigen:
- Nur E-Mail-Versand? → Nur `Mail.Send`
- Mit Inbox-Überwachung? → `Mail.Send` + `Mail.ReadWrite`

### 2. Client Secret Rotation
- Erstellen Sie vor Ablauf ein neues Secret
- Aktualisieren Sie die Konfiguration
- Löschen Sie das alte Secret erst nach erfolgreicher Umstellung

### 3. Monitoring
Überwachen Sie App-Aktivitäten in Entra:
- **Identity** → **Applications** → **Enterprise applications**
- Wählen Sie Ihre App → **Sign-in logs**

### 4. Conditional Access (Optional)
Für erhöhte Sicherheit können Sie Conditional Access Policies erstellen:
- Nur von bestimmten IPs erlauben
- MFA für Admin-Zugriff erzwingen

---

## Berechtigungs-Referenz

| Berechtigung | Graph API Scope | Beschreibung |
|--------------|-----------------|--------------|
| Mail.Send | `https://graph.microsoft.com/Mail.Send` | Senden von E-Mails als beliebiger Benutzer |
| Mail.Read | `https://graph.microsoft.com/Mail.Read` | Lesen aller E-Mails in allen Postfächern |
| Mail.ReadWrite | `https://graph.microsoft.com/Mail.ReadWrite` | Lesen, Schreiben, Löschen von E-Mails |
| User.Read.All | `https://graph.microsoft.com/User.Read.All` | Lesen aller Benutzerprofile |

> ⚠️ Application Permissions gewähren Zugriff auf ALLE Postfächer im Tenant. Verwenden Sie diese mit Bedacht.

---

## Hilfreiche Links

- [Microsoft Entra Admin Center](https://entra.microsoft.com)
- [Azure Portal](https://portal.azure.com)
- [Microsoft Graph API Dokumentation](https://learn.microsoft.com/en-us/graph/overview)
- [Graph Explorer (zum Testen)](https://developer.microsoft.com/en-us/graph/graph-explorer)
- [Mail.Send API Reference](https://learn.microsoft.com/en-us/graph/api/user-sendmail)
- [Application vs Delegated Permissions](https://learn.microsoft.com/en-us/azure/active-directory/develop/permissions-consent-overview)

---

## Zusammenfassung Checkliste

- [ ] App in Entra ID registriert
- [ ] Tenant ID notiert
- [ ] Client ID notiert
- [ ] Client Secret erstellt und sicher gespeichert
- [ ] `Mail.Send` Permission hinzugefügt (Application)
- [ ] `Mail.Read` + `Mail.ReadWrite` hinzugefügt (falls Inbox-Überwachung)
- [ ] Admin Consent erteilt (alle Berechtigungen grün)
- [ ] Konfiguration in App eingetragen
- [ ] Verbindungstest erfolgreich
- [ ] Test-E-Mail gesendet
