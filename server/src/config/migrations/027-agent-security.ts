import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Phase A „Agenten-Sicherheit“ (27.11.2026):
 * - api_tokens: Stufen (scopes), Ablaufdatum, zuletzt genutzte IP,
 *   Erinnerung vor Ablauf. Bestands-Tokens behalten ihre bisherigen
 *   Möglichkeiten (alle Stufen) und laufen in 90 Tagen ab.
 * - api_token_requests: Protokoll jeder Agenten-Anfrage (ohne Bodies,
 *   ohne Query-Werte), 90 Tage Aufbewahrung.
 * - Herkunft: time_entries / ticket_comments merken sich, ob sie über
 *   einen API-Zugang entstanden sind.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS scopes TEXT[];
    ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_used_ip TEXT;
    ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMP;
    ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS revoked_by TEXT;
  `);
  // Bestand: bisher volle Agenten-Rechte → alle Stufen, Ablauf in 90 Tagen
  await client.query(`
    UPDATE api_tokens SET scopes = ARRAY['read','time:write','tickets:write']
     WHERE scopes IS NULL;
    UPDATE api_tokens SET expires_at = NOW() + INTERVAL '90 days'
     WHERE expires_at IS NULL AND revoked_at IS NULL;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS api_token_requests (
      id BIGSERIAL PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
      user_id TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms INTEGER,
      ip TEXT,
      client TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_api_token_requests_token ON api_token_requests(token_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_api_token_requests_created ON api_token_requests(created_at);
  `);

  await client.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS api_token_id TEXT;
    ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS api_token_id TEXT;
  `);

  logger.info('✅ Agenten-Sicherheit: Token-Stufen, Ablauf, Protokoll, Herkunft');
}
