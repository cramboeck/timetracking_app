import { useState, useEffect, Fragment } from 'react';
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
  ChevronDown,
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
} from 'lucide-react';
import { sevdeskApi, BillingSummaryItem, InvoiceExport, SevdeskInvoice, SevdeskQuote, DocumentSearchResult } from '../services/api';
import { QuoteEditor } from './QuoteEditor';
import { SevdeskSettings } from './SevdeskSettings';

type FinanzenTab = 'billing' | 'documents' | 'settings';
type DocumentType = 'invoices' | 'quotes';

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
    { id: 'documents', label: 'Dokumente', icon: FileText },
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
      {activeTab === 'documents' && <DocumentsTab />}
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

// ==================== Document Detail Modal ====================
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
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
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
                          const isHeading = pos.quantity === 0;

                          if (isHeading) {
                            return (
                              <tr key={pos.id} className="bg-gray-200 dark:bg-gray-700">
                                <td colSpan={5} className="p-2 font-semibold text-gray-800 dark:text-gray-200">
                                  {pos.name}
                                </td>
                              </tr>
                            );
                          }

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

// ==================== Documents Tab ====================
const DocumentsTab = () => {
  const [activeDocType, setActiveDocType] = useState<DocumentType>('invoices');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SevdeskInvoice[]>([]);
  const [quotes, setQuotes] = useState<SevdeskQuote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<{ type: DocumentType; doc: SevdeskInvoice | SevdeskQuote } | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; invoiceCount: number; quoteCount: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Search mode: 'live' = directly from sevDesk, 'cached' = from local database
  const [searchMode, setSearchMode] = useState<'live' | 'cached'>('live');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Quote Editor
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);

  useEffect(() => {
    loadDocuments();
    loadSyncStatus();
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

  const loadSyncStatus = async () => {
    try {
      const response = await sevdeskApi.getSyncStatus();
      if (response.success) {
        setSyncStatus(response.data);
      }
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage('Synchronisiere Dokumente...');
      const response = await sevdeskApi.syncAll();
      if (response.success) {
        setSyncMessage(`✓ ${response.data.totalSynced} Dokumente synchronisiert`);
        loadSyncStatus();
        setTimeout(() => setSyncMessage(null), 5000);
      }
    } catch (err: any) {
      setSyncMessage(`✗ Fehler: ${err.message}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleCachedSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      const response = await sevdeskApi.searchDocuments(query, {
        type: activeDocType === 'invoices' ? 'invoice' : 'quote',
      });
      if (response.success) {
        setSearchResults(response.data);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search for cached mode
  useEffect(() => {
    if (searchMode === 'cached' && searchQuery.length >= 2) {
      const timer = setTimeout(() => handleCachedSearch(searchQuery), 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, searchMode, activeDocType]);

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
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        case 200: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
        case 1000: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        default: return 'bg-gray-100 text-gray-700';
      }
    } else {
      switch (status) {
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        case 200: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        case 300: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        case 400: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
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
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Status */}
          {syncStatus && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Database size={14} />
              <span>{syncStatus.invoiceCount + syncStatus.quoteCount} im Cache</span>
              {syncStatus.lastSync && (
                <span className="text-gray-400 hidden md:inline">
                  (Sync: {new Date(syncStatus.lastSync).toLocaleDateString('de-DE')})
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* New Quote Button */}
          <button
            onClick={() => setShowQuoteEditor(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            title="Neues Angebot erstellen"
          >
            <Plus size={14} />
            <span className="hidden xs:inline sm:inline">Angebot</span>
          </button>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 disabled:opacity-50"
            title="Dokumente in lokale Datenbank synchronisieren"
          >
            {syncing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            <span className="hidden xs:inline sm:inline">Sync</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadDocuments}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Von sevDesk neu laden"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
          syncMessage.startsWith('✓')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : syncMessage.startsWith('✗')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        }`}>
          {syncMessage.startsWith('✓') && <CheckCircle size={16} />}
          {syncMessage.startsWith('✗') && <AlertTriangle size={16} />}
          {!syncMessage.startsWith('✓') && !syncMessage.startsWith('✗') && <Loader2 size={16} className="animate-spin" />}
          <span>{syncMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertTriangle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Document Type Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveDocType('invoices')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeDocType === 'invoices'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Receipt size={18} />
          Rechnungen ({invoices.length})
        </button>
        <button
          onClick={() => setActiveDocType('quotes')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeDocType === 'quotes'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <FileText size={18} />
          Angebote ({quotes.length})
        </button>
      </div>

      {/* Search with Mode Toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchMode === 'cached'
              ? "Volltextsuche im Cache..."
              : "Suchen..."
            }
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          {searching && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
        {/* Search Mode Toggle */}
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
          <button
            onClick={() => { setSearchMode('live'); setSearchResults([]); }}
            className={`px-3 py-2 text-sm ${
              searchMode === 'live'
                ? 'bg-accent-primary text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            title="Direkt von sevDesk"
          >
            Live
          </button>
          <button
            onClick={() => setSearchMode('cached')}
            className={`px-3 py-2 text-sm flex items-center gap-1 ${
              searchMode === 'cached'
                ? 'bg-accent-primary text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            title="Volltextsuche im lokalen Cache"
          >
            <Database size={14} />
            Cache
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-accent-primary" size={32} />
        </div>
      ) : searchMode === 'cached' && searchQuery.length >= 2 ? (
        /* Cached Search Results */
        <div className="space-y-2">
          {searchResults.length === 0 ? (
            <div className="text-center py-8">
              <Database size={32} className="mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">
                {searching ? 'Suche...' : 'Keine Ergebnisse im Cache gefunden'}
              </p>
              {!syncStatus?.lastSync && (
                <p className="text-sm text-gray-400 mt-2">
                  Klicke auf "Sync" um Dokumente zu indexieren
                </p>
              )}
            </div>
          ) : (
            searchResults.map((result) => (
              <div
                key={result.id}
                onClick={() => {
                  const doc = result.documentType === 'invoice'
                    ? {
                        id: result.sevdeskId,
                        invoiceNumber: result.documentNumber,
                        contact: { id: result.contactId || '', name: result.contactName },
                        invoiceDate: result.documentDate,
                        status: result.status,
                        statusName: result.statusName,
                        sumNet: result.sumNet,
                        sumGross: result.sumGross,
                        sumTax: result.sumTax || 0,
                        header: result.header,
                      } as SevdeskInvoice
                    : {
                        id: result.sevdeskId,
                        quoteNumber: result.documentNumber,
                        contact: { id: result.contactId || '', name: result.contactName },
                        quoteDate: result.documentDate,
                        status: result.status,
                        statusName: result.statusName,
                        sumNet: result.sumNet,
                        sumGross: result.sumGross,
                        header: result.header,
                      } as SevdeskQuote;
                  setSelectedDocument({
                    type: result.documentType === 'invoice' ? 'invoices' : 'quotes',
                    doc,
                  });
                }}
                className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0 hidden sm:block">
                  {result.documentType === 'invoice' ? (
                    <Receipt size={20} className="text-gray-500 dark:text-gray-400" />
                  ) : (
                    <FileText size={20} className="text-gray-500 dark:text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {result.documentNumber}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(result.status, result.documentType === 'invoice' ? 'invoices' : 'quotes')}`}>
                      {result.statusName}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hidden sm:inline">
                      {result.documentType === 'invoice' ? 'Rechnung' : 'Angebot'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                    {result.contactName}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                    {formatCurrency(result.sumGross)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(result.documentDate)}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
              </div>
            ))
          )}
        </div>
      ) : searchMode === 'cached' ? (
        <div className="text-center py-8">
          <Database size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            Mindestens 2 Zeichen eingeben für Volltextsuche
          </p>
          {syncStatus && (
            <p className="text-sm text-gray-400 mt-2">
              {syncStatus.invoiceCount} Rechnungen & {syncStatus.quoteCount} Angebote im Cache
            </p>
          )}
        </div>
      ) : (
        /* Live Mode - Direct from sevDesk */
        <div className="space-y-2">
          {activeDocType === 'invoices' ? (
            filteredInvoices.length === 0 ? (
              <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                Keine Rechnungen gefunden
              </p>
            ) : (
              filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => setSelectedDocument({ type: 'invoices', doc: invoice })}
                  className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0 hidden sm:block">
                    <Receipt size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                        {invoice.invoiceNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(invoice.status, 'invoices')}`}>
                        {invoice.statusName}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                      {invoice.contact.name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {formatCurrency(invoice.sumGross)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
                </div>
              ))
            )
          ) : (
            filteredQuotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500 dark:text-gray-400">Keine Angebote gefunden</p>
                <button
                  onClick={() => setShowQuoteEditor(true)}
                  className="mt-4 text-accent-primary hover:underline"
                >
                  Erstes Angebot erstellen
                </button>
              </div>
            ) : (
              filteredQuotes.map((quote) => (
                <div
                  key={quote.id}
                  onClick={() => setSelectedDocument({ type: 'quotes', doc: quote })}
                  className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0 hidden sm:block">
                    <FileText size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                        {quote.quoteNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(quote.status, 'quotes')}`}>
                        {quote.statusName}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                      {quote.contact.name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {formatCurrency(quote.sumGross)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(quote.quoteDate)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
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

      {/* Quote Editor Modal */}
      {showQuoteEditor && (
        <QuoteEditor
          onClose={() => setShowQuoteEditor(false)}
          onSuccess={() => {
            setShowQuoteEditor(false);
            loadDocuments();
            loadSyncStatus();
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
