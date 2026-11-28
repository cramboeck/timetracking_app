import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAnthropicModel, buildAnthropicRequest, anthropicText, callAnthropicMessages } from '../src/utils/anthropic';

describe('resolveAnthropicModel', () => {
  it.each([
    ['claude-3-5-sonnet-20241022', 'claude-sonnet-5-5'],
    ['claude-3-5-haiku-20241022', 'claude-haiku-5-5'],
    ['claude-3-opus-20240229', 'claude-opus-5-5'],
    ['claude-3-haiku-20240307', 'claude-haiku-5-5'],
    ['claude-haiku-4-5', 'claude-haiku-5-5'],
    [null, 'claude-sonnet-5-5'],
    ['claude-sonnet-5-5', 'claude-sonnet-5-5'],
    ['claude-opus-4-8', 'claude-opus-4-8'],
  ])('%s → %s', (m, expected) => expect(resolveAnthropicModel(m)).toBe(expected));
});

describe('buildAnthropicRequest', () => {
  it('kein temperature, effort low, Puffer fürs Nachdenken, Rückfall bei Sonnet', () => {
    const { headers, body } = buildAnthropicRequest({ apiKey: 'k', model: 'claude-3-5-sonnet-20241022', maxTokens: 1000, messages: [{ role: 'user', content: 'x' }], system: 's' });
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body).not.toHaveProperty('temperature');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBe(3048);
    expect(body.fallbacks).toBe('default');
    expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(body.system).toBe('s');
  });
  it('Haiku ohne serverseitigen Rückfall', () => {
    const { headers, body } = buildAnthropicRequest({ apiKey: 'k', model: 'claude-haiku-5-5', maxTokens: 16, messages: [{ role: 'user', content: 'x' }] });
    expect(body.fallbacks).toBeUndefined();
    expect(headers['anthropic-beta']).toBeUndefined();
    expect(body.max_tokens).toBe(256 + 2048);
  });
});

describe('anthropicText', () => {
  it('liest nur Text-Blöcke (Denk-Block zuerst wird übersprungen)', () => {
    expect(anthropicText({ content: [{ type: 'thinking', text: undefined }, { type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] })).toBe('{"a":1}');
  });
});

describe('callAnthropicMessages', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sendet an /v1/messages und liefert den Text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'ok' }], usage: { input_tokens: 3, output_tokens: 2 }, stop_reason: 'end_turn' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await callAnthropicMessages({ apiKey: 'k', model: 'claude-3-haiku-20240307', maxTokens: 100, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.text).toBe('ok');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe('claude-haiku-5-5');
  });
  it('verständliche Fehlermeldung', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'model: not found' } }), { status: 404 })));
    await expect(callAnthropicMessages({ apiKey: 'k', model: 'x', maxTokens: 1, messages: [{ role: 'user', content: 'a' }] })).rejects.toThrow('Anthropic API error: 404 – model: not found');
  });
});
