import { useMemo } from 'react';
import {
  Clock, Receipt, CheckCircle2, AlertCircle,
  TrendingUp, Users, ArrowRight, Zap
} from 'lucide-react';
import { StatWidget } from './ui/StatWidget';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export interface BillingSummaryData {
  customerId: string;
  customerName: string;
  totalHours: number;
  roundedHours?: number;
  totalAmount: number;
  isBilled: boolean;
  sevdeskCustomerId?: string | null;
  entryCount: number;
}

interface BillingOverviewProps {
  billingSummary: BillingSummaryData[];
  periodName: string;
  onCreateInvoice?: (customer: BillingSummaryData) => void;
  onMarkAllBilled?: () => void;
  onNavigateToCustomer?: (customerId: string) => void;
}

export const BillingOverview = ({
  billingSummary,
  periodName,
  onCreateInvoice,
  onMarkAllBilled,
  onNavigateToCustomer,
}: BillingOverviewProps) => {
  // Calculate stats
  const stats = useMemo(() => {
    const unbilled = billingSummary.filter(b => !b.isBilled);
    const billed = billingSummary.filter(b => b.isBilled);

    const unbilledHours = unbilled.reduce((sum, b) => sum + (b.roundedHours || b.totalHours), 0);
    const unbilledAmount = unbilled.reduce((sum, b) => sum + b.totalAmount, 0);
    const billedAmount = billed.reduce((sum, b) => sum + b.totalAmount, 0);

    // Top customers by unbilled amount
    const topCustomers = [...unbilled]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    return {
      unbilledCount: unbilled.length,
      billedCount: billed.length,
      unbilledHours: Math.round(unbilledHours * 10) / 10,
      unbilledAmount,
      billedAmount,
      topCustomers,
      totalEntries: unbilled.reduce((sum, b) => sum + b.entryCount, 0),
    };
  }, [billingSummary]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${String(m).padStart(2, '0')} h`;
  };

  return (
    <div className="space-y-6">
      {/* Period Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Abrechnungsübersicht
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            {periodName}
          </p>
        </div>
        {stats.unbilledCount > 0 && onMarkAllBilled && (
          <Button
            onClick={onMarkAllBilled}
            icon={<Zap size={18} />}
            className="bg-green-600 hover:bg-green-700"
          >
            Alle abrechnen
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          label="Offene Stunden"
          value={formatHours(stats.unbilledHours)}
          icon={Clock}
          color={stats.unbilledCount > 0 ? 'orange' : 'gray'}
        />
        <StatWidget
          label="Offener Betrag"
          value={formatCurrency(stats.unbilledAmount)}
          icon={Receipt}
          color={stats.unbilledAmount > 0 ? 'blue' : 'gray'}
        />
        <StatWidget
          label="Kunden offen"
          value={stats.unbilledCount}
          icon={Users}
          color={stats.unbilledCount > 0 ? 'purple' : 'green'}
        />
        <StatWidget
          label="Bereits abgerechnet"
          value={formatCurrency(stats.billedAmount)}
          icon={CheckCircle2}
          color="green"
        />
      </div>

      {/* Top Customers Quick List */}
      {stats.topCustomers.length > 0 && (
        <Card className="rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-500" />
              Top offene Abrechnungen
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {stats.topCustomers.map(customer => (
              <div
                key={customer.customerId}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-10 rounded-full ${
                    customer.sevdeskCustomerId ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {customer.customerName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-dark-400">
                      {formatHours(customer.roundedHours || customer.totalHours)} • {customer.entryCount} Einträge
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(customer.totalAmount)}
                    </p>
                  </div>
                  {onCreateInvoice && customer.sevdeskCustomerId && (
                    <Button
                      onClick={() => onCreateInvoice(customer)}
                      size="sm"
                      icon={<Receipt size={14} />}
                    >
                      Rechnung
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {stats.unbilledCount === 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
            Alles abgerechnet!
          </h3>
          <p className="text-green-600 dark:text-green-400">
            Keine offenen Abrechnungen für {periodName}
          </p>
        </div>
      )}
    </div>
  );
};
