# CSV-Import für Kunden

RamboFlow unterstützt den Import von Kundendaten aus verschiedenen Buchhaltungstools wie **sevDesk**, **Papierkram** und **Lexoffice**.

## Unterstützte Spalten

Die folgenden Spaltennamen werden automatisch erkannt (Groß-/Kleinschreibung wird ignoriert):

### Name/Firmenname (Pflichtfeld)
- `name`, `Name`
- `Firmenname`, `Firma`, `Kundenname`
- `company`, `Company`
- `customer`, `Customer`

### Kundennummer
- `customerNumber`, `number`, `Nummer`
- `Kundennummer`, `Debitorennummer`, `Kunden-Nr`
- `customer_number`

### Ansprechpartner
**Option 1: Getrennte Felder**
- `Vorname` / `firstname` / `first_name` / `FirstName`
- `Nachname` / `lastname` / `last_name` / `LastName`

**Option 2: Kombiniertes Feld**
- `Ansprechpartner`, `contactPerson`, `contact`, `Contact`, `Kontaktperson`

### E-Mail
- `email`, `Email`, `E-Mail`, `e-mail`
- `mail`, `Mail`, `emailAddress`

### Adresse
**Option 1: Separate Felder** (werden automatisch kombiniert)
- `Straße` / `Strasse` / `street` / `Street` / `Adresse` / `address`
- `PLZ` / `Postleitzahl` / `zip` / `zipcode` / `postal_code`
- `Stadt` / `Ort` / `city` / `City` / `place`
- `Land` / `country` / `Country`

**Option 2: Kombiniertes Feld**
- `address`, `Adresse`, `Address`

### Telefon
- `Telefon`, `Tel`, `Telefonnummer`
- `phone`, `Phone`, `telephone`
- `mobile`, `Mobil`

### Steuernummer/USt-IdNr
- `USt-IdNr`, `Steuernummer`, `UStID`
- `taxId`, `tax_id`, `vat_id`, `vatId`

## Beispiel-CSV-Dateien

### sevDesk Format
```csv
Kundennummer,Firmenname,Ansprechpartner,Straße,PLZ,Stadt,E-Mail,Telefon,USt-IdNr
K001,Musterfirma GmbH,Max Mustermann,Musterstr. 1,12345,Berlin,info@musterfirma.de,030-123456,DE123456789
K002,Beispiel AG,Anna Schmidt,Beispielweg 5,80331,München,kontakt@beispiel.de,089-987654,DE987654321
```

### Papierkram Format
```csv
Name,Kundennummer,Vorname,Nachname,Strasse,PLZ,Ort,Email,Telefon
Musterfirma GmbH,K001,Max,Mustermann,Musterstr. 1,12345,Berlin,info@musterfirma.de,030-123456
Beispiel AG,K002,Anna,Schmidt,Beispielweg 5,80331,München,kontakt@beispiel.de,089-987654
```

### Lexoffice Format
```csv
company,customer_number,contact,street,zip,city,email,phone
Musterfirma GmbH,K001,Max Mustermann,Musterstr. 1,12345,Berlin,info@musterfirma.de,030-123456
Beispiel AG,K002,Anna Schmidt,Beispielweg 5,80331,München,kontakt@beispiel.de,089-987654
```

### Minimal Format (nur Name)
```csv
name
Musterfirma GmbH
Beispiel AG
Freelancer Schmidt
```

## So funktioniert der Import

1. **Einstellungen öffnen** → **Zeiterfassung** → **Kunden**
2. Klick auf **"Importieren"**-Button
3. CSV-Datei auswählen
4. Import-Ergebnis wird angezeigt mit:
   - Anzahl erfolgreich importierter Kunden
   - Anzahl fehlgeschlagener Importe
   - Liste der Fehler (falls vorhanden)

## Tipps

- **Encoding**: Die CSV-Datei sollte UTF-8 kodiert sein
- **Trennzeichen**: Komma (`,`) oder Semikolon (`;`) werden unterstützt
- **Excel**: Beim Speichern aus Excel "CSV UTF-8 (durch Trennzeichen getrennt)" wählen
- **Duplikate**: Es werden keine Duplikate erkannt - jede Zeile wird als neuer Kunde angelegt
- **Farben**: Kunden bekommen automatisch zufällige Farben zugewiesen

## Export aus sevDesk, Papierkram, Lexoffice

### sevDesk
1. Kunden → Exportieren → CSV-Export
2. Alle Felder auswählen
3. Datei herunterladen und in RamboFlow importieren

### Papierkram
1. Kontakte → Exportieren → CSV
2. Gewünschte Felder auswählen
3. Datei herunterladen und importieren

### Lexoffice
1. Kontakte → Export
2. CSV-Format wählen
3. Datei herunterladen und importieren

## Probleme?

Falls der Import nicht funktioniert:
- Stelle sicher, dass die Datei eine `.csv`-Datei ist
- Überprüfe, ob mindestens eine Spalte mit dem Firmennamen vorhanden ist
- Öffne die CSV-Datei in einem Texteditor und prüfe das Format
- Bei Problemen mit Umlauten: Datei als UTF-8 speichern
