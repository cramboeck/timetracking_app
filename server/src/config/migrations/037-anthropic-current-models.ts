import { PoolClient } from 'pg';

/**
 * Abgeschaltete Claude-Modelle (claude-3-*, claude-3-5-*, claude-2/instant) in
 * der KI-Konfiguration auf das aktuelle Modell derselben Klasse umstellen
 * (28.11.2026). Der Server bildet Altwerte zwar ohnehin ab
 * (utils/anthropic.ts), so zeigen aber auch die Einstellungen das echte Modell.
 * Idempotent: betrifft nur noch nicht umgestellte Zeilen.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE ai_config SET model = CASE
        WHEN model ILIKE '%haiku%' THEN 'claude-haiku-5-5'
        WHEN model ILIKE '%opus%' THEN 'claude-opus-5-5'
        ELSE 'claude-sonnet-5-5' END
     WHERE provider = 'anthropic' AND (model IS NULL OR model ~* '^claude-(3|2|instant)')
  `);
}
