import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { SW_NEED_REFRESH_EVENT } from '../pwa';

/**
 * Globales „Neue Version verfügbar"-Banner (auch auf dem Login-Screen).
 * Erscheint, wenn der Service Worker nach einem Deploy eine neue App-Version
 * bereithält; „Jetzt aktualisieren" aktiviert sie und lädt die Seite neu.
 */
export const UpdateBanner = () => {
  const [update, setUpdate] = useState<(() => void) | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ update: () => void }>).detail;
      if (detail?.update) {
        setUpdate(() => detail.update);
        setDismissed(false);
      }
    };
    window.addEventListener(SW_NEED_REFRESH_EVENT, handler);
    return () => window.removeEventListener(SW_NEED_REFRESH_EVENT, handler);
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 shadow-lg px-4 py-3">
        <RefreshCw size={18} className={`text-accent-primary flex-shrink-0 ${updating ? 'animate-spin' : ''}`} />
        <p className="flex-1 text-sm text-gray-800 dark:text-white min-w-0">
          Neue Version verfügbar
        </p>
        <button
          type="button"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            update();
          }}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {updating ? 'Aktualisiere…' : 'Jetzt aktualisieren'}
        </button>
        {!updating && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Später"
            className="flex-shrink-0 p-1 rounded-md text-gray-400 dark:text-dark-400 hover:text-gray-600 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
