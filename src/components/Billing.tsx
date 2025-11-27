import { useState, useEffect } from 'react';
import {
  CreditCard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  FileText,
  Clock,
  Loader2,
  Send,
  Download,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { sevdeskApi, BillingSummaryItem, InvoiceExport } from '../services/api';

interface BillingProps {
  onBack?: () => void;
}

export const Billing = ({ onBack }: BillingProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Period selection
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Billing data
  const [billingSummary, setBillingSummary] = useState<BillingSummaryItem[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [invoiceExports, setInvoiceExports] = useState<InvoiceExport[]>([]);

  // Config status
  const [hasConfig, setHasConfig] = useState(false);

  // Processing state
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check config
      const configResponse = await sevdeskApi.getConfig();
      setHasConfig(!!configResponse.data?.hasToken);

      // Get billing summary for selected month
      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      const summaryResponse = await sevdeskApi.getBillingSummary(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setBillingSummary(summaryResponse.data);

      // Get recent exports
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

  const selectAll = () => {
    const allIds = billingSummary
      .filter(c => c.totalAmount !== null && c.sevdeskCustomerId)
      .map(c => c.customerId);
    setSelectedCustomers(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  const handleCreateInvoice = async (customer: BillingSummaryItem) => {
    if (!customer.sevdeskCustomerId) {
      setError(`${customer.customerName} ist nicht mit sevDesk verknüpft`);
      return;
    }

    try {
      setProcessing(customer.customerId);
      setError(null);

      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      const entryIds = customer.entries.map(e => e.id);

      const response = await sevdeskApi.createInvoice(
        customer.customerId,
        entryIds,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      setSuccess(`Rechnung ${response.data.invoiceNumber} für ${customer.customerName} erstellt`);

      // Reload data
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Rechnung');
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkAsBilled = async (customer: BillingSummaryItem) => {
    try {
      setProcessing(customer.customerId);
      setError(null);

      const startDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const endDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

      const entryIds = customer.entries.map(e => e.id);

      await sevdeskApi.recordExport(
        customer.customerId,
        entryIds,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        customer.totalHours,
        customer.totalAmount || 0
      );

      setSuccess(`${customer.customerName} als abgerechnet markiert`);

      // Reload data
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Markieren');
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(2)}h`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE');
  };

  const monthName = selectedMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  // Calculate totals
  const selectedSummary = billingSummary.filter(c => selectedCustomers.has(c.customerId));
  const totalHours = selectedSummary.reduce((sum, c) => sum + c.totalHours, 0);
  const totalAmount = selectedSummary.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ChevronLeft size={24} className="text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-light dark:bg-accent-lighter/10 rounded-xl">
              <CreditCard size={28} className="text-accent-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Abrechnung</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Zeiteinträge exportieren und Rechnungen erstellen
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Config Warning */}
      {!hasConfig && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
                sevDesk nicht konfiguriert
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Konfigurieren Sie Ihren sevDesk API-Token in den Einstellungen, um Rechnungen automatisch zu erstellen.
                Sie können Zeiten dennoch als "abgerechnet" markieren.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
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
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {monthName}
            </span>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Billing Summary */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Nicht abgerechnete Zeiten
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="text-sm text-accent-primary hover:underline"
            >
              Alle auswählen
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={deselectAll}
              className="text-sm text-gray-500 hover:underline"
            >
              Keine
            </button>
          </div>
        </div>

        {billingSummary.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <Clock size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine nicht abgerechneten Zeiten für {monthName}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {billingSummary.map((customer) => (
              <div
                key={customer.customerId}
                className={`p-4 transition-colors ${
                  selectedCustomers.has(customer.customerId)
                    ? 'bg-accent-light/30 dark:bg-accent-lighter/5'
                    : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedCustomers.has(customer.customerId)}
                      onChange={() => toggleCustomerSelection(customer.customerId)}
                      disabled={customer.totalAmount === null}
                      className="w-5 h-5 text-accent-primary rounded focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
                    />
                  </div>

                  {/* Customer Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-white truncate">
                        {customer.customerName}
                      </h4>
                      {customer.sevdeskCustomerId ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <Link2 size={12} />
                          sevDesk
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">
                          Nicht verknüpft
                        </span>
                      )}
                    </div>

                    {/* Entries Summary */}
                    <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      {customer.entries.slice(0, 3).map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-gray-400">•</span>
                          {entry.ticketNumber && (
                            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                              {entry.ticketNumber}
                            </span>
                          )}
                          <span className="truncate">
                            {entry.ticketTitle || entry.projectName || entry.description || 'Arbeitszeit'}
                          </span>
                          <span className="text-gray-400 ml-auto">
                            {formatHours(entry.duration / 3600)}
                          </span>
                        </div>
                      ))}
                      {customer.entries.length > 3 && (
                        <div className="text-gray-400">
                          + {customer.entries.length - 3} weitere Einträge
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(customer.totalAmount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatHours(customer.totalHours)} × {formatCurrency(customer.hourlyRate)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {hasConfig && customer.sevdeskCustomerId ? (
                      <button
                        onClick={() => handleCreateInvoice(customer)}
                        disabled={processing === customer.customerId}
                        className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-white rounded-lg text-sm hover:bg-accent-primary/90 disabled:opacity-50"
                      >
                        {processing === customer.customerId ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Send size={16} />
                        )}
                        Rechnung
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkAsBilled(customer)}
                        disabled={processing === customer.customerId}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                      >
                        {processing === customer.customerId ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Check size={16} />
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

        {/* Selection Summary */}
        {selectedCustomers.size > 0 && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedCustomers.size} Kunde(n) ausgewählt
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(totalAmount)}
                </div>
                <div className="text-sm text-gray-500">
                  {formatHours(totalHours)} gesamt
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Exports */}
      {invoiceExports.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Letzte Exporte
            </h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {invoiceExports.slice(0, 10).map((exp) => (
              <div key={exp.id} className="p-4 flex items-center gap-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <FileText size={20} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {exp.customerName}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(exp.periodStart)} - {formatDate(exp.periodEnd)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(exp.totalAmount)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {exp.sevdeskInvoiceNumber || 'Manuell'}
                  </div>
                </div>
                <div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    exp.status === 'paid'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : exp.status === 'sent'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {exp.status === 'paid' ? 'Bezahlt' : exp.status === 'sent' ? 'Versendet' : 'Entwurf'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
