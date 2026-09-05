import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, Coffee, Play, AlertTriangle, ChevronDown, History, ClipboardList, X } from 'lucide-react';
import { workSessionsApi, entriesApi, WorkSession } from '../services/api';
import { useToast } from '../contexts/UIContext';

// Toleranz für den Ausstempel-Abgleich: unter 15 Min. nicht zugeordneter
// Zeit wird nicht nachgefragt
const UNASSIGNED_TOLERANCE_SECONDS = 15 * 60;

// Muss zur Liste in ManualEntryModern/Stopwatch passen
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

/**
 * Arbeitszeit-Stempelleiste (Kommen/Gehen/Pause) — sichtbar im Bereich
 * „Arbeiten". Getrennt von der Projektzeiterfassung: hier wird die
 * gesetzliche Arbeitszeit (Beginn/Ende/Pausen) dokumentiert.
 *
 * Warnungen: >6h ohne 30 Min. Pause (ArbZG §4) und >10h Arbeitszeit.
 */

const fmt = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

// Netto-Arbeitszeit einer Session in Sekunden (abzüglich Pausen, inkl. laufender Pause)
const netSeconds = (s: WorkSession, now: number): number => {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
  const gross = Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
  const runningBreak = s.breakStartedAt ? Math.max(0, (now - new Date(s.breakStartedAt).getTime()) / 1000) : 0;
  return Math.max(0, gross - s.breakSeconds - runningBreak);
};

const breakSecondsTotal = (s: WorkSession, now: number): number => {
  const running = s.breakStartedAt ? Math.max(0, (now - new Date(s.breakStartedAt).getTime()) / 1000) : 0;
  return s.breakSeconds + running;
};

export const AttendanceBar = () => {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  // Ausstempel-Abgleich: Dialog-State (null = zu)
  const [clockOutCheck, setClockOutCheck] = useState<{ unassignedSeconds: number } | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const [internalCategory, setInternalCategory] = useState('internal_support');
  const [bookingInternal, setBookingInternal] = useState(false);

  const currentQuery = useQuery({
    queryKey: ['workSessions', 'current'],
    queryFn: async () => (await workSessionsApi.getCurrent()).data,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayQuery = useQuery({
    queryKey: ['workSessions', 'day', today],
    queryFn: async () => (await workSessionsApi.list(today, today)).data,
    staleTime: 60_000,
  });

  const session = currentQuery.data ?? null;
  const isRunning = !!session;
  const onBreak = !!session?.breakStartedAt;

  // Abdeckung heute: Anwesenheit vs. erfasste Projekt-/interne Zeiten
  const coverageQuery = useQuery({
    queryKey: ['workSessions', 'coverage', today],
    queryFn: async () => (await workSessionsApi.getCoverage(today, today)).data[0] ?? null,
    staleTime: 30_000,
    refetchInterval: isRunning ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
  const coverage = coverageQuery.data ?? null;

  // Aufklappbare Historie: eigene Arbeitszeiten der letzten 14 Tage
  const [showHistory, setShowHistory] = useState(false);
  const historyFrom = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const historyQuery = useQuery({
    queryKey: ['workSessions', 'history', historyFrom],
    queryFn: async () => (await workSessionsApi.list(historyFrom, today)).data,
    enabled: showHistory,
    staleTime: 60_000,
  });

  // Ticker nur bei laufender Session
  useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workSessions'] });
  };

  const mutationOpts = (errorFallback: string) => ({
    onSuccess: invalidate,
    onError: (err: any) => showToast(err?.message || errorFallback, 'error'),
  });

  const clockIn = useMutation({ mutationFn: () => workSessionsApi.clockIn(), ...mutationOpts('Einstempeln fehlgeschlagen') });
  const clockOut = useMutation({ mutationFn: () => workSessionsApi.clockOut(), ...mutationOpts('Ausstempeln fehlgeschlagen') });

  // Ausstempeln mit Abgleich: erst frische Abdeckung holen — liegt mehr als
  // die Toleranz an nicht zugeordneter Zeit vor, fragt ein Dialog nach,
  // statt kommentarlos auszustempeln.
  const handleClockOut = async () => {
    try {
      setCheckingCoverage(true);
      const fresh = (await workSessionsApi.getCoverage(today, today)).data[0];
      const unassigned = fresh?.unassignedSeconds ?? 0;
      if (unassigned > UNASSIGNED_TOLERANCE_SECONDS) {
        setClockOutCheck({ unassignedSeconds: unassigned });
        return;
      }
    } catch {
      // Abgleich darf das Ausstempeln nie blockieren
    } finally {
      setCheckingCoverage(false);
    }
    clockOut.mutate();
  };

  // Option „Als interne Zeit buchen": Eintrag über die nicht zugeordnete
  // Dauer anlegen (endet jetzt), dann ausstempeln
  const bookUnassignedAsInternal = async () => {
    if (!clockOutCheck) return;
    try {
      setBookingInternal(true);
      const end = new Date();
      const start = new Date(end.getTime() - clockOutCheck.unassignedSeconds * 1000);
      await entriesApi.create({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration: clockOutCheck.unassignedSeconds,
        projectId: null,
        description: 'Nachtrag beim Ausstempeln',
        isRunning: false,
        isBillable: false,
        entryScope: 'internal',
        internalCategory,
        customerVisibility: 'hidden',
      } as any);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      setClockOutCheck(null);
      clockOut.mutate();
    } catch (err: any) {
      showToast(err?.message || 'Interne Zeit konnte nicht gebucht werden', 'error');
    } finally {
      setBookingInternal(false);
    }
  };
  const startBreak = useMutation({ mutationFn: () => workSessionsApi.startBreak(), ...mutationOpts('Pause starten fehlgeschlagen') });
  const endBreak = useMutation({ mutationFn: () => workSessionsApi.endBreak(), ...mutationOpts('Pause beenden fehlgeschlagen') });
  const pending = clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  // Tages-Summen: abgeschlossene Sessions von heute + laufende Session
  const closedToday = (todayQuery.data ?? []).filter(s => s.endedAt);
  const daySeconds = closedToday.reduce((sum, s) => sum + netSeconds(s, now), 0) + (session ? netSeconds(session, now) : 0);
  const dayBreak = closedToday.reduce((sum, s) => sum + s.breakSeconds, 0) + (session ? breakSecondsTotal(session, now) : 0);

  const needsBreakWarning = isRunning && daySeconds > 6 * 3600 && dayBreak < 30 * 60;
  const overTenHours = daySeconds > 10 * 3600;

  // Historie pro Tag aggregieren (mehrere Stempel-Blöcke → eine Zeile)
  const historyRows = (() => {
    const byDate = new Map<string, WorkSession[]>();
    for (const ws of historyQuery.data ?? []) {
      if (!byDate.has(ws.workDate)) byDate.set(ws.workDate, []);
      byDate.get(ws.workDate)!.push(ws);
    }
    return Array.from(byDate.entries())
      .map(([date, sessions]) => {
        sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        const open = sessions.some(ws => !ws.endedAt);
        return {
          date,
          firstStart: sessions[0].startedAt,
          lastEnd: open ? null : sessions[sessions.length - 1].endedAt,
          breakSum: sessions.reduce((sum, ws) => sum + breakSecondsTotal(ws, now), 0),
          netSum: sessions.reduce((sum, ws) => sum + netSeconds(ws, now), 0),
          open,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  })();

  const fmtClock = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl">
    <div className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3">
      {/* Status + Zeiten */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          !isRunning ? 'bg-gray-300 dark:bg-dark-300' : onBreak ? 'bg-amber-400' : 'bg-green-500 animate-pulse'
        }`} />
        <div className="text-sm">
          <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
            Arbeitszeit {fmt(daySeconds)} h
          </span>
          <span className="text-gray-500 dark:text-dark-400 ml-2 tabular-nums">
            Pause {fmt(dayBreak)} h
          </span>
          {onBreak && (
            <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">Pause läuft</span>
          )}
        </div>
      </div>

      {/* Warnungen */}
      {(needsBreakWarning || overTenHours) && (
        <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${
          overTenHours
            ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
        }`}>
          <AlertTriangle size={14} />
          {overTenHours ? 'Über 10 h Arbeitszeit!' : 'Über 6 h — Pause einlegen (min. 30 Min.)'}
        </div>
      )}

      {/* Aktionen */}
      <div className="flex items-center gap-2 ml-auto">
        {!isRunning ? (
          <button
            onClick={() => clockIn.mutate()}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
          >
            <LogIn size={16} /> Einstempeln
          </button>
        ) : (
          <>
            {onBreak ? (
              <button
                onClick={() => endBreak.mutate()}
                disabled={pending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent-primary hover:opacity-90 text-white transition-colors disabled:opacity-50"
              >
                <Play size={16} /> Weiterarbeiten
              </button>
            ) : (
              <button
                onClick={() => startBreak.mutate()}
                disabled={pending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
              >
                <Coffee size={16} /> Pause
              </button>
            )}
            <button
              onClick={handleClockOut}
              disabled={pending || checkingCoverage}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-700 hover:bg-gray-800 dark:bg-dark-300 dark:hover:bg-dark-400 text-white transition-colors disabled:opacity-50"
            >
              <LogOut size={16} /> Ausstempeln
            </button>
          </>
        )}
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 dark:text-dark-400 hover:text-accent-primary rounded-lg transition-colors"
          title="Meine Arbeitszeiten der letzten 14 Tage"
        >
          <History size={16} />
          <ChevronDown size={14} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
        </button>
      </div>
      </div>

      {/* Abdeckung: Anwesenheit vs. erfasste Zeiten (heute) */}
      {coverage && coverage.attendanceSeconds > 0 && (() => {
        const pct = Math.min(100, Math.round((coverage.recordedSeconds / Math.max(1, coverage.attendanceSeconds)) * 100));
        const hasGap = coverage.unassignedSeconds > UNASSIGNED_TOLERANCE_SECONDS;
        return (
          <div className="border-t border-gray-100 dark:border-dark-border px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex-1 min-w-[120px] h-2 bg-gray-100 dark:bg-dark-200 rounded overflow-hidden">
              <div
                className={`h-full rounded ${hasGap ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-dark-400 tabular-nums">
              Erfasst {fmt(coverage.recordedSeconds)} h von {fmt(coverage.attendanceSeconds)} h
            </span>
            {hasGap ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                {fmt(coverage.unassignedSeconds)} h nicht zugeordnet
              </span>
            ) : (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Alles zugeordnet
              </span>
            )}
          </div>
        );
      })()}

      {/* Meine Arbeitszeiten (letzte 14 Tage) */}
      {showHistory && (
        <div className="border-t border-gray-100 dark:border-dark-border px-3 sm:px-4 py-2">
          {historyQuery.isLoading ? (
            <p className="text-sm text-gray-400 py-2">Lade…</p>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Noch keine Arbeitszeiten erfasst.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 dark:text-dark-400">
                  <th className="py-1 font-medium">Tag</th>
                  <th className="py-1 font-medium">Beginn</th>
                  <th className="py-1 font-medium">Ende</th>
                  <th className="py-1 font-medium text-right">Pause</th>
                  <th className="py-1 font-medium text-right">Arbeitszeit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-dark-border/50">
                {historyRows.map(r => (
                  <tr key={r.date}>
                    <td className="py-1.5 text-gray-900 dark:text-white whitespace-nowrap">
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="py-1.5 tabular-nums text-gray-600 dark:text-dark-400">{fmtClock(r.firstStart)}</td>
                    <td className="py-1.5 tabular-nums text-gray-600 dark:text-dark-400">
                      {r.open ? <span className="text-green-600 dark:text-green-400">läuft</span> : fmtClock(r.lastEnd)}
                    </td>
                    <td className="py-1.5 tabular-nums text-right text-gray-600 dark:text-dark-400">{fmt(r.breakSum)}</td>
                    <td className="py-1.5 tabular-nums text-right font-semibold text-gray-900 dark:text-white">{fmt(r.netSum)} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ausstempel-Abgleich: nicht zugeordnete Zeit nachtragen? */}
      {clockOutCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setClockOutCheck(null)} />
          <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <ClipboardList size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Zeiten unvollständig</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      {fmt(clockOutCheck.unassignedSeconds)} h
                    </span>{' '}
                    deiner heutigen Arbeitszeit sind keinem Projekt oder einer internen Kategorie zugeordnet.
                  </p>
                </div>
              </div>
              <button onClick={() => setClockOutCheck(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <button
                onClick={() => { setClockOutCheck(null); navigate('/arbeiten/manual'); }}
                className="w-full px-4 py-2.5 rounded-lg bg-accent-primary text-white font-medium hover:opacity-90"
              >
                Jetzt nachtragen (bleibt eingestempelt)
              </button>

              <div className="flex items-center gap-2">
                <select
                  value={internalCategory}
                  onChange={(e) => setInternalCategory(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-sm text-gray-900 dark:text-white"
                >
                  {INTERNAL_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <button
                  onClick={bookUnassignedAsInternal}
                  disabled={bookingInternal}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-800 dark:bg-dark-300 dark:hover:bg-dark-400 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {bookingInternal ? 'Bucht…' : 'Als intern buchen'}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-dark-400 -mt-1">
                Bucht die nicht zugeordnete Zeit als internen Eintrag und stempelt dich aus.
              </p>

              <button
                onClick={() => { setClockOutCheck(null); clockOut.mutate(); }}
                className="w-full px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-white"
              >
                Trotzdem ausstempeln
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
