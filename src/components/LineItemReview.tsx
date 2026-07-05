import { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Loader2,
  Wand2, AlertTriangle, Link2, Building2, Search
} from 'lucide-react';
import { Button } from './ui/Button';
import {
  sevdeskApi,
  LineItemWithMatch,
  LineItemStats,
  InvoiceLineItem
} from '../services/api';
import { Customer } from '../types';

interface LineItemReviewProps {
  invoiceId: string;
  lineItems?: InvoiceLineItem[];
  customers: Customer[];
  onUpdate?: () => void;
}

const formatAmount = (amount: number | null): string => {
  if (amount === null) return '-';
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getConfidenceBadge = (confidence: number | null, method: string | null) => {
  if (confidence === null) return null;

  const pct = Math.round(confidence * 100);
  let color = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  let label = 'Niedrig';

  if (confidence >= 0.85) {
    color = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    label = 'Hoch';
  } else if (confidence >= 0.70) {
    color = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    label = 'Mittel';
  }

  const methodLabels: Record<string, string> = {
    exact_name: 'Name',
    domain: 'Domain',
    distributor_id: 'Dist-ID',
    alias: 'Alias',
    fuzzy: 'Ähnlich',
    customer_number: 'Kd-Nr',
    manual: 'Manuell',
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>
      {pct}% {method ? `(${methodLabels[method] || method})` : label}
    </span>
  );
};

export const LineItemReview = ({
  invoiceId,
  lineItems: initialLineItems,
  customers,
  onUpdate
}: LineItemReviewProps) => {
  const [lineItems, setLineItems] = useState<LineItemWithMatch[]>([]);
  const [stats, setStats] = useState<LineItemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoMatching, setAutoMatching] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveAsAlias, setSaveAsAlias] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // Load line items from backend
  useEffect(() => {
    loadLineItems();
  }, [invoiceId]);

  const loadLineItems = async () => {
    try {
      setLoading(true);
      const [itemsRes, statsRes] = await Promise.all([
        sevdeskApi.getLineItems(invoiceId),
        sevdeskApi.getLineItemStats(invoiceId)
      ]);

      if (itemsRes.success) {
        setLineItems(itemsRes.data);
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error('Failed to load line items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoMatch = async () => {
    try {
      setAutoMatching(true);
      const result = await sevdeskApi.autoMatchLineItems(invoiceId, 0.7);
      if (result.success) {
        await loadLineItems();
        onUpdate?.();
      }
    } catch (err) {
      console.error('Auto-match failed:', err);
    } finally {
      setAutoMatching(false);
    }
  };

  const handleAssignCustomer = async (lineItemId: string, customerId: string) => {
    try {
      setUpdating(lineItemId);
      const result = await sevdeskApi.assignLineItemCustomer(lineItemId, customerId, saveAsAlias);
      if (result.success) {
        await loadLineItems();
        setEditingItem(null);
        setSaveAsAlias(false);
        onUpdate?.();
      }
    } catch (err) {
      console.error('Assign customer failed:', err);
    } finally {
      setUpdating(null);
    }
  };

  const handleStatusChange = async (lineItemId: string, status: 'pending' | 'included' | 'billed' | 'skipped') => {
    try {
      setUpdating(lineItemId);
      const result = await sevdeskApi.updateLineItemStatus(lineItemId, status);
      if (result.success) {
        await loadLineItems();
        onUpdate?.();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setUpdating(null);
    }
  };

  const filteredCustomers = searchQuery.length >= 2
    ? customers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customerNumber && c.customerNumber.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : customers;

  // If no line items persisted yet, show the extraction preview
  if (loading && initialLineItems && initialLineItems.length > 0) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-300">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <span>Rechnungspositionen ({initialLineItems.length})</span>
          <Loader2 size={14} className="animate-spin text-gray-400" />
        </h4>
        <div className="text-sm text-gray-500 dark:text-dark-400">
          Lade Kundenzuordnung...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-300">
        <div className="flex items-center justify-center py-4 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" />
          Lade Positionen...
        </div>
      </div>
    );
  }

  if (lineItems.length === 0) {
    return null;
  }

  const unmatchedCount = lineItems.filter(i => !i.customerId).length;
  const hasMultipleCustomers = new Set(lineItems.filter(i => i.extractedCustomerName).map(i => i.extractedCustomerName)).size > 1;

  return (
    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white hover:text-accent-primary"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>Rechnungspositionen ({lineItems.length})</span>
          {hasMultipleCustomers && (
            <span className="text-xs bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary px-2 py-0.5 rounded">
              MSP/Reseller
            </span>
          )}
        </button>

        {expanded && (
          <div className="flex items-center gap-2">
            {stats && (
              <span className="text-xs text-gray-500 dark:text-dark-400">
                {stats.matched}/{stats.total} zugeordnet
              </span>
            )}
            {unmatchedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoMatch}
                disabled={autoMatching}
                icon={autoMatching ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              >
                Auto-Match
              </Button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <>
          {/* Stats Bar */}
          {stats && stats.total > 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs">
              <div className="flex-1 bg-gray-200 dark:bg-dark-300 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(stats.matched / stats.total) * 100}%` }}
                />
              </div>
              {unmatchedCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {unmatchedCount} offen
                </span>
              )}
            </div>
          )}

          {/* Line Items List */}
          <div className="space-y-2 max-h-96 overflow-y-auto scroll-touch">
            {lineItems.map((item) => (
              <div
                key={item.id}
                className={`bg-gray-50 dark:bg-dark-200 rounded-lg p-3 text-sm ${
                  !item.customerId ? 'border-l-2 border-amber-400' : ''
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  {/* Left side: Description and extracted info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.positionNumber !== null && (
                        <span className="text-xs bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-400 px-1.5 py-0.5 rounded">
                          #{item.positionNumber}
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {item.description}
                      </span>
                    </div>

                    {/* Extracted customer info */}
                    {(item.extractedCustomerName || item.extractedCustomerDomain || item.extractedCustomerNumber) && (
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        {item.extractedCustomerName && (
                          <span className="text-accent-primary flex items-center gap-1">
                            <Building2 size={12} />
                            {item.extractedCustomerName}
                          </span>
                        )}
                        {item.extractedCustomerDomain && (
                          <span className="text-gray-500 dark:text-dark-400">
                            @{item.extractedCustomerDomain}
                          </span>
                        )}
                        {item.extractedCustomerNumber && (
                          <span className="text-gray-500 dark:text-dark-400 font-mono">
                            #{item.extractedCustomerNumber}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Assigned customer */}
                    {item.customerId && item.customerName && editingItem !== item.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Link2 size={12} />
                          {item.customerName}
                          {item.crmCustomerNumber && (
                            <span className="text-gray-400">({item.crmCustomerNumber})</span>
                          )}
                        </span>
                        {getConfidenceBadge(item.matchConfidence, item.matchMethod)}
                        <button
                          onClick={() => setEditingItem(item.id)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white"
                        >
                          ändern
                        </button>
                      </div>
                    )}

                    {/* Customer selection dropdown */}
                    {(editingItem === item.id || !item.customerId) && (
                      <div className="mt-2 space-y-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Kunde suchen..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:ring-1 focus:ring-accent-primary"
                          />
                        </div>
                        <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-dark-300 rounded bg-white dark:bg-dark-100">
                          {filteredCustomers.slice(0, 10).map((customer) => (
                            <button
                              key={customer.id}
                              onClick={() => handleAssignCustomer(item.id, customer.id)}
                              disabled={updating === item.id}
                              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-200 flex items-center justify-between disabled:opacity-50"
                            >
                              <span className="truncate">{customer.name}</span>
                              {customer.customerNumber && (
                                <span className="text-xs text-gray-400 ml-2">{customer.customerNumber}</span>
                              )}
                            </button>
                          ))}
                          {filteredCustomers.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-dark-400">
                              Keine Kunden gefunden
                            </div>
                          )}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-dark-400">
                          <input
                            type="checkbox"
                            checked={saveAsAlias}
                            onChange={(e) => setSaveAsAlias(e.target.checked)}
                            className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary"
                          />
                          Als Alias speichern (für zukünftige Rechnungen)
                        </label>
                        {editingItem === item.id && (
                          <button
                            onClick={() => {
                              setEditingItem(null);
                              setSearchQuery('');
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-white"
                          >
                            Abbrechen
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right side: Amount and status */}
                  <div className="text-right flex-shrink-0 space-y-1">
                    {item.quantity !== null && (
                      <div className="text-xs text-gray-500 dark:text-dark-400">
                        {item.quantity}x {item.unitPrice !== null ? `à ${formatAmount(item.unitPrice)} €` : ''}
                      </div>
                    )}
                    {item.totalPrice !== null && (
                      <div className="font-medium text-gray-900 dark:text-white">
                        {formatAmount(item.totalPrice)} €
                      </div>
                    )}

                    {/* Rebilling status */}
                    {item.customerId && (
                      <select
                        value={item.rebillingStatus}
                        onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                        disabled={updating === item.id}
                        className="text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-700 dark:text-dark-400"
                      >
                        <option value="pending">Offen</option>
                        <option value="included">In Pauschale</option>
                        <option value="billed">Abgerechnet</option>
                        <option value="skipped">Übersprungen</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-3 text-xs text-gray-500 dark:text-dark-400">
            Zugeordnete Positionen können in der Kundenabrechnung berücksichtigt werden.
          </div>
        </>
      )}
    </div>
  );
};

export default LineItemReview;
