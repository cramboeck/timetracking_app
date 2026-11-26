import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Phone, Mail, Globe, LifeBuoy, LogIn, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Auth } from '../Auth';
import { assetToolsApi, type PublicLabelInfo } from '../../services/api';
import { devicePath } from '../AreaNavigation';
import logoLight from '../../logo/logo-ramboeck-light.png';
import logoDark from '../../logo/logo-ramboeck-dark.png';

/** sessionStorage-Key: Etikett, das nach einem SSO-Login geöffnet werden soll (App.tsx). */
export const OPEN_LABEL_KEY = 'rbf_open_label';

/**
 * Ziel hinter dem QR-Code auf dem Geräte-Etikett (/l/<token>).
 *
 * - Eingeloggter Techniker → direkt das Gerät in der App.
 * - Alle anderen (Kunde, Finder) → öffentliche Seite mit Asset-ID, Support-
 *   Kontakt und „Problem melden“ (Kundenportal mit vorausgewähltem Gerät).
 *   Gerätedaten zeigt diese Seite bewusst NICHT — das Etikett klebt sichtbar.
 */
export const LabelLanding = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [info, setInfo] = useState<PublicLabelInfo | null | undefined>(undefined);
  const [showLogin, setShowLogin] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Techniker: Etikett → Gerät
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    setResolving(true);
    assetToolsApi.byLabel(token)
      .then(r => {
        try { sessionStorage.removeItem(OPEN_LABEL_KEY); } catch { /* ignore */ }
        if (!cancelled) navigate(devicePath(r.data.id), { replace: true });
      })
      .catch(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, token, navigate]);

  // Öffentliche Infos (immer laden — auch als Fallback, wenn das Gerät nicht zur eigenen Organisation gehört)
  useEffect(() => {
    assetToolsApi.publicLabel(token).then(setInfo).catch(() => setInfo(null));
  }, [token]);

  if (isLoading || resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-primary" />
      </div>
    );
  }

  if (showLogin && !isAuthenticated) return <Auth />;

  const support = info?.support;
  const startLogin = () => {
    try { sessionStorage.setItem(OPEN_LABEL_KEY, `${Date.now()}|${token}`); } catch { /* ignore */ }
    setShowLogin(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center">
          <img src={logoLight} alt="" className="h-10 dark:hidden" />
          <img src={logoDark} alt="" className="h-10 hidden dark:block" />
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 p-5 shadow-sm text-center">
          {info === undefined ? (
            <div className="py-6 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>
          ) : info === null ? (
            <>
              <p className="font-semibold text-gray-900 dark:text-white">Etikett unbekannt</p>
              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                Dieses Etikett ist keinem Gerät (mehr) zugeordnet.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary/10 text-accent-primary px-3 py-1 text-sm font-semibold font-mono">
                <Tag size={14} /> {info.assetTag ?? 'Gerät'}
              </div>
              <p className="mt-3 text-gray-900 dark:text-white font-semibold">
                Probleme mit diesem Gerät?
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                Melden Sie es direkt im Kundenportal – das Gerät ist dann schon ausgewählt.
              </p>
              <a href={info.portalTicketUrl}
                className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-accent-primary text-white font-medium px-4 py-3 hover:bg-accent-dark">
                <LifeBuoy size={18} /> Problem melden
              </a>
              {(support?.phone || support?.email || support?.website) && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border space-y-2 text-sm">
                  {support?.name && <p className="text-gray-500 dark:text-dark-400">{support.name}</p>}
                  {support?.phone && (
                    <a href={`tel:${support.phone.replace(/[^\d+]/g, '')}`} className="flex items-center justify-center gap-2 text-gray-900 dark:text-white hover:text-accent-primary">
                      <Phone size={15} /> {support.phone}
                    </a>
                  )}
                  {support?.email && (
                    <a href={`mailto:${support.email}?subject=${encodeURIComponent(`Gerät ${info.assetTag ?? ''}`.trim())}`}
                      className="flex items-center justify-center gap-2 text-gray-900 dark:text-white hover:text-accent-primary break-all">
                      <Mail size={15} /> {support.email}
                    </a>
                  )}
                  {support?.website && (
                    <a href={/^https?:\/\//.test(support.website) ? support.website : `https://${support.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-gray-900 dark:text-white hover:text-accent-primary">
                      <Globe size={15} /> {support.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!isAuthenticated && (
          <button type="button" onClick={startLogin}
            className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-dark-400 hover:text-accent-primary py-2">
            <LogIn size={15} /> Als Techniker anmelden
          </button>
        )}
      </div>
    </div>
  );
};
