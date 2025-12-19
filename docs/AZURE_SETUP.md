# Microsoft Graph API - Azure Setup Anleitung

Diese Anleitung erklärt, wie Sie eine Azure App Registration erstellen, um E-Mails über die Microsoft Graph API zu senden.

## Voraussetzungen

- Microsoft 365 Tenant (Business oder Enterprise)
- Azure AD Administrator-Rechte (oder jemand der Admin Consent erteilen kann)
- E-Mail-Postfach, von dem gesendet werden soll (z.B. `noreply@ihredomain.de`)

---

## Schritt 1: Azure Portal öffnen

1. Gehen Sie zu [https://portal.azure.com](https://portal.azure.com)
2. Melden Sie sich mit Ihrem Microsoft 365 Admin-Konto an

---

## Schritt 2: App Registration erstellen

1. Suchen Sie nach **"App registrations"** (oder "App-Registrierungen")
2. Klicken Sie auf **"New registration"** (Neue Registrierung)
3. Füllen Sie das Formular aus:
   - **Name:** `TimeTrack Email Service` (oder ein Name Ihrer Wahl)
   - **Supported account types:** `Accounts in this organizational directory only` (Nur Konten in diesem Verzeichnis)
   - **Redirect URI:** Leer lassen (nicht benötigt für Client Credentials Flow)
4. Klicken Sie auf **"Register"**

---

## Schritt 3: Wichtige IDs notieren

Nach der Registrierung sehen Sie die Übersicht. Notieren Sie sich:

| Feld | Umgebungsvariable |
|------|-------------------|
| **Application (client) ID** | `AZURE_CLIENT_ID` |
| **Directory (tenant) ID** | `AZURE_TENANT_ID` |

---

## Schritt 4: Client Secret erstellen

1. Gehen Sie zu **"Certificates & secrets"** im linken Menü
2. Klicken Sie auf **"New client secret"**
3. Füllen Sie aus:
   - **Description:** `TimeTrack Production` (oder ähnlich)
   - **Expires:** Wählen Sie eine Gültigkeitsdauer (empfohlen: 24 Monate)
4. Klicken Sie auf **"Add"**
5. **WICHTIG:** Kopieren Sie den **Value** (Wert) sofort! Er wird nur einmal angezeigt.
   - Dieser Wert ist Ihr `AZURE_CLIENT_SECRET`

---

## Schritt 5: API-Berechtigungen hinzufügen

1. Gehen Sie zu **"API permissions"** im linken Menü
2. Klicken Sie auf **"Add a permission"**
3. Wählen Sie **"Microsoft Graph"**
4. Wählen Sie **"Application permissions"** (nicht Delegated!)
5. Suchen und wählen Sie folgende Berechtigungen:

### Für E-Mail-Versand (Pflicht)
- `Mail.Send` - E-Mails senden

### Für zukünftige Postfach-Überwachung (Optional)
- `Mail.Read` - E-Mails lesen
- `Mail.ReadWrite` - E-Mails lesen und als gelesen markieren

6. Klicken Sie auf **"Add permissions"**

---

## Schritt 6: Admin Consent erteilen

1. In der Übersicht der API-Berechtigungen sehen Sie jetzt die hinzugefügten Berechtigungen
2. Klicken Sie auf **"Grant admin consent for [Ihr Tenant]"**
3. Bestätigen Sie mit **"Yes"**
4. Die Status-Spalte sollte nun für alle Berechtigungen **"Granted for..."** anzeigen (grünes Häkchen)

---

## Schritt 7: Umgebungsvariablen konfigurieren

Fügen Sie folgende Variablen zu Ihrer `.env`-Datei auf dem Server hinzu:

```env
# Microsoft Graph API
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=Ihr-Client-Secret-Wert
GRAPH_MAIL_FROM=noreply@ihredomain.de

# Provider auf Graph setzen (oder 'auto' für Fallback)
EMAIL_PROVIDER=graph
```

**Wichtig:** `GRAPH_MAIL_FROM` muss ein existierendes Postfach in Ihrem M365-Tenant sein!

---

## Schritt 8: Testen

Nach dem Neustart des Servers sollten Sie in den Logs sehen:

```
✅ Microsoft Graph API initialized
📧 Email provider: Microsoft Graph API
```

Sie können die Verbindung testen, indem Sie eine Test-E-Mail über die Anwendung senden.

---

## Fehlerbehebung

### Fehler: "Insufficient privileges"
- Stellen Sie sicher, dass Admin Consent erteilt wurde (Schritt 6)
- Prüfen Sie, ob die richtigen **Application permissions** (nicht Delegated) gewählt wurden

### Fehler: "Invalid client secret"
- Das Secret ist möglicherweise abgelaufen
- Erstellen Sie ein neues Secret (Schritt 4)

### Fehler: "User not found" für GRAPH_MAIL_FROM
- Das Postfach muss existieren und lizenziert sein
- Shared Mailboxes funktionieren auch, benötigen aber keine Lizenz

### E-Mails landen im Spam
- Stellen Sie sicher, dass SPF, DKIM und DMARC für Ihre Domain konfiguriert sind
- Verwenden Sie eine Domain, die zu Ihrem M365-Tenant gehört

---

## Sicherheitshinweise

1. **Client Secret schützen:** Speichern Sie das Secret niemals im Code oder Git
2. **Least Privilege:** Fügen Sie nur die Berechtigungen hinzu, die Sie wirklich benötigen
3. **Secret-Rotation:** Erneuern Sie das Client Secret regelmäßig (vor Ablauf)
4. **Monitoring:** Überwachen Sie die App-Aktivitäten im Azure Portal unter "Sign-in logs"

---

## Zukünftige Erweiterungen

### Postfach-Überwachung (Support-Inbox → Tickets)

Sobald `Mail.Read` und `Mail.ReadWrite` Berechtigungen erteilt sind, können Sie:

1. Ein Support-Postfach überwachen
2. Eingehende E-Mails automatisch in Tickets umwandeln
3. E-Mails nach Verarbeitung als gelesen markieren

Konfiguration (zukünftig):
```env
GRAPH_SUPPORT_MAILBOX=support@ihredomain.de
GRAPH_INVOICE_MAILBOX=rechnung@ihredomain.de
```

---

## Hilfreiche Links

- [Azure Portal](https://portal.azure.com)
- [Microsoft Graph API Dokumentation](https://docs.microsoft.com/en-us/graph/overview)
- [Graph Explorer (zum Testen)](https://developer.microsoft.com/en-us/graph/graph-explorer)
- [Mail.Send Permission](https://docs.microsoft.com/en-us/graph/api/user-sendmail)
