import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle, Scale, Clock3, Palmtree, Thermometer } from 'lucide-react';
import { workSessionsApi, userApi, WorkSession } from '../services/api';
import { TimeEntry } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceBar } from './AttendanceBar';
import { Button } from './ui/Button';

/**
 * Mein Bereich → Arbeitszeit: persönliches Arbeitszeitkonto.
 * Soll (aus Wochenstunden im Profil) vs. Ist (Stempeluhr + anerkannte
 * Abwesenheiten) mit Überstunden-Saldo, Monats-Tagesliste und
 * Stundenzettel-Export (CSV).
 */

interface WorkTimeAccountProps {
  entries: TimeEntry[]; // für Abwesenheits-Tage (entryScope === 'absence')
}

const fmtH = (seconds: number, signed = false): string => {
  const sign = seconds < 0 ? '-' : signed ? '+' : '';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs % 3600) / 60);
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
};

const fmtClock = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';

const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
};

const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ABSENCE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  special_leave: 'Sonderurlaub',
};

export const WorkTimeAccount = ({ entries }: WorkTimeAccountProps) => {
  const { currentUser } = useAuth();
  // Lokaler Override nach Inline-Änderung (AuthContext lädt erst beim
  // nächsten App-Start neu; gespeichert wird sofort via userApi)
  const [weeklyHoursOverride, setWeeklyHoursOverride] = useState<number | null>(null);
  const [editingHours, setEditingHours] = useState(false);
  const weeklyHours = weeklyHoursOverride ?? (Number(currentUser?.weeklyHours) || 40);
  const dailySeconds = (weeklyHours / 5) * 3600;

  const saveWeeklyHours = async (value: number) => {
    const clamped = Math.min(80, Math.max(0, value));
    setWeeklyHoursOverride(clamped);
    setEditingHours(false);
    try {
      await userApi.updateSettings({ weeklyHours: clamped });
    } catch (err) {
      console.error('Wochenstunden speichern fehlgeschlagen:', err);
    }
  };

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  const sessionsQuery = useQuery({
    queryKey: ['workSessions', 'month', month],
    queryFn: async () => (await workSessionsApi.list(monthStart, monthEnd)).data,
    staleTime: 60_000,
  });

  // Abwesenheits-Tage des Monats aus den Zeiteinträgen (voller Tag = Soll erfüllt)
  const absenceByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.entryScope !== 'absence') continue;
      const date = e.startTime.slice(0, 10);
      if (date >= monthStart && date <= monthEnd) {
        map.set(date, e.internalCategory || 'vacation');
      }
    }
    return map;
  }, [entries, monthStart, monthEnd]);

  const account = useMemo(() => {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // Sessions pro Tag aggregieren
    const byDate = new Map<string, WorkSession[]>();
    for (const s of sessionsQuery.data ?? []) {
      if (!byDate.has(s.workDate)) byDate.set(s.workDate, []);
      byDate.get(s.workDate)!.push(s);
    }

    interface DayRow {
      date: string;
      weekday: number;
      firstStart: string | null;
      lastEnd: string | null;
      breakSum: number;
      netSum: number;
      absence: string | null;
      open: boolean;
      target: number;
    }

    const rows: DayRow[] = [];
    let ist = 0;
    let soll = 0;
    let vacationDays = 0;
    let sickDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const weekday = new Date(y, m - 1, d).getDay(); // 0=So
      const isWorkday = weekday >= 1 && weekday <= 5;
      const absence = absenceByDate.get(date) || null;
      const sessions = (byDate.get(date) || []).sort((a, b) => a.startedAt.localeCompare(b.startedAt));

      let breakSum = 0;
      let netSum = 0;
      let open = false;
      for (const s of sessions) {
        const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
        const runningBreak = s.breakStartedAt ? Math.max(0, (now - new Date(s.breakStartedAt).getTime()) / 1000) : 0;
        const gross = Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
        breakSum += s.breakSeconds + runningBreak;
        netSum += Math.max(0, gross - s.breakSeconds - runningBreak);
        if (!s.endedAt) open = true;
      }

      // Soll nur für Werktage, und im laufenden Monat nur bis heute
      const target = isWorkday && (!isCurrentMonth || date <= today) ? dailySeconds : 0;
      soll += target;

      // Abwesenheit an Werktagen zählt als erfülltes Soll
      if (absence && isWorkday) {
        ist += dailySeconds;
        if (absence === 'sick') sickDays++;
        else vacationDays++;
      }
      ist += netSum;

      if (sessions.length > 0 || absence || isWorkday) {
        rows.push({
          date,
          weekday,
          firstStart: sessions[0]?.startedAt ?? null,
          lastEnd: open ? null : (sessions[sessions.length - 1]?.endedAt ?? null),
          breakSum: Math.round(breakSum),
          netSum: Math.round(netSum),
          absence,
          open,
          target,
        });
      }
    }

    return { rows, ist: Math.round(ist), soll: Math.round(soll), saldo: Math.round(ist - soll), vacationDays, sickDays };
  }, [sessionsQuery.data, absenceByDate, month, y, m, daysInMonth, dailySeconds, isCurrentMonth]);

  const exportCSV = () => {
    const header = ['Datum', 'Beginn', 'Ende', 'Pause (Std)', 'Arbeitszeit (Std)', 'Soll (Std)', 'Abwesenheit'];
    const lines = account.rows.map(r => [
      r.date,
      fmtClock(r.firstStart),
      r.open ? 'läuft' : fmtClock(r.lastEnd),
      (r.breakSum / 3600).toFixed(2),
      (r.netSum / 3600).toFixed(2),
      (r.target / 3600).toFixed(2),
      r.absence ? (ABSENCE_LABELS[r.absence] || r.absence) : '',
    ]);
    lines.push([]);
    lines.push(['Soll gesamt', (account.soll / 3600).toFixed(2)]);
    lines.push(['Ist gesamt', (account.ist / 3600).toFixed(2)]);
    lines.push(['Saldo', (account.saldo / 3600).toFixed(2)]);
    const csv = [header.join(';'), ...lines.map(l => l.join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stundenzettel_${month}.csv`;
    link.click();
  };

  const cards = [
    { label: 'Soll', value: fmtH(account.soll), icon: Scale, className: 'text-gray-900 dark:text-white' },
    { label: 'Ist', value: fmtH(account.ist), icon: Clock3, className: 'text-gray-900 dark:text-white' },
    {
      label: 'Saldo',
      value: fmtH(account.saldo, true),
      icon: Scale,
      className: account.saldo >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
    },
    { label: 'Urlaub', value: `${account.vacationDays} Tag${account.vacationDays === 1 ? '' : 'e'}`, icon: Palmtree, className: 'text-gray-900 dark:text-white' },
    { label: 'Krank', value: `${account.sickDays} Tag${account.sickDays === 1 ? '' : 'e'}`, icon: Thermometer, className: 'text-gray-900 dark:text-white' },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Stempeluhr */}
      <AttendanceBar />

      {/* Kopf: Monat + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-gray-50 dark:bg-dark-100 rounded-lg p-1 border border-gray-200 dark:border-dark-border">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-md text-gray-600 dark:text-dark-400 hover:bg-white dark:hover:bg-dark-200" aria-label="Vormonat">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-gray-800 dark:text-white">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-md text-gray-600 dark:text-dark-400 enabled:hover:bg-white dark:enabled:hover:bg-dark-200 disabled:opacity-40"
            aria-label="Folgemonat"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {editingHours ? (
            <input
              type="number"
              step="0.5"
              min="0"
              max="80"
              defaultValue={weeklyHours}
              autoFocus
              onBlur={(e) => saveWeeklyHours(parseFloat(e.target.value) || weeklyHours)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-20 px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            />
          ) : (
            <button
              onClick={() => setEditingHours(true)}
              className="text-xs text-gray-500 dark:text-dark-400 hover:text-accent-primary underline decoration-dotted underline-offset-2"
              title="Wochenstunden ändern"
            >
              Soll: {weeklyHours} h/Woche
            </button>
          )}
          <Button onClick={exportCSV} variant="secondary" size="sm" icon={<Download size={16} />}>
            Stundenzettel (CSV)
          </Button>
        </div>
      </div>

      {/* Konto-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map(({ label, value, icon: Icon, className }) => (
          <div key={label} className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-400 mb-1">
              <Icon size={14} /> {label}
            </div>
            <div className={`text-lg font-bold tabular-nums ${className}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tagesliste */}
      {sessionsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-accent-primary" size={24} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-dark-border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-100 text-left text-gray-500 dark:text-dark-400">
              <tr>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 font-medium">Beginn</th>
                <th className="px-3 py-2 font-medium">Ende</th>
                <th className="px-3 py-2 font-medium text-right">Pause</th>
                <th className="px-3 py-2 font-medium text-right">Ist</th>
                <th className="px-3 py-2 font-medium text-right">Soll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {account.rows.map(r => {
                const missing = r.target > 0 && !r.absence && r.netSum === 0 && !r.open;
                const noBreakWarning = r.netSum > 6 * 3600 && r.breakSum < 30 * 60;
                return (
                  <tr key={r.date} className={r.weekday === 0 || r.weekday === 6 ? 'bg-gray-50/60 dark:bg-dark-100/40' : 'bg-white dark:bg-dark-50'}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    {r.absence ? (
                      <td colSpan={4} className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-medium ${
                          r.absence === 'sick'
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        }`}>
                          {r.absence === 'sick' ? <Thermometer size={12} /> : <Palmtree size={12} />}
                          {ABSENCE_LABELS[r.absence] || r.absence}
                        </span>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-dark-400">{fmtClock(r.firstStart)}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-dark-400">
                          {r.open ? <span className="text-green-600 dark:text-green-400 font-medium">läuft</span> : fmtClock(r.lastEnd)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-right text-gray-600 dark:text-dark-400">
                          <span className="inline-flex items-center gap-1">
                            {noBreakWarning && <AlertTriangle size={13} className="text-amber-500" />}
                            {r.breakSum > 0 ? fmtH(r.breakSum) : '—'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 tabular-nums text-right font-semibold ${
                          missing ? 'text-red-500' : 'text-gray-900 dark:text-white'
                        }`}>
                          {r.netSum > 0 ? fmtH(r.netSum) : missing ? 'fehlt' : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 tabular-nums text-right text-gray-400 dark:text-dark-400">
                      {r.target > 0 ? fmtH(r.target) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-dark-400">
        Urlaub/Krankheit an Werktagen zählen als erfülltes Tagessoll. Soll im laufenden Monat bis heute gerechnet.
        Wochenstunden änderbar in den Einstellungen.
      </p>
    </div>
  );
};
