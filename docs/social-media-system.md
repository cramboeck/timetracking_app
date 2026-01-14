# Social Media System - Technische Dokumentation

> **Version:** 1.0
> **Stand:** Dezember 2024
> **Status:** In Entwicklung

---

## Inhaltsverzeichnis

1. [Übersicht](#1-übersicht)
2. [Architektur](#2-architektur)
3. [Frontend-Komponenten](#3-frontend-komponenten)
4. [Backend API](#4-backend-api)
5. [AI Service](#5-ai-service)
6. [Theme Selection Engine](#6-theme-selection-engine)
7. [Content-Erstellung Workflow](#7-content-erstellung-workflow)
8. [Datenmodelle](#8-datenmodelle)
9. [Konfiguration](#9-konfiguration)
10. [Bekannte Limitierungen](#10-bekannte-limitierungen)

---

## 1. Übersicht

Das Social Media System ist ein integriertes Modul zur Planung, Erstellung und Analyse von Social Media Content. Es kombiniert KI-gestützte Content-Generierung mit strategischer Themen-Auswahl.

### Hauptfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Content-Generierung** | KI-gestützte Erstellung von Posts, Carousels, Stories |
| **Themen-Analyse** | Strategische Auswahl basierend auf Ziel und Zielgruppe |
| **Auto-Improvement** | Automatische Qualitätsverbesserung bis Ziel-Score |
| **Queue-Management** | Planung und Scheduling von Posts |
| **Analytics** | Performance-Tracking und Insights |
| **Autopilot** | Automatische Content-Erstellung nach Zeitplan |

### Technologie-Stack

- **Frontend:** React + TypeScript
- **Backend:** Node.js + Express
- **AI:** OpenAI GPT-4 / Anthropic Claude
- **Bildgenerierung:** DALL-E 3
- **Datenbank:** PostgreSQL

---

## 2. Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│                  SocialMediaManager.tsx                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  Posts  │ │ Wizard  │ │ Queue   │ │Calendar │ │Analytics│   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
└───────┼──────────┼──────────┼──────────┼──────────┼─────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REST API                                    │
│                /api/social-media/*                               │
│              server/src/routes/social-media.ts                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  AI Service  │   │Theme Engine  │   │  Database    │
│ aiService.ts │   │themeSelect.. │   │  PostgreSQL  │
└──────────────┘   └──────────────┘   └──────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│         External AI APIs             │
│  ┌─────────┐  ┌─────────┐           │
│  │ OpenAI  │  │Anthropic│           │
│  │ GPT-4   │  │ Claude  │           │
│  │ DALL-E  │  │         │           │
│  └─────────┘  └─────────┘           │
└──────────────────────────────────────┘
```

---

## 3. Frontend-Komponenten

### Hauptkomponente

**Datei:** `src/components/SocialMediaManager.tsx`

Die Hauptkomponente verwaltet alle Social Media Funktionen in einer Tab-basierten Oberfläche.

### Tabs und Funktionen

| Tab | Funktion |
|-----|----------|
| **Posts** | CRUD-Operationen für Posts, Filter, Suche |
| **Wizard** | Geführte Content-Erstellung mit Themen-Analyse |
| **Queue** | Warteschlange mit Drag & Drop |
| **Kalender** | Monats-/Wochenansicht geplanter Posts |
| **Analytics** | Dashboards und Metriken |
| **Autopilot** | Automatisierte Content-Erstellung |
| **Stories** | Story-Erstellung und -Verwaltung |
| **Carousels** | Multi-Slide Content |

---

## 4. Backend API

### Basis-URL
```
/api/social-media
```

### Authentifizierung
Alle Endpoints erfordern JWT-Token via `authenticateToken` Middleware.

---

### 4.1 Post-Verwaltung

#### Posts abrufen
```http
GET /posts
```

**Query-Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `status` | string | `draft`, `scheduled`, `published` |
| `platform` | string | `linkedin`, `instagram`, `twitter` |
| `limit` | number | Max. Anzahl (default: 50) |
| `offset` | number | Pagination Offset |

**Response:**
```json
{
  "posts": [...],
  "total": 150
}
```

#### Post erstellen
```http
POST /posts
```

**Body:**
```json
{
  "content": "Post-Text...",
  "platform": "linkedin",
  "scheduledAt": "2024-12-25T10:00:00Z",
  "hashtags": ["#IT", "#Security"],
  "imageUrl": "https://...",
  "status": "scheduled"
}
```

#### Post aktualisieren
```http
PUT /posts/:id
```

#### Post löschen
```http
DELETE /posts/:id
```

---

### 4.2 Content-Generierung

#### Einzelnen Post generieren
```http
POST /generate
```

**Body:**
```json
{
  "topic": "IT-Sicherheit für KMU",
  "platform": "linkedin",
  "tone": "professional",
  "includeHashtags": true,
  "includeImage": true,
  "contentLength": "medium"
}
```

**Response:**
```json
{
  "content": "Generierter Post-Text...",
  "hashtags": ["#ITSecurity", "#KMU"],
  "imagePrompt": "Professional cybersecurity concept...",
  "bestPostingTime": {
    "day": "Dienstag",
    "time": "09:00",
    "reason": "Höchste Aktivität der Zielgruppe"
  }
}
```

#### Batch-Generierung
```http
POST /generate-batch
```

**Body:**
```json
{
  "topic": "Managed IT Services",
  "platform": "linkedin",
  "count": 5,
  "contentTypes": ["educational", "promotional", "engagement"]
}
```

#### Ideen generieren
```http
POST /generate-ideas
```

**Body:**
```json
{
  "industry": "IT-Dienstleister",
  "targetAudience": "Geschäftsführer KMU",
  "count": 10
}
```

---

### 4.3 Content Wizard

Der Wizard bietet eine strukturierte Content-Erstellung mit Themen-Analyse und Auto-Improvement.

#### Themen-Kategorien abrufen
```http
GET /wizard/theme-categories
```

**Response:**
```json
{
  "categories": [
    {
      "id": "PAIN_POINTS",
      "nameDE": "Schmerzpunkte",
      "emotion": "frustration",
      "subtopics": [...]
    },
    ...
  ]
}
```

#### Thema auswählen
```http
POST /wizard/select-theme
```

**Body:**
```json
{
  "platform": "linkedin",
  "goal": "leads",
  "targetAudience": "Geschäftsführer",
  "journeyStage": "awareness",
  "topicHint": "IT-Sicherheit"
}
```

**Response:**
```json
{
  "selectedTheme": {
    "category": "RISKS",
    "subtopic": "security_breach",
    "angle": "Was ein Cyberangriff wirklich kostet"
  },
  "priorityScore": 87,
  "reasoning": {
    "summary": "RISKS-Thema optimal für Lead-Generierung..."
  },
  "contentDirectives": {
    "hookStyle": "Business-Outcome fokussiert",
    "ctaStyle": "Beratungsgespräch anbieten",
    "toneGuidance": "Sachlich, souverän",
    "emphasize": ["Business Impact", "Zahlen"],
    "avoidTopics": ["Technischer Jargon"]
  }
}
```

#### Content analysieren
```http
POST /wizard/analyze
```

**Body:**
```json
{
  "content": "Post-Text zum Analysieren...",
  "platform": "linkedin",
  "goal": "leads",
  "targetAudience": "Geschäftsführer"
}
```

**Response:**
```json
{
  "overallScore": 72,
  "platformFit": {
    "score": 78,
    "feedback": "Gute Länge für LinkedIn..."
  },
  "viralPotential": 65,
  "callToActionEffectiveness": {
    "score": 58,
    "feedback": "CTA zu vage..."
  },
  "improvements": [
    {
      "area": "CTA",
      "priority": "high",
      "suggestion": "Konkretere Handlungsaufforderung",
      "improvedExample": "DM 'CHECK' für kostenlose Erstanalyse"
    }
  ]
}
```

#### Content generieren
```http
POST /wizard/generate
```

**Body:**
```json
{
  "topic": "IT-Sicherheit",
  "platform": "linkedin",
  "goal": "leads",
  "targetAudience": "Geschäftsführer",
  "tone": "professional",
  "contentLength": "medium"
}
```

#### Content verbessern
```http
POST /wizard/improve
```

**Body:**
```json
{
  "content": "Aktueller Post-Text...",
  "platform": "linkedin",
  "improvementFocus": "hook",
  "targetAudience": "Geschäftsführer",
  "goal": "leads"
}
```

#### Auto-Improvement
```http
POST /wizard/auto-improve
```

**Body:**
```json
{
  "content": "Post-Text...",
  "platform": "linkedin",
  "goal": "leads",
  "targetAudience": "Geschäftsführer",
  "minScore": 90,
  "maxIterations": 5
}
```

**Response:**
```json
{
  "originalContent": "...",
  "improvedContent": "...",
  "originalScore": 65,
  "finalScore": 91,
  "iterations": [
    {
      "iteration": 1,
      "focus": "Hook",
      "beforeScore": 65,
      "afterScore": 78,
      "changes": ["Hook mit Zahlen-Formel neu geschrieben"]
    },
    ...
  ],
  "totalIterations": 3
}
```

---

### 4.4 Queue-Management

#### Queue abrufen
```http
GET /queue
```

#### Zur Queue hinzufügen
```http
POST /queue/add
```

#### Queue-Einstellungen
```http
GET /queue/settings
PUT /queue/settings
```

#### Queue neu ordnen
```http
POST /queue/reorder
```

---

### 4.5 Analytics

#### Statistiken
```http
GET /stats
```

#### Beste Posting-Zeiten
```http
GET /analytics/best-times
```

#### Hashtag-Performance
```http
GET /analytics/hashtags
```

#### Content-Mix
```http
GET /analytics/content-mix
```

---

### 4.6 Weitere Endpoints

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/autopilot/settings` | GET/PUT | Autopilot-Konfiguration |
| `/autopilot/generate` | POST | Autopilot-Generierung |
| `/trends` | GET | Trending Topics |
| `/trends/generate` | POST | Trend-basierter Content |
| `/remix` | POST | Content remixen |
| `/competitors` | GET/POST/DELETE | Wettbewerber-Verwaltung |
| `/competitors/:id/analyze` | POST | Wettbewerber-Analyse |
| `/carousel/generate` | POST | Carousel erstellen |
| `/stories/generate` | POST | Story erstellen |
| `/images/generate` | POST | Bild generieren |

---

## 5. AI Service

**Datei:** `server/src/services/aiService.ts`

### 5.1 Content-Generierung

#### generateSocialMediaContent()
Generiert einen einzelnen Social Media Post.

```typescript
async function generateSocialMediaContent(
  userId: string,
  options: {
    topic: string;
    platform: string;
    tone?: string;
    includeHashtags?: boolean;
    includeImage?: boolean;
    contentLength?: 'short' | 'medium' | 'long';
  }
): Promise<GeneratedContent>
```

#### generateWizardContent()
Generiert Content mit integrierter Themen-Analyse und Self-Critique.

```typescript
async function generateWizardContent(
  userId: string,
  options: WizardOptions
): Promise<WizardContentGeneration>
```

**Interner Ablauf:**
1. Theme Selection via `selectTheme()`
2. Prompt-Aufbau mit Theme Directives
3. Self-Critique Loop (bis 75 Score)
4. Quality Check via `universalQualityCheck()`

---

### 5.2 Analyse & Verbesserung

#### analyzeContentAsExpert()
Analysiert Content und gibt detailliertes Feedback.

```typescript
async function analyzeContentAsExpert(
  userId: string,
  content: string,
  platform: string,
  goal: 'reach' | 'engagement' | 'leads' | 'branding',
  targetAudience?: string
): Promise<ContentAnalysis>
```

**Response-Struktur:**
```typescript
interface ContentAnalysis {
  overallScore: number;           // 0-100
  platformFit: {
    score: number;
    feedback: string;
  };
  viralPotential: number;         // 0-100
  callToActionEffectiveness: {
    score: number;
    feedback: string;
    suggestions: string[];
  };
  improvements: {
    area: string;
    priority: 'high' | 'medium' | 'low';
    suggestion: string;
    improvedExample?: string;
  }[];
}
```

#### improveContentWithExpert()
Verbessert Content basierend auf Fokus-Bereich.

```typescript
async function improveContentWithExpert(
  userId: string,
  originalContent: string,
  platform: string,
  improvementFocus: string,  // 'hook' | 'cta' | 'value' | 'all'
  targetAudience?: string,
  goal?: string,
  currentScores?: Scores
): Promise<ContentImprovement>
```

**Fokus-Bereiche und Formeln:**

| Fokus | Beschreibung |
|-------|--------------|
| `hook` | Hook mit bewährter Formel neu schreiben |
| `cta` | CTA mit konkreter Handlung |
| `value` | Mehrwert erhöhen |
| `emotion` | Emotionale Resonanz |
| `clarity` | Klarheit verbessern |
| `all` | Gezielte Optimierung |

#### autoImproveContent()
Automatische Verbesserungsschleife bis Ziel-Score.

```typescript
async function autoImproveContent(
  userId: string,
  content: string,
  platform: string,
  goal: string,
  targetAudience?: string,
  minScore: number = 90,      // Ziel-Score
  maxIterations: number = 5   // Max. Durchläufe
): Promise<AutoImprovementResult>
```

**Algorithmus:**
1. Analysiere aktuellen Content
2. Wenn Score ≥ minScore UND keine high-priority Issues → Stopp
3. Identifiziere schwächsten Bereich
4. Verbessere mit `improveContentWithExpert()` (erhält Scores ≥75)
5. Re-analysiere
6. Wiederhole bis Ziel erreicht oder maxIterations

---

### 5.3 Hook-Formeln

Die folgenden bewährten Hook-Formeln werden verwendet:

| Typ | Formel | Beispiel |
|-----|--------|----------|
| **Zahlen-Hook** | [Zahl] + [Konsequenz] | "87% der KMU haben keinen IT-Notfallplan" |
| **Fragen-Hook** | Provokative Frage | "Wie lange überlebt Ihr Unternehmen ohne IT?" |
| **Kontrast-Hook** | Erwartung vs. Realität | "Alle reden von KI. Realität? 90% scheitern" |
| **Story-Hook** | Konkreter Moment | "Montag, 6:47 Uhr. Der Anruf: 'Nichts geht mehr.'" |
| **Pattern-Interrupt** | Unerwartete Aussage | "Vergessen Sie alles über Backups." |

**Verboten:**
- Generische Aussagen ("X ist wichtig")
- "Heute möchte ich über..."
- Clickbait ohne Substanz

---

### 5.4 CTA-Formeln

| Typ | Formel | Beispiel |
|-----|--------|----------|
| **Ressourcen-CTA** | [Asset] + [Zeit] + [Nutzen] | "📥 IT-Checkliste (5 Min. Aufwand)" |
| **Engagement-CTA** | Einfache Frage | "Welcher Punkt? 1, 2 oder 3?" |
| **Gespräch-CTA** | Niedrigschwellig | "DM 'CHECK' für Erstanalyse" |

**Verboten:**
- "Kontaktieren Sie uns"
- "Besuchen Sie unsere Website"
- "Mehr Infos auf Anfrage"

---

### 5.5 Bildgenerierung

#### generateImage()
Generiert Bilder via DALL-E 3.

```typescript
async function generateImage(
  userId: string,
  prompt: string,
  options?: {
    size?: '1024x1024' | '1792x1024' | '1024x1792';
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
  }
): Promise<GeneratedImage>
```

---

## 6. Theme Selection Engine

**Datei:** `server/src/services/themeSelectionEngine.ts`

### 6.1 Übersicht

Die Theme Selection Engine wählt strategisch das optimale Thema VOR der Content-Generierung basierend auf:
- Platform (LinkedIn, Instagram)
- Geschäftsziel (Lead, Branding, Engagement, Traffic)
- Customer Journey Stage (Awareness, Consideration, Decision)
- Zielgruppe

### 6.2 Themen-Kategorien

```typescript
type ThemeCategory =
  | 'PAIN_POINTS'    // Schmerzpunkte (Emotion: Frustration)
  | 'RISKS'          // Risiken (Emotion: Fear)
  | 'COST_ROI'       // Kosten & ROI (Emotion: Rationality)
  | 'AUTHORITY'      // Expertise (Emotion: Trust)
  | 'EFFICIENCY'     // Effizienz (Emotion: Hope)
  | 'HUMAN_REALITY'; // Menschliche Realität (Emotion: Recognition)
```

#### PAIN_POINTS - Schmerzpunkte
- **Emotion:** Frustration
- **Mechanismus:** Erkennung des aktuellen Leidens
- **Subtopics:** daily_firefighting, overloaded_internal_it, inefficient_processes, unreliable_systems, shadow_it, knowledge_silos
- **Psychologischer Trigger:** "Ich bin nicht allein"

#### RISKS - Risiken
- **Emotion:** Fear (Angst)
- **Mechanismus:** Konsequenz-Visualisierung
- **Subtopics:** security_breach, data_loss, compliance_violation, business_interruption, reputation_damage, personal_liability
- **Psychologischer Trigger:** Loss Aversion (Verlust > Gewinn)

#### COST_ROI - Kosten & ROI
- **Emotion:** Rationality
- **Mechanismus:** Logische Rechtfertigung
- **Subtopics:** hidden_costs, reactive_vs_preventive, license_waste, productivity_loss, opportunity_cost, tco_visibility
- **Psychologischer Trigger:** Rationale Argumente für emotionale Entscheidung

#### AUTHORITY - Expertise
- **Emotion:** Trust (Vertrauen)
- **Mechanismus:** Expertise-Demonstration
- **Subtopics:** best_practices, myth_busting, industry_insights, technical_education, trend_analysis, opinion_pieces
- **Psychologischer Trigger:** Unsicherheit reduzieren durch Kompetenz

#### EFFICIENCY - Effizienz
- **Emotion:** Hope (Hoffnung)
- **Mechanismus:** Vision einer besseren Zukunft
- **Subtopics:** automation, standardization, proactive_monitoring, predictable_it, scalability, self_service
- **Psychologischer Trigger:** Transformations-Wunsch

#### HUMAN_REALITY - Menschliche Realität
- **Emotion:** Recognition (Wiedererkennung)
- **Mechanismus:** Storytelling & Identifikation
- **Subtopics:** ceo_dilemma, decision_pressure, team_dynamics, real_incidents, transformation_journey, honest_mistakes
- **Psychologischer Trigger:** Emotionale Verbindung

---

### 6.3 Audience Profiles

```typescript
type AudienceType = 'ceo' | 'it_dm' | 'sme_owner' | 'generic';
```

#### CEO / C-Level
- **Labels:** CEO, Geschäftsführer, Vorstand, C-Level
- **Content-Regeln:**
  - Vermeiden: Technischer Jargon, Feature-Listen
  - Bevorzugen: Executive Summary, Business Impact, Zahlen
  - Hook-Stil: Business-Outcome fokussiert
  - CTA-Stil: Beratungsgespräch oder Assessment

#### IT-Entscheider
- **Labels:** IT-Leiter, CTO, IT-Manager
- **Content-Regeln:**
  - Vermeiden: Übervereinfachung, Sales-Sprache
  - Bevorzugen: Technische Tiefe, Praktische Beispiele
  - Hook-Stil: Technisches Problem fokussiert
  - CTA-Stil: Whitepaper, Demo

#### KMU-Inhaber
- **Labels:** Inhaber, Selbstständiger, Mittelstand
- **Content-Regeln:**
  - Vermeiden: Enterprise-Komplexität, lange Texte
  - Bevorzugen: Einfache Sprache, Quick Wins
  - Hook-Stil: Relatable Problem aus dem Alltag
  - CTA-Stil: Einfacher nächster Schritt

---

### 6.4 Hauptfunktionen

#### selectTheme()

```typescript
function selectTheme(input: ThemeSelectionInput): ThemeSelectionOutput
```

**Input:**
```typescript
interface ThemeSelectionInput {
  platform: 'linkedin' | 'instagram';
  goal: 'lead' | 'branding' | 'engagement' | 'traffic';
  journeyStage?: 'awareness' | 'consideration' | 'decision';
  targetAudience: string;
  previousThemes?: ThemeCategory[];  // Vermeidung von Wiederholung
  topicHint?: string;                // Optionaler Themen-Hinweis
}
```

**Output:**
```typescript
interface ThemeSelectionOutput {
  selectedTheme: {
    category: ThemeCategory;
    subtopic: string;
    angle: string;
  };
  priorityScore: number;  // 0-100
  reasoning: {
    platformReason: string;
    goalReason: string;
    journeyReason: string;
    audienceReason: string;
    summary: string;
  };
  alternatives: {
    category: ThemeCategory;
    score: number;
    whyNot: string;
  }[];
  contentDirectives: {
    hookStyle: string;
    ctaStyle: string;
    avoidTopics: string[];
    emphasize: string[];
    toneGuidance: string;
  };
}
```

#### getThemePromptSection()

Generiert einen Prompt-Abschnitt für die AI:

```typescript
function getThemePromptSection(themeOutput: ThemeSelectionOutput): string
```

**Beispiel-Output:**
```
THEMA-VORGABE (STRATEGISCH AUSGEWÄHLT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kategorie: Risiken (RISKS)
Unterthema: Sicherheitsvorfall
Beschreibung: Hackerangriff, Ransomware, Datenleck
Winkel: Was ein Cyberangriff Ihr Unternehmen wirklich kostet

Emotionaler Trigger: fear
Mechanismus: Fear of loss > desire for gain (loss aversion)

WARUM DIESES THEMA:
RISKS optimal für Lead-Generierung bei CEOs in der Awareness-Phase...

CONTENT-RICHTLINIEN:
━━━━━━━━━━━━━━━━━━━━
Hook-Stil: Business-Outcome fokussiert, direkt auf den Punkt
CTA-Stil: Beratungsgespräch oder Assessment anbieten
Tonalität: Sachlich, souverän, nicht alarmistisch

BETONEN:
- Executive Summary
- Business Impact
- Peer-Vergleiche

VERMEIDEN:
- Technischer Jargon
- Feature-Listen
```

---

## 7. Content-Erstellung Workflow

### 7.1 Wizard-Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 1: User Input                                          │
│  ├── Topic: "IT-Sicherheit für KMU"                            │
│  ├── Platform: "linkedin"                                       │
│  ├── Goal: "leads"                                              │
│  └── Target Audience: "Geschäftsführer"                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 2: Theme Selection                                     │
│  POST /wizard/select-theme                                      │
│                                                                  │
│  ├── Analyse von Goal + Audience + Journey Stage               │
│  ├── Auswahl: RISKS / security_breach                          │
│  ├── Content Directives generieren                              │
│  └── Alternativen mit Scores                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 3: Content Generation                                  │
│  POST /wizard/generate                                          │
│                                                                  │
│  ├── Theme Prompt Section einfügen                              │
│  ├── Hook-Formeln bereitstellen                                 │
│  ├── CTA-Formeln bereitstellen                                  │
│  ├── Self-Critique Loop (bis Score ≥ 75)                       │
│  └── Output: Post + Hashtags + Image Prompt                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 4: Content Analysis                                    │
│  POST /wizard/analyze                                           │
│                                                                  │
│  ├── Platform Fit Score                                         │
│  ├── Viral Potential Score                                      │
│  ├── CTA Effectiveness Score                                    │
│  ├── Overall Score                                              │
│  └── Improvement Suggestions                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 5: Auto-Improvement (optional)                         │
│  POST /wizard/auto-improve                                      │
│                                                                  │
│  ├── Ziel: 90% Score                                            │
│  ├── Max 5 Iterationen                                          │
│  ├── Erhält Bereiche mit Score ≥ 75                            │
│  ├── Fokussiert schwächsten Bereich                            │
│  └── Output: Verbesserter Content + Iteration History          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 6: Image Generation (optional)                         │
│  POST /wizard/generate-image                                    │
│                                                                  │
│  └── DALL-E 3 Bildgenerierung                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SCHRITT 7: Save & Schedule                                     │
│  POST /posts                                                    │
│                                                                  │
│  └── Als Draft oder Scheduled speichern                        │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Quality Check Kriterien

**Für Posts:**
```
1. HOOK (30%):
   - Nutzt bewährte Formel?
   - Konkret und spezifisch?
   - Generisch = max. 30/100

2. WERT (25%):
   - Echter Mehrwert?
   - Praxisnahe Tipps?

3. ROTER FADEN (20%):
   - Logischer Flow Hook → Hauptteil → CTA?

4. CTA (25%):
   - Konkrete Handlung?
   - Niedrigschwellig?
   - "Kontaktieren Sie uns" = 0 Punkte
```

---

## 8. Datenmodelle

### Posts

```sql
CREATE TABLE social_media_posts (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  content TEXT NOT NULL,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  hashtags TEXT[],
  image_url TEXT,
  image_prompt TEXT,
  engagement_stats JSONB,
  is_evergreen BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Templates

```sql
CREATE TABLE social_media_templates (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  platform VARCHAR(50),
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Queue Settings

```sql
CREATE TABLE social_media_queue_settings (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  posting_times JSONB,
  timezone VARCHAR(50) DEFAULT 'Europe/Vienna',
  auto_publish BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 9. Konfiguration

### AI-Konfiguration

Die AI-Konfiguration wird pro User gespeichert:

```typescript
interface AIConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  // OpenAI: 'gpt-4', 'gpt-4-turbo'
  // Anthropic: 'claude-3-opus', 'claude-3-sonnet'
}
```

### Auto-Improve Defaults

```typescript
const AUTO_IMPROVE_DEFAULTS = {
  minScore: 90,        // Ziel-Score (war 75)
  maxIterations: 5,    // Max Durchläufe (war 3)
  preserveThreshold: 75 // Scores ≥ 75 werden erhalten
};
```

---

## 10. Bekannte Limitierungen

### ✅ 10.1 Theme → Hook-Formel Integration (GELÖST)

**Status:** ✅ Implementiert

Die Theme Selection Engine empfiehlt jetzt spezifische Hook-Formeln basierend auf der gewählten Themen-Kategorie:

| Kategorie | Primary | Secondary | Begründung |
|-----------|---------|-----------|------------|
| PAIN_POINTS | Fragen, Story | Zahlen | Empathie und Wiedererkennung |
| RISKS | Zahlen, Pattern-Interrupt | Story | Fakten und Aufmerksamkeit |
| COST_ROI | Zahlen, Kontrast | Fragen | Zahlenbasiert, Vorher/Nachher |
| AUTHORITY | Kontrast, Pattern-Interrupt | Zahlen | Mythen-Widerlegung |
| EFFICIENCY | Kontrast, Zahlen | Story | Transformation zeigen |
| HUMAN_REALITY | Story | Fragen, Kontrast | Emotionale Identifikation |

**Implementation:**
- `THEME_HOOK_MAPPING` in `themeSelectionEngine.ts`
- `hookFormulaDetails` in `ContentDirectives`
- Automatische Einbindung in `getThemePromptSection()`

### ✅ 10.2 Theme → CTA-Formel Integration (GELÖST)

**Status:** ✅ Implementiert

Die Theme Selection Engine empfiehlt jetzt spezifische CTA-Formeln basierend auf dem Business Goal:

| Goal | Primary | Secondary | Begründung |
|------|---------|-----------|------------|
| lead | Gespräch, Ressourcen | Engagement | Konkreter nächster Schritt |
| branding | Engagement | Ressourcen | Sichtbarkeit und Interaktion |
| engagement | Engagement | Gespräch | Kommentare fördern |
| traffic | Ressourcen | Engagement | Link-Anreiz |

**Implementation:**
- `GOAL_CTA_MAPPING` in `themeSelectionEngine.ts`
- `ctaFormulaDetails` in `ContentDirectives`
- Automatische Einbindung in `getThemePromptSection()`

### ✅ 10.3 Tonalität durchgängig geprüft (GELÖST)

**Status:** ✅ Implementiert

Die `toneGuidance` wird jetzt durchgängig berücksichtigt:
- ✅ `expectedTonality` Parameter in `analyzeContentAsExpert()`
- ✅ Tonalitäts-Score in der Analyse-Response (`tonalityFit`)
- ✅ `expectedTonality` wird durch `autoImproveContent()` durchgereicht
- ✅ API-Routes aktualisiert für `/wizard/analyze` und `/wizard/auto-improve`

**Response-Struktur:**
```json
{
  "tonalityFit": {
    "score": 85,
    "expected": "Sachlich, souverän",
    "actual": "sachlich-professionell",
    "feedback": "Tonalität passt gut zur gewünschten Ausrichtung"
  }
}
```

### ✅ 10.4 Platform Character Limits (GELÖST)

**Status:** ✅ Implementiert

Character Limits werden jetzt aktiv geprüft:

| Platform | Limit |
|----------|-------|
| LinkedIn | 3.000 |
| Instagram | 2.200 |
| Twitter | 280 |
| Facebook | 63.206 |
| Threads | 500 |

**Features:**
- ✅ `PLATFORM_LIMITS` Konstante in `aiService.ts`
- ✅ Automatische Berechnung in `analyzeContentAsExpert()`
- ✅ Warnung bei Überschreitung im Analyse-Prompt
- ✅ `characterCount` in der Response

**Response-Struktur:**
```json
{
  "characterCount": {
    "current": 1850,
    "limit": 3000,
    "isWithinLimit": true
  }
}
```

### 10.5 Verbleibende Limitierungen

- **Instagram:** Keine direkte API-Integration (nur Content-Vorbereitung)
- **LinkedIn:** Keine direkte Posting-API

---

## Changelog

| Version | Datum | Änderungen |
|---------|-------|------------|
| 1.3 | Dez 2024 | **Tonalität & Character Limits** |
| - | - | `expectedTonality` in Analyse integriert |
| - | - | `tonalityFit` Score in Response |
| - | - | Platform Character Limits enforced |
| - | - | `characterCount` in Response |
| - | - | Warnungen bei Limit-Überschreitung |
| 1.2 | Dez 2024 | **Theme → Formula Integration** |
| - | - | Hook-Formeln mit Theme-Kategorien verknüpft |
| - | - | CTA-Formeln mit Business Goals verknüpft |
| - | - | `THEME_HOOK_MAPPING` implementiert |
| - | - | `GOAL_CTA_MAPPING` implementiert |
| - | - | `getThemePromptSection()` zeigt empfohlene Formeln |
| 1.1 | Dez 2024 | **Quality Improvements** |
| - | - | Hook-Formeln hinzugefügt (5 Typen) |
| - | - | CTA-Formeln hinzugefügt (3 Typen) |
| - | - | Auto-Improve Ziel auf 90% erhöht |
| - | - | Max Iterations auf 5 erhöht |
| - | - | Score-Preservation (≥75) implementiert |
| 1.0 | Dez 2024 | Initiale Dokumentation |
