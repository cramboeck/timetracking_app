import { registerSW } from 'virtual:pwa-register';

/**
 * Service-Worker-Registrierung im prompt-Modus: Wenn nach einem Deploy ein
 * neuer SW bereitsteht, feuern wir ein Event — die UpdateBanner-Komponente
 * zeigt dann „Neue Version verfügbar" mit Reload-Button. Vorher (autoUpdate)
 * liefen offene PWA-Tabs nach Deploys tagelang auf dem alten Build weiter.
 */
export const SW_NEED_REFRESH_EVENT = 'rbf-sw-need-refresh';

export function setupPwaUpdates(): void {
  const updateSW = registerSW({
    // Offene Tabs/PWA-Fenster erfahren von einem Deploy sonst erst bei der
    // nächsten Navigation bzw. nach dem 24h-Browser-Check — stündlich nachsehen.
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent(SW_NEED_REFRESH_EVENT, {
          detail: {
            update: () => {
              // updateSW(true) schickt nur SKIP_WAITING; den Reload macht
              // vite-plugin-pwa erst bei „controlling" MIT isUpdate=true.
              // Wurde der neue SW von einem ANDEREN Tab/PWA-Fenster
              // installiert (external) oder wartet keiner mehr, bleibt der
              // Klick dadurch wirkungslos. Deshalb: Reload selbst absichern —
              // controllerchange deckt den SW-Wechsel ab, der Timer den Fall
              // ganz ohne Wechsel (index.html ist no-store, ein Reload holt
              // immer den aktuellen Build).
              let reloaded = false;
              const reload = () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              };
              navigator.serviceWorker?.addEventListener('controllerchange', reload);
              setTimeout(reload, 3000);
              Promise.resolve(updateSW(true)).catch(reload);
            },
          },
        })
      );
    },
  });
}
