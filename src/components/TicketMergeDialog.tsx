import { useState, useEffect } from 'react';
import { X, Search, Merge, AlertTriangle, Check } from 'lucide-react';
import { Ticket } from '../types';
import { ticketsApi } from '../services/api';

interface TicketMergeDialogProps {
  isOpen: boolean;
  targetTicket: Ticket;
  onClose: () => void;
  onMerged: (mergedTicket: Ticket) => void;
}

export const TicketMergeDialog = ({
  isOpen,
  targetTicket,
  onClose,
  onMerged,
}: TicketMergeDialogProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Ticket[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<Ticket[]>([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedTickets([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchTickets = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await ticketsApi.search(searchQuery);
        // Filter out the target ticket, already selected tickets, and tickets from different customers
        const filtered = response.data.filter(
          (ticket) =>
            ticket.id !== targetTicket.id &&
            !selectedTickets.some((s) => s.id === ticket.id) &&
            ticket.status !== 'archived' &&
            ticket.customerId === targetTicket.customerId // Only same customer
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(searchTickets, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, targetTicket.id, targetTicket.customerId, selectedTickets]);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTickets((prev) => [...prev, ticket]);
    setSearchResults((prev) => prev.filter((t) => t.id !== ticket.id));
    setSearchQuery('');
  };

  const handleRemoveTicket = (ticketId: string) => {
    setSelectedTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  const handleMerge = async () => {
    if (selectedTickets.length === 0) return;

    setMerging(true);
    setError(null);

    try {
      const response = await ticketsApi.merge(
        targetTicket.id,
        selectedTickets.map((t) => t.id)
      );
      onMerged(response.data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Zusammenführen der Tickets');
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Merge className="text-accent-primary" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Tickets zusammenführen
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                in {targetTicket.ticketNumber}: {targetTicket.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {/* Info */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Achtung: Diese Aktion kann nicht rückgängig gemacht werden!</p>
                <p>
                  Alle Kommentare, Anhänge und Zeiteinträge werden in das Ziel-Ticket übertragen.
                  Die Quell-Tickets werden geschlossen.
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tickets zum Zusammenführen suchen
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ticket-Nummer oder Titel eingeben..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent-primary"></div>
                </div>
              )}
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-3 py-1.5 bg-gray-50 dark:bg-gray-900">
                Suchergebnisse
              </div>
              <div className="max-h-40 overflow-y-auto">
                {searchResults.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => handleSelectTicket(ticket)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700 first:border-t-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                          {ticket.ticketNumber}
                        </span>
                        <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {ticket.title}
                        </span>
                      </div>
                      <span className="text-xs text-accent-primary">Auswählen</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Tickets */}
          {selectedTickets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ausgewählte Tickets ({selectedTickets.length})
              </label>
              <div className="space-y-2">
                {selectedTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between px-3 py-2 bg-accent-primary/10 border border-accent-primary/30 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-accent-primary" />
                      <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                        {ticket.ticketNumber}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {ticket.title}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveTicket(ticket.id)}
                      className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={onClose}
            disabled={merging}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleMerge}
            disabled={selectedTickets.length === 0 || merging}
            className="flex items-center gap-2 px-4 py-2 btn-accent rounded-lg disabled:opacity-50"
          >
            {merging ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Zusammenführen...
              </>
            ) : (
              <>
                <Merge size={18} />
                {selectedTickets.length} Ticket{selectedTickets.length !== 1 ? 's' : ''} zusammenführen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
