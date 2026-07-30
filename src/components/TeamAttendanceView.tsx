import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { workSessionsApi, WorkSession } from '../services/api';
import { Button } from './ui/Button';

/**
 * Admin-Auswertung der Arbeitszeiterfassung (Kommen/Gehen/Pausen) pro
 * Teammitglied und Tag. Erreichbar unter Berichte → „Arbeitszeit"
 * (nur Admin/Owner — Backend erzwingt requireOrgRole('admin')).
 */

const fmtHours = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

const fmtTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';

interface DayRow {
  key: string;
  userName: string;
  workDate: string;
  firstStart: string;
  lastEnd: string | null;
  breakSeconds: number;
  netSeconds: number;
  open: boolean; // noch eingestempelt
}

const startOfWeek = (): string => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
};

export const TeamAttendanceView = () => {
  const [from, setFrom] = useState(startOfWeek);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const teamQuery = useQuery({
    queryKey: ['workSessions', 'team', from, to],
    queryFn: async () => (await workSessionsApi.listTeam(from, to)).data,
    staleTime: 60_000,
  });

  // Sessions pro User+Tag zu einer Zeile aggregieren
  const rows: DayRow[] = useMemo(() => {
    const byKey = new Map<string, WorkSession[]>();
    for (const s of teamQuery.data ?? []) {
      const key = `${s.userId}|${s.workDate}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(s);
    }
    const now = Date.now();
    const result: DayRow[] = [];
    for (const [key, sessions] of byKey) {
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      let breakSum = 0;
      let net = 0;
      let open = false;
      for (const s of sessions) {
        const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
        const runningBreak = s.breakStartedAt ? Math.max(0, (now - new Date(s.breakStartedAt).getTime()) / 1000) : 0;
        const gross = Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
        breakSum += s.breakSeconds + runningBreak;
        net += Math.max(0, gross - s.breakSeconds - runningBreak);
        if (!s.endedAt) open = true;
      }
      const last = sessions[sessions.length - 1];
      result.push({
        key,
        userName: sessions[0].userName || sessions[0].userId,
        workDate: sessions[0].workDate,
        firstStart: sessions[0].startedAt,
        lastEnd: open ? null : last.endedAt,
        breakSeconds: Math.round(breakSum),
        netSeconds: Math.round(net),
        open,
      });
    }
    return result.sort((a, b) => b.workDate.localeCompare(a.workDate) || a.userName.localeCompare(b.userName));
  }, [teamQuery.data]);

  const exportCSV = () => {
    const header = ['Datum', 'Mitarbeiter', 'Beginn', 'Ende', 'Pause (Std)', 'Arbeitszeit (Std)'];
    const lines = rows.map(r => [
      r.workDate,
      r.userName,
      fmtTime(r.firstStart),
      r.open ? 'läuft' : fmtTime(r.lastEnd),
      (r.breakSeconds / 3600).toFixed(2),
      (r.netSeconds / 3600).toFixed(2),
    ]);
    const csv = [header.join(';'), ...lines.map(l => l.join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `arbeitszeiten_${from}_${to}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Zeitraum + Export */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Von</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Bis</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <Button onClick={exportCSV} variant="secondary" size="sm" icon={<Download size={16} />} disabled={rows.length === 0}>
          CSV-Export
        </Button>
      </div>

      {teamQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-accent-primary" size={24} />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-10 bg-gray-50 dark:bg-dark-100 rounded-xl">
          Keine Arbeitszeiten im gewählten Zeitraum
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-dark-border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-100 text-left text-gray-500 dark:text-dark-400">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Mitarbeiter</th>
                <th className="px-3 py-2 font-medium">Beginn</th>
                <th className="px-3 py-2 font-medium">Ende</th>
                <th className="px-3 py-2 font-medium text-right">Pause</th>
                <th className="px-3 py-2 font-medium text-right">Arbeitszeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {rows.map(r => {
                const noBreakWarning = r.netSeconds > 6 * 3600 && r.breakSeconds < 30 * 60;
                const overTen = r.netSeconds > 10 * 3600;
                return (
                  <tr key={r.key} className="bg-white dark:bg-dark-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                      {new Date(r.workDate + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{r.userName}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(r.firstStart)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.open ? <span className="text-green-600 dark:text-green-400 font-medium">läuft</span> : fmtTime(r.lastEnd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.breakSeconds)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      overTen ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                    }`}>
                      <span className="inline-flex items-center gap-1">
                        {(noBreakWarning || overTen) && <AlertTriangle size={14} className={overTen ? 'text-red-500' : 'text-amber-500'} />}
                        {fmtHours(r.netSeconds)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-dark-400">
        ⚠︎ = über 6 h ohne 30 Min. Pause bzw. über 10 h Arbeitszeit (ArbZG). Zeiten aus der Stempeluhr (Kommen/Gehen/Pausen).
      </p>
    </div>
  );
};
