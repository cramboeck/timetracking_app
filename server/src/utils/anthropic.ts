/**
 * Gemeinsame Bausteine für Aufrufe der Anthropic Messages-API (per fetch).
 *
 * Hintergrund (28.11.2026): Die bisher hinterlegten Modelle (claude-3-*,
 * claude-3-5-*) sind von Anthropic ABGESCHALTET — jeder KI-Aufruf mit
 * Anthropic schlug fehl (Bestell-Positionen, Rechnungseingang, Ticket-Vorschläge).
 * Gespeicherte Altwerte werden hier auf das aktuelle Modell derselben Klasse
 * abgebildet, damit nichts mehr an einem toten Modellnamen hängt.
 *
 * Aktuelle Modelle denken standardmäßig nach (adaptive thinking): die Antwort
 * enthält dann zuerst einen `thinking`-Block, und das Nachdenken zählt gegen
 * `max_tokens`. Daher: Text gezielt aus den `text`-Blöcken lesen, Aufwand für
 * Extraktions-/Kurztexte auf `low` und Puffer für das Nachdenken einplanen.
 */

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Modelle, die wir unverändert durchreichen (alle unterstützen `output_config.effort`). */
const SUPPORTED = new Set([
  'claude-fable-5-2', 'claude-fable-5-1', 'claude-fable-5',
  'claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
  'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-haiku-5-5',
]);

/** Modelle mit serverseitigem Rückfall bei Ablehnung (`fallbacks: "default"`). */
const WITH_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Gespeicherten Modellnamen auf ein aktuelles Modell abbilden (abgeschaltete → aktuelle Klasse). */
export function resolveAnthropicModel(model: string | null | undefined): string {
  const m = (model || '').trim();
  if (SUPPORTED.has(m)) return m;
  if (/haiku/i.test(m)) return 'claude-haiku-5-5';
  if (/opus/i.test(m)) return 'claude-opus-5-5';
  return ANTHROPIC_DEFAULT_MODEL;
}

type AnthropicContent = string | Array<Record<string, unknown>>;

export interface AnthropicRequestInput {
  apiKey: string;
  model: string | null | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: AnthropicContent }>;
  system?: string;
  /** Platz für die eigentliche Antwort (Nachdenken bekommt Puffer obendrauf) */
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
}

/** Header + Body für POST /v1/messages. */
export function buildAnthropicRequest(input: AnthropicRequestInput): { headers: Record<string, string>; body: Record<string, unknown> } {
  const model = resolveAnthropicModel(input.model);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': input.apiKey,
    'anthropic-version': '2023-06-01',
  };
  const body: Record<string, unknown> = {
    model,
    // Nachdenken zählt gegen max_tokens → Puffer, damit die Antwort nicht abgeschnitten wird
    max_tokens: Math.max(input.maxTokens, 256) + 2048,
    messages: input.messages,
    output_config: { effort: input.effort ?? 'low' },
  };
  if (input.system) body.system = input.system;
  if (WITH_FALLBACK.has(model)) {
    // Lehnt das Modell ab, beantwortet ein Ersatzmodell dieselbe Anfrage
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  return { headers, body };
}

/** Text der Antwort (alle `text`-Blöcke; `thinking`-Blöcke werden übersprungen). */
export function anthropicText(data: { content?: Array<{ type?: string; text?: string }> } | null | undefined): string {
  return (data?.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('');
}

/** Aufruf mit verständlicher Fehlermeldung. */
export async function callAnthropicMessages(input: AnthropicRequestInput): Promise<{
  text: string; model: string; usage: { input_tokens?: number; output_tokens?: number }; stopReason: string | null;
}> {
  const { headers, body } = buildAnthropicRequest(input);
  const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json() as { error?: { message?: string } };
      detail = err.error?.message ?? '';
    } catch { /* kein JSON */ }
    throw new Error(`Anthropic API error: ${response.status}${detail ? ` – ${detail}` : ''}`);
  }
  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
    model?: string;
  };
  return { text: anthropicText(data), model: data.model ?? String(body.model), usage: data.usage ?? {}, stopReason: data.stop_reason ?? null };
}
