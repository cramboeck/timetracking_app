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
/** Freier Artikel (nicht als Position erkannt): Bezeichnung + Menge + Seriennummern */
interface ExtraState { description: string; qty: number; serials: string[]; assetType: string; withSerials: boolean }
const newExtra = (): ExtraState => ({ description: '', qty: 1, serials: [''], assetType: 'other', withSerials: true });
const extraKey = (i: number) => `x:${i}`;

const remainingOf = (quantity: number | null, received: number) =>
  quantity === null ? null : Math.max(0, quantity - received);

export const ReceiveGoodsDialog = ({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Record<string, LineState>>({});
  const [extras, setExtras] = useState<ExtraState[]>([]);
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
    // Ohne offene Positionen (z.B. keine aus der Mail erkannt) direkt einen freien Artikel anbieten
    setExtras(openLines.length === 0 ? [newExtra()] : []);
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
  const setSerial = (lineId: string, idx: number, value: string) => {
    if (lineId.startsWith('x:')) {
      const i = Number(lineId.slice(2));
      setExtras(xs => xs.map((x, j) => (j === i ? { ...x, serials: x.serials.map((v, k) => (k === idx ? value : v)) } : x)));
      return;
    }
    setState(s => {
      const cur = s[lineId];
      if (!cur) return s;
      const serials = [...cur.serials];
      serials[idx] = value;
      return { ...s, [lineId]: { ...cur, serials } };
    });
  };
  const setExtra = (i: number, patch: Partial<ExtraState>) =>
    setExtras(xs => xs.map((x, j) => {
      if (j !== i) return x;
      const next = { ...x, ...patch };
      const n = next.withSerials ? Math.max(0, next.qty) : 0;
      next.serials = [...next.serials.slice(0, n), ...Array(Math.max(0, n - next.serials.length)).fill('')];
      return next;
    }));

  const focusField = (lineId: string, idx: number) =>
    bodyRef.current?.querySelector<HTMLInputElement>(`[data-serial="${lineId}:${idx}"]`)?.focus();

  /** Nächstes leeres Seriennummern-Feld ab einer Stelle (oder ganz vorne). */
  const nextEmpty = (from?: { lineId: string; idx: number }) => {
    const slots = [
      ...openLines.flatMap(l => (state[l.id]?.serials ?? []).map((v, idx) => ({ lineId: l.id, idx, v }))),
      ...extras.flatMap((x, i) => x.serials.map((v, idx) => ({ lineId: extraKey(i), idx, v }))),
    ];
    const start = from ? slots.findIndex(s => s.lineId === from.lineId && s.idx === from.idx) + 1 : 0;
    return [...slots.slice(start), ...slots.slice(0, start)].find(s => !s.v.trim()) ?? null;
  };

  const handleScan = (code: string) => {
    const all = [...openLines.flatMap(l => state[l.id]?.serials ?? []), ...extras.flatMap(x => x.serials)];
    if (all.some(v => v.trim().toLowerCase() === code.trim().toLowerCase())) {
      showToast(`${code} ist schon erfasst`, 'warning');
      return;
    }
    const valueAt = (t: { lineId: string; idx: number }) => t.lineId.startsWith('x:')
      ? extras[Number(t.lineId.slice(2))]?.serials[t.idx] : state[t.lineId]?.serials[t.idx];
    const target = active && valueAt(active) !== undefined && !valueAt(active)?.trim() ? active : nextEmpty(active ?? undefined);
    if (!target) {
      showToast('Alle Seriennummern-Felder sind gefüllt — Menge erhöhen oder buchen.', 'info');
      return;
    }
    setSerial(target.lineId, target.idx, code.trim());
    const after = nextEmpty(target);
    setActive(after ? { lineId: after.lineId, idx: after.idx } : null);
  };

  const validExtras = extras.filter(x => x.description.trim() && x.qty > 0);
  const serialCount = openLines.reduce((n, l) => n + (state[l.id]?.serials.filter(s => s.trim()).length ?? 0), 0)
    + validExtras.reduce((n, x) => n + x.serials.filter(v => v.trim()).length, 0);
  const qtyCount = openLines.reduce((n, l) => n + (state[l.id]?.qty ?? 0), 0) + validExtras.reduce((n, x) => n + x.qty, 0);

  const mutation = useMutation({
    mutationFn: (opts?: { completeOnly?: boolean }) => purchaseOrdersApi.receive(order!.id, opts?.completeOnly ? { lines: [], complete: true } : {
      extraLines: validExtras.map(x => ({
        description: x.description.trim(), quantity: x.qty,
        serials: x.serials.map(v => v.trim()).filter(Boolean),
        // 'other' = Server rät den Typ aus der Bezeichnung
        assetType: x.assetType === 'other' ? undefined : x.assetType,
      })),
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
  const anySerials = openLines.some(l => l.needsSerials) || extras.some(x => x.withSerials);
  return (
    <Modal isOpen onClose={onClose} title={title} maxWidth="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <span className="text-xs text-gray-500 dark:text-dark-400 sm:mr-auto text-center sm:text-left">
            {qtyCount} Stück{anySerials ? ` · ${serialCount} Seriennr.` : ''}
          </span>
          {order.status !== 'received' && (
            <Button variant="ghost" onClick={() => mutation.mutate({ completeOnly: true })} disabled={mutation.isPending}
              className="w-full sm:w-auto text-gray-500" data-testid="receive-complete-only">
              Ohne Geräte als geliefert markieren
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Abbrechen</Button>
          <Button variant="primary" icon={<PackageCheck size={15} />} onClick={() => mutation.mutate(undefined)}
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

        {openLines.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-dark-400">
            {(order.lines?.length ?? 0) > 0
              ? 'Alle erkannten Positionen sind geliefert. Weitere Artikel kannst du unten erfassen.'
              : 'Aus den Mails wurden keine Positionen erkannt — erfasse die gelieferten Artikel hier.'}
          </p>
        )}
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

            {extras.length > 0 && (
              <ul className="space-y-3">
                {extras.map((x, i) => (
                  <li key={i} className="rounded-xl bg-gray-50 dark:bg-dark-50 p-3 space-y-2" data-testid="receive-extra">
                    <div className="flex items-start gap-3">
                      <input value={x.description} onChange={e => setExtra(i, { description: e.target.value })}
                        placeholder="Artikel, z.B. Lenovo ThinkPad T14" aria-label="Artikel"
                        className={`${fieldClasses} flex-1 min-w-0`} />
                      <div className="flex items-center gap-1 flex-shrink-0" aria-label="Menge">
                        <button type="button" onClick={() => setExtra(i, { qty: Math.max(1, x.qty - 1) })}
                          className="w-9 h-10 rounded-lg border border-gray-200 dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-dark-500"
                          aria-label="weniger"><Minus size={15} /></button>
                        <span className="w-7 text-center tabular-nums font-medium text-gray-900 dark:text-white">{x.qty}</span>
                        <button type="button" onClick={() => setExtra(i, { qty: Math.min(500, x.qty + 1) })}
                          className="w-9 h-10 rounded-lg border border-gray-200 dark:border-dark-border flex items-center justify-center text-gray-600 dark:text-dark-500"
                          aria-label="mehr"><Plus size={15} /></button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-500 cursor-pointer">
                        <input type="checkbox" checked={x.withSerials} onChange={e => setExtra(i, { withSerials: e.target.checked })}
                          className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
                        Gerät mit Seriennummer
                      </label>
                      {x.withSerials && (
                        <select value={x.assetType} aria-label="Geräte-Typ" onChange={e => setExtra(i, { assetType: e.target.value })}
                          className={`${fieldClasses} sm:max-w-[220px]`}>
                          <option value="other">Typ automatisch</option>
                          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).filter(t => t !== 'other').map(t => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
                        </select>
                      )}
                    </div>
                    {x.withSerials && x.serials.map((v, idx) => {
                      const key = extraKey(i);
                      const isActive = active?.lineId === key && active.idx === idx;
                      return (
                        <input key={idx} data-serial={`${key}:${idx}`} value={v}
                          onChange={e => setSerial(key, idx, e.target.value)}
                          onFocus={() => setActive({ lineId: key, idx })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const n = nextEmpty({ lineId: key, idx });
                              if (n) focusField(n.lineId, n.idx);
                            }
                          }}
                          placeholder={`Seriennummer ${idx + 1}`} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                          className={`${fieldClasses} font-mono ${isActive && scanOpen ? 'ring-4 ring-accent-primary/15 border-accent-primary' : ''}`} />
                      );
                    })}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setExtras(xs => [...xs, newExtra()])} data-testid="receive-add-extra"
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-dashed border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-500 hover:border-accent-primary hover:text-accent-primary">
              <Plus size={15} /> Weiteren Artikel erfassen
            </button>
          </>
      </div>
    </Modal>
  );
};

export default ReceiveGoodsDialog;
