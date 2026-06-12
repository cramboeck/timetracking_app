import { useEffect, useState } from 'react';
import {
  Search, X, Loader2, Receipt, FileText, FileSignature,
  AlertCircle, Inbox,
} from 'lucide-react';
import {
  sevdeskApi, microsoft365Api,
  DocumentSearchResult,
} from '../services/api';
import { Button } from './ui/Button';
import { SourceBadge } from './ui/SourceBadge';

type TypeFilter = 'all' | 'invoice' | 'quote' | 'voucher';

interface VendorSearchResult {
  id: string;
  email_subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string;
  status: string;
  vendor_id: string | null;
  vendor_name: string | null;
  attachment_count: number;
  document_ids: string[];
  processed_at: string | null;
  source: 'email' | 'manual' | 'sevdesk_import' | null;
  supplier_name: string | null;
  invoice_number: string | null;
  sevdesk_voucher_number: string | null;
  rank: number;
}

const formatCurrency = (amount: number | null | undefined) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(amount ?? 0);

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE');
};

// sevDesk status badges. Invoice (type=invoice) and quote use different status
// codes; mirrors getStatusColor from Finanzen.tsx so the look stays consistent.
const sevdeskStatusColor = (status: number, type: 'invoice' | 'quote'): string => {
  if (type === 'invoice') {
    switch (status) {
      case 100: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
      case 200: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 1000: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
    }
  }
  switch (status) {
    case 100: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
    case 200: return 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary';
    case 300: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 400: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
  }
};

const vendorStatusColor = (status: string): string => {
  switch (status) {
    case 'processed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'draft': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-400';
  }
};

export const DocumentsSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const [invoiceResults, setInvoiceResults] = useState<DocumentSearchResult[]>([]);
  const [quoteResults, setQuoteResults] = useState<DocumentSearchResult[]>([]);
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);

  // Per-section error so a single source going down doesn't blank the others.
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [vendorError, setVendorError] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setInvoiceResults([]);
      setQuoteResults([]);
      setVendorResults([]);
      setInvoiceError(null);
      setQuoteError(null);
      setVendorError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const t = setTimeout(async () => {
      const wantInvoices = typeFilter === 'all' || typeFilter === 'invoice';
      const wantQuotes = typeFilter === 'all' || typeFilter === 'quote';
      const wantVouchers = typeFilter === 'all' || typeFilter === 'voucher';

      const [invRes, qRes, voRes] = await Promise.allSettled([
        wantInvoices
          ? sevdeskApi.searchDocuments(q, { type: 'invoice', limit: 30 })
          : Promise.resolve({ success: true, data: [] as DocumentSearchResult[] }),
        wantQuotes
          ? sevdeskApi.searchDocuments(q, { type: 'quote', limit: 30 })
          : Promise.resolve({ success: true, data: [] as DocumentSearchResult[] }),
        wantVouchers
          ? microsoft365Api.searchProcessedInvoices(q, { limit: 30 })
          : Promise.resolve({ success: true, data: [] as VendorSearchResult[] }),
      ]);

      if (invRes.status === 'fulfilled' && invRes.value.success) {
        setInvoiceResults(invRes.value.data);
        setInvoiceError(null);
      } else {
        setInvoiceResults([]);
        setInvoiceError(invRes.status === 'rejected'
          ? (invRes.reason?.message || 'Rechnungen-Suche fehlgeschlagen')
          : 'Rechnungen-Suche fehlgeschlagen');
      }

      if (qRes.status === 'fulfilled' && qRes.value.success) {
        setQuoteResults(qRes.value.data);
        setQuoteError(null);
      } else {
        setQuoteResults([]);
        setQuoteError(qRes.status === 'rejected'
          ? (qRes.reason?.message || 'Angebote-Suche fehlgeschlagen')
          : 'Angebote-Suche fehlgeschlagen');
      }

      if (voRes.status === 'fulfilled' && voRes.value.success) {
        setVendorResults(voRes.value.data as VendorSearchResult[]);
        setVendorError(null);
      } else {
        setVendorResults([]);
        setVendorError(voRes.status === 'rejected'
          ? (voRes.reason?.message || 'Belege-Suche fehlgeschlagen')
          : 'Belege-Suche fehlgeschlagen');
      }

      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, typeFilter]);

  const hasQuery = searchQuery.trim().length >= 2;
  const showInvoices = typeFilter === 'all' || typeFilter === 'invoice';
  const showQuotes = typeFilter === 'all' || typeFilter === 'quote';
  const showVouchers = typeFilter === 'all' || typeFilter === 'voucher';
  const totalHits = invoiceResults.length + quoteResults.length + vendorResults.length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Search className="text-accent-primary" />
          Dokumenten-Suche
        </h1>
        <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
          Rechnungen, Angebote und Belege gleichzeitig durchsuchen.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchbegriff (Nummer, Kunde, Absender, PDF-Inhalt…)"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400 hover:text-gray-600 dark:hover:text-white"
            aria-label="Suche zurücksetzen"
          >
            <X size={14} />
          </button>
        )}
        {searching && (
          <Loader2 size={14} className="absolute right-9 top-1/2 -translate-y-1/2 text-accent-primary animate-spin" />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'invoice', 'quote', 'voucher'] as const).map(f => (
          <Button
            key={f}
            size="sm"
            variant={typeFilter === f ? 'primary' : 'ghost'}
            onClick={() => setTypeFilter(f)}
          >
            {f === 'all' ? 'Alle' : f === 'invoice' ? 'Rechnungen' : f === 'quote' ? 'Angebote' : 'Belege'}
          </Button>
        ))}
        {hasQuery && !searching && (
          <span className="text-xs text-gray-500 dark:text-dark-400 self-center ml-2">
            {totalHits} Treffer
          </span>
        )}
      </div>

      {!hasQuery && (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-dark-400">
          Mindestens 2 Zeichen eingeben.
        </div>
      )}

      {hasQuery && (
        <div className="space-y-6">
          {showInvoices && (
            <ResultSection
              title="Rechnungen"
              icon={<Receipt size={16} className="text-accent-primary" />}
              count={invoiceResults.length}
              error={invoiceError}
              loading={searching && invoiceResults.length === 0 && !invoiceError}
              empty="Keine Rechnungen gefunden."
            >
              {invoiceResults.map(r => (
                <SevdeskCard key={r.id} doc={r} />
              ))}
            </ResultSection>
          )}

          {showQuotes && (
            <ResultSection
              title="Angebote"
              icon={<FileSignature size={16} className="text-accent-primary" />}
              count={quoteResults.length}
              error={quoteError}
              loading={searching && quoteResults.length === 0 && !quoteError}
              empty="Keine Angebote gefunden."
            >
              {quoteResults.map(r => (
                <SevdeskCard key={r.id} doc={r} />
              ))}
            </ResultSection>
          )}

          {showVouchers && (
            <ResultSection
              title="Belege"
              icon={<Inbox size={16} className="text-accent-primary" />}
              count={vendorResults.length}
              error={vendorError}
              loading={searching && vendorResults.length === 0 && !vendorError}
              empty="Keine Belege gefunden. Tipp: Belege werden erst nach Daten-Extraktion durchsuchbar."
            >
              {vendorResults.map(r => (
                <VendorCard key={r.id} doc={r} />
              ))}
            </ResultSection>
          )}
        </div>
      )}
    </div>
  );
};

interface ResultSectionProps {
  title: string;
  icon: React.ReactNode;
  count: number;
  error: string | null;
  loading: boolean;
  empty: string;
  children: React.ReactNode;
}

const ResultSection = ({ title, icon, count, error, loading, empty, children }: ResultSectionProps) => (
  <section>
    <div className="flex items-center gap-2 mb-2 px-1">
      {icon}
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
        {title} <span className="text-gray-400 dark:text-dark-400 font-normal">({count})</span>
      </h2>
    </div>
    {error ? (
      <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
        <AlertCircle size={16} />
        {error}
      </div>
    ) : loading ? (
      <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-dark-400">
        <Loader2 size={16} className="inline-block animate-spin mr-2" />
        Lädt…
      </div>
    ) : count === 0 ? (
      <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-dark-400 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg">
        {empty}
      </div>
    ) : (
      <ul className="space-y-2">{children}</ul>
    )}
  </section>
);

const SevdeskCard = ({ doc }: { doc: DocumentSearchResult }) => (
  <li className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow">
    <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
      {doc.documentType === 'invoice'
        ? <Receipt size={20} className="text-gray-500 dark:text-dark-400" />
        : <FileSignature size={20} className="text-gray-500 dark:text-dark-400" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
          {doc.documentNumber || '(ohne Nr.)'}
        </span>
        <span className={`px-2 py-0.5 text-xs rounded-full ${sevdeskStatusColor(doc.status, doc.documentType)}`}>
          {doc.statusName}
        </span>
      </div>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate mt-0.5">
        {doc.contactName || '(ohne Kontakt)'}
      </p>
    </div>
    <div className="text-right flex-shrink-0">
      <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
        {formatCurrency(doc.sumGross)}
      </p>
      <p className="text-xs text-gray-500 dark:text-dark-400">
        {formatDate(doc.documentDate)}
      </p>
    </div>
  </li>
);

const VendorCard = ({ doc }: { doc: VendorSearchResult }) => {
  const title = doc.invoice_number
    || doc.sevdesk_voucher_number
    || doc.email_subject
    || '(Kein Betreff)';
  const supplier = doc.supplier_name || doc.sender_name || doc.sender_email || 'Unbekannter Absender';
  return (
    <li className="flex items-start gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow">
      <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
        <FileText size={20} className="text-gray-500 dark:text-dark-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">
            {title}
          </span>
          <SourceBadge source={doc.source} />
          <span className={`px-2 py-0.5 text-xs rounded-full ${vendorStatusColor(doc.status)}`}>
            {doc.status}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate mt-0.5">
          {supplier}
          {doc.vendor_name && ` · ${doc.vendor_name}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-gray-500 dark:text-dark-400">
          {formatDate(doc.received_at)}
        </p>
        {doc.attachment_count > 0 && (
          <p className="text-[10px] text-gray-400 dark:text-dark-400 mt-0.5">
            {doc.attachment_count} Anhang{doc.attachment_count > 1 ? 'e' : ''}
          </p>
        )}
      </div>
    </li>
  );
};
