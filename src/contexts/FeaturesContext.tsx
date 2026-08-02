import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { featuresApi, UserFeatures } from '../services/api';
import { useAuth } from './AuthContext';

interface FeaturesContextType {
  features: UserFeatures | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  hasFeature: (feature: keyof UserFeatures) => boolean;
  hasPackage: (packageName: 'support' | 'business') => boolean;
}

const defaultFeatures: UserFeatures = {
  core: true,
  timeTracking: true,
  support: false,
  business: false,
  tickets: false,
  devices: false,
  alerts: false,
  billing: false,
  dashboardAdvanced: false,
  packages: [],
};

// Letzter bekannter Stand pro Browser: verhindert das "Module fehlen"-
// Flackern beim Login und überbrückt fehlgeschlagene Erst-Requests, bis
// der Retry durch ist. Rein kosmetisch — die Backend-Routen prüfen die
// Pakete ohnehin serverseitig.
const CACHE_KEY = 'ramboflow_features_cache';

const readFeaturesCache = (): UserFeatures | undefined => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserFeatures) : undefined;
  } catch {
    return undefined;
  }
};

const FeaturesContext = createContext<FeaturesContextType>({
  features: defaultFeatures,
  loading: true,
  error: null,
  refetch: async () => {},
  hasFeature: () => false,
  hasPackage: () => false,
});

export const useFeatures = () => useContext(FeaturesContext);

interface FeaturesProviderProps {
  children: ReactNode;
}

export const FeaturesProvider = ({ children }: FeaturesProviderProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // TanStack Query statt Hand-Fetch: Der alte Context fiel bei EINEM
  // fehlgeschlagenen /features-Request (z.B. Race mit dem Token-Refresh
  // beim Session-Restore) dauerhaft auf "keine Pakete" zurück — Support/
  // CRM/Finanzen verschwanden dann bis zum nächsten manuellen Reload.
  // Jetzt: 3 Retries mit Backoff, Refetch bei Fokus/Reconnect, und der
  // letzte bekannte Stand als Platzhalter.
  const query = useQuery({
    queryKey: ['features'],
    queryFn: async () => {
      const response = await featuresApi.getFeatures();
      if (!response.success) throw new Error('Features konnten nicht geladen werden');
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10_000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: readFeaturesCache,
  });

  // Erfolgreich geladene Features als letzten bekannten Stand sichern
  useEffect(() => {
    if (query.data) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(query.data));
      } catch {
        // Quota/Private-Mode — Cache ist optional
      }
    }
  }, [query.data]);

  // Beim Logout Cache + Query-Daten verwerfen (nächster User am selben
  // Browser soll nicht kurz die fremden Module als Platzhalter sehen)
  useEffect(() => {
    if (!isAuthenticated) {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // ignore
      }
      queryClient.removeQueries({ queryKey: ['features'] });
    }
  }, [isAuthenticated, queryClient]);

  const features = isAuthenticated ? (query.data ?? null) : defaultFeatures;

  const hasFeature = (feature: keyof UserFeatures): boolean => {
    if (!features) return false;
    const value = features[feature];
    return typeof value === 'boolean' ? value : false;
  };

  const hasPackage = (packageName: 'support' | 'business'): boolean => {
    if (!features) return false;
    return features[packageName] === true;
  };

  const refetch = async () => {
    await query.refetch();
  };

  return (
    <FeaturesContext.Provider
      value={{
        features,
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
        refetch,
        hasFeature,
        hasPackage,
      }}
    >
      {children}
    </FeaturesContext.Provider>
  );
};
