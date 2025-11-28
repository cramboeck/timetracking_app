import { useState, useEffect, Fragment } from 'react';
import {
  FileText,
  Receipt,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { sevdeskApi, SevdeskInvoice, SevdeskQuote } from '../services/api';

type DocumentType = 'invoices' | 'quotes';

interface DocumentDetailProps {
  type: DocumentType;
  document: SevdeskInvoice | SevdeskQuote;
  onClose: () => void;
}

const DocumentDetail = ({ type, document, onClose }: DocumentDetailProps) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SevdeskInvoice | SevdeskQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  const togglePosition = (posId: string) => {
    setExpandedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(posId)) {
        newSet.delete(posId);
      } else {
        newSet.add(posId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadDetail();
  }, [document.id]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = type === 'invoices'
        ? await sevdeskApi.getInvoice(document.id)
        : await sevdeskApi.getQuote(document.id);
      setDetail(response.data);
    } catch (err: any) {
      console.error('Failed to load document detail:', err);
      setError(err.message || 'Fehler beim Laden des Dokuments');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {type === 'invoices' ? 'Rechnung' : 'Angebot'} {type === 'invoices' ? (document as SevdeskInvoice).invoiceNumber : (document as SevdeskQuote).quoteNumber}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-accent-primary" size={32} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Kunde:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{detail.contact.name}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Datum:</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(type === 'invoices' ? (detail as SevdeskInvoice).invoiceDate : (detail as SevdeskQuote).quoteDate)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Status:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{detail.statusName}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Betrag:</span>
                  <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(detail.sumGross)}</p>
                </div>
              </div>

              {/* Header Text */}
              {detail.header && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">Betreff:</span>
                  <p className="text-gray-900 dark:text-white">{detail.header}</p>
                </div>
              )}

              {/* Positions */}
              {detail.positions && detail.positions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Positionen</h4>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left p-2 text-gray-500 dark:text-gray-400 w-6"></th>
                          <th className="text-left p-2 text-gray-500 dark:text-gray-400">Beschreibung</th>
                          <th className="text-right p-2 text-gray-500 dark:text-gray-400">Menge</th>
                          <th className="text-right p-2 text-gray-500 dark:text-gray-400">Preis</th>
                          <th className="text-right p-2 text-gray-500 dark:text-gray-400">Summe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.positions.map((pos) => {
                          const isExpanded = expandedPositions.has(pos.id);
                          const hasText = pos.text && pos.text.trim().length > 0;
                          return (
                            <Fragment key={pos.id}>
                              <tr
                                className={`border-b border-gray-200 dark:border-gray-700 last:border-0 ${hasText ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : ''}`}
                                onClick={() => hasText && togglePosition(pos.id)}
                              >
                                <td className="p-2 text-gray-500 dark:text-gray-400">
                                  {hasText && (
                                    isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                                  )}
                                </td>
                                <td className="p-2 text-gray-900 dark:text-white">{pos.name}</td>
                                <td className="p-2 text-right text-gray-900 dark:text-white">{pos.quantity}</td>
                                <td className="p-2 text-right text-gray-900 dark:text-white">{formatCurrency(pos.price)}</td>
                                <td className="p-2 text-right text-gray-900 dark:text-white">{formatCurrency(pos.sumNet)}</td>
                              </tr>
                              {isExpanded && hasText && (
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                  <td colSpan={5} className="p-3 bg-gray-100 dark:bg-gray-800">
                                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                      {pos.text}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Netto:</span>
                  <span className="text-gray-900 dark:text-white">{formatCurrency(detail.sumNet)}</span>
                </div>
                {type === 'invoices' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">MwSt:</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency((detail as SevdeskInvoice).sumTax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold mt-2">
                  <span className="text-gray-900 dark:text-white">Brutto:</span>
                  <span className="text-gray-900 dark:text-white">{formatCurrency(detail.sumGross)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Dokument konnte nicht geladen werden
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const SevdeskDocuments = () => {
  const [activeTab, setActiveTab] = useState<DocumentType>('invoices');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SevdeskInvoice[]>([]);
  const [quotes, setQuotes] = useState<SevdeskQuote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<{ type: DocumentType; doc: SevdeskInvoice | SevdeskQuote } | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const [invoicesRes, quotesRes] = await Promise.all([
        sevdeskApi.getInvoices({ limit: 100 }),
        sevdeskApi.getQuotes({ limit: 100 }),
      ]);

      setInvoices(invoicesRes.data || []);
      setQuotes(quotesRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Dokumente');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  const getStatusColor = (status: number, type: DocumentType) => {
    if (type === 'invoices') {
      switch (status) {
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'; // Draft
        case 200: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'; // Open
        case 1000: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'; // Paid
        default: return 'bg-gray-100 text-gray-700';
      }
    } else {
      switch (status) {
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'; // Draft
        case 200: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'; // Sent
        case 300: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'; // Accepted
        case 400: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'; // Rejected
        default: return 'bg-gray-100 text-gray-700';
      }
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.header?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredQuotes = quotes.filter(quote =>
    quote.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    quote.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    quote.header?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          sevDesk Dokumente
        </h3>
        <button
          onClick={loadDocuments}
          disabled={loading}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertTriangle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'invoices'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Receipt size={18} />
          Rechnungen ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('quotes')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'quotes'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <FileText size={18} />
          Angebote ({quotes.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen nach Nummer, Kunde oder Betreff..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-accent-primary" size={32} />
        </div>
      ) : (
        <div className="space-y-2">
          {activeTab === 'invoices' ? (
            filteredInvoices.length === 0 ? (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                Keine Rechnungen gefunden
              </p>
            ) : (
              filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => setSelectedDocument({ type: 'invoices', doc: invoice })}
                  className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Receipt size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {invoice.invoiceNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(invoice.status, 'invoices')}`}>
                        {invoice.statusName}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {invoice.contact.name} • {invoice.header || 'Keine Beschreibung'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(invoice.sumGross)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </div>
              ))
            )
          ) : (
            filteredQuotes.length === 0 ? (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                Keine Angebote gefunden
              </p>
            ) : (
              filteredQuotes.map((quote) => (
                <div
                  key={quote.id}
                  onClick={() => setSelectedDocument({ type: 'quotes', doc: quote })}
                  className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <FileText size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {quote.quoteNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(quote.status, 'quotes')}`}>
                        {quote.statusName}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {quote.contact.name} • {quote.header || 'Keine Beschreibung'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(quote.sumGross)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(quote.quoteDate)}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </div>
              ))
            )
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedDocument && (
        <DocumentDetail
          type={selectedDocument.type}
          document={selectedDocument.doc}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
};

export default SevdeskDocuments;
