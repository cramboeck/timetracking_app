import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, Coffee, Play, AlertTriangle } from 'lucide-react';
import { workSessionsApi, WorkSession } from '../services/api';
import { useToast } from '../contexts/UIContext';

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
  const [now, setNow] = useState(() => Date.now());

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
  const startBreak = useMutation({ mutationFn: () => workSessionsApi.startBreak(), ...mutationOpts('Pause starten fehlgeschlagen') });
  const endBreak = useMutation({ mutationFn: () => workSessionsApi.endBreak(), ...mutationOpts('Pause beenden fehlgeschlagen') });
  const pending = clockIn.isPending || clockOut.isPending || startBreak.isPending || endBreak.isPending;

  // Tages-Summen: abgeschlossene Sessions von heute + laufende Session
  const closedToday = (todayQuery.data ?? []).filter(s => s.endedAt);
  const daySeconds = closedToday.reduce((sum, s) => sum + netSeconds(s, now), 0) + (session ? netSeconds(session, now) : 0);
  const dayBreak = closedToday.reduce((sum, s) => sum + s.breakSeconds, 0) + (session ? breakSecondsTotal(session, now) : 0);

  const needsBreakWarning = isRunning && daySeconds > 6 * 3600 && dayBreak < 30 * 60;
  const overTenHours = daySeconds > 10 * 3600;

  return (
    <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3">
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
              onClick={() => clockOut.mutate()}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-700 hover:bg-gray-800 dark:bg-dark-300 dark:hover:bg-dark-400 text-white transition-colors disabled:opacity-50"
            >
              <LogOut size={16} /> Ausstempeln
            </button>
          </>
        )}
      </div>
    </div>
  );
};
