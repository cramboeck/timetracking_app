# AI-Integrationen Dokumentation

> Letzte Aktualisierung: Dezember 2024

Diese Dokumentation beschreibt alle KI-Integrationen in der Anwendung, ihre Funktionsweise, APIs und Konfiguration.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Konfiguration](#konfiguration)
3. [Ticket-System KI](#ticket-system-ki)
4. [Angebots-KI](#angebots-ki)
5. [Rechnungs-KI](#rechnungs-ki)
6. [Zeiterfassung KI](#zeiterfassung-ki)
7. [Social Media Manager KI](#social-media-manager-ki)
   - [Content Generation](#content-generation)
   - [Content Wizard](#content-wizard)
   - [Theme Selection Engine](#theme-selection-engine)
   - [Auto-Improvement Loop](#auto-improvement-loop)
   - [Image Generation](#image-generation)
   - [Story Generation](#story-generation)
   - [Carousel Generation](#carousel-generation)
8. [API-Referenz](#api-referenz)

---

## Übersicht

Die Anwendung nutzt OpenAI und optional Anthropic für verschiedene KI-gestützte Funktionen:

| Bereich | Funktionen | Modell |
|---------|------------|--------|
| Tickets | Lösungsvorschläge, Kategorisierung, Antwortgenerierung | GPT-4 / GPT-3.5 |
| Angebote | Textgenerierung, Preisrecherche | GPT-4 |
| Rechnungen | Texte für Positionen | GPT-4 |
| Zeiterfassung | Beschreibungsvorschläge | GPT-3.5 |
| Social Media | Content, Bilder, Stories, Carousels | GPT-4 + DALL-E 3 |

---

## Konfiguration

### Datei: `server/src/services/aiService.ts`

### Interface: `AIConfig`

```typescript
interface AIConfig {
  id: string;
  userId: string;
  provider: 'openai' | 'anthropic';
  apiKey: string | null;
  model: string;
  enabled: boolean;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | null;
  promptTemplates: Record<string, string>;
}
```

### Funktionen

| Funktion | Beschreibung |
|----------|--------------|
| `getAIConfig(userId)` | Lädt AI-Konfiguration für User |
| `saveAIConfig(userId, config)` | Speichert AI-Konfiguration |
| `testAIConnection(userId)` | Testet API-Verbindung |

### Datenbank-Tabelle

```sql
CREATE TABLE ai_configs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider VARCHAR(20) DEFAULT 'openai',
  api_key TEXT,
  model VARCHAR(50) DEFAULT 'gpt-4',
  enabled BOOLEAN DEFAULT true,
  max_tokens INTEGER DEFAULT 2000,
  temperature DECIMAL(2,1) DEFAULT 0.7,
  system_prompt TEXT,
  prompt_templates JSONB DEFAULT '{}'
);
```

---

## Ticket-System KI

### Funktionen

#### `generateTicketSuggestion(userId, ticketContext)`

Generiert Lösungsvorschläge für Support-Tickets.

**Input:**
```typescript
interface TicketContext {
  ticketId: string;
  subject: string;
  description: string;
  category?: string;
  priority?: string;
  customerInfo?: string;
  previousMessages?: string[];
}
```

**Output:**
```typescript
interface AISuggestion {
  id: string;
  ticketId: string;
  suggestionType: 'solution' | 'response' | 'category' | 'priority';
  content: string;
  confidence: number;
  reasoning?: string;
  sources?: string[];
  createdAt: Date;
}
```

#### `getRelevantKBArticles(userId, ticketContext)`

Sucht relevante Knowledge-Base-Artikel basierend auf Ticket-Inhalt.

#### `getTicketSuggestions(ticketId)`

Lädt alle gespeicherten Vorschläge für ein Ticket.

#### `markSuggestionHelpful(suggestionId, helpful)`

Markiert Vorschlag als hilfreich (Feedback-Loop).

---

## Angebots-KI

### `generateQuoteText(userId, context)`

Generiert professionelle Angebotstexte.

**Input:**
```typescript
{
  projectTitle: string;
  projectDescription: string;
  services: string[];
  targetAudience?: string;
  tone?: 'formal' | 'friendly' | 'technical';
}
```

### `researchProductPrice(userId, productName, context)`

Recherchiert Marktpreise für Produkte/Dienstleistungen.

**Output:**
```typescript
{
  estimatedPrice: { min: number; max: number; currency: string };
  marketAnalysis: string;
  competitors: string[];
  recommendation: string;
}
```

---

## Rechnungs-KI

### `generateInvoiceTexts(userId, context)`

Generiert professionelle Rechnungstexte.

**Input:**
```typescript
interface InvoiceTextContext {
  customerName: string;
  projectName: string;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
  }>;
  notes?: string;
  language?: 'de' | 'en';
}
```

**Output:**
```typescript
interface GeneratedInvoiceTexts {
  introduction: string;
  itemDescriptions: string[];
  conclusion: string;
  paymentTerms: string;
}
```

---

## Zeiterfassung KI

### `suggestTimeEntryDescription(userId, context)`

Schlägt Beschreibungen für Zeiteinträge vor.

**Input:**
```typescript
{
  projectName: string;
  activityType: string;
  duration: number;
  previousEntries?: string[];
}
```

---

## Social Media Manager KI

Der Social Media Manager enthält die umfangreichsten KI-Integrationen.

### Content Generation

#### `generateSocialMediaContent(userId, options)`

Basis-Funktion für Social-Media-Content-Generierung.

**Input:**
```typescript
interface SocialMediaGenerationOptions {
  topic: string;
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram';
  tone: 'professional' | 'casual' | 'humorous' | 'inspirational';
  targetAudience?: string;
  includeHashtags?: boolean;
  maxLength?: number;
}
```

**Output:**
```typescript
interface GeneratedPost {
  content: string;
  hashtags: string[];
  suggestedImagePrompt?: string;
  bestPostingTime?: string;
}
```

#### `generateBatchSocialMediaContent(userId, options)`

Generiert mehrere Content-Varianten gleichzeitig.

#### `generateContentIdeas(userId, topic, platform, count)`

Generiert Content-Ideen für einen Themenbereich.

#### `generateAutopilotContent(userId, options)`

Autopilot-Modus für automatische Content-Planung.

---

### Content Wizard

Der Content Wizard ist das Herzstück der Social Media KI mit Marketing-Expertise.

#### `generateWizardContent(userId, options)`

**Input:**
```typescript
interface WizardOptions {
  topic: string;
  platform: string;
  goal: string;
  targetAudience?: string;
  journeyStage?: 'awareness' | 'consideration' | 'decision';
  brandVoice?: string;
  contentType?: 'educational' | 'promotional' | 'entertaining' | 'inspirational' | 'behind-the-scenes';
  tone?: string;
  includeImage?: boolean;
  includeHashtags?: boolean;
  contentLength?: 'short' | 'medium' | 'long';
  previousThemes?: string[];
}
```

**Output:**
```typescript
interface WizardContentGeneration {
  post: {
    content: string;
    hashtags: string[];
    callToAction: string;
  };
  alternatives: Array<{
    content: string;
    style: string;
  }>;
  imagePrompt?: {
    prompt: string;
    style: string;
    description: string;
  };
  bestPostingTime: {
    day: string;
    time: string;
    reason: string;
  };
  contentAnalysis: {
    emotionalTone: string;
    expectedEngagement: 'low' | 'medium' | 'high';
    targetAudienceMatch: number;
  };
  themeSelection?: {
    category: string;
    subtopic: string;
    angle: string;
    priorityScore: number;
    reasoning: string;
    alternatives: Array<{
      category: string;
      score: number;
      whyNot: string;
    }>;
  };
}
```

#### `analyzeContentAsExpert(userId, content, platform, goal, targetAudience)`

Marketing-Experten-Analyse für Content.

**Output:**
```typescript
interface MarketingAnalysis {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  improvements: Array<{
    area: string;
    priority: 'high' | 'medium' | 'low';
    suggestion: string;
    improvedExample?: string;
  }>;
  hookEffectiveness: {
    score: number;
    analysis: string;
    alternatives: string[];
  };
  callToActionEffectiveness: {
    score: number;
    analysis: string;
    suggestions: string[];
  };
  // ... weitere Felder
}
```

#### `improveContentWithExpert(userId, content, platform, focus, targetAudience, goal)`

Verbessert Content basierend auf Experten-Feedback.

**Output:**
```typescript
interface ContentImprovement {
  improvedContent: string;
  alternativeHooks: string[];
  ctaSuggestions: string[];
  changes: string[];
  reasoning: string;
}
```

---

### Theme Selection Engine

**Datei:** `server/src/services/themeSelectionEngine.ts`

Die Theme Selection Engine wählt strategisch das optimale Thema VOR der Content-Generierung.

#### Theme-Kategorien

| Kategorie | Emotion | Psychologischer Trigger |
|-----------|---------|------------------------|
| `PAIN_POINTS` | Frustration | "Ich fühle das jeden Tag" |
| `RISKS` | Angst | "Das könnte mir passieren" |
| `COST_ROI` | Rationalität | "Die Zahlen ergeben Sinn" |
| `AUTHORITY` | Vertrauen | "Die wissen was sie tun" |
| `EFFICIENCY` | Hoffnung | "Es gibt einen besseren Weg" |
| `HUMAN_REALITY` | Wiedererkennung | "Das ist genau meine Situation" |

#### Subtopics (Beispiele)

**PAIN_POINTS:**
- `daily_firefighting` - Tägliches Feuerlöschen
- `overloaded_internal_it` - Überlastete IT-Abteilung
- `inefficient_processes` - Ineffiziente Prozesse
- `unreliable_systems` - Unzuverlässige Systeme
- `shadow_it` - Schatten-IT
- `knowledge_silos` - Wissenssilos

**RISKS:**
- `security_breach` - Sicherheitsvorfall
- `data_loss` - Datenverlust
- `compliance_violation` - Compliance-Verstoß
- `business_interruption` - Betriebsunterbrechung
- `reputation_damage` - Reputationsschaden
- `personal_liability` - Persönliche Haftung

#### Priority Matrix

Die Engine nutzt eine Matrix aus:
- **Platform:** LinkedIn, Instagram
- **Goal:** Lead, Branding, Engagement, Traffic
- **Journey Stage:** Awareness, Consideration, Decision

**Beispiel LinkedIn + Lead + Decision:**
1. RISKS (Dringlichkeit erzeugen)
2. COST_ROI (Rational überzeugen)
3. PAIN_POINTS (Erinnerung an Leid)
4. AUTHORITY (Vertrauen für Entscheidung)

#### Audience Profiles

| Profil | Gewichtung | Fokus |
|--------|------------|-------|
| CEO | RISKS +50%, COST_ROI +30% | Business Impact, Haftung |
| IT-DM | EFFICIENCY +50%, AUTHORITY +40% | Technische Tiefe |
| SME Owner | PAIN_POINTS +50%, COST_ROI +40% | Pragmatisch, Budget |

#### `selectTheme(input)`

**Input:**
```typescript
interface ThemeSelectionInput {
  platform: 'linkedin' | 'instagram';
  goal: 'lead' | 'branding' | 'engagement' | 'traffic';
  journeyStage?: 'awareness' | 'consideration' | 'decision';
  targetAudience: string;
  previousThemes?: ThemeCategory[];
  topicHint?: string;
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
  priorityScore: number;
  reasoning: {
    platformReason: string;
    goalReason: string;
    journeyReason: string;
    audienceReason: string;
    summary: string;
  };
  alternatives: Array<{
    category: ThemeCategory;
    score: number;
    whyNot: string;
  }>;
  contentDirectives: {
    hookStyle: string;
    ctaStyle: string;
    avoidTopics: string[];
    emphasize: string[];
    toneGuidance: string;
  };
}
```

#### `getThemePromptSection(themeOutput)`

Generiert den Theme-Abschnitt für den AI-Prompt.

---

### Auto-Improvement Loop

#### `autoImproveContent(userId, content, platform, goal, targetAudience, minScore, maxIterations)`

Iterative Selbstverbesserung bis Ziel-Score erreicht.

**Algorithmus:**
```
1. Analysiere Content → Score
2. WHILE Score < minScore AND Iterations < maxIterations:
   a. Finde höchste Priorität Schwäche
   b. Verbessere mit Fokus auf diese Schwäche
   c. Re-Analysiere → Neuer Score
   d. Iteration++
3. Return finaler Content + History
```

**Output:**
```typescript
interface AutoImprovementResult {
  finalContent: string;
  finalScore: number;
  initialScore: number;
  iterations: Array<{
    iteration: number;
    focus: string;
    beforeScore: number;
    afterScore: number;
    changes: string[];
  }>;
  alternativeHooks: string[];
  ctaSuggestions: string[];
  totalImprovementTime: number;
}
```

---

### Image Generation

#### `generateImage(userId, options)`

Generiert Bilder mit DALL-E 3.

**Input:**
```typescript
interface ImageGenerationOptions {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}
```

**Output:**
```typescript
interface GeneratedImage {
  url: string;
  revisedPrompt: string;
  createdAt: Date;
}
```

#### `generateImagePromptSuggestions(userId, content, platform)`

Generiert optimierte Bild-Prompts für Content.

---

### Story Generation

#### `generateStoryContent(userId, options)`

Generiert Instagram/Facebook Stories.

**Input:**
```typescript
interface StoryGenerationOptions {
  topic: string;
  platform: 'instagram' | 'facebook';
  storyType: 'promotional' | 'behind-the-scenes' | 'tutorial' | 'announcement' | 'engagement';
  slides: number;
  brandVoice?: string;
  callToAction?: string;
}
```

**Output:**
```typescript
interface GeneratedStory {
  slides: Array<{
    text: string;
    visualDescription: string;
    duration: number;
    hasInteraction: boolean;
    interactionType?: 'poll' | 'quiz' | 'slider' | 'question';
    interactionData?: any;
  }>;
  hashtags: string[];
  mentions: string[];
  musicSuggestion?: string;
}
```

---

### Carousel Generation

#### `generateCarouselContent(userId, options)`

Generiert LinkedIn/Instagram Carousels.

**Input:**
```typescript
interface CarouselOptions {
  topic: string;
  platform: 'instagram' | 'linkedin';
  slideCount: number;
  style: 'educational' | 'storytelling' | 'listicle' | 'how-to' | 'tips' | 'myth-busting';
  tone: 'professional' | 'casual' | 'inspirational' | 'bold';
  targetAudience?: string;
  includeEmojis?: boolean;
  brandColors?: { primary: string; secondary: string };
}
```

**Output:**
```typescript
interface CarouselContent {
  title: string;
  topic: string;
  platform: 'instagram' | 'linkedin';
  slides: Array<{
    slideNumber: number;
    type: 'hook' | 'content' | 'tip' | 'example' | 'cta';
    headline: string;
    body: string;
    bulletPoints?: string[];
    emoji?: string;
    designNote?: string;
  }>;
  hashtags: string[];
  caption: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  designTips: string[];
  canvaInstructions: string;
  totalSlides: number;
}
```

#### `generateCarouselSlideImages(userId, carousel)`

Generiert Bilder für alle Carousel-Slides.

---

## API-Referenz

### Social Media Routes

| Method | Route | Beschreibung |
|--------|-------|--------------|
| GET | `/api/social-media/wizard/theme-categories` | Alle Theme-Kategorien |
| POST | `/api/social-media/wizard/select-theme` | Theme-Auswahl |
| POST | `/api/social-media/wizard/generate` | Content generieren |
| POST | `/api/social-media/wizard/analyze` | Content analysieren |
| POST | `/api/social-media/wizard/improve` | Content verbessern |
| POST | `/api/social-media/wizard/auto-improve` | Auto-Verbesserung |
| POST | `/api/social-media/wizard/generate-image` | Bild generieren |
| POST | `/api/social-media/generate` | Basis-Generierung |
| POST | `/api/social-media/batch-generate` | Batch-Generierung |
| POST | `/api/social-media/ideas` | Ideen generieren |
| POST | `/api/social-media/stories/generate` | Story generieren |
| POST | `/api/social-media/carousels/generate` | Carousel generieren |

### Request/Response Beispiele

#### Theme Selection

**Request:**
```json
POST /api/social-media/wizard/select-theme
{
  "platform": "linkedin",
  "goal": "lead",
  "journeyStage": "decision",
  "targetAudience": "IT-Entscheider in KMU"
}
```

**Response:**
```json
{
  "selectedTheme": {
    "category": "RISKS",
    "subtopic": "personal_liability",
    "angle": "Warum Geschäftsführerhaftung bei IT-Versäumnissen Chefsache ist"
  },
  "priorityScore": 127,
  "reasoning": {
    "summary": "Für LINKEDIN + LEAD + DECISION bei Zielgruppe 'IT-Entscheider in KMU' ist Risiken (RISKS) optimal. Emotionaler Trigger: fear. Prospect ist bereit zu handeln. Risiken erzeugen Dringlichkeit."
  },
  "alternatives": [
    { "category": "COST_ROI", "score": 98, "whyNot": "..." },
    { "category": "PAIN_POINTS", "score": 85, "whyNot": "..." }
  ],
  "contentDirectives": {
    "hookStyle": "Business-Outcome fokussiert, direkt auf den Punkt",
    "ctaStyle": "Beratungsgespräch oder Assessment anbieten",
    "toneGuidance": "Professionell, sachlich, thought leadership. Strategisch, ergebnisorientiert."
  }
}
```

---

## Architektur-Diagramm

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                      │
│  SocialMediaManager.tsx                                             │
│  ├── Content Wizard UI                                              │
│  ├── Theme Preview                                                  │
│  ├── Auto-Improve Progress                                          │
│  └── Analysis Display                                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API ROUTES                                    │
│  server/src/routes/social-media.ts                                  │
│  ├── /wizard/select-theme    → themeSelectionEngine.selectTheme()  │
│  ├── /wizard/generate        → aiService.generateWizardContent()   │
│  ├── /wizard/analyze         → aiService.analyzeContentAsExpert()  │
│  ├── /wizard/improve         → aiService.improveContentWithExpert()│
│  └── /wizard/auto-improve    → aiService.autoImproveContent()      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AI SERVICES                                   │
│                                                                      │
│  ┌─────────────────────────┐    ┌─────────────────────────────────┐│
│  │ themeSelectionEngine.ts │    │ aiService.ts                    ││
│  │                         │    │                                 ││
│  │ • selectTheme()         │───▶│ • generateWizardContent()       ││
│  │ • THEME_CATEGORIES      │    │ • analyzeContentAsExpert()      ││
│  │ • PRIORITY_MATRIX       │    │ • improveContentWithExpert()    ││
│  │ • AUDIENCE_PROFILES     │    │ • autoImproveContent()          ││
│  └─────────────────────────┘    │ • generateImage()               ││
│                                 │ • generateStoryContent()        ││
│                                 │ • generateCarouselContent()     ││
│                                 └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        OPENAI API                                    │
│  • GPT-4 / GPT-4-Turbo (Text)                                       │
│  • DALL-E 3 (Images)                                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Content Generation Flow

```
User Input
    │
    ▼
┌────────────────────────────┐
│ 1. THEME SELECTION ENGINE  │
│    selectTheme()           │
│    • Plattform-Analyse     │
│    • Goal-Mapping          │
│    • Audience-Profiling    │
│    • Journey-Stage         │
│    → Optimales Theme       │
└────────────────────────────┘
    │
    ▼
┌────────────────────────────┐
│ 2. CONTENT GENERATION      │
│    generateWizardContent() │
│    • Theme-Prompt inject   │
│    • Marketing-System-     │
│      Prompt                │
│    • Self-Critique Loop    │
│    → Draft Content         │
└────────────────────────────┘
    │
    ▼
┌────────────────────────────┐
│ 3. EXPERT ANALYSIS         │
│    analyzeContentAsExpert()│
│    • Score (0-100)         │
│    • Strengths/Weaknesses  │
│    • Hook-Analyse          │
│    • CTA-Analyse           │
│    → Detailed Feedback     │
└────────────────────────────┘
    │
    ▼
┌────────────────────────────┐
│ 4. AUTO-IMPROVEMENT LOOP   │
│    autoImproveContent()    │
│    WHILE score < 75:       │
│      • Find weakness       │
│      • Improve focused     │
│      • Re-analyze          │
│    → Optimized Content     │
└────────────────────────────┘
    │
    ▼
Final Content (Score ≥ 75)
```

---

## Konfigurationsoptionen

### Umgebungsvariablen

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7
```

### Pro-User Konfiguration (DB)

Jeder User kann eigene API-Keys und Einstellungen speichern:
- Provider (OpenAI/Anthropic)
- Modell
- Max Tokens
- Temperature
- Custom System Prompts

---

## Fehlerbehandlung

Alle AI-Funktionen:
1. Prüfen ob AI-Config existiert
2. Validieren Input-Parameter
3. Catch OpenAI-Fehler (Rate Limits, Token Limits)
4. Fallback auf Defaults bei Parse-Fehlern
5. Logging aller Fehler

```typescript
try {
  const result = await aiFunction(userId, options);
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Retry nach Delay
  }
  if (error.code === 'context_length_exceeded') {
    // Kürzeren Input verwenden
  }
  throw new Error('AI-Service nicht verfügbar');
}
```

---

## Kosten-Monitoring

| Funktion | Geschätzte Tokens | Kosten (GPT-4) |
|----------|-------------------|----------------|
| Theme Selection | 0 (lokal) | $0 |
| Content Generation | ~2000 | ~$0.06 |
| Analysis | ~1500 | ~$0.045 |
| Improvement | ~1500 | ~$0.045 |
| Auto-Improve (3x) | ~4500 | ~$0.135 |
| Image (DALL-E 3) | - | ~$0.04 |

**Gesamtkosten pro vollständigem Wizard-Durchlauf:** ~$0.30-0.50

---

## Zukünftige Erweiterungen

### Geplant
- [ ] Theme-Rotation Tracking (previousThemes persistent speichern)
- [ ] Conversion-Feedback Loop (welche Themes performen)
- [ ] A/B Testing für Theme-Varianten
- [ ] Saisonale/Trending Theme-Modifikation
- [ ] Multi-Language Support

### Ideen
- Competitor-Analyse Integration
- User-spezifische Theme-Präferenzen lernen
- Performance-Metriken pro Theme-Kategorie
- Automatisches Theme-Balancing über Zeit

---

## Changelog

### Dezember 2024
- **Theme Selection Engine** implementiert
  - 6 Theme-Kategorien mit Subtopics
  - Priority Matrix (24 Kombinationen)
  - 3 Audience Profiles
  - Integration in Content Generation

- **Auto-Improvement Loop** implementiert
  - Iterative Verbesserung bis Score ≥ 75
  - Tracking aller Iterationen
  - Alternative Hooks/CTAs

- **Marketing-Experten System-Prompts**
  - Dynamisch basierend auf Zielgruppe
  - Plattform-spezifische Tipps
  - B2B/IT-Fokus

---

*Dokumentation erstellt für: RamboFlow Social Media Manager*
