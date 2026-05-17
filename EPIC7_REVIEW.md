# Epic 7 – Theme-Konsistenz: Review-Feedback (Pre-Merge)

> **Status:** Branch ist **noch nicht mergebar.** Bitte folgenden Punkt nachreichen, dann ist alles grün.

---

## Zusammenfassung

Danke für die Theme-Migration auf Design-Tokens – die Richtung ist genau richtig. Beim Review ist ein kritischer Punkt aufgefallen: **`tailwind.config.js` wurde nicht mit angepasst.**

## Problem

Die 88 angepassten Komponenten verwenden 4 neue Tailwind-Tokens, die im Theme **nicht definiert** sind:

| Token | Vorkommen im Code | Definiert in `tailwind.config.js`? |
|---|---|---|
| `accent-primary` | 465× | ❌ |
| `accent-lighter` | 105× | ❌ |
| `accent-light` | 92× | ❌ |
| `accent-dark` | 69× | ❌ |

Die `colors.accent`-Section enthält aktuell nur `accent.blue.*`, `accent.green.*`, `accent.orange.*` etc. Tailwind JIT verwirft unbekannte Klassen stillschweigend → nach dem Merge würden alle 88 Komponenten ihre Akzent-Farben verlieren (Buttons ohne Hintergrund, fokus-Ringe weg, Links farblos, etc.).

## Was bereits vorhanden ist

`src/index.css` definiert die CSS-Variablen `--accent-50` … `--accent-900` als RGB-Triplets. Die können an Tailwind gebunden werden – z. B.:

```js
// tailwind.config.js – Erweiterung der bestehenden colors.accent Section
accent: {
  // ... bestehende Sub-Objekte (blue, green, orange, …) bleiben
  primary: 'rgb(var(--accent-500) / <alpha-value>)',
  light:   'rgb(var(--accent-100) / <alpha-value>)',
  lighter: 'rgb(var(--accent-50)  / <alpha-value>)',
  dark:    'rgb(var(--accent-700) / <alpha-value>)',
}
```

## Bitte vor dem nächsten Push klären

1. **Shade-Mapping festlegen:** welchem `--accent-*` entspricht `primary` / `light` / `lighter` / `dark`?
   – `CLAUDE.md` nennt **Orange `#FF6A00`** als RamboFlow-Primärfarbe (aus ramboeck-it.com Branding). Falls die CSS-Variablen noch das alte Blau (`--accent-500: 59 130 246`) tragen, müsste auch `src/index.css` auf den Orange-Wert umgestellt werden.
2. **Dark-Mode-Varianten prüfen:** z. B. `dark:bg-accent-primary/10` in `ConfirmDialog.tsx` – funktioniert das mit dem oben gewählten `rgb(var(...) / <alpha-value>)`-Pattern? (Sollte: ja, weil das `<alpha-value>`-Placeholder genau diesen Anwendungsfall abdeckt.)
3. **ConfirmDialog-Prop-Renames absichern:** `type` → `variant`, `confirmLabel` → `confirmText`, `onCancel` → `onClose`. Bitte einmal über die gesamte `src`-Tree:
   ```bash
   grep -rn "ConfirmDialog" src/ | grep -E "type=|confirmLabel=|onCancel="
   ```
   und alle Call-Sites anpassen (`CustomerEmailDomains.tsx`, `KnowledgeBaseSettings.tsx` wurden im Commit erwähnt, aber bitte sicherheitshalber gesamt-grep).

## Cleanup

Bitte diese Review-Datei beim Fix-Commit löschen:
```
git rm EPIC7_REVIEW.md
```

## Test-Checkliste vor dem Push

- [ ] `tailwind.config.js` enthält die 4 neuen Tokens
- [ ] `npm run build` läuft ohne Warnings / unbekannte Klassen
- [ ] Visueller Check: Login-Screen, Dashboard, ConfirmDialog (alle 3 Varianten: danger / warning / info) im Light- und Dark-Mode
- [ ] Keine `ConfirmDialog`-Aufrufe mit den alten Props mehr im Code
- [ ] `EPIC7_REVIEW.md` entfernt

---

Sobald die Tokens definiert sind, ist der Branch aus meiner Sicht mergebar. Bei Fragen einfach melden!

– Review erstellt von Claude (auf Anfrage von cramboeck), 2026-05-17
