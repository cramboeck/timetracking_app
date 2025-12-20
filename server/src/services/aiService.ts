import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

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
// Social Media Content Generation
// ============================================

const SOCIAL_MEDIA_SYSTEM_PROMPT = `Du bist ein erfahrener Social Media Manager und Content Creator für IT-Unternehmen.
Deine Aufgabe ist es, ansprechende, professionelle Social Media Posts zu erstellen.
Du kennst die Best Practices für alle gängigen Plattformen (LinkedIn, Twitter/X, Facebook, Instagram).
Antworte immer auf Deutsch und liefere nur den fertigen Post-Text ohne Erklärungen.`;

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

  const platformGuidelines: Record<string, string> = {
    linkedin: 'LinkedIn: Professionell, bis zu 3000 Zeichen, keine übermäßigen Emojis, 3-5 relevante Hashtags am Ende',
    twitter: 'Twitter/X: Maximal 280 Zeichen, prägnant, 1-3 Hashtags integriert',
    facebook: 'Facebook: Locker aber informativ, bis zu 500 Zeichen optimal, Emojis erlaubt',
    instagram: 'Instagram: Visuell orientiert, Emojis erwünscht, bis zu 30 Hashtags möglich',
    all: 'Erstelle einen universellen Post der auf allen Plattformen funktioniert, ca. 200-280 Zeichen'
  };

  const toneGuidelines: Record<string, string> = {
    professional: 'Professioneller, seriöser Ton',
    casual: 'Lockerer, freundlicher Ton',
    humorous: 'Humorvoller, unterhaltsamer Ton',
    informative: 'Informativer, lehrreicher Ton'
  };

  const prompt = `Erstelle einen Social Media Post auf Deutsch.

Thema: ${options.topic}
${options.customerContext ? `Kontext: ${options.customerContext}` : ''}
${options.contentCategory ? `Kategorie: ${options.contentCategory}` : ''}

Plattform: ${platformGuidelines[options.platform]}
Ton: ${toneGuidelines[options.tone]}
${options.includeHashtags ? 'Füge passende Hashtags hinzu.' : 'Keine Hashtags.'}
${options.includeEmoji ? 'Verwende passende Emojis.' : 'Keine Emojis verwenden.'}

Antworte NUR mit dem fertigen Post-Text, keine Erklärungen.`;

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  } else {
    result = await callOpenAI(
      config.apiKey,
      config.model,
      prompt,
      config.maxTokens,
      config.temperature,
      SOCIAL_MEDIA_SYSTEM_PROMPT
    );
  }

  // Extract hashtags from generated content
  const hashtagRegex = /#[\wäöüÄÖÜß]+/g;
  const extractedHashtags = (result.content.match(hashtagRegex) || []) as string[];

  return {
    content: result.content,
    hashtags: extractedHashtags,
    platform: options.platform,
    characterCount: result.content.length
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

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 6000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 6000, 0.7, SOCIAL_MEDIA_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonStr) as { posts: Array<{ content: string; theme: string; category: string }> };
    const hashtagRegex = /#[\wäöüÄÖÜß]+/g;

    return parsed.posts.map(post => ({
      content: post.content,
      hashtags: (post.content.match(hashtagRegex) || []) as string[],
      theme: post.theme,
      category: post.category
    }));
  } catch (error) {
    console.error('Failed to parse autopilot response:', error);
    throw new Error('Fehler beim Generieren der Autopilot-Inhalte');
  }
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
  provider: 'openai' | 'stability';
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
 * Generate an AI image with the specified options
 */
export async function generateImage(
  userId: string,
  options: ImageGenerationOptions
): Promise<GeneratedImage> {
  // Get AI config for the API key
  const config = await getAIConfig(userId);
  if (!config || !config.apiKey) {
    throw new Error('AI-Konfiguration nicht gefunden. Bitte API-Schlüssel in den Einstellungen hinterlegen.');
  }

  // Build the enhanced prompt
  const styleDesc = STYLE_DESCRIPTIONS[options.style || 'modern'];
  const enhancedPrompt = `${options.prompt}. Style: ${styleDesc}. High quality, professional, suitable for social media.`;

  if (options.provider === 'stability') {
    const size = ASPECT_RATIO_SIZES[options.aspectRatio].stability;
    // For Stability, you'd need a separate API key - for now, we'll use OpenAI
    // In production, you'd get the Stability API key from a separate config
    throw new Error('Stability AI erfordert einen separaten API-Schlüssel. Bitte OpenAI verwenden.');
  }

  // Default to OpenAI DALL-E 3
  const size = ASPECT_RATIO_SIZES[options.aspectRatio].openai;
  return generateImageWithOpenAI(config.apiKey, enhancedPrompt, size, options.quality || 'hd');
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

  let result: { content: string; tokensUsed: number };
  if (config.provider === 'anthropic') {
    result = await callAnthropic(config.apiKey, config.model, prompt, 2000, 0.8, STORY_SYSTEM_PROMPT);
  } else {
    result = await callOpenAI(config.apiKey, config.model, prompt, 2000, 0.8, STORY_SYSTEM_PROMPT);
  }

  try {
    let jsonStr = result.content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');

    return JSON.parse(jsonStr) as GeneratedStory;
  } catch (error) {
    console.error('Failed to parse story content:', error);
    throw new Error('Fehler beim Generieren des Story-Inhalts');
  }
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
