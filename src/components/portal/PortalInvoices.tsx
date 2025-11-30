import { useState, useEffect } from 'react';
import { FileText, FileCheck, Clock, AlertCircle, RefreshCw, Search, Euro, Calendar, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { customerPortalApi, PortalContact, PortalInvoice, PortalQuote } from '../../services/api';

interface PortalInvoicesProps {
  contact: PortalContact;
}

type TabType = 'invoices' | 'quotes';

// sevDesk Invoice Status codes
const invoiceStatusLabels: Record<number, { label: string; color: string }> = {
  100: { label: 'Entwurf', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  200: { label: 'Offen', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  1000: { label: 'Bezahlt', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  // Dunning statuses
  750: { label: '1. Mahnung', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  800: { label: '2. Mahnung', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  850: { label: '3. Mahnung', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
};

// sevDesk Order (Quote) Status codes
const quoteStatusLabels: Record<number, { label: string; color: string }> = {
  100: { label: 'Entwurf', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  200: { label: 'Versendet', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  300: { label: 'Angenommen', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  400: { label: 'Abgelehnt', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export const PortalInvoices = ({ contact }: PortalInvoicesProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('invoices');
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [errorInvoices, setErrorInvoices] = useState<string | null>(null);
  const [errorQuotes, setErrorQuotes] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);

  useEffect(() => {
    if (contact.canViewInvoices) {
      loadInvoices();
    }
    if (contact.canViewQuotes) {
      loadQuotes();
    }
  }, [contact.canViewInvoices, contact.canViewQuotes]);

  const loadInvoices = async () => {
    try {
      setLoadingInvoices(true);
      setErrorInvoices(null);
      const response = await customerPortalApi.getInvoices();
      setInvoices(response.data || []);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      setErrorInvoices(err.message || 'Fehler beim Laden der Rechnungen');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const loadQuotes = async () => {
    try {
      setLoadingQuotes(true);
      setErrorQuotes(null);
      const response = await customerPortalApi.getQuotes();
      setQuotes(response.data || []);
    } catch (err: any) {
      console.error('Failed to load quotes:', err);
      setErrorQuotes(err.message || 'Fehler beim Laden der Angebote');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getInvoiceStatus = (status: number) => {
    return invoiceStatusLabels[status] || { label: `Status ${status}`, color: 'bg-gray-100 text-gray-700' };
  };

  const getQuoteStatus = (status: number) => {
    return quoteStatusLabels[status] || { label: `Status ${status}`, color: 'bg-gray-100 text-gray-700' };
  };

  const filteredInvoices = invoices.filter(invoice => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      invoice.invoiceNumber?.toLowerCase().includes(term) ||
      invoice.header?.toLowerCase().includes(term)
    );
  });

  const filteredQuotes = quotes.filter(quote => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      quote.orderNumber?.toLowerCase().includes(term) ||
      quote.header?.toLowerCase().includes(term)
    );
  });

  // Calculate totals
  const openInvoicesTotal = invoices
    .filter(i => i.status === 200)
    .reduce((sum, i) => sum + i.totalGross, 0);

  const paidInvoicesCount = invoices.filter(i => i.status === 1000).length;

  // Check permissions
  const canViewInvoices = contact.canViewInvoices;
  const canViewQuotes = contact.canViewQuotes;

  // If user has no permissions for either
  if (!canViewInvoices && !canViewQuotes) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <FileText size={48} className="mx-auto mb-4 opacity-50" />
        <p>Sie haben keine Berechtigung, Rechnungen oder Angebote einzusehen.</p>
      </div>
    );
  }

  // Set default tab based on permissions
  useEffect(() => {
    if (!canViewInvoices && canViewQuotes) {
      setActiveTab('quotes');
    }
  }, [canViewInvoices, canViewQuotes]);

  const loading = activeTab === 'invoices' ? loadingInvoices : loadingQuotes;
  const error = activeTab === 'invoices' ? errorInvoices : errorQuotes;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Finanzen
          </h2>
          {canViewInvoices && invoices.length > 0 && (
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                <Euro size={14} /> {formatCurrency(openInvoicesTotal)} offen
              </span>
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <FileCheck size={14} /> {paidInvoicesCount} bezahlt
              </span>
            </div>
          )}
        </div>
        <button
          onClick={activeTab === 'invoices' ? loadInvoices : loadQuotes}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw size={18} />
          Aktualisieren
        </button>
      </div>

      {/* Tabs */}
      {canViewInvoices && canViewQuotes && (
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'invoices'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <FileText size={16} className="inline mr-2" />
            Rechnungen ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'quotes'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <FileCheck size={16} className="inline mr-2" />
            Angebote ({quotes.length})
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={activeTab === 'invoices' ? 'Rechnung suchen...' : 'Angebot suchen...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'invoices' ? (
        /* Invoices List */
        filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine Rechnungen gefunden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map(invoice => {
              const status = getInvoiceStatus(invoice.status);
              const isExpanded = expandedInvoice === invoice.id;
              return (
                <div
                  key={invoice.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText size={20} className="text-gray-400" />
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {invoice.invoiceNumber}
                          </div>
                          {invoice.header && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                              {invoice.header}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(invoice.totalGross, invoice.currency)}
                        </span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Rechnungsdatum</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatDate(invoice.invoiceDate)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Lieferdatum</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatDate(invoice.deliveryDate)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Netto</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatCurrency(invoice.totalNet, invoice.currency)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">MwSt.</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {invoice.taxRate}%
                          </div>
                        </div>
                        {invoice.payDate && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Bezahlt am</span>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              {formatDate(invoice.payDate)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Quotes List */
        filteredQuotes.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <FileCheck size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine Angebote gefunden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuotes.map(quote => {
              const status = getQuoteStatus(quote.status);
              const isExpanded = expandedQuote === quote.id;
              return (
                <div
                  key={quote.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => setExpandedQuote(isExpanded ? null : quote.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileCheck size={20} className="text-gray-400" />
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {quote.orderNumber}
                          </div>
                          {quote.header && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                              {quote.header}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(quote.totalGross, quote.currency)}
                        </span>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Angebotsdatum</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatDate(quote.orderDate)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Gültig bis</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatDate(quote.validUntil)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Netto</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatCurrency(quote.totalNet, quote.currency)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">MwSt.</span>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {quote.taxRate}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
