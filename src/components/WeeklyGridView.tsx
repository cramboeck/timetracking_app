import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Lock, History } from 'lucide-react';
import { TimeEntry, Customer, Project, Activity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast, useConfirm } from '../contexts/UIContext';
import { toLocalDateString } from '../utils/time';
import { generateUUID } from '../utils/uuid';
import { Button } from './ui/Button';

interface WeeklyGridViewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onCreateEntry: (entry: TimeEntry) => void | Promise<boolean | void>;
  onEditEntry: (id: string, updates: Partial<TimeEntry>) => void | Promise<void>;
  onDeleteEntry: (id: string) => void | Promise<void>;
}

type CellData = { totalSeconds: number; entries: TimeEntry[] };
type RowMeta = { rowKey: string; projectId: string; activityId: string | null; customer: Customer | null; project: Project | null; activity: Activity | null };

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfISOWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function isoWeekNumber(d: Date): number {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Thursday in current week decides the year per ISO 8601
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

function formatDayShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseHoursInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return 0;
  if (s.includes(':')) {
    const [hStr, mStr] = s.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m >= 60 || h > 24) return null;
    return Math.round(h * 3600 + m * 60);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return Math.round(n * 3600);
}

function formatHoursDecimal(seconds: number): string {
  if (seconds === 0) return '';
  return (seconds / 3600).toFixed(2);
}

function formatHoursDecimalAlways(seconds: number): string {
  return (seconds / 3600).toFixed(2);
}

function rowKeyFor(projectId: string, activityId: string | null | undefined): string {
  return `${projectId}::${activityId ?? ''}`;
}

function parseRowKey(rowKey: string): { projectId: string; activityId: string | null } {
  const [projectId, activityId] = rowKey.split('::');
  return { projectId, activityId: activityId || null };
}

// Build YYYY-MM-DD strings for the 7 days starting at weekStart (Mon..Sun)
function weekDayISOs(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toLocalDateString(addDays(weekStart, i)));
}

// Heatmap intensity buckets (returns a tailwind bg class)
function heatmapClass(seconds: number, isCurrentMonth: boolean): string {
  if (!isCurrentMonth) return 'bg-transparent text-gray-300 dark:text-dark-400/40';
  if (seconds === 0) return 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400';
  const hours = seconds / 3600;
  if (hours < 4) return 'bg-accent-primary/20 text-accent-primary';
  if (hours < 8) return 'bg-accent-primary/50 text-white';
  return 'bg-accent-primary text-white';
}

// ─── Component ───────────────────────────────────────────────────────────────

export const WeeklyGridView = ({
  entries,
  projects,
  customers,
  activities,
  onCreateEntry,
  onEditEntry,
  onDeleteEntry,
}: WeeklyGridViewProps) => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfISOWeek(new Date()));
  const [editingCell, setEditingCell] = useState<{ rowKey: string; dayISO: string } | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // "Add row" cascading-selects state
  const [draftRows, setDraftRows] = useState<RowMeta[]>([]);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [draftCustomerId, setDraftCustomerId] = useState<string>('');
  const [draftProjectId, setDraftProjectId] = useState<string>('');
  const [draftActivityId, setDraftActivityId] = useState<string>('');

  // ─── Lookups ────────────────────────────────────────────────────────────────
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const activityById = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities]);

  const weekDays = useMemo(() => weekDayISOs(weekStart), [weekStart]);
  const weekStartISO = weekDays[0];
  const weekEndISO = weekDays[6];

  // ─── Grouping for current week ─────────────────────────────────────────────
  const weekData = useMemo(() => {
    const data: Map<string, Map<string, CellData>> = new Map();
    const rowMetas = new Map<string, RowMeta>();

    for (const entry of entries) {
      if (entry.isRunning || !entry.endTime) continue;
      const dayISO = toLocalDateString(new Date(entry.startTime));
      if (dayISO < weekStartISO || dayISO > weekEndISO) continue;

      const rowKey = rowKeyFor(entry.projectId, entry.activityId);
      if (!data.has(rowKey)) data.set(rowKey, new Map());
      const row = data.get(rowKey)!;
      if (!row.has(dayISO)) row.set(dayISO, { totalSeconds: 0, entries: [] });
      const cell = row.get(dayISO)!;
      cell.totalSeconds += entry.duration;
      cell.entries.push(entry);

      if (!rowMetas.has(rowKey)) {
        const project = projectById.get(entry.projectId) ?? null;
        const customer = project ? customerById.get(project.customerId) ?? null : null;
        const activity = entry.activityId ? activityById.get(entry.activityId) ?? null : null;
        rowMetas.set(rowKey, { rowKey, projectId: entry.projectId, activityId: entry.activityId ?? null, customer, project, activity });
      }
    }

    // Merge draftRows (rows with no real entries yet)
    for (const draft of draftRows) {
      if (!rowMetas.has(draft.rowKey)) rowMetas.set(draft.rowKey, draft);
    }

    // Sort: customer.name › project.name › activity.name
    const sortedRows = Array.from(rowMetas.values()).sort((a, b) => {
      const ca = a.customer?.name ?? '';
      const cb = b.customer?.name ?? '';
      if (ca !== cb) return ca.localeCompare(cb, 'de');
      const pa = a.project?.name ?? '';
      const pb = b.project?.name ?? '';
      if (pa !== pb) return pa.localeCompare(pb, 'de');
      const aa = a.activity?.name ?? '';
      const ab = b.activity?.name ?? '';
      return aa.localeCompare(ab, 'de');
    });

    return { data, rowMetas: sortedRows };
  }, [entries, weekStartISO, weekEndISO, projectById, customerById, activityById, draftRows]);

  // ─── Heatmap data (3 months: prev, current, next based on weekStart's month) ──
  const heatmapMonths = useMemo(() => {
    const ref = weekStart;
    const monthsToShow = [-1, 0, 1].map(offset => {
      const d = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
      return d;
    });

    // Per-day totals over the full date range
    const minMonth = monthsToShow[0];
    const maxMonth = monthsToShow[2];
    const rangeStart = toLocalDateString(minMonth);
    const rangeEnd = toLocalDateString(new Date(maxMonth.getFullYear(), maxMonth.getMonth() + 1, 0));

    const dayTotals: Map<string, { seconds: number; count: number }> = new Map();
    for (const entry of entries) {
      if (entry.isRunning || !entry.endTime) continue;
      const dayISO = toLocalDateString(new Date(entry.startTime));
      if (dayISO < rangeStart || dayISO > rangeEnd) continue;
      const cur = dayTotals.get(dayISO) ?? { seconds: 0, count: 0 };
      cur.seconds += entry.duration;
      cur.count += 1;
      dayTotals.set(dayISO, cur);
    }

    // Build month grids: 6 rows × 7 cols (Mon-Sun), include trailing/leading days from neighbors
    const monthGrids = monthsToShow.map(monthDate => {
      const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const gridStart = startOfISOWeek(firstOfMonth);
      const cells: { date: Date; iso: string; isCurrentMonth: boolean; seconds: number; count: number }[] = [];
      for (let i = 0; i < 42; i++) {
        const day = addDays(gridStart, i);
        const iso = toLocalDateString(day);
        const totals = dayTotals.get(iso);
        cells.push({
          date: day,
          iso,
          isCurrentMonth: day.getMonth() === monthDate.getMonth(),
          seconds: totals?.seconds ?? 0,
          count: totals?.count ?? 0,
        });
      }
      // Trim trailing rows that are entirely outside the current month
      const trimmed: typeof cells[] = [];
      for (let r = 0; r < 6; r++) {
        const row = cells.slice(r * 7, r * 7 + 7);
        if (row.some(c => c.isCurrentMonth)) trimmed.push(row);
      }
      return {
        label: monthDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        rows: trimmed,
      };
    });

    return monthGrids;
  }, [entries, weekStart]);

  // ─── Today's entries (for the description quick-edit panel) ────────────────
  const todayISOLive = toLocalDateString(new Date());
  const todayEntries = useMemo(() => {
    return entries
      .filter(e => !e.isRunning && e.endTime && toLocalDateString(new Date(e.startTime)) === todayISOLive)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, todayISOLive]);

  // Map of rowKey -> array of distinct prior descriptions (most recent first).
  // Used both for the explicit "Vorlage übernehmen" dropdown and the native
  // <datalist> autocomplete on the description input.
  const descriptionSuggestionsByRow = useMemo(() => {
    const map = new Map<string, { description: string; lastUsed: string }[]>();
    const sorted = [...entries].sort((a, b) => b.startTime.localeCompare(a.startTime));
    for (const e of sorted) {
      const desc = e.description?.trim();
      if (!desc) continue;
      const key = rowKeyFor(e.projectId, e.activityId);
      const list = map.get(key) ?? [];
      if (!list.some(item => item.description === desc)) {
        list.push({ description: desc, lastUsed: e.startTime });
      }
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const [openTemplatePicker, setOpenTemplatePicker] = useState<string | null>(null);
  const descInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Close template picker on outside click
  useEffect(() => {
    if (!openTemplatePicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('[data-template-picker]')) {
        setOpenTemplatePicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openTemplatePicker]);

  const handleDescriptionBlur = async (entry: TimeEntry, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === (entry.description ?? '').trim()) return;
    try {
      await onEditEntry(entry.id, { description: trimmed });
    } catch (err) {
      console.error('[WeeklyGrid] description update failed', err);
      showToast('Beschreibung speichern fehlgeschlagen', 'error');
    }
  };

  const handlePickTemplate = async (entry: TimeEntry, newDescription: string) => {
    const input = descInputRefs.current.get(entry.id);
    if (input) input.value = newDescription;
    setOpenTemplatePicker(null);
    if (newDescription === (entry.description ?? '').trim()) return;
    try {
      await onEditEntry(entry.id, { description: newDescription });
    } catch (err) {
      console.error('[WeeklyGrid] template apply failed', err);
      showToast('Beschreibung speichern fehlgeschlagen', 'error');
    }
  };

  // ─── Cell totals / daily / grand totals ────────────────────────────────────
  const dailyTotals = useMemo(() => {
    return weekDays.map(dayISO => {
      let s = 0;
      for (const row of weekData.data.values()) {
        s += row.get(dayISO)?.totalSeconds ?? 0;
      }
      return s;
    });
  }, [weekData.data, weekDays]);

  const grandTotal = useMemo(() => dailyTotals.reduce((a, b) => a + b, 0), [dailyTotals]);

  // ─── Edit lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const openCell = useCallback((rowKey: string, dayISO: string, currentSeconds: number, isLocked: boolean) => {
    if (isLocked) return;
    setEditingCell({ rowKey, dayISO });
    setEditBuffer(formatHoursDecimal(currentSeconds));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditBuffer('');
  }, []);

  // Heuristic: start at 08:00, or after the latest endTime of that day if any entries exist
  const synthesizeTimes = useCallback((dayISO: string, durationSec: number) => {
    let latestEnd: Date | null = null;
    for (const entry of entries) {
      if (entry.isRunning || !entry.endTime) continue;
      const entryDay = toLocalDateString(new Date(entry.startTime));
      if (entryDay !== dayISO) continue;
      const end = new Date(entry.endTime);
      if (!latestEnd || end > latestEnd) latestEnd = end;
    }
    const [y, m, d] = dayISO.split('-').map(Number);
    const start = latestEnd ?? new Date(y, m - 1, d, 8, 0, 0, 0);
    const end = new Date(start.getTime() + durationSec * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }, [entries]);

  const commitEdit = useCallback(async () => {
    if (!editingCell || !currentUser) { cancelEdit(); return; }
    const { rowKey, dayISO } = editingCell;
    const newSeconds = parseHoursInput(editBuffer);
    if (newSeconds === null) {
      showToast('Ungültige Eingabe. Erlaubt: 8, 8.5, 8,5 oder 8:30', 'warning');
      return;
    }
    const cell = weekData.data.get(rowKey)?.get(dayISO);
    const oldSeconds = cell?.totalSeconds ?? 0;
    if (newSeconds === oldSeconds) { cancelEdit(); return; }

    const cellEntries = cell?.entries ?? [];
    if (cellEntries.length === 0) {
      if (newSeconds === 0) { cancelEdit(); return; }
      const { projectId, activityId } = parseRowKey(rowKey);
      const { startTime, endTime } = synthesizeTimes(dayISO, newSeconds);
      try {
        await onCreateEntry({
          id: generateUUID(),
          userId: currentUser.id,
          startTime,
          endTime,
          duration: newSeconds,
          projectId,
          activityId: activityId ?? undefined,
          description: '',
          isRunning: false,
          isBillable: true,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[WeeklyGrid] create failed', err);
        showToast('Speichern fehlgeschlagen', 'error');
      }
    } else if (cellEntries.length === 1) {
      const entry = cellEntries[0];
      if (newSeconds === 0) {
        const ok = await confirm({
          title: 'Eintrag löschen?',
          message: `Soll der Eintrag (${formatHoursDecimalAlways(entry.duration)} h) wirklich gelöscht werden?`,
          variant: 'danger',
          confirmText: 'Löschen',
        });
        if (!ok) { cancelEdit(); return; }
        try {
          await onDeleteEntry(entry.id);
        } catch (err) {
          console.error('[WeeklyGrid] delete failed', err);
          showToast('Löschen fehlgeschlagen', 'error');
        }
      } else {
        const newEnd = new Date(new Date(entry.startTime).getTime() + newSeconds * 1000).toISOString();
        try {
          await onEditEntry(entry.id, { duration: newSeconds, endTime: newEnd });
        } catch (err) {
          console.error('[WeeklyGrid] update failed', err);
          showToast('Aktualisieren fehlgeschlagen', 'error');
        }
      }
    }
    setEditingCell(null);
    setEditBuffer('');
  }, [editingCell, editBuffer, weekData.data, currentUser, onCreateEntry, onEditEntry, onDeleteEntry, confirm, showToast, cancelEdit, synthesizeTimes]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // ─── Add-Row UX ────────────────────────────────────────────────────────────
  const projectsForCustomer = useMemo(() => {
    if (!draftCustomerId) return [];
    return projects.filter(p => p.customerId === draftCustomerId && p.isActive);
  }, [projects, draftCustomerId]);

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [customers]
  );

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [activities]
  );

  const addDraftRow = () => {
    if (!draftProjectId) { showToast('Bitte Projekt wählen', 'warning'); return; }
    const project = projectById.get(draftProjectId) ?? null;
    const customer = project ? customerById.get(project.customerId) ?? null : null;
    const activity = draftActivityId ? activityById.get(draftActivityId) ?? null : null;
    const rowKey = rowKeyFor(draftProjectId, draftActivityId || null);
    if (weekData.rowMetas.some(r => r.rowKey === rowKey)) {
      showToast('Diese Zeile existiert bereits', 'info');
      setAddRowOpen(false);
      return;
    }
    setDraftRows(prev => [...prev, { rowKey, projectId: draftProjectId, activityId: draftActivityId || null, customer, project, activity }]);
    setAddRowOpen(false);
    setDraftCustomerId('');
    setDraftProjectId('');
    setDraftActivityId('');
  };

  const removeDraftRow = (rowKey: string) => {
    setDraftRows(prev => prev.filter(r => r.rowKey !== rowKey));
  };

  // ─── Heatmap interactions ──────────────────────────────────────────────────
  const jumpToWeek = (date: Date) => {
    setWeekStart(startOfISOWeek(date));
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  const weekLabel = `KW ${isoWeekNumber(weekStart)} (${formatDayShort(weekStart)} - ${formatDayShort(addDays(weekStart, 6))})`;
  const isCurrentWeek = toLocalDateString(weekStart) === toLocalDateString(startOfISOWeek(new Date()));

  const todayISO = toLocalDateString(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-2 rounded-lg hover:bg-accent-primary/10 text-gray-600 dark:text-dark-400"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[230px] text-center">
            {weekLabel}
          </h2>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="p-2 rounded-lg hover:bg-accent-primary/10 text-gray-600 dark:text-dark-400"
            aria-label="Nächste Woche"
          >
            <ChevronRight size={20} />
          </button>
          {!isCurrentWeek && (
            <Button onClick={() => setWeekStart(startOfISOWeek(new Date()))} variant="secondary" size="sm">
              Heute
            </Button>
          )}
        </div>
        <Button onClick={() => setAddRowOpen(true)} variant="primary" size="sm" icon={<Plus size={16} />}>
          Zeile hinzufügen
        </Button>
      </div>

      {/* Monthly Heatmap (3 months) */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {heatmapMonths.map(month => (
            <div key={month.label}>
              <div className="text-sm font-semibold text-gray-600 dark:text-dark-400 mb-2 text-center">{month.label}</div>
              <div className="grid grid-cols-7 gap-1">
                {DAY_LABELS.map(lbl => (
                  <div key={lbl} className="text-[10px] text-gray-400 dark:text-dark-400 text-center">{lbl}</div>
                ))}
                {month.rows.flat().map(cell => {
                  const inSelectedWeek = cell.iso >= weekStartISO && cell.iso <= weekEndISO;
                  const isToday = cell.iso === todayISO;
                  return (
                    <button
                      key={cell.iso}
                      onClick={() => jumpToWeek(cell.date)}
                      title={cell.isCurrentMonth ? `${formatHoursDecimalAlways(cell.seconds)} h erfasst${cell.count ? ` (${cell.count} Eintr${cell.count === 1 ? 'ag' : 'äge'})` : ''}` : ''}
                      className={`aspect-square text-xs font-medium rounded transition-colors flex items-center justify-center
                        ${heatmapClass(cell.seconds, cell.isCurrentMonth)}
                        ${inSelectedWeek && cell.isCurrentMonth ? 'ring-2 ring-accent-primary ring-inset' : ''}
                        ${isToday ? 'outline outline-2 outline-accent-primary outline-offset-[-1px]' : ''}
                        ${cell.isCurrentMonth ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      {cell.date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-gray-500 dark:text-dark-400">
          <span>Weniger</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded bg-gray-100 dark:bg-dark-200" />
            <div className="w-3 h-3 rounded bg-accent-primary/20" />
            <div className="w-3 h-3 rounded bg-accent-primary/50" />
            <div className="w-3 h-3 rounded bg-accent-primary" />
          </div>
          <span>Mehr</span>
        </div>
      </div>

      {/* Today's descriptions quick-edit */}
      {todayEntries.length > 0 && (
        <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-500 mb-3">
            Heute · {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })} — Beschreibungen
          </h3>
          <div className="space-y-2">
            {todayEntries.map(entry => {
              const project = projectById.get(entry.projectId);
              const customer = project ? customerById.get(project.customerId) ?? null : null;
              const activity = entry.activityId ? activityById.get(entry.activityId) ?? null : null;
              const rk = rowKeyFor(entry.projectId, entry.activityId);
              const suggestions = (descriptionSuggestionsByRow.get(rk) ?? [])
                .filter(s => s.description !== (entry.description ?? '').trim())
                .slice(0, 10);
              const datalistId = `desc-suggestions-${entry.id}`;
              const isPickerOpen = openTemplatePicker === entry.id;
              return (
                <div key={entry.id} className="flex items-center gap-3 py-1">
                  {customer && (
                    <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: customer.color }} />
                  )}
                  <div className="min-w-0 flex-shrink-0 w-1/3 sm:w-1/4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {customer?.name ?? '—'}{project && ` · ${project.name}`}
                    </div>
                    {activity && (
                      <div className="text-xs text-accent-primary truncate">{activity.name}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-accent-primary flex-shrink-0 w-14 text-right tabular-nums">
                    {formatHoursDecimalAlways(entry.duration)} h
                  </div>
                  <input
                    ref={(el) => {
                      if (el) descInputRefs.current.set(entry.id, el);
                      else descInputRefs.current.delete(entry.id);
                    }}
                    key={entry.id}
                    type="text"
                    list={suggestions.length > 0 ? datalistId : undefined}
                    defaultValue={entry.description ?? ''}
                    placeholder="Was hast du gemacht? (Beschreibung)"
                    onBlur={(e) => void handleDescriptionBlur(entry, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-50 dark:bg-dark-50 border border-gray-200 dark:border-dark-border rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary"
                  />
                  {suggestions.length > 0 && (
                    <datalist id={datalistId}>
                      {suggestions.map(s => <option key={s.description} value={s.description} />)}
                    </datalist>
                  )}
                  <div className="relative flex-shrink-0" data-template-picker>
                    <button
                      type="button"
                      onClick={() => setOpenTemplatePicker(isPickerOpen ? null : entry.id)}
                      disabled={suggestions.length === 0}
                      title={suggestions.length === 0 ? 'Keine vorherigen Beschreibungen' : 'Vorlage übernehmen'}
                      className={`p-1.5 rounded transition-colors ${
                        suggestions.length === 0
                          ? 'text-gray-300 dark:text-dark-400/40 cursor-not-allowed'
                          : isPickerOpen
                            ? 'bg-accent-primary/20 text-accent-primary'
                            : 'text-gray-500 dark:text-dark-400 hover:bg-accent-primary/10 hover:text-accent-primary'
                      }`}
                    >
                      <History size={16} />
                    </button>
                    {isPickerOpen && suggestions.length > 0 && (
                      <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-dark-50 border border-gray-200 dark:border-dark-border rounded-lg shadow-lg py-1 min-w-[280px] max-w-[400px] max-h-72 overflow-y-auto">
                        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 dark:text-dark-400 border-b border-gray-100 dark:border-dark-border">
                          Vorherige Beschreibungen
                        </div>
                        {suggestions.map(s => (
                          <button
                            key={s.description}
                            type="button"
                            onClick={() => void handlePickTemplate(entry, s.description)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-dark-500 hover:bg-accent-primary/10 hover:text-accent-primary transition-colors flex items-baseline justify-between gap-2"
                          >
                            <span className="truncate flex-1">{s.description}</span>
                            <span className="text-[10px] text-gray-400 dark:text-dark-400 flex-shrink-0 tabular-nums">
                              {new Date(s.lastUsed).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Grid */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr className="border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
              <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-dark-400 sticky left-0 bg-gray-50 dark:bg-dark-200/50 z-10" style={{ minWidth: 280 }}>
                Kunde / Projekt / Tätigkeit
              </th>
              {weekDays.map((dayISO, i) => {
                const d = addDays(weekStart, i);
                const isToday = dayISO === todayISO;
                const isWeekend = i >= 5;
                return (
                  <th
                    key={dayISO}
                    className={`text-center px-2 py-2 font-medium ${isToday ? 'text-accent-primary' : isWeekend ? 'text-gray-400 dark:text-dark-400/70' : 'text-gray-600 dark:text-dark-400'}`}
                    style={{ minWidth: 70 }}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-[10px] font-normal">{formatDayShort(d)}</div>
                  </th>
                );
              })}
              <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-dark-400" style={{ minWidth: 80 }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {weekData.rowMetas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-400 dark:text-dark-400">
                  Keine Einträge in dieser Woche. Klick auf „Zeile hinzufügen" um zu starten.
                </td>
              </tr>
            )}
            {weekData.rowMetas.map(row => {
              const isDraftOnly = !weekData.data.has(row.rowKey);
              let rowTotal = 0;
              for (const dayISO of weekDays) {
                rowTotal += weekData.data.get(row.rowKey)?.get(dayISO)?.totalSeconds ?? 0;
              }
              return (
                <tr key={row.rowKey} className="border-b border-gray-100 dark:border-dark-border/50 hover:bg-gray-50 dark:hover:bg-dark-200/30">
                  <td className="px-3 py-2 sticky left-0 bg-white dark:bg-dark-100 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      {row.customer && (
                        <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: row.customer.color }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {row.customer?.name ?? '—'} {row.project && `· ${row.project.name}`}
                        </div>
                        {row.activity && (
                          <div className="text-xs text-accent-primary truncate">{row.activity.name}</div>
                        )}
                      </div>
                      {isDraftOnly && (
                        <button
                          onClick={() => removeDraftRow(row.rowKey)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 flex-shrink-0"
                          title="Leere Zeile entfernen"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  {weekDays.map((dayISO, i) => {
                    const cell = weekData.data.get(row.rowKey)?.get(dayISO);
                    const seconds = cell?.totalSeconds ?? 0;
                    const entryCount = cell?.entries.length ?? 0;
                    const isLocked = entryCount > 1;
                    const isEditing = editingCell?.rowKey === row.rowKey && editingCell?.dayISO === dayISO;
                    const isWeekend = i >= 5;
                    const isToday = dayISO === todayISO;

                    const breakdown = isLocked
                      ? `${entryCount} Einträge: ${cell!.entries.map(e => formatHoursDecimalAlways(e.duration)).join(' + ')} h. Bearbeiten in Einträge/Kalender.`
                      : '';

                    return (
                      <td
                        key={dayISO}
                        className={`px-1 py-1 text-center ${isWeekend ? 'bg-gray-50/50 dark:bg-dark-200/20' : ''} ${isToday ? 'bg-accent-primary/5' : ''}`}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editBuffer}
                            onChange={(e) => setEditBuffer(e.target.value)}
                            onBlur={() => void commitEdit()}
                            onKeyDown={handleInputKeyDown}
                            placeholder="0.00"
                            className="w-full text-center bg-white dark:bg-dark-50 border border-accent-primary rounded px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary"
                          />
                        ) : isLocked ? (
                          <div
                            title={breakdown}
                            className="w-full px-1 py-1 rounded bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 text-xs cursor-not-allowed inline-flex items-center justify-center gap-1"
                          >
                            <Lock size={10} />
                            <span className="font-medium">{formatHoursDecimalAlways(seconds)}</span>
                            <span className="text-[9px] opacity-70">×{entryCount}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => openCell(row.rowKey, dayISO, seconds, false)}
                            className={`w-full px-1 py-1 rounded text-sm transition-colors hover:bg-accent-primary/10 ${
                              seconds > 0 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-300 dark:text-dark-400/60'
                            }`}
                          >
                            {seconds > 0 ? formatHoursDecimalAlways(seconds) : '–'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-semibold text-accent-primary">
                    {rowTotal > 0 ? formatHoursDecimalAlways(rowTotal) : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {weekData.rowMetas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-200/50">
                <td className="px-3 py-2 font-semibold text-gray-700 dark:text-dark-500 sticky left-0 bg-gray-50 dark:bg-dark-200/50 z-10">
                  Tages-Total
                </td>
                {dailyTotals.map((sec, i) => (
                  <td key={i} className="px-1 py-2 text-center font-semibold text-gray-700 dark:text-dark-500">
                    {sec > 0 ? formatHoursDecimalAlways(sec) : '–'}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold text-accent-primary text-base">
                  {formatHoursDecimalAlways(grandTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add-Row Modal */}
      {addRowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddRowOpen(false)}>
          <div className="bg-white dark:bg-dark-100 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Zeile hinzufügen</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Kunde</label>
                <select
                  value={draftCustomerId}
                  onChange={(e) => { setDraftCustomerId(e.target.value); setDraftProjectId(''); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <option value="">— Kunde wählen —</option>
                  {sortedCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Projekt</label>
                <select
                  value={draftProjectId}
                  onChange={(e) => setDraftProjectId(e.target.value)}
                  disabled={!draftCustomerId}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
                >
                  <option value="">— Projekt wählen —</option>
                  {projectsForCustomer.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Tätigkeit (optional)</label>
                <select
                  value={draftActivityId}
                  onChange={(e) => setDraftActivityId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <option value="">— Keine Tätigkeit —</option>
                  {sortedActivities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button onClick={() => setAddRowOpen(false)} variant="secondary">Abbrechen</Button>
              <Button onClick={addDraftRow} variant="primary">Hinzufügen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
