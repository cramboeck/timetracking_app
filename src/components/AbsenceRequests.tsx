import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Palmtree, Thermometer, Star, Clock } from 'lucide-react';
import { absenceRequestsApi, AbsenceRequest, AbsenceCategory } from '../services/api';
import { useToast, useConfirm } from '../contexts/UIContext';
import { Button } from './ui/Button';

/**
 * Mein Bereich → Abwesenheit: Urlaubsanträge stellen und verfolgen.
 * Genehmigte Anträge erzeugen automatisch die Abwesenheits-Einträge,
 * die im Kalender darunter und im Arbeitszeitkonto erscheinen.
 */

const CATEGORY_OPTIONS: Array<{ value: AbsenceCategory; label: string; icon: typeof Palmtree }> = [
  { value: 'vacation', label: 'Urlaub', icon: Palmtree },
  { value: 'sick', label: 'Krankheit', icon: Thermometer },
  { value: 'special_leave', label: 'Sonderurlaub', icon: Star },
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Offen', className: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  approved: { label: 'Genehmigt', className: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  cancelled: { label: 'Zurückgezogen', className: 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400' },
};

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const AbsenceRequests = () => {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<AbsenceCategory>('vacation');
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [note, setNote] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['absenceRequests', 'mine'],
    queryFn: async () => (await absenceRequestsApi.listMine()).data,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => absenceRequestsApi.create({ category, startDate, endDate, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absenceRequests'] });
      setShowForm(false);
      setNote('');
      showToast('Antrag eingereicht — dein Admin wurde benachrichtigt', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Antrag fehlgeschlagen', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => absenceRequestsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absenceRequests'] });
      showToast('Antrag zurückgezogen', 'success');
    },
    onError: (err: any) => showToast(err?.message || 'Zurückziehen fehlgeschlagen', 'error'),
  });

  const handleCancel = async (r: AbsenceRequest) => {
    const ok = await confirm({
      title: 'Antrag zurückziehen?',
      message: `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)} wird zurückgezogen.`,
      variant: 'warning',
    });
    if (ok) cancelMutation.mutate(r.id);
  };

  const requests = requestsQuery.data ?? [];

  return (
    <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Abwesenheitsanträge</h3>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm" icon={<Plus size={16} />}>
            Urlaub beantragen
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border space-y-3">
          <div className="flex gap-2">
            {CATEGORY_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  category === value
                    ? 'bg-accent-primary text-white'
                    : 'bg-white dark:bg-dark-200 text-gray-600 dark:text-dark-400 border border-gray-200 dark:border-dark-border'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Von</label>
              <input
                type="date"
                value={startDate}
                min={category === 'vacation' ? today : undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Bis</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">Notiz (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="z.B. Familienfeier"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !startDate || !endDate}
              size="sm"
              icon={createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : undefined}
            >
              Antrag einreichen
            </Button>
            <Button onClick={() => setShowForm(false)} variant="ghost" size="sm">
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {requestsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-accent-primary" size={20} />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400 py-2">
          Noch keine Anträge gestellt.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {requests.map(r => {
            const cat = CATEGORY_OPTIONS.find(c => c.value === r.category);
            const badge = STATUS_BADGES[r.status] || STATUS_BADGES.pending;
            const Icon = cat?.icon || Clock;
            return (
              <div key={r.id} className="py-2.5 flex items-center gap-3">
                <Icon size={18} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {cat?.label} · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                  </p>
                  {(r.note || r.decisionNote) && (
                    <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                      {r.status === 'rejected' && r.decisionNote ? `Begründung: ${r.decisionNote}` : r.note}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                {r.status === 'pending' && (
                  <button
                    onClick={() => handleCancel(r)}
                    disabled={cancelMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                    title="Antrag zurückziehen"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
