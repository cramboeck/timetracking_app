import { useState, useEffect } from 'react';
import { Package, TrendingUp, Loader2, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { customerPortalApi, PortalLicenseData, PortalLicenseProduct } from '../../services/api';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE', {
    month: 'short',
    year: 'numeric',
  });
};

const formatMonth = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    month: 'short',
    year: 'numeric',
  });
};

export const PortalLicenses = () => {
  const [data, setData] = useState<PortalLicenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLicenses();
  }, []);

  const loadLicenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerPortalApi.getLicenses();
      if (response.success) {
        setData(response.data);
      } else {
        setError('Fehler beim Laden der Lizenzdaten');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Lizenzdaten');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[var(--portal-primary)]" />
        <span className="ml-2 text-gray-500 dark:text-dark-400">Lade Lizenzdaten...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
        </div>
      </div>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-center py-16 text-gray-500 dark:text-dark-400">
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Keine Lizenzen vorhanden</p>
          <p className="text-sm mt-1">
            Es wurden noch keine Lizenzen oder Abonnements für Ihr Unternehmen erfasst.
          </p>
        </div>
      </div>
    );
  }

  const { products, monthlyBreakdown, summary } = data;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Package size={24} className="text-[var(--portal-primary)]" />
        Ihre Lizenzen & Abonnements
      </h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
            <Package size={14} />
            Produkte
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {summary.uniqueProducts}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
            <DollarSign size={14} />
            Monatliche Kosten
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.billedAmount)}
          </div>
        </div>

        {summary.includedAmount > 0 && (
          <div className="bg-white dark:bg-dark-100 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mb-1">
              <CheckCircle size={14} />
              Im Vertrag inkl.
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(summary.includedAmount)}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      {monthlyBreakdown.length > 1 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <TrendingUp size={18} />
            Monatsverlauf
          </h3>
          <div className="flex items-end gap-2 h-24">
            {monthlyBreakdown.slice().reverse().map((month) => {
              const maxAmount = Math.max(...monthlyBreakdown.map(m => m.totalAmount));
              const height = maxAmount > 0 ? (month.totalAmount / maxAmount) * 100 : 0;
              return (
                <div key={month.month} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max(height, 5)}%`,
                      backgroundColor: 'var(--portal-primary)',
                    }}
                    title={`${formatMonth(month.month)}: ${formatCurrency(month.totalAmount)}`}
                  />
                  <div className="text-xs text-gray-500 dark:text-dark-400 mt-2 truncate w-full text-center">
                    {formatMonth(month.month)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Products List */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Aktive Lizenzen ({products.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {products.map((product, index) => (
            <ProductRow key={`${product.description}-${index}`} product={product} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="text-sm text-gray-500 dark:text-dark-400 space-y-1">
        <p className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
          In Ihrer Vertragspauschale enthalten
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-300 dark:bg-dark-400"></span>
          Wird monatlich separat abgerechnet
        </p>
      </div>
    </div>
  );
};

interface ProductRowProps {
  product: PortalLicenseProduct;
}

const ProductRow = ({ product }: ProductRowProps) => {
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-200/30 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
          product.isIncluded ? 'bg-green-500' : 'bg-gray-300 dark:bg-dark-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white truncate">
            {product.description || 'Ohne Beschreibung'}
          </div>
          <div className="text-sm text-gray-500 dark:text-dark-400 flex items-center gap-2 flex-wrap mt-0.5">
            <span>{product.totalQuantity}× Lizenzen</span>
            {product.vendors.length > 0 && (
              <>
                <span>•</span>
                <span>{product.vendors.join(', ')}</span>
              </>
            )}
            {product.contractName && (
              <>
                <span>•</span>
                <span className="text-green-600 dark:text-green-400">{product.contractName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="text-right flex-shrink-0 ml-4">
        <div className={`font-semibold ${
          product.isIncluded
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-900 dark:text-white'
        }`}>
          {product.isIncluded ? 'Inkl.' : formatCurrency(product.totalAmount)}
        </div>
        <div className="text-xs text-gray-500 dark:text-dark-400">
          {formatDate(product.lastSeen)}
        </div>
      </div>
    </div>
  );
};

export default PortalLicenses;
