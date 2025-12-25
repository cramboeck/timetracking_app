import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect online/offline status
 * Returns current status and provides manual check capability
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  const handleOnline = useCallback(() => {
    console.log('🌐 [NETWORK] Back online');
    setIsOnline(true);
    if (!navigator.onLine) return; // Double check
    setWasOffline(true);
    // Reset wasOffline after a delay (for showing "back online" message)
    setTimeout(() => setWasOffline(false), 5000);
  }, []);

  const handleOffline = useCallback(() => {
    console.log('📴 [NETWORK] Gone offline');
    setIsOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline };
}
