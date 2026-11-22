import { useState, useEffect, Fragment } from 'react';
import {
  Wallet,
  Receipt,
  FileText,
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
  RotateCcw,
  Search,
  Plus,
  RefreshCw,
  CheckCircle,
  X,
  Pencil,
  Link2,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, IconButton } from './ui/Button';
import CustomerAvatar from './ui/CustomerAvatar';
import { toLocalDateString } from '../utils/time';
import { formatCurrency, formatDate } from '../utils/formatting';
import { sevdeskApi, BillingSummaryItem, InvoiceExport, SevdeskInvoice, SevdeskQuote, SevdeskVoucher } from '../services/api';
import { QuoteEditor } from './QuoteEditor';
import { InvoiceCreationDialog } from './InvoiceCreationDialog';
import { BillingOverview, LicenseExpiryCard } from './BillingOverview';
import { CustomerSevdeskLink } from './CustomerSevdeskLink';

type DocumentType = 'invoices' | 'quotes' | 'vouchers';

interface FinanzenProps {
  /** SubView: 'billing' = Abrechnung, 'sales' = Rechnungen & Angebote */
  view: 'billing' | 'sales';
  /** Kunde im CRM (CustomerHub) öffnen — App-weiter handleOpenCustomer */
  onOpenCustomer?: (customerId: string) => void;
}

export const Finanzen = ({ view, onOpenCustomer }: FinanzenProps) => {
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {view === 'billing' ? <BillingTab onOpenCustomer={onOpenCustomer} /> : <SalesDocumentsView />}
    </div>
  );
};

// ==================== Rechnungen & Angebote (SubView 'sales') ====================
// Ausgangsrechnungen und Angebote waren vorher zwei Reiter einer versteckten
// Tab-Leiste hinter „Abrechnung" — jetzt ein eigener SubView, der Dokumenttyp
// steht in der URL (?doc=quotes), damit Deep-Links und Browser-Back gehen.
type SalesDocType = 'invoices' | 'quotes';

const SalesDocumentsView = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const docType: SalesDocType = searchParams.get('doc') === 'quotes' ? 'quotes' : 'invoices';

  const switchTo = (next: SalesDocType) => {
    if (next === docType) return;
    const params = new URLSearchParams(searchParams);
    if (next === 'quotes') params.set('doc', 'quotes');
    else params.delete('doc');
    setSearchParams(params);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="text-accent-primary" />
            Rechnungen &amp; Angebote
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Ausgangsrechnungen und Angebote aus sevDesk
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-dark-200 p-1 self-start sm:self-auto">
          {([['invoices', 'Rechnungen', FileText], ['quotes', 'Angebote', Send]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => switchTo(id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                docType === id
                  ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                  : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {docType === 'invoices' ? <OutgoingInvoicesTab /> : <QuotesTab />}
    </div>
  );
};

// Seitenweise Anzeige für Rechnungen/Angebote (FIN-4): sevDesk wird weiter
// mit max. 500 Einträgen abgefragt (Sortier-/Zähl-Parameter der sevDesk-API
// sind nicht verifiziert — nichts auf Verdacht), gerendert werden aber nur
// 25 pro Schritt. Erreicht der Abruf das Limit, sagt die Liste das offen.
const SALES_PAGE_SIZE = 25;
const SALES_LOAD_LIMIT = 500;

const ListPagingFooter = ({ shown, total, loaded, onMore, noun }: {
  shown: number;
  total: number;
  loaded: number;
  onMore: () => void;
  noun: string;
}) => {
  const remaining = total - shown;
  const limitHit = loaded >= SALES_LOAD_LIMIT;
  if (remaining <= 0 && !limitHit) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      {remaining > 0 && (
        <Button variant="secondary" size="sm" onClick={onMore}>
          Weitere {Math.min(remaining, SALES_PAGE_SIZE)} anzeigen ({remaining} übrig)
        </Button>
      )}
      <p className="text-xs text-gray-500 dark:text-dark-400 text-center">
        {shown} von {total} {noun}
        {limitHit && ` — es werden höchstens ${SALES_LOAD_LIMIT} aus sevDesk geladen; ältere findest du über Finanzen → Suche oder direkt in sevDesk`}
      </p>
    </div>
  );
};

// sevDesk-Fehler kommen als rohe Upstream-Texte („fetch failed", „401 …").
// In der Oberfläche zeigen wir eine verständliche Meldung; das Original bleibt
// als Detail für die Diagnose sichtbar.
const describeSevdeskError = (raw: string | undefined): { title: string; detail?: string } => {
  const msg = (raw || '').trim();
  if (/fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND|timeout/i.test(msg)) {
    return { title: 'sevDesk ist gerade nicht erreichbar. Bitte später erneut versuchen.', detail: msg || undefined };
  }
  if (/401|403|unauthori|token/i.test(msg)) {
    return { title: 'sevDesk hat den Zugriff abgelehnt — bitte den API-Token unter Einstellungen → sevDesk prüfen.', detail: msg || undefined };
  }
  if (/not configured|nicht konfiguriert/i.test(msg)) {
    return { title: 'sevDesk ist noch nicht eingerichtet (Einstellungen → sevDesk).' };
  }
  return { title: 'Die Daten aus sevDesk konnten nicht geladen werden.', detail: msg || undefined };
};

const SevdeskErrorBanner = ({ error, onRetry }: { error: string; onRetry?: () => void }) => {
  const { title, detail } = describeSevdeskError(error);
  return (
    <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {detail && <p className="text-xs opacity-75 mt-0.5 truncate">Technisches Detail: {detail}</p>}
      </div>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} icon={<RefreshCw size={14} />}>
          Erneut
        </Button>
      )}
    </div>
  );
};

// ==================== Billing Tab ====================
type BillingPeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

const BillingTab = ({ onOpenCustomer }: { onOpenCustomer?: (customerId: string) => void }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryItem[]>([]);
  const [invoiceExports, setInvoiceExports] = useState<InvoiceExport[]>([]);
  const [hasConfig, setHasConfig] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Kunde, der gerade per Dialog mit sevDesk verknüpft wird (FIN-2)
  const [linkingCustomer, setLinkingCustomer] = useState<BillingSummaryItem | null>(null);

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
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      return { startDate, endDate };
    } else {
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

        const hasOverlappingExport = exports.some((exp: InvoiceExport) => {
          if (exp.customerId !== item.customerId) return false;
          const expStart = new Date(exp.periodStart);
          const expEnd = new Date(exp.periodEnd);
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

  // Navigation (monthly/quarterly/yearly)
  const handlePrev = () => {
    if (billingPeriodType === 'monthly') {
      setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
    } else if (billingPeriodType === 'quarterly') {
      if (selectedQuarter === 1) {
        setSelectedQuarter(4);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedQuarter(selectedQuarter - 1);
      }
    } else {
      setSelectedYear(selectedYear - 1);
    }
  };

  const handleNext = () => {
    if (billingPeriodType === 'monthly') {
      setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
    } else if (billingPeriodType === 'quarterly') {
      if (selectedQuarter === 4) {
        setSelectedQuarter(1);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedQuarter(selectedQuarter + 1);
      }
    } else {
      setSelectedYear(selectedYear + 1);
    }
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
      return `${start} – ${end}`;
    } else {
      return `Jahr ${selectedYear}`;
    }
  };

  // Open invoice creation dialog
  const handleCreateInvoice = (customer: BillingSummaryItem) => {
    if (!customer.sevdeskCustomerId) {
      setLinkingCustomer(customer);
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

  // Mark as billed without creating invoice (z.B. Abrechnung außerhalb sevDesk)
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

  const formatMoney = (amount: number | null) => {
    if (amount === null) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };
  // H:MM statt „8.00h" — gleiche Schreibweise wie die KPI-Kacheln
  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${String(m).padStart(2, '0')} h`;
  };
  const formatDay = (dateStr: string) => new Date(dateStr).toLocaleDateString('de-DE');

  const periodName = getPeriodName();
  const unbilledItems = billingSummary.filter(item => !item.isBilled);
  const billedItems = billingSummary.filter(item => item.isBilled);

  const PERIOD_TYPES: Array<[BillingPeriodType, string]> = [
    ['monthly', 'Monat'],
    ['quarterly', 'Quartal'],
    ['yearly', 'Jahr'],
    ['custom', 'Frei'],
  ];

  return (
    <div className="space-y-5">
      {/* Kopf: Titel + Zeitraum steuern die ganze Seite (vorher klemmte die
          Periodenwahl mitten zwischen zwei Listen) */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet className="text-accent-primary" />
            Abrechnung
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Abrechenbare Zeiten pro Kunde — {periodName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-dark-200 p-1">
            {PERIOD_TYPES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBillingPeriodType(id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  billingPeriodType === id
                    ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {billingPeriodType === 'custom' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                aria-label="Von"
                className="px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15"
              />
              <span className="text-gray-400 dark:text-dark-400">–</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                aria-label="Bis"
                className="px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15"
              />
            </div>
          ) : (
            <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
              <IconButton
                icon={<ChevronLeft size={18} />}
                onClick={handlePrev}
                tooltip="Vorheriger Zeitraum"
                size="sm"
              />
              <span className="px-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap min-w-[7.5rem] text-center">
                {periodName}
              </span>
              <IconButton
                icon={<ChevronRight size={18} />}
                onClick={handleNext}
                tooltip="Nächster Zeitraum"
                size="sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* sevDesk nicht eingerichtet */}
      {!loading && !hasConfig && (
        <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">sevDesk ist noch nicht eingerichtet</p>
            <p className="mt-0.5">
              Ohne API-Token kannst du Zeiten nur als „erledigt" markieren.{' '}
              <a href="/settings?tab=sevdesk" className="underline font-medium">Jetzt unter Einstellungen → sevDesk einrichten</a>
            </p>
          </div>
        </div>
      )}

      {error && <SevdeskErrorBanner error={error} onRetry={loadData} />}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-300">
          <Check size={18} />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* KPIs */}
      <BillingOverview
        billingSummary={billingSummary.map(item => ({
          customerId: item.customerId,
          totalHours: item.totalHours,
          roundedHours: item.roundedHours,
          totalAmount: item.totalAmount || 0,
          isBilled: item.isBilled || false,
        }))}
      />

      {/* EINE Liste der offenen Kunden (vorher doppelt: „Top offene
          Abrechnungen" + „Nicht abgerechnete Zeiten" mit identischem Inhalt) */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">Offen</h2>
          {!loading && unbilledItems.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-dark-400">
              {unbilledItems.length} Kunde{unbilledItems.length === 1 ? '' : 'n'}
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-accent-primary" size={24} />
          </div>
        ) : unbilledItems.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-dark-400">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-500" />
            <p className="font-medium text-gray-700 dark:text-dark-500">Alles abgerechnet</p>
            <p className="text-sm mt-0.5">Keine offenen abrechenbaren Zeiten für {periodName}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {[...unbilledItems]
              .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
              .map((item) => {
                const linked = !!item.sevdeskCustomerId;
                const rounded = item.roundedHours && item.roundedHours !== item.totalHours;
                return (
                  <div key={item.customerId} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CustomerAvatar
                        name={item.customerName}
                        color={item.customerColor}
                        logoUrl={item.customerLogoUrl}
                        size="md"
                      />
                      <div className="min-w-0">
                        {onOpenCustomer ? (
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(item.customerId)}
                            className="block max-w-full font-medium text-gray-900 dark:text-white truncate text-left hover:text-accent-primary dark:hover:text-accent-primary transition-colors"
                            title="Im CRM öffnen"
                          >
                            {item.customerName}
                          </button>
                        ) : (
                          <p className="font-medium text-gray-900 dark:text-white truncate">{item.customerName}</p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {formatHours(item.roundedHours || item.totalHours)}
                          {rounded && <> (gerundet aus {formatHours(item.totalHours)})</>}
                          {' · '}{item.entries?.length || 0} Einträge
                          {!linked && hasConfig && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              · nicht mit sevDesk verknüpft
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0">
                      <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                        {formatMoney(item.totalAmount)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {hasConfig && linked && (
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
                        )}
                        {hasConfig && !linked && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setLinkingCustomer(item)}
                            icon={<Link2 size={14} />}
                            className="whitespace-nowrap"
                          >
                            <span className="sm:hidden">Verknüpfen</span>
                            <span className="hidden sm:inline">Mit sevDesk verknüpfen</span>
                          </Button>
                        )}
                        {(!hasConfig || !linked) && (
                          <IconButton
                            icon={processing === item.customerId ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            onClick={() => handleMarkAsBilled(item.customerId, item.customerName)}
                            disabled={processing === item.customerId}
                            tooltip="Ohne Rechnung als erledigt markieren"
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Bereits abgerechnet im Zeitraum */}
      {!loading && billedItems.length > 0 && (
        <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle size={17} className="text-green-500" />
              Abgerechnet in {periodName}
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {billedItems.map((item) => {
              const billedViaOverlap = (item as BillingSummaryItem & { billedViaOverlap?: boolean }).billedViaOverlap;
              return (
                <div key={item.customerId} className="px-4 py-2.5 flex items-center gap-3">
                  <CustomerAvatar
                    name={item.customerName}
                    color={item.customerColor}
                    logoUrl={item.customerLogoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    {onOpenCustomer ? (
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(item.customerId)}
                        className="block max-w-full text-sm font-medium text-gray-900 dark:text-white truncate text-left hover:text-accent-primary dark:hover:text-accent-primary transition-colors"
                        title="Im CRM öffnen"
                      >
                        {item.customerName}
                      </button>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.customerName}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-dark-400">
                      {formatHours(item.roundedHours || item.totalHours)}
                      {billedViaOverlap && ' · über Quartals-/Jahresabrechnung'}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                    {formatMoney(item.totalAmount)}
                  </span>
                  {!billedViaOverlap && (
                    <IconButton
                      icon={processing === item.customerId ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      onClick={() => handleRevertBilling(item.customerId, item.customerName)}
                      disabled={processing === item.customerId}
                      tooltip="Abrechnung zurücksetzen"
                      size="sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ablaufende Lizenzen (nur bei Treffern) */}
      <LicenseExpiryCard />

      {/* Abrechnungs-Historie */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCompleted(!showCompleted)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
        >
          <span className="font-semibold text-gray-900 dark:text-white">
            Abrechnungs-Historie ({invoiceExports.length})
          </span>
          {showCompleted
            ? <ChevronDown size={18} className="text-gray-400 dark:text-dark-400" />
            : <ChevronRight size={18} className="text-gray-400 dark:text-dark-400" />}
        </button>
        {showCompleted && (
          invoiceExports.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-dark-400 border-t border-gray-100 dark:border-dark-border">
              Noch keine Abrechnungen
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-dark-border border-t border-gray-100 dark:border-dark-border">
              {invoiceExports.map((exp) => (
                <div key={exp.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{exp.customerName}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">{formatDay(exp.periodStart)} – {formatDay(exp.periodEnd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{formatMoney(exp.totalAmount)}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">{exp.sevdeskInvoiceNumber || 'ohne Rechnung'}</p>
                  </div>
                  {!exp.sevdeskInvoiceNumber && (
                    <IconButton
                      icon={processing === exp.id ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}
                      onClick={() => handleUndoExport(exp.id, exp.customerName)}
                      disabled={processing === exp.id}
                      variant="danger"
                      tooltip="Rückgängig"
                      size="sm"
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

      {/* sevDesk-Verknüpfung direkt aus der Abrechnung (vorher nur ein
          unerklärter grauer Balken + „Erledigt") */}
      {linkingCustomer && (
        <CustomerSevdeskLink
          isOpen={true}
          customer={{
            id: linkingCustomer.customerId,
            name: linkingCustomer.customerName,
            sevdeskCustomerId: linkingCustomer.sevdeskCustomerId,
          }}
          onClose={() => setLinkingCustomer(null)}
          onLinked={() => {
            setLinkingCustomer(null);
            loadData();
          }}
        />
      )}
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
                      <p className={`font-medium ${(detail as SevdeskVoucher).creditDebit === 'D' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                        {(detail as SevdeskVoucher).creditDebit === 'D' ? '+' : '-'}{formatCurrency(detail.sumGross)}
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
  const [visibleCount, setVisibleCount] = useState(SALES_PAGE_SIZE);
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
      setError(null);
      const res = await sevdeskApi.getInvoices({ limit: SALES_LOAD_LIMIT });
      setInvoices(res.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Neue Suche → wieder bei der ersten Seite beginnen
  useEffect(() => { setVisibleCount(SALES_PAGE_SIZE); }, [searchQuery]);

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
        <p className="text-sm text-gray-500 dark:text-dark-400">
          {loading ? 'Lade Rechnungen…' : error ? '' : `${invoices.length} Rechnung${invoices.length === 1 ? '' : 'en'}`}
        </p>
        <Button variant="ghost" size="sm" onClick={loadInvoices} icon={<RefreshCw size={16} />}>
          Aktualisieren
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen..."
          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15"
        />
      </div>

      {error && <SevdeskErrorBanner error={error} onRetry={loadInvoices} />}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-accent-primary" />
        </div>
      ) : error ? null : filteredInvoices.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-dark-400">
          Keine Rechnungen gefunden
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.slice(0, visibleCount).map((invoice) => (
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
              <ChevronRight size={18} className="text-gray-400 dark:text-dark-400" />
            </div>
          ))}
          <ListPagingFooter
            shown={Math.min(visibleCount, filteredInvoices.length)}
            total={filteredInvoices.length}
            loaded={invoices.length}
            onMore={() => setVisibleCount(c => c + SALES_PAGE_SIZE)}
            noun="Rechnungen"
          />
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
  const [visibleCount, setVisibleCount] = useState(SALES_PAGE_SIZE);
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
      setError(null);
      const res = await sevdeskApi.getQuotes({ limit: SALES_LOAD_LIMIT });
      setQuotes(res.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setVisibleCount(SALES_PAGE_SIZE); }, [searchQuery]);

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
        <p className="text-sm text-gray-500 dark:text-dark-400">
          {loading ? 'Lade Angebote…' : error ? '' : `${quotes.length} Angebot${quotes.length === 1 ? '' : 'e'}`}
        </p>
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
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suchen..."
          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15"
        />
      </div>

      {error && <SevdeskErrorBanner error={error} onRetry={loadQuotes} />}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-accent-primary" />
        </div>
      ) : error ? null : filteredQuotes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-dark-400">
          Keine Angebote gefunden
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.slice(0, visibleCount).map((quote) => (
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
              <ChevronRight size={18} className="text-gray-400 dark:text-dark-400" />
            </div>
          ))}
          <ListPagingFooter
            shown={Math.min(visibleCount, filteredQuotes.length)}
            total={filteredQuotes.length}
            loaded={quotes.length}
            onMore={() => setVisibleCount(c => c + SALES_PAGE_SIZE)}
            noun="Angeboten"
          />
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

export default Finanzen;
