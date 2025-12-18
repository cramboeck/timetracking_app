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
