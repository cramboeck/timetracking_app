import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, History, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { entriesApi, TimeEntryChange, TimeEntryChangeSnapshot } from '../services/api';

/**
 * Berichte → „Nachträge" (nur Admin/Owner): Protokoll aller rückwirkenden
 * Zeiteintrags-Mutationen — Anlage, Änderung oder Löschung von Einträgen,
 * deren Datum in einem abgeschlossenen Monat liegt. Die Admins werden bei
 * jeder Mutation zusätzlich per E-Mail informiert; hier ist die Übersicht
 * mit Vorher/Nachher-Werten.
 */

const ACTION_META: Record<TimeEntryChange['action'], { label: string; icon: typeof Plus; classes: string }> = {
  create: { label: 'Nachgetragen', icon: Plus, classes: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  update: { label: 'Geändert', icon: Pencil, classes: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  delete: { label: 'Gelöscht', icon: Trash2, classes: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

const fmtDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')} h`;
};

const fmtTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

/** Kompakte Vorher→Nachher-Zeile nur für tatsächlich geänderte Felder. */
const DiffRows = ({ before, after }: { before: TimeEntryChangeSnapshot | null; after: TimeEntryChangeSnapshot | null }) => {
  const rows: { label: string; from: string; to: string }[] = [];
  const push = (label: string, from: string, to: string) => {
    if (from !== to) rows.push({ label, from, to });
  };

  push('Dauer', fmtDuration(before?.duration), fmtDuration(after?.duration));
  push('Beginn', fmtTime(before?.startTime), fmtTime(after?.startTime));
  push('Ende', fmtTime(before?.endTime), fmtTime(after?.endTime));
  push('Beschreibung', before?.description || '—', after?.description || '—');
  push('Abrechenbar', before?.isBillable === null || before?.isBillable === undefined ? '—' : before.isBillable ? 'Ja' : 'Nein',
    after?.isBillable === null || after?.isBillable === undefined ? '—' : after.isBillable ? 'Ja' : 'Nein');

  if (rows.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {rows.map(r => (
        <p key={r.label} className="text-xs text-gray-500 dark:text-dark-400">
          <span className="font-medium">{r.label}:</span>{' '}
          {before && after ? (
            <>
              <span className="line-through opacity-70">{r.from}</span>
              {' → '}
              <span className="text-gray-700 dark:text-dark-500">{r.to}</span>
            </>
          ) : (
            <span className="text-gray-700 dark:text-dark-500">{before ? r.from : r.to}</span>
          )}
        </p>
      ))}
    </div>
  );
};

export const TimeEntryChangeLog = () => {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['entries', 'changes', page],
    queryFn: async () => entriesApi.getChanges({ page, limit: 50 }),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-accent-primary" size={22} />
      </div>
    );
  }

  const changes = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm mt-6">
      <div className="flex items-center gap-2 mb-1">
        <History size={18} className="text-accent-primary" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nachtrags-Protokoll</h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">
        Alle rückwirkenden Zeiteintrags-Änderungen (Datum in einem abgeschlossenen Monat).
        Bei jeder Änderung werden die Admins zusätzlich per E-Mail informiert.
      </p>

      {changes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400 py-4 text-center bg-gray-50 dark:bg-dark-50 rounded-xl">
          Keine rückwirkenden Änderungen protokolliert.
        </p>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            {changes.map(change => {
              const meta = ACTION_META[change.action];
              const Icon = meta.icon;
              return (
                <div key={change.id} className="p-3 bg-gray-50/50 dark:bg-dark-50/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.classes}`}>
                      <Icon size={12} />
                      {meta.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {change.userName || 'Unbekannt'}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      Eintrag vom {new Date(change.entryDate).toLocaleDateString('de-DE')}
                    </span>
                    <span className="ml-auto text-xs text-gray-400 dark:text-dark-400 whitespace-nowrap">
                      {new Date(change.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <DiffRows before={change.beforeData} after={change.afterData} />
                </div>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-dark-400 disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Zurück
              </button>
              <span className="text-sm text-gray-500 dark:text-dark-400">
                Seite {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pagination.totalPages}
                className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-dark-400 disabled:opacity-40"
              >
                Weiter <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
