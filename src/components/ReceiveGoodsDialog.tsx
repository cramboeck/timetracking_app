import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ScanLine, CheckCircle2, Printer, PackageCheck, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { useToast } from '../contexts/UIContext';
import {
  purchaseOrdersApi, ASSET_TYPE_LABELS,
  type PurchaseOrder, type GoodsReceiptResult, type AssetType,
} from '../services/api';
import { fieldClasses } from './assets/assetUi';

const CodeScanner = lazy(() => import('./assets/CodeScanner').then(m => ({ default: m.CodeScanner })));
const LabelPrintDialog = lazy(() => import('./assets/LabelPrintDialog').then(m => ({ default: m.LabelPrintDialog })));

/**
 * WE-2 Wareneingang (mobil): gelieferte Menge je Position bestätigen, bei
 * Geräten die Seriennummern scannen (Kamera, Handscanner oder tippen). Aus
 * jeder Seriennummer wird ein Gerät beim Kunden der Bestellung — danach
 * direkt Etiketten drucken.
 */
interface LineState { qty: number; serials: string[]; assetType: string }

const remainingOf = (quantity: number | null, received: number) =>
  quantity === null ? null : Math.max(0, quantity - received);

export const ReceiveGoodsDialog = ({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Record<string, LineState>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [active, setActive] = useState<{ lineId: string; idx: number } | null>(null);
  const [result, setResult] = useState<GoodsReceiptResult | null>(null);
  const [labelsFor, setLabelsFor] = useState<string[] | null>(null);

  const openLines = useMemo(
    () => (order?.lines ?? []).filter(l => {
      const r = remainingOf(l.quantity, l.receivedQuantity);
      return r === null ? l.receivedQuantity <= 0 : r > 0;
    }),
    [order]
  );

  // Startwerte: Restmenge, Seriennummern-Felder passend zur Menge
  useEffect(() => {
    if (!order) return;
    const init: Record<string, LineState> = {};
    for (const l of openLines) {
      const qty = remainingOf(l.quantity, l.receivedQuantity) ?? 1;
      init[l.id] = { qty, serials: l.needsSerials ? Array(qty).fill('') : [], assetType: l.suggestedAssetType || 'other' };
    }
    setState(init);
    setResult(null);
    setScanOpen(false);
    setActive(null);
  }, [order, openLines]);

  const setQty = (lineId: string, qty: number, max: number | null, needsSerials: boolean) => {
    const q = Math.max(0, max === null ? qty : Math.min(qty, max));
    setState(s => {
      const cur = s[lineId];
      if (!cur) return s;
      const serials = needsSerials ? [...cur.serials.slice(0, q), ...Array(Math.max(0, q - cur.serials.length)).fill('')] : [];
      return { ...s, [lineId]: { ...cur, qty: q, serials } };
    });
  };
  const setSerial = (lineId: string, idx: number, value: string) =>
    setState(s => {
      const cur = s[lineId];
      if (!cur) return s;
      const serials = [...cur.serials];
      serials[idx] = value;
      return { ...s, [lineId]: { ...cur, serials } };
    });

  const focusField = (lineId: string, idx: number) =>
    bodyRef.current?.querySelector<HTMLInputElement>(`[data-serial="${lineId}:${idx}"]`)?.focus();

  /** Nächstes leeres Seriennummern-Feld ab einer Stelle (oder ganz vorne). */
  const nextEmpty = (from?: { lineId: string; idx: number }) => {
    const slots = openLines.flatMap(l => (state[l.id]?.serials ?? []).map((v, idx) => ({ lineId: l.id, idx, v })));
    const start = from ? slots.findIndex(s => s.lineId === from.lineId && s.idx === from.idx) + 1 : 0;
    return [...slots.slice(start), ...slots.slice(0, start)].find(s => !s.v.trim()) ?? null;
  };

  const handleScan = (code: string) => {
    const all = openLines.flatMap(l => state[l.id]?.serials ?? []);
    if (all.some(v => v.trim().toLowerCase() === code.trim().toLowerCase())) {
      showToast(`${code} ist schon erfasst`, 'warning');
      return;
    }
    const target = active && !state[active.lineId]?.serials[active.idx]?.trim() ? active : nextEmpty(active ?? undefined);
    if (!target) {
      showToast('Alle Seriennummern-Felder sind gefüllt — Menge erhöhen oder buchen.', 'info');
      return;
    }
    setSerial(target.lineId, target.idx, code.trim());
    const after = nextEmpty(target);
    setActive(after ? { lineId: after.lineId, idx: after.idx } : null);
  };

  const serialCount = openLines.reduce((n, l) => n + (state[l.id]?.serials.filter(s => s.trim()).length ?? 0), 0);
  const qtyCount = openLines.reduce((n, l) => n + (state[l.id]?.qty ?? 0), 0);

  const mutation = useMutation({
    mutationFn: () => purchaseOrdersApi.receive(order!.id, {
      lines: openLines
        .filter(l => (state[l.id]?.qty ?? 0) > 0)
        .map(l => ({
          lineId: l.id,
          quantity: state[l.id].qty,
          serials: state[l.id].serials.map(s => s.trim()).filter(Boolean),
          assetType: state[l.id].assetType,
        })),
    }),
    onSuccess: res => {
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      if (order?.ticketId) queryClient.invalidateQueries({ queryKey: ['ticket', order.ticketId, 'activities'] });
    },
    onError: (err: Error) => showToast(err.message || 'Wareneingang konnte nicht gebucht werden', 'error'),
  });

  if (!order) return null;
  const title = `Wareneingang${order.orderNumber ? ` ${order.orderNumber}` : ''}`;

  // --- Ergebnis -------------------------------------------------------------
  if (result) {
    const createdIds = result.created.map(c => c.id);
    return (
      <>
        <Modal isOpen onClose={onClose} title={title} maxWidth="lg"
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Fertig</Button>
              {createdIds.length > 0 && (
                <Button variant="primary" icon={<Printer size={15} />} onClick={() => setLabelsFor(createdIds)} className="w-full sm:w-auto">
                  {createdIds.length === 1 ? 'Etikett drucken' : `${createdIds.length} Etiketten drucken`}
                </Button>
              )}
            </div>
          }>
          <div className="space-y-4 text-left" data-testid="receive-result">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={22} />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {result.complete ? 'Bestellung vollständig geliefert' : 'Teillieferung gebucht'}
                </p>
                <p className="text-sm text-gray-600 dark:text-dark-400">
                  {result.created.length > 0
                    ? `${result.created.length} Gerät${result.created.length === 1 ? '' : 'e'} angelegt${order.customerName ? ` bei ${order.customerName}` : ' (Lager)'}.`
                    : 'Keine neuen Geräte angelegt.'}
                  {order.ticketNumber ? ` Vermerk im Ticket ${order.ticketNumber}.` : ''}
                </p>
              </div>
            </div>
            {result.created.length > 0 && (
              <ul className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border text-sm">
                {result.created.map(c => (
                  <li key={c.id} className="px-3 py-2 flex items-center gap-3">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary flex-shrink-0">{c.assetTag ?? '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-white">{c.name}</span>
                    <span className="font-mono text-xs text-gray-500 dark:text-dark-400 truncate max-w-[40%]">{c.serialNumber}</span>
                  </li>
                ))}
              </ul>
            )}
            {result.existing.length > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                Schon als Gerät vorhanden (nicht doppelt angelegt): {result.existing.map(e => `${e.serialNumber}${e.assetTag ? ` (${e.assetTag})` : ''}`).join(', ')}
              </p>
            )}
          </div>
        </Modal>
        {labelsFor && (
          <Suspense fallback={null}>
            <LabelPrintDialog assetIds={labelsFor} isOpen onClose={() => setLabelsFor(null)} />
          </Suspense>
        )}
      </>
    );
  }

  // --- Erfassung ------------------------------------------------------------
  const anySerials = openLines.some(l => l.needsSerials);
  return (
    <Modal isOpen onClose={onClose} title={title} maxWidth="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <span className="text-xs text-gray-500 dark:text-dark-400 sm:mr-auto text-center sm:text-left">
            {qtyCount} Stück{anySerials ? ` · ${serialCount} Seriennr.` : ''}
          </span>
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Abbrechen</Button>
          <Button variant="primary" icon={<PackageCheck size={15} />} onClick={() => mutation.mutate()}
            disabled={mutation.isPending || qtyCount === 0} className="w-full sm:w-auto" data-testid="receive-submit">
            {mutation.isPending ? 'Buche…' : 'Wareneingang buchen'}
          </Button>
        </div>
      }>
      <div ref={bodyRef} className="space-y-4 text-left">
        <p className="text-sm text-gray-600 dark:text-dark-400">
          {[order.supplierName, order.customerName ? `für ${order.customerName}` : order.isInternal ? 'Eigenbedarf' : null, order.ticketNumber]
            .filter(Boolean).join(' · ')}
        </p>

        {openLines.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-dark-400">Alle Positionen sind bereits vollständig geliefert.</p>
        ) : (
          <>
            {anySerials && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-700 dark:text-dark-500">
                    Seriennummern scannen — jede wird ein Gerät{order.customerName ? ` bei ${order.customerName}` : ' im Lager'}.
                  </p>
                  <Button size="sm" variant={scanOpen ? 'secondary' : 'primary'} icon={<ScanLine size={14} />} onClick={() => setScanOpen(v => !v)}>
                    {scanOpen ? 'Scanner aus' : 'Scannen'}
                  </Button>
                </div>
                {scanOpen && (
                  <Suspense fallback={<p className="text-sm text-gray-500">Scanner wird geladen…</p>}>
                    <CodeScanner onCode={handleScan} />
                  </Suspense>
                )}
              </div>
            )}

            <ul className="space-y-3">
              {openLines.map(l => {
                const st = state[l.id];
                if (!st) return null;
                const max = remainingOf(l.quantity, l.receivedQuantity);
                return (
                  <li key={l.id} className="rounded-xl bg-gray-50 dark:bg-dark-50 p-3" data-testid="receive-line">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{l.description}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {l.quantity !== null ? `bestellt ${l.quantity}` : 'Menge unbekannt'}
                          {l.receivedQuantity > 0 ? ` · schon da ${l.receivedQuantity}` : ''}
                          {l.articleNumber ? ` · ${l.articleNumber}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" aria-label="Gelieferte Menge">
                        <button type="button" onClick={() => setQty(l.id, st.qty - 1, max, l.needsSerials)}
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-dark-500 disabled:opacity-40"
                          disabled={st.qty <= 0} aria-label="weniger"><Minus size={15} /></button>
                        <span className="w-8 text-center tabular-nums font-medium text-gray-900 dark:text-white" data-testid="receive-qty">{st.qty}</span>
                        <button type="button" onClick={() => setQty(l.id, st.qty + 1, max, l.needsSerials)}
                          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-dark-500 disabled:opacity-40"
                          disabled={max !== null && st.qty >= max} aria-label="mehr"><Plus size={15} /></button>
                      </div>
                    </div>

                    {l.needsSerials && st.qty > 0 && (
                      <div className="mt-3 space-y-2">
                        <select value={st.assetType} aria-label="Geräte-Typ"
                          onChange={e => setState(s => ({ ...s, [l.id]: { ...s[l.id], assetType: e.target.value } }))}
                          className={`${fieldClasses} sm:max-w-[220px]`}>
                          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map(t => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
                        </select>
                        {st.serials.map((v, idx) => {
                          const isActive = active?.lineId === l.id && active.idx === idx;
                          return (
                            <input key={idx} data-serial={`${l.id}:${idx}`} value={v}
                              onChange={e => setSerial(l.id, idx, e.target.value)}
                              onFocus={() => setActive({ lineId: l.id, idx })}
                              onKeyDown={e => {
                                // Handscanner schicken Enter → nächstes Feld statt Formular
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const n = nextEmpty({ lineId: l.id, idx });
                                  if (n) focusField(n.lineId, n.idx);
                                }
                              }}
                              placeholder={`Seriennummer ${idx + 1}`}
                              autoComplete="off" autoCapitalize="characters" spellCheck={false}
                              className={`${fieldClasses} font-mono ${isActive && scanOpen ? 'ring-4 ring-accent-primary/15 border-accent-primary' : ''}`} />
                          );
                        })}
                        <p className="text-xs text-gray-500 dark:text-dark-400">Leer lassen = Stück wird gebucht, aber kein Gerät angelegt.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ReceiveGoodsDialog;
