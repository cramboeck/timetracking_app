import { PoolClient } from 'pg';

/** Vorschlagstyp „invoice“: der Agent schlägt eine Rechnung (Kunde + Zeitraum)
 *  vor, angelegt wird sie nur über den normalen Rechnungsdialog in der App. */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE agent_proposals DROP CONSTRAINT IF EXISTS agent_proposals_type_check`);
  await client.query(`
    ALTER TABLE agent_proposals ADD CONSTRAINT agent_proposals_type_check
      CHECK (type IN ('time_entry', 'ticket_comment', 'customer_note', 'invoice'))
  `);
}
