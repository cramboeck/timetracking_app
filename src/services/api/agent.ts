/**
 * Agenten-Programm Phase B: Vorschlags-Inbox, Kundengedächtnis.
 */
import { authFetch } from './base';
import type { TimeEntry } from '../../types';

export type ProposalType = 'time_entry' | 'ticket_comment' | 'customer_note' | 'invoice';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type NoteCategory = 'billing' | 'technical' | 'contact' | 'general';

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  billing: 'Abrechnung',
  technical: 'Technik',
  contact: 'Ansprechpartner',
  general: 'Allgemein',
};

export interface ProposalSource {
  kind: 'email' | 'calendar' | 'chat' | 'ticket' | 'document' | 'other';
  label: string;
  ref?: string;
  date?: string;
}

export interface TimeEntryProposalPayload {
  startTime: string;
  endTime: string;
  duration: number;
  projectId?: string | null;
  ticketId?: string | null;
  activityId?: string | null;
  entryScope: 'customer_project' | 'internal' | 'absence';
  internalCategory?: string | null;
  description: string;
  isBillable: boolean;
  warnings?: string[];
}
export interface CommentProposalPayload { ticketId: string; content: string; isInternal: boolean }
export interface NoteProposalPayload { customerId: string; category: NoteCategory; content: string }
export interface InvoiceProposalPayload {
  customerId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  header?: string;
  headText?: string;
  note?: string;
  warnings?: Array<'not_linked' | 'no_open_hours' | 'already_billed'>;
}

interface ProposalBase {
  id: string;
  status: ProposalStatus;
  title: string;
  reason: string | null;
  sources: ProposalSource[];
  customerId: string | null;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  ticketTitle: string | null;
  projectName: string | null;
  tokenName: string | null;
  batchId: string | null;
  resultRef: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: string;
  expiresAt: string | null;
  ownerId: string;
  ownerName: string | null;
}
export type Proposal =
  | (ProposalBase & { type: 'time_entry'; payload: TimeEntryProposalPayload })
  | (ProposalBase & { type: 'ticket_comment'; payload: CommentProposalPayload })
  | (ProposalBase & { type: 'customer_note'; payload: NoteProposalPayload })
  | (ProposalBase & { type: 'invoice'; payload: InvoiceProposalPayload });

export interface CustomerNote {
  id: string;
  category: NoteCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  viaAgent: boolean;
}

const stripNulls = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export const agentApi = {
  proposals: async (status: 'pending' | 'history' = 'pending'): Promise<{ success: boolean; data: Proposal[] }> =>
    authFetch(`/agent/proposals?status=${status}`),
  pendingCount: async (): Promise<{ success: boolean; data: { pending: number } }> =>
    authFetch('/agent/proposals/count'),
  /** Rechnungs-Vorschlag als erledigt vermerken — NACHDEM die Rechnung im normalen Dialog angelegt wurde. */
  approveInvoice: async (id: string, invoiceNumber?: string): Promise<{ success: boolean }> =>
    authFetch(`/agent/proposals/${encodeURIComponent(id)}/approve-invoice`, { method: 'POST', body: JSON.stringify(invoiceNumber ? { invoiceNumber } : {}) }),
  reject: async (id: string, note?: string): Promise<{ success: boolean }> =>
    authFetch(`/agent/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) }),

  /** Zeit-Vorschlag übernehmen — über den normalen Zeiteintrags-Endpunkt. */
  approveTimeEntry: async (id: string, p: TimeEntryProposalPayload, clientId: string): Promise<{ success: boolean; data: TimeEntry }> => {
    const { warnings: _w, ...rest } = p;
    void _w;
    return authFetch('/entries', {
      method: 'POST',
      body: JSON.stringify({ ...stripNulls(rest), isRunning: false, proposalId: id, clientId }),
    });
  },
  /** Kommentar-Vorschlag übernehmen — über den normalen Kommentar-Endpunkt. */
  approveComment: async (id: string, p: CommentProposalPayload): Promise<{ success: boolean }> =>
    authFetch(`/tickets/${encodeURIComponent(p.ticketId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: p.content, isInternal: p.isInternal, notifyCustomer: !p.isInternal, proposalId: id }),
    }),
  approveNote: async (id: string, edits: { category?: NoteCategory; content?: string }): Promise<{ success: boolean }> =>
    authFetch(`/agent/proposals/${encodeURIComponent(id)}/approve-note`, { method: 'POST', body: JSON.stringify(edits) }),

  notes: async (customerId: string): Promise<{ success: boolean; data: CustomerNote[] }> =>
    authFetch(`/agent/customers/${encodeURIComponent(customerId)}/notes`),
  createNote: async (customerId: string, input: { category: NoteCategory; content: string }): Promise<{ success: boolean }> =>
    authFetch(`/agent/customers/${encodeURIComponent(customerId)}/notes`, { method: 'POST', body: JSON.stringify(input) }),
  updateNote: async (id: string, input: { category: NoteCategory; content: string }): Promise<{ success: boolean }> =>
    authFetch(`/agent/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteNote: async (id: string): Promise<{ success: boolean }> =>
    authFetch(`/agent/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
