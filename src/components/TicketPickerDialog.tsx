import { useState, useEffect, useMemo } from 'react';
import { Search, Ticket as TicketIcon, X, Loader2, User } from 'lucide-react';
import { ticketsApi } from '../services/api';
import { Ticket, TicketStatus } from '../types';
import { IconButton } from './ui/Button';

interface TicketPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (ticket: Ticket) => void | Promise<void>;
  /** Kontext-Zeile im Header, z.B. der E-Mail-Betreff */
  contextLabel?: string;
  /** Erkannter Kunde des Absenders — dessen Tickets werden zuoberst gelistet */
  matchedCustomerId?: string | null;
  matchedCustomerName?: string | null;
  /** Während onSelect läuft (Button-Spinner auf der gewählten Zeile) */
  selectingTicketId?: string | null;
}

const STATUS_LABELS: Partial<Record<TicketStatus, { label: string; className: string }>> = {
  open: { label: 'Offen', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  in_progress: { label: 'In Bearbeitung', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  waiting: { label: 'Wartend', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  resolved: { label: 'Gelöst', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  closed: { label: 'Geschlossen', className: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400' },
};

/**
 * Ticket-Auswahl zum manuellen Anhängen einer E-Mail an ein beliebiges
 * bestehendes Ticket. Offene Tickets des erkannten Kunden stehen zuoberst,
 * die Suche filtert über Nummer, Titel und Kundenname.
 */
export const TicketPickerDialog = ({
  isOpen,
  onClose,
  onSelect,
  contextLabel,
  matchedCustomerId,
  matchedCustomerName,
  selectingTicketId,
}: TicketPickerDialogProps) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setLoading(true);
    ticketsApi
      .getAll({ limit: 200 })
      .then(res => setTickets(res.data || []))
      .catch(err => console.error('Failed to load tickets for picker:', err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter(t => t.status !== 'archived')
      .filter(t => includeClosed || (t.status !== 'closed' && t.status !== 'resolved'))
      .filter(t => {
        if (!q) return true;
        return (
          t.ticketNumber.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.customerName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Tickets des erkannten Kunden zuoberst, dann jüngste zuerst
        if (matchedCustomerId) {
          const aMatch = a.customerId === matchedCustomerId ? 0 : 1;
          const bMatch = b.customerId === matchedCustomerId ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      })
      .slice(0, 50);
  }, [tickets, search, includeClosed, matchedCustomerId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden pointer-events-auto">
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TicketIcon size={18} className="text-accent-primary" />
                An Ticket anhängen
              </h2>
              {contextLabel && (
                <p className="text-sm text-gray-500 dark:text-dark-400 truncate mt-0.5">{contextLabel}</p>
              )}
            </div>
            <IconButton onClick={onClose} icon={<X size={18} />} size="sm" />
          </div>

          {/* Search + Filter */}
          <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ticket-Nummer, Titel oder Kunde suchen…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-dark-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeClosed}
                  onChange={e => setIncludeClosed(e.target.checked)}
                  className="rounded"
                />
                Auch gelöste/geschlossene anzeigen
              </label>
              {matchedCustomerName && (
                <span className="flex items-center gap-1 text-xs text-accent-dark dark:text-accent-primary">
                  <User size={12} />
                  {matchedCustomerName}
                </span>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-400">
                Keine passenden Tickets gefunden.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {filtered.map(ticket => {
                  const status = STATUS_LABELS[ticket.status];
                  const isCustomerMatch = matchedCustomerId && ticket.customerId === matchedCustomerId;
                  const isSelecting = selectingTicketId === ticket.id;
                  return (
                    <button
                      key={ticket.id}
                      onClick={() => onSelect(ticket)}
                      disabled={!!selectingTicketId}
                      className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors disabled:opacity-60 ${
                        isCustomerMatch ? 'bg-accent-light/40 dark:bg-accent-primary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500 dark:text-dark-400 flex-shrink-0">
                          {ticket.ticketNumber}
                        </span>
                        {status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${status.className}`}>
                            {status.label}
                          </span>
                        )}
                        {isSelecting && <Loader2 size={14} className="animate-spin text-accent-primary flex-shrink-0" />}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate mt-0.5">
                        {ticket.title}
                      </p>
                      {ticket.customerName && (
                        <p className="text-xs text-gray-500 dark:text-dark-400 truncate">{ticket.customerName}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
