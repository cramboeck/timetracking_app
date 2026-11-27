import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Phase B „Vorschlags-Inbox + Kundengedächtnis“ (27.11.2026):
 * - agent_proposals: Der Agent schlägt vor, der Mensch entscheidet. Ein
 *   Vorschlag gehört immer EINEM User (dem Token-Besitzer) und wird erst
 *   durch dessen Übernahme zu einem echten Datensatz (result_ref).
 * - customer_notes: Absprachen/Wissen pro Kunde („Fahrtzeit nie berechnen“),
 *   die Mensch und Agent vor jeder Arbeit lesen.
 * - Stufe „propose“ für bestehende aktive Zugänge (harmlos: alles landet
 *   nur als Vorschlag).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS agent_proposals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_token_id TEXT REFERENCES api_tokens(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('time_entry', 'ticket_comment', 'customer_note')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
      title TEXT NOT NULL,
      reason TEXT,
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      payload JSONB NOT NULL,
      customer_id TEXT,
      ticket_id TEXT,
      batch_id TEXT,
      result_ref TEXT,
      decided_by TEXT,
      decided_at TIMESTAMP,
      decision_note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_agent_proposals_user_status ON agent_proposals(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_proposals_org ON agent_proposals(organization_id, created_at DESC);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_notes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('billing', 'technical', 'contact', 'general')),
      content TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT,
      via_proposal_id TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(organization_id, customer_id) WHERE deleted_at IS NULL;
  `);

  await client.query(`
    UPDATE api_tokens SET scopes = array_append(scopes, 'propose')
     WHERE revoked_at IS NULL AND scopes IS NOT NULL AND NOT ('propose' = ANY(scopes));
  `);

  logger.info('✅ Vorschlags-Inbox + Kundengedächtnis bereit');
}
