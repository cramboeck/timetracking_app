import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed, ImagePlus, Loader2, Sparkles, ChevronDown, ChevronRight, Clock, CheckCircle2, X,
} from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { SearchableSelect } from './SearchableSelect';
import { ModernDatePicker } from './ModernDatePicker';
import { callLogApi, type ExtractedCall, type CommitCall } from '../services/api';
import { useToast } from '../contexts/UIContext';
import type { Customer, Project } from '../types';

/**
 * Anrufliste übernehmen: Screenshots der iPhone-Anrufliste hochladen → KI liest
 * die Anrufe → pro Anruf „worum ging es?“ + optional Dauer → erst mit
 * „Übernehmen“ entstehen Interaktionen und Zeiteinträge.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  projects: Project[];
}

interface Draft {
  call: ExtractedCall;
  selected: boolean;
  customerId: string;
  contactId: string | null;
  date: string;
  time: string;
  subject: string;
  content: string;
  duration: number | null;
  projectId: string;
  billable: boolean;
  followUp: boolean;
}

const DURATIONS = [5, 10, 15, 30, 60];
const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const validTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim());
const normTime = (t: string) => {
  const s = t.trim().replace('.', ':');
  if (/^\d{3,4}$/.test(s)) return `${s.slice(0, -2).padStart(2, '0')}:${s.slice(-2)}`;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
};

const DirIcon = ({ d }: { d: ExtractedCall['direction'] }) =>
  d === 'missed' ? <PhoneMissed size={16} className="text-red-500" />
    : d === 'outbound' ? <PhoneOutgoing size={16} className="text-accent-primary" />
      : <PhoneIncoming size={16} className="text-green-600 dark:text-green-400" />;
const DIR_LABEL: Record<ExtractedCall['direction'], string> = { inbound: 'eingehend', outbound: 'ausgehend', missed: 'verpasst' };

export const CallLogImportDialog = ({ isOpen, onClose, customers, projects }: Props) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [notCallList, setNotCallList] = useState(0);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [polishing, setPolishing] = useState<string | null>(null);

  const customerOptions = useMemo(() => customers.map(c => ({ value: c.id, label: c.name, sublabel: c.customerNumber ? `#${c.customerNumber}` : undefined })), [customers]);
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? '';
  const projectsOf = (customerId: string) => projects.filter(p => p.customerId === customerId && p.isActive !== false);

  const reset = () => { setFiles([]); setDrafts(null); setNotCallList(0); setShowUnmatched(false); };
  const close = () => { reset(); onClose(); };

  const extract = useMutation({
    mutationFn: () => callLogApi.extract(files, localYmd()),
    onSuccess: res => {
      const today = localYmd();
      setNotCallList(res.data.notCallList);
      setDrafts(res.data.calls.map(call => {
        const customerId = call.match.customerId ?? '';
        const firstProject = customerId ? (call.defaultProjectId ?? projectsOf(customerId)[0]?.id ?? '') : '';
        return {
          call,
          selected: !!customerId && !call.alreadyImported,
          customerId,
          contactId: call.match.contactId,
          date: call.date ?? today,
          time: call.time ?? '',
          subject: '',
          content: '',
          duration: null,
          projectId: firstProject,
          billable: true,
          followUp: call.direction === 'missed',
        };
      }));
      if (res.data.calls.length === 0) showToast('Auf dem Screenshot wurden keine Anrufe erkannt', 'warning');
    },
    onError: (err: Error) => showToast(err.message || 'Screenshot konnte nicht gelesen werden', 'error'),
  });

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts(prev => prev?.map(d => (d.call.key === key ? { ...d, ...patch } : d)) ?? null);

  const setCustomer = (d: Draft, customerId: string) => {
    const p = customerId ? projectsOf(customerId)[0]?.id ?? '' : '';
    update(d.call.key, { customerId, contactId: customerId === d.call.match.customerId ? d.call.match.contactId : null, projectId: p, selected: !!customerId && !d.call.alreadyImported });
  };

  const polish = async (d: Draft) => {
    if (!d.content.trim()) return;
    setPolishing(d.call.key);
    try {
      const res = await callLogApi.polish(d.content, customerName(d.customerId) || d.call.name, DIR_LABEL[d.call.direction]);
      update(d.call.key, { content: res.data.note, subject: d.subject || res.data.subject || '' });
    } catch (err) {
      showToast((err as Error).message || 'KI nicht erreichbar', 'error');
    } finally {
      setPolishing(null);
    }
  };

  const selected = (drafts ?? []).filter(d => d.selected && d.customerId);
  const problems = (d: Draft): string | null => {
    if (d.time && !validTime(normTime(d.time))) return 'Uhrzeit im Format HH:MM angeben';
    if (d.duration && d.duration > 0) {
      if (!d.time) return 'Für die Zeitbuchung die Uhrzeit des Anrufs angeben';
      if (!d.projectId) return 'Für die Zeitbuchung ein Projekt wählen';
    }
    return null;
  };
  const blocking = selected.filter(d => problems(d));
  const timeCount = selected.filter(d => d.duration && d.duration > 0 && d.projectId).length;

  const commit = useMutation({
    mutationFn: () => {
      const calls: CommitCall[] = selected.map(d => {
        const time = d.time ? normTime(d.time) : '12:00';
        const occurredAt = new Date(`${d.date}T${time}:00`).toISOString();
        const minutes = d.call.direction !== 'missed' && d.duration && d.duration > 0 ? d.duration : null;
        return {
          key: d.call.key,
          customerId: d.customerId,
          contactId: d.contactId,
          direction: d.call.direction,
          occurredAt,
          subject: d.subject.trim() || null,
          content: d.content.trim() || null,
          durationMinutes: minutes,
          followUp: d.followUp,
          time: minutes && d.projectId ? { projectId: d.projectId, isBillable: d.billable } : null,
        };
      });
      return callLogApi.commit(calls);
    },
    onSuccess: res => {
      const created = res.data.created.length;
      const times = res.data.created.filter(c => c.timeEntryId).length;
      const skipped = res.data.skipped.length;
      showToast(
        `${created} Anruf${created === 1 ? '' : 'e'} übernommen${times ? `, ${times} Zeiteintr${times === 1 ? 'ag' : 'äge'} gebucht` : ''}${skipped ? ` · ${skipped} übersprungen (${res.data.skipped[0].reason})` : ''}`,
        skipped && !created ? 'warning' : 'success'
      );
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      window.dispatchEvent(new Event('rbf-interactions-changed'));
      if (times) window.dispatchEvent(new Event('rbf-entries-imported'));
      close();
    },
    onError: (err: Error) => showToast(err.message || 'Übernehmen fehlgeschlagen', 'error'),
  });

  const matched = (drafts ?? []).filter(d => d.call.match.customerId);
  const unmatched = (drafts ?? []).filter(d => !d.call.match.customerId);
  const imported = (drafts ?? []).filter(d => d.call.alreadyImported).length;

  const card = (d: Draft) => {
    const missed = d.call.direction === 'missed';
    const err = d.selected ? problems(d) : null;
    const custProjects = d.customerId ? projectsOf(d.customerId) : [];
    return (
      <li key={d.call.key} className={`rounded-xl border p-3 space-y-3 ${d.selected ? 'border-accent-primary/40 bg-white dark:bg-dark-100' : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-50 opacity-90'}`} data-testid="call-card">
        <div className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={d.selected} disabled={!d.customerId || d.call.alreadyImported}
            onChange={e => update(d.call.key, { selected: e.target.checked })} aria-label="Übernehmen" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <DirIcon d={d.call.direction} />
              <span className="font-medium text-gray-900 dark:text-white break-words">{d.call.name || d.call.number}</span>
              {d.call.count > 1 && <span className="text-xs text-gray-500 dark:text-dark-400">({d.call.count}×)</span>}
              {d.call.alreadyImported && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400">schon übernommen</span>}
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-400 break-words">
              {[DIR_LABEL[d.call.direction], d.call.name && d.call.number ? d.call.number : null, d.call.label, d.contactId && d.call.contactName ? `Kontakt: ${d.call.contactName}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {!d.call.alreadyImported && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-start">
              <div>
                <SearchableSelect options={customerOptions} value={d.customerId} onChange={v => setCustomer(d, v)} placeholder="Kunde wählen…" />
                {d.call.match.candidates.length > 1 && !d.customerId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Passt zu mehreren Kunden: {d.call.match.candidates.map(customerName).filter(Boolean).join(', ')}</p>
                )}
              </div>
              <ModernDatePicker value={d.date} onChange={v => update(d.call.key, { date: v })} compact />
              <div className="sm:w-24 min-w-0">
                <Input value={d.time} onChange={e => update(d.call.key, { time: e.target.value })} onBlur={e => update(d.call.key, { time: e.target.value ? normTime(e.target.value) : '' })}
                  placeholder="Uhrzeit" inputMode="numeric" aria-label="Uhrzeit" />
              </div>
            </div>

            {d.selected && (
              <>
                <div>
                  <Textarea rows={2} value={d.content} onChange={e => update(d.call.key, { content: e.target.value })}
                    placeholder={missed ? 'Optional: Notiz zum verpassten Anruf' : 'Worum ging es? (Stichworte reichen, auch per Diktat)'} />
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Button size="sm" variant="ghost" icon={polishing === d.call.key ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      disabled={!d.content.trim() || polishing !== null} onClick={() => polish(d)}>KI formulieren</Button>
                    <Input value={d.subject} onChange={e => update(d.call.key, { subject: e.target.value })} placeholder="Betreff (optional)" className="flex-1 min-w-[10rem]" />
                  </div>
                </div>

                {missed ? (
                  <p className="text-xs text-gray-500 dark:text-dark-400">Wird mit Wiedervorlage „Rückruf“ für heute angelegt.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Clock size={14} className="text-gray-400" />
                      <span className="text-xs text-gray-600 dark:text-dark-400 mr-1">Zeit buchen:</span>
                      {[null, ...DURATIONS].map(m => (
                        <button key={m ?? 0} type="button" onClick={() => update(d.call.key, { duration: m })}
                          className={`text-xs px-2.5 py-1 rounded-full border ${d.duration === m ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-500 hover:border-accent-primary'}`}>
                          {m === null ? 'keine' : `${m} min`}
                        </button>
                      ))}
                      <input type="number" min={1} max={600} inputMode="numeric" aria-label="Minuten"
                        value={d.duration && !DURATIONS.includes(d.duration) ? d.duration : ''}
                        onChange={e => update(d.call.key, { duration: e.target.value ? Math.min(600, Math.max(1, Number(e.target.value))) : null })}
                        placeholder="min" className="w-16 text-xs px-2 py-1 rounded-full border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white" />
                    </div>
                    {d.duration ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <select value={d.projectId} onChange={e => update(d.call.key, { projectId: e.target.value })} aria-label="Projekt"
                          className="flex-1 px-3.5 py-2 rounded-xl text-sm bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white">
                          <option value="">{custProjects.length ? 'Projekt wählen…' : 'Kunde hat kein aktives Projekt'}</option>
                          {custProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-500">
                          <input type="checkbox" checked={d.billable} onChange={e => update(d.call.key, { billable: e.target.checked })} /> abrechenbar
                        </label>
                      </div>
                    ) : null}
                    <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-dark-500">
                      <input type="checkbox" checked={d.followUp} onChange={e => update(d.call.key, { followUp: e.target.checked })} /> Wiedervorlage (heute)
                    </label>
                  </div>
                )}
                {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
              </>
            )}
          </>
        )}
      </li>
    );
  };

  const footer = drafts ? (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
      <Button variant="ghost" onClick={reset} disabled={commit.isPending}>Andere Screenshots</Button>
      <Button variant="primary" onClick={() => commit.mutate()} disabled={selected.length === 0 || blocking.length > 0 || commit.isPending}
        icon={commit.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} data-testid="call-commit">
        {selected.length} Anruf{selected.length === 1 ? '' : 'e'} übernehmen{timeCount ? ` · ${timeCount}× Zeit` : ''}
      </Button>
    </div>
  ) : (
    <div className="flex justify-end gap-2 w-full">
      <Button variant="ghost" onClick={close}>Abbrechen</Button>
      <Button variant="primary" onClick={() => extract.mutate()} disabled={files.length === 0 || extract.isPending}
        icon={extract.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} data-testid="call-extract">
        {extract.isPending ? 'Wird gelesen…' : 'Anrufe auslesen'}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title="Anrufliste übernehmen" maxWidth="2xl" footer={footer}>
      <div className="text-left space-y-4">
        {!drafts ? (
          <>
            <p className="text-sm text-gray-600 dark:text-dark-400">
              Screenshot der Anrufliste (Telefon-App → „Zuletzt“) hochladen. Die KI liest Name/Nummer, Zeitpunkt und Richtung,
              du ergänzt pro Anruf kurz, worum es ging. Erst „Übernehmen“ legt Interaktionen und Zeiteinträge an — der Screenshot wird nicht gespeichert.
            </p>
            <button type="button" onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))].slice(0, 5)); }}
              className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-dark-border hover:border-accent-primary p-6 flex flex-col items-center gap-2 text-gray-600 dark:text-dark-400">
              <ImagePlus size={28} className="text-accent-primary" />
              <span className="text-sm font-medium">Screenshots wählen</span>
              <span className="text-xs">PNG/JPG, bis zu 5 auf einmal</span>
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" data-testid="call-file"
              onChange={e => { setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.target.value = ''; }} />
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 max-w-full">
                    <span className="truncate max-w-[12rem]">{f.name}</span>
                    <button type="button" aria-label="Entfernen" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-dark-400" data-testid="call-summary">
              {drafts.length} Anruf{drafts.length === 1 ? '' : 'e'} erkannt · {matched.length} zugeordnet
              {imported ? ` · ${imported} schon übernommen` : ''}{notCallList ? ` · ${notCallList} Bild${notCallList === 1 ? '' : 'er'} ohne Anrufliste` : ''}
            </p>
            {matched.length > 0 && <ul className="space-y-3">{matched.map(card)}</ul>}
            {unmatched.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowUnmatched(v => !v)} data-testid="call-unmatched-toggle"
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-dark-500 hover:text-accent-primary">
                  {showUnmatched ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  Nicht zugeordnet ({unmatched.length}) — private Nummern bleiben draußen, außer du wählst einen Kunden
                </button>
                {showUnmatched && <ul className="space-y-3 mt-2">{unmatched.map(card)}</ul>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default CallLogImportDialog;
