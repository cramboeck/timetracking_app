import { useEffect, useState } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

/**
 * Tracks the desktop sidebar's collapsed state. The actual toggle happens
 * inside DesktopSidebar (which writes to localStorage and dispatches a
 * `sidebar-toggle` event); this hook listens to both and exposes the boolean
 * so the App layout can adjust its left margin.
 */
export function useSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) {
        setCollapsed(e.newValue === 'true');
      }
    };

    const handleSidebarToggle = () => {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sidebar-toggle', handleSidebarToggle);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-toggle', handleSidebarToggle);
    };
  }, []);

  return collapsed;
}
