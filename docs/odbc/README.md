# ODBC-Registry-Dokumentation

> Zusammenfassung zweier Registry-Exporte (`.reg`) eines Windows-Systems, Stand 15.07.2026.
> Die zusammengeführte Datei liegt als [`odbc_gesamt.reg`](./odbc_gesamt.reg) daneben.
>
> - **Export 1:** `HKLM\SOFTWARE\ODBC` → **64-Bit**-ODBC-Konfiguration
> - **Export 2:** `HKLM\SOFTWARE\WOW6432Node\ODBC` → **32-Bit**-ODBC-Konfiguration (für 32-Bit-Anwendungen auf 64-Bit-Windows)
>
> Die beiden Exporte betreffen unterschiedliche Registry-Hives und können daher konfliktfrei
> in eine Datei zusammengeführt und gemeinsam importiert werden.

---

## 1. Überblick: Konfigurierte Datenquellen (System-DSNs)

Insgesamt sind **8 System-DSNs** definiert — 1× 64-Bit, 7× 32-Bit. Der Schwerpunkt liegt klar
auf der 32-Bit-Seite, d.h. die anbindenden Anwendungen sind 32-Bit-Programme.

| DSN | Bitness | Treiber | Server | Datenbank | Letzter Benutzer |
|---|---|---|---|---|---|
| `cwddb` | 64-Bit | SQL Server (`sqlsrv32.dll`) | `SRVINNEUL` | `cwddb` | `cwduser` |
| `CWDDB` | 32-Bit | SQL Server (`SQLSRV32.dll`) | `SRVINNEUL` | `CWDDB` | `cwduser` |
| `AMOR3` | 32-Bit | SQL Server (`SQLSRV32.dll`) | `SRVINNAMOR` | `AMOR3` | `mwiusr` |
| `CGMAMOR` | 32-Bit | SQL Server (`SQLSRV32.dll`) | `MSSQL-AMOR3.altoetting.innklinikum.de\AMOR3,4458` | `CGMAMOR` | `CGMAMOR` |
| `CGMAMOR_Test` | 32-Bit | SQL Server (`SQLSRV32.dll`) | `MSSQL-AMOR3.altoetting.innklinikum.de\AMOR3,4458` | `CGMAMOR_Test` | `CGMAMOR` |
| `nt_hag` | 32-Bit | Ingres (`caiiod35.dll`) | `SRVMED001` | `nt_hag` | — |
| `nt_mue` | 32-Bit | Ingres (`caiiod35.dll`) | `SRVMED001` | `nt_mue` | — |
| `nt_nsv` | 32-Bit | Ingres (`caiiod35.dll`) | `SRVMED001` | `nt_nsv` | — |

### Details je Datenquelle

#### CWDDB / cwddb (SQL Server, doppelt vorhanden)
- Zeigt auf Server **SRVINNEUL**, Datenbank `CWDDB` (Standard-Port, Default-Instanz).
- Existiert **sowohl als 64-Bit- als auch als 32-Bit-DSN** (gleicher Server, gleiche DB) —
  vermutlich damit sowohl 32- als auch 64-Bit-Anwendungen darauf zugreifen können.
- Die 32-Bit-Variante hat zusätzlich `"Language"="Deutsch"`.
- Auffällig: Der 64-Bit-DSN referenziert den Treiberpfad `C:\WINNT\System32\sqlsrv32.dll` —
  der `WINNT`-Pfad stammt aus Windows NT/2000-Zeiten. Der DSN wurde also über
  Systemmigrationen hinweg mitgeschleppt. Funktional harmlos (der Treibername zählt),
  aber ein Indiz für das Alter der Konfiguration.

#### AMOR3 (SQL Server)
- Server **SRVINNAMOR**, Datenbank `AMOR3`, letzter Benutzer `mwiusr`.
- Ältere/direkte Anbindung an die AMOR3-Datenbank (Krankenhausinformationssystem-Umfeld,
  CGM AMOR3 = Apotheken-/Materialwirtschaftssystem von CompuGroup Medical).

#### CGMAMOR und CGMAMOR_Test (SQL Server)
- Beide zeigen auf dieselbe **benannte Instanz mit festem Port**:
  `MSSQL-AMOR3.altoetting.innklinikum.de\AMOR3, Port 4458`.
- `CGMAMOR` = Produktivdatenbank, `CGMAMOR_Test` = Testdatenbank, jeweils SQL-Login `CGMAMOR`.
- Neuere Anbindung als `AMOR3` (FQDN statt NetBIOS-Name, expliziter Port) — wahrscheinlich
  der Nachfolger-Server derselben Fachanwendung.

#### nt_hag, nt_mue, nt_nsv (Ingres)
- Drei strukturell identische DSNs auf **Actian Ingres** (Treiber `caiiod35.dll`,
  Serverversion 11.00), alle auf Server **SRVMED001**, `ServerType=INGRES`.
- Die Suffixe deuten auf **Standorte** hin: `hag` = Haag, `mue` = Mühldorf, `nsv` =
  vermutlich Neuötting/weiterer Standort — d.h. eine Datenbank pro Standort desselben
  (medizinischen) Altsystems.
- `nt_mue` hat zusätzliche Kompatibilitäts-Flags gesetzt (`SelectLoops=Y`, `AllowUpdate=N`
  u.a.) — dieser DSN wurde offenbar für eine bestimmte Anwendung feinjustiert und ist
  effektiv **schreibgeschützt** konfiguriert (`AllowUpdate=N`).
- Kein `PromptUIDPWD` → Anmeldedaten werden von der Anwendung übergeben, nicht abgefragt.

---

## 2. Installierte ODBC-Treiber

### 64-Bit (6 Treiber)

| Treiber | DLL | Bemerkung |
|---|---|---|
| SQL Server | `%WINDIR%\system32\SQLSRV32.dll` | Windows-Bordmittel, veraltet (ODBC 3.50) |
| SQL Server Native Client 10.0 | `sqlncli10.dll` | SQL Server 2008, End-of-Life |
| SQL Server Native Client 11.0 | `sqlncli11.dll` | SQL Server 2012, End-of-Life |
| ODBC Driver 11 for SQL Server | `msodbcsql11.dll` | Modernster SQL-Treiber auf dem System |
| SQL Anywhere 17 | `dbodbc17.dll` (Bin64) | SAP SQL Anywhere |
| UltraLite 17 | `ulodbc17.dll` (Bin64) | SAP UltraLite (Embedded-DB) |

### 32-Bit (24 Treiber)

Zusätzlich zu den 32-Bit-Pendants der obigen sechs Treiber:

| Treiber-Gruppe | DLL | Bemerkung |
|---|---|---|
| Jet-Treiber: Access (*.mdb), dBase (*.dbf), Excel (*.xls), Paradox (*.db), Text (*.txt/*.csv) | `odbcjt32.dll` | Jeweils in **3 Sprachvarianten** registriert (Englisch, Deutsch „-Treiber", Portugiesisch „Driver do/da…") — Folge mehrsprachiger MDAC-/Office-Installationen. Nur 32-Bit, veraltet. |
| Microsoft ODBC for Oracle | `msorcl32.dll` | Deprecated; **kein** Oracle-DSN konfiguriert |
| Ingres / Ingres 9.2 | `caiiod35.dll` | Actian Ingres, wird von den 3 `nt_*`-DSNs genutzt |
| ODBC-Translatoren | `MSCPXL32.dll` | MS Code Page Translator (ebenfalls 3 Sprachvarianten) |

---

## 3. Bewertung & Hinweise

1. **Alle 7 SQL-Server-DSNs nutzen den Uralt-Treiber `SQLSRV32.dll`** (ODBC-Version 3.50,
   Stand SQL Server 2000). Dieser unterstützt kein TLS 1.2+ zuverlässig und keine neueren
   SQL-Server-Features. Der modernere **ODBC Driver 11 for SQL Server ist bereits installiert**
   (32- und 64-Bit) — eine Umstellung der DSNs wäre ohne Zusatzinstallation möglich, muss aber
   mit den Fachanwendungen (CGM AMOR, CWD) abgestimmt werden.
2. **Kein Passwort im Export enthalten** — `LastUser` ist nur der zuletzt verwendete
   Login-Name; ODBC speichert keine Kennwörter in diesen Schlüsseln. Die Server-/Domänennamen
   (`*.altoetting.innklinikum.de`) sind dennoch interne Infrastrukturdaten und die Datei
   entsprechend vertraulich zu behandeln.
3. **SQL Anywhere 17 / UltraLite 17 sind installiert, aber ohne DSN** — die nutzende
   Anwendung verbindet sich vermutlich per DSN-loser Connection-Struktur, oder der Treiber
   ist ein Überbleibsel einer Installation.
4. **Oracle-, Jet- (Access/Excel/dBase/Paradox/Text) und Translator-Einträge** sind
   Standard-Bordmittel ohne konfigurierte Datenquelle — vorhanden, aber aktuell ungenutzt.
5. **Import-Reihenfolge egal**: Da 64-Bit- und 32-Bit-Hive getrennt sind, kann
   `odbc_gesamt.reg` als Ganzes auf einem 64-Bit-Windows importiert werden. Auf einem
   reinen 32-Bit-System dürfte nur Teil 1 (ohne `WOW6432Node`) verwendet werden.
6. **Migrationshinweis**: Wird das System neu aufgesetzt, reicht es faktisch, die 8 DSNs
   (Abschnitt 1) nachzupflegen und die benötigten Treiber (SQL-Server-Treiber, Ingres-Client,
   ggf. SQL Anywhere) zu installieren — die `ODBCINST.INI`-Einträge legen die
   Treiber-Installer selbst an und sollten **nicht** per `.reg` auf ein frisches System
   kopiert werden (Pfade/Versionen können abweichen).
