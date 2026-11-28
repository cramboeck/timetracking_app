import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  Inbox, Search, RefreshCw, Truck, PackageCheck, Ticket as TicketIcon, Building2,
  Home, AlertTriangle, ChevronDown, ChevronUp, Link2, Ban, Mail, FileCheck,
} from 'lucide-react';
import {
  customersApi, purchaseOrdersApi, PURCHASE_ORDER_STATUS_LABELS, trackingUrl,
  PurchaseOrder, PurchaseOrderFilter, PurchaseOrderStatus, AssignTarget,
} from '../services/api';
import { Button } from './ui/Button';
import CustomerAvatar from './ui/CustomerAvatar';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';
import { TicketPickerDialog } from './TicketPickerDialog';
import { ticketPath } from './AreaNavigation';
import { useConfirm, useToast } from '../contexts/UIContext';
import { ReceiveGoodsDialog } from './ReceiveGoodsDialog';

/**
 * WE-1 Bestellvorgänge: Alles, was im Bestell-Postfach ankommt (Bestätigung,
 * Versand, Rechnung), wird pro Bestellnummer zu EINEM Vorgang zusammengeführt
 * und über die Ticketnummer in der Bestellreferenz dem Ticket/Kunden zugeordnet.
 */

const fmtEur = (v: number | null, currency = 'EUR') =>
  v === null ? null : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(v);
const fmtDate = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('de-DE');
};

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  expected: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400',
  ordered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  shipped: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const FILTERS: { id: PurchaseOrderFilter; label: string }[] = [
  { id: 'open', label: 'Offen' },
  { id: 'unassigned', label: 'Nicht zugeordnet' },
  { id: 'received', label: 'Geliefert' },
  { id: 'all', label: 'Alle' },
];

const ITEM_TYPE_LABELS: Record<string, string> = {
  hardware: 'Hardware', license: 'Lizenz', subscription: 'Abo', service: 'Dienstleistung', other: 'Sonstiges',
};

export const PurchaseOrdersPanel = () => {
  const showToast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PurchaseOrderFilter>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignOrder, setAssignOrder] = useState<PurchaseOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders', filter, search],
    queryFn: () => purchaseOrdersApi.list(filter, search),
    refetchInterval: 5 * 60 * 1000,
  });
  const orders = ordersQuery.data?.data ?? [];
  const counts = ordersQuery.data?.counts;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });

  const processMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.processMailbox(),
    onSuccess: res => {
      const n = res.data?.processed ?? 0;
      showToast(n > 0 ? `${n} neue Mail${n === 1 ? '' : 's'} aus dem Bestell-Postfach verarbeitet` : 'Keine neuen Bestell-Mails', n > 0 ? 'success' : 'info');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message || 'Bestell-Postfach konnte nicht abgerufen werden', 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) => purchaseOrdersApi.update(id, { status }),
    onSuccess: (_r, v) => {
      showToast(v.status === 'received' ? 'Als geliefert markiert' : `Status: ${PURCHASE_ORDER_STATUS_LABELS[v.status]}`, 'success');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message || 'Status konnte nicht geändert werden', 'error'),
  });

  const handleCancel = async (o: PurchaseOrder) => {
    const ok = await confirm({
      title: 'Vorgang stornieren?',
      message: `${o.orderNumber ? `Bestellung ${o.orderNumber}` : 'Der Vorgang'} wird als storniert markiert und verschwindet aus den Listen. Beim Lieferanten wird dadurch nichts storniert.`,
      variant: 'warning',
      confirmText: 'Stornieren',
    });
    if (ok) statusMutation.mutate({ id: o.id, status: 'cancelled' });
  };

  const renderAssignment = (o: PurchaseOrder) => {
    if (o.ticketId && o.ticketNumber) {
      return (
        <button
          type="button"
          onClick={() => navigate(ticketPath(o.ticketId!))}
          className="inline-flex items-center gap-1.5 text-sm text-accent-primary hover:underline min-w-0"
          title={o.ticketTitle ?? undefined}
        >
          <TicketIcon size={14} className="flex-shrink-0" />
          <span className="font-mono">{o.ticketNumber}</span>
          {o.customerName ? <span className="truncate text-gray-600 dark:text-dark-400">· {o.customerName}</span>
            : o.isInternal ? <span className="text-gray-600 dark:text-dark-400">· Eigenbedarf</span> : null}
        </button>
      );
    }
    if (o.customerId && o.customerName) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-500 min-w-0">
          <CustomerAvatar name={o.customerName} color={o.customerColor} logoUrl={o.customerLogoUrl} size="sm" />
          <span className="truncate">{o.customerName}</span>
          <span className="text-xs text-gray-400">ohne Ticket</span>
        </span>
      );
    }
    if (o.isInternal) {
      return <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-dark-400"><Home size={14} /> Eigenbedarf</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle size={14} /> Nicht zugeordnet
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Kopf: Filter + Suche + Abruf */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1" data-no-swipe>
          {FILTERS.map(f => {
            const count = f.id === 'open' ? counts?.open : f.id === 'unassigned' ? counts?.unassigned : undefined;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? 'bg-accent-primary text-white border-accent-primary'
                    : 'bg-white dark:bg-dark-50 text-gray-700 dark:text-dark-500 border-gray-200 dark:border-dark-border hover:border-accent-primary'
                }`}
              >
                {f.label}
                {count !== undefined && count > 0 && (
                  <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : f.id === 'unassigned' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <form
            className="relative flex-1 sm:w-64"
            onSubmit={e => { e.preventDefault(); setSearch(searchInput.trim()); }}
          >
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); if (!e.target.value) setSearch(''); }}
              placeholder="Nummer, Lieferant, Kunde…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-gray-50 dark:bg-dark-100 border border-gray-200 dark:border-dark-border focus:bg-white dark:focus:bg-dark-50 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 outline-none text-gray-900 dark:text-white"
            />
          </form>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={processMutation.isPending ? 'animate-spin' : ''} />}
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending}
            className="whitespace-nowrap"
          >
            <span className="hidden sm:inline">Postfach abrufen</span>
            <span className="sm:hidden">Abrufen</span>
          </Button>
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-dark-100 animate-pulse" />)}
        </div>
      ) : ordersQuery.isError ? (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Bestellvorgänge konnten nicht geladen werden. <button type="button" className="underline font-medium" onClick={() => ordersQuery.refetch()}>Erneut versuchen</button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-border p-6 text-center">
          <Inbox className="mx-auto text-gray-400" size={28} />
          <p className="mt-2 font-medium text-gray-900 dark:text-white">
            {search ? 'Keine Treffer' : filter === 'unassigned' ? 'Alles zugeordnet' : 'Noch keine Bestellvorgänge'}
          </p>
          {!search && filter !== 'unassigned' && (
            <div className="mt-2 text-sm text-gray-500 dark:text-dark-400 max-w-md mx-auto space-y-1">
              <p>Bestellbestätigungen, Versandmitteilungen und Rechnungen aus dem Bestell-Postfach landen hier automatisch — egal bei welchem Lieferanten.</p>
              <p>Tipp: Ticketnummer (z.B. <span className="font-mono">TKT-000123</span>) beim Bestellen ins Feld Referenz/Kommission schreiben, <span className="font-mono">INTERN</span> für Eigenbedarf.</p>
              <p><a href="/settings?tab=microsoft365" className="text-accent-primary hover:underline">Bestell-Postfach unter Einstellungen → Microsoft 365 festlegen</a></p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {orders.map(o => {
            const isOpen = expanded === o.id;
            const amount = fmtEur(o.grossAmount ?? o.netAmount, o.currency);
            const date = fmtDate(o.orderDate) ?? fmtDate(o.createdAt);
            return (
              <div key={o.id} className="p-3 sm:p-4" data-testid="purchase-order">
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white">{o.supplierName ?? (o.status === 'expected' ? 'Wartet auf Bestellbestätigung' : 'Unbekannter Lieferant')}</span>
                      {o.orderNumber && <span className="font-mono text-xs text-gray-500 dark:text-dark-400">{o.orderNumber}</span>}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status]}`}>{PURCHASE_ORDER_STATUS_LABELS[o.status]}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                      {renderAssignment(o)}
                      {o.reference && !(o.ticketNumber && o.reference.includes(o.ticketNumber)) && (
                        <span className="text-xs text-gray-400 truncate max-w-[16rem]" title="Bestellreferenz">Ref. „{o.reference}“</span>
                      )}
                    </div>
                    {o.tracking.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {o.tracking.map(t => (
                          trackingUrl(t) ? (
                            <a key={t.number} href={trackingUrl(t)!} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:underline">
                              <Truck size={12} /> {t.carrier ?? 'Sendung'} {t.number}
                            </a>
                          ) : (
                            <span key={t.number} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 select-all">
                              <Truck size={12} /> {t.carrier ?? 'Sendung'} {t.number}
                            </span>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-x-3 text-sm flex-shrink-0">
                    {amount && <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{amount}</span>}
                    {date && <span className="text-xs text-gray-500 dark:text-dark-400">{date}</span>}
                    {o.invoiceCount > 0 && (
                      <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1" title="Lieferantenrechnung zugeordnet"><FileCheck size={11} /> Rechnung</span>
                    )}
                    {o.messageCount > 0 && (
                      <span className="text-xs text-gray-400 inline-flex items-center gap-1" title="Mails zu diesem Vorgang"><Mail size={11} /> {o.messageCount}</span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(o.unassigned || o.status !== 'received') && (
                    <Button size="sm" variant={o.unassigned ? 'primary' : 'secondary'} icon={<Link2 size={13} />} onClick={() => setAssignOrder(o)}>
                      {o.unassigned ? 'Zuordnen' : 'Zuordnung ändern'}
                    </Button>
                  )}
                  {o.status !== 'cancelled' && (
                    <Button size="sm" variant={o.status === 'received' ? 'ghost' : 'secondary'} icon={<PackageCheck size={13} />} onClick={() => setReceiveOrder(o)}
                      data-testid="order-receive">
                      {o.status === 'received' ? 'Geräte erfassen' : 'Wareneingang'}
                    </Button>
                  )}
                  {o.lineCount > 0 && (
                    <Button size="sm" variant="ghost" icon={isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      onClick={() => setExpanded(isOpen ? null : o.id)}>
                      {o.lineCount} Position{o.lineCount === 1 ? '' : 'en'}
                    </Button>
                  )}
                  {o.status !== 'received' && o.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" icon={<Ban size={13} />} onClick={() => handleCancel(o)} className="sm:ml-auto text-gray-500">
                      Stornieren
                    </Button>
                  )}
                </div>

                {isOpen && o.lines.length > 0 && (
                  <ul className="mt-2.5 rounded-lg bg-gray-50 dark:bg-dark-100 divide-y divide-gray-100 dark:divide-dark-border text-sm">
                    {o.lines.map(l => (
                      <li key={l.id} className="px-3 py-2 flex items-start gap-3">
                        <span className="tabular-nums text-gray-500 dark:text-dark-400 w-10 flex-shrink-0">{l.quantity !== null ? `${l.quantity}×` : '—'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="text-gray-900 dark:text-white">{l.description}</span>
                          {(l.articleNumber || l.itemType) && (
                            <span className="block text-xs text-gray-400">
                              {[l.articleNumber, l.itemType ? ITEM_TYPE_LABELS[l.itemType] ?? l.itemType : null].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        {l.receivedQuantity > 0 && (
                          <span className={`text-xs whitespace-nowrap tabular-nums ${l.quantity !== null && l.receivedQuantity >= l.quantity ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {l.receivedQuantity}{l.quantity !== null ? `/${l.quantity}` : ''} da
                          </span>
                        )}
                        {l.totalPrice !== null && <span className="tabular-nums text-gray-700 dark:text-dark-500 whitespace-nowrap">{fmtEur(l.totalPrice, o.currency)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AssignOrderDialog order={assignOrder} onClose={() => setAssignOrder(null)} onDone={invalidate} />
      <ReceiveGoodsDialog order={receiveOrder} onClose={() => setReceiveOrder(null)} />
    </div>
  );
};

/** Zuordnung: Ticket (empfohlen) · Kunde ohne Ticket · Eigenbedarf */
const AssignOrderDialog = ({ order, onClose, onDone }: { order: PurchaseOrder | null; onClose: () => void; onDone: () => void }) => {
  const showToast = useToast();
  const [mode, setMode] = useState<'ticket' | 'customer' | 'internal'>('ticket');
  const [customerId, setCustomerId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => (await customersApi.getAll()).data,
    enabled: !!order && mode === 'customer',
    staleTime: 5 * 60 * 1000,
  });
  const customerOptions = useMemo(
    () => (customersQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(c => ({ value: c.id, label: c.name, sublabel: c.customerNumber ? `#${c.customerNumber}` : undefined })),
    [customersQuery.data]
  );

  const assignMutation = useMutation({
    mutationFn: (target: AssignTarget) => purchaseOrdersApi.assign(order!.id, target),
    onSuccess: () => {
      showToast('Bestellung zugeordnet', 'success');
      onDone();
      setPickerOpen(false);
      setCustomerId('');
      setMode('ticket');
      onClose();
    },
    onError: (err: Error) => showToast(err.message || 'Zuordnung fehlgeschlagen', 'error'),
  });

  if (!order) return null;
  const label = [order.supplierName, order.orderNumber].filter(Boolean).join(' · ') || 'Bestellung';

  const options = [
    { id: 'ticket' as const, icon: <TicketIcon size={16} />, title: 'Ticket', text: 'Empfohlen — Kunde kommt aus dem Ticket, der Verlauf zeigt den Lieferstand.' },
    { id: 'customer' as const, icon: <Building2 size={16} />, title: 'Kunde ohne Ticket', text: 'Für Bestellungen, zu denen es (noch) kein Ticket gibt.' },
    { id: 'internal' as const, icon: <Home size={16} />, title: 'Eigenbedarf', text: 'Für das eigene Unternehmen, wird nicht weiterberechnet.' },
  ];

  return (
    <>
      <Modal
        isOpen={!!order && !pickerOpen}
        onClose={onClose}
        title="Bestellung zuordnen"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
            <Button
              disabled={assignMutation.isPending || (mode === 'customer' && !customerId)}
              onClick={() => {
                if (mode === 'ticket') setPickerOpen(true);
                else if (mode === 'customer') assignMutation.mutate({ customerId });
                else assignMutation.mutate({ internal: true });
              }}
            >
              {mode === 'ticket' ? 'Ticket wählen…' : 'Zuordnen'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-left">
          <p className="text-sm text-gray-500 dark:text-dark-400">{label}{order.reference ? ` · Ref. „${order.reference}“` : ''}</p>
          <div className="space-y-2">
            {options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  mode === opt.id
                    ? 'border-accent-primary bg-accent-primary/5'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-300'
                }`}
              >
                <span className={`mt-0.5 ${mode === opt.id ? 'text-accent-primary' : 'text-gray-400'}`}>{opt.icon}</span>
                <span>
                  <span className="block font-medium text-gray-900 dark:text-white">{opt.title}</span>
                  <span className="block text-xs text-gray-500 dark:text-dark-400">{opt.text}</span>
                </span>
              </button>
            ))}
          </div>
          {mode === 'customer' && (
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Kunde wählen…"
              emptyMessage="Kein Kunde gefunden"
            />
          )}
        </div>
      </Modal>
      <TicketPickerDialog
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        contextLabel={label}
        onSelect={t => assignMutation.mutate({ ticketId: t.id })}
        selectingTicketId={assignMutation.isPending ? (assignMutation.variables as { ticketId?: string } | undefined)?.ticketId ?? null : null}
      />
    </>
  );
};

export default PurchaseOrdersPanel;
