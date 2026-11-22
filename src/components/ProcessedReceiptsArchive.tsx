import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from './ui/Button';
import { SourceBadge, ReceiptSource } from './ui/SourceBadge';
import { formatCurrency, formatDate } from '../utils/formatting';
import { microsoft365Api, ProcessedInvoice } from '../services/api';

/**
 * Archiv der verbuchten Eingangsbelege (E-Mail, manueller Upload,
 * sevDesk-Import). Lebte vorher als versteckter Reiter „Eingangsbelege"
 * hinter Finanzen → Abrechnung — samt einer dritten Kopie der Entwurfs-
 * Warteschlange. Jetzt der zweite Reiter im Rechnungseingang (FIN-1).
 */

interface ArchivedReceipt {
  id: string;
  number: string;
  date: string;
  supplier: string | null;
  grossAmount: number;
  source?: ReceiptSource;
  sevdeskVoucherId: string | null;
}

const toArchivedReceipt = (pi: ProcessedInvoice): ArchivedReceipt => ({
  id: pi.id,
  number: pi.sevdeskVoucherNumber || pi.invoiceNumber || pi.originalFilename || '—',
  date: pi.invoiceDate || pi.receivedAt,
  supplier: pi.supplierName || pi.senderName || null,
  grossAmount: pi.grossAmount ?? 0,
  source: pi.source,
  sevdeskVoucherId: pi.sevdeskVoucherId || null,
});

export const ProcessedReceiptsArchive = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const receiptsQuery = useQuery({
    queryKey: ['invoices', 'archive'],
    queryFn: async () => {
      const res = await microsoft365Api.getProcessedInvoices({
        status: 'processed,imported',
        source: 'email,manual,sevdesk_import',
        limit: 500,
      });
      return (res.data || []).map(toArchivedReceipt);
    },
    staleTime: 60_000,
  });

  const receipts = receiptsQuery.data ?? [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? receipts.filter(r =>
        r.number.toLowerCase().includes(q) ||
        (r.supplier && r.supplier.toLowerCase().includes(q)))
    : receipts;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Verbuchte Belege durchsuchen (Nummer, Lieferant)…"
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => receiptsQuery.refetch()}
          icon={<RefreshCw size={16} className={receiptsQuery.isFetching ? 'animate-spin' : ''} />}
        >
          <span className="hidden sm:inline">Aktualisieren</span>
        </Button>
      </div>

      {receiptsQuery.isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={24} className="animate-spin text-accent-primary" />
        </div>
      ) : receiptsQuery.isError ? (
        <p className="p-4 text-sm text-red-600 dark:text-red-400">
          Verbuchte Belege konnten nicht geladen werden.
        </p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500 dark:text-dark-400">
          <CreditCard size={32} className="mx-auto mb-2 opacity-50" />
          {q ? `Keine Belege für „${searchQuery}"` : 'Noch keine verbuchten Belege'}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 first:rounded-t-xl last:rounded-b-xl">
              <CreditCard size={16} className="text-gray-400 dark:text-dark-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white truncate">{r.number}</span>
                  <SourceBadge source={r.source} />
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                  {r.supplier || 'Kein Lieferant'} · {formatDate(r.date)}
                </p>
              </div>
              <span className="font-medium text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                {formatCurrency(r.grossAmount)}
              </span>
              {r.source === 'sevdesk_import' && r.sevdeskVoucherId && (
                <a
                  href={`https://my.sevdesk.de/voucher/${r.sevdeskVoucherId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  title="In sevDesk öffnen"
                >
                  <ExternalLink size={15} className="text-gray-400 dark:text-dark-400" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {receipts.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-dark-400">
          {filtered.length} von {receipts.length} verbuchten Belegen
        </p>
      )}
    </div>
  );
};

export default ProcessedReceiptsArchive;
