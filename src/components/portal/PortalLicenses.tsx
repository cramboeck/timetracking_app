import { useState, useEffect } from 'react';
import { Package, TrendingUp, Loader2, AlertCircle, CheckCircle, DollarSign, Send, Clock, XCircle, PlusCircle } from 'lucide-react';
import {
  customerPortalApi,
  PortalLicenseData,
  PortalLicenseProduct,
  PortalLicenseRequest,
  LicenseRequestType,
} from '../../services/api';

const formatCurrency = (amount: number | null): string => {
  if (amount === null) return '—';
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

const REQUEST_TYPE_LABELS: Record<LicenseRequestType, string> = {
  increase: 'Lizenzen aufstocken',
  decrease: 'Lizenzen reduzieren',
  new: 'Neues Produkt anfragen',
  cancel: 'Kündigen',
};

const REQUEST_STATUS_BADGES: Record<PortalLicenseRequest['status'], { label: string; className: string }> = {
  pending: { label: 'In Prüfung', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Genehmigt', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  completed: { label: 'Umgesetzt', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

interface RequestFormState {
  requestType: LicenseRequestType;
  productDescription: string;
  productSku: string;
  currentQuantity: string;
  requestedQuantity: string;
  note: string;
}

const EMPTY_FORM: RequestFormState = {
  requestType: 'increase',
  productDescription: '',
  productSku: '',
  currentQuantity: '',
  requestedQuantity: '',
  note: '',
};

export const PortalLicenses = () => {
  const [data, setData] = useState<PortalLicenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PortalLicenseRequest[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RequestFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  useEffect(() => {
    loadLicenses();
    loadRequests();
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

  const loadRequests = async () => {
    try {
      const response = await customerPortalApi.getLicenseRequests();
      if (response.success) setRequests(response.data);
    } catch {
      // Anfragen-Liste ist Zusatz — Lizenzansicht bleibt auch ohne nutzbar
    }
  };

  const openRequestForm = (product?: PortalLicenseProduct) => {
    setForm({
      ...EMPTY_FORM,
      requestType: product ? 'increase' : 'new',
      productDescription: product?.description ?? '',
      productSku: product?.productSku ?? '',
    });
    setFormError(null);
    setFormSuccess(false);
    setFormOpen(true);
  };

  const handleSubmitRequest = async () => {
    if (!form.productDescription.trim()) {
      setFormError('Bitte ein Produkt angeben.');
      return;
    }
    const requestedQuantity = form.requestedQuantity.trim() === '' ? null : parseInt(form.requestedQuantity, 10);
    const currentQuantity = form.currentQuantity.trim() === '' ? null : parseInt(form.currentQuantity, 10);
    if ((form.requestType === 'increase' || form.requestType === 'new') && !requestedQuantity) {
      setFormError('Bitte die gewünschte Anzahl angeben.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await customerPortalApi.createLicenseRequest({
        requestType: form.requestType,
        productDescription: form.productDescription.trim(),
        productSku: form.productSku.trim() || null,
        currentQuantity,
        requestedQuantity,
        note: form.note.trim() || undefined,
      });
      if (response.success) {
        setFormOpen(false);
        setFormSuccess(true);
        setForm(EMPTY_FORM);
        await loadRequests();
      }
    } catch (err: any) {
      setFormError(err.message || 'Anfrage konnte nicht gesendet werden');
    } finally {
      setSubmitting(false);
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

  const products = data?.products ?? [];
  const monthlyBreakdown = data?.monthlyBreakdown ?? [];
  const summary = data?.summary ?? { uniqueProducts: 0, billedAmount: null, includedAmount: null, totalAmount: null };
  const hasProducts = products.length > 0;
  // Hardware-Käufe (Einmalkosten, Seriennummern) getrennt von wiederkehrenden
  // Lizenzen/Abos listen — vorher stand ein gekaufter Switch zwischen den Abos
  const hardwareProducts = products.filter(p => p.itemType === 'hardware');
  const licenseProducts = products.filter(p => p.itemType !== 'hardware');

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Package size={24} className="text-[var(--portal-primary)]" />
          Ihre Lizenzen & Abonnements
        </h2>
        <button
          onClick={() => openRequestForm()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--portal-primary)' }}
        >
          <PlusCircle size={16} />
          Anfrage stellen
        </button>
      </div>

      {formSuccess && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 flex items-center gap-2 text-sm">
          <CheckCircle size={16} />
          Ihre Anfrage wurde übermittelt — wir melden uns, sobald sie geprüft ist.
        </div>
      )}

      {/* Anfrage-Formular (Self-Service) */}
      {formOpen && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Send size={16} className="text-[var(--portal-primary)]" />
            Lizenz-Anfrage
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Art der Anfrage</label>
              <select
                value={form.requestType}
                onChange={(e) => setForm(f => ({ ...f, requestType: e.target.value as LicenseRequestType }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
              >
                {(Object.keys(REQUEST_TYPE_LABELS) as LicenseRequestType[]).map(t => (
                  <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Produkt *</label>
              <input
                type="text"
                value={form.productDescription}
                onChange={(e) => setForm(f => ({ ...f, productDescription: e.target.value }))}
                placeholder="z.B. Microsoft 365 Business Premium"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Aktuelle Anzahl</label>
              <input
                type="number"
                min={0}
                value={form.currentQuantity}
                onChange={(e) => setForm(f => ({ ...f, currentQuantity: e.target.value }))}
                placeholder="optional"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                Gewünschte Anzahl {form.requestType === 'increase' || form.requestType === 'new' ? '*' : ''}
              </label>
              <input
                type="number"
                min={0}
                value={form.requestedQuantity}
                onChange={(e) => setForm(f => ({ ...f, requestedQuantity: e.target.value }))}
                placeholder={form.requestType === 'cancel' ? 'bei Kündigung leer lassen' : 'z.B. 15'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Anmerkung</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="z.B. gewünschter Zeitpunkt, betroffene Mitarbeiter …"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white resize-none"
            />
          </div>
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle size={14} /> {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setFormOpen(false)}
              className="px-3.5 py-2 rounded-lg text-sm text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--portal-primary)' }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Anfrage senden
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-dark-400">
            Die Anfrage ist unverbindlich — Ihr IT-Dienstleister prüft sie und meldet sich bei Ihnen.
          </p>
        </div>
      )}

      {!hasProducts && (
        <div className="text-center py-10 text-gray-500 dark:text-dark-400">
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Keine Lizenzen vorhanden</p>
          <p className="text-sm mt-1">
            Es wurden noch keine Lizenzen oder Abonnements für Ihr Unternehmen erfasst.
            Über „Anfrage stellen" können Sie trotzdem neue Produkte anfragen.
          </p>
        </div>
      )}

      {hasProducts && (<>
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

        {(summary.includedAmount ?? 0) > 0 && (
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
              const maxAmount = Math.max(...monthlyBreakdown.map(m => m.totalAmount ?? 0));
              const height = maxAmount > 0 ? ((month.totalAmount ?? 0) / maxAmount) * 100 : 0;
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

      {/* Products List: Lizenzen & Abos */}
      {licenseProducts.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Lizenzen & Abonnements ({licenseProducts.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {licenseProducts.map((product, index) => (
              <ProductRow key={`${product.description}-${index}`} product={product} onRequest={openRequestForm} />
            ))}
          </div>
        </div>
      )}

      {/* Hardware-Käufe (Einmalkosten) */}
      {hardwareProducts.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Hardware-Käufe ({hardwareProducts.length})
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
              Einmalige Anschaffungen — nicht Teil der monatlichen Abrechnung
            </p>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {hardwareProducts.map((product, index) => (
              <ProductRow key={`${product.description}-${index}`} product={product} />
            ))}
          </div>
        </div>
      )}

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
      </>)}

      {/* Ihre Anfragen (Self-Service-Status) */}
      {requests.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Ihre Anfragen ({requests.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {requests.map((request) => {
              const badge = REQUEST_STATUS_BADGES[request.status];
              const StatusIcon = request.status === 'pending' ? Clock
                : request.status === 'rejected' ? XCircle : CheckCircle;
              return (
                <div key={request.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
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
                        Angefragt am {new Date(request.createdAt).toLocaleDateString('de-DE')}
                        {request.note && <> • „{request.note}"</>}
                      </div>
                      {request.adminNote && (
                        <div className="text-xs text-gray-600 dark:text-dark-500 mt-1">
                          Rückmeldung: {request.adminNote}
                        </div>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${badge.className}`}>
                      <StatusIcon size={12} />
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface ProductRowProps {
  product: PortalLicenseProduct;
  onRequest?: (product: PortalLicenseProduct) => void;
}

const ProductRow = ({ product, onRequest }: ProductRowProps) => {
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-200/30 transition-colors group">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
          product.isIncluded ? 'bg-green-500' : 'bg-gray-300 dark:bg-dark-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-white truncate">
            {product.description || 'Ohne Beschreibung'}
          </div>
          <div className="text-sm text-gray-500 dark:text-dark-400 flex items-center gap-2 flex-wrap mt-0.5">
            <span>{product.totalQuantity}× {product.itemType === 'hardware' ? 'Stück' : 'Lizenzen'}</span>
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
        {onRequest && (
          <button
            onClick={() => onRequest(product)}
            className="text-xs text-[var(--portal-primary)] hover:underline mt-0.5"
          >
            Änderung anfragen
          </button>
        )}
      </div>
    </div>
  );
};

export default PortalLicenses;
