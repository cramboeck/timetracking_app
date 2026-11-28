import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, ChevronRight, Truck, Copy, PackagePlus, PackageCheck } from 'lucide-react';
import { purchaseOrdersApi, PURCHASE_ORDER_STATUS_LABELS, trackingUrl, type PurchaseOrderStatus } from '../../services/api';
import { useToast } from '../../contexts/UIContext';
import { ReceiveGoodsDialog } from '../ReceiveGoodsDialog';
import type { PurchaseOrder } from '../../services/api';

/**
 * Bestellungen am Ticket (WE-1). „Bestellung vorbereiten“ legt einen erwarteten
 * Vorgang an und kopiert die Referenz (Ticketnummer + Kunde) — beim Lieferanten
 * ins Feld Referenz/Kommission einfügen, dann ordnet das Bestell-Postfach alle
 * Mails dieser Bestellung automatisch hier zu.
 */
const STATUS_DOT: Record<PurchaseOrderStatus, string> = {
  expected: 'bg-gray-400',
  ordered: 'bg-blue-500',
  shipped: 'bg-amber-500',
  received: 'bg-green-500',
  cancelled: 'bg-red-500',
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const TicketOrders = ({ ticketId }: { ticketId: string }) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ['purchase-orders', 'ticket', ticketId],
    queryFn: async () => (await purchaseOrdersApi.byTicket(ticketId)).data ?? [],
    staleTime: 60_000,
  });
  const openCount = orders.filter(o => o.status !== 'received').length;

  const prepareMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.prepare(ticketId),
    onSuccess: async res => {
      const ref = res.data.reference;
      const copied = await copyText(ref);
      showToast(
        copied
          ? `Referenz „${ref}“ kopiert — beim Bestellen ins Feld Referenz/Kommission einfügen.`
          : `Referenz für die Bestellung: „${ref}“ (ins Feld Referenz/Kommission eintragen)`,
        'success',
        8000
      );
      setExpanded(true);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId, 'activities'] });
    },
    onError: (err: Error) => showToast(err.message || 'Bestellung konnte nicht vorbereitet werden', 'error'),
  });

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg" data-testid="ticket-orders">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart size={16} className="text-gray-500 dark:text-dark-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">Bestellungen</span>
          {orders.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400">
              {openCount > 0 ? `${openCount} offen` : orders.length}
            </span>
          )}
        </div>
        <ChevronRight size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-dark-border px-4 py-3 space-y-3">
          {orders.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-dark-400">
              Noch keine Bestellung zu diesem Ticket. Mit „Bestellung vorbereiten“ bekommst du die Referenz zum Einfügen beim Lieferanten.
            </p>
          )}
          {orders.map(o => (
            <div key={o.id} className="rounded-lg bg-gray-50 dark:bg-dark-100 p-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[o.status]}`} />
                <span className="font-medium text-gray-900 dark:text-white">{PURCHASE_ORDER_STATUS_LABELS[o.status]}</span>
                <span className="text-gray-500 dark:text-dark-400 truncate">
                  {[o.supplierName, o.orderNumber].filter(Boolean).join(' · ') || 'wartet auf Bestellbestätigung'}
                </span>
              </div>
              {o.status === 'expected' && o.reference && (
                <button
                  type="button"
                  onClick={async () => { if (await copyText(o.reference!)) showToast('Referenz kopiert', 'success'); }}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
                >
                  <Copy size={11} /> Referenz „{o.reference}“
                </button>
              )}
              {o.lines.length > 0 && (
                <ul className="mt-1.5 text-xs text-gray-600 dark:text-dark-400 space-y-0.5">
                  {o.lines.slice(0, 4).map(l => (
                    <li key={l.id} className="truncate">
                      {l.quantity !== null ? `${l.quantity}× ` : ''}{l.description}
                      {l.receivedQuantity > 0 && <span className="text-green-600 dark:text-green-400"> · {l.receivedQuantity} da</span>}
                    </li>
                  ))}
                  {o.lines.length > 4 && <li>+ {o.lines.length - 4} weitere</li>}
                </ul>
              )}
              {o.lines.length > 0 && o.status !== 'received' && o.status !== 'cancelled' && (
                <button type="button" onClick={() => setReceiveOrder(o)} data-testid="ticket-receive"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-primary hover:underline mr-3">
                  <PackageCheck size={13} /> Wareneingang
                </button>
              )}
              {o.tracking.map(t => (
                trackingUrl(t) ? (
                  <a key={t.number} href={trackingUrl(t)!} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline mr-2">
                    <Truck size={12} /> {t.carrier ?? 'Sendung'} {t.number}
                  </a>
                ) : (
                  <span key={t.number} className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mr-2 select-all">
                    <Truck size={12} /> {t.carrier ?? 'Sendung'} {t.number}
                  </span>
                )
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => prepareMutation.mutate()}
            disabled={prepareMutation.isPending}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-dashed border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-500 hover:border-accent-primary hover:text-accent-primary transition-colors disabled:opacity-50"
          >
            <PackagePlus size={15} />
            {orders.some(o => o.status === 'expected') ? 'Referenz erneut kopieren' : 'Bestellung vorbereiten'}
          </button>
        </div>
      )}
      <ReceiveGoodsDialog order={receiveOrder} onClose={() => setReceiveOrder(null)} />
    </div>
  );
};
