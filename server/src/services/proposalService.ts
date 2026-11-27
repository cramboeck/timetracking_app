import { query } from '../config/database';

/**
 * Vorschlags-Inbox (Phase B): Ein Agent legt Vorschläge an, der Mensch
 * übernimmt sie in der App. Die Übernahme läuft für Zeiteinträge und
 * Ticket-Kommentare über die NORMALEN Endpunkte (POST /entries,
 * POST /tickets/:id/comments) mit `proposalId` — so greifen alle Regeln
 * (Überschneidung, Nachtrags-Protokoll, Benachrichtigungen) unverändert.
 */
export type ProposalType = 'time_entry' | 'ticket_comment' | 'customer_note';

export class ProposalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Prüft, dass der Vorschlag offen ist und dem eingeloggten Menschen gehört.
 * Ein API-Zugang darf NIE einen Vorschlag übernehmen (sonst könnte der Agent
 * sich selbst freigeben) — die Aufrufer übergeben deshalb `viaApiToken`.
 */
export async function claimProposal(
  proposalId: string,
  userId: string,
  organizationId: string,
  type: ProposalType,
  viaApiToken: boolean
): Promise<{ apiTokenId: string | null }> {
  if (viaApiToken) {
    throw new ProposalError(403, 'Vorschläge können nur in der App übernommen werden');
  }
  const r = await query(
    `SELECT id, status, type, api_token_id, expires_at
       FROM agent_proposals
      WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
    [proposalId, userId, organizationId]
  );
  const row = r.rows[0] as { status: string; type: string; api_token_id: string | null; expires_at: Date | null } | undefined;
  if (!row || row.type !== type) throw new ProposalError(404, 'Vorschlag nicht gefunden');
  if (row.status !== 'pending') throw new ProposalError(409, 'Vorschlag ist nicht mehr offen');
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new ProposalError(409, 'Vorschlag ist abgelaufen');
  }
  return { apiTokenId: row.api_token_id };
}

export async function markProposalApproved(proposalId: string, userId: string, resultRef: string, note?: string | null) {
  await query(
    `UPDATE agent_proposals
        SET status = 'approved', result_ref = $3, decided_by = $2, decided_at = NOW(), decision_note = $4
      WHERE id = $1 AND status = 'pending'`,
    [proposalId, userId, resultRef, note ?? null]
  );
}
