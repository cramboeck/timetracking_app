import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * API-Tokens für Maschinen-Zugriff (MCP-Server, Integrationen):
 * langlebige Tokens mit Präfix "rbf_", gespeichert wird NUR der
 * SHA-256-Hash (Klartext existiert einzig in der Create-Response).
 * token_prefix (erste 12 Zeichen) dient der Wiedererkennung in der UI.
 * Widerruf über revoked_at — Zeilen werden nie gelöscht (Audit).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      revoked_at TIMESTAMP
    )
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_tokens_user') THEN
        CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
      END IF;
    END $$;
  `);

  logger.info('✅ api_tokens ready (MCP-/Integrations-Zugriff)');
}
