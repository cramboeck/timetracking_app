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
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent(SW_NEED_REFRESH_EVENT, {
          // updateSW(true) aktiviert den wartenden SW und lädt die Seite neu
          detail: { update: () => updateSW(true) },
        })
      );
    },
  });
}
