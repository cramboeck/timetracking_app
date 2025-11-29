import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  const [features, setFeatures] = useState<UserFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = async () => {
    if (!isAuthenticated) {
      setFeatures(defaultFeatures);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await featuresApi.getFeatures();
      if (response.success) {
        setFeatures(response.data);
      } else {
        // If no features found, use defaults
        setFeatures(defaultFeatures);
      }
    } catch (err: any) {
      console.error('Failed to fetch features:', err);
      setError(err.message);
      // Use defaults on error
      setFeatures(defaultFeatures);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, [isAuthenticated]);

  const hasFeature = (feature: keyof UserFeatures): boolean => {
    if (!features) return false;
    const value = features[feature];
    return typeof value === 'boolean' ? value : false;
  };

  const hasPackage = (packageName: 'support' | 'business'): boolean => {
    if (!features) return false;
    return features[packageName] === true;
  };

  return (
    <FeaturesContext.Provider
      value={{
        features,
        loading,
        error,
        refetch: fetchFeatures,
        hasFeature,
        hasPackage,
      }}
    >
      {children}
    </FeaturesContext.Provider>
  );
};
