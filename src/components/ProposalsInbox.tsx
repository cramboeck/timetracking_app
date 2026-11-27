import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles, Check, X, Pencil, Mail, CalendarDays, MessageSquare, Ticket as TicketIcon, FileText, Link2,
  AlertTriangle, Clock, StickyNote, Bot,
} from 'lucide-react';
import { Button } from './ui/Button';
import CustomerAvatar from './ui/CustomerAvatar';
import { useConfirm, useToast } from '../contexts/UIContext';
import {
  agentApi, NOTE_CATEGORY_LABELS,
  type Proposal, type ProposalSource, type TimeEntryProposalPayload, type NoteCategory,
} from '../services/api';
import type { TimeEntry } from '../types';
import { generateUUID } from '../utils/uuid';

/**
 * KI-Vorschläge (Agenten-Programm Phase B): Was der Agent ermittelt hat,
 * landet hier — erst die Übernahme durch den Menschen schreibt wirklich.
 */
interface Props {
  onEntriesCreated?: (entries: TimeEntry[]) => void;
}

const field = 'w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white text-sm focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15';

const INTERNAL_LABELS: Record<string, string> = {
  admin: 'Verwaltung', sales: 'Vertrieb', marketing: 'Marketing', training: 'Weiterbildung',
  meeting: 'Meeting', internal_support: 'Interner Support', travel: 'Reise',
};

const SOURCE_ICON: Record<ProposalSource['kind'], typeof Mail> = {
  email: Mail, calendar: CalendarDays, chat: MessageSquare, ticket: TicketIcon, document: FileText, other: Link2,
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const fmtDur = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.round((sec % 3600) / 60)).padStart(2, '0')} h`;
const relTime = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `vor ${Math.max(1, m)} min`;
  if (m < 1440) return `vor ${Math.round(m / 60)} h`;
  return `vor ${Math.round(m / 1440)} Tagen`;
};

/** HH:MM eines ISO-Zeitpunkts auf demselben lokalen Tag ersetzen. */
const withTime = (iso: string, hhmm: string) => {
  const d = new Date(iso);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const Sources = ({ p }: { p: Proposal }) => (
  <>
    {p.reason && <p className="text-xs text-gray-600 dark:text-dark-400 mt-1.5"><span className="font-medium">Begründung:</span> {p.reason}</p>}
    {p.sources.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {p.sources.map((s, i) => {
          const Icon = SOURCE_ICON[s.kind] ?? Link2;
          return (
            <span key={i} title={s.ref || s.label}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-100 dark:bg-dark-200 px-1.5 py-0.5 text-xs text-gray-700 dark:text-dark-500">
              <Icon size={12} className="flex-shrink-0" /><span className="truncate">{s.label}</span>{s.date ? <span className="text-gray-400">· {s.date}</span> : null}
            </span>
          );
        })}
      </div>
    )}
  </>
);

const Meta = ({ p }: { p: Proposal }) => (
  <p className="text-[11px] text-gray-400 dark:text-dark-400 mt-2 flex items-center gap-1">
    <Bot size={11} /> {p.tokenName ? `Zugang „${p.tokenName}“` : 'Agent'} · {relTime(p.createdAt)}
  </p>
);

export const ProposalsInbox = ({ onEntriesCreated }: Props) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['agent', 'proposals', tab],
    queryFn: async () => (await agentApi.proposals(tab)).data ?? [],
    refetchInterval: tab === 'pending' ? 60_000 : false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agent', 'proposals'] });
  };

  const times = useMemo(() => proposals.filter((p): p is Extract<Proposal, { type: 'time_entry' }> => p.type === 'time_entry'), [proposals]);
  const comments = useMemo(() => proposals.filter((p): p is Extract<Proposal, { type: 'ticket_comment' }> => p.type === 'ticket_comment'), [proposals]);
  const notes = useMemo(() => proposals.filter((p): p is Extract<Proposal, { type: 'customer_note' }> => p.type === 'customer_note'), [proposals]);
  const totalSec = times.reduce((s, p) => s + (p.payload.duration ?? 0), 0);

  const approveTime = async (p: Extract<Proposal, { type: 'time_entry' }>, payload: TimeEntryProposalPayload) => {
    const r = await agentApi.approveTimeEntry(p.id, payload, generateUUID());
    return r.data;
  };

  const reject = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => agentApi.reject(id, note),
    onSuccess: () => { refresh(); showToast('Vorschlag abgelehnt', 'info'); },
    onError: () => showToast('Ablehnen fehlgeschlagen', 'error'),
  });

  const finishEntries = (created: TimeEntry[]) => {
    if (created.length > 0) {
      onEntriesCreated?.(created);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    }
    refresh();
  };

  const approveOne = async (p: Proposal) => {
    setBusy(true);
    try {
      if (p.type === 'time_entry') {
        const payload = editing === p.id ? {
          ...p.payload,
          startTime: withTime(p.payload.startTime, String(draft.from)),
          endTime: withTime(p.payload.startTime, String(draft.to)),
          description: String(draft.description),
          isBillable: Boolean(draft.isBillable),
        } : p.payload;
        payload.duration = Math.round((new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime()) / 1000);
        if (payload.duration <= 0) { showToast('Ende muss nach dem Beginn liegen', 'warning'); return; }
        const entry = await approveTime(p, payload);
        finishEntries([entry]);
        showToast('Zeiteintrag übernommen', 'success');
      } else if (p.type === 'ticket_comment') {
        const content = editing === p.id ? String(draft.content) : p.payload.content;
        const isInternal = editing === p.id ? Boolean(draft.isInternal) : p.payload.isInternal;
        if (!isInternal) {
          const ok = await confirm({
            title: 'An den Kunden senden?',
            message: 'Der Kommentar wird für den Kunden sichtbar und er bekommt eine E-Mail.',
            confirmText: 'Senden', variant: 'warning',
          });
          if (!ok) return;
        }
        await agentApi.approveComment(p.id, { ...p.payload, content, isInternal });
        queryClient.invalidateQueries({ queryKey: ['ticket', p.payload.ticketId] });
        refresh();
        showToast('Kommentar übernommen', 'success');
      } else {
        await agentApi.approveNote(p.id, editing === p.id
          ? { content: String(draft.content), category: draft.category as NoteCategory }
          : {});
        queryClient.invalidateQueries({ queryKey: ['customer-notes', p.customerId] });
        refresh();
        showToast('Absprache gespeichert', 'success');
      }
      setEditing(null);
      setSelected(prev => { const n = new Set(prev); n.delete(p.id); return n; });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Übernahme fehlgeschlagen', 'error');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const approveSelected = async () => {
    const list = times.filter(t => selected.has(t.id));
    if (list.length === 0) return;
    setBusy(true);
    const created: TimeEntry[] = [];
    let failed = 0;
    for (const p of list) {
      try { created.push(await approveTime(p, p.payload)); } catch { failed++; }
    }
    setSelected(new Set());
    finishEntries(created);
    setBusy(false);
    showToast(failed === 0 ? `${created.length} Zeiteinträge übernommen` : `${created.length} übernommen, ${failed} fehlgeschlagen`, failed ? 'warning' : 'success');
  };

  const askReject = async (p: Proposal) => {
    const ok = await confirm({ title: 'Vorschlag ablehnen?', message: p.title, confirmText: 'Ablehnen', variant: 'danger' });
    if (ok) reject.mutate({ id: p.id });
  };

  const startEdit = (p: Proposal) => {
    setEditing(p.id);
    if (p.type === 'time_entry') {
      setDraft({ from: fmtTime(p.payload.startTime), to: fmtTime(p.payload.endTime), description: p.payload.description, isBillable: p.payload.isBillable });
    } else if (p.type === 'ticket_comment') {
      setDraft({ content: p.payload.content, isInternal: p.payload.isInternal });
    } else {
      setDraft({ content: p.payload.content, category: p.payload.category });
    }
  };

  const Actions = ({ p }: { p: Proposal }) => (
    <div className="flex flex-wrap gap-2 mt-3">
      <Button size="sm" variant="primary" onClick={() => approveOne(p)} disabled={busy} icon={<Check size={14} />}>Übernehmen</Button>
      {editing !== p.id
        ? <Button size="sm" variant="secondary" onClick={() => startEdit(p)} disabled={busy} icon={<Pencil size={14} />}>Bearbeiten</Button>
        : <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Abbrechen</Button>}
      <Button size="sm" variant="ghost" onClick={() => askReject(p)} disabled={busy} icon={<X size={14} />} className="text-red-600 dark:text-red-400">Ablehnen</Button>
    </div>
  );

  const Customer = ({ p, fallback }: { p: Proposal; fallback: string }) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {p.customerName && <CustomerAvatar name={p.customerName} color={p.customerColor} logoUrl={p.customerLogoUrl} size="sm" />}
      <span className="truncate">{p.customerName ? `${p.customerName}${p.projectName ? ` · ${p.projectName}` : ''}` : fallback}</span>
    </span>
  );

  const card = 'rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 p-3 sm:p-4';

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={22} className="text-purple-500" /> KI-Vorschläge
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Was der Agent gefunden hat. Erst wenn du übernimmst, wird gebucht oder geschrieben.
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-dark-200 p-0.5 text-sm">
          {(['pending', 'history'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setTab(t); setSelected(new Set()); setEditing(null); }}
              className={`px-3 py-1 rounded-md ${tab === t ? 'bg-white dark:bg-dark-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-dark-400'}`}>
              {t === 'pending' ? 'Offen' : 'Verlauf'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-border p-8 text-center">
          <p className="font-medium text-gray-900 dark:text-white">{tab === 'pending' ? 'Keine offenen Vorschläge' : 'Noch nichts entschieden'}</p>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Bitte z.B. Claude: „Prüfe meinen Oktober auf Erfassungslücken und schlag mir Einträge vor.“
          </p>
        </div>
      ) : tab === 'history' ? (
        <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
          {proposals.map(p => (
            <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className={`mt-0.5 text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${
                p.status === 'approved' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : p.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'}`}>
                {p.status === 'approved' ? 'übernommen' : p.status === 'rejected' ? 'abgelehnt' : 'abgelaufen'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 dark:text-white truncate">{p.title}</p>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  {p.decidedAt ? `${new Date(p.decidedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${p.decidedByName ? ` · ${p.decidedByName}` : ''}` : `angelegt ${relTime(p.createdAt)}`}
                  {p.decisionNote ? ` · „${p.decisionNote}“` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {times.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock size={16} /> Zeiteinträge <span className="text-sm font-normal text-gray-500 dark:text-dark-400">({times.length} · {fmtDur(totalSec)})</span>
                </h2>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-dark-400 cursor-pointer">
                    <input type="checkbox" aria-label="Alle Zeiteinträge auswählen"
                      className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary"
                      checked={times.length > 0 && times.every(t => selected.has(t.id))}
                      onChange={e => setSelected(e.target.checked ? new Set(times.map(t => t.id)) : new Set())} />
                    Alle
                  </label>
                  <Button size="sm" variant="primary" onClick={approveSelected} disabled={busy || selected.size === 0} icon={<Check size={14} />}>
                    {selected.size > 0 ? `${selected.size} übernehmen` : 'Ausgewählte übernehmen'}
                  </Button>
                </div>
              </div>
              {times.map(p => (
                <div key={p.id} className={`${card} ${selected.has(p.id) ? 'border-accent-primary' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" aria-label={`${p.title} auswählen`} checked={selected.has(p.id)}
                      onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className="mt-1 rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-semibold text-gray-900 dark:text-white">{fmtDay(p.payload.startTime)}</span>
                        <span className="text-gray-600 dark:text-dark-400">{fmtTime(p.payload.startTime)}–{fmtTime(p.payload.endTime)}</span>
                        <span className="font-mono text-xs rounded bg-gray-100 dark:bg-dark-200 px-1.5 py-0.5 text-gray-700 dark:text-dark-500">{fmtDur(p.payload.duration)}</span>
                        {!p.payload.isBillable && <span className="text-xs text-gray-500 dark:text-dark-400">nicht abrechenbar</span>}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-dark-500 mt-1 min-w-0">
                        <Customer p={p} fallback={p.payload.entryScope === 'internal' ? `Intern · ${INTERNAL_LABELS[p.payload.internalCategory ?? ''] ?? p.payload.internalCategory ?? ''}` : 'Abwesenheit'} />
                        {p.ticketNumber && <span className="text-gray-500 dark:text-dark-400"> · {p.ticketNumber}</span>}
                      </p>
                      {editing === p.id ? (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input type="time" className={field} value={String(draft.from)} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} aria-label="Von" />
                          <input type="time" className={field} value={String(draft.to)} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} aria-label="Bis" />
                          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-dark-500">
                            <input type="checkbox" checked={Boolean(draft.isBillable)} onChange={e => setDraft(d => ({ ...d, isBillable: e.target.checked }))}
                              className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" /> abrechenbar
                          </label>
                          <textarea className={`${field} col-span-2 sm:col-span-4`} rows={2} maxLength={1000} value={String(draft.description)}
                            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} aria-label="Beschreibung" />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-white mt-1">{p.payload.description}</p>
                      )}
                      {p.payload.warnings?.includes('overlap') && (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={12} /> Überschneidet sich mit einem bestehenden Eintrag
                        </p>
                      )}
                      <Sources p={p} />
                      <Actions p={p} />
                      <Meta p={p} />
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {comments.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageSquare size={16} /> Ticket-Notizen ({comments.length})</h2>
              {comments.map(p => (
                <div key={p.id} className={card}>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {p.ticketNumber} · {p.ticketTitle}
                    <span className={`ml-2 text-xs rounded-full px-2 py-0.5 ${p.payload.isInternal ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'}`}>
                      {p.payload.isInternal ? 'intern' : 'an Kunden'}
                    </span>
                  </p>
                  {editing === p.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea className={field} rows={4} maxLength={10000} value={String(draft.content)} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} aria-label="Kommentar" />
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-500">
                        <input type="checkbox" checked={Boolean(draft.isInternal)} onChange={e => setDraft(d => ({ ...d, isInternal: e.target.checked }))}
                          className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" /> nur intern (Kunde sieht nichts)
                      </label>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{p.payload.content}</p>
                  )}
                  <Sources p={p} />
                  <Actions p={p} />
                  <Meta p={p} />
                </div>
              ))}
            </section>
          )}

          {notes.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><StickyNote size={16} /> Absprachen für das Kundengedächtnis ({notes.length})</h2>
              {notes.map(p => (
                <div key={p.id} className={card}>
                  <p className="text-sm text-gray-700 dark:text-dark-500 flex items-center gap-2 min-w-0">
                    <Customer p={p} fallback="Kunde" />
                    <span className="text-xs rounded-md bg-gray-100 dark:bg-dark-200 px-1.5 py-0.5">{NOTE_CATEGORY_LABELS[p.payload.category]}</span>
                  </p>
                  {editing === p.id ? (
                    <div className="mt-2 space-y-2">
                      <select className={field} value={String(draft.category)} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} aria-label="Kategorie">
                        {(Object.keys(NOTE_CATEGORY_LABELS) as NoteCategory[]).map(c => <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>)}
                      </select>
                      <textarea className={field} rows={3} maxLength={2000} value={String(draft.content)} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} aria-label="Absprache" />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{p.payload.content}</p>
                  )}
                  <Sources p={p} />
                  <Actions p={p} />
                  <Meta p={p} />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ProposalsInbox;
