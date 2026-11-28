import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { PackageSearch, FileWarning, FileClock, Receipt, AlertTriangle, Check } from 'lucide-react';
import { purchaseOrdersApi, type BillingCheckItem } from '../services/api';
import CustomerAvatar from './ui/CustomerAvatar';
import { Button } from './ui/Button';
import { useToast, useUndoToast } from '../contexts/UIContext';
import { ticketPath } from './AreaNavigation';

/**
 * WE-3 Abrechnungs-Sicherung: gelieferte Kunden-Bestellungen, die noch nicht
 * weiterberechnet sind — damit keine Hardware „verschenkt“ wird. Nur sichtbar,
 * wenn es etwas zu tun gibt.
 */
const eur = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : null);

const STATE: Record<BillingCheckItem['state'], { label: (i: BillingCheckItem) => string; cls: string; icon: JSX.Element; hint: string }> = {
  no_invoice: {
    label: () => 'Lieferantenrechnung fehlt',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: <FileWarning size={12} />,
    hint: 'Sobald die Rechnung im Rechnungseingang ist (Bestell-Nr. im Text), wird sie automatisch zugeordnet.',
  },
  not_extracted: {
    label: () => 'Rechnung noch nicht ausgelesen',
    cls: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400',
    icon: <FileClock size={12} />,
    hint: 'Im Rechnungseingang öffnen und auslesen — dann erscheinen die Positionen beim Kunden.',
  },
  pending: {
    label: i => `${i.pendingCount} Position${i.pendingCount === 1 ? '' : 'en'} offen · ${eur(i.pendingAmount)}`,
    cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: <Receipt size={12} />,
    hint: 'Erscheinen bei der nächsten Rechnung für den Kunden als Weiterberechnung.',
  },
};

export const OrderBillingCheckCard = ({ onOpenCustomer }: { onOpenCustomer?: (customerId: string) => void }) => {
  const navigate = useNavigate();
  const showToast = useToast();
  const showUndoToast = useUndoToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['purchase-orders', 'billing-check'],
    queryFn: async () => (await purchaseOrdersApi.billingCheck()).data ?? [],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const items = query.data ?? [];

  const clear = useMutation({
    mutationFn: ({ id, cleared }: { id: string; cleared: boolean }) => purchaseOrdersApi.clearBilling(id, cleared),
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      if (v.cleared) {
        showUndoToast('Als erledigt markiert (ohne Weiterberechnung)', () => clear.mutate({ id: v.id, cleared: false }));
      }
    },
    onError: (err: Error) => showToast(err.message || 'Konnte nicht gespeichert werden', 'error'),
  });

  if (items.length === 0) return null;
  const openSum = items.reduce((s, i) => s + (i.state === 'pending' ? i.pendingAmount : 0), 0);

  return (
    <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden" data-testid="order-billing-check">
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <PackageSearch size={18} className="text-orange-500" />
          Gelieferte Bestellungen – noch nicht weiterberechnet ({items.length})
        </h3>
        <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
          Kunden-Bestellungen der letzten 180 Tage{openSum > 0 ? ` · offen ${eur(openSum)} netto (EK)` : ''}
        </p>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-dark-border">
        {items.map(i => {
          const st = STATE[i.state];
          return (
            <li key={i.orderId} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="billing-check-item">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <CustomerAvatar name={i.customerName ?? '?'} color={i.customerColor} logoUrl={i.customerLogoUrl} size="sm" />
                <div className="min-w-0">
                  {onOpenCustomer ? (
                    <button type="button" onClick={() => onOpenCustomer(i.customerId)}
                      className="font-medium text-gray-900 dark:text-white hover:text-accent-primary truncate block text-left">
                      {i.customerName}
                    </button>
                  ) : (
                    <p className="font-medium text-gray-900 dark:text-white truncate">{i.customerName}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-dark-400 break-words">
                    {[i.orderNumber ? `Bestellung ${i.orderNumber}` : 'Bestellung', i.supplierName, date(i.receivedAt) ? `geliefert ${date(i.receivedAt)}` : null]
                      .filter(Boolean).join(' · ')}
                    {i.ticketNumber && i.ticketId && (
                      <> · <button type="button" className="text-accent-primary hover:underline" onClick={() => navigate(ticketPath(i.ticketId!))}>{i.ticketNumber}</button></>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.icon} {st.label(i)}</span>
                    {i.amountMismatch && i.orderNet !== null && i.invoiceNet !== null && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        title="Netto laut Bestellbestätigung vs. Lieferantenrechnung">
                        <AlertTriangle size={12} /> Bestellt {eur(i.orderNet)} · berechnet {eur(i.invoiceNet)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-dark-400 mt-1">{st.hint}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:justify-end">
                {i.state !== 'pending' && (
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finanzen/invoices')}>Rechnungseingang</Button>
                )}
                <Button size="sm" variant="ghost" icon={<Check size={13} />} disabled={clear.isPending}
                  onClick={() => clear.mutate({ id: i.orderId, cleared: true })}
                  title="z.B. im Pauschalpreis enthalten oder Kunde zahlt direkt beim Lieferanten">
                  Ohne Rechnung erledigt
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default OrderBillingCheckCard;
