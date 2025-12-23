import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import {
  selectTheme,
  getThemePromptSection,
  ThemeSelectionOutput,
  Platform,
  BusinessGoal,
  JourneyStage
} from './themeSelectionEngine';

// ============================================
// Types
// ============================================

export interface AIConfig {
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

// Default system prompts for different assistant types
export const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  default: 'Du bist ein hilfreicher IT-Support-Assistent, der Technikern bei der Lösung von Problemen hilft. Antworte immer auf Deutsch.',
  solution: 'Du bist ein erfahrener IT-Support-Spezialist. Analysiere Support-Tickets und schlage konkrete, praxiserprobte Lösungsschritte vor. Antworte immer auf Deutsch.',
  category: 'Du bist ein IT-Ticket-Klassifizierer. Analysiere Tickets und ordne sie der passendsten Kategorie zu. Antworte nur mit dem Kategorienamen, ohne weitere Erklärung.',
  priority: 'Du bist ein IT-Support-Experte für Priorisierung. Bewerte die Dringlichkeit von Tickets basierend auf Geschäftsauswirkungen und technischer Komplexität. Antworte auf Deutsch.',
  response: 'Du bist ein freundlicher IT-Support-Mitarbeiter. Verfasse professionelle, kundenfreundliche Antworten auf Support-Anfragen. Antworte immer auf Deutsch.',
};

export interface TicketContext {
  ticketId: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string | null;
  priority: string;
  customerName: string | null;
  deviceName: string | null;
  previousComments: Array<{
    content: string;
    isInternal: boolean;
    createdAt: Date;
  }>;
}

export interface KnowledgeBaseArticle {
  id: string;
  title: string;
  content: string;
  categoryName: string;
}

export interface AISuggestion {
  id: string;
  ticketId: string;
  suggestionType: 'solution' | 'category' | 'priority' | 'response';
  content: string;
  confidence: number | null;
  modelUsed: string;
  tokensUsed: number | null;
  createdAt: Date;
}

// ============================================
// Configuration Management
// ============================================

export async function getAIConfig(userId: string): Promise<AIConfig | null> {
  const result = await query(
    `SELECT id, user_id, provider, api_key, model, enabled, max_tokens, temperature, system_prompt, prompt_templates
     FROM ai_config WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    apiKey: row.api_key,
    model: row.model,
    enabled: row.enabled,
    maxTokens: row.max_tokens,
    temperature: parseFloat(row.temperature),
    systemPrompt: row.system_prompt,
    promptTemplates: row.prompt_templates || {},
  };
}

export async function saveAIConfig(
  userId: string,
  config: Partial<AIConfig>
): Promise<AIConfig> {
  const existing = await getAIConfig(userId);

  if (existing) {
    const result = await query(
      `UPDATE ai_config SET
        provider = COALESCE($2, provider),
        api_key = COALESCE($3, api_key),
        model = COALESCE($4, model),
        enabled = COALESCE($5, enabled),
        max_tokens = COALESCE($6, max_tokens),
        temperature = COALESCE($7, temperature),
        system_prompt = COALESCE($8, system_prompt),
        prompt_templates = COALESCE($9, prompt_templates),
        updated_at = NOW()
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        config.provider,
        config.apiKey,
        config.model,
        config.enabled,
        config.maxTokens,
        config.temperature,
        config.systemPrompt,
        config.promptTemplates ? JSON.stringify(config.promptTemplates) : null,
      ]
    );
    return mapConfigRow(result.rows[0]);
  } else {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO ai_config (id, user_id, provider, api_key, model, enabled, max_tokens, temperature, system_prompt, prompt_templates)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        userId,
        config.provider || 'openai',
        config.apiKey || null,
        config.model || 'gpt-4o-mini',
        config.enabled ?? false,
        config.maxTokens || 1000,
        config.temperature || 0.7,
        config.systemPrompt || null,
        config.promptTemplates ? JSON.stringify(config.promptTemplates) : '{}',
      ]
    );
    return mapConfigRow(result.rows[0]);
  }
}

function mapConfigRow(row: any): AIConfig {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    apiKey: row.api_key,
    model: row.model,
    enabled: row.enabled,
    maxTokens: row.max_tokens,
    temperature: parseFloat(row.temperature),
    systemPrompt: row.system_prompt,
    promptTemplates: row.prompt_templates || {},
  };
}

// ============================================
// Context Gathering
// ============================================

export async function getTicketContext(
  userId: string,
  ticketId: string
): Promise<TicketContext | null> {
  // Get ticket details
  const ticketResult = await query(
    `SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.priority,
            c.name as customer_name, d.system_name as device_name
     FROM tickets t
     LEFT JOIN customers c ON t.customer_id = c.id
     LEFT JOIN ninjarmm_devices d ON t.device_id = d.id
     WHERE t.id = $1 AND t.user_id = $2`,
    [ticketId, userId]
  );

  if (ticketResult.rows.length === 0) return null;

  const ticket = ticketResult.rows[0];

  // Get previous comments
  const commentsResult = await query(
    `SELECT content, is_internal, created_at
     FROM ticket_comments
     WHERE ticket_id = $1
     ORDER BY created_at ASC
     LIMIT 10`,
    [ticketId]
  );

  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    title: ticket.title,
    description: ticket.description || '',
    category: ticket.category,
    priority: ticket.priority,
    customerName: ticket.customer_name,
    deviceName: ticket.device_name,
    previousComments: commentsResult.rows.map((r) => ({
      content: r.content,
      isInternal: r.is_internal,
      createdAt: r.created_at,
    })),
  };
}

export async function getRelevantKBArticles(
  userId: string,
  searchTerms: string[]
): Promise<KnowledgeBaseArticle[]> {
  // Simple keyword search in knowledge base
  const searchPattern = searchTerms
    .filter((t) => t.length > 2)
    .map((t) => `%${t.toLowerCase()}%`)
    .slice(0, 5); // Limit to 5 terms

  if (searchPattern.length === 0) return [];

  // Build dynamic query with multiple LIKE conditions
  const conditions = searchPattern.map((_, i) => `(LOWER(a.title) LIKE $${i + 2} OR LOWER(a.content) LIKE $${i + 2})`);

  const result = await query(
    `SELECT a.id, a.title, a.content, c.name as category_name
     FROM kb_articles a
     LEFT JOIN kb_categories c ON a.category_id = c.id
     WHERE a.user_id = $1 AND a.is_published = true
       AND (${conditions.join(' OR ')})
     ORDER BY a.view_count DESC
     LIMIT 5`,
    [userId, ...searchPattern]
  );

  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    categoryName: r.category_name || 'Allgemein',
  }));
}

// ============================================
// Prompt Building
// ============================================

function buildSolutionPrompt(
  context: TicketContext,
  kbArticles: KnowledgeBaseArticle[]
): string {
  let prompt = `Du bist ein erfahrener IT-Support-Spezialist. Analysiere das folgende Support-Ticket und schlage konkrete Lösungsschritte vor.

## Ticket-Informationen
- **Ticket-Nr:** ${context.ticketNumber}
- **Titel:** ${context.title}
- **Priorität:** ${context.priority}
${context.category ? `- **Kategorie:** ${context.category}` : ''}
${context.customerName ? `- **Kunde:** ${context.customerName}` : ''}
${context.deviceName ? `- **Gerät:** ${context.deviceName}` : ''}

## Problembeschreibung
${context.description || 'Keine Beschreibung vorhanden.'}
`;

  if (context.previousComments.length > 0) {
    prompt += `\n## Bisherige Kommunikation\n`;
    context.previousComments.forEach((comment, i) => {
      prompt += `**Kommentar ${i + 1}:** ${comment.content}\n`;
    });
  }

  if (kbArticles.length > 0) {
    prompt += `\n## Relevante Wissensdatenbank-Artikel\n`;
    kbArticles.forEach((article) => {
      prompt += `### ${article.title} (${article.categoryName})\n${article.content.substring(0, 500)}...\n\n`;
    });
  }

  prompt += `
## Aufgabe
Basierend auf den obigen Informationen:
1. Analysiere das Problem kurz
2. Schlage 2-3 konkrete Lösungsschritte vor
3. Wenn relevant, verweise auf passende KB-Artikel
4. Gib Tipps zur Vermeidung ähnlicher Probleme

Antworte auf Deutsch und strukturiert. Halte die Antwort prägnant aber hilfreich.`;

  return prompt;
}

function buildCategoryPrompt(
  context: TicketContext,
  categories: string[]
): string {
  return `Analysiere das folgende Support-Ticket und ordne es der passendsten Kategorie zu.

## Ticket-Informationen
- **Titel:** ${context.title}
- **Beschreibung:** ${context.description || 'Keine Beschreibung vorhanden.'}
${context.deviceName ? `- **Gerät:** ${context.deviceName}` : ''}

## Verfügbare Kategorien
${categories.map(c => `- ${c}`).join('\n')}

## Aufgabe
Wähle die passendste Kategorie aus der Liste. Antworte NUR mit dem Kategorienamen, ohne weitere Erklärung.`;
}

function buildPriorityPrompt(
  context: TicketContext
): string {
  return `Analysiere das folgende Support-Ticket und bewerte die Priorität.

## Ticket-Informationen
- **Titel:** ${context.title}
- **Beschreibung:** ${context.description || 'Keine Beschreibung vorhanden.'}
${context.customerName ? `- **Kunde:** ${context.customerName}` : ''}
${context.deviceName ? `- **Gerät:** ${context.deviceName}` : ''}
${context.category ? `- **Kategorie:** ${context.category}` : ''}

## Prioritätsstufen
- **critical**: Systemausfall, Geschäftsstopp, Sicherheitsvorfall
- **high**: Wichtige Funktion beeinträchtigt, viele Nutzer betroffen
- **medium**: Normale Störung, Workaround möglich
- **low**: Kosmetisches Problem, Frage, Verbesserungsvorschlag

## Aufgabe
Bewerte die Priorität und begründe kurz (1-2 Sätze) deine Einschätzung.

Format deiner Antwort:
**Priorität:** [critical/high/medium/low]
**Begründung:** [Kurze Begründung]`;
}

function buildResponsePrompt(
  context: TicketContext,
  responseType: 'initial' | 'followup' | 'resolution' = 'initial'
): string {
  const responseTypeText = {
    initial: 'eine erste Antwort auf die Kundenanfrage',
    followup: 'eine Folge-Nachricht mit Status-Update',
    resolution: 'eine Abschlussnachricht mit Lösung',
  };

  let prompt = `Verfasse ${responseTypeText[responseType]} für das folgende Support-Ticket.

## Ticket-Informationen
- **Titel:** ${context.title}
- **Beschreibung:** ${context.description || 'Keine Beschreibung vorhanden.'}
${context.customerName ? `- **Kunde:** ${context.customerName}` : ''}
${context.priority ? `- **Priorität:** ${context.priority}` : ''}
`;

  if (context.previousComments.length > 0) {
    prompt += `\n## Bisherige Kommunikation\n`;
    context.previousComments.slice(-3).forEach((comment, i) => {
      prompt += `**Nachricht ${i + 1}:** ${comment.content}\n`;
    });
  }

  prompt += `
## Aufgabe
Verfasse eine professionelle, freundliche Antwort:
- Sprich den Kunden direkt an
- Sei konkret und hilfreich
- Vermeide technischen Jargon wo möglich
- Halte die Antwort prägnant

Antworte auf Deutsch.`;

  return prompt;
}

// Helper to get available categories for a user
async function getAvailableCategories(userId: string): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT category FROM tickets WHERE user_id = $1 AND category IS NOT NULL ORDER BY category`,
    [userId]
  );
  const categories = result.rows.map(r => r.category);
  // Add default categories if none exist
  if (categories.length === 0) {
    return ['Hardware', 'Software', 'Netzwerk', 'E-Mail', 'Drucker', 'Sicherheit', 'Sonstiges'];
  }
  return categories;
}

// ============================================
// AI API Calls
// ============================================

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPTS.default
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPTS.default
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json() as { error?: { message?: string } };
    throw new Error(`Anthropic API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json() as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return {
    content: data.content?.[0]?.text || '',
    tokensUsed: inputTokens + outputTokens,
  };
}

// ============================================
// Main Suggestion Generation
// ============================================

export async function generateTicketSuggestion(
  userId: string,
  ticketId: string,
  suggestionType: 'solution' | 'category' | 'priority' | 'response' = 'solution'
): Promise<AISuggestion | null> {
  // Get AI config
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  // Get ticket context
  const context = await getTicketContext(userId, ticketId);
  if (!context) {
    throw new Error('Ticket nicht gefunden');
  }

  // Extract keywords for KB search (only for solution type)
  const keywords = [
    ...context.title.split(' '),
    ...(context.description?.split(' ') || []),
    context.category,
  ].filter(Boolean) as string[];

  // Get KB articles upfront for solution suggestions
  let kbArticles: KnowledgeBaseArticle[] = [];
  if (suggestionType === 'solution') {
    kbArticles = await getRelevantKBArticles(userId, keywords);
  }

  // Build prompt based on suggestion type
  let prompt: string;
  let systemPrompt: string;

  switch (suggestionType) {
    case 'solution':
      prompt = buildSolutionPrompt(context, kbArticles);
      // Use custom prompt from templates, or config system prompt, or default
      systemPrompt = config.promptTemplates?.solution || config.systemPrompt || DEFAULT_SYSTEM_PROMPTS.solution;
      break;
    case 'category':
      const categories = await getAvailableCategories(userId);
      prompt = buildCategoryPrompt(context, categories);
      systemPrompt = config.promptTemplates?.category || DEFAULT_SYSTEM_PROMPTS.category;
      break;
    case 'priority':
      prompt = buildPriorityPrompt(context);
      systemPrompt = config.promptTemplates?.priority || DEFAULT_SYSTEM_PROMPTS.priority;
      break;
    case 'response':
      prompt = buildResponsePrompt(context, 'initial');
      systemPrompt = config.promptTemplates?.response || DEFAULT_SYSTEM_PROMPTS.response;
      break;
    default:
      kbArticles = await getRelevantKBArticles(userId, keywords);
      prompt = buildSolutionPrompt(context, kbArticles);
      systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPTS.default;
  }

  // Call AI API
  let result: { content: string; tokensUsed: number };
  try {
    if (config.provider === 'anthropic') {
      result = await callAnthropic(
        config.apiKey,
        config.model,
        prompt,
        config.maxTokens,
        config.temperature,
        systemPrompt
      );
    } else {
      result = await callOpenAI(
        config.apiKey,
        config.model,
        prompt,
        config.maxTokens,
        config.temperature,
        systemPrompt
      );
    }
  } catch (error: any) {
    console.error('AI API call failed:', error);
    throw new Error(`KI-Anfrage fehlgeschlagen: ${error.message}`);
  }

  // Store suggestion in database
  const suggestionId = uuidv4();
  const contextUsed = {
    ticketNumber: context.ticketNumber,
    suggestionType,
    ...(kbArticles.length > 0 && { kbArticlesUsed: kbArticles.map((a) => a.title) }),
  };

  await query(
    `INSERT INTO ticket_ai_suggestions
     (id, ticket_id, user_id, suggestion_type, content, context_used, model_used, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      suggestionId,
      ticketId,
      userId,
      suggestionType,
      result.content,
      JSON.stringify(contextUsed),
      config.model,
      result.tokensUsed,
    ]
  );

  return {
    id: suggestionId,
    ticketId,
    suggestionType,
    content: result.content,
    confidence: null,
    modelUsed: config.model,
    tokensUsed: result.tokensUsed,
    createdAt: new Date(),
  };
}

// ============================================
// Suggestion History
// ============================================

export async function getTicketSuggestions(
  userId: string,
  ticketId: string
): Promise<AISuggestion[]> {
  const result = await query(
    `SELECT id, ticket_id, suggestion_type, content, confidence, model_used, tokens_used, is_helpful, applied, created_at
     FROM ticket_ai_suggestions
     WHERE ticket_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 10`,
    [ticketId, userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    suggestionType: r.suggestion_type,
    content: r.content,
    confidence: r.confidence ? parseFloat(r.confidence) : null,
    modelUsed: r.model_used,
    tokensUsed: r.tokens_used,
    createdAt: r.created_at,
  }));
}

export async function markSuggestionHelpful(
  userId: string,
  suggestionId: string,
  isHelpful: boolean
): Promise<void> {
  await query(
    `UPDATE ticket_ai_suggestions SET is_helpful = $3
     WHERE id = $1 AND user_id = $2`,
    [suggestionId, userId, isHelpful]
  );
}

export async function markSuggestionApplied(
  userId: string,
  suggestionId: string
): Promise<void> {
  await query(
    `UPDATE ticket_ai_suggestions SET applied = true
     WHERE id = $1 AND user_id = $2`,
    [suggestionId, userId]
  );
}

// ============================================
// Test Connection
// ============================================

export async function testAIConnection(
  provider: 'openai' | 'anthropic',
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: errorData.error?.message || 'Ungültiger API-Key' };
      }
      return { success: true };
    } else {
      // Anthropic doesn't have a simple test endpoint, so we do a minimal request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: errorData.error?.message || 'Ungültiger API-Key' };
      }
      return { success: true };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return { success: false, error: errorMessage };
  }
}

// ============================================
// Quote AI Generation
// ============================================

const QUOTE_SYSTEM_PROMPTS = {
  head: `Du bist ein professioneller IT-Dienstleister, der Angebote für Kunden schreibt.
Erstelle einen professionellen, freundlichen Einleitungstext für ein Angebot.
Der Text soll:
- Persönlich und professionell sein
- Bezug auf die Anfrage/das Gespräch nehmen
- Die angebotenen Leistungen kurz einleiten
- In deutscher Sprache sein
- KEINE Anrede enthalten (diese wird separat hinzugefügt)
- Maximal 3-4 Sätze lang sein`,

  foot: `Du bist ein professioneller IT-Dienstleister, der Angebote für Kunden schreibt.
Erstelle einen professionellen Schlusstext für ein Angebot.
Der Text soll:
- Freundlich und einladend sein
- Zur Kontaktaufnahme bei Fragen ermutigen
- Mit freundlichen Grüßen abschließen
- In deutscher Sprache sein
- Maximal 4-5 Sätze lang sein`,

  priceResearch: `Du bist ein IT-Experte und Einkaufsberater für IT-Produkte und Dienstleistungen.
Deine Aufgabe ist es, aktuelle Marktpreise zu recherchieren und Preisempfehlungen zu geben.
Gib immer:
1. Eine Einschätzung des aktuellen Marktpreises (Einkauf/B2B)
2. Eine empfohlene Preisspanne für den Verkauf
3. Typische Margen im IT-Bereich (15-40% je nach Produkt)
4. Wichtige Faktoren, die den Preis beeinflussen
Antworte auf Deutsch und strukturiert.`,
};

export async function generateQuoteText(
  userId: string,
  type: 'head' | 'foot',
  context: {
    customerName?: string;
    header?: string;
    positions?: Array<{ name: string; price: number }>;
  }
): Promise<string> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const systemPrompt = QUOTE_SYSTEM_PROMPTS[type];

  let prompt = '';
  if (type === 'head') {
    prompt = `Erstelle einen Einleitungstext für ein Angebot.
Kunde: ${context.customerName || 'Kunde'}
Betreff: ${context.header || 'IT-Dienstleistungen'}
${context.positions?.length ? `Positionen: ${context.positions.map(p => p.name).join(', ')}` : ''}`;
  } else {
    prompt = `Erstelle einen Schlusstext für ein Angebot.
Kunde: ${context.customerName || 'Kunde'}
Betreff: ${context.header || 'IT-Dienstleistungen'}
${context.positions?.length ? `Gesamtwert: ${context.positions.reduce((sum, p) => sum + p.price, 0).toFixed(2)} EUR` : ''}`;
  }

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      systemPrompt
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      systemPrompt
    );
  }

  return result.content;
}

export async function researchProductPrice(
  userId: string,
  productName: string,
  context?: string
): Promise<{
  result: string;
  suggestedPrice?: number;
  marketRange?: { min: number; max: number };
}> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const prompt = `Recherchiere den aktuellen Marktpreis für:
Produkt/Dienstleistung: ${productName}
${context ? `Kontext: ${context}` : ''}

Gib mir:
1. Geschätzter Einkaufspreis (B2B/Händler)
2. Empfohlener Verkaufspreis für IT-Dienstleister
3. Übliche Marge
4. Preisfaktoren

Formatiere die Preise klar mit EUR.`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      QUOTE_SYSTEM_PROMPTS.priceResearch
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      QUOTE_SYSTEM_PROMPTS.priceResearch
    );
  }

  // Try to extract suggested price from response
  let suggestedPrice: number | undefined;
  let marketRange: { min: number; max: number } | undefined;

  // Simple regex to find prices in EUR
  const priceMatches = result.content.match(/(\d+(?:[.,]\d+)?)\s*(?:€|EUR)/gi);
  if (priceMatches && priceMatches.length >= 2) {
    const prices = priceMatches.map(m => parseFloat(m.replace(/[^\d.,]/g, '').replace(',', '.')));
    const validPrices = prices.filter(p => !isNaN(p) && p > 0);
    if (validPrices.length >= 2) {
      marketRange = {
        min: Math.min(...validPrices),
        max: Math.max(...validPrices),
      };
      // Suggest the higher price as selling price
      suggestedPrice = marketRange.max;
    }
  }

  return {
    result: result.content,
    suggestedPrice,
    marketRange,
  };
}

// ============================================
// Knowledge Base AI Generation
// ============================================

const KB_ARTICLE_SYSTEM_PROMPT = `Du bist ein technischer Redakteur, der Wissensdatenbank-Artikel aus Support-Tickets erstellt.
Deine Aufgabe ist es, aus einem gelösten Support-Ticket einen hilfreichen KB-Artikel zu generieren.
Der Artikel soll:
- Das Problem klar und verständlich beschreiben
- Die Lösung Schritt für Schritt erklären
- Für andere Benutzer mit ähnlichen Problemen nützlich sein
- In professionellem, aber verständlichem Deutsch geschrieben sein
- Markdown-Formatierung verwenden (# Überschriften, - Listen, **fett**, etc.)`;

export interface GeneratedKBArticle {
  title: string;
  content: string;
  excerpt: string;
  suggestedCategory?: string;
}

export async function generateKBArticleFromTicket(
  userId: string,
  ticketId: string
): Promise<GeneratedKBArticle> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  // Get ticket context
  const context = await getTicketContext(userId, ticketId);
  if (!context) {
    throw new Error('Ticket nicht gefunden');
  }

  // Get ticket resolution
  const ticketResult = await query(
    `SELECT resolution, closed_at, status FROM tickets WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );

  if (ticketResult.rows.length === 0) {
    throw new Error('Ticket nicht gefunden');
  }

  const ticket = ticketResult.rows[0];

  // Get available KB categories for suggestion
  const categoriesResult = await query(
    `SELECT name FROM kb_categories WHERE user_id = $1 AND is_public = true ORDER BY name`,
    [userId]
  );
  const availableCategories = categoriesResult.rows.map(r => r.name);

  const prompt = `Erstelle einen Wissensdatenbank-Artikel aus folgendem Support-Ticket:

## Ticket-Informationen
- **Titel:** ${context.title}
- **Kategorie:** ${context.category || 'Nicht kategorisiert'}
- **Status:** ${ticket.status}
${context.customerName ? `- **Kunde:** ${context.customerName}` : ''}
${context.deviceName ? `- **Gerät:** ${context.deviceName}` : ''}

## Problembeschreibung
${context.description || 'Keine Beschreibung vorhanden.'}

## Lösung
${ticket.resolution || 'Keine Lösung dokumentiert.'}

${context.previousComments.length > 0 ? `## Kommunikationsverlauf
${context.previousComments.map((c, i) => `${i + 1}. ${c.content}`).join('\n')}` : ''}

${availableCategories.length > 0 ? `## Verfügbare KB-Kategorien
${availableCategories.join(', ')}` : ''}

## Aufgabe
Erstelle einen KB-Artikel mit:
1. **Titel**: Ein klarer, suchfreundlicher Titel für das Problem
2. **Kurzfassung**: Eine 1-2 Satz Zusammenfassung des Problems und der Lösung
3. **Inhalt**: Ein strukturierter Artikel mit:
   - Problembeschreibung
   - Ursache (wenn bekannt)
   - Lösungsschritte
   - Tipps zur Vermeidung
4. **Kategorie**: Eine passende Kategorie aus der Liste oben (falls vorhanden)

Formatiere deine Antwort EXAKT so:
---TITEL---
[Titel hier]
---KURZFASSUNG---
[Kurzfassung hier]
---INHALT---
[Markdown-Inhalt hier]
---KATEGORIE---
[Kategoriename oder "Allgemein"]`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      2000, // Longer response for article
      config.temperature,
      KB_ARTICLE_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      2000,
      config.temperature,
      KB_ARTICLE_SYSTEM_PROMPT
    );
  }

  // Parse the response
  const response = result.content;

  const titleMatch = response.match(/---TITEL---\s*([\s\S]*?)(?=---KURZFASSUNG---|$)/);
  const excerptMatch = response.match(/---KURZFASSUNG---\s*([\s\S]*?)(?=---INHALT---|$)/);
  const contentMatch = response.match(/---INHALT---\s*([\s\S]*?)(?=---KATEGORIE---|$)/);
  const categoryMatch = response.match(/---KATEGORIE---\s*([\s\S]*?)$/);

  return {
    title: titleMatch ? titleMatch[1].trim() : context.title,
    excerpt: excerptMatch ? excerptMatch[1].trim() : '',
    content: contentMatch ? contentMatch[1].trim() : response,
    suggestedCategory: categoryMatch ? categoryMatch[1].trim() : undefined,
  };
}

// ============================================
// Time Entry AI Generation
// ============================================

const TIME_ENTRY_SYSTEM_PROMPT = `Du bist ein IT-Support-Mitarbeiter, der Zeiteinträge für seine Arbeit dokumentiert.
Erstelle eine kurze, präzise Beschreibung für einen Zeiteintrag basierend auf dem Kontext.
Die Beschreibung soll:
- Professionell und sachlich sein
- Die durchgeführte Tätigkeit klar beschreiben
- Maximal 1-2 Sätze lang sein
- Auf Deutsch sein
- Für eine Rechnung geeignet sein
- Keine Anreden oder Floskeln enthalten`;

export async function suggestTimeEntryDescription(
  userId: string,
  context: {
    projectName?: string;
    customerName?: string;
    activityName?: string;
    ticketTitle?: string;
    ticketDescription?: string;
    existingDescription?: string;
  }
): Promise<string> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  let prompt = 'Erstelle eine Beschreibung für einen Zeiteintrag mit folgenden Informationen:\n\n';

  if (context.customerName) {
    prompt += `Kunde: ${context.customerName}\n`;
  }
  if (context.projectName) {
    prompt += `Projekt: ${context.projectName}\n`;
  }
  if (context.activityName) {
    prompt += `Tätigkeit: ${context.activityName}\n`;
  }
  if (context.ticketTitle) {
    prompt += `Ticket: ${context.ticketTitle}\n`;
    if (context.ticketDescription) {
      prompt += `Ticket-Beschreibung: ${context.ticketDescription.substring(0, 500)}\n`;
    }
  }
  if (context.existingDescription) {
    prompt += `\nBereits eingetragene Beschreibung (erweitern/verbessern): ${context.existingDescription}\n`;
  }

  prompt += '\nGib nur die Beschreibung zurück, ohne Erklärungen.';

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      200, // Short response
      config.temperature,
      TIME_ENTRY_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      200,
      config.temperature,
      TIME_ENTRY_SYSTEM_PROMPT
    );
  }

  return result.content.trim();
}

// ============================================
// Invoice Text Generation with AI
// ============================================

const INVOICE_SYSTEM_PROMPT = `Du bist ein erfahrener Rechnungsschreiber für einen IT-Dienstleister.
Deine Aufgabe ist es, professionelle, klare und freundliche Rechnungstexte zu erstellen.
Die Texte sollen:
- Professionell und geschäftsmäßig klingen
- Den Stil bisheriger Rechnungen an diesen Kunden beibehalten
- Klar und präzise sein
- Auf Deutsch verfasst sein
- Keine übertriebenen Floskeln enthalten
- Die erbrachten Leistungen angemessen beschreiben`;

export interface InvoiceTextContext {
  customerName: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  entries: Array<{
    description: string;
    hours: number;
    projectName?: string;
  }>;
  previousInvoices?: Array<{
    header: string;
    headText: string;
    footText: string;
    positions: Array<{ name: string }>;
  }>;
}

export interface GeneratedInvoiceTexts {
  header: string;
  headText: string;
  footText: string;
  positionTexts: string[];
}

export async function generateInvoiceTexts(
  userId: string,
  context: InvoiceTextContext
): Promise<GeneratedInvoiceTexts> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  // Build context from previous invoices
  let previousInvoiceContext = '';
  if (context.previousInvoices && context.previousInvoices.length > 0) {
    previousInvoiceContext = `\n\nBISHERIGE RECHNUNGEN AN DIESEN KUNDEN (Stil beibehalten/verbessern):
${context.previousInvoices.slice(0, 5).map((inv, i) => `
Rechnung ${i + 1}:
- Betreff: ${inv.header}
- Einleitungstext: ${inv.headText || '(keiner)'}
- Schlusstext: ${inv.footText || '(keiner)'}
- Positionen: ${inv.positions.slice(0, 5).map(p => p.name).join('; ')}`).join('\n')}`;
  }

  // Build entries summary
  const entriesSummary = context.entries.slice(0, 20).map(e =>
    `- ${e.description}${e.projectName ? ` (${e.projectName})` : ''}: ${e.hours.toFixed(2)}h`
  ).join('\n');

  const prompt = `Erstelle Rechnungstexte für folgende Situation:

KUNDE: ${context.customerName}
ZEITRAUM: ${context.periodStart} bis ${context.periodEnd}
GESAMTSTUNDEN: ${context.totalHours.toFixed(2)} Stunden

ERBRACHTE LEISTUNGEN:
${entriesSummary}
${context.entries.length > 20 ? `... und ${context.entries.length - 20} weitere Einträge` : ''}
${previousInvoiceContext}

Erstelle folgende Texte im JSON-Format:
{
  "header": "Kurzer Betreff für die Rechnung (z.B. 'IT-Dienstleistungen November 2024')",
  "headText": "Einleitungstext der Rechnung (1-2 Sätze)",
  "footText": "Schlusstext mit Dank (1 Satz)",
  "positionTexts": ["Verbesserter Text für Position 1", "Text für Position 2", ...]
}

Gib NUR das JSON zurück, ohne Erklärungen oder Markdown-Formatierung.`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      INVOICE_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      INVOICE_SYSTEM_PROMPT
    );
  }

  // Parse the JSON response
  try {
    // Remove potential markdown code blocks
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      header: parsed.header || `Leistungen ${context.periodStart} - ${context.periodEnd}`,
      headText: parsed.headText || '',
      footText: parsed.footText || 'Vielen Dank für Ihr Vertrauen.',
      positionTexts: parsed.positionTexts || [],
    };
  } catch (error) {
    console.error('Failed to parse AI invoice response:', error, result.content);
    // Return defaults if parsing fails
    return {
      header: `IT-Dienstleistungen ${context.periodStart} - ${context.periodEnd}`,
      headText: `Abrechnung der erbrachten Leistungen für den Zeitraum ${context.periodStart} bis ${context.periodEnd}.`,
      footText: 'Vielen Dank für Ihr Vertrauen.',
      positionTexts: [],
    };
  }
}

// ============================================
// Social Media Content Generation - Expert System
// ============================================

/**
 * Expert-level system prompt with viral content strategies and engagement psychology
 */
const SOCIAL_MEDIA_SYSTEM_PROMPT = `Du bist ein Elite Social Media Stratege mit 15+ Jahren Erfahrung bei Top-Agenturen.
Du hast hunderte virale Kampagnen erstellt und verstehst die Psychologie hinter Engagement auf molekularer Ebene.

DEINE KERN-EXPERTISE:

1. HOOK-MASTERY (Die ersten 3 Sekunden/Zeilen entscheiden ALLES)
   - Pattern Interrupt: Erwartungen brechen, Aufmerksamkeit erzwingen
   - Curiosity Gap: Neugier wecken ohne alles zu verraten
   - Bold Statement: Kontroverse oder überraschende Aussage
   - Question Hook: Fragen die zum Nachdenken zwingen
   - Number Hook: Spezifische Zahlen sind magnetisch

2. ENGAGEMENT-PSYCHOLOGIE
   - Reciprocity: Erst Wert geben, dann nehmen
   - Social Proof: "Tausende nutzen bereits..."
   - Scarcity: Dringlichkeit und Exklusivität
   - Authority: Expertise demonstrieren
   - Liking: Authentisch und nahbar sein
   - FOMO: Fear of Missing Out aktivieren

3. CONTENT-STRUKTUREN DIE FUNKTIONIEREN
   - AIDA: Attention → Interest → Desire → Action
   - PAS: Problem → Agitation → Solution
   - BAB: Before → After → Bridge
   - 4U: Useful, Urgent, Unique, Ultra-specific

4. PLATTFORM-ALGORITHMUS-OPTIMIERUNG
   - LinkedIn: Dwell Time maximieren, native Content, keine externen Links im Post
   - Instagram: Saves & Shares > Likes, Carousel > Single Image
   - Twitter/X: Threads performen besser, Engagement in ersten 30 Min kritisch
   - Facebook: Kommentare triggern, Gruppen-Mindset

Du schreibst IMMER auf Deutsch und lieferst nur den fertigen Post ohne Erklärungen.`;

/**
 * Platform-specific viral strategies and best practices
 */
const PLATFORM_EXPERT_GUIDELINES: Record<string, string> = {
  linkedin: `LINKEDIN MASTERY:
- HOOK: Erste Zeile MUSS stoppen (Bold Statement, Kontroverse, oder überraschende Statistik)
- FORMAT: Kurze Absätze (1-2 Sätze), Leerzeilen, Lesbarkeit ist König
- LÄNGE: 1200-1900 Zeichen performen am besten (lange Posts = mehr Dwell Time = Algorithmus-Boost)
- STORYTELLING: Persönliche Erfahrungen + Business-Learnings = Gold
- CTA: Frage am Ende die Diskussion startet ("Was denkt ihr?" funktioniert)
- HASHTAGS: 3-5 relevante am ENDE des Posts, nicht im Text
- EMOJIS: Sparsam (max 3-4), strategisch für Struktur
- TIMING: Dienstag-Donnerstag, 7-8 Uhr oder 17-18 Uhr
- GEHEIMTIPP: "I" (Ich) Posts performen 2x besser als "We" Posts
- VERMEIDEN: Externe Links (zerstören Reichweite), zu viele Hashtags`,

  twitter: `TWITTER/X MASTERY:
- HOOK: Erste 10 Worte entscheiden ob gescrollt wird
- FORMAT: 280 Zeichen clever nutzen, Threads für längeren Content
- THREADS: Tweet 1 muss standalone viral sein, dann "Thread 🧵" anteasern
- CONTROVERSY: Meinung polarisiert = Engagement (aber authentisch bleiben)
- RATIO: 80% Value-Content, 20% Promo
- HASHTAGS: Max 2-3, integriert im Text, nicht als Block
- MEDIEN: Tweets mit Bildern bekommen 150% mehr Retweets
- TIMING: Peaks um 9h, 12h und 17h
- GEHEIMTIPP: Replys zu großen Accounts = kostenlose Reichweite
- VERMEIDEN: Hashtag-Spam, zu viele @Mentions`,

  facebook: `FACEBOOK MASTERY:
- HOOK: Emotional und relatable, "Feeling"-Posts performen
- FORMAT: Storytelling, persönliche Geschichten, Community-Focus
- LÄNGE: 40-80 Wörter optimal, kann aber länger für Stories
- INTERAKTION: Fragen stellen, Meinungen einfordern, Polls nutzen
- GRUPPEN-DENKE: "Wir" und "Gemeinsam" resoniert
- VIDEO: Native Videos bekommen 10x mehr Reach als Links
- EMOJIS: Erlaubt und erwünscht, machen Posts menschlicher
- TIMING: Mittags (12-14h) und Abends (19-21h)
- GEHEIMTIPP: Persönliche Updates > Business-Content
- VERMEIDEN: Clickbait, zu sales-lastig`,

  instagram: `INSTAGRAM MASTERY:
- HOOK: Erste Zeile im Feed sichtbar - MUSS catchen
- FORMAT: Carousels bekommen 3x mehr Engagement als Single Posts
- CAPTION: Storytelling + Value + CTA, kann lang sein (Leute lesen!)
- HASHTAGS: 5-15 relevante, Mix aus groß (1M+), mittel (100K-1M), nisch (<100K)
- HASHTAG-PLACEMENT: Im ersten Kommentar ODER nach ... (versteckt)
- SAVES: Wichtigste Metrik! "Speicher dir das" funktioniert
- REELS: 7-15 Sekunden optimal, Hook in ersten 0.5 Sekunden
- EMOJIS: Teil der Kultur, strategisch für Lesbarkeit
- TIMING: 11-13h und 19-21h, Mittwoch-Freitag
- GEHEIMTIPP: Frag nach Saves ("Speicher für später")
- VERMEIDEN: Broken Hashtags, zu generische Tags`,

  all: `UNIVERSAL POST (Multi-Platform):
- HOOK: Muss auf allen Plattformen funktionieren
- LÄNGE: 150-200 Zeichen (Tweet-kompatibel, trotzdem Substanz)
- FORMAT: Klar, prägnant, ohne plattform-spezifische Features
- HASHTAGS: 2-3 universelle
- TON: Professionell aber menschlich
- CTA: Optional, subtil`
};

/**
 * Tone-specific writing guidelines with psychological triggers
 */
const TONE_EXPERT_GUIDELINES: Record<string, string> = {
  professional: `PROFESSIONELLER TON:
- Expertise demonstrieren ohne arrogant zu wirken
- Daten und Fakten wo möglich
- Branchenbegriffe nutzen (zeigt Insider-Wissen)
- Struktur und Klarheit priorisieren
- Autorität durch Substanz, nicht durch Titel
- "Ich habe gelernt..." statt "Man sollte..."`,

  casual: `LOCKERER TON:
- Schreib wie du mit einem Freund sprechen würdest
- Umgangssprache okay (aber professionell bleiben)
- Persönliche Anekdoten und Erfahrungen
- Humor wenn es passt (nicht erzwungen)
- "Du" statt "Sie", direkte Ansprache
- Authentizität > Perfektion`,

  humorous: `HUMORVOLLER TON:
- Selbstironie funktioniert immer
- Übertreibungen für Effekt
- Unerwartete Wendungen und Punchlines
- Relatables Humor (Alltags-Struggles)
- Memes und Pop-Culture-Referenzen wenn passend
- ABER: Nie auf Kosten anderer, inklusiv bleiben`,

  informative: `INFORMATIVER TON:
- Klare Struktur: Problem → Lösung → Takeaway
- Bullet Points für Übersichtlichkeit
- Konkrete Beispiele und Zahlen
- "How-To" Format funktioniert immer
- Takeaway am Ende (was soll der Leser TUN?)
- "Save this for later" - Trigger für Speichern`
};

export interface SocialMediaGenerationOptions {
  topic: string;
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
  tone: 'professional' | 'casual' | 'humorous' | 'informative';
  includeHashtags: boolean;
  includeEmoji: boolean;
  customerContext?: string;
  contentCategory?: string;
}

export interface GeneratedPost {
  content: string;
  hashtags: string[];
  platform: string;
  characterCount: number;
}

export async function generateSocialMediaContent(
  userId: string,
  options: SocialMediaGenerationOptions
): Promise<GeneratedPost> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const prompt = `ERSTELLE EINEN VIRALEN SOCIAL MEDIA POST:

═══════════════════════════════════════
THEMA: ${options.topic}
${options.customerContext ? `KONTEXT: ${options.customerContext}` : ''}
${options.contentCategory ? `KATEGORIE: ${options.contentCategory}` : ''}
═══════════════════════════════════════

${PLATFORM_EXPERT_GUIDELINES[options.platform]}

═══════════════════════════════════════
${TONE_EXPERT_GUIDELINES[options.tone]}
═══════════════════════════════════════

DEINE AUFGABE:
1. Starte mit einem MAGNETISCHEN HOOK (Pattern Interrupt!)
2. Liefere echten VALUE (nicht nur Floskeln)
3. Nutze eine bewährte Struktur (AIDA, PAS, oder BAB)
4. ${options.includeEmoji ? 'Setze Emojis STRATEGISCH ein (für Struktur und Emotion)' : 'KEINE Emojis verwenden'}
5. ${options.includeHashtags ? 'Füge optimierte Hashtags hinzu (nach Platform-Regeln)' : 'KEINE Hashtags'}
6. Ende mit einem CTA der Engagement triggert

QUALITÄTSKRITERIEN:
✓ Würde ICH bei diesem Post stoppen?
✓ Liefert er echten Mehrwert?
✓ Hat er einen klaren Takeaway?
✓ Triggert er Engagement (Kommentar, Save, Share)?

LIEFERE NUR DEN FERTIGEN POST-TEXT. Keine Erklärungen.`;

  // Self-critique loop: Generate, analyze, improve until quality threshold met
  const MIN_QUALITY_SCORE = 75;
  const MAX_ATTEMPTS = 3;

  let bestPost = '';
  let bestScore = 0;
  let attempts: Array<{ content: string; score: number; feedback: string[] }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Post generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    // Add previous feedback to prompt if this isn't the first attempt
    let currentPrompt = prompt;
    if (attempt > 1 && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      currentPrompt = `${prompt}

═══════════════════════════════════════
⚠️ KRITISCHES FEEDBACK ZUM VORHERIGEN VERSUCH (Score: ${lastAttempt.score}/100):
${lastAttempt.feedback.map(f => `- ${f}`).join('\n')}

VORHERIGER TEXT (NICHT WIEDERHOLEN, KOMPLETT NEU SCHREIBEN):
"""${lastAttempt.content.substring(0, 200)}..."""

DU MUSST DIESE PROBLEME BEHEBEN! Schreibe einen KOMPLETT NEUEN, BESSEREN Post.
═══════════════════════════════════════`;
    }

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(
        config.apiKey,
        config.model,
        currentPrompt,
        config.maxTokens,
        attempt === 1 ? config.temperature : Math.min(config.temperature + 0.1, 1.0), // Slightly higher creativity on retries
        SOCIAL_MEDIA_SYSTEM_PROMPT
      );
    } else {
      result = await callOpenAI(
        config.apiKey,
        config.model,
        currentPrompt,
        config.maxTokens,
        attempt === 1 ? config.temperature : Math.min(config.temperature + 0.1, 1.0),
        SOCIAL_MEDIA_SYSTEM_PROMPT
      );
    }

    const generatedContent = result.content.trim();

    // Quick internal quality check
    const qualityCheck = await quickQualityCheck(
      config.apiKey,
      config.provider,
      config.model,
      generatedContent,
      options.platform
    );

    console.log(`Attempt ${attempt} score: ${qualityCheck.score}/100`);

    attempts.push({
      content: generatedContent,
      score: qualityCheck.score,
      feedback: qualityCheck.issues
    });

    // Track best post
    if (qualityCheck.score > bestScore) {
      bestScore = qualityCheck.score;
      bestPost = generatedContent;
    }

    // If quality threshold met, we're done
    if (qualityCheck.score >= MIN_QUALITY_SCORE) {
      console.log(`Quality threshold met on attempt ${attempt}!`);
      break;
    }

    // If this is the last attempt and still below threshold, use the best one we have
    if (attempt === MAX_ATTEMPTS) {
      console.log(`Max attempts reached. Using best post (score: ${bestScore})`);
    }
  }

  // Extract hashtags from best post
  const hashtagRegex = /#[\wäöüÄÖÜß]+/g;
  const extractedHashtags = (bestPost.match(hashtagRegex) || []) as string[];

  return {
    content: bestPost,
    hashtags: extractedHashtags,
    platform: options.platform,
    characterCount: bestPost.length,
    qualityScore: bestScore,
    attempts: attempts.length
  } as GeneratedPost & { qualityScore: number; attempts: number };
}

/**
 * Quick internal quality check for self-critique loop
 * Returns a score and list of issues to fix
 */
async function quickQualityCheck(
  apiKey: string,
  provider: string,
  model: string,
  content: string,
  platform: string
): Promise<{ score: number; issues: string[] }> {
  const prompt = `Bewerte diesen ${platform.toUpperCase()} Post SCHNELL und KRITISCH (0-100 Score).

POST:
"""
${content}
"""

BEWERTUNGSKRITERIEN:
1. HOOK (25%): Stoppt er den Scroll? Erste Zeile magnetisch?
2. WERT (25%): Echter Mehrwert oder leere Worte?
3. AUTHENTIZITÄT (25%): Klingt es echt oder wie Corporate-Blabla?
4. CTA (25%): Klarer, motivierender Call-to-Action?

SEI STRENG! Die meisten Posts sind mittelmäßig (50-70).
Ein Score über 75 bedeutet: "Das würde ICH liken/teilen"
Ein Score über 85 bedeutet: "Das hat virales Potenzial"

Antworte NUR in diesem JSON-Format:
{
  "score": 65,
  "issues": ["Problem 1 das behoben werden muss", "Problem 2", "Problem 3"]
}

Wenn der Post GUT ist, gib ein leeres issues-Array zurück.
Maximal 3 Issues nennen, die WICHTIGSTEN zuerst.`;

  try {
    let result: { content: string; tokensUsed: number };
    if (provider === 'anthropic') {
      result = await callAnthropic(apiKey, model, prompt, 500, 0.3, 'Du bist ein strenger Social Media Kritiker.');
    } else {
      result = await callOpenAI(apiKey, model, prompt, 500, 0.3, 'Du bist ein strenger Social Media Kritiker.');
    }

    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { score: number; issues: string[] };
    return {
      score: Math.min(100, Math.max(0, parsed.score)),
      issues: parsed.issues || []
    };
  } catch (error) {
    console.error('Quality check failed, assuming pass:', error);
    // If quality check fails, assume it's okay to avoid infinite loops
    return { score: 75, issues: [] };
  }
}

/**
 * Universal content quality checker for different content types
 */
type ContentType = 'post' | 'story' | 'carousel' | 'idea' | 'response';

interface QualityCheckConfig {
  contentType: ContentType;
  platform: string;
  minScore?: number;
  customCriteria?: string;
}

async function universalQualityCheck(
  apiKey: string,
  provider: string,
  model: string,
  content: string,
  config: QualityCheckConfig
): Promise<{ score: number; issues: string[] }> {
  const criteriaByType: Record<ContentType, string> = {
    post: `1. HOOK (25%): Stoppt er den Scroll? Erste Zeile magnetisch?
2. WERT (25%): Echter Mehrwert oder leere Worte?
3. AUTHENTIZITÄT (25%): Klingt es echt oder wie Corporate-Blabla?
4. CTA (25%): Klarer, motivierender Call-to-Action?`,
    story: `1. VISUAL IMPACT (30%): Ist das Konzept visuell stark?
2. HOOK (25%): Fängt es in 1 Sekunde die Aufmerksamkeit?
3. MESSAGE (25%): Klare, prägnante Botschaft?
4. ENGAGEMENT (20%): Regt es zu Interaktion an?`,
    carousel: `1. HOOK-SLIDE (25%): Ist Slide 1 ein echter Stopper?
2. FLOW (25%): Logischer, spannender Aufbau über alle Slides?
3. VALUE (25%): Lernt der Leser etwas Konkretes?
4. CTA (25%): Starker Abschluss mit klarer Handlungsaufforderung?`,
    idea: `1. ORIGINALITÄT (30%): Ist die Idee frisch und nicht abgedroschen?
2. RELEVANZ (30%): Passt sie zur Zielgruppe?
3. UMSETZBARKEIT (20%): Kann man daraus guten Content machen?
4. POTENZIAL (20%): Hat die Idee Engagement-Potenzial?`,
    response: `1. RELEVANZ (30%): Beantwortet es die Frage/den Kommentar?
2. TON (30%): Passend zur Marke und Situation?
3. MEHRWERT (20%): Bietet es zusätzlichen Wert?
4. ENGAGEMENT (20%): Fördert es weitere Interaktion?`
  };

  const prompt = `Bewerte diesen ${config.platform.toUpperCase()} ${config.contentType.toUpperCase()} SCHNELL und KRITISCH (0-100 Score).

CONTENT:
"""
${typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
"""

BEWERTUNGSKRITERIEN:
${config.customCriteria || criteriaByType[config.contentType]}

SEI STRENG! Die meisten Inhalte sind mittelmäßig (50-70).
Ein Score über 75 bedeutet: "Das ist gut genug zum Veröffentlichen"
Ein Score über 85 bedeutet: "Das hat virales Potenzial"

Antworte NUR in diesem JSON-Format:
{
  "score": 65,
  "issues": ["Problem 1", "Problem 2", "Problem 3"]
}

Maximal 3 Issues, die WICHTIGSTEN zuerst. Leeres Array wenn gut.`;

  try {
    let result: { content: string; tokensUsed: number };
    if (provider === 'anthropic') {
      result = await callAnthropic(apiKey, model, prompt, 500, 0.3, 'Du bist ein strenger Content-Kritiker.');
    } else {
      result = await callOpenAI(apiKey, model, prompt, 500, 0.3, 'Du bist ein strenger Content-Kritiker.');
    }

    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { score: number; issues: string[] };
    return {
      score: Math.min(100, Math.max(0, parsed.score)),
      issues: parsed.issues || []
    };
  } catch (error) {
    console.error('Universal quality check failed:', error);
    return { score: 75, issues: [] };
  }
}

/**
 * Self-critique wrapper that can be applied to any content generation
 * Generates content, checks quality, and regenerates if needed
 */
interface SelfCritiqueOptions<T> {
  generateFn: (attempt: number, previousFeedback?: string[]) => Promise<T>;
  extractContent: (result: T) => string;
  qualityConfig: QualityCheckConfig;
  apiKey: string;
  provider: string;
  model: string;
  minScore?: number;
  maxAttempts?: number;
}

async function withSelfCritique<T>(options: SelfCritiqueOptions<T>): Promise<T & { qualityScore: number; attempts: number }> {
  const MIN_SCORE = options.minScore || 75;
  const MAX_ATTEMPTS = options.maxAttempts || 3;

  let bestResult: T | null = null;
  let bestScore = 0;
  let attempts: Array<{ result: T; score: number; feedback: string[] }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Content generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    // Generate content (with previous feedback if available)
    const previousFeedback = attempt > 1 && attempts.length > 0
      ? attempts[attempts.length - 1].feedback
      : undefined;

    const result = await options.generateFn(attempt, previousFeedback);
    const content = options.extractContent(result);

    // Quality check
    const qualityCheck = await universalQualityCheck(
      options.apiKey,
      options.provider,
      options.model,
      content,
      options.qualityConfig
    );

    console.log(`Attempt ${attempt} score: ${qualityCheck.score}/100`);

    attempts.push({
      result,
      score: qualityCheck.score,
      feedback: qualityCheck.issues
    });

    // Track best
    if (qualityCheck.score > bestScore) {
      bestScore = qualityCheck.score;
      bestResult = result;
    }

    // If good enough, we're done
    if (qualityCheck.score >= MIN_SCORE) {
      console.log(`Quality threshold met on attempt ${attempt}!`);
      break;
    }
  }

  return {
    ...(bestResult as T),
    qualityScore: bestScore,
    attempts: attempts.length
  };
}

export interface BatchGenerationOptions {
  topics: string[];
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
  tone: 'professional' | 'casual' | 'humorous' | 'informative';
  includeHashtags: boolean;
  includeEmoji: boolean;
  contentCategory?: string;
  schedulingStrategy: 'spread' | 'burst' | 'custom';
  startDate?: Date;
  postsPerDay?: number;
}

export async function generateBatchSocialMediaContent(
  userId: string,
  options: BatchGenerationOptions
): Promise<GeneratedPost[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const platformGuidelines: Record<string, string> = {
    linkedin: 'LinkedIn: Professionell, bis zu 3000 Zeichen, keine übermäßigen Emojis, 3-5 relevante Hashtags am Ende',
    twitter: 'Twitter/X: Maximal 280 Zeichen, prägnant, 1-3 Hashtags integriert',
    facebook: 'Facebook: Locker aber informativ, bis zu 500 Zeichen optimal, Emojis erlaubt',
    instagram: 'Instagram: Visuell orientiert, Emojis erwünscht, bis zu 30 Hashtags möglich',
    all: 'Universell für alle Plattformen, ca. 200-280 Zeichen'
  };

  const toneGuidelines: Record<string, string> = {
    professional: 'Professioneller, seriöser Ton',
    casual: 'Lockerer, freundlicher Ton',
    humorous: 'Humorvoller, unterhaltsamer Ton',
    informative: 'Informativer, lehrreicher Ton'
  };

  const prompt = `Erstelle ${options.topics.length} verschiedene Social Media Posts auf Deutsch.

Themen (ein Post pro Thema):
${options.topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Plattform: ${platformGuidelines[options.platform]}
Ton: ${toneGuidelines[options.tone]}
${options.contentCategory ? `Content-Kategorie: ${options.contentCategory}` : ''}
${options.includeHashtags ? 'Füge passende Hashtags hinzu.' : 'Keine Hashtags.'}
${options.includeEmoji ? 'Verwende passende Emojis.' : 'Keine Emojis verwenden.'}

WICHTIG: Antworte im JSON-Format:
{
  "posts": [
    {"topic": "Thema 1", "content": "Fertiger Post-Text 1"},
    {"topic": "Thema 2", "content": "Fertiger Post-Text 2"}
  ]
}

Keine weiteren Erklärungen, nur das JSON.`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      4000, // Higher token limit for batch
      config.temperature,
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      4000,
      config.temperature,
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  }

  // Parse the JSON response
  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr) as { posts: Array<{ topic: string; content: string }> };
    const hashtagRegex = /#[\wäöüÄÖÜß]+/g;

    return parsed.posts.map(post => ({
      content: post.content,
      hashtags: (post.content.match(hashtagRegex) || []) as string[],
      platform: options.platform,
      characterCount: post.content.length
    }));
  } catch (error) {
    console.error('Failed to parse batch AI response:', error, result.content);
    throw new Error('Fehler beim Verarbeiten der KI-Antwort');
  }
}

export async function generateContentIdeas(
  userId: string,
  category: string,
  count: number = 10
): Promise<string[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const prompt = `Generiere ${count} kreative Social Media Content-Ideen für ein IT-Unternehmen.

Kategorie: ${category}

Die Ideen sollten:
- Relevant für IT-Dienstleister sein
- Verschiedene Aspekte des Themas abdecken
- Gut für Engagement geeignet sein
- Mix aus Educational, Behind-the-scenes, Tips, News

WICHTIG: Antworte im JSON-Format:
{
  "ideas": ["Idee 1", "Idee 2", "Idee 3", ...]
}

Keine weiteren Erklärungen, nur das JSON.`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      2000,
      0.8, // Higher temperature for creativity
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      2000,
      0.8,
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr) as { ideas: string[] };
    return parsed.ideas;
  } catch (error) {
    console.error('Failed to parse content ideas:', error);
    throw new Error('Fehler beim Generieren der Content-Ideen');
  }
}

// ============================================
// AUTOPILOT MODE
// ============================================

interface AutopilotOptions {
  themes: string[];
  targetAudience?: string;
  brandVoice?: string;
  platforms: string[];
  postsCount: number;
  contentMix?: { educational: number; promotional: number; behindTheScenes: number; trending: number };
  pastPosts?: string[];
}

interface AutopilotPost {
  content: string;
  hashtags: string[];
  theme: string;
  category: string;
}

export async function generateAutopilotContent(
  userId: string,
  options: AutopilotOptions
): Promise<AutopilotPost[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const contentMix = options.contentMix || { educational: 40, promotional: 20, behindTheScenes: 20, trending: 20 };
  const pastPostsContext = options.pastPosts?.length
    ? `\n\nBeispiele bisheriger Posts (lerne den Stil daraus):\n${options.pastPosts.slice(0, 5).join('\n---\n')}`
    : '';

  const prompt = `Du bist ein Social Media Manager für ein IT-Unternehmen. Generiere ${options.postsCount} einzigartige Social Media Posts.

Themen: ${options.themes.join(', ')}
Zielgruppe: ${options.targetAudience || 'Unternehmen und IT-Entscheider'}
Markenstimme: ${options.brandVoice || 'professionell, kompetent, hilfreich'}
Plattformen: ${options.platforms.join(', ')}

Content-Mix (Verteilung in %):
- Educational/Tipps: ${contentMix.educational}%
- Promotional/Services: ${contentMix.promotional}%
- Behind-the-scenes: ${contentMix.behindTheScenes}%
- Trends/News: ${contentMix.trending}%
${pastPostsContext}

Anforderungen:
- Jeder Post muss einzigartig und wertvoll sein
- Passende Hashtags integrieren (3-5 pro Post)
- Verschiedene Content-Typen gemäß Mix verteilen
- Posts müssen zur Markenstimme passen
- Auf Deutsch schreiben

WICHTIG: Antworte NUR im JSON-Format:
{
  "posts": [
    { "content": "Post-Inhalt mit #Hashtags", "theme": "Thema", "category": "educational|promotional|behindTheScenes|trending" }
  ]
}`;

  // Self-critique loop for autopilot content
  const MIN_QUALITY_SCORE = 75;
  const MAX_ATTEMPTS = 2; // Lower for batch to avoid timeout

  let bestPosts: AutopilotPost[] = [];
  let overallScore = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Autopilot generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    // Add feedback from previous attempt
    let currentPrompt = prompt;
    if (attempt > 1 && bestPosts.length > 0) {
      const lowScorePosts = bestPosts.filter((p: any) => (p.qualityScore || 0) < MIN_QUALITY_SCORE);
      if (lowScorePosts.length > 0) {
        currentPrompt = `${prompt}

═══════════════════════════════════════
⚠️ DIESE POSTS WAREN ZU SCHWACH (regeneriere bessere):
${lowScorePosts.map((p, i) => `${i + 1}. "${p.content.substring(0, 50)}..." - Zu generisch/langweilig`).join('\n')}

MACH ES BESSER! Jeder Post braucht:
- Einen HOOK der stoppt
- Echten Mehrwert (nicht nur Phrasen)
- Persönlichkeit (nicht wie eine Maschine)
═══════════════════════════════════════`;
      }
    }

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(config.apiKey, config.model, currentPrompt, 6000, 0.7 + (attempt * 0.1), SOCIAL_MEDIA_SYSTEM_PROMPT);
    } else {
      result = await callOpenAI(config.apiKey, config.model, currentPrompt, 6000, 0.7 + (attempt * 0.1), SOCIAL_MEDIA_SYSTEM_PROMPT);
    }

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

      const parsed = JSON.parse(jsonStr) as { posts: Array<{ content: string; theme: string; category: string }> };
      const hashtagRegex = /#[\wäöüÄÖÜß]+/g;

      // Quality check each post
      const postsWithScores: AutopilotPost[] = [];
      let totalScore = 0;

      for (const post of parsed.posts) {
        const qualityCheck = await universalQualityCheck(
          config.apiKey,
          config.provider,
          config.model,
          post.content,
          { contentType: 'post', platform: options.platforms[0] || 'linkedin' }
        );

        postsWithScores.push({
          content: post.content,
          hashtags: (post.content.match(hashtagRegex) || []) as string[],
          theme: post.theme,
          category: post.category,
          qualityScore: qualityCheck.score
        } as AutopilotPost & { qualityScore: number });

        totalScore += qualityCheck.score;
      }

      const avgScore = totalScore / postsWithScores.length;
      console.log(`Autopilot attempt ${attempt} average score: ${avgScore.toFixed(1)}/100`);

      // Keep better version
      if (avgScore > overallScore) {
        overallScore = avgScore;
        bestPosts = postsWithScores;
      }

      // If good enough, stop
      if (avgScore >= MIN_QUALITY_SCORE) {
        console.log(`Autopilot quality threshold met on attempt ${attempt}!`);
        break;
      }
    } catch (error) {
      console.error(`Autopilot attempt ${attempt} failed:`, error);
    }
  }

  if (bestPosts.length === 0) {
    throw new Error('Fehler beim Generieren der Autopilot-Inhalte');
  }

  return bestPosts;
}

// ============================================
// TREND-SURFER
// ============================================

interface TrendTopic {
  topic: string;
  description: string;
  relevance: 'high' | 'medium' | 'low';
  suggestedAngles: string[];
}

export async function getTrendingTopics(userId: string, industry: string): Promise<TrendTopic[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const prompt = `Du bist ein Trend-Analyst für Social Media im Bereich ${industry}. Identifiziere aktuelle Trends und Themen, die gerade relevant sind.

Analysiere:
- Aktuelle technologische Entwicklungen
- Branchenspezifische News
- Saisonale Themen
- Wiederkehrende Diskussionen in der Community

Generiere 8-10 aktuelle Trends mit:
- Kurzer Beschreibung
- Relevanz-Bewertung
- Vorgeschlagenen Blickwinkeln für Content

WICHTIG: Antworte NUR im JSON-Format:
{
  "trends": [
    {
      "topic": "Trend-Name",
      "description": "Kurze Beschreibung",
      "relevance": "high|medium|low",
      "suggestedAngles": ["Blickwinkel 1", "Blickwinkel 2"]
    }
  ]
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 3000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 3000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { trends: TrendTopic[] };
    return parsed.trends;
  } catch (error) {
    console.error('Failed to parse trends response:', error);
    throw new Error('Fehler beim Abrufen der Trends');
  }
}

interface TrendContentOptions {
  trend: string;
  platform: string;
  tone: string;
  angle: string;
  companyContext?: string;
}

export async function generateTrendContent(
  userId: string,
  options: TrendContentOptions
): Promise<{ content: string; hashtags: string[] }> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const contextInfo = options.companyContext
    ? `\n\nKontext des Unternehmens (basierend auf bisherigen Posts):\n${options.companyContext}`
    : '';

  const prompt = `Erstelle einen Social Media Post zu einem aktuellen Trend.

Trend: ${options.trend}
Plattform: ${options.platform}
Tonalität: ${options.tone}
Blickwinkel: ${options.angle} (z.B. Meinung, Analyse, How-to, News-Kommentar)
${contextInfo}

Der Post sollte:
- Aktuell und relevant wirken
- Den Trend aus Sicht eines IT-Unternehmens kommentieren
- Mehrwert bieten
- Passende Hashtags enthalten
- Zur Diskussion anregen

WICHTIG: Antworte NUR im JSON-Format:
{
  "content": "Der Post-Inhalt mit #Hashtags",
  "hashtags": ["#hashtag1", "#hashtag2"]
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 1500, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 1500, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse trend content:', error);
    throw new Error('Fehler beim Generieren des Trend-Contents');
  }
}

// ============================================
// CONTENT-REMIX-ENGINE
// ============================================

interface RemixOptions {
  sourceContent: string;
  sourceType: 'blog' | 'transcript' | 'article' | 'newsletter';
  outputFormats: Array<{ platform: string; count: number }>;
  preserveLinks: boolean;
  includeHashtags: boolean;
}

interface RemixedOutput {
  platform: string;
  posts: Array<{ content: string; hashtags: string[] }>;
}

export async function remixContent(userId: string, options: RemixOptions): Promise<RemixedOutput[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const outputs: RemixedOutput[] = [];

  for (const format of options.outputFormats) {
    const platformLimits: Record<string, number> = {
      linkedin: 3000,
      twitter: 280,
      facebook: 63206,
      instagram: 2200,
      newsletter: 5000
    };

    const limit = platformLimits[format.platform] || 2000;

    const prompt = `Du bist ein Content-Repurposing-Experte. Wandle den folgenden ${options.sourceType} in ${format.count} ${format.platform}-Posts um.

QUELL-CONTENT:
"""
${options.sourceContent.substring(0, 8000)}
"""

Anforderungen für ${format.platform}:
- Maximale Länge: ${limit} Zeichen
- Extrahiere die wichtigsten Punkte/Insights
- Jeder Post muss eigenständig wertvoll sein
- ${options.includeHashtags ? 'Füge relevante Hashtags hinzu' : 'Keine Hashtags'}
- ${options.preserveLinks ? 'Behalte wichtige Links bei' : 'Keine Links'}
- Passe Ton und Stil an ${format.platform} an

WICHTIG: Antworte NUR im JSON-Format:
{
  "posts": [
    { "content": "Post-Inhalt", "hashtags": ["#tag1", "#tag2"] }
  ]
}`;

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(config.apiKey, config.model, prompt, 4000, 0.6, SOCIAL_MEDIA_SYSTEM_PROMPT);
    } else {
      result = await callOpenAI(config.apiKey, config.model, prompt, 4000, 0.6, SOCIAL_MEDIA_SYSTEM_PROMPT);
    }

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

      const parsed = JSON.parse(jsonStr) as { posts: Array<{ content: string; hashtags?: string[] }> };
      outputs.push({
        platform: format.platform,
        posts: parsed.posts.map(p => ({
          content: p.content,
          hashtags: p.hashtags || []
        }))
      });
    } catch (error) {
      console.error(`Failed to parse remix for ${format.platform}:`, error);
      outputs.push({ platform: format.platform, posts: [] });
    }
  }

  return outputs;
}

// ============================================
// COMPETITOR ANALYSIS
// ============================================

interface CompetitorAnalysisOptions {
  competitorName: string;
  competitorPosts: string[];
  ourBrandVoice: string[];
  platform: string;
  generateCount: number;
}

interface CompetitorAnalysis {
  insights: {
    postingFrequency: string;
    contentTypes: string[];
    topTopics: string[];
    engagementTactics: string[];
    strengths: string[];
    opportunities: string[];
  };
  generatedPosts: Array<{ content: string; hashtags: string[]; inspiration: string }>;
}

export async function analyzeCompetitorAndGenerate(
  userId: string,
  options: CompetitorAnalysisOptions
): Promise<CompetitorAnalysis> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const ourPostsContext = options.ourBrandVoice.length
    ? `\n\nUnsere bisherigen Posts (Markenstimme):\n${options.ourBrandVoice.slice(0, 5).join('\n---\n')}`
    : '';

  const prompt = `Analysiere die Social Media Strategie eines Konkurrenten und generiere inspirierten (aber einzigartigen) Content.

KONKURRENT: ${options.competitorName}

KONKURRENTEN-POSTS:
"""
${options.competitorPosts.join('\n---\n')}
"""
${ourPostsContext}

AUFGABE:
1. Analysiere die Posts des Konkurrenten:
   - Häufigkeit und Timing
   - Content-Typen (Educational, Promotional, etc.)
   - Top-Themen
   - Engagement-Taktiken
   - Stärken und Schwächen

2. Generiere ${options.generateCount} Posts für ${options.platform}:
   - Inspiriert von erfolgreichen Elementen des Konkurrenten
   - Aber einzigartig und in unserer Markenstimme
   - Nicht kopieren, sondern besser machen!

WICHTIG: Antworte NUR im JSON-Format:
{
  "insights": {
    "postingFrequency": "Beschreibung",
    "contentTypes": ["Typ1", "Typ2"],
    "topTopics": ["Topic1", "Topic2"],
    "engagementTactics": ["Taktik1", "Taktik2"],
    "strengths": ["Stärke1", "Stärke2"],
    "opportunities": ["Chance1", "Chance2"]
  },
  "generatedPosts": [
    { "content": "Post mit #Hashtags", "hashtags": ["#tag"], "inspiration": "Was wir übernommen haben" }
  ]
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 5000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 5000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse competitor analysis:', error);
    throw new Error('Fehler bei der Konkurrenzanalyse');
  }
}

// ============================================
// SMART ENGAGEMENT BOT
// ============================================

interface EngagementOptions {
  posts: Array<{ author: string; content: string; platform: string }>;
  style: 'thoughtful' | 'supportive' | 'inquisitive' | 'expert';
  brandVoice: string[];
}

interface EngagementResponse {
  originalPost: string;
  author: string;
  response: string;
  responseType: 'comment' | 'compliment' | 'question' | 'insight';
}

export async function generateEngagementResponses(
  userId: string,
  options: EngagementOptions
): Promise<EngagementResponse[]> {
  const config = await getAIConfig(userId);
  if (!config || !config.enabled || !config.apiKey) {
    throw new Error('KI-Assistent ist nicht konfiguriert oder deaktiviert');
  }

  const styleDescriptions: Record<string, string> = {
    thoughtful: 'Nachdenklich und tiefgründig, füge wertvolle Perspektiven hinzu',
    supportive: 'Unterstützend und ermutigend, zeige echte Wertschätzung',
    inquisitive: 'Neugierig und fragend, stelle interessante Follow-up-Fragen',
    expert: 'Kompetent und fachlich, teile relevantes Expertenwissen'
  };

  const brandContext = options.brandVoice.length
    ? `\n\nUnsere Markenstimme (basierend auf bisherigen Posts):\n${options.brandVoice.slice(0, 3).join('\n---\n')}`
    : '';

  const postsJson = options.posts.map(p => `Autor: ${p.author}\nPlattform: ${p.platform}\nPost: ${p.content}`).join('\n\n---\n\n');

  const prompt = `Du bist ein Social Media Engagement-Spezialist. Generiere authentische, wertvolle Kommentare zu den folgenden Posts.

STIL: ${styleDescriptions[options.style]}
${brandContext}

POSTS ZUM KOMMENTIEREN:
${postsJson}

REGELN:
- Keine generischen Kommentare ("Toller Post!")
- Beziehe dich konkret auf den Inhalt
- Füge echten Mehrwert hinzu
- Bleibe authentisch und menschlich
- Keine Eigenwerbung, aber subtile Expertise zeigen
- Auf Deutsch antworten

WICHTIG: Antworte NUR im JSON-Format:
{
  "responses": [
    {
      "originalPost": "Kurze Zusammenfassung des Posts",
      "author": "Autor-Name",
      "response": "Der Kommentar-Text",
      "responseType": "comment|compliment|question|insight"
    }
  ]
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 3000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 3000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { responses: EngagementResponse[] };
    return parsed.responses;
  } catch (error) {
    console.error('Failed to parse engagement responses:', error);
    throw new Error('Fehler beim Generieren der Engagement-Antworten');
  }
}

// ============================================
// AI Image Generation
// ============================================

export interface ImageGenerationOptions {
  prompt: string;
  provider?: 'openai' | 'stability';
  style?: 'modern' | 'minimalist' | 'vibrant' | 'professional' | 'artistic' | 'photorealistic';
  aspectRatio: '1:1' | '9:16' | '16:9' | '4:5';
  quality?: 'standard' | 'hd';
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  costCents: number;
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  modern: 'Clean, contemporary design with bold colors and geometric shapes',
  minimalist: 'Simple, elegant with lots of whitespace and subtle tones',
  vibrant: 'Energetic, colorful with high contrast and dynamic elements',
  professional: 'Polished, business-appropriate with refined aesthetics',
  artistic: 'Creative, expressive with artistic flair and unique textures',
  photorealistic: 'Ultra-realistic, photographic quality with natural lighting',
};

/**
 * Use AI to enhance a basic prompt into a detailed, creative DALL-E prompt
 */
async function enhanceImagePromptWithAI(
  apiKey: string,
  basicPrompt: string,
  style: string,
  aspectRatio: string,
  purpose?: string
): Promise<string> {
  const systemPrompt = `Du bist ein Elite Visual Director mit Expertise in AI-Bildgenerierung.
Du transformierst einfache Bildideen in detaillierte, kreative DALL-E Prompts die ATEMBERAUBENDE Ergebnisse liefern.

DEINE SUPERKRAFT:
1. Du denkst in visuellen Metaphern und unerwarteten Perspektiven
2. Du kennst Komposition, Lichtführung, Farbpsychologie
3. Du weißt was DALL-E am besten kann (und was es NICHT kann)

PROMPT-ENGINEERING REGELN:
- Spezifische Details > Vage Beschreibungen
- Konkrete Kamera-Perspektiven angeben
- Lichtstimmung explizit beschreiben
- Farb-Palette definieren
- Stil-Referenzen nutzen (z.B. "in the style of Apple product photography")
- NIEMALS: "high quality" oder "4K" (DALL-E ignoriert das)
- IMMER: Komposition, Mood, Atmosphäre beschreiben`;

  const userPrompt = `Transformiere diese einfache Bildidee in einen MEISTERHAFTEN DALL-E Prompt:

URSPRÜNGLICHE IDEE: "${basicPrompt}"
STIL: ${style}
FORMAT: ${aspectRatio}
${purpose ? `VERWENDUNGSZWECK: ${purpose}` : ''}

Erstelle einen detaillierten englischen Prompt der:
1. Eine kreative visuelle Interpretation findet
2. Spezifische Komposition beschreibt (Perspektive, Framing)
3. Licht und Atmosphäre definiert
4. Farbpalette vorgibt
5. Stil-Referenzen einbaut
6. Für Social Media geeignet ist (eye-catching, scroll-stopping)

Antworte NUR mit dem fertigen englischen Prompt (keine Erklärungen).`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      console.error('Failed to enhance prompt with AI, using fallback');
      return null as any; // Will trigger fallback
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const enhancedPrompt = data.choices[0]?.message?.content?.trim();

    if (enhancedPrompt && enhancedPrompt.length > 50) {
      return enhancedPrompt;
    }
    return null as any;
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return null as any;
  }
}

const ASPECT_RATIO_SIZES: Record<string, { openai: string; stability: { width: number; height: number } }> = {
  '1:1': { openai: '1024x1024', stability: { width: 1024, height: 1024 } },
  '9:16': { openai: '1024x1792', stability: { width: 768, height: 1344 } },
  '16:9': { openai: '1792x1024', stability: { width: 1344, height: 768 } },
  '4:5': { openai: '1024x1024', stability: { width: 896, height: 1120 } },
};

/**
 * Generate an image using OpenAI's DALL-E 3
 */
async function generateImageWithOpenAI(
  apiKey: string,
  prompt: string,
  size: string,
  quality: 'standard' | 'hd'
): Promise<GeneratedImage> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: { message?: string } };
    throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json() as { data: Array<{ url: string; revised_prompt?: string }> };
  const costCents = quality === 'hd' ? 12 : 4; // DALL-E 3 pricing

  return {
    url: data.data[0].url,
    revisedPrompt: data.data[0].revised_prompt,
    provider: 'openai',
    model: 'dall-e-3',
    costCents,
  };
}

/**
 * Generate an image using Stability AI (Stable Diffusion)
 */
async function generateImageWithStability(
  apiKey: string,
  prompt: string,
  width: number,
  height: number
): Promise<GeneratedImage> {
  const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      text_prompts: [{ text: prompt, weight: 1 }],
      cfg_scale: 7,
      width,
      height,
      samples: 1,
      steps: 30,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`Stability API Error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json() as { artifacts: Array<{ base64: string }> };

  return {
    url: `data:image/png;base64,${data.artifacts[0].base64}`,
    provider: 'stability',
    model: 'stable-diffusion-xl-1024-v1-0',
    costCents: 2, // Approximate cost per image
  };
}

/**
 * Generate an AI image with intelligent prompt enhancement
 */
export async function generateImage(
  userId: string,
  options: ImageGenerationOptions
): Promise<GeneratedImage & { originalPrompt: string; enhancedPrompt: string }> {
  // Get AI config for the API key
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden. Bitte API-Schlüssel in den Einstellungen hinterlegen.');
  }

  const style = options.style || 'modern';
  const styleDesc = STYLE_DESCRIPTIONS[style];
  let enhancedPrompt: string;

  // Try AI-powered prompt enhancement first
  console.log('Enhancing image prompt with AI...');
  const aiEnhancedPrompt = await enhanceImagePromptWithAI(
    config.apiKey,
    options.prompt,
    style,
    options.aspectRatio,
    'Social Media Visual'
  );

  if (aiEnhancedPrompt) {
    console.log('Using AI-enhanced prompt');
    enhancedPrompt = aiEnhancedPrompt;
  } else {
    // Fallback to static enhancement
    console.log('Using fallback prompt enhancement');
    enhancedPrompt = `${options.prompt}.
Style: ${styleDesc}.
Composition: Professional, well-balanced with clear focal point.
Lighting: Soft, flattering light that enhances the subject.
Mood: Engaging and suitable for social media.
Quality: Sharp details, rich colors, professional finish.`;
  }

  if (options.provider === 'stability') {
    const size = ASPECT_RATIO_SIZES[options.aspectRatio].stability;
    throw new Error('Stability AI erfordert einen separaten API-Schlüssel. Bitte OpenAI verwenden.');
  }

  // Default to OpenAI DALL-E 3
  const size = ASPECT_RATIO_SIZES[options.aspectRatio].openai;
  const result = await generateImageWithOpenAI(config.apiKey, enhancedPrompt, size, options.quality || 'hd');

  return {
    ...result,
    originalPrompt: options.prompt,
    enhancedPrompt: enhancedPrompt
  };
}

// ============================================
// Story Content Generation
// ============================================

export interface StoryGenerationOptions {
  topic: string;
  platform: 'instagram' | 'facebook' | 'linkedin';
  storyType: 'promotional' | 'educational' | 'behind-the-scenes' | 'announcement' | 'poll' | 'quote';
  brandVoice?: string;
  targetAudience?: string;
  includeCallToAction?: boolean;
}

export interface GeneratedStory {
  title: string;
  textOverlays: Array<{
    text: string;
    position: 'top' | 'center' | 'bottom';
    style: 'bold' | 'normal' | 'highlight';
  }>;
  imagePrompt: string;
  imageSuggestions: string[];
  backgroundColor: string;
  callToAction?: string;
  hashtags: string[];
  musicSuggestion?: string;
  stickers: string[];
}

const STORY_SYSTEM_PROMPT = `Du bist ein Social Media Story-Experte. Du erstellst virale, engagement-starke Story-Konzepte für Instagram, Facebook und LinkedIn. Deine Stories sind kreativ, on-brand und optimiert für maximale Reichweite.`;

/**
 * Generate a complete story concept with AI
 */
export async function generateStoryContent(
  userId: string,
  options: StoryGenerationOptions
): Promise<GeneratedStory> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  const storyTypeDescriptions: Record<string, string> = {
    promotional: 'Werbe-Story für ein Produkt/Service mit klarem CTA',
    educational: 'Informative Story mit Tipps und Mehrwert',
    'behind-the-scenes': 'Authentischer Einblick hinter die Kulissen',
    announcement: 'Spannende Ankündigung mit Teaser-Elementen',
    poll: 'Interaktive Story mit Umfrage/Abstimmung',
    quote: 'Inspirierende Story mit Zitat und visuellem Design',
  };

  const prompt = `Erstelle ein detailliertes Story-Konzept für ${options.platform}.

THEMA: ${options.topic}
STORY-TYP: ${storyTypeDescriptions[options.storyType]}
${options.brandVoice ? `MARKENSTIMME: ${options.brandVoice}` : ''}
${options.targetAudience ? `ZIELGRUPPE: ${options.targetAudience}` : ''}

Erstelle ein Story-Konzept mit:
1. Kurzer, prägnanter Titel
2. 2-4 Text-Overlays (kurz und impactful, max 15 Wörter pro Overlay)
3. Detaillierter Bildprompt für AI-Generierung (auf Englisch, spezifisch und visuell)
4. 3 konkrete Bildvorschläge (was könnte man fotografieren/gestalten)
5. Passende Hintergrundfarbe (Hex-Code)
${options.includeCallToAction ? '6. Call-to-Action Text' : ''}
7. 3-5 relevante Hashtags
8. Musik-Vorschlag (Stimmung/Genre)
9. Passende Sticker-Empfehlungen (Emojis/GIFs)

WICHTIG: Antworte NUR im JSON-Format:
{
  "title": "Story-Titel",
  "textOverlays": [
    {"text": "Text hier", "position": "top|center|bottom", "style": "bold|normal|highlight"}
  ],
  "imagePrompt": "Detailed English prompt for AI image generation...",
  "imageSuggestions": ["Vorschlag 1", "Vorschlag 2", "Vorschlag 3"],
  "backgroundColor": "#hexcode",
  "callToAction": "CTA Text (optional)",
  "hashtags": ["hashtag1", "hashtag2"],
  "musicSuggestion": "Upbeat Pop / Ambient / etc.",
  "stickers": ["emoji1", "emoji2"]
}`;

  // Self-critique loop for story content
  const MIN_QUALITY_SCORE = 75;
  const MAX_ATTEMPTS = 3;

  let bestStory: GeneratedStory | null = null;
  let bestScore = 0;
  let attempts: Array<{ content: GeneratedStory; score: number; feedback: string[] }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Story generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    let currentPrompt = prompt;
    if (attempt > 1 && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      currentPrompt = `${prompt}

═══════════════════════════════════════
⚠️ KRITISCHES FEEDBACK ZUM VORHERIGEN VERSUCH (Score: ${lastAttempt.score}/100):
${lastAttempt.feedback.map(f => `- ${f}`).join('\n')}

VORHERIGER TITEL WAR: "${lastAttempt.content.title}"
VORHERIGE OVERLAYS: "${lastAttempt.content.textOverlays?.map(t => t.text).join(' | ')}"

MACH ES BESSER! Die Story muss:
- In 1 Sekunde fesseln
- Emotional resonieren
- Zum Handeln bewegen
═══════════════════════════════════════`;
    }

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(config.apiKey, config.model, currentPrompt, 2000, 0.8 + (attempt * 0.05), STORY_SYSTEM_PROMPT);
    } else {
      result = await callOpenAI(config.apiKey, config.model, currentPrompt, 2000, 0.8 + (attempt * 0.05), STORY_SYSTEM_PROMPT);
    }

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

      const story = JSON.parse(jsonStr) as GeneratedStory;

      // Quality check the story
      const storySummary = `TITEL: ${story.title}\nTEXT: ${story.textOverlays?.map(t => t.text).join(' → ')}\nCTA: ${story.callToAction || 'keiner'}`;

      const qualityCheck = await universalQualityCheck(
        config.apiKey,
        config.provider,
        config.model,
        storySummary,
        { contentType: 'story', platform: options.platform }
      );

      console.log(`Story attempt ${attempt} score: ${qualityCheck.score}/100`);

      attempts.push({
        content: story,
        score: qualityCheck.score,
        feedback: qualityCheck.issues
      });

      if (qualityCheck.score > bestScore) {
        bestScore = qualityCheck.score;
        bestStory = story;
      }

      if (qualityCheck.score >= MIN_QUALITY_SCORE) {
        console.log(`Story quality threshold met on attempt ${attempt}!`);
        break;
      }
    } catch (error) {
      console.error(`Story attempt ${attempt} failed to parse:`, error);
    }
  }

  if (!bestStory) {
    throw new Error('Fehler beim Generieren des Story-Inhalts');
  }

  return {
    ...bestStory,
    qualityScore: bestScore,
    attempts: attempts.length
  } as GeneratedStory & { qualityScore: number; attempts: number };
}

/**
 * Generate image prompt suggestions for a story topic
 */
export async function generateImagePromptSuggestions(
  userId: string,
  topic: string,
  style: string,
  count: number = 5
): Promise<Array<{ prompt: string; description: string }>> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  const prompt = `Du bist ein Experte für AI-Bildgenerierung. Erstelle ${count} kreative, detaillierte Bildprompts für das Thema: "${topic}".

STIL: ${style}
VERWENDUNGSZWECK: Social Media Story (9:16 Format, vertikale Bilder)

Erstelle professionelle, spezifische Prompts die:
- Auf Englisch sind (für DALL-E/Stable Diffusion)
- Konkrete visuelle Details enthalten
- Stimmung und Atmosphäre beschreiben
- Kompositions-Hinweise geben
- Social-Media-tauglich sind

WICHTIG: Antworte NUR im JSON-Format:
{
  "suggestions": [
    {
      "prompt": "Detailed English prompt for AI image generation...",
      "description": "Kurze deutsche Beschreibung was das Bild zeigt"
    }
  ]
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 1500, 0.9, STORY_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 1500, 0.9, STORY_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { suggestions: Array<{ prompt: string; description: string }> };
    return parsed.suggestions;
  } catch (error) {
    console.error('Failed to parse image prompt suggestions:', error);
    throw new Error('Fehler beim Generieren der Bildvorschläge');
  }
}

// ============================================
// Marketing Expert AI - Critical Analysis
// ============================================

// Dynamic marketing expert system prompt generator
function getMarketingExpertPrompt(targetAudience?: string, platform?: string): string {
  const baseExpertise = `Du bist ein erfahrener Social Media Marketing-Experte mit 15+ Jahren Erfahrung im B2B-Bereich.
Du analysierst Content kritisch und ehrlich - kein Sugarcoating. Du gibst konkretes, umsetzbares Feedback.

DEIN STIL:
- Sachlich, souverän und praxisnah
- Keine Marketing-Buzzwords oder leere Phrasen
- Positionierend: Expertenwissen statt Werbung
- Authentisch und glaubwürdig

DEINE EXPERTISE:
- Hook-Optimierung: konkret, dringlich, neugierig machend (KEIN Clickbait!)
- CTA-Formulierung: logisch zum Hook passend, klare Handlungsaufforderung
- Plattform-spezifische Best Practices
- Psychologie der Engagement-Trigger für Entscheider
- Content der Expertise demonstriert, nicht verkauft`;

  let audienceContext = '';
  if (targetAudience) {
    audienceContext = `

ZIELGRUPPEN-KONTEXT:
Du schreibst für: ${targetAudience}
- Verstehe ihre Pain Points und Herausforderungen
- Sprich ihre Sprache (professionell aber nicht überheblich)
- Biete echten Mehrwert und praktische Insights
- Positioniere den Absender als vertrauenswürdigen Experten`;
  }

  let platformContext = '';
  if (platform) {
    const platformTips: Record<string, string> = {
      linkedin: `
LINKEDIN-SPEZIFISCH:
- Professioneller, aber persönlicher Ton
- Erste Zeile = Scroll-Stopper (max. 150 Zeichen vor "mehr anzeigen")
- Absätze mit Leerzeilen für Lesbarkeit
- Keine übertriebenen Emojis (max. 2-3 dezent)
- Thought Leadership > Werbung`,
      instagram: `
INSTAGRAM-SPEZIFISCH:
- Visuell denken - Text ergänzt das Bild
- Erste Zeile fesselt, Rest liefert Wert
- Hashtags strategisch (10-15 relevant)
- Story-Format bevorzugen
- Authentizität > Perfektion`,
      facebook: `
FACEBOOK-SPEZIFISCH:
- Längerer Content kann funktionieren
- Community-Building Fokus
- Fragen stellen für Engagement
- Persönliche Geschichten verbinden`,
      twitter: `
TWITTER/X-SPEZIFISCH:
- Prägnant und pointiert
- Kontroverse Meinungen performen
- Thread-Format für komplexe Themen
- Keine Hashtag-Überladung (max. 2)`
    };
    platformContext = platformTips[platform.toLowerCase()] || '';
  }

  return baseExpertise + audienceContext + platformContext;
}

// Legacy constant for backwards compatibility
const MARKETING_EXPERT_PROMPT = getMarketingExpertPrompt();

export interface MarketingAnalysis {
  overallScore: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  improvements: Array<{
    area: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
    improvedExample?: string;
  }>;
  platformFit: {
    score: number;
    feedback: string;
  };
  audienceAlignment: {
    score: number;
    feedback: string;
  };
  callToActionEffectiveness: {
    score: number;
    feedback: string;
    suggestions: string[];
  };
  emotionalTone: string;
  readabilityScore: number;
  viralPotential: number;
}

/**
 * Analyze content like a marketing expert - critical and honest
 */
export async function analyzeContentAsExpert(
  userId: string,
  content: string,
  platform: string,
  goal: 'reach' | 'engagement' | 'leads' | 'branding',
  targetAudience?: string
): Promise<MarketingAnalysis> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  const goalDescriptions: Record<string, string> = {
    reach: 'Maximale Reichweite und Sichtbarkeit',
    engagement: 'Likes, Kommentare, Shares - Community-Interaktion',
    leads: 'Leads generieren, Newsletter-Anmeldungen, Website-Traffic',
    branding: 'Markenbekanntheit und Positionierung stärken'
  };

  // Use dynamic system prompt with audience and platform context
  const systemPrompt = getMarketingExpertPrompt(targetAudience, platform);

  const prompt = `Analysiere diesen Social Media Post wie ein professioneller Social Media Manager.
Sei kritisch aber konstruktiv - gib konkretes, umsetzbares Feedback.

═══════════════════════════════════════
KONTEXT:
═══════════════════════════════════════
PLATTFORM: ${platform}
ZIEL: ${goalDescriptions[goal]}
${targetAudience ? `ZIELGRUPPE: ${targetAudience}` : 'ZIELGRUPPE: B2B-Entscheider'}

═══════════════════════════════════════
ZU ANALYSIERENDER POST:
═══════════════════════════════════════
"""
${content}
"""

═══════════════════════════════════════
BEWERTUNGSKRITERIEN:
═══════════════════════════════════════
1. HOOK (0-100): Ist der Einstieg konkret, dringlich und neugierig machend? (KEIN Clickbait!)
2. KLARHEIT (0-100): Ist die Kernbotschaft sofort verständlich?
3. MEHRWERT (0-100): Bietet der Post echten Nutzen für die Zielgruppe?
4. CTA (0-100): Ist der Call-to-Action logisch zum Hook passend und handlungsauslösend?
5. CONVERSION-FIT (0-100): Wird die Zielgruppe zur gewünschten Aktion motiviert?
6. AUTHENTIZITÄT: Wirkt es wie Expertenwissen oder wie Werbung?

═══════════════════════════════════════
DEINE ANALYSE:
═══════════════════════════════════════
Bewerte EHRLICH. Ein guter Score ist 70+, exzellent ist 85+.
Bei Verbesserungsvorschlägen: Gib KONKRETE Beispiele wie es besser wäre.

WICHTIG: Antworte NUR im JSON-Format:
{
  "overallScore": 75,
  "strengths": ["Konkrete Stärke 1", "Konkrete Stärke 2"],
  "weaknesses": ["Konkretes Problem 1", "Konkretes Problem 2"],
  "improvements": [
    {
      "area": "Hook",
      "suggestion": "Der Hook sollte dringlicher und spezifischer sein",
      "priority": "high",
      "improvedExample": "Beispiel für einen besseren Hook-Satz als Inspiration"
    }
  ],
  "platformFit": {
    "score": 80,
    "feedback": "Konkrete Einschätzung zum Plattform-Fit"
  },
  "audienceAlignment": {
    "score": 70,
    "feedback": "Wie gut trifft es die Zielgruppe und warum"
  },
  "callToActionEffectiveness": {
    "score": 60,
    "feedback": "Konkrete Bewertung des CTA",
    "suggestions": ["Konkreter CTA-Vorschlag 1", "Konkreter CTA-Vorschlag 2"]
  },
  "emotionalTone": "sachlich-professionell/inspirierend/etc.",
  "readabilityScore": 85,
  "viralPotential": 45
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 2000, 0.7, systemPrompt);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 2000, 0.7, systemPrompt);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    return JSON.parse(jsonStr) as MarketingAnalysis;
  } catch (error) {
    console.error('Failed to parse marketing analysis:', error);
    throw new Error('Fehler bei der Marketing-Analyse');
  }
}

export interface WizardContentGeneration {
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

// Wizard options type
export interface WizardOptions {
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
  previousThemes?: string[]; // For theme rotation
}

/**
 * Generate complete content package for the wizard
 */
export async function generateWizardContent(
  userId: string,
  options: WizardOptions
): Promise<WizardContentGeneration> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: STRATEGIC THEME SELECTION (NEW!)
  // ═══════════════════════════════════════════════════════════════════════════

  // Map goal to BusinessGoal type
  const goalMapping: Record<string, BusinessGoal> = {
    'reach': 'engagement', // reach maps to engagement
    'engagement': 'engagement',
    'leads': 'lead',
    'lead': 'lead',
    'branding': 'branding',
    'traffic': 'traffic'
  };

  // Validate platform
  const validPlatforms: Platform[] = ['linkedin', 'instagram'];
  const platform: Platform = validPlatforms.includes(options.platform.toLowerCase() as Platform)
    ? options.platform.toLowerCase() as Platform
    : 'linkedin';

  // Select theme strategically BEFORE content generation
  let themeSelection: ThemeSelectionOutput | null = null;
  try {
    themeSelection = selectTheme({
      platform,
      goal: goalMapping[options.goal.toLowerCase()] || 'lead',
      journeyStage: options.journeyStage || 'awareness',
      targetAudience: options.targetAudience || 'B2B-Entscheider',
      previousThemes: options.previousThemes as any,
      topicHint: options.topic
    });
    console.log(`Theme selected: ${themeSelection.selectedTheme.category} / ${themeSelection.selectedTheme.subtopic} (Score: ${themeSelection.priorityScore})`);
  } catch (err) {
    console.warn('Theme selection failed, continuing without:', err);
  }

  // Get theme prompt section if theme was selected
  const themePromptSection = themeSelection ? getThemePromptSection(themeSelection) : '';

  // Use dynamic system prompt with audience and platform context
  const systemPrompt = getMarketingExpertPrompt(options.targetAudience, options.platform);

  const contentLength = options.contentLength || 'medium';
  const lengthInstructions = {
    short: 'Kurz und prägnant (max. 150 Wörter)',
    medium: 'Mittlere Länge (150-300 Wörter)',
    long: 'Ausführlich und detailliert (300+ Wörter)'
  };

  const goalDescriptions: Record<string, string> = {
    reach: 'Maximale Reichweite - Content der geteilt wird',
    engagement: 'Interaktion - Kommentare und Diskussion anregen',
    leads: 'Lead-Generierung - konkrete Handlung auslösen (Download, Anmeldung, Kontakt)',
    branding: 'Positionierung - Expertise demonstrieren und Vertrauen aufbauen'
  };

  const prompt = `Erstelle einen Social Media Post der WIRKLICH konvertiert.
${themePromptSection}

═══════════════════════════════════════
BRIEFING:
═══════════════════════════════════════
THEMA: ${options.topic}
PLATTFORM: ${options.platform}
ZIEL: ${goalDescriptions[options.goal] || options.goal}
${options.targetAudience ? `ZIELGRUPPE: ${options.targetAudience}` : 'ZIELGRUPPE: B2B-Entscheider (Geschäftsführer, IT-Leiter)'}
${options.tone ? `TONALITÄT: ${options.tone}` : 'TONALITÄT: Sachlich, souverän, praxisnah'}
${options.brandVoice ? `MARKENSTIMME: ${options.brandVoice}` : ''}
${options.contentType ? `CONTENT-TYP: ${options.contentType}` : ''}
LÄNGE: ${lengthInstructions[contentLength]}

═══════════════════════════════════════
QUALITÄTSANFORDERUNGEN:
═══════════════════════════════════════
HOOK (erste 1-2 Zeilen):
- Konkret und spezifisch (keine generischen Aussagen)
- Dringlichkeit oder Neugier wecken (OHNE Clickbait!)
- Direkt relevant für die Zielgruppe
- Beispiel SCHLECHT: "Digitalisierung ist wichtig"
- Beispiel GUT: "3 von 4 KMU verlieren Aufträge durch veraltete IT-Prozesse"

HAUPTTEIL:
- Echten Mehrwert liefern (nicht nur behaupten)
- Praxisnahe Insights oder konkrete Tipps
- Positioniert als Experte, nicht als Verkäufer
- Keine leeren Marketing-Phrasen

CTA (Call-to-Action):
- Logisch zum Hook passend (roter Faden!)
- Konkrete, niedrigschwellige Handlung
- Klar formuliert was der Leser bekommt
- Beispiel SCHLECHT: "Kontaktieren Sie uns"
- Beispiel GUT: "Laden Sie unsere IT-Sicherheits-Checkliste herunter (kostenlos, 2 Min. Lesezeit)"

═══════════════════════════════════════
OUTPUT (NUR JSON):
═══════════════════════════════════════
{
  "post": {
    "content": "Der komplette Post-Text mit Zeilenumbrüchen für Lesbarkeit",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
    "callToAction": "Der CTA-Text separat"
  },
  "alternatives": [
    {
      "content": "Alternative mit anderem Hook-Ansatz",
      "style": "z.B. Frage statt Statistik"
    },
    {
      "content": "Alternative mit anderem Stil",
      "style": "z.B. Story-Format"
    }
  ],
  "imagePrompt": {
    "prompt": "Detailed English DALL-E prompt, professional corporate style, no text in image",
    "style": "modern/professional",
    "description": "Kurze deutsche Beschreibung"
  },
  "bestPostingTime": {
    "day": "Wochentag",
    "time": "HH:MM",
    "reason": "Begründung basierend auf Zielgruppe"
  },
  "contentAnalysis": {
    "emotionalTone": "z.B. sachlich-professionell mit Dringlichkeit",
    "expectedEngagement": "low/medium/high",
    "targetAudienceMatch": 85
  }
}`;

  // Self-critique loop for wizard content quality
  const MIN_QUALITY_SCORE = 75;
  const MAX_ATTEMPTS = 3;

  let bestContent: WizardContentGeneration | null = null;
  let bestScore = 0;
  let attempts: Array<{ content: WizardContentGeneration; score: number; feedback: string[] }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Wizard content generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    // Add feedback from previous attempt if available
    let currentPrompt = prompt;
    if (attempt > 1 && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      currentPrompt = `${prompt}

═══════════════════════════════════════
⚠️ KRITISCHES FEEDBACK ZUM VORHERIGEN VERSUCH (Score: ${lastAttempt.score}/100):
${lastAttempt.feedback.map(f => `- ${f}`).join('\n')}

VORHERIGER HOOK WAR: "${lastAttempt.content.post?.content?.substring(0, 100)}..."

DU MUSST DIESE PROBLEME BEHEBEN! Schreibe KOMPLETT NEU - kein Copy-Paste!
Denke wie ein Top-Performer mit 100k+ Followern. Was würde VIRAL gehen?
═══════════════════════════════════════`;
    }

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(config.apiKey, config.model, currentPrompt, 3000, 0.8 + (attempt * 0.05), systemPrompt);
    } else {
      result = await callOpenAI(config.apiKey, config.model, currentPrompt, 3000, 0.8 + (attempt * 0.05), systemPrompt);
    }

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

      const wizardContent = JSON.parse(jsonStr) as WizardContentGeneration;

      // Quality check
      const qualityCheck = await universalQualityCheck(
        config.apiKey,
        config.provider,
        config.model,
        wizardContent.post?.content || '',
        { contentType: 'post', platform: options.platform }
      );

      console.log(`Wizard attempt ${attempt} score: ${qualityCheck.score}/100`);

      attempts.push({
        content: wizardContent,
        score: qualityCheck.score,
        feedback: qualityCheck.issues
      });

      if (qualityCheck.score > bestScore) {
        bestScore = qualityCheck.score;
        bestContent = wizardContent;
      }

      if (qualityCheck.score >= MIN_QUALITY_SCORE) {
        console.log(`Wizard quality threshold met on attempt ${attempt}!`);
        break;
      }
    } catch (error) {
      console.error(`Wizard attempt ${attempt} failed to parse:`, error);
    }
  }

  if (!bestContent) {
    throw new Error('Fehler bei der Content-Generierung');
  }

  // Add theme selection data to the output
  const result: WizardContentGeneration & { qualityScore: number; attempts: number } = {
    ...bestContent,
    qualityScore: bestScore,
    attempts: attempts.length
  };

  // Include theme selection reasoning if available
  if (themeSelection) {
    result.themeSelection = {
      category: themeSelection.selectedTheme.category,
      subtopic: themeSelection.selectedTheme.subtopic,
      angle: themeSelection.selectedTheme.angle,
      priorityScore: themeSelection.priorityScore,
      reasoning: themeSelection.reasoning.summary,
      alternatives: themeSelection.alternatives.map(alt => ({
        category: alt.category,
        score: alt.score,
        whyNot: alt.whyNot
      }))
    };
  }

  return result;
}

// Extended interface for improved content
export interface ContentImprovement {
  improvedContent: string;
  alternativeHooks: string[];
  ctaSuggestions: string[];
  changes: string[];
  reasoning: string;
}

/**
 * Improve content based on expert feedback - with extended output
 */
export async function improveContentWithExpert(
  userId: string,
  originalContent: string,
  platform: string,
  improvementFocus: string,
  targetAudience?: string,
  goal?: string,
  currentScores?: { platform?: number; viral?: number; cta?: number; overall?: number }
): Promise<ContentImprovement> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  // Use dynamic system prompt
  const systemPrompt = getMarketingExpertPrompt(targetAudience, platform);

  const focusDescriptions: Record<string, string> = {
    hook: 'FOKUS: Hook optimieren - konkret, dringlich, neugierig machend (KEIN Clickbait)',
    cta: 'FOKUS: CTA optimieren - logisch zum Hook passend, klare Handlungsaufforderung',
    value: 'FOKUS: Mehrwert erhöhen - was lernt/gewinnt der Leser konkret?',
    emotion: 'FOKUS: Emotionale Resonanz verstärken - authentisch, nicht manipulativ',
    clarity: 'FOKUS: Klarheit verbessern - Kernbotschaft sofort verständlich',
    all: 'FOKUS: Gezielte Optimierung der schwachen Bereiche'
  };

  const focusDescription = focusDescriptions[improvementFocus.toLowerCase()] || `FOKUS: ${improvementFocus}`;

  // Build preservation instructions based on current scores
  let preserveInstructions = '';
  let weakAreasInstructions = '';

  if (currentScores) {
    const strongAreas: string[] = [];
    const weakAreas: string[] = [];

    if (currentScores.platform !== undefined) {
      if (currentScores.platform >= 75) {
        strongAreas.push(`Platform-Optimierung (Score: ${currentScores.platform}/100)`);
      } else {
        weakAreas.push(`Platform-Optimierung (aktuell: ${currentScores.platform}/100)`);
      }
    }
    if (currentScores.viral !== undefined) {
      if (currentScores.viral >= 75) {
        strongAreas.push(`Viralitätspotential/Hook (Score: ${currentScores.viral}/100)`);
      } else {
        weakAreas.push(`Viralitätspotential/Hook (aktuell: ${currentScores.viral}/100)`);
      }
    }
    if (currentScores.cta !== undefined) {
      if (currentScores.cta >= 75) {
        strongAreas.push(`Call-to-Action (Score: ${currentScores.cta}/100)`);
      } else {
        weakAreas.push(`Call-to-Action (aktuell: ${currentScores.cta}/100)`);
      }
    }

    if (strongAreas.length > 0) {
      preserveInstructions = `
═══════════════════════════════════════
⚠️ WICHTIG - DIESE ELEMENTE SIND GUT UND MÜSSEN ERHALTEN BLEIBEN:
═══════════════════════════════════════
${strongAreas.map(a => `✓ ${a} - NICHT VERSCHLECHTERN!`).join('\n')}

Die guten Elemente dürfen NICHT verändert werden, außer sie passen nicht mehr zum verbesserten Teil.
Fokussiere dich NUR auf die Verbesserung der schwachen Bereiche!`;
    }

    if (weakAreas.length > 0) {
      weakAreasInstructions = `
═══════════════════════════════════════
🎯 DIESE BEREICHE MÜSSEN VERBESSERT WERDEN:
═══════════════════════════════════════
${weakAreas.map(a => `✗ ${a} - MUSS auf mindestens 75 verbessert werden`).join('\n')}`;
    }
  }

  const prompt = `Optimiere diesen Social Media Post GEZIELT wie ein professioneller Social Media Manager.

═══════════════════════════════════════
KONTEXT:
═══════════════════════════════════════
PLATTFORM: ${platform}
${targetAudience ? `ZIELGRUPPE: ${targetAudience}` : 'ZIELGRUPPE: B2B-Entscheider (Geschäftsführer, IT-Leiter in KMU)'}
${goal ? `ZIEL: ${goal}` : ''}
${focusDescription}
${preserveInstructions}
${weakAreasInstructions}

═══════════════════════════════════════
ORIGINAL-POST:
═══════════════════════════════════════
"""
${originalContent}
"""

═══════════════════════════════════════
OPTIMIERUNGSRICHTLINIEN:
═══════════════════════════════════════
⚠️ KRITISCH: Verändere NUR die schwachen Bereiche! Behalte die Stärken bei!

1. HOOK: Konkret, dringlich, neugierig machend - KEIN Clickbait
   - SCHLECHT: "Digitalisierung ist wichtig"
   - GUT: "73% der KMU unterschätzen dieses IT-Risiko"

2. CTA: Logisch zum Hook passend, klare niedrigschwellige Handlung
   - SCHLECHT: "Kontaktieren Sie uns"
   - GUT: "Kostenlose Checkliste herunterladen (2 Min. Lesezeit)"

3. STIL: Sachlich, souverän, praxisnah
   - Keine Marketing-Buzzwords oder leere Phrasen
   - Expertenwissen demonstrieren, nicht verkaufen
   - Ansprache passend zur Zielgruppe

4. STRUKTUR: Gute Lesbarkeit
   - Absätze mit Leerzeilen
   - Maximal 2-3 dezente Emojis
   - Klarer roter Faden von Hook zu CTA

═══════════════════════════════════════
OUTPUT (NUR JSON):
═══════════════════════════════════════
{
  "improvedContent": "Der Post mit GEZIELTEN Verbesserungen - gute Teile BEIBEHALTEN, nur schwache Bereiche verbessert",
  "alternativeHooks": [
    "Alternativer Hook 1 (nur falls Hook schwach war)",
    "Alternativer Hook 2 (nur falls Hook schwach war)"
  ],
  "ctaSuggestions": [
    "Konkreter CTA-Vorschlag (nur falls CTA schwach war)"
  ],
  "changes": [
    "GENAU welcher Teil geändert wurde und warum",
    "Welche Teile bewusst NICHT geändert wurden (weil sie gut waren)"
  ],
  "reasoning": "Warum diese gezielte Änderung den Score verbessert ohne die Stärken zu verlieren"
}`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 2000, 0.7, systemPrompt);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 2000, 0.7, systemPrompt);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr);

    // Ensure backwards compatibility - if old format, convert to new
    return {
      improvedContent: parsed.improvedContent || '',
      alternativeHooks: parsed.alternativeHooks || [],
      ctaSuggestions: parsed.ctaSuggestions || [],
      changes: parsed.changes || [],
      reasoning: parsed.reasoning || ''
    };
  } catch (error) {
    console.error('Failed to parse improvement:', error);
    throw new Error('Fehler bei der Verbesserung');
  }
}

// ============================================
// Auto-Improvement Loop - Self-Optimizing Content
// ============================================

export interface AutoImprovementResult {
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

const PRIORITY_ORDER: Record<string, number> = {
  high: 1,
  medium: 2,
  low: 3
};

/**
 * Automatically improves content through iterative analysis and targeted improvements
 * Continues until minimum score is reached or max iterations exhausted
 */
export async function autoImproveContent(
  userId: string,
  content: string,
  platform: string,
  goal: string,
  targetAudience?: string,
  minScore: number = 75,
  maxIterations: number = 3
): Promise<AutoImprovementResult> {
  const startTime = Date.now();

  let currentContent = content;
  let iterations: AutoImprovementResult['iterations'] = [];
  let allAlternativeHooks: string[] = [];
  let allCtaSuggestions: string[] = [];
  let initialScore = 0;
  let bestContent = content;
  let bestScore = 0;

  console.log(`Starting auto-improvement loop for ${platform}, goal: ${goal}, minScore: ${minScore}`);

  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n=== Auto-Improvement Iteration ${i + 1}/${maxIterations} ===`);

    // Step 1: Analyze current content
    const analysis = await analyzeContentAsExpert(
      userId,
      currentContent,
      platform,
      goal as 'reach' | 'engagement' | 'leads' | 'branding',
      targetAudience
    );

    const currentScore = analysis.overallScore;
    console.log(`Current score: ${currentScore}/100`);

    // Track initial score
    if (i === 0) {
      initialScore = currentScore;
    }

    // Track best version
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestContent = currentContent;
    }

    // Step 2: Check if there are high/medium priority improvements
    const hasHighPriorityImprovements = analysis.improvements?.some(
      imp => imp.priority === 'high' || imp.priority === 'medium'
    );

    // Step 3: Only stop if score is good AND no high-priority issues remain
    if (currentScore >= minScore && !hasHighPriorityImprovements) {
      console.log(`✓ Score ${currentScore} meets minimum ${minScore} and no high-priority issues - stopping loop`);
      break;
    }

    // Also stop if no improvements at all
    if (!analysis.improvements || analysis.improvements.length === 0) {
      console.log('No improvements suggested - stopping loop');
      break;
    }

    // Log why we continue
    if (currentScore >= minScore && hasHighPriorityImprovements) {
      console.log(`Score ${currentScore} meets minimum but high-priority issues remain - continuing improvement`);
    }

    // Sort by priority and get the most critical issue
    const sortedImprovements = [...analysis.improvements].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] || 3) - (PRIORITY_ORDER[b.priority] || 3)
    );

    const focusArea = sortedImprovements[0];
    const focusName = focusArea.area?.toLowerCase() || 'all';

    console.log(`Focus area: "${focusArea.area}" (priority: ${focusArea.priority})`);
    console.log(`Suggestion: ${focusArea.suggestion}`);

    // Extract current scores to tell the AI what to preserve
    const currentScores = {
      platform: analysis.platformFit?.score,
      viral: analysis.viralPotential,
      cta: analysis.callToActionEffectiveness?.score,
      overall: analysis.overallScore
    };
    console.log(`Current scores - Platform: ${currentScores.platform}, Viral: ${currentScores.viral}, CTA: ${currentScores.cta}`);

    // Step 4: Improve content with targeted focus - pass scores so AI knows what to preserve
    try {
      const improvement = await improveContentWithExpert(
        userId,
        currentContent,
        platform,
        focusName,
        targetAudience,
        goal,
        currentScores
      );

      // Collect alternative hooks and CTA suggestions
      if (improvement.alternativeHooks?.length > 0) {
        allAlternativeHooks.push(...improvement.alternativeHooks);
      }
      if (improvement.ctaSuggestions?.length > 0) {
        allCtaSuggestions.push(...improvement.ctaSuggestions);
      }

      // Step 5: Re-analyze to get new score
      const newAnalysis = await analyzeContentAsExpert(
        userId,
        improvement.improvedContent,
        platform,
        goal as 'reach' | 'engagement' | 'leads' | 'branding',
        targetAudience
      );

      const newScore = newAnalysis.overallScore;
      console.log(`After improvement: ${currentScore} → ${newScore} (${newScore > currentScore ? '+' : ''}${newScore - currentScore})`);

      // Track this iteration
      iterations.push({
        iteration: i + 1,
        focus: focusArea.area || 'all',
        beforeScore: currentScore,
        afterScore: newScore,
        changes: improvement.changes || []
      });

      // Only keep improvement if it actually improved the score
      if (newScore > currentScore) {
        currentContent = improvement.improvedContent;
        console.log(`✓ Improvement accepted`);
      } else {
        console.log(`✗ Improvement rejected (score didn't improve)`);
        // Try a different approach - focus on "all" if specific focus didn't help
        if (focusName !== 'all' && i < maxIterations - 1) {
          console.log(`Trying comprehensive improvement with score preservation...`);
          const comprehensiveImprovement = await improveContentWithExpert(
            userId,
            currentContent,
            platform,
            'all',
            targetAudience,
            goal,
            currentScores // Pass scores so AI knows what to preserve
          );

          const comprehensiveAnalysis = await analyzeContentAsExpert(
            userId,
            comprehensiveImprovement.improvedContent,
            platform,
            goal as 'reach' | 'engagement' | 'leads' | 'branding',
            targetAudience
          );

          if (comprehensiveAnalysis.overallScore > currentScore) {
            currentContent = comprehensiveImprovement.improvedContent;
            console.log(`✓ Comprehensive improvement accepted: ${comprehensiveAnalysis.overallScore}`);
          }
        }
      }

    } catch (error) {
      console.error(`Iteration ${i + 1} failed:`, error);
      // Continue with next iteration
    }
  }

  // Final analysis to get accurate final score
  const finalAnalysis = await analyzeContentAsExpert(
    userId,
    currentContent,
    platform,
    goal as 'reach' | 'engagement' | 'leads' | 'branding',
    targetAudience
  );

  // Use best version if final isn't better
  if (bestScore > finalAnalysis.overallScore) {
    currentContent = bestContent;
  }

  const endTime = Date.now();

  // Remove duplicates from suggestions
  const uniqueHooks = [...new Set(allAlternativeHooks)];
  const uniqueCtas = [...new Set(allCtaSuggestions)];

  console.log(`\n=== Auto-Improvement Complete ===`);
  console.log(`Initial score: ${initialScore}`);
  console.log(`Final score: ${Math.max(finalAnalysis.overallScore, bestScore)}`);
  console.log(`Iterations: ${iterations.length}`);
  console.log(`Time: ${endTime - startTime}ms`);

  return {
    finalContent: currentContent,
    finalScore: Math.max(finalAnalysis.overallScore, bestScore),
    initialScore,
    iterations,
    alternativeHooks: uniqueHooks.slice(0, 4), // Limit to 4 best hooks
    ctaSuggestions: uniqueCtas.slice(0, 4), // Limit to 4 best CTAs
    totalImprovementTime: endTime - startTime
  };
}

// ============================================
// Carousel Content Generator
// ============================================

export interface CarouselSlide {
  slideNumber: number;
  type: 'hook' | 'content' | 'tip' | 'example' | 'cta';
  headline: string;
  body: string;
  bulletPoints?: string[];
  emoji?: string;
  designNote?: string;
}

export interface CarouselContent {
  title: string;
  topic: string;
  platform: 'instagram' | 'linkedin';
  slides: CarouselSlide[];
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

export interface CarouselOptions {
  topic: string;
  platform: 'instagram' | 'linkedin';
  slideCount: number;
  style: 'educational' | 'storytelling' | 'listicle' | 'how-to' | 'tips' | 'myth-busting';
  tone: 'professional' | 'casual' | 'inspirational' | 'bold';
  targetAudience?: string;
  brandColors?: {
    primary?: string;
    secondary?: string;
  };
  includeEmojis: boolean;
}

/**
 * Generate carousel content for Instagram/LinkedIn
 */
export async function generateCarouselContent(
  userId: string,
  options: CarouselOptions
): Promise<CarouselContent> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden');
  }

  const styleDescriptions: Record<string, string> = {
    'educational': 'Lehrreich mit klaren Fakten und Erklärungen',
    'storytelling': 'Erzählerisch mit einer Geschichte die fesselt',
    'listicle': 'Liste mit nummerierten Punkten (z.B. "5 Gründe warum...")',
    'how-to': 'Schritt-für-Schritt Anleitung',
    'tips': 'Praktische Tipps und Tricks',
    'myth-busting': 'Mythen aufdecken und mit Fakten widerlegen'
  };

  const toneDescriptions: Record<string, string> = {
    'professional': 'Seriös und kompetent, aber nicht langweilig',
    'casual': 'Locker und nahbar, wie ein Gespräch unter Freunden',
    'inspirational': 'Motivierend und inspirierend',
    'bold': 'Mutig, provokant und aufmerksamkeitsstark'
  };

  const platformSpecs: Record<string, string> = {
    'instagram': 'Instagram Carousel (1080x1350px empfohlen, max 10 Slides, visuell ansprechend)',
    'linkedin': 'LinkedIn Dokument-Carousel (PDF-Format, bis zu 300 Slides, professioneller Look)'
  };

  const prompt = `Erstelle einen viralen Carousel-Post für ${platformSpecs[options.platform]}.

THEMA: ${options.topic}
STIL: ${styleDescriptions[options.style]}
TONALITÄT: ${toneDescriptions[options.tone]}
ANZAHL SLIDES: ${options.slideCount} (optimal sind 6-10 für maximale Reichweite)
${options.targetAudience ? `ZIELGRUPPE: ${options.targetAudience}` : ''}
EMOJIS: ${options.includeEmojis ? 'Ja, passend einsetzen' : 'Minimal oder keine'}

WICHTIGE REGELN FÜR VIRALE CAROUSELS:
1. SLIDE 1 (HOOK): Muss SOFORT Aufmerksamkeit erregen - provokante Frage, shocking Statistik, oder Bold Statement
2. SLIDES 2-${options.slideCount - 1}: Jede Slide = EIN klarer Punkt, kurz und scanbar
3. LETZTE SLIDE (CTA): Klarer Call-to-Action zum Speichern, Teilen oder Folgen
4. Jede Slide sollte auch einzeln Sinn ergeben (Leute springen!)
5. Halte Text KURZ - max 3-4 Zeilen pro Slide für Instagram, etwas mehr für LinkedIn
6. Nutze Pattern-Interrupts und Neugier-Lücken

${options.brandColors?.primary ? `MARKENFARBEN: Primär ${options.brandColors.primary}, Sekundär ${options.brandColors.secondary || 'frei wählbar'}` : ''}

WICHTIG: Antworte NUR im JSON-Format:
{
  "title": "Interner Titel für den Carousel",
  "topic": "${options.topic}",
  "platform": "${options.platform}",
  "slides": [
    {
      "slideNumber": 1,
      "type": "hook",
      "headline": "Die HOOK-Überschrift die stoppt",
      "body": "Kurzer unterstützender Text",
      "emoji": "🔥",
      "designNote": "Große, fette Schrift, zentriert"
    },
    {
      "slideNumber": 2,
      "type": "content",
      "headline": "Punkt 1 Headline",
      "body": "Erklärender Text",
      "bulletPoints": ["Bullet 1", "Bullet 2"],
      "emoji": "💡",
      "designNote": "Links-ausgerichtet mit Icon"
    }
  ],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "caption": "Die Instagram/LinkedIn Caption die zum Carousel gehört mit Call-to-Action",
  "colorScheme": {
    "primary": "#1a365d",
    "secondary": "#2563eb",
    "accent": "#f59e0b",
    "background": "#ffffff",
    "text": "#1f2937"
  },
  "designTips": [
    "Tipp für das Design 1",
    "Tipp für das Design 2"
  ],
  "canvaInstructions": "Detaillierte Anleitung wie man das in Canva umsetzt",
  "totalSlides": ${options.slideCount}
}`;

  // Self-critique loop for carousel quality
  const MIN_QUALITY_SCORE = 75;
  const MAX_ATTEMPTS = 3;

  let bestCarousel: CarouselContent | null = null;
  let bestScore = 0;
  let attempts: Array<{ content: CarouselContent; score: number; feedback: string[] }> = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Carousel generation attempt ${attempt}/${MAX_ATTEMPTS}...`);

    // Add feedback from previous attempt if available
    let currentPrompt = prompt;
    if (attempt > 1 && attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      currentPrompt = `${prompt}

═══════════════════════════════════════
⚠️ KRITISCHES FEEDBACK ZUM VORHERIGEN VERSUCH (Score: ${lastAttempt.score}/100):
${lastAttempt.feedback.map(f => `- ${f}`).join('\n')}

DU MUSST DIESE PROBLEME BEHEBEN! Erstelle ein KOMPLETT NEUES, BESSERES Carousel.
═══════════════════════════════════════`;
    }

    let result: { content: string; tokensUsed: number };
    if (config.provider === 'anthropic') {
      result = await callAnthropic(config.apiKey, config.model, currentPrompt, 4000, 0.8, MARKETING_EXPERT_PROMPT);
    } else {
      result = await callOpenAI(config.apiKey, config.model, currentPrompt, 4000, 0.8, MARKETING_EXPERT_PROMPT);
    }

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

      const carousel = JSON.parse(jsonStr) as CarouselContent;

      // Quality check the carousel
      const carouselSummary = `HOOK: ${carousel.slides[0]?.headline}\nSLIDES: ${carousel.slides.map(s => s.headline).join(' → ')}\nCAPTION: ${carousel.caption}`;

      const qualityCheck = await universalQualityCheck(
        config.apiKey,
        config.provider,
        config.model,
        carouselSummary,
        { contentType: 'carousel', platform: options.platform }
      );

      console.log(`Carousel attempt ${attempt} score: ${qualityCheck.score}/100`);

      attempts.push({
        content: carousel,
        score: qualityCheck.score,
        feedback: qualityCheck.issues
      });

      if (qualityCheck.score > bestScore) {
        bestScore = qualityCheck.score;
        bestCarousel = carousel;
      }

      if (qualityCheck.score >= MIN_QUALITY_SCORE) {
        console.log(`Carousel quality threshold met on attempt ${attempt}!`);
        break;
      }
    } catch (error) {
      console.error(`Carousel attempt ${attempt} failed to parse:`, error);
      // Continue to next attempt
    }
  }

  if (!bestCarousel) {
    throw new Error('Fehler bei der Carousel-Generierung');
  }

  return {
    ...bestCarousel,
    qualityScore: bestScore,
    attempts: attempts.length
  } as CarouselContent & { qualityScore: number; attempts: number };
}

/**
 * Use AI to generate creative, context-aware image prompts for carousel slides
 */
async function generateAIImagePrompts(
  apiKey: string,
  slides: CarouselSlide[],
  style: string,
  colorScheme: { primary: string; secondary: string },
  topic: string
): Promise<Map<number, string>> {
  const slideDescriptions = slides.map(s => ({
    number: s.slideNumber,
    type: s.type,
    headline: s.headline,
    body: s.body,
    bulletPoints: s.bulletPoints
  }));

  const systemPrompt = `Du bist ein kreativer Art Director, spezialisiert auf Social Media Visuals.
Deine Aufgabe ist es, einzigartige DALL-E Bild-Prompts für Carousel-Slides zu erstellen.

Wichtige Regeln:
1. Jeder Prompt muss EINZIGARTIG und spezifisch zum Slide-Inhalt sein
2. Nutze kreative visuelle Metaphern, die den Inhalt symbolisch darstellen
3. NIEMALS Text, Buchstaben oder Zahlen im Bild
4. Lass Platz für Text-Overlay (unteres Drittel frei)
5. Die Bilder sollen zusammen als Serie funktionieren, aber visuell unterschiedlich sein`;

  const userPrompt = `Erstelle DALL-E Bild-Prompts für diese Carousel-Slides:

THEMA: ${topic}
STIL: ${style}
FARBEN: Primär ${colorScheme.primary}, Sekundär ${colorScheme.secondary}

SLIDES:
${JSON.stringify(slideDescriptions, null, 2)}

Erstelle für JEDEN Slide einen einzigartigen, kreativen Prompt der:
- Eine visuelle Metapher für den Slide-Inhalt verwendet
- Den ${style}-Stil berücksichtigt
- Die Farbpalette einbezieht
- Zur Slide-Position passt (Hook = aufmerksamkeitsstark, CTA = motivierend, etc.)

Antworte im JSON-Format:
{
  "prompts": [
    {
      "slideNumber": 1,
      "visualMetaphor": "Kurze Beschreibung der gewählten Metapher",
      "prompt": "Detaillierter DALL-E Prompt auf Englisch..."
    }
  ]
}

Sei kreativ! Verwende unerwartete, aber passende visuelle Metaphern.
Beispiele für kreative Metaphern:
- "Produktivität" → Schweizer Uhrwerk, Wasserfall, Dominosteine
- "Wachstum" → Bonsai-Baum, Schmetterlingsmetamorphose, Bergbesteigung
- "Innovation" → Prisma das Licht bricht, Origami-Transformation, Schachbrett-Perspektive`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9, // High creativity
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate AI prompts');
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    const parsed = JSON.parse(content) as { prompts: Array<{ slideNumber: number; prompt: string; visualMetaphor: string }> };
    const promptMap = new Map<number, string>();

    for (const item of parsed.prompts) {
      // Enhance each prompt with technical requirements
      const enhancedPrompt = `${item.prompt}

Technical requirements:
- Square format (1:1 aspect ratio), 1024x1024px
- NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS in the image
- Leave clear space in the lower third for text overlay
- Professional quality for Instagram/LinkedIn
- Color scheme: ${colorScheme.primary} as primary accent, ${colorScheme.secondary} for supporting elements
- Style: ${style === 'modern' ? 'Apple-like clean design, tech-forward aesthetics' :
  style === 'minimalist' ? 'Muji-inspired, Japanese design philosophy, lots of white space' :
  style === 'vibrant' ? 'Spotify Wrapped energy, bold and eye-catching' :
  'Corporate premium, McKinsey-level sophistication'}`;

      promptMap.set(item.slideNumber, enhancedPrompt);
    }

    return promptMap;
  } catch (error) {
    console.error('Failed to generate AI image prompts:', error);
    // Return empty map, will fall back to static prompts
    return new Map();
  }
}

/**
 * Generate a static fallback prompt for carousel slide images
 */
function generateFallbackImagePrompt(
  slide: CarouselSlide,
  style: string,
  colorScheme: { primary: string; secondary: string },
  totalSlides: number,
  topic: string
): string {
  // Style-specific visual approaches
  const styleApproaches: Record<string, { elements: string[]; mood: string; technique: string }> = {
    'modern': {
      elements: ['geometric shapes', 'gradient meshes', 'glassmorphism effects', 'neon accents', 'floating 3D elements', 'holographic textures'],
      mood: 'innovative, tech-forward, sleek',
      technique: 'clean lines, subtle shadows, layered depth'
    },
    'minimalist': {
      elements: ['single focal object', 'negative space', 'thin line art', 'subtle textures', 'soft gradients', 'organic shapes'],
      mood: 'calm, sophisticated, elegant',
      technique: 'lots of breathing room, muted tones, understated beauty'
    },
    'vibrant': {
      elements: ['bold color blocks', 'dynamic patterns', 'abstract splashes', 'energetic swirls', 'playful illustrations', 'bright overlays'],
      mood: 'energetic, exciting, bold',
      technique: 'high contrast, saturated colors, dynamic composition'
    },
    'professional': {
      elements: ['subtle patterns', 'corporate textures', 'refined gradients', 'structured layouts', 'premium materials', 'architectural elements'],
      mood: 'trustworthy, established, authoritative',
      technique: 'balanced composition, conservative palette, polished finish'
    }
  };

  // Slide-type specific visual concepts
  const slideTypeVisuals: Record<string, { concept: string; elements: string[]; composition: string }> = {
    'hook': {
      concept: 'attention-grabbing, creates curiosity',
      elements: ['dramatic lighting', 'bold focal point', 'dynamic perspective', 'mystery element'],
      composition: 'asymmetric, draws eye to center'
    },
    'content': {
      concept: 'informative, supports learning',
      elements: ['organized structure', 'supporting graphics', 'visual hierarchy', 'illustrative elements'],
      composition: 'balanced, space for text overlay'
    },
    'tip': {
      concept: 'helpful revelation',
      elements: ['illumination metaphor', 'clarity symbols', 'breakthrough imagery'],
      composition: 'centered focus, radiating elements'
    },
    'example': {
      concept: 'practical demonstration',
      elements: ['concrete visuals', 'contextual backgrounds', 'realistic touches'],
      composition: 'grounded, relatable'
    },
    'cta': {
      concept: 'action-oriented, motivating',
      elements: ['directional elements', 'achievement imagery', 'pathway visuals'],
      composition: 'dynamic movement, empowering'
    }
  };

  const styleInfo = styleApproaches[style] || styleApproaches['modern'];
  const typeInfo = slideTypeVisuals[slide.type] || slideTypeVisuals['content'];

  const randomStyleElement = styleInfo.elements[Math.floor(Math.random() * styleInfo.elements.length)];
  const randomTypeElement = typeInfo.elements[Math.floor(Math.random() * typeInfo.elements.length)];

  return `Create a ${style} social media carousel slide background.
Topic: "${topic}" - Slide ${slide.slideNumber}/${totalSlides}: "${slide.headline}"
Visual elements: ${randomStyleElement}, ${randomTypeElement}
Mood: ${styleInfo.mood}
Composition: ${typeInfo.composition}
Colors: ${colorScheme.primary} primary, ${colorScheme.secondary} secondary
Technical: Square 1024x1024, NO TEXT/LETTERS, leave lower third clear for overlay, ${styleInfo.technique}
Style ref: ${style === 'modern' ? 'Apple, Stripe' : style === 'minimalist' ? 'Muji, Japanese' : style === 'vibrant' ? 'Spotify Wrapped' : 'McKinsey, HBR'}`;
}

/**
 * Generate DALL-E images for carousel slides with AI-powered creative prompts
 */
export async function generateCarouselSlideImages(
  userId: string,
  slides: CarouselSlide[],
  style: 'modern' | 'minimalist' | 'vibrant' | 'professional',
  colorScheme: { primary: string; secondary: string },
  topic?: string
): Promise<Array<{ slideNumber: number; imageUrl: string; prompt: string; visualMetaphor?: string }>> {
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey || config.provider !== 'openai') {
    throw new Error('OpenAI API-Key erforderlich für Bildgenerierung');
  }

  const results: Array<{ slideNumber: number; imageUrl: string; prompt: string; visualMetaphor?: string }> = [];
  const carouselTopic = topic || slides[0]?.headline || 'Business Content';
  const totalSlides = slides.length;

  // Only generate images for key slides (hook, cta, and 1-2 content slides)
  const slidesToGenerate = slides.filter(s =>
    s.type === 'hook' || s.type === 'cta' || s.slideNumber <= 3
  ).slice(0, 4); // Max 4 images to save costs

  // First: Use AI to generate creative, context-aware prompts for all slides
  console.log('Generating AI-powered creative prompts for carousel slides...');
  const aiPrompts = await generateAIImagePrompts(
    config.apiKey,
    slidesToGenerate,
    style,
    colorScheme,
    carouselTopic
  );

  console.log(`Generated ${aiPrompts.size} AI prompts, generating images...`);

  for (const slide of slidesToGenerate) {
    // Use AI-generated prompt if available, otherwise fall back to static prompt
    const prompt = aiPrompts.get(slide.slideNumber) ||
      generateFallbackImagePrompt(slide, style, colorScheme, totalSlides, carouselTopic);

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'url',
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: { message?: string } };
        throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json() as { data: Array<{ url: string }> };
      if (data.data[0]?.url) {
        results.push({
          slideNumber: slide.slideNumber,
          imageUrl: data.data[0].url,
          prompt,
          visualMetaphor: aiPrompts.has(slide.slideNumber) ? 'AI-generated creative metaphor' : undefined
        });
      }
    } catch (error) {
      console.error(`Failed to generate image for slide ${slide.slideNumber}:`, error);
      // Continue with other slides even if one fails
    }
  }

  return results;
}
