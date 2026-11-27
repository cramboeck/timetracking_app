import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Paket „KI-Agent“ (27.11.2026): Claude/MCP-Zugänge und KI-Vorschläge sind
 * ab jetzt pro Nutzer im Adminportal freizuschalten (Standard: aus).
 *
 * Einmalige Startbelegung: Org-Owner und System-Admins bekommen das Paket,
 * damit bestehende Zugänge nicht plötzlich ausgesperrt sind. Migrationen
 * laufen bei JEDEM Start — deshalb nur, solange es noch keine einzige
 * agent-Zeile gibt. Danach entscheidet ausschließlich das Adminportal
 * (ein abgeschaltetes Paket wird nie wieder automatisch eingeschaltet).
 */
export async function run(client: PoolClient): Promise<void> {
  const seeded = await client.query(`SELECT 1 FROM feature_packages WHERE package_name = 'agent' LIMIT 1`);
  if (seeded.rows.length > 0) return;

  const r = await client.query(`
    INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at)
    SELECT gen_random_uuid()::text, u.id, 'agent', true, NOW()
      FROM users u
     WHERE u.role = 'admin'
        OR EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id AND om.role = 'owner')
    ON CONFLICT (user_id, package_name) DO NOTHING
  `);
  logger.info(`✅ Paket „KI-Agent“ eingeführt — ${r.rowCount ?? 0} Owner/Admins freigeschaltet`);
}
