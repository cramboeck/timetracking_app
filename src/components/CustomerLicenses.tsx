import { useState, useEffect } from 'react';
import {
  Package, TrendingUp, Building2, Loader2,
  AlertCircle, CheckCircle, Clock, DollarSign, FileText, HardDrive,
  Inbox, XCircle
} from 'lucide-react';
import { sevdeskApi, CustomerLicenseData, CustomerLicenseProduct, AdminLicenseRequest } from '../services/api';
import { useToast } from '../contexts/UIContext';

interface CustomerLicensesProps {
  customerId: string;
  customerName: string;
}

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

const REQUEST_TYPE_LABELS: Record<AdminLicenseRequest['requestType'], string> = {
  increase: 'Aufstocken',
  decrease: 'Reduzieren',
  new: 'Neues Produkt',
  cancel: 'Kündigung',
};

export const CustomerLicenses = ({ customerId }: CustomerLicensesProps) => {
  const [data, setData] = useState<CustomerLicenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  // Portal-Anfragen (Self-Service): pending zuerst, Entscheidung inline
  const [requests, setRequests] = useState<AdminLicenseRequest[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const showToast = useToast();

  useEffect(() => {
    loadLicenses();
    loadRequests();
  }, [customerId]);

  const loadLicenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sevdeskApi.getCustomerLicenses(customerId);
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

  const loadRequests = async () => {
    try {
      const response = await sevdeskApi.getCustomerLicenseRequests(customerId);
      if (response.success) setRequests(response.data);
    } catch {
      // Anfragen sind Zusatz — Lizenz-Tab bleibt ohne sie nutzbar
    }
  };

  const handleDecide = async (id: string, status: 'approved' | 'rejected' | 'completed', note?: string) => {
    try {
      setActingId(id);
      const result = await sevdeskApi.decideLicenseRequest(id, status, note || undefined);
      showToast(result.data.message, 'success');
      setRejectingId(null);
      setDecisionNote('');
      await loadRequests();
    } catch (err: any) {
      showToast(err.message || 'Entscheidung fehlgeschlagen', 'error');
    } finally {
      setActingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  // Anfragen-Sektion — auch sichtbar, wenn der Kunde (noch) keine
  // zugeordneten Positionen hat (Neuprodukt-Anfragen!)
  const requestsSection = requests.length > 0 ? (
    <div className="bg-white dark:bg-dark-200 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-300/50">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Inbox size={18} />
          Lizenz-Anfragen aus dem Portal ({requests.length})
          {pendingRequests.length > 0 && (
            <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
              {pendingRequests.length} offen
            </span>
          )}
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-border">
        {requests.map((request) => (
          <div key={request.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {REQUEST_TYPE_LABELS[request.requestType]} — {request.productDescription}
                  {request.requestedQuantity !== null && (
                    <span className="text-gray-500 dark:text-dark-400 font-normal">
                      {' '}({request.currentQuantity !== null
                        ? `${request.currentQuantity} → ${request.requestedQuantity}`
                        : `${request.requestedQuantity}×`})
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                  {request.requestedByName || request.requestedByEmail || 'Portal-Nutzer'}
                  {' • '}{new Date(request.createdAt).toLocaleDateString('de-DE')}
                  {request.note && <> • „{request.note}"</>}
                </div>
                {request.adminNote && request.status !== 'pending' && (
                  <div className="text-xs text-gray-600 dark:text-dark-500 mt-1">
                    Anmerkung: {request.adminNote}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {request.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handleDecide(request.id, 'approved')}
                      disabled={actingId === request.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={14} /> Genehmigen
                    </button>
                    <button
                      onClick={() => { setRejectingId(rejectingId === request.id ? null : request.id); setDecisionNote(''); }}
                      disabled={actingId === request.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} /> Ablehnen
                    </button>
                  </>
                ) : request.status === 'approved' ? (
                  <>
                    <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle size={12} /> Genehmigt
                    </span>
                    <button
                      onClick={() => handleDecide(request.id, 'completed')}
                      disabled={actingId === request.id}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-dark-300 text-gray-700 dark:text-dark-500 hover:bg-gray-200 dark:hover:bg-dark-400 transition-colors disabled:opacity-50"
                      title="Provisionierung beim Distributor erledigt"
                    >
                      Als erledigt markieren
                    </button>
                  </>
                ) : request.status === 'rejected' ? (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                    <XCircle size={12} /> Abgelehnt
                  </span>
                ) : (
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <CheckCircle size={12} /> Umgesetzt
                  </span>
                )}
              </div>
            </div>

            {/* Ablehnungs-Begründung (geht per Mail an den Anfragenden) */}
            {rejectingId === request.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Begründung (optional, geht an den Kunden)…"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                />
                <button
                  onClick={() => handleDecide(request.id, 'rejected', decisionNote)}
                  disabled={actingId === request.id}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                >
                  Ablehnung senden
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-accent-primary" />
        <span className="ml-2 text-gray-500 dark:text-dark-400">Lade Lizenzdaten...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
        <AlertCircle size={18} />
        {error}
      </div>
    );
  }

  if (!data || data.products.length === 0) {
    return (
      <div className="space-y-6">
        {requestsSection}
        <div className="text-center py-12 text-gray-500 dark:text-dark-400">
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Keine Lizenzen/Produkte</p>
          <p className="text-sm mt-1">
            Diesem Kunden wurden noch keine Positionen aus Eingangsrechnungen zugeordnet.
          </p>
        </div>
      </div>
    );
  }

  const { products, hardware = [], monthlyBreakdown, summary } = data;

  return (
    <div className="space-y-6">
      {requestsSection}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
            <Package size={14} />
            Produkte
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {summary.uniqueProducts}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
            <DollarSign size={14} />
            Gesamtvolumen
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.totalAmount)}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm mb-1">
            <Clock size={14} />
            Offen
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(summary.pendingAmount)}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm mb-1">
            <CheckCircle size={14} />
            Abgerechnet
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(summary.billedAmount)}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      {monthlyBreakdown.length > 0 && (
        <div className="bg-white dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <TrendingUp size={18} />
            Monatliche Entwicklung
          </h3>
          <div className="flex items-end gap-2 h-32">
            {monthlyBreakdown.slice().reverse().map((month) => {
              const maxAmount = Math.max(...monthlyBreakdown.map(m => m.totalAmount));
              const height = maxAmount > 0 ? (month.totalAmount / maxAmount) * 100 : 0;
              return (
                <div key={month.month} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-accent-primary rounded-t transition-all"
                    style={{ height: `${Math.max(height, 5)}%` }}
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
      <div className="bg-white dark:bg-dark-200 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-300/50">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={18} />
            Lizenzen & Abos ({products.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {products.map((product, index) => (
            <ProductRow
              key={`${product.description}-${index}`}
              product={product}
              isExpanded={expandedProduct === product.description}
              onToggle={() => setExpandedProduct(
                expandedProduct === product.description ? null : product.description
              )}
            />
          ))}
        </div>
      </div>

      {/* Hardware-Käufe (Geräte-Register) */}
      {hardware.length > 0 && (
        <div className="bg-white dark:bg-dark-200 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-300/50">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <HardDrive size={18} />
              Hardware-Käufe ({hardware.length})
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
              Einmalige Anschaffungen — nicht in den monatlichen Kosten enthalten
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 dark:text-dark-400 bg-gray-50 dark:bg-dark-300/30">
                <tr>
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Produkt</th>
                  <th className="px-4 py-2 font-medium">Seriennummer</th>
                  <th className="px-4 py-2 font-medium">Lieferant</th>
                  <th className="px-4 py-2 font-medium text-right">Menge</th>
                  <th className="px-4 py-2 font-medium text-right">Preis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {hardware.map((hw) => (
                  <tr key={hw.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600 dark:text-dark-400">
                      {hw.purchasedAt ? new Date(hw.purchasedAt).toLocaleDateString('de-DE') : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {hw.description}
                      {hw.productSku && (
                        <span className="ml-2 text-xs text-gray-400">({hw.productSku})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-dark-400">
                      {hw.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-dark-400">{hw.vendor || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{hw.quantity ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                      {formatCurrency(hw.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* In Pauschale Info */}
      {summary.includedAmount > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <CheckCircle size={18} />
            <span className="font-medium">
              {formatCurrency(summary.includedAmount)} in Vertragspauschale enthalten
            </span>
          </div>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
            Diese Positionen sind im Wartungsvertrag inklusive und werden nicht separat berechnet.
          </p>
        </div>
      )}
    </div>
  );
};

interface ProductRowProps {
  product: CustomerLicenseProduct;
  isExpanded: boolean;
  onToggle: () => void;
}

const ProductRow = ({ product, isExpanded, onToggle }: ProductRowProps) => {
  return (
    <div>
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-300/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {product.description || 'Ohne Beschreibung'}
            </span>
            {product.rebillingStatus === 'included' && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                <CheckCircle size={12} />
                Inkl.
              </span>
            )}
            {product.contractName && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                <FileText size={12} />
                {product.contractName}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 dark:text-dark-400 flex items-center gap-3 mt-0.5">
            {product.productSku && (
              <span className="font-mono text-xs bg-gray-100 dark:bg-dark-300 px-1.5 py-0.5 rounded">
                {product.productSku}
              </span>
            )}
            <span>{product.totalQuantity}× Lizenzen</span>
            <span>•</span>
            <span>{product.lineCount} Positionen</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 ml-4">
          <div className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(product.totalAmount)}
          </div>
          {/* VK-Sicht: Was der Kunde im Portal sieht. Fehlende VK-Preise
              werden im LineItemReview des jeweiligen Belegs gepflegt. */}
          {product.missingResellCount > 0 ? (
            <div
              className="text-xs text-amber-600 dark:text-amber-400"
              title={`${product.missingResellCount} Position(en) ohne VK-Preis — im Portal fehlt der Betrag. VK im Beleg-Review pflegen.`}
            >
              VK fehlt ({product.missingResellCount})
            </div>
          ) : product.resellAmount !== null ? (
            <div className="text-xs text-green-600 dark:text-green-400">
              VK {formatCurrency(product.resellAmount)}
            </div>
          ) : null}
          <div className="text-xs text-gray-500 dark:text-dark-400">
            {formatDate(product.firstSeen)} - {formatDate(product.lastSeen)}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-dark-300/30 border-t border-gray-100 dark:border-dark-border">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-dark-400">Erste Erfassung:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{formatDate(product.firstSeen)}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-dark-400">Letzte Erfassung:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{formatDate(product.lastSeen)}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-dark-400">Gesamtmenge:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{product.totalQuantity}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-dark-400">Durchschnittspreis:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {formatCurrency(product.totalQuantity > 0 ? product.totalAmount / product.totalQuantity : 0)}
              </span>
            </div>
          </div>
          {product.vendors.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-dark-400">Lieferanten:</span>
              <div className="flex flex-wrap gap-1">
                {product.vendors.map((vendor, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-gray-200 dark:bg-dark-300 text-gray-700 dark:text-dark-400 px-2 py-0.5 rounded"
                  >
                    {vendor}
                  </span>
                ))}
              </div>
            </div>
          )}
          {product.contractId && (
            <div className="mt-3 flex items-center gap-2">
              <FileText size={14} className="text-blue-500" />
              <span className="text-sm text-gray-500 dark:text-dark-400">Vertrag:</span>
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {product.contractNumber ? `${product.contractNumber} - ` : ''}{product.contractName}
              </span>
              {product.rebillingStatus === 'included' && (
                <span className="text-xs text-green-600 dark:text-green-400">(in Pauschale enthalten)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerLicenses;
