import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Coffee } from 'lucide-react';
import { TimeEntry, Customer, Project, Activity } from '../types';
import { workSessionsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/UIContext';
import { toLocalDateString } from '../utils/time';
import { generateUUID } from '../utils/uuid';
import { Button } from './ui/Button';

/**
 * Tages-Timeline (Zeiterfassung Paket 3): legt Anwesenheit (Stempeluhr)
 * und gebuchte Zeiteinträge auf einem Zeitstrahl übereinander. Lücken —
 * Anwesenheitszeit ohne zugeordneten Eintrag — werden als klickbare
 * Blöcke sichtbar; ein Klick öffnet die Schnell-Erfassung mit Start/Ende
 * exakt auf den Lückengrenzen.
 */

interface DayTimelineViewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onCreateEntry: (entry: TimeEntry) => void | Promise<boolean | void>;
}

interface Interval { start: number; end: number } // Minuten seit Mitternacht

const MIN_GAP_MINUTES = 10;

const INTERNAL_CATEGORIES = [
  { value: 'admin', label: 'Administration' },
  { value: 'accounting', label: 'Buchhaltung' },
  { value: 'sales', label: 'Vertrieb' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'training', label: 'Weiterbildung' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'internal_support', label: 'Interner Support' },
  { value: 'travel', label: 'Reise' },
] as const;

const minutesOf = (iso: string, dayISO: string): number => {
  const d = new Date(iso);
  const dayStart = new Date(dayISO + 'T00:00:00');
  return Math.round((d.getTime() - dayStart.getTime()) / 60000);
};

const fmtClock = (minutes: number): string => {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const fmtHours = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

// Intervalle vereinigen (überlappende zusammenfassen)
const mergeIntervals = (list: Interval[]): Interval[] => {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
};

// a minus b (b sollte gemerged sein)
const subtractIntervals = (a: Interval, blockers: Interval[]): Interval[] => {
  let pieces: Interval[] = [{ ...a }];
  for (const b of blockers) {
    const next: Interval[] = [];
    for (const p of pieces) {
      if (b.end <= p.start || b.start >= p.end) { next.push(p); continue; }
      if (b.start > p.start) next.push({ start: p.start, end: b.start });
      if (b.end < p.end) next.push({ start: b.end, end: p.end });
    }
    pieces = next;
  }
  return pieces;
};

export const DayTimelineView = ({ entries, projects, customers, activities, onCreateEntry }: DayTimelineViewProps) => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [date, setDate] = useState<string>(() => {
    const fromUrl = searchParams.get('date');
    return fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : toLocalDateString(new Date());
  });

  const changeDate = (next: string) => {
    setDate(next);
    const params = new URLSearchParams(searchParams);
    params.set('date', next);
    setSearchParams(params, { replace: true });
  };
  const shiftDate = (days: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    changeDate(toLocalDateString(d));
  };

  const sessionsQuery = useQuery({
    queryKey: ['workSessions', 'day', date],
    queryFn: async () => (await workSessionsApi.list(date, date)).data,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  // Einträge des Tages (abgeschlossene + laufender bis jetzt)
  const dayEntries = useMemo(() => {
    return entries
      .filter(e => toLocalDateString(new Date(e.startTime)) === date && (e.endTime || e.isRunning))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, date]);

  const nowMinutes = minutesOf(new Date().toISOString(), date);
  const isToday = date === toLocalDateString(new Date());

  const model = useMemo(() => {
    const sessions = (sessionsQuery.data ?? []).map(s => ({
      start: minutesOf(s.startedAt, date),
      end: s.endedAt ? minutesOf(s.endedAt, date) : (isToday ? nowMinutes : minutesOf(s.startedAt, date)),
      breakSeconds: s.breakSeconds,
      open: !s.endedAt,
    })).filter(s => s.end > s.start);

    const entryBlocks = dayEntries.map(e => ({
      entry: e,
      start: minutesOf(e.startTime, date),
      end: e.endTime ? minutesOf(e.endTime, date) : (isToday ? nowMinutes : minutesOf(e.startTime, date)),
    })).filter(b => b.end > b.start);

    const covered = mergeIntervals(entryBlocks.map(b => ({ start: b.start, end: b.end })));
    const gaps: Interval[] = [];
    for (const s of sessions) {
      for (const g of subtractIntervals({ start: s.start, end: s.end }, covered)) {
        if (g.end - g.start >= MIN_GAP_MINUTES) gaps.push(g);
      }
    }

    const attendanceMin = sessions.reduce((sum, s) => sum + (s.end - s.start) - Math.round(s.breakSeconds / 60), 0);
    const recordedMin = entryBlocks.reduce((sum, b) => sum + (b.end - b.start), 0);
    const breakMin = sessions.reduce((sum, s) => sum + Math.round(s.breakSeconds / 60), 0);
    const gapMin = gaps.reduce((sum, g) => sum + (g.end - g.start), 0);

    // Achsenbereich: Stunden runden, mindestens 08–17 Uhr
    const allPoints = [
      ...sessions.flatMap(s => [s.start, s.end]),
      ...entryBlocks.flatMap(b => [b.start, b.end]),
    ];
    const rawMin = allPoints.length ? Math.min(...allPoints) : 8 * 60;
    const rawMax = allPoints.length ? Math.max(...allPoints) : 17 * 60;
    const axisStart = Math.max(0, Math.floor(Math.min(rawMin, 8 * 60) / 60) * 60);
    const axisEnd = Math.min(24 * 60, Math.ceil(Math.max(rawMax, 17 * 60) / 60) * 60);

    return { sessions, entryBlocks, gaps, attendanceMin, recordedMin, breakMin, gapMin, axisStart, axisEnd };
  }, [sessionsQuery.data, dayEntries, date, isToday, nowMinutes]);

  const pct = (minutes: number) =>
    `${(((minutes - model.axisStart) / (model.axisEnd - model.axisStart)) * 100).toFixed(2)}%`;
  const widthPct = (iv: Interval) =>
    `${(((iv.end - iv.start) / (model.axisEnd - model.axisStart)) * 100).toFixed(2)}%`;

  // ─── Schnell-Erfassung für eine Lücke ─────────────────────────────────────
  const [gapDraft, setGapDraft] = useState<Interval | null>(null);
  const [draftScope, setDraftScope] = useState<'customer_project' | 'internal'>('customer_project');
  const [draftCustomerId, setDraftCustomerId] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');
  const [draftActivityId, setDraftActivityId] = useState('');
  const [draftCategory, setDraftCategory] = useState('internal_support');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const openGap = (g: Interval) => {
    setGapDraft(g);
    setDraftStart(fmtClock(g.start));
    setDraftEnd(fmtClock(g.end));
    setDraftScope('customer_project');
    setDraftDescription('');
  };

  const projectsForCustomer = useMemo(
    () => projects.filter(p => p.customerId === draftCustomerId && p.isActive),
    [projects, draftCustomerId]
  );

  const isValidTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);

  const saveGapEntry = async () => {
    if (!currentUser || !gapDraft) return;
    if (!isValidTime(draftStart) || !isValidTime(draftEnd)) {
      showToast('Ungültige Zeitangabe', 'warning');
      return;
    }
    if (draftScope === 'customer_project' && !draftProjectId) {
      showToast('Bitte Projekt wählen', 'warning');
      return;
    }
    const start = new Date(`${date}T${draftStart}:00`);
    const end = new Date(`${date}T${draftEnd}:00`);
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);
    if (duration <= 0) {
      showToast('Ende muss nach dem Beginn liegen', 'warning');
      return;
    }
    try {
      setSaving(true);
      await onCreateEntry({
        id: generateUUID(),
        userId: currentUser.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration,
        projectId: draftScope === 'customer_project' ? draftProjectId : undefined,
        activityId: draftScope === 'customer_project' && draftActivityId ? draftActivityId : undefined,
        description: draftDescription,
        isRunning: false,
        isBillable: draftScope === 'customer_project',
        createdAt: new Date().toISOString(),
        entryScope: draftScope,
        internalCategory: draftScope === 'internal' ? draftCategory : undefined,
        customerVisibility: 'hidden',
      } as TimeEntry);
      setGapDraft(null);
    } catch (err) {
      console.error('[DayTimeline] create failed', err);
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = model.axisStart; m <= model.axisEnd; m += 60) marks.push(m);
    return marks;
  }, [model.axisStart, model.axisEnd]);

  const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Kopf: Datum + Navigation + Summen */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg hover:bg-accent-primary/10 text-gray-600 dark:text-dark-400" aria-label="Vortag">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[240px] text-center">{dayLabel}</h2>
          <button onClick={() => shiftDate(1)} className="p-2 rounded-lg hover:bg-accent-primary/10 text-gray-600 dark:text-dark-400" aria-label="Folgetag">
            <ChevronRight size={20} />
          </button>
          {!isToday && (
            <Button onClick={() => changeDate(toLocalDateString(new Date()))} variant="secondary" size="sm">Heute</Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Anwesenheit', value: `${fmtHours(model.attendanceMin)} h`, classes: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' },
            { label: 'Erfasst', value: `${fmtHours(model.recordedMin)} h`, classes: 'bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary' },
            { label: 'Pause', value: `${fmtHours(model.breakMin)} h`, classes: 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400' },
          ].map(chip => (
            <div key={chip.label} className={`px-3 py-1.5 rounded-lg text-center ${chip.classes}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-75">{chip.label}</div>
              <div className="text-sm font-bold tabular-nums leading-tight">{chip.value}</div>
            </div>
          ))}
          <div className={`px-3 py-1.5 rounded-lg text-center ${
            model.gapMin > 0
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
          }`}>
            <div className="text-[10px] uppercase tracking-wide opacity-75">Offen</div>
            <div className="text-sm font-bold tabular-nums leading-tight">
              {model.attendanceMin === 0 ? '—' : model.gapMin > 0 ? `${fmtHours(model.gapMin)} h` : '✓'}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl p-4">
        {sessionsQuery.isLoading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Lade…</p>
        ) : (
          <>
            <div className="relative h-32 select-none">
              {/* Stunden-Gridlines + Labels */}
              {hourMarks.map(m => (
                <div key={m} className="absolute top-0 bottom-0" style={{ left: pct(m) }}>
                  <span className="absolute -translate-x-1/2 top-0 text-[10px] tabular-nums text-gray-400 dark:text-dark-400">
                    {String(Math.floor(m / 60)).padStart(2, '0')}
                  </span>
                  <div className="absolute top-5 bottom-0 border-l border-gray-100 dark:border-dark-border/40" />
                </div>
              ))}

              {/* Anwesenheits-Band */}
              {model.sessions.map((sess, i) => (
                <div
                  key={`s-${i}`}
                  title={`Anwesend ${fmtClock(sess.start)}–${sess.open ? 'jetzt' : fmtClock(sess.end)}${sess.breakSeconds > 0 ? ` · Pause ${fmtHours(Math.round(sess.breakSeconds / 60))} h (Lage unbekannt)` : ''}`}
                  className={`absolute top-7 h-2.5 rounded-full bg-green-400/60 dark:bg-green-500/40 ${sess.open ? 'animate-pulse' : ''}`}
                  style={{ left: pct(sess.start), width: widthPct(sess) }}
                />
              ))}

              {/* Lücken (klickbar) */}
              {model.gaps.map((g, i) => {
                const wide = (g.end - g.start) / (model.axisEnd - model.axisStart) > 0.055;
                return (
                  <button
                    key={`gap-${i}`}
                    onClick={() => openGap(g)}
                    title={`Nicht zugeordnet ${fmtClock(g.start)}–${fmtClock(g.end)} (${fmtHours(g.end - g.start)} h) — klicken zum Nachtragen`}
                    className="absolute top-12 bottom-3 rounded-lg border-2 border-dashed border-amber-400/80 bg-amber-50/80 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-500 transition-all flex flex-col items-center justify-center gap-0.5 z-10"
                    style={{ left: pct(g.start), width: widthPct(g) }}
                  >
                    <span className="text-amber-600 dark:text-amber-400 font-bold leading-none">＋</span>
                    {wide && (
                      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums leading-none">
                        {fmtHours(g.end - g.start)} h
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Einträge */}
              {model.entryBlocks.map(b => {
                const project = b.entry.projectId ? projectById.get(b.entry.projectId) : undefined;
                const customer = project ? customerById.get(project.customerId) : undefined;
                const isInternal = b.entry.entryScope === 'internal';
                const label = isInternal
                  ? (INTERNAL_CATEGORIES.find(c => c.value === b.entry.internalCategory)?.label ?? 'Intern')
                  : `${project?.name ?? '?'}`;
                const widthShare = (b.end - b.start) / (model.axisEnd - model.axisStart);
                return (
                  <div
                    key={b.entry.id}
                    title={`${isInternal ? label : `${customer?.name ?? '?'} · ${project?.name ?? '?'}`}\n${fmtClock(b.start)}–${fmtClock(b.end)} (${fmtHours(b.end - b.start)} h)${b.entry.description ? `\n${b.entry.description}` : ''}`}
                    className={`absolute top-12 bottom-3 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 overflow-hidden flex flex-col justify-center text-white ${
                      isInternal ? 'bg-gray-400 dark:bg-dark-300' : ''
                    } ${b.entry.isRunning ? 'animate-pulse' : ''}`}
                    style={{
                      left: pct(b.start),
                      width: widthPct(b),
                      backgroundColor: isInternal ? undefined : (customer?.color ?? '#94a3b8'),
                    }}
                  >
                    {widthShare > 0.05 && (
                      <>
                        <span className="text-[11px] font-semibold truncate leading-tight flex items-center gap-1">
                          {isInternal && <Coffee size={10} className="shrink-0" />}
                          {label}
                        </span>
                        {widthShare > 0.09 && (
                          <span className="text-[10px] opacity-85 tabular-nums leading-tight">
                            {fmtClock(b.start)}–{fmtClock(b.end)} · {fmtHours(b.end - b.start)} h
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Jetzt-Marker */}
              {isToday && nowMinutes >= model.axisStart && nowMinutes <= model.axisEnd && (
                <div className="absolute top-6 bottom-0 z-20 pointer-events-none" style={{ left: pct(nowMinutes) }}>
                  <div className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-accent-primary" />
                  <div className="absolute top-1 bottom-0 -translate-x-1/2 w-0.5 bg-accent-primary/70" />
                </div>
              )}
            </div>

            {/* Legende */}
            <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500 dark:text-dark-400 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-1.5 rounded-full bg-green-400/60 dark:bg-green-500/40" /> Anwesenheit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-accent-primary/80" /> Zeiteintrag
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-900/20" /> Lücke — klicken zum Nachtragen
              </span>
            </div>

            {model.sessions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-dark-400 mt-3">
                Keine Stempelzeiten an diesem Tag — Lücken können nur innerhalb der Anwesenheit erkannt werden.
              </p>
            )}
            {model.sessions.length > 0 && model.breakMin > 0 && (
              <p className="text-xs text-gray-400 dark:text-dark-400 mt-1">
                Pausen ({fmtHours(model.breakMin)} h) sind im Anwesenheits-Band enthalten — ihre genaue Lage wird nicht aufgezeichnet, Lücken können also auch Pausen sein.
              </p>
            )}
          </>
        )}
      </div>

      {/* Schnell-Erfassung für eine Lücke */}
      {gapDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setGapDraft(null)}>
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Lücke nachtragen</h3>
              <button onClick={() => setGapDraft(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              {/* Zeitraum */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Von</label>
                  <input type="text" inputMode="numeric" value={draftStart} onChange={(e) => setDraftStart(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm text-center tabular-nums ${draftStart && !isValidTime(draftStart) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Bis</label>
                  <input type="text" inputMode="numeric" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm text-center tabular-nums ${draftEnd && !isValidTime(draftEnd) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                </div>
              </div>

              {/* Buchungsart */}
              <div className="inline-flex items-center bg-gray-100 dark:bg-dark-200 rounded-lg p-1 gap-1 w-full">
                <button onClick={() => setDraftScope('customer_project')}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium ${draftScope === 'customer_project' ? 'bg-white dark:bg-dark-50 text-accent-primary shadow-sm' : 'text-gray-600 dark:text-dark-400'}`}>
                  Projektzeit
                </button>
                <button onClick={() => setDraftScope('internal')}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium ${draftScope === 'internal' ? 'bg-white dark:bg-dark-50 text-accent-primary shadow-sm' : 'text-gray-600 dark:text-dark-400'}`}>
                  Intern
                </button>
              </div>

              {draftScope === 'customer_project' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Kunde *</label>
                    <select value={draftCustomerId} onChange={(e) => { setDraftCustomerId(e.target.value); setDraftProjectId(''); }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm">
                      <option value="">— wählen —</option>
                      {[...customers].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Projekt *</label>
                      <select value={draftProjectId} onChange={(e) => setDraftProjectId(e.target.value)} disabled={!draftCustomerId}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm disabled:opacity-50">
                        <option value="">— wählen —</option>
                        {projectsForCustomer.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Tätigkeit</label>
                      <select value={draftActivityId} onChange={(e) => setDraftActivityId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm">
                        <option value="">— keine —</option>
                        {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Kategorie</label>
                  <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm">
                    {INTERNAL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Beschreibung</label>
                <input type="text" value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Was wurde gemacht?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button onClick={() => setGapDraft(null)} variant="secondary">Abbrechen</Button>
              <Button onClick={saveGapEntry} loading={saving} variant="primary"
                disabled={!isValidTime(draftStart) || !isValidTime(draftEnd) || (draftScope === 'customer_project' && !draftProjectId)}>
                Eintrag speichern
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
