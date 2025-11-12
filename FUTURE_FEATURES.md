# Zukünftige Features & Verbesserungen

## Arbeitszeiten & Zuschläge 💼

**Priorität:** Mittel  
**Status:** Geplant

### Beschreibung
Automatische Berechnung von Zuschlägen basierend auf Arbeitszeiten (Wochenende, Nachtarbeit, Feiertage, Überstunden).

### Features
1. **Standardarbeitszeiten definieren**
   - Normale Arbeitszeiten: Mo-Fr 08:00-17:00 Uhr (anpassbar)
   - Wochenend-Definition (optional)
   
2. **Zuschlagsregelungen**
   - Wochenende-Zuschlag: z.B. +25% oder +50%
   - Nachtarbeit-Zuschlag: 22:00-06:00 Uhr, z.B. +25%
   - Feiertags-Zuschlag: z.B. +100%
   - Überstunden-Zuschlag: Ab X Stunden/Woche, z.B. +25%

3. **Visualisierung**
   - Farbliche Markierung im Kalender
   - Dashboard: Normalstunden vs. Zuschlagsstunden
   - Reports mit separater Auflistung

4. **Report-Integration**
   - Automatische Berechnung in PDF-Reports
   - Detaillierte Aufschlüsselung
   - Gesamtbetrag mit allen Zuschlägen

### Zielgruppe
- Freelancer mit variablen Arbeitszeiten
- Projekte mit Nacht-/Wochenendzuschlägen
- Überstunden-Tracking für Teams

### Technische Überlegungen
- Neue Tabelle: `working_hours_settings` (user_id, start_time, end_time, weekdays)
- Neue Tabelle: `surcharge_rules` (user_id, type, percentage, time_from, time_to)
- Berechnung in ReportAssistant erweitern
- Dashboard-Komponente für Statistiken

---

Weitere Features können hier hinzugefügt werden...
