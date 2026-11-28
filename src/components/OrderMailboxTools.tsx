import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, MailX, Loader2, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { purchaseOrdersApi, type IgnoredOrderMail } from '../services/api';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { useConfirm, useToast } from '../contexts/UIContext';

/**
 * Werkzeuge rund um das Bestell-Postfach (Erkennung v2):
 *  - Fortschritt beim Neueinlesen (Hintergrundjob, pollt solange er läuft)
 *  - „Zurücksetzen & neu einlesen“ (danger-Confirm)
 *  - Liste der NICHT als Bestellung erkannten Mails mit „doch übernehmen“
 */
const REASON_LABEL: Record<string, string> = {
  marketing: 'Werbung/Newsletter',
  not_order: 'kein Bestellbezug',
  no_order_number: 'ohne Bestellnummer',
  cancellation: 'Storno/Erstattung',
};
const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '');

const useReprocessStatus = () => useQuery({
  queryKey: ['purchase-orders', 'reprocess'],
  queryFn: async () => (await purchaseOrdersApi.reprocessStatus()).data,
  refetchInterval: q => (q.state.data?.running ? 2000 : false),
  staleTime: 0,
});

/** Banner oben: läuft gerade / fertig */
export const ReprocessBanner = () => {
  const queryClient = useQueryClient();
  const { data } = useReprocessStatus();
  const wasRunning = useRef(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Nach dem Ende die Listen neu laden
  useEffect(() => {
    if (data?.running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    }
  }, [data?.running, queryClient]);

  if (!data || (!data.running && !data.finishedAt)) return null;
  if (!data.running && dismissed !== null && dismissed === data.finishedAt) return null;
  if (data.running) {
    const pct = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
    return (
      <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/5 px-4 py-3 text-sm" data-testid="reprocess-banner">
        <div className="flex items-center gap-2 text-gray-800 dark:text-dark-500">
          <Loader2 size={15} className="animate-spin text-accent-primary flex-shrink-0" />
          Bestell-Postfach wird neu eingelesen … {data.total > 0 ? `${data.processed} von ${data.total} Mails` : 'Mails werden abgerufen'}
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-dark-200 overflow-hidden">
          <div className="h-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${data.error
      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
      : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'}`} data-testid="reprocess-banner">
      {data.error ? <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />}
      <span className="flex-1">
        {data.error
          ? `Neueinlesen abgebrochen: ${data.error}`
          : `Neu eingelesen: ${data.processed} Mails → ${data.result?.orders ?? 0} Vorgänge, ${data.result?.ignored ?? 0} nicht als Bestellung erkannt.`}
      </span>
      <button type="button" className="text-xs underline flex-shrink-0" onClick={() => setDismissed(data.finishedAt)}>Ausblenden</button>
    </div>
  );
};

/** Fußzeile: nicht erkannte Mails + Zurücksetzen */
export const OrderMailboxFooter = () => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: status } = useReprocessStatus();
  const ignoredQuery = useQuery({
    queryKey: ['purchase-orders', 'ignored'],
    queryFn: async () => (await purchaseOrdersApi.ignored()).data ?? [],
    staleTime: 60_000,
  });
  const ignored = ignoredQuery.data ?? [];

  const resetMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.reset(30),
    onSuccess: res => {
      showToast(`${res.data.deleted} Vorgänge zurückgesetzt – das Postfach wird jetzt neu eingelesen`, 'success');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err: Error) => showToast(err.message || 'Zurücksetzen fehlgeschlagen', 'error'),
  });
  const promoteMutation = useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.promote(id),
    onSuccess: () => {
      showToast('Als Bestellung übernommen', 'success');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err: Error) => showToast(err.message || 'Übernehmen fehlgeschlagen', 'error'),
  });

  const askReset = async () => {
    const ok = await confirm({
      title: 'Bestellungen zurücksetzen?',
      message: 'Alle aus dem Bestell-Postfach entstandenen Vorgänge werden gelöscht und die Mails der letzten 30 Tage mit der aktuellen Erkennung neu eingelesen. '
        + 'Am Ticket vorbereitete Vorgänge gehen zurück auf „Vorbereitet“, per Beleg-Upload angelegte bleiben. '
        + 'Geräte aus dem Wareneingang und Lieferantenrechnungen bleiben erhalten, Zuordnungen und Wareneingänge an den gelöschten Vorgängen gehen verloren.',
      variant: 'danger',
      confirmText: 'Zurücksetzen & neu einlesen',
    });
    if (ok) resetMutation.mutate();
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 text-sm">
        <button type="button" onClick={() => setOpen(true)} disabled={ignored.length === 0} data-testid="ignored-open"
          className="inline-flex items-center gap-1.5 text-gray-500 dark:text-dark-400 hover:text-accent-primary disabled:opacity-60 disabled:hover:text-gray-500 text-left">
          <MailX size={14} />
          {ignored.length === 0 ? 'Keine aussortierten Mails' : `${ignored.length} Mail${ignored.length === 1 ? '' : 's'} nicht als Bestellung erkannt – ansehen`}
        </button>
        <button type="button" onClick={askReset} disabled={resetMutation.isPending || status?.running} data-testid="reset-orders"
          className="inline-flex items-center gap-1.5 text-gray-500 dark:text-dark-400 hover:text-red-600 disabled:opacity-60 text-left">
          <RotateCcw size={14} /> Zurücksetzen & neu einlesen…
        </button>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nicht als Bestellung erkannt" maxWidth="2xl">
        <div className="space-y-3 text-left">
          <p className="text-sm text-gray-600 dark:text-dark-400">
            Diese Mails aus dem Bestell-Postfach wurden aussortiert. War doch eine Bestellung dabei, übernimm sie hier.
          </p>
          <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border">
            {ignored.map((m: IgnoredOrderMail) => (
              <li key={m.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2" data-testid="ignored-mail">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{m.subject || '(ohne Betreff)'}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-400 break-words">
                    {[m.senderName || m.senderEmail, fmt(m.receivedAt), m.reason ? REASON_LABEL[m.reason] ?? m.reason : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {m.canPromote && (
                  <Button size="sm" variant="secondary" icon={<ArrowUpRight size={13} />} disabled={promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate(m.id)} className="self-start sm:self-auto">
                    Als Bestellung übernehmen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
};
