import { useState, useEffect } from 'react';
import {
  Wallet,
  Receipt,
  FileText,
  Settings,
  Clock,
  Loader2,
  Star,
  Lock,
  CreditCard,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
  Send,
  ExternalLink,
  RotateCcw,
  Eye,
  EyeOff,
  Search,
  Plus,
  Download,
  RefreshCw,
  Database,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import { sevdeskApi, BillingSummaryItem, InvoiceExport, SevdeskInvoice, SevdeskQuote } from '../services/api';
import { QuoteEditor } from './QuoteEditor';
import { SevdeskSettings } from './SevdeskSettings';

type FinanzenTab = 'billing' | 'invoices' | 'quotes' | 'settings';

interface FinanzenProps {
  onBack?: () => void;
}

export const Finanzen = ({ onBack }: FinanzenProps) => {
  const [activeTab, setActiveTab] = useState<FinanzenTab>('billing');
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Check billing feature access
  useEffect(() => {
    const checkFeatureAccess = async () => {
      try {
        const response = await sevdeskApi.getFeatureStatus();
        setBillingEnabled(response.data.billingEnabled);
      } catch {
        setBillingEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    checkFeatureAccess();
  }, []);

  // Loading state
  if (loading || billingEnabled === null) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-accent-primary" size={32} />
        </div>
      </div>
    );
  }

  // Premium gate for users without billing access
  if (!billingEnabled) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-accent-primary/5 to-accent-primary/10 dark:from-accent-primary/10 dark:to-accent-primary/20 border border-accent-primary/20 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-accent-primary/10 rounded-full flex items-center justify-center">
            <Lock size={40} className="text-accent-primary" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Star size={20} className="text-amber-500 fill-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Premium Feature</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Finanzen & Rechnungswesen
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Mit dem Finanzen-Modul kannst du Zeiteinträge direkt in Rechnungen umwandeln,
            Angebote erstellen und alles mit sevDesk synchronisieren.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-lg mx-auto text-left">
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <Receipt size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Rechnungen erstellen</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <FileText size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Angebote verwalten</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <CreditCard size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-gray-300">sevDesk Integration</span>
            </div>
          </div>
          <a
            href="mailto:support@ramboflow.com?subject=Interesse%20an%20Finanzen%20Feature"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors font-medium"
          >
            <Star size={18} />
            Jetzt freischalten
          </a>
        </div>
      </div>
    );
  }

  const tabs: { id: FinanzenTab; label: string; icon: typeof Receipt }[] = [
    { id: 'billing', label: 'Offene Posten', icon: Clock },
    { id: 'invoices', label: 'Rechnungen', icon: Receipt },
    { id: 'quotes', label: 'Angebote', icon: FileText },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
          <Wallet size={28} className="text-accent-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanzen</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Abrechnungen, Rechnungen und Angebote
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'quotes' && <QuotesTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
};

// ==================== Billing Tab ====================
const BillingTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryItem[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [invoiceExports, setInvoiceExports] = useState<InvoiceExport[]>([]);
  const [hasConfig, setHasConfig] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const configResponse = await sevdeskApi.getConfig();
      setHasConfig(!!configResponse.data?.hasToken);

      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      const summaryResponse = await sevdeskApi.getBillingSummary(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setBillingSummary(summaryResponse.data);

      const exportsResponse = await sevdeskApi.getInvoiceExports(20);
      setInvoiceExports(exportsResponse.data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
    setSelectedCustomers(new Set());
  };

  const handleNextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
    setSelectedCustomers(new Set());
  };

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const handleMarkAsBilled = async (customerId: string, customerName: string) => {
    try {
      setProcessing(customerId);
      setError(null);

      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      await sevdeskApi.createInvoiceExport({
        customerId,
        periodStart: startDate.toISOString().split('T')[0],
        periodEnd: endDate.toISOString().split('T')[0],
      });

      setSuccess(`${customerName} als abgerechnet markiert`);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Markieren');
    } finally {
      setProcessing(null);
    }
  };

  const handleUndoExport = async (exportId: string, customerName: string) => {
    try {
      setProcessing(exportId);
      setError(null);
      await sevdeskApi.deleteExport(exportId);
      setSuccess(`Export für ${customerName} rückgängig gemacht`);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Rückgängig machen');
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatHours = (hours: number) => `${hours.toFixed(2)}h`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('de-DE');
  const monthName = selectedMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  const unbilledItems = billingSummary.filter(item => !item.isBilled);

  return (
    <div className="space-y-6">
      {/* Config Warning */}
      {!hasConfig && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">sevDesk nicht konfiguriert</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Konfigurieren Sie Ihren sevDesk API-Token in den Einstellungen.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertTriangle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300">
          <Check size={18} />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
          <Clock size={20} className="text-accent-primary" />
          {monthName}
        </div>
        <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Unbilled Items */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Nicht abgerechnete Zeiten</h3>
        </div>
        {unbilledItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Check size={48} className="mx-auto mb-4 text-green-500" />
            <p>Alle Zeiten für {monthName} wurden abgerechnet!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {unbilledItems.map((item) => (
              <div key={item.customerId} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedCustomers.has(item.customerId)}
                      onChange={() => toggleCustomerSelection(item.customerId)}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        {item.customerName}
                        {item.sevdeskContactId && (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <ExternalLink size={10} /> sevDesk
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{formatHours(item.totalHours)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.totalAmount)}</div>
                    </div>
                    {item.sevdeskContactId && hasConfig ? (
                      <button
                        onClick={() => handleMarkAsBilled(item.customerId, item.customerName)}
                        disabled={processing === item.customerId}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary text-white rounded-lg text-sm hover:bg-accent-primary/90 disabled:opacity-50"
                      >
                        {processing === item.customerId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        Rechnung
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkAsBilled(item.customerId, item.customerName)}
                        disabled={processing === item.customerId}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                      >
                        {processing === item.customerId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Erledigt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Exports */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Erledigte Abrechnungen ({invoiceExports.length})
          </h3>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showCompleted
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {showCompleted ? <EyeOff size={16} /> : <Eye size={16} />}
            {showCompleted ? 'Ausblenden' : 'Anzeigen'}
          </button>
        </div>
        {showCompleted && (
          invoiceExports.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Keine erledigten Abrechnungen</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {invoiceExports.map((exp) => (
                <div key={exp.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">{exp.customerName}</div>
                    <div className="text-sm text-gray-500">{formatDate(exp.periodStart)} - {formatDate(exp.periodEnd)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">{formatCurrency(exp.totalAmount)}</div>
                    <div className="text-sm text-gray-500">{exp.sevdeskInvoiceNumber || 'Manuell'}</div>
                  </div>
                  {!exp.sevdeskInvoiceNumber && (
                    <button
                      onClick={() => handleUndoExport(exp.id, exp.customerName)}
                      disabled={processing === exp.id}
                      className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg"
                      title="Rückgängig"
                    >
                      {processing === exp.id ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

// ==================== Invoices Tab ====================
const InvoicesTab = () => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<SevdeskInvoice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const response = await sevdeskApi.getInvoices({ limit: 100 });
      setInvoices(response.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  const formatDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString('de-DE') : '-';

  const getStatusBadge = (status: number) => {
    const configs: Record<number, { label: string; className: string }> = {
      100: { label: 'Entwurf', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
      200: { label: 'Offen', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      1000: { label: 'Bezahlt', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    };
    const config = configs[status] || configs[100];
    return <span className={`px-2 py-0.5 text-xs rounded-full ${config.className}`}>{config.label}</span>;
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-accent-primary" size={32} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen nach Nummer oder Kunde..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      {/* Invoice List */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Keine Rechnungen gefunden</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredInvoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Receipt size={20} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{inv.invoiceNumber}</span>
                    {getStatusBadge(inv.status)}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{inv.contact.name} • {inv.header || 'Rechnung'}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(inv.sumGross)}</div>
                  <div className="text-sm text-gray-500">{formatDate(inv.invoiceDate)}</div>
                </div>
                <ChevronDown size={20} className="text-gray-400 -rotate-90" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== Quotes Tab ====================
const QuotesTab = () => {
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<SevdeskQuote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const response = await sevdeskApi.getQuotes({ limit: 100 });
      setQuotes(response.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  const formatDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString('de-DE') : '-';

  const getStatusBadge = (status: number) => {
    const configs: Record<number, { label: string; className: string }> = {
      100: { label: 'Entwurf', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
      200: { label: 'Gesendet', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      300: { label: 'Angenommen', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      400: { label: 'Abgelehnt', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    };
    const config = configs[status] || configs[100];
    return <span className={`px-2 py-0.5 text-xs rounded-full ${config.className}`}>{config.label}</span>;
  };

  const filteredQuotes = quotes.filter(q =>
    q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-accent-primary" size={32} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with New Quote Button */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suchen nach Nummer oder Kunde..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <button
          onClick={() => setShowQuoteEditor(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus size={18} />
          Neues Angebot
        </button>
      </div>

      {/* Quote List */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {filteredQuotes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine Angebote gefunden</p>
            <button
              onClick={() => setShowQuoteEditor(true)}
              className="mt-4 text-accent-primary hover:underline"
            >
              Erstes Angebot erstellen
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredQuotes.map((quote) => (
              <div key={quote.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <FileText size={20} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{quote.quoteNumber}</span>
                    {getStatusBadge(quote.status)}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{quote.contact.name} • {quote.header || 'Angebot'}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(quote.sumGross)}</div>
                  <div className="text-sm text-gray-500">{formatDate(quote.quoteDate)}</div>
                </div>
                <ChevronDown size={20} className="text-gray-400 -rotate-90" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quote Editor Modal */}
      {showQuoteEditor && (
        <QuoteEditor
          onClose={() => setShowQuoteEditor(false)}
          onSuccess={() => {
            setShowQuoteEditor(false);
            loadQuotes();
          }}
        />
      )}
    </div>
  );
};

// ==================== Settings Tab ====================
const SettingsTab = () => {
  return (
    <div className="max-w-2xl">
      <SevdeskSettings />
    </div>
  );
};

export default Finanzen;
