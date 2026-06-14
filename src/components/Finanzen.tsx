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
  RefreshCw,
  CheckCircle,
  X,
  Pencil,
} from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { toLocalDateString } from '../utils/time';
import { formatCurrency, formatDate } from '../utils/formatting';
import { sevdeskApi, microsoft365Api, BillingSummaryItem, InvoiceExport, SevdeskInvoice, SevdeskQuote, SevdeskVoucher, ProcessedInvoice } from '../services/api';
import { SourceBadge, ReceiptSource } from './ui/SourceBadge';

// Erweitert SevdeskVoucher um die Quelle, damit der Belege-Tab auch fuer
// E-Mail-/Manual-Belege Source-Badges zeigen kann. Wird beim Mapping von
// ProcessedInvoice -> SevdeskVoucher-Shape angehaengt.
type VoucherWithSource = SevdeskVoucher & { source?: ReceiptSource };

const mapProcessedInvoiceToVoucher = (pi: ProcessedInvoice): VoucherWithSource => {
  const supplier = pi.supplierName
    ? { id: '', name: pi.supplierName }
    : pi.senderName
    ? { id: '', name: pi.senderName }
    : null;
  const taxRate = pi.netAmount && pi.vatAmount && pi.netAmount !== 0
    ? Math.round((pi.vatAmount / pi.netAmount) * 100)
    : 19;
  const status = pi.status === 'processed' || pi.status === 'imported' ? 1000 : 100;
  return {
    id: pi.sevdeskVoucherId || pi.id,
    voucherNumber: pi.sevdeskVoucherNumber || pi.invoiceNumber || pi.originalFilename || '—',
    voucherDate: pi.invoiceDate || pi.receivedAt,
    description: pi.emailSubject || pi.originalFilename || '',
    status,
    statusName: status === 1000 ? 'Verbucht' : 'Entwurf',
    voucherType: 'VOU',
    creditDebit: 'D',
    supplier,
    sumNet: pi.netAmount ?? 0,
    sumGross: pi.grossAmount ?? 0,
    sumTax: pi.vatAmount ?? 0,
    taxRate,
    currency: pi.currency || 'EUR',
    paidAt: null,
    document: null,
    source: pi.source,
  };
};
import { QuoteEditor } from './QuoteEditor';
import { SevdeskSettings } from './SevdeskSettings';
import { InvoiceCreationDialog } from './InvoiceCreationDialog';
import { BillingOverview } from './BillingOverview';
import { InvoiceDraftQueue } from './InvoiceDraftQueue';

type FinanzenTab = 'billing' | 'outgoing' | 'quotes' | 'incoming' | 'settings';
type DocumentType = 'invoices' | 'quotes' | 'vouchers';

interface FinanzenProps {
  onBack?: () => void;
}

export const Finanzen = ({ onBack: _onBack }: FinanzenProps) => {
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
    { id: 'billing', label: 'Abrechnung', icon: Clock },
    { id: 'outgoing', label: 'Ausgangsrechnungen', icon: FileText },
    { id: 'quotes', label: 'Angebote', icon: Send },
    { id: 'incoming', label: 'Eingangsbelege', icon: Receipt },
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
      {activeTab === 'outgoing' && <OutgoingInvoicesTab />}
      {activeTab === 'quotes' && <QuotesTab />}
      {activeTab === 'incoming' && <IncomingReceiptsTab />}
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

// ==================== Outgoing Invoices Tab ====================
const OutgoingInvoicesTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<SevdeskInvoice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<SevdeskInvoice | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const res = await sevdeskApi.getInvoices({ limit: 500 });
      setInvoices(res.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    !searchQuery ||
    inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: number) => {
    if (status >= 1000) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status >= 200) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText className="text-accent-primary" size={20} />
          Ausgangsrechnungen
        </h2>
        <Button variant="ghost" size="sm" onClick={loadInvoices} icon={<RefreshCw size={16} />}>
          Aktualisieren
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-accent-primary" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-dark-400">
          Keine Rechnungen gefunden
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              onClick={() => setSelectedInvoice(invoice)}
              className="flex items-center gap-3 p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg">
                <FileText size={20} className="text-gray-500 dark:text-dark-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invoice.invoiceNumber || 'Entwurf'}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(invoice.status)}`}>
                    {invoice.statusName}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                  {invoice.contact?.name || 'Kein Kunde'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(invoice.sumGross)}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedInvoice && (
        <DocumentDetail
          type="invoices"
          document={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
};

// ==================== Quotes Tab ====================
const QuotesTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<SevdeskQuote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuote, setSelectedQuote] = useState<SevdeskQuote | null>(null);
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const res = await sevdeskApi.getQuotes({ limit: 500 });
      setQuotes(res.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = quotes.filter(q =>
    !searchQuery ||
    q.quoteNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    q.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: number) => {
    if (status >= 1000) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status >= 500) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Send className="text-accent-primary" size={20} />
          Angebote
        </h2>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => { setEditingQuoteId(null); setShowQuoteEditor(true); }} icon={<Plus size={16} />}>
            Neues Angebot
          </Button>
          <Button variant="ghost" size="sm" onClick={loadQuotes} icon={<RefreshCw size={16} />}>
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-accent-primary" />
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-dark-400">
          Keine Angebote gefunden
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.map((quote) => (
            <div
              key={quote.id}
              onClick={() => setSelectedQuote(quote)}
              className="flex items-center gap-3 p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg">
                <Send size={20} className="text-gray-500 dark:text-dark-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {quote.quoteNumber || 'Entwurf'}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(quote.status)}`}>
                    {quote.statusName}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                  {quote.contact?.name || 'Kein Kunde'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(quote.sumGross)}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{formatDate(quote.quoteDate)}</p>
              </div>
              <IconButton
                icon={<Pencil size={16} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingQuoteId(quote.id);
                  setShowQuoteEditor(true);
                }}
                tooltip="Bearbeiten"
              />
              <ChevronRight size={18} className="text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {/* Quote Editor */}
      {showQuoteEditor && (
        <QuoteEditor
          quoteId={editingQuoteId || undefined}
          onClose={() => { setShowQuoteEditor(false); setEditingQuoteId(null); }}
          onSuccess={() => { setShowQuoteEditor(false); setEditingQuoteId(null); loadQuotes(); }}
        />
      )}

      {/* Detail Modal */}
      {selectedQuote && !showQuoteEditor && (
        <DocumentDetail
          type="quotes"
          document={selectedQuote}
          onClose={() => setSelectedQuote(null)}
        />
      )}
    </div>
  );
};

// ==================== Incoming Receipts Tab ====================
const IncomingReceiptsTab = () => {
  const [showInbox, setShowInbox] = useState(true);
  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState<VoucherWithSource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadVouchers();
  }, []);

  const loadVouchers = async () => {
    try {
      setLoading(true);
      const res = await microsoft365Api.getProcessedInvoices({
        status: 'processed,imported',
        source: 'email,manual,sevdesk_import',
        limit: 500,
      });
      setVouchers((res.data || []).map(mapProcessedInvoiceToVoucher));
    } catch (err: any) {
      console.error('Error loading vouchers:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredVouchers = vouchers.filter(v =>
    !searchQuery ||
    v.voucherNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVoucherStatusColor = (status: number) => {
    if (status >= 1000) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status >= 100) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400';
  };

  return (
    <div className="space-y-6">
      {/* Inbox Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Receipt className="text-accent-primary" size={20} />
          Eingangsbelege
        </h2>
        <Button
          variant={showInbox ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setShowInbox(!showInbox)}
          icon={showInbox ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        >
          {showInbox ? 'Inbox ausblenden' : 'Inbox einblenden'}
        </Button>
      </div>

      {/* Invoice Draft Queue (Inbox) */}
      {showInbox && (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden" style={{ maxHeight: '500px' }}>
          <InvoiceDraftQueue />
        </div>
      )}

      {/* Processed Vouchers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" />
            Verarbeitete Belege ({vouchers.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={loadVouchers} icon={<RefreshCw size={16} />}>
            Aktualisieren
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Belege durchsuchen..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-accent-primary" />
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-dark-400">
            <CreditCard size={32} className="mx-auto mb-2 opacity-50" />
            Keine verarbeiteten Belege
          </div>
        ) : (
          <div className="space-y-2">
            {filteredVouchers.map((voucher) => (
              <div
                key={voucher.id}
                className="flex items-center gap-3 p-4 bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg"
              >
                <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg">
                  <CreditCard size={20} className="text-gray-500 dark:text-dark-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {voucher.voucherNumber || voucher.description || `Beleg #${voucher.id.slice(0, 8)}`}
                    </span>
                    <SourceBadge source={voucher.source} />
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getVoucherStatusColor(voucher.status)}`}>
                      {voucher.statusName}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                    {voucher.supplier?.name || 'Kein Lieferant'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${voucher.creditDebit === 'C' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                    {voucher.creditDebit === 'C' ? '+' : '-'}{formatCurrency(voucher.sumGross)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {formatDate(voucher.voucherDate)}
                  </p>
                </div>
                {voucher.source === 'sevdesk_import' && (
                  <a
                    href={`https://my.sevdesk.de/voucher/${voucher.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={16} className="text-gray-400" />
                  </a>
                )}
              </div>
            ))}
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
