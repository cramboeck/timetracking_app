import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * CRM-5 „Eine Kontakt-Wahrheit" (Flow-Review CRM, 11/2026):
 * Historisch gab es ZWEI Kontakt-Datenbestände, die nichts voneinander
 * wussten — die Settings-Kontaktverwaltung schrieb in customer_portal_users
 * (Portal-Login-Konten), der CRM-CustomerHub liest customer_contacts.
 * In den Settings gepflegte Kontakte waren im CRM unsichtbar.
 *
 * Diese Migration macht customer_contacts zur einzigen Kontakt-Quelle:
 * 1. Bestehende Kontakte mit gleicher E-Mail am selben Kunden werden mit
 *    ihrem Portal-User VERKNÜPFT (portal_user_id), statt Duplikate zu bauen.
 * 2. Für jeden Portal-User ohne verknüpften Kontakt wird ein
 *    customer_contacts-Eintrag erzeugt (Name/E-Mail/Kunde übernommen).
 * Beides idempotent (NOT EXISTS) — nichts wird gelöscht oder überschrieben.
 */
export async function run(client: PoolClient): Promise<void> {
  // 1. Verknüpfen: Kontakt existiert schon (gleiche Mail, gleicher Kunde),
  //    hängt aber noch an keinem Portal-User
  const linked = await client.query(`
    UPDATE customer_contacts cc
    SET portal_user_id = cpu.id, updated_at = NOW()
    FROM customer_portal_users cpu
    WHERE cc.portal_user_id IS NULL
      AND cpu.customer_id = cc.customer_id
      AND cpu.email IS NOT NULL AND cc.email IS NOT NULL
      AND LOWER(cpu.email) = LOWER(cc.email)
      AND NOT EXISTS (
        SELECT 1 FROM customer_contacts cc2 WHERE cc2.portal_user_id = cpu.id
      )
  `);

  // 2. Fehlende Kontakte anlegen. organization_id ist NOT NULL — Legacy-
  //    Portal-User ohne Org erben sie vom Kunden; ohne beides wird die
  //    Zeile übersprungen (verwaister Datensatz). Namens-Split best effort:
  //    letztes Wort = Nachname (NOT NULL, Fallback E-Mail/Name komplett).
  const created = await client.query(`
    INSERT INTO customer_contacts (
      id, organization_id, customer_id, first_name, last_name, email,
      is_primary, portal_user_id, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      COALESCE(cpu.organization_id, c.organization_id),
      cpu.customer_id,
      NULLIF(TRIM(REGEXP_REPLACE(COALESCE(cpu.name, ''), '\\S+$', '')), ''),
      COALESCE(
        NULLIF(TRIM(SUBSTRING(COALESCE(cpu.name, '') FROM '\\S+$')), ''),
        NULLIF(TRIM(cpu.name), ''),
        cpu.email,
        'Kontakt'
      ),
      cpu.email,
      COALESCE(cpu.is_primary_contact, false),
      cpu.id,
      COALESCE(cpu.created_at, NOW()),
      NOW()
    FROM customer_portal_users cpu
    JOIN customers c ON c.id = cpu.customer_id
    WHERE COALESCE(cpu.organization_id, c.organization_id) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customer_contacts cc WHERE cc.portal_user_id = cpu.id
      )
  `);

  if ((linked.rowCount || 0) > 0 || (created.rowCount || 0) > 0) {
    logger.info(
      `✅ Kontakt-Vereinheitlichung: ${linked.rowCount} Portal-User mit bestehenden Kontakten verknüpft, ${created.rowCount} Kontakte aus Portal-Usern erzeugt`
    );
  }
}
