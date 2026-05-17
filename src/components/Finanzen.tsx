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
  Upload,
  Camera,
  X,
  Pencil,
} from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { toLocalDateString } from '../utils/time';
import { sevdeskApi, BillingSummaryItem, InvoiceExport, SevdeskInvoice, SevdeskQuote, SevdeskVoucher, DocumentSearchResult } from '../services/api';
import { QuoteEditor } from './QuoteEditor';
import { SevdeskSettings } from './SevdeskSettings';
import { InvoiceCreationDialog } from './InvoiceCreationDialog';
import { BillingOverview } from './BillingOverview';

type FinanzenTab = 'billing' | 'documents' | 'settings';
type DocumentType = 'invoices' | 'quotes' | 'vouchers';

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
          <p className="text-gray-600 dark:text-dark-400 mb-6 max-w-md mx-auto">
            Mit dem Finanzen-Modul kannst du Zeiteinträge direkt in Rechnungen umwandeln,
            Angebote erstellen und alles mit sevDesk synchronisieren.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-lg mx-auto text-left">
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-dark-100/50 rounded-lg">
              <Receipt size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-dark-500">Rechnungen erstellen</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-dark-100/50 rounded-lg">
              <FileText size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-dark-500">Angebote verwalten</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-dark-100/50 rounded-lg">
              <CreditCard size={20} className="text-accent-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700 dark:text-dark-500">sevDesk Integration</span>
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
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Abrechnungen, Rechnungen und Angebote
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-dark-border mb-6 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 rounded-none transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
            }`}
            icon={<Icon size={18} />}
          >
            {label}
          </Button>
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
type BillingPeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

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

  // Billing period type (monthly, quarterly, yearly, or custom)
  const [billingPeriodType, setBillingPeriodType] = useState<BillingPeriodType>('monthly');

  // For monthly billing
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // For quarterly billing
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    return Math.floor(now.getMonth() / 3) + 1; // 1-4
  });
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  // For custom date range
  const [customStartDate, setCustomStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Invoice creation dialog
  const [invoiceDialogCustomer, setInvoiceDialogCustomer] = useState<BillingSummaryItem | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedMonth, billingPeriodType, selectedQuarter, selectedYear, customStartDate, customEndDate]);

  const formatDateLocal = toLocalDateString;

  // Calculate period dates based on billing type
  const getPeriodDates = () => {
    if (billingPeriodType === 'monthly') {
      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
      return { startDate, endDate };
    } else if (billingPeriodType === 'quarterly') {
      // Quarterly: Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
      const startMonth = (selectedQuarter - 1) * 3;
      const startDate = new Date(selectedYear, startMonth, 1);
      const endDate = new Date(selectedYear, startMonth + 3, 0);
      return { startDate, endDate };
    } else if (billingPeriodType === 'custom') {
      // Custom date range
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      return { startDate, endDate };
    } else {
      // Yearly: full year
      const startDate = new Date(selectedYear, 0, 1);
      const endDate = new Date(selectedYear, 11, 31);
      return { startDate, endDate };
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const configResponse = await sevdeskApi.getConfig();
      setHasConfig(!!configResponse.data?.hasToken);

      const { startDate, endDate } = getPeriodDates();

      const summaryResponse = await sevdeskApi.getBillingSummary(
        formatDateLocal(startDate),
        formatDateLocal(endDate)
      );

      // Get exports with higher limit to check for overlapping periods
      const exportsResponse = await sevdeskApi.getInvoiceExports(100);
      const exports = exportsResponse.data;
      setInvoiceExports(exports);

      // Check for overlapping billing periods
      // If viewing monthly and a quarterly export covers this period, mark as billed
      const enhancedSummary = summaryResponse.data.map((item: BillingSummaryItem) => {
        if (item.isBilled) return item;

        // Check if any export for this customer covers the current period
        const hasOverlappingExport = exports.some((exp: InvoiceExport) => {
          if (exp.customerId !== item.customerId) return false;
          const expStart = new Date(exp.periodStart);
          const expEnd = new Date(exp.periodEnd);
          // Current period is covered if export period contains it
          return expStart <= startDate && expEnd >= endDate;
        });

        if (hasOverlappingExport) {
          return { ...item, isBilled: true, billedViaOverlap: true };
        }
        return item;
      });

      setBillingSummary(enhancedSummary);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  // Navigation for monthly
  const handlePrevMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
    setSelectedCustomers(new Set());
  };

  const handleNextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
    setSelectedCustomers(new Set());
  };

  // Navigation for quarterly
  const handlePrevQuarter = () => {
    if (selectedQuarter === 1) {
      setSelectedQuarter(4);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedQuarter(selectedQuarter - 1);
    }
    setSelectedCustomers(new Set());
  };

  const handleNextQuarter = () => {
    if (selectedQuarter === 4) {
      setSelectedQuarter(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedQuarter(selectedQuarter + 1);
    }
    setSelectedCustomers(new Set());
  };

  // Navigation for yearly
  const handlePrevYear = () => {
    setSelectedYear(selectedYear - 1);
    setSelectedCustomers(new Set());
  };

  const handleNextYear = () => {
    setSelectedYear(selectedYear + 1);
    setSelectedCustomers(new Set());
  };

  // Get period display name
  const getPeriodName = () => {
    if (billingPeriodType === 'monthly') {
      return selectedMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else if (billingPeriodType === 'quarterly') {
      return `Q${selectedQuarter} ${selectedYear}`;
    } else if (billingPeriodType === 'custom') {
      const start = new Date(customStartDate).toLocaleDateString('de-DE');
      const end = new Date(customEndDate).toLocaleDateString('de-DE');
      return `${start} - ${end}`;
    } else {
      return `Jahr ${selectedYear}`;
    }
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

  // Open invoice creation dialog
  const handleCreateInvoice = (customer: BillingSummaryItem) => {
    if (!customer.sevdeskCustomerId) {
      setError(`${customer.customerName} ist nicht mit sevDesk verknüpft`);
      return;
    }
    setInvoiceDialogCustomer(customer);
  };

  // Handle successful invoice creation
  const handleInvoiceCreated = async (invoiceNumber: string) => {
    setSuccess(`Rechnung ${invoiceNumber} für ${invoiceDialogCustomer?.customerName} erstellt`);
    setInvoiceDialogCustomer(null);
    await loadData();
    setTimeout(() => setSuccess(null), 5000);
  };

  // Mark as billed without creating invoice (for customers without sevDesk)
  const handleMarkAsBilled = async (customerId: string, customerName: string) => {
    try {
      setProcessing(customerId);
      setError(null);

      const { startDate, endDate } = getPeriodDates();

      await sevdeskApi.createInvoiceExport({
        customerId,
        periodStart: formatDateLocal(startDate),
        periodEnd: formatDateLocal(endDate),
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
  const periodName = getPeriodName();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  const unbilledItems = billingSummary.filter(item => !item.isBilled);
  const billedItems = billingSummary.filter(item => item.isBilled);

  const handleRevertBilling = async (customerId: string, customerName: string) => {
    try {
      setProcessing(customerId);
      setError(null);

      const { startDate, endDate } = getPeriodDates();

      // Find the export for this customer and period, then delete it
      const matchingExport = invoiceExports.find(exp => {
        const expStart = new Date(exp.periodStart);
        const expEnd = new Date(exp.periodEnd);
        return exp.customerId === customerId &&
          expStart >= startDate &&
          expEnd <= endDate;
      });

      if (matchingExport) {
        await sevdeskApi.deleteExport(matchingExport.id);
        setSuccess(`Abrechnung für ${customerName} zurückgesetzt`);
        await loadData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(`Kein Export für ${customerName} in diesem Zeitraum gefunden`);
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Zurücksetzen');
    } finally {
      setProcessing(null);
    }
  };

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

      {/* Billing Overview Stats */}
      {!loading && billingSummary.length > 0 && (
        <BillingOverview
          billingSummary={billingSummary.map(item => ({
            customerId: item.customerId,
            customerName: item.customerName,
            totalHours: item.totalHours,
            roundedHours: item.roundedHours,
            totalAmount: item.totalAmount || 0,
            isBilled: item.isBilled || false,
            sevdeskCustomerId: item.sevdeskCustomerId,
            entryCount: item.entries?.length || 0,
          }))}
          periodName={periodName}
          onCreateInvoice={hasConfig ? (customer) => {
            const item = billingSummary.find(b => b.customerId === customer.customerId);
            if (item) handleCreateInvoice(item);
          } : undefined}
        />
      )}

      {/* Period Type Toggle */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-sm text-gray-500 dark:text-dark-400">Abrechnungszeitraum:</span>
        <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden">
          <Button
            variant={billingPeriodType === 'monthly' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setBillingPeriodType('monthly')}
            className={`rounded-none ${
              billingPeriodType !== 'monthly'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Monatlich
          </Button>
          <Button
            variant={billingPeriodType === 'quarterly' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setBillingPeriodType('quarterly')}
            className={`rounded-none ${
              billingPeriodType !== 'quarterly'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Quartalsweise
          </Button>
          <Button
            variant={billingPeriodType === 'yearly' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setBillingPeriodType('yearly')}
            className={`rounded-none ${
              billingPeriodType !== 'yearly'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Jährlich
          </Button>
          <Button
            variant={billingPeriodType === 'custom' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setBillingPeriodType('custom')}
            className={`rounded-none ${
              billingPeriodType !== 'custom'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Frei
          </Button>
        </div>
      </div>

      {/* Period Selector - show date inputs for custom, otherwise navigation */}
      {billingPeriodType === 'custom' ? (
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 dark:text-dark-400">Von:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 dark:text-dark-400">Bis:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-center gap-4">
        <IconButton
          icon={<ChevronLeft size={20} className="text-gray-600 dark:text-dark-500" />}
          onClick={
            billingPeriodType === 'monthly'
              ? handlePrevMonth
              : billingPeriodType === 'quarterly'
              ? handlePrevQuarter
              : handlePrevYear
          }
          tooltip="Vorheriger Zeitraum"
        />
        <div className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
          <Clock size={20} className="text-accent-primary" />
          {periodName}
        </div>
        <IconButton
          icon={<ChevronRight size={20} className="text-gray-600 dark:text-dark-500" />}
          onClick={
            billingPeriodType === 'monthly'
              ? handleNextMonth
              : billingPeriodType === 'quarterly'
              ? handleNextQuarter
              : handleNextYear
          }
          tooltip="Nächster Zeitraum"
        />
      </div>
      )}

      {/* Unbilled Items */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white">Nicht abgerechnete Zeiten</h3>
        </div>
        {unbilledItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-dark-400">
            <Check size={48} className="mx-auto mb-4 text-green-500" />
            <p>Alle Zeiten für {periodName} wurden abgerechnet!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
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
                        {item.sevdeskCustomerId && (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <ExternalLink size={10} /> sevDesk
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatHours(item.totalHours)}
                        {item.roundedHours && item.roundedHours !== item.totalHours && (
                          <span className="text-accent-primary ml-1">
                            → {formatHours(item.roundedHours)} ({item.timeRoundingInterval || 15} Min.)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.totalAmount)}</div>
                      {item.roundedHours && item.roundedHours !== item.totalHours && (
                        <div className="text-xs text-gray-400">aufgerundet</div>
                      )}
                    </div>
                    {item.sevdeskCustomerId && hasConfig ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleCreateInvoice(item)}
                        disabled={processing === item.customerId}
                        loading={processing === item.customerId}
                        icon={<Send size={14} />}
                      >
                        Rechnung
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkAsBilled(item.customerId, item.customerName)}
                        disabled={processing === item.customerId}
                        loading={processing === item.customerId}
                        icon={<Check size={14} />}
                        className="bg-gray-600 text-white hover:bg-gray-700"
                      >
                        Erledigt
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billed Items from current month */}
      {billedItems.length > 0 && (
        <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle size={18} className="text-green-500" />
              Abgerechnete Zeiten in {periodName} ({billedItems.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {billedItems.map((item) => {
              const billedViaOverlap = (item as BillingSummaryItem & { billedViaOverlap?: boolean }).billedViaOverlap;
              return (
                <div key={item.customerId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                          {item.customerName}
                          {item.sevdeskCustomerId && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <ExternalLink size={10} /> sevDesk
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatHours(item.totalHours)}
                          {item.roundedHours && item.roundedHours !== item.totalHours && (
                            <span className="text-accent-primary ml-1">
                              → {formatHours(item.roundedHours)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.totalAmount)}</div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          {billedViaOverlap ? 'Abgerechnet (via Quartal)' : 'Abgerechnet'}
                        </div>
                      </div>
                      {!billedViaOverlap && (
                        <Button
                          variant="warning"
                          size="sm"
                          onClick={() => handleRevertBilling(item.customerId, item.customerName)}
                          disabled={processing === item.customerId}
                          loading={processing === item.customerId}
                          icon={<RotateCcw size={14} />}
                          className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Exports */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Erledigte Abrechnungen ({invoiceExports.length})
          </h3>
          <Button
            variant={showCompleted ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowCompleted(!showCompleted)}
            icon={showCompleted ? <EyeOff size={16} /> : <Eye size={16} />}
            className={showCompleted ? 'bg-accent-primary/10 text-accent-primary' : ''}
          >
            {showCompleted ? 'Ausblenden' : 'Anzeigen'}
          </Button>
        </div>
        {showCompleted && (
          invoiceExports.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Keine erledigten Abrechnungen</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-dark-border">
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
                    <IconButton
                      icon={processing === exp.id ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                      onClick={() => handleUndoExport(exp.id, exp.customerName)}
                      disabled={processing === exp.id}
                      variant="danger"
                      tooltip="Rückgängig"
                    />
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Invoice Creation Dialog */}
      {invoiceDialogCustomer && (() => {
        const { startDate, endDate } = getPeriodDates();
        return (
          <InvoiceCreationDialog
            isOpen={true}
            onClose={() => setInvoiceDialogCustomer(null)}
            customer={invoiceDialogCustomer}
            periodStart={startDate}
            periodEnd={endDate}
            onSuccess={handleInvoiceCreated}
          />
        );
      })()}
    </div>
  );
};

// ==================== Document Detail Modal ====================
interface DocumentDetailProps {
  type: DocumentType;
  document: SevdeskInvoice | SevdeskQuote | SevdeskVoucher;
  onClose: () => void;
}

const DocumentDetail = ({ type, document, onClose }: DocumentDetailProps) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SevdeskInvoice | SevdeskQuote | SevdeskVoucher | null>(null);
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
      let response;
      if (type === 'invoices') {
        response = await sevdeskApi.getInvoice(document.id);
      } else if (type === 'quotes') {
        response = await sevdeskApi.getQuote(document.id);
      } else {
        response = await sevdeskApi.getVoucher(document.id);
      }
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
      <div className="bg-white dark:bg-dark-100 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {type === 'invoices' ? 'Rechnung' : type === 'quotes' ? 'Angebot' : 'Beleg'}{' '}
            {type === 'invoices'
              ? (document as SevdeskInvoice).invoiceNumber
              : type === 'quotes'
              ? (document as SevdeskQuote).quoteNumber
              : (document as SevdeskVoucher).voucherNumber || (document as SevdeskVoucher).description}
          </h3>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            tooltip="Schließen"
          />
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
                {type === 'vouchers' ? (
                  <>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Lieferant:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {(detail as SevdeskVoucher).supplier?.name || 'Nicht angegeben'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Datum:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatDate((detail as SevdeskVoucher).voucherDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Status:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{detail.statusName}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Betrag:</span>
                      <p className={`font-medium ${(detail as SevdeskVoucher).creditDebit === 'C' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                        {(detail as SevdeskVoucher).creditDebit === 'C' ? '+' : '-'}{formatCurrency(detail.sumGross)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Netto:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(detail.sumNet)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">MwSt ({(detail as SevdeskVoucher).taxRate}%):</span>
                      <p className="font-medium text-gray-900 dark:text-white">{formatCurrency((detail as SevdeskVoucher).sumTax)}</p>
                    </div>
                    {(detail as SevdeskVoucher).paidAt && (
                      <div className="col-span-2">
                        <span className="text-gray-500 dark:text-dark-400">Bezahlt am:</span>
                        <p className="font-medium text-green-600 dark:text-green-400">
                          {formatDate((detail as SevdeskVoucher).paidAt!)}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Kunde:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {(detail as SevdeskInvoice | SevdeskQuote).contact.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Datum:</span>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatDate(type === 'invoices' ? (detail as SevdeskInvoice).invoiceDate : (detail as SevdeskQuote).quoteDate)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Status:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{detail.statusName}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-dark-400">Betrag:</span>
                      <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(detail.sumGross)}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Header Text / Description */}
              {type === 'vouchers' ? (
                (detail as SevdeskVoucher).description && (
                  <div>
                    <span className="text-gray-500 dark:text-dark-400 text-sm">Beschreibung:</span>
                    <p className="text-gray-900 dark:text-white">{(detail as SevdeskVoucher).description}</p>
                  </div>
                )
              ) : (
                (detail as SevdeskInvoice | SevdeskQuote).header && (
                  <div>
                    <span className="text-gray-500 dark:text-dark-400 text-sm">Betreff:</span>
                    <p className="text-gray-900 dark:text-white">{(detail as SevdeskInvoice | SevdeskQuote).header}</p>
                  </div>
                )
              )}

              {/* Positions - only for invoices and quotes */}
              {type !== 'vouchers' && (detail as SevdeskInvoice | SevdeskQuote).positions && (detail as SevdeskInvoice | SevdeskQuote).positions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">Positionen</h4>
                  <div className="bg-gray-50 dark:bg-dark-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-dark-border">
                          <th className="text-left p-2 text-gray-500 dark:text-dark-400 w-6"></th>
                          <th className="text-left p-2 text-gray-500 dark:text-dark-400">Beschreibung</th>
                          <th className="text-right p-2 text-gray-500 dark:text-dark-400">Menge</th>
                          <th className="text-right p-2 text-gray-500 dark:text-dark-400">Preis</th>
                          <th className="text-right p-2 text-gray-500 dark:text-dark-400">Summe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail as SevdeskInvoice | SevdeskQuote).positions.map((pos) => {
                          const isExpanded = expandedPositions.has(pos.id);
                          const hasText = pos.text && pos.text.trim().length > 0;
                          const isHeading = pos.quantity === 0;

                          if (isHeading) {
                            return (
                              <tr key={pos.id} className="bg-gray-200 dark:bg-dark-200">
                                <td colSpan={5} className="p-2 font-semibold text-gray-800 dark:text-dark-500">
                                  {pos.name}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <Fragment key={pos.id}>
                              <tr
                                className={`border-b border-gray-200 dark:border-dark-border last:border-0 ${hasText ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-100' : ''}`}
                                onClick={() => hasText && togglePosition(pos.id)}
                              >
                                <td className="p-2 text-gray-500 dark:text-dark-400">
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
                                <tr className="border-b border-gray-200 dark:border-dark-border">
                                  <td colSpan={5} className="p-3 bg-gray-100 dark:bg-dark-100">
                                    <div className="text-sm text-gray-700 dark:text-dark-500 whitespace-pre-wrap">
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

              {/* Totals - only for invoices and quotes (vouchers show this info in header) */}
              {type !== 'vouchers' && (
                <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-dark-400">Netto:</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(detail.sumNet)}</span>
                  </div>
                  {type === 'invoices' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-dark-400">MwSt:</span>
                      <span className="text-gray-900 dark:text-white">{formatCurrency((detail as SevdeskInvoice).sumTax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold mt-2">
                    <span className="text-gray-900 dark:text-white">Brutto:</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(detail.sumGross)}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-dark-400 text-center py-8">
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
  const [vouchers, setVouchers] = useState<SevdeskVoucher[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<{ type: DocumentType; doc: SevdeskInvoice | SevdeskQuote | SevdeskVoucher } | null>(null);

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
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  // Voucher Upload
  const [showVoucherUpload, setShowVoucherUpload] = useState(false);

  useEffect(() => {
    loadDocuments();
    loadSyncStatus();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const [invoicesRes, quotesRes, vouchersRes] = await Promise.all([
        sevdeskApi.getInvoices({ limit: 500 }),
        sevdeskApi.getQuotes({ limit: 500 }),
        sevdeskApi.getVouchers({ limit: 500 }),
      ]);

      setInvoices(invoicesRes.data || []);
      setQuotes(quotesRes.data || []);
      setVouchers(vouchersRes.data || []);
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
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
        case 200: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
        case 1000: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        default: return 'bg-gray-100 text-gray-700';
      }
    } else {
      switch (status) {
        case 100: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
        case 200: return 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary';
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

  const filteredVouchers = vouchers.filter(voucher =>
    voucher.voucherNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    voucher.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    voucher.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVoucherStatusColor = (status: number) => {
    switch (status) {
      case 50: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500';
      case 100: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 1000: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Status */}
          {syncStatus && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
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
          <Button
            variant="success"
            size="sm"
            onClick={() => setShowQuoteEditor(true)}
            icon={<Plus size={14} />}
          >
            <span className="hidden xs:inline sm:inline">Angebot</span>
          </Button>

          {/* New Voucher Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowVoucherUpload(true)}
            icon={<Camera size={14} />}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <span className="hidden xs:inline sm:inline">Beleg</span>
          </Button>

          {/* Sync Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            loading={syncing}
            icon={<Download size={14} />}
          >
            <span className="hidden xs:inline sm:inline">Sync</span>
          </Button>

          {/* Refresh Button */}
          <IconButton
            icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
            onClick={loadDocuments}
            disabled={loading}
            tooltip="Von sevDesk neu laden"
          />
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
          syncMessage.startsWith('✓')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : syncMessage.startsWith('✗')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            : 'bg-accent-light dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary'
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
      <div className="flex border-b border-gray-200 dark:border-dark-border overflow-x-auto">
        <Button
          variant="ghost"
          onClick={() => setActiveDocType('invoices')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 rounded-none transition-colors whitespace-nowrap ${
            activeDocType === 'invoices'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-400'
          }`}
          icon={<Receipt size={18} />}
        >
          Rechnungen ({invoices.length})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveDocType('quotes')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 rounded-none transition-colors whitespace-nowrap ${
            activeDocType === 'quotes'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-400'
          }`}
          icon={<FileText size={18} />}
        >
          Angebote ({quotes.length})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveDocType('vouchers')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 rounded-none transition-colors whitespace-nowrap ${
            activeDocType === 'vouchers'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-dark-400'
          }`}
          icon={<CreditCard size={18} />}
        >
          Belege ({vouchers.length})
        </Button>
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
          />
          {searching && (
            <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
        {/* Search Mode Toggle */}
        <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden flex-shrink-0">
          <Button
            variant={searchMode === 'live' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setSearchMode('live'); setSearchResults([]); }}
            className={`rounded-none ${
              searchMode !== 'live'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Live
          </Button>
          <Button
            variant={searchMode === 'cached' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSearchMode('cached')}
            icon={<Database size={14} />}
            className={`rounded-none ${
              searchMode !== 'cached'
                ? 'bg-white dark:bg-dark-50 text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-100'
                : ''
            }`}
          >
            Cache
          </Button>
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
              <p className="text-gray-500 dark:text-dark-400">
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
                className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
                  {result.documentType === 'invoice' ? (
                    <Receipt size={20} className="text-gray-500 dark:text-dark-400" />
                  ) : (
                    <FileText size={20} className="text-gray-500 dark:text-dark-400" />
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
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">
                    {result.contactName}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                    {formatCurrency(result.sumGross)}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400">
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
          <p className="text-gray-500 dark:text-dark-400">
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
          {/* Invoices Tab */}
          {activeDocType === 'invoices' && (
            filteredInvoices.length === 0 ? (
              <p className="text-center py-8 text-gray-500 dark:text-dark-400">
                Keine Rechnungen gefunden
              </p>
            ) : (
              filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => setSelectedDocument({ type: 'invoices', doc: invoice })}
                  className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
                    <Receipt size={20} className="text-gray-500 dark:text-dark-400" />
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
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">
                      {invoice.contact.name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {formatCurrency(invoice.sumGross)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400">
                      {formatDate(invoice.invoiceDate)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
                </div>
              ))
            )
          )}

          {/* Quotes Tab */}
          {activeDocType === 'quotes' && (
            filteredQuotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500 dark:text-dark-400">Keine Angebote gefunden</p>
                <Button
                  variant="ghost"
                  onClick={() => setShowQuoteEditor(true)}
                  className="mt-4 text-accent-primary hover:underline"
                >
                  Erstes Angebot erstellen
                </Button>
              </div>
            ) : (
              filteredQuotes.map((quote) => (
                <div
                  key={quote.id}
                  onClick={() => setSelectedDocument({ type: 'quotes', doc: quote })}
                  className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
                    <FileText size={20} className="text-gray-500 dark:text-dark-400" />
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
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">
                      {quote.contact.name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                      {formatCurrency(quote.sumGross)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400">
                      {formatDate(quote.quoteDate)}
                    </p>
                  </div>
                  {/* Edit Button - only for draft quotes */}
                  {quote.status === 100 && (
                    <IconButton
                      icon={<Pencil size={16} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingQuoteId(quote.id);
                        setShowQuoteEditor(true);
                      }}
                      variant="primary"
                      tooltip="Angebot bearbeiten"
                    />
                  )}
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
                </div>
              ))
            )
          )}

          {/* Vouchers Tab */}
          {activeDocType === 'vouchers' && (
            filteredVouchers.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard size={32} className="mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500 dark:text-dark-400">Keine Belege gefunden</p>
              </div>
            ) : (
              filteredVouchers.map((voucher) => (
                <div
                  key={voucher.id}
                  onClick={() => setSelectedDocument({ type: 'vouchers', doc: voucher })}
                  className="flex items-center gap-3 p-3 sm:p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0 hidden sm:block">
                    <CreditCard size={20} className="text-gray-500 dark:text-dark-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                        {voucher.voucherNumber || voucher.description || `Beleg #${voucher.id}`}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getVoucherStatusColor(voucher.status)}`}>
                        {voucher.statusName}
                      </span>
                      {voucher.creditDebit === 'C' && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary">
                          Gutschrift
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">
                      {voucher.supplier?.name || voucher.description || 'Kein Lieferant'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-medium text-sm sm:text-base ${voucher.creditDebit === 'C' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                      {voucher.creditDebit === 'C' ? '+' : '-'}{formatCurrency(voucher.sumGross)}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400">
                      {formatDate(voucher.voucherDate)}
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
          quoteId={editingQuoteId || undefined}
          onClose={() => {
            setShowQuoteEditor(false);
            setEditingQuoteId(null);
          }}
          onSuccess={() => {
            setShowQuoteEditor(false);
            setEditingQuoteId(null);
            loadDocuments();
            loadSyncStatus();
          }}
        />
      )}

      {/* Voucher Upload Modal */}
      {showVoucherUpload && (
        <VoucherUploadDialog
          onClose={() => setShowVoucherUpload(false)}
          onSuccess={() => {
            setShowVoucherUpload(false);
            loadDocuments();
          }}
        />
      )}
    </div>
  );
};

// ==================== Voucher Upload Dialog ====================
interface VoucherUploadDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

const VoucherUploadDialog = ({ onClose, onSuccess }: VoucherUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'details'>('upload');

  // Form fields
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [sumGross, setSumGross] = useState('');
  const [taxRate, setTaxRate] = useState('19');
  const [creditDebit, setCreditDebit] = useState<'C' | 'D'>('D');

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.type.match(/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/)) {
      setError('Nur Bilder (JPG, PNG, GIF, WebP) oder PDF-Dateien sind erlaubt');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Datei darf maximal 10 MB groß sein');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }

    setStep('details');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const calculateNet = () => {
    const gross = parseFloat(sumGross) || 0;
    const tax = parseFloat(taxRate) || 0;
    return gross / (1 + tax / 100);
  };

  const handleSubmit = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data:mimetype;base64, prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const fileData = await base64Promise;

      // Upload file to sevDesk
      const uploadResult = await sevdeskApi.uploadVoucherFile(fileData, file.name, file.type);

      if (!uploadResult.success || !uploadResult.data.id) {
        throw new Error('Datei konnte nicht hochgeladen werden');
      }

      // Create voucher with the uploaded file
      const createResult = await sevdeskApi.createVoucher({
        fileId: uploadResult.data.id,
        voucherDate,
        description: description || file.name,
        supplierName: supplierName || undefined,
        sumNet: calculateNet(),
        sumGross: parseFloat(sumGross) || undefined,
        taxRate: parseFloat(taxRate) || 19,
        creditDebit,
      });

      if (!createResult.success) {
        throw new Error('Beleg konnte nicht erstellt werden');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Hochladen');
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {step === 'upload' ? 'Beleg hochladen' : 'Beleg-Details'}
          </h3>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            tooltip="Schließen"
          />
        </div>

        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' ? (
            /* Upload Step */
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg p-8 text-center hover:border-accent-primary transition-colors cursor-pointer"
            >
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileInput}
                className="hidden"
                id="voucher-file-input"
              />
              <label htmlFor="voucher-file-input" className="cursor-pointer">
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-gray-100 dark:bg-dark-200 rounded-full">
                    <Camera size={32} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium">
                      Foto aufnehmen oder Datei auswählen
                    </p>
                    <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                      Oder per Drag & Drop hier ablegen
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    JPG, PNG, GIF, WebP oder PDF • Max. 10 MB
                  </p>
                </div>
              </label>
            </div>
          ) : (
            /* Details Step */
            <div className="space-y-4">
              {/* File Preview */}
              {file && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-50 rounded-lg">
                  {preview ? (
                    <img src={preview} alt="Vorschau" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 dark:bg-dark-200 rounded flex items-center justify-center">
                      <FileText size={24} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <IconButton
                    icon={<X size={16} />}
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                      setStep('upload');
                    }}
                    variant="danger"
                    tooltip="Entfernen"
                  />
                </div>
              )}

              {/* Form Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Belegdatum *
                  </label>
                  <input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Beschreibung
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="z.B. Büromaterial, Tankquittung..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Lieferant
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Name des Lieferanten"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Brutto-Betrag *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={sumGross}
                      onChange={(e) => setSumGross(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    MwSt-Satz
                  </label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  >
                    <option value="19">19%</option>
                    <option value="7">7%</option>
                    <option value="0">0%</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Art
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={creditDebit === 'D'}
                        onChange={() => setCreditDebit('D')}
                        className="text-accent-primary"
                      />
                      <span className="text-gray-900 dark:text-white">Ausgabe</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={creditDebit === 'C'}
                        onChange={() => setCreditDebit('C')}
                        className="text-accent-primary"
                      />
                      <span className="text-gray-900 dark:text-white">Gutschrift</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {sumGross && (
                <div className="p-3 bg-gray-50 dark:bg-dark-50 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Netto:</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(calculateNet())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">MwSt ({taxRate}%):</span>
                    <span className="text-gray-900 dark:text-white">
                      {formatCurrency((parseFloat(sumGross) || 0) - calculateNet())}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold pt-1 border-t border-gray-200 dark:border-dark-border">
                    <span className="text-gray-900 dark:text-white">Brutto:</span>
                    <span className={creditDebit === 'C' ? 'text-green-600' : 'text-gray-900 dark:text-white'}>
                      {creditDebit === 'C' ? '+' : '-'}{formatCurrency(parseFloat(sumGross) || 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'details' && (
          <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep('upload')}
            >
              Zurück
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={uploading || !file || !sumGross || !voucherDate}
              loading={uploading}
              icon={<Upload size={16} />}
            >
              {uploading ? 'Wird hochgeladen...' : 'Beleg erstellen'}
            </Button>
          </div>
        )}
      </div>
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
