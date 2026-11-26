import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ClipboardCheck, AlertTriangle, ChevronLeft, ScanLine } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../SearchableSelect';
import { useConfirm, useToast } from '../../contexts/UIContext';
import { assetToolsApi, customersApi, type InventoryItem } from '../../services/api';
import { CodeScanner } from './CodeScanner';
import { AssetTypeIcon, fieldClasses, labelClasses } from './assetUi';

/**
 * Inventur (AS-6): Kunde (oder eigene Geräte) wählen, Etiketten scannen oder
 * abhaken, am Ende sehen, was fehlt und was nicht dorthin gehört.
 */
interface InventoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Im CustomerHub: Kunde fest vorgegeben */
  lockedCustomerId?: string;
}

const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

export const InventoryDialog = ({ isOpen, onClose, lockedCustomerId }: InventoryDialogProps) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(lockedCustomerId ?? '');
  const [title, setTitle] = useState('');
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const { data: inventories = [] } = useQuery({
    queryKey: ['assets', 'inventories'],
    queryFn: async () => (await assetToolsApi.inventories()).data ?? [],
    enabled: isOpen && !activeId,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: async () => (await customersApi.getAll()).data ?? [],
    enabled: isOpen && !lockedCustomerId,
    staleTime: 5 * 60_000,
  });
  const customerOptions = useMemo(() => [
    { value: 'none', label: 'Eigene Geräte (ohne Kunde)' },
    ...customers.map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
  ], [customers]);

  const { data: inv } = useQuery({
    queryKey: ['assets', 'inventory', activeId],
    queryFn: async () => (await assetToolsApi.getInventory(activeId!)).data,
    enabled: !!activeId,
  });

  const create = useMutation({
    mutationFn: async () => (await assetToolsApi.createInventory(
      customerId === 'none' || !customerId ? null : customerId, title.trim() || undefined,
    )).data,
    onSuccess: (d) => {
      queryClient.setQueryData(['assets', 'inventory', d.id], d);
      queryClient.invalidateQueries({ queryKey: ['assets', 'inventories'] });
      setActiveId(d.id);
      setScanning(true);
    },
    onError: () => showToast('Inventur konnte nicht gestartet werden', 'error'),
  });

  const seen = useMutation({
    mutationFn: async (input: { code?: string; assetId?: string }) => (await assetToolsApi.markSeen(activeId!, input)).data,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['assets', 'inventory', activeId] });
      const label = `${r.asset.assetTag ? `${r.asset.assetTag} · ` : ''}${r.asset.name}`;
      if (r.alreadySeen) setFeedback({ tone: 'ok', text: `${label} – bereits erfasst` });
      else if (!r.expected) setFeedback({ tone: 'warn', text: `${label} – gehört nicht zu dieser Inventur${r.asset.customerName ? ` (${r.asset.customerName})` : ''}` });
      else setFeedback({ tone: 'ok', text: `${label} – erfasst` });
    },
    onError: (e: Error) => setFeedback({ tone: 'error', text: e.message.includes('nicht gefunden') || e.message.includes('404') ? 'Kein Gerät zu diesem Code gefunden' : e.message }),
  });

  const complete = useMutation({
    mutationFn: async () => assetToolsApi.completeInventory(activeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast('Inventur abgeschlossen', 'success');
    },
    onError: () => showToast('Inventur konnte nicht abgeschlossen werden', 'error'),
  });

  const expected = inv?.expected ?? [];
  const seenCount = expected.filter(e => e.seenAt).length;
  const missing = expected.filter(e => !e.seenAt);
  const done = !!inv?.completedAt;

  const handleComplete = async () => {
    const ok = await confirm({
      title: 'Inventur abschließen?',
      message: missing.length > 0
        ? `${missing.length} ${missing.length === 1 ? 'Gerät wurde' : 'Geräte wurden'} nicht gefunden. Die Liste bleibt zur Nachverfolgung gespeichert.`
        : 'Alle erwarteten Geräte wurden gefunden.',
      confirmText: 'Abschließen',
    });
    if (ok) complete.mutate();
  };

  const close = () => {
    setActiveId(null);
    setScanning(false);
    setFeedback(null);
    setTitle('');
    onClose();
  };

  const Row = ({ item, showCustomer }: { item: InventoryItem; showCustomer?: boolean }) => (
    <li className="flex items-center gap-3 px-3 py-2">
      <button type="button" disabled={done || !!item.seenAt || seen.isPending}
        onClick={() => seen.mutate({ assetId: item.id })}
        title={item.seenAt ? `Erfasst ${fmt(item.seenAt)}` : 'Als vorhanden abhaken'}
        className={item.seenAt ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-dark-400 hover:text-accent-primary'}>
        {item.seenAt ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <span className="text-gray-500 dark:text-dark-400 flex-shrink-0"><AssetTypeIcon type={item.assetType} size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900 dark:text-white truncate">{item.name}</p>
        <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
          {[item.assetTag, showCustomer ? item.customerName : null, item.location, item.assignedTo].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
    </li>
  );

  const footer = activeId && inv ? (
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" onClick={() => { setActiveId(null); setScanning(false); setFeedback(null); }} icon={<ChevronLeft size={16} />}>
        Übersicht
      </Button>
      <div className="flex gap-2">
        {!done && (
          <Button variant="secondary" onClick={() => setScanning(s => !s)} icon={<ScanLine size={16} />}>
            {scanning ? 'Scanner aus' : 'Scannen'}
          </Button>
        )}
        {!done && <Button variant="primary" onClick={handleComplete} disabled={complete.isPending}>Abschließen</Button>}
        {done && <Button variant="primary" onClick={close}>Fertig</Button>}
      </div>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={close}>Schließen</Button>
      <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending || (!lockedCustomerId && !customerId)}
        icon={<ClipboardCheck size={16} />}>
        Inventur starten
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={close} maxWidth="2xl" footer={footer}
      title={activeId && inv ? (inv.title || `Inventur ${inv.customerName ?? 'Eigene Geräte'}`) : 'Inventur'}>
      {!activeId ? (
        <div className="space-y-5 text-left">
          <div className="space-y-3">
            {!lockedCustomerId && (
              <div>
                <label className={labelClasses}>Welche Geräte prüfen?</label>
                <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Kunde wählen…" />
              </div>
            )}
            <div>
              <label className={labelClasses}>Bezeichnung (optional)</label>
              <input className={fieldClasses} value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Jahresinventur 2026" />
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-400">
              Erwartet werden alle nicht ausgemusterten Geräte des Kunden. Erfasste Geräte bekommen „zuletzt gesehen“ mit Datum und Person.
            </p>
          </div>
          {inventories.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Letzte Inventuren</p>
              <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border">
                {inventories.map(i => (
                  <li key={i.id}>
                    <button type="button" onClick={() => { setActiveId(i.id); setScanning(!i.completedAt); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-200">
                      <ClipboardCheck size={16} className="text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-white truncate">{i.title || i.customerName || 'Eigene Geräte'}</p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">{fmt(i.startedAt)} · {i.seenCount} erfasst</p>
                      </div>
                      <span className={`text-xs whitespace-nowrap ${i.completedAt ? 'text-gray-500 dark:text-dark-400' : 'text-accent-primary font-medium'}`}>
                        {i.completedAt ? 'abgeschlossen' : 'fortsetzen'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : !inv ? (
        <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>
      ) : (
        <div className="space-y-4 text-left">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-700 dark:text-dark-500"><strong className="text-gray-900 dark:text-white">{seenCount}</strong> von {expected.length} gefunden</span>
              {done && <span className="text-xs text-gray-500 dark:text-dark-400">abgeschlossen {fmt(inv.completedAt)}</span>}
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-gray-100 dark:bg-dark-200 overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${expected.length ? (seenCount / expected.length) * 100 : 0}%` }} />
            </div>
          </div>

          {scanning && !done && (
            <CodeScanner onCode={code => seen.mutate({ code })} cooldownMs={2500} />
          )}
          {feedback && (
            <p className={`rounded-xl px-3 py-2 text-sm ${
              feedback.tone === 'ok' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                : feedback.tone === 'warn' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              {feedback.text}
            </p>
          )}

          {inv.unexpected.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 mb-1.5">
                <AlertTriangle size={15} /> Nicht erwartet ({inv.unexpected.length})
              </p>
              <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-amber-200 dark:border-amber-900/50">
                {inv.unexpected.map(i => <Row key={i.id} item={i} showCustomer />)}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1.5">
              {done ? `Nicht gefunden (${missing.length})` : 'Erwartete Geräte'}
            </p>
            {expected.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-dark-400">Für diese Auswahl sind keine Geräte hinterlegt.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border max-h-[40vh] overflow-y-auto">
                {(done ? missing : expected).map(i => <Row key={i.id} item={i} />)}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
