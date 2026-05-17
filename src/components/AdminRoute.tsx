import { useAuth } from '../contexts/AuthContext';
import { Auth } from './Auth';
import AdminPortal from './AdminPortal';
import { Loader2 } from 'lucide-react';

/**
 * Wrapper component for the admin route
 * Shows login if not authenticated, then AdminPortal (which handles admin check)
 */
export default function AdminRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-50">
        <Loader2 className="animate-spin text-purple-600" size={48} />
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Auth />;
  }

  // Show admin portal (it handles the admin role check internally)
  return <AdminPortal />;
}
