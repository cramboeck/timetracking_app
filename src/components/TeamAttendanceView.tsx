import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, AlertTriangle, Plus, Pencil, Trash2, X } from 'lucide-react';
import { workSessionsApi, organizationsApi, WorkSession } from '../services/api';
import { Button } from './ui/Button';
import { useToast, useConfirm } from '../contexts/UIContext';

// 24h-Eingabe: "8", "830", "0830" oder "8:30" -> "08:30"
const isValidTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
const normalizeTimeInput = (raw: string): string => {
  const v = raw.trim().replace(/[.,;]/g, ':');
  if (!v) return '';
  let h = NaN; let m = NaN;
  if (v.includes(':')) {
    const [hs, ms] = v.split(':');
    h = parseInt(hs, 10); m = ms === '' ? 0 : parseInt(ms, 10);
  } else if (/^\d+$/.test(v)) {
    if (v.length <= 2) { h = parseInt(v, 10); m = 0; }
    else if (v.length === 3) { h = parseInt(v.slice(0, 1), 10); m = parseInt(v.slice(1), 10); }
    else { h = parseInt(v.slice(0, 2), 10); m = parseInt(v.slice(2, 4), 10); }
  }
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return raw;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const toIso = (dateISO: string, time: string) => new Date(`${dateISO}T${time}`).toISOString();

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
  userId: string;
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
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [from, setFrom] = useState(startOfWeek);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const teamQuery = useQuery({
    queryKey: ['workSessions', 'team', from, to],
    queryFn: async () => (await workSessionsApi.listTeam(from, to)).data,
    staleTime: 60_000,
  });

  // Mitglieder für das Nachtragen (auch solche ohne bisherige Stempelzeiten)
  const membersQuery = useQuery({
    queryKey: ['org', 'members'],
    queryFn: async () => {
      const org = (await organizationsApi.getCurrent()).data;
      return (await organizationsApi.getMembers(org.id)).data;
    },
    staleTime: 5 * 60_000,
  });

  // Nachtragen-Modal
  const [showCreate, setShowCreate] = useState(false);
  const [cUserId, setCUserId] = useState('');
  const [cDate, setCDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cStart, setCStart] = useState('08:00');
  const [cEnd, setCEnd] = useState('17:00');
  const [cBreak, setCBreak] = useState('30');
  const [cNote, setCNote] = useState('');

  // Korrektur-Modal: Sessions eines User-Tags
  const [editKey, setEditKey] = useState<string | null>(null); // `${userId}|${workDate}`
  const [editBuffers, setEditBuffers] = useState<Record<string, { start: string; end: string; breakMin: string }>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workSessions'] });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!cUserId) throw new Error('Bitte Mitarbeiter wählen');
      if (!isValidTime(cStart) || !isValidTime(cEnd)) throw new Error('Ungültige Zeitangabe');
      return workSessionsApi.adminCreate({
        userId: cUserId,
        workDate: cDate,
        startedAt: toIso(cDate, cStart),
        endedAt: toIso(cDate, cEnd),
        breakMinutes: parseInt(cBreak, 10) || 0,
        note: cNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setCNote('');
      showToast('Arbeitszeit nachgetragen', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Nachtragen fehlgeschlagen', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ session, buffer }: { session: WorkSession; buffer: { start: string; end: string; breakMin: string } }) => {
      if (!isValidTime(buffer.start)) throw new Error('Ungültiger Beginn');
      const endedAt = buffer.end.trim() === '' ? null : (isValidTime(buffer.end) ? toIso(session.workDate, buffer.end) : undefined);
      if (endedAt === undefined) throw new Error('Ungültiges Ende');
      return workSessionsApi.adminUpdate(session.id, {
        startedAt: toIso(session.workDate, buffer.start),
        endedAt,
        breakMinutes: parseInt(buffer.breakMin, 10) || 0,
      });
    },
    onSuccess: () => { invalidate(); showToast('Arbeitszeit korrigiert', 'success'); },
    onError: (err: any) => showToast(err?.message || 'Korrektur fehlgeschlagen', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workSessionsApi.adminDelete(id),
    onSuccess: () => { invalidate(); showToast('Arbeitszeit gelöscht', 'success'); },
    onError: (err: any) => showToast(err?.message || 'Löschen fehlgeschlagen', 'error'),
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
        userId: sessions[0].userId,
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
        <Button onClick={() => setShowCreate(true)} variant="primary" size="sm" icon={<Plus size={16} />}>
          Nachtragen
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
                <th className="px-3 py-2 w-10"></th>
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
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => { setEditKey(r.key); setEditBuffers({}); }}
                        title="Stempelzeiten korrigieren"
                        className="p-1.5 rounded text-gray-400 hover:text-accent-primary hover:bg-accent-primary/10 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
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
        Korrekturen nur durch Admins — jede Änderung wird im Audit-Log mit Vorher/Nachher-Werten protokolliert.
      </p>

      {/* Nachtragen-Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Arbeitszeit nachtragen</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Mitarbeiter *</label>
                <select
                  value={cUserId}
                  onChange={(e) => setCUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">— wählen —</option>
                  {(membersQuery.data ?? []).map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name || m.username}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Datum *</label>
                <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Beginn *</label>
                  <input type="text" inputMode="numeric" value={cStart}
                    onChange={(e) => setCStart(e.target.value)}
                    onBlur={(e) => setCStart(normalizeTimeInput(e.target.value))}
                    placeholder="08:00"
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm text-center tabular-nums ${cStart && !isValidTime(cStart) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Ende *</label>
                  <input type="text" inputMode="numeric" value={cEnd}
                    onChange={(e) => setCEnd(e.target.value)}
                    onBlur={(e) => setCEnd(normalizeTimeInput(e.target.value))}
                    placeholder="17:00"
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm text-center tabular-nums ${cEnd && !isValidTime(cEnd) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Pause (Min)</label>
                  <input type="number" min={0} max={1440} value={cBreak}
                    onChange={(e) => setCBreak(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm text-center tabular-nums" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Notiz (optional)</label>
                <input type="text" value={cNote} onChange={(e) => setCNote(e.target.value)} maxLength={500}
                  placeholder="z.B. Einstempeln vergessen"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button onClick={() => setShowCreate(false)} variant="secondary">Abbrechen</Button>
              <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} variant="primary"
                disabled={!cUserId || !isValidTime(cStart) || !isValidTime(cEnd)}>
                Nachtragen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Korrektur-Modal: alle Sessions eines User-Tags */}
      {editKey && (() => {
        const [editUserId, editDate] = editKey.split('|');
        const daySessions = (teamQuery.data ?? [])
          .filter(sess => sess.userId === editUserId && sess.workDate === editDate)
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        const userName = daySessions[0]?.userName || editUserId;
        const dayLabel = new Date(editDate + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
        const bufferFor = (sess: WorkSession) => editBuffers[sess.id] ?? {
          start: fmtTime(sess.startedAt),
          end: sess.endedAt ? fmtTime(sess.endedAt) : '',
          breakMin: String(Math.round(sess.breakSeconds / 60)),
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditKey(null)}>
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Stempelzeiten korrigieren</h3>
                <button onClick={() => setEditKey(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={20} /></button>
              </div>
              <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">{userName} — {dayLabel}</p>
              {daySessions.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Keine Stempelzeiten an diesem Tag.</p>
              ) : (
                <div className="space-y-3">
                  {daySessions.map(sess => {
                    const buf = bufferFor(sess);
                    const setBuf = (patch: Partial<typeof buf>) =>
                      setEditBuffers(prev => ({ ...prev, [sess.id]: { ...bufferFor(sess), ...patch } }));
                    return (
                      <div key={sess.id} className="flex items-end gap-2 rounded-lg border border-gray-200 dark:border-dark-border p-3">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Beginn</label>
                          <input type="text" inputMode="numeric" value={buf.start}
                            onChange={(e) => setBuf({ start: e.target.value })}
                            onBlur={(e) => setBuf({ start: normalizeTimeInput(e.target.value) })}
                            className={`w-full px-2 py-1.5 border rounded text-sm text-center tabular-nums bg-white dark:bg-dark-50 text-gray-900 dark:text-white ${buf.start && !isValidTime(buf.start) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Ende {!sess.endedAt && <span className="text-green-600">(läuft)</span>}</label>
                          <input type="text" inputMode="numeric" value={buf.end}
                            onChange={(e) => setBuf({ end: e.target.value })}
                            onBlur={(e) => setBuf({ end: e.target.value.trim() === '' ? '' : normalizeTimeInput(e.target.value) })}
                            placeholder="offen"
                            className={`w-full px-2 py-1.5 border rounded text-sm text-center tabular-nums bg-white dark:bg-dark-50 text-gray-900 dark:text-white ${buf.end && !isValidTime(buf.end) ? 'border-red-400' : 'border-gray-300 dark:border-dark-border'}`} />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Pause</label>
                          <input type="number" min={0} value={buf.breakMin}
                            onChange={(e) => setBuf({ breakMin: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-dark-border rounded text-sm text-center tabular-nums bg-white dark:bg-dark-50 text-gray-900 dark:text-white" />
                        </div>
                        <Button
                          onClick={() => updateMutation.mutate({ session: sess, buffer: buf })}
                          loading={updateMutation.isPending}
                          variant="primary" size="sm"
                          disabled={!isValidTime(buf.start) || (buf.end !== '' && !isValidTime(buf.end))}
                        >
                          Speichern
                        </Button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Stempelzeit löschen?',
                              message: `Block ${fmtTime(sess.startedAt)}–${sess.endedAt ? fmtTime(sess.endedAt) : 'offen'} von ${userName} wirklich löschen?`,
                              variant: 'danger',
                              confirmText: 'Löschen',
                            });
                            if (ok) deleteMutation.mutate(sess.id);
                          }}
                          title="Löschen"
                          className="p-2 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-dark-400 mt-3">
                Leeres Ende = Session bleibt offen. Änderungen werden im Audit-Log protokolliert.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
