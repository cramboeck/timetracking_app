import { useState, useEffect } from 'react';
import { Wallet, AlertCircle, ChevronRight, Star, Loader2, Lock } from 'lucide-react';
import { sevdeskApi, BillingSummaryItem } from '../services/api';

interface BillingWidgetProps {
  onNavigateToBilling: () => void;
}

export const BillingWidget = ({ onNavigateToBilling }: BillingWidgetProps) => {
  const [loading, setLoading] = useState(true);
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [unbilledSummary, setUnbilledSummary] = useState<{
    customerCount: number;
    totalHours: number;
    totalAmount: number;
  } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Check feature access
        const featureResponse = await sevdeskApi.getFeatureStatus();
        setBillingEnabled(featureResponse.data.billingEnabled);

        if (featureResponse.data.billingEnabled) {
          // Get current month's unbilled data
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

          const summaryResponse = await sevdeskApi.getBillingSummary(
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          );

          // Calculate totals from unbilled items
          const unbilledItems = summaryResponse.data.filter((item: BillingSummaryItem) => !item.isBilled);
          const totalHours = unbilledItems.reduce((sum: number, item: BillingSummaryItem) => sum + item.totalHours, 0);
          const totalAmount = unbilledItems.reduce((sum: number, item: BillingSummaryItem) => sum + (item.totalAmount || 0), 0);

          setUnbilledSummary({
            customerCount: unbilledItems.length,
            totalHours,
            totalAmount,
          });
        }
      } catch (err) {
        console.error('Error loading billing widget data:', err);
        setBillingEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="animate-spin text-accent-primary" size={24} />
        </div>
      </div>
    );
  }

  // Premium teaser for non-billing users
  if (!billingEnabled) {
    return (
      <div
        onClick={onNavigateToBilling}
        className="bg-gradient-to-br from-accent-primary/5 to-accent-primary/10 dark:from-accent-primary/10 dark:to-accent-primary/20 rounded-lg border border-accent-primary/20 p-6 cursor-pointer hover:shadow-md transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-primary/10 rounded-xl">
              <Lock size={24} className="text-accent-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">Finanzen</h3>
                <span className="flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  <Star size={10} className="fill-amber-500 text-amber-500" />
                  PRO
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Rechnungen, Angebote und Abrechnungen verwalten
              </p>
            </div>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </div>
      </div>
    );
  }

  // Normal billing widget for enabled users
  const hasUnbilled = unbilledSummary && unbilledSummary.customerCount > 0;

  return (
    <div
      onClick={onNavigateToBilling}
      className={`rounded-lg border p-6 cursor-pointer hover:shadow-md transition-shadow ${
        hasUnbilled
          ? 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10 border-orange-200 dark:border-orange-800'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${
            hasUnbilled
              ? 'bg-orange-100 dark:bg-orange-900/30'
              : 'bg-accent-primary/10'
          }`}>
            {hasUnbilled ? (
              <AlertCircle size={24} className="text-orange-600 dark:text-orange-400" />
            ) : (
              <Wallet size={24} className="text-accent-primary" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              {hasUnbilled ? 'Offene Posten' : 'Finanzen'}
            </h3>
            {hasUnbilled ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-orange-700 dark:text-orange-400 font-medium">
                  {unbilledSummary.customerCount} Kunden
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {unbilledSummary.totalHours.toFixed(1)}h
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {formatCurrency(unbilledSummary.totalAmount)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Keine offenen Abrechnungen diesen Monat
              </p>
            )}
          </div>
        </div>
        <ChevronRight size={20} className="text-gray-400" />
      </div>
    </div>
  );
};

export default BillingWidget;
