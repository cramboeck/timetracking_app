import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Loader2, Palmtree, Thermometer, Star } from 'lucide-react';
import { absenceRequestsApi, AbsenceRequest } from '../services/api';
import { useToast, useConfirm } from '../contexts/UIContext';

/**
 * Berichte → Anträge (Admin): offene Abwesenheitsanträge genehmigen oder
 * ablehnen. Genehmigung erzeugt automatisch die Abwesenheits-Einträge des
 * Mitarbeiters; der Antragsteller wird per E-Mail informiert.
 */

const CATEGORY_META: Record<string, { label: string; icon: typeof Palmtree }> = {
  vacation: { label: 'Urlaub', icon: Palmtree },
  sick: { label: 'Krankheit', icon: Thermometer },
  special_leave: { label: 'Sonderurlaub', icon: Star },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Offen', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Genehmigt', className: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  cancelled: { label: 'Zurückgezogen', className: 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400' },
};

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const AbsenceRequestApprovals = () => {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const teamQuery = useQuery({
    queryKey: ['absenceRequests', 'team'],
    queryFn: async () => (await absenceRequestsApi.listTeam()).data,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['absenceRequests'] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => absenceRequestsApi.approve(id),
    onSuccess: (res) => {
      invalidate();
      showToast(`Genehmigt — ${res.data.createdEntries} Abwesenheitstag(e) eingetragen`, 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Genehmigung fehlgeschlagen', 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => absenceRequestsApi.reject(id, note),
    onSuccess: () => {
      invalidate();
      setRejectingId(null);
      setRejectNote('');
      showToast('Antrag abgelehnt — Mitarbeiter wurde informiert', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Ablehnung fehlgeschlagen', 'error'),
  });

  const handleApprove = async (r: AbsenceRequest) => {
    const ok = await confirm({
      title: 'Antrag genehmigen?',
      message: `${r.userName}: ${CATEGORY_META[r.category]?.label} ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}. Die Abwesenheitstage werden automatisch eingetragen.`,
    });
    if (ok) approveMutation.mutate(r.id);
  };

  const requests = teamQuery.data ?? [];
  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending').slice(0, 20);

  if (teamQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-accent-primary" size={24} />
      </div>
    );
  }

  const renderRow = (r: AbsenceRequest, withActions: boolean) => {
    const meta = CATEGORY_META[r.category];
    const Icon = meta?.icon || Palmtree;
    const badge = STATUS_BADGES[r.status];
    return (
      <div key={r.id} className="py-3 flex flex-wrap items-center gap-3">
        <Icon size={18} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {r.userName} · {meta?.label} · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
          </p>
          {r.note && <p className="text-xs text-gray-500 dark:text-dark-400">Notiz: {r.note}</p>}
          {r.decisionNote && r.status !== 'pending' && (
            <p className="text-xs text-gray-500 dark:text-dark-400">Kommentar: {r.decisionNote}</p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${badge.className}`}>{badge.label}</span>
        {withActions && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApprove(r)}
              disabled={approveMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
            >
              <Check size={15} /> Genehmigen
            </button>
            <button
              onClick={() => { setRejectingId(rejectingId === r.id ? null : r.id); setRejectNote(''); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            >
              <X size={15} /> Ablehnen
            </button>
          </div>
        )}
        {withActions && rejectingId === r.id && (
          <div className="w-full flex gap-2 pl-8">
            <input
              type="text"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Begründung (optional, wird dem Mitarbeiter mitgeteilt)"
              maxLength={1000}
              autoFocus
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
            />
            <button
              onClick={() => rejectMutation.mutate({ id: r.id, note: rejectNote || undefined })}
              disabled={rejectMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
            >
              Ablehnung bestätigen
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-500 mb-1">
          Offene Anträge ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dark-400 py-4 text-center bg-gray-50 dark:bg-dark-100 rounded-xl">
            Keine offenen Anträge 🎉
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-border bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl px-4">
            {pending.map(r => renderRow(r, true))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-500 mb-1">Zuletzt entschieden</h3>
          <div className="divide-y divide-gray-100 dark:divide-dark-border bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl px-4">
            {decided.map(r => renderRow(r, false))}
          </div>
        </div>
      )}
    </div>
  );
};
