import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Loader2 } from 'lucide-react';
import { organizationsApi } from '../services/api';
import { useToast } from '../contexts/UIContext';

/**
 * GPS-Stempelung (Roadmap A6): Org-weiter Schalter, Default AUS.
 * Erfasst wird die Position ausschließlich im Moment des Ein-/Ausstempelns
 * (kein Tracking). Der Server verwirft Koordinaten, solange der Schalter
 * aus ist — der Client kann das nicht umgehen.
 */
export const GpsStampingSettings = () => {
  const showToast = useToast();
  const queryClient = useQueryClient();

  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: async () => (await organizationsApi.getCurrent()).data,
    staleTime: 60_000,
  });

  const org = orgQuery.data;
  const enabled = org?.settings?.gpsStamping === true;
  const canEdit = org?.user_role === 'owner' || org?.user_role === 'admin';

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (!org) throw new Error('Organisation nicht geladen');
      return organizationsApi.update(org.id, {
        settings: { ...(org.settings || {}), gpsStamping: next },
      });
    },
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: ['org', 'current'] });
      showToast(next ? 'GPS-Stempelung aktiviert' : 'GPS-Stempelung deaktiviert');
    },
    onError: (err: Error) => showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error'),
  });

  if (!org) return null;

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 bg-accent-light dark:bg-accent-primary/20 rounded-xl shrink-0">
            <MapPin size={22} className="text-accent-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              GPS-Stempelung
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
              Erfasst beim Ein- und Ausstempeln die Position — ausschließlich im
              Stempel-Moment, kein Tracking. Gestempelt wird immer, auch wenn der
              Browser keinen Standort liefert oder die Berechtigung fehlt.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Hinweis: Standortdaten von Mitarbeitenden sind mitbestimmungs- und
              datenschutzrelevant (Zweckbindung Arbeitszeitnachweis). Jedes
              Teammitglied sieht die eigenen erfassten Positionen unter
              „Mein Bereich“ — Transparenz ist Teil des Konzepts.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!canEdit || toggle.isPending}
          onClick={() => toggle.mutate(!enabled)}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
            enabled ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-dark-300'
          } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={canEdit ? undefined : 'Nur Admins/Owner können das ändern'}
        >
          {toggle.isPending ? (
            <Loader2 size={14} className="absolute top-1.5 left-1/2 -translate-x-1/2 animate-spin text-white" />
          ) : (
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
};
