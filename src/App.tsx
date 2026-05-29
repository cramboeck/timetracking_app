import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { AreaNavigation, SubView } from './components/AreaNavigation';
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './components/DesktopSidebar';
// Core components loaded eagerly (always visible / needed on first render)
import { Stopwatch } from './components/Stopwatch';
import { ManualEntryModern } from './components/ManualEntryModern';
import { TimeViews } from './components/TimeViews';
import { DashboardOverview } from './components/DashboardOverview';
import { CustomerHub } from './components/CustomerHub';
import { Settings } from './components/Settings';
import { Tickets } from './components/Tickets';
import { Finanzen } from './components/Finanzen';
import { DevicesView } from './components/DevicesView';
import { AlertsView } from './components/AlertsView';
import MaintenanceView from './components/MaintenanceView';
import TaskHub from './components/TaskHub';
import Contracts from './components/Contracts';
import SalesPipeline from './components/SalesPipeline';
import Leads from './components/Leads';
import { CRMDashboard } from './components/CRMDashboard';
import { InvoiceInbox } from './components/InvoiceInbox';
import { SupportInbox } from './components/SupportInbox';
import { SocialMediaProvider } from './features/social-media/context';
import SocialMediaLayout from './features/social-media/SocialMediaLayout';
import AdminPortal from './components/AdminPortal';
import { ReportsPage } from './components/ReportsPage';
import { FloatingActionButton } from './components/FloatingActionButton';
import { GlobalTimerWidget } from './components/GlobalTimerWidget';
import { Auth } from './components/Auth';
import { OfflineBanner } from './components/OfflineBanner';
import { ForgottenTimerBanner } from './components/ForgottenTimerBanner';
import { NotificationPermissionRequest } from './components/NotificationPermissionRequest';
import { WelcomeModal } from './components/WelcomeModal';
import { CookieConsent } from './components/CookieConsent';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { CommandPalette } from './components/CommandPalette';
import { TimeEntry, Customer, Project, Activity, Ticket } from './types';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './contexts/UIContext';
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed';
import { useCurrentNavigation } from './hooks/useCurrentNavigation';
import { useUserPreferences } from './hooks/useUserPreferences';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { useOfflineEntrySync } from './hooks/useOfflineEntrySync';
import { useIsDesktop } from './hooks/useMediaQuery';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { haptics } from './utils/haptics';
import { generateUUID } from './utils/uuid';
import { notificationService } from './utils/notifications';
import { toLocalDateString } from './utils/time';
import { addPendingEntry } from './utils/offlineStorage';
import { projectsApi, customersApi, activitiesApi, entriesApi, organizationsApi, SESSION_EXPIRED_EVENT } from './services/api';

function App() {
  const { currentUser, isAuthenticated, isLoading, updateDarkMode } = useAuth();
  const showToast = useToast();
  const isDesktop = useIsDesktop();
  const { isOnline, wasOffline } = useOnlineStatus();

  // Sidebar collapsed state (driven by DesktopSidebar's localStorage write)
  const sidebarCollapsed = useSidebarCollapsed();

  // URL is the source of truth for navigation. currentArea/currentSubView
  // are *derived* from useLocation, not React state — Pass 4c.
  const {
    currentArea,
    currentSubView,
    navigateToArea,
    navigateToSubView,
    navigateTo,
  } = useCurrentNavigation('arbeiten', 'stopwatch');

  const [entries, setEntries] = useState<TimeEntry[]>([]);

  // Background sync for entries saved locally while offline
  const {
    isSyncing,
    syncError,
    pendingCount,
    failedCount,
    refreshCounts: refreshOfflineCounts,
    syncPendingEntries,
    handleRetryFailedEntry,
    handleDiscardFailedEntry,
  } = useOfflineEntrySync({ isOnline, wasOffline, setEntries });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // Tracks the initial Promise.all() data fetch on app boot so child views
  // can show skeletons instead of misleading "no data" empty states while
  // customers/projects/entries are still in flight.
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [prefilledEntry, setPrefilledEntry] = useState<{ projectId: string; activityId?: string; description: string; ticketId?: string } | null>(null);
  const [showNotificationRequest, setShowNotificationRequest] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [initialTicketId, setInitialTicketId] = useState<string | null>(null);
  const [initialCustomerId, setInitialCustomerId] = useState<string | null>(null);
  // Track entry IDs that are being created to prevent duplicates
  const pendingEntryIdsRef = useRef<Set<string>>(new Set());

  // Cross-area navigation helpers: jump from a Task → its Ticket or Customer.
  const handleOpenTicket = useCallback((ticketId: string) => {
    setInitialTicketId(ticketId);
    navigateTo('support', 'tickets');
  }, [navigateTo]);

  const handleOpenCustomer = useCallback((customerId: string) => {
    setInitialCustomerId(customerId);
    navigateTo('crm', 'customers');
  }, [navigateTo]);

  // Load + persist server-side user preferences (last-used area/subView)
  useUserPreferences({
    currentUser,
    isAuthenticated,
    currentArea,
    currentSubView,
    navigateTo,
  });

  // Load all data from API on mount
  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) return;

      console.log('📦 [DATA] Loading data for user:', currentUser.username);

      try {
        // Load all data from API in parallel
        console.log('📦 [DATA] Fetching all data from API...');
        const [projectsResponse, customersResponse, activitiesResponse, entriesResponse] = await Promise.all([
          projectsApi.getAll(),
          customersApi.getAll(),
          activitiesApi.getAll(),
          entriesApi.getAll()
        ]);

        console.log('✅ [DATA] Projects loaded:', projectsResponse);
        console.log('✅ [DATA] Customers loaded:', customersResponse);
        console.log('✅ [DATA] Activities loaded:', activitiesResponse);
        console.log('✅ [DATA] Entries loaded:', entriesResponse);

        setProjects(projectsResponse.data || []);
        setCustomers(customersResponse.data || []);
        setActivities(activitiesResponse.data || []);
        setEntries(entriesResponse.data || []);

        // Find any running entry
        const running = (entriesResponse.data || []).find(e => e.isRunning);
        if (running) {
          setRunningEntry(running);
        } else {
          // TIMER SAFETY: Check localStorage for backup of running timer
          // This helps recover if the server lost track of the running state
          const RUNNING_TIMER_KEY = 'running_timer_backup';
          try {
            const backupStr = localStorage.getItem(RUNNING_TIMER_KEY);
            if (backupStr) {
              const backup = JSON.parse(backupStr);
              const backupAge = Date.now() - new Date(backup.savedAt).getTime();
              const maxBackupAge = 24 * 60 * 60 * 1000; // 24 hours

              if (backupAge < maxBackupAge && backup.entry?.isRunning) {
                console.log('🔄 [TIMER] Found backup timer in localStorage, recovering...');
                // Check if this entry exists in the loaded entries
                const existingEntry = (entriesResponse.data || []).find(e => e.id === backup.entry.id);
                if (existingEntry && !existingEntry.endTime) {
                  // Entry exists but server doesn't know it's running - resume it
                  const recoveredEntry = { ...existingEntry, isRunning: true };
                  setRunningEntry(recoveredEntry);
                  // Update server
                  entriesApi.update(recoveredEntry.id, recoveredEntry).catch(err => {
                    console.error('❌ [TIMER] Failed to sync recovered timer:', err);
                  });
                  console.log('✅ [TIMER] Timer recovered from backup');
                } else {
                  // Entry doesn't exist or was already completed - clear backup
                  localStorage.removeItem(RUNNING_TIMER_KEY);
                }
              } else {
                // Backup too old - clear it
                localStorage.removeItem(RUNNING_TIMER_KEY);
              }
            }
          } catch (err) {
            console.error('❌ [TIMER] Failed to recover timer from backup:', err);
          }
        }

        // Note: Don't auto-switch to stopwatch view - respect user's saved preference
        console.log('✅ [DATA] All data loaded successfully');
      } catch (error) {
        console.error('❌ [DATA] Error loading data:', error);
      } finally {
        setIsInitialDataLoading(false);
      }
    };

    loadData();
  }, [currentUser]);

  // Refresh entries (used after import)
  const refreshEntries = async () => {
    try {
      console.log('🔄 [DATA] Refreshing time entries...');
      const response = await entriesApi.getAll();
      setEntries(response.data || []);
      console.log('✅ [DATA] Time entries refreshed:', response.data?.length || 0, 'entries');
    } catch (error) {
      console.error('❌ [DATA] Error refreshing entries:', error);
    }
  };

  // Handle pending organization invitation after login
  useEffect(() => {
    const handlePendingInvitation = async () => {
      if (!currentUser || !isAuthenticated) return;

      const pendingInvitation = localStorage.getItem('pending_invitation');
      if (!pendingInvitation) return;

      console.log('📨 [INVITATION] Found pending invitation, accepting...');

      try {
        const response = await organizationsApi.acceptInvitation(pendingInvitation);
        if (response.success) {
          console.log('✅ [INVITATION] Successfully joined organization:', response.message);
          showToast(`Erfolgreich beigetreten: ${response.message}`, 'success');
          // Reload the page to refresh data with new organization context
          window.location.reload();
        }
      } catch (error: any) {
        console.error('❌ [INVITATION] Failed to accept invitation:', error);
        showToast(`Fehler beim Beitreten: ${error.message || 'Unbekannter Fehler'}`, 'error');
      } finally {
        // Always remove the pending invitation
        localStorage.removeItem('pending_invitation');
      }
    };

    handlePendingInvitation();
  }, [currentUser, isAuthenticated]);

  // Show welcome modal for new users
  useEffect(() => {
    if (!currentUser || !isAuthenticated) return;

    // Check if user has seen welcome message
    const hasSeenWelcome = localStorage.getItem(`welcome_shown_${currentUser.id}`);

    if (!hasSeenWelcome) {
      // Show welcome modal immediately
      setShowWelcomeModal(true);

      // Show notification request after welcome modal is closed
      // (will be handled when user closes welcome modal)
    } else {
      // Show notification request after 2 seconds if welcome was already shown
      const timer = setTimeout(() => {
        setShowNotificationRequest(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentUser, isAuthenticated]);

  // Handle privacy policy navigation via hash
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#datenschutz') {
        setShowPrivacyPolicy(true);
        // Remove hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    // Check hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sichtbares Feedback wenn die Session unfreiwillig stirbt. AuthContext
  // killt den User-State (→ Auth-Screen rendert), aber ohne Toast wäre der
  // Sprung auf den Login-Screen unkommentiert. UIProvider rendert Toast oberhalb
  // der Routes, das überlebt das Auth/App-Switching.
  useEffect(() => {
    const handleSessionExpired = () => {
      showToast(
        'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
        'warning',
        6000
      );
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [showToast]);

  // Handle deep link to ticket via ?ticket= URL parameter
  useEffect(() => {
    if (!isAuthenticated) return;

    const urlParams = new URLSearchParams(window.location.search);
    const ticketId = urlParams.get('ticket');

    if (ticketId) {
      console.log('📬 [DEEPLINK] Found ticket ID in URL:', ticketId);
      setInitialTicketId(ticketId);
      navigateTo('support', 'tickets');
      // Clean query param (preserve the pathname useNavigate just set)
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAuthenticated]);

  // Listen for navigation events from components (e.g., SupportInbox navigating to Settings)
  useEffect(() => {
    const handleNavigateToView = (event: Event) => {
      const customEvent = event as CustomEvent<{ subView: SubView; params?: Record<string, string> }>;
      const { subView, params } = customEvent.detail;
      console.log('📬 [NAV] Navigating to view:', subView, params);

      // Navigate to the requested view
      handleSubViewChange(subView);

      // Store params for the target component if needed
      if (params) {
        sessionStorage.setItem('navigation_params', JSON.stringify(params));
      }
    };

    window.addEventListener('navigate-to-view', handleNavigateToView);
    return () => window.removeEventListener('navigate-to-view', handleNavigateToView);
  }, []);

  // Listen for navigation messages from Service Worker (push notification clicks)
  useEffect(() => {
    if (!isAuthenticated || !('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      console.log('📬 [SW Message] Received:', event.data);

      if (event.data?.type === 'NAVIGATE_TO') {
        const url = event.data.url;
        console.log('📬 [SW Message] Navigating to:', url);

        // Handle ticket URLs: /tickets/{id}
        if (url?.startsWith('/tickets/')) {
          const ticketId = url.replace('/tickets/', '').split('?')[0];
          console.log('📬 [SW Message] Opening ticket:', ticketId);
          setInitialTicketId(ticketId);
          navigateTo('support', 'tickets');
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [isAuthenticated]);

  // When welcome modal closes, show notification request
  const handleWelcomeClose = () => {
    setShowWelcomeModal(false);

    // Show notification request after 1 second
    setTimeout(() => {
      setShowNotificationRequest(true);
    }, 1000);
  };

  // Browser Notifications - Check conditions periodically
  useEffect(() => {
    if (!currentUser || !isAuthenticated) return;

    // Check if notifications are supported
    if (!notificationService.isSupported()) {
      return;
    }

    // Function to check all notification conditions
    const checkNotifications = () => {
      const now = new Date();

      // 1. Month-end notification (3 days before)
      if (notificationService.shouldShowMonthEndNotification()) {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = daysInMonth - now.getDate();

        if (notificationService.canShowNotification('month-end', 24)) {
          notificationService.showMonthEndNotification(daysRemaining);
          notificationService.setLastNotificationTime('month-end');
        }
      }

      // 2. Daily reminder (if no entries today)
      const today = toLocalDateString(now);
      const hasEntriesToday = entries.some(e => {
        const entryDate = toLocalDateString(new Date(e.startTime));
        return entryDate === today && !e.isRunning;
      });

      if (notificationService.shouldShowDailyReminder(hasEntriesToday)) {
        if (notificationService.canShowNotification('daily-reminder', 24)) {
          notificationService.showDailyReminder();
          notificationService.setLastNotificationTime('daily-reminder');
        }
      }

      // 3. Quality check (entries without descriptions)
      const entriesWithoutDescription = entries.filter(
        e => !e.isRunning && (!e.description || e.description.trim() === '')
      ).length;

      if (notificationService.shouldShowQualityCheck(entriesWithoutDescription)) {
        if (notificationService.canShowNotification('quality-check', 168)) { // Once per week
          notificationService.showQualityCheckNotification(entriesWithoutDescription);
          notificationService.setLastNotificationTime('quality-check');
        }
      }

      // 4. Weekly report (Friday 16:00-18:00)
      if (notificationService.shouldShowWeeklyReport()) {
        // Calculate total hours this week
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
        weekStart.setHours(0, 0, 0, 0);

        const weekEntries = entries.filter(e => {
          const entryDate = new Date(e.startTime);
          return entryDate >= weekStart && !e.isRunning;
        });

        const totalHours = weekEntries.reduce((sum, e) => sum + (e.duration / 3600), 0);

        if (notificationService.canShowNotification('weekly-report', 168)) { // Once per week
          notificationService.showWeeklyReportNotification(totalHours);
          notificationService.setLastNotificationTime('weekly-report');
        }
      }
    };

    // Check immediately on mount
    checkNotifications();

    // Check every hour
    const interval = setInterval(checkNotifications, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [currentUser, isAuthenticated, entries]);

  // Time Entry handlers (API-based)
  const handleSaveEntry = async (entry: TimeEntry): Promise<boolean> => {
    // Store the previous running entry for rollback on error
    const previousRunningEntry = runningEntry;

    // If this entry was running (has same ID as runningEntry), it's an update
    const isUpdatingRunningEntry = runningEntry && entry.id === runningEntry.id;
    const existsInState = entries.find(e => e.id === entry.id);
    const action = (isUpdatingRunningEntry || existsInState) ? 'update' : 'create';

    // Check if we're offline - save locally and return success
    if (!navigator.onLine) {
      console.log('📴 [ENTRY] Offline - saving entry locally:', entry.id);

      // Save to local storage for later sync
      addPendingEntry(entry, action);
      refreshOfflineCounts();

      // Clear running entry if stopping
      if (isUpdatingRunningEntry && !entry.isRunning) {
        setRunningEntry(null);
      }

      // Add to local entries state so user sees it
      if (action === 'update') {
        setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
      } else {
        setEntries(prev => [...prev.filter(e => e.id !== entry.id), entry]);
      }

      return true; // Return success - entry is saved locally
    }

    try {
      console.log('💾 [ENTRY] Saving entry:', entry.id);
      console.log('💾 [ENTRY] Entry isRunning:', entry.isRunning);
      console.log('💾 [ENTRY] Current runningEntry:', runningEntry?.id);

      // Clear running entry optimistically only if stopping a timer
      if (isUpdatingRunningEntry && !entry.isRunning) {
        setRunningEntry(null);
      }

      if (action === 'update') {
        // Update existing entry
        console.log('💾 [ENTRY] Updating existing entry');
        const response = await entriesApi.update(entry.id, entry);
        console.log('✅ [ENTRY] Entry updated:', response);
        setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
      } else {
        // Create new entry with clientId for idempotency
        console.log('💾 [ENTRY] Creating new entry');
        const response = await entriesApi.create({ ...entry, clientId: entry.id });
        console.log('✅ [ENTRY] Entry created:', response);
        setEntries(prev => [...prev.filter(e => e.id !== entry.id), response.data]);
      }

      return true; // Success
    } catch (error) {
      console.error('❌ [ENTRY] Failed to save entry:', error);

      // If network error, save locally for later sync
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log('📴 [ENTRY] Network error - saving entry locally:', entry.id);
        addPendingEntry(entry, action);
        refreshOfflineCounts();

        // Still update local state
        if (action === 'update') {
          setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
        } else {
          setEntries(prev => [...prev.filter(e => e.id !== entry.id), entry]);
        }

        return true; // Return success since we saved locally
      }

      // Rollback: restore the running entry if the API call failed
      if (previousRunningEntry && !entry.isRunning) {
        console.log('🔄 [ENTRY] Rolling back running entry due to error');
        setRunningEntry(previousRunningEntry);
      }
      return false; // Failed
    }
  };

  const handleUpdateRunning = async (entry: TimeEntry) => {
    try {
      // IMPORTANT: Only process updates for running entries
      // This prevents stale debounced updates from overwriting stopped entries
      if (!entry.isRunning) {
        console.log('⚠️ [ENTRY] Ignoring update for non-running entry:', entry.id);
        return;
      }

      console.log('⏱️ [ENTRY] Updating running entry:', entry.id);
      setRunningEntry(entry);

      // Check if entry exists in state or is currently being created
      const existsInState = entries.find(e => e.id === entry.id);
      const isBeingCreated = pendingEntryIdsRef.current.has(entry.id);

      if (existsInState) {
        // Update existing entry
        const response = await entriesApi.update(entry.id, entry);
        console.log('✅ [ENTRY] Running entry updated:', response);
        setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
      } else if (!isBeingCreated) {
        // Create new entry (only if not already being created)
        pendingEntryIdsRef.current.add(entry.id);
        try {
          const response = await entriesApi.create({ ...entry, clientId: entry.id });
          console.log('✅ [ENTRY] Running entry created:', response);
          setEntries(prev => [...prev.filter(e => e.id !== entry.id), response.data]);
        } finally {
          pendingEntryIdsRef.current.delete(entry.id);
        }
      } else {
        console.log('⏳ [ENTRY] Entry is being created, skipping duplicate:', entry.id);
      }
    } catch (error) {
      console.error('❌ [ENTRY] Failed to update running entry:', error);

      // Save to pending storage for later sync (prevents data loss)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log('📴 [ENTRY] Network error - saving running entry update locally:', entry.id);
        addPendingEntry(entry, 'update');
        refreshOfflineCounts();
      }
    }
  };

  // TIMER SAFETY: Warn user before closing page with running timer
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (runningEntry) {
        const message = 'Du hast einen laufenden Timer! Wenn du die Seite verlässt, könnte Zeit verloren gehen.';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [runningEntry]);

  // TIMER SAFETY: Recalculate elapsed time when tab becomes visible again
  // This prevents time drift if the tab was in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && runningEntry) {
        console.log('👁️ [TIMER] Tab became visible, syncing timer state...');
        // The Stopwatch component will recalculate elapsed time from startTime
        // We just need to ensure the entry is fresh
        setRunningEntry(prev => prev ? { ...prev } : null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runningEntry]);

  // TIMER SAFETY: Periodic heartbeat — save running timer to backend every
  // N minutes (configurable per user, default 5). Ensures the server has
  // the latest state even if the client crashes.
  useEffect(() => {
    if (!runningEntry || !isOnline) return;

    const intervalMinutes = currentUser?.heartbeatIntervalMinutes ?? 5;
    const intervalMs = intervalMinutes * 60 * 1000;

    const heartbeatInterval = setInterval(async () => {
      if (runningEntry && runningEntry.isRunning) {
        try {
          console.log(`💓 [TIMER] Heartbeat (every ${intervalMinutes}min): saving running timer state...`);
          await entriesApi.update(runningEntry.id, {
            ...runningEntry,
            duration: Math.floor((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000),
          });
          console.log('💓 [TIMER] Heartbeat successful');
        } catch (error) {
          console.error('💔 [TIMER] Heartbeat failed:', error);
          // If heartbeat fails, save to local storage as backup
          addPendingEntry(runningEntry, 'update');
        }
      }
    }, intervalMs);

    return () => clearInterval(heartbeatInterval);
  }, [runningEntry, isOnline, currentUser?.heartbeatIntervalMinutes]);

  // TIMER SAFETY: Save running timer to localStorage as backup
  useEffect(() => {
    const RUNNING_TIMER_KEY = 'running_timer_backup';

    if (runningEntry) {
      // Save backup to localStorage
      localStorage.setItem(RUNNING_TIMER_KEY, JSON.stringify({
        entry: runningEntry,
        savedAt: new Date().toISOString(),
      }));
      console.log('💾 [TIMER] Saved backup to localStorage');
    } else {
      // Clear backup when timer stops
      localStorage.removeItem(RUNNING_TIMER_KEY);
    }
  }, [runningEntry]);

  const handleDeleteEntry = async (id: string) => {
    try {
      console.log('🗑️ [ENTRY] Deleting entry:', id);
      await entriesApi.delete(id);
      console.log('✅ [ENTRY] Entry deleted');
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('❌ [ENTRY] Failed to delete entry:', error);
    }
  };

  const handleEditEntry = async (id: string, updates: Partial<TimeEntry>) => {
    try {
      console.log('✏️ [ENTRY] Editing entry:', id);
      const response = await entriesApi.update(id, updates);
      console.log('✅ [ENTRY] Entry edited:', response);
      setEntries(prev => prev.map(e => e.id === id ? response.data : e));
    } catch (error) {
      console.error('❌ [ENTRY] Failed to edit entry:', error);
    }
  };

  const handleBulkUpdateEntries = async (entryIds: string[], updates: { projectId?: string; description?: string; activityId?: string }) => {
    try {
      console.log('📦 [ENTRY] Bulk updating entries:', entryIds.length);
      await entriesApi.bulkUpdate(entryIds, updates);
      console.log('✅ [ENTRY] Bulk update complete');
      // Reload entries to get updated data
      const response = await entriesApi.getAll();
      setEntries(response.data);
    } catch (error) {
      console.error('❌ [ENTRY] Failed to bulk update entries:', error);
      throw error;
    }
  };

  // Customer handlers (API-based)
  const handleAddCustomer = async (customer: Customer) => {
    try {
      console.log('➕ [CUSTOMER] Adding customer:', customer.name);
      const response = await customersApi.create(customer);
      console.log('✅ [CUSTOMER] Customer created:', response);
      setCustomers(prev => [...prev, response.data]);
    } catch (error) {
      console.error('❌ [CUSTOMER] Failed to add customer:', error);
    }
  };

  const handleUpdateCustomer = async (id: string, updates: Partial<Customer>) => {
    try {
      console.log('✏️ [CUSTOMER] Updating customer:', id);
      const response = await customersApi.update(id, updates);
      console.log('✅ [CUSTOMER] Customer updated:', response);
      setCustomers(prev => prev.map(c => c.id === id ? response.data : c));
    } catch (error) {
      console.error('❌ [CUSTOMER] Failed to update customer:', error);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    try {
      console.log('🗑️ [CUSTOMER] Deleting customer:', id);
      await customersApi.delete(id);
      console.log('✅ [CUSTOMER] Customer deleted');
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error('❌ [CUSTOMER] Failed to delete customer:', error);
    }
  };

  // Project handlers (API-based)
  const handleAddProject = async (project: Project) => {
    try {
      console.log('➕ [PROJECT] Adding project:', project.name);

      // Call API to create project
      const response = await projectsApi.create(project);
      console.log('✅ [PROJECT] Project created:', response);

      // Update local state with API response
      setProjects(prev => [...prev, response.data]);
      console.log('✅ [PROJECT] Local state updated');
    } catch (error) {
      console.error('❌ [PROJECT] Failed to add project:', error);
      // TODO: Show error to user
    }
  };

  const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
    try {
      console.log('✏️ [PROJECT] Updating project:', id, updates);

      // Call API to update project
      const response = await projectsApi.update(id, updates);
      console.log('✅ [PROJECT] Project updated:', response);

      // Update local state with API response
      setProjects(prev => prev.map(p => p.id === id ? response.data : p));
      console.log('✅ [PROJECT] Local state updated');
    } catch (error) {
      console.error('❌ [PROJECT] Failed to update project:', error);
      // TODO: Show error to user
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      console.log('🗑️ [PROJECT] Deleting project:', id);

      // Call API to delete project
      await projectsApi.delete(id);
      console.log('✅ [PROJECT] Project deleted');

      // Update local state
      setProjects(prev => prev.filter(p => p.id !== id));
      console.log('✅ [PROJECT] Local state updated');
    } catch (error) {
      console.error('❌ [PROJECT] Failed to delete project:', error);
      // TODO: Show error to user
    }
  };

  // Activity handlers (API-based)
  const handleAddActivity = async (activity: Activity) => {
    try {
      console.log('➕ [ACTIVITY] Adding activity:', activity.name);
      const response = await activitiesApi.create(activity);
      console.log('✅ [ACTIVITY] Activity created:', response);
      setActivities(prev => [...prev, response.data]);
    } catch (error) {
      console.error('❌ [ACTIVITY] Failed to add activity:', error);
    }
  };

  const handleUpdateActivity = async (id: string, updates: Partial<Activity>) => {
    try {
      console.log('✏️ [ACTIVITY] Updating activity:', id);
      const response = await activitiesApi.update(id, updates);
      console.log('✅ [ACTIVITY] Activity updated:', response);
      setActivities(prev => prev.map(a => a.id === id ? response.data : a));
    } catch (error) {
      console.error('❌ [ACTIVITY] Failed to update activity:', error);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      console.log('🗑️ [ACTIVITY] Deleting activity:', id);
      await activitiesApi.delete(id);
      console.log('✅ [ACTIVITY] Activity deleted');
      setActivities(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('❌ [ACTIVITY] Failed to delete activity:', error);
    }
  };

  // Repeat Entry handler — starts a new running timer immediately with the
  // same project/activity/description. A previously running timer is
  // automatically closed server-side (see PR #54 overlap-prevention).
  const handleRepeatEntry = async (entry: TimeEntry) => {
    if (!currentUser) return;

    // Switch to the stopwatch view first so the user sees the new timer
    // already counting when the view renders.
    navigateTo('arbeiten', 'stopwatch');

    const now = new Date().toISOString();
    const newEntry: TimeEntry = {
      id: generateUUID(),
      userId: currentUser.id,
      startTime: now,
      duration: 0,
      projectId: entry.projectId,
      activityId: entry.activityId,
      ticketId: entry.ticketId,
      description: entry.description || '',
      isRunning: true,
      isBillable: entry.isBillable ?? true,
      createdAt: now,
    };

    await handleUpdateRunning(newEntry);
  };

  // Area change handler — navigateToArea picks the area's default subView
  const handleAreaChange = navigateToArea;

  // SubView change handler — navigateToSubView infers the area from the subView
  const handleSubViewChange = navigateToSubView;

  // Dark Mode handler
  const handleToggleDarkMode = () => {
    const newMode = !(currentUser?.darkMode ?? false);
    updateDarkMode(newMode);
  };

  // Mobile swipe gestures: bottom 30% → area switch, top 30% → subView switch
  const swipeHandlers = useSwipeNavigation({
    currentArea,
    currentSubView,
    onAreaChange: handleAreaChange,
    onSubViewChange: handleSubViewChange,
  });

  // FAB handlers
  const handleFABStartTimer = () => {
    navigateTo('arbeiten', 'stopwatch');
  };

  const handleFABStopTimer = async () => {
    if (runningEntry) {
      haptics.heavy();
      const stoppedEntry = {
        ...runningEntry,
        isRunning: false,
        endTime: new Date().toISOString(),
        duration: Math.floor((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000),
      };
      await handleSaveEntry(stoppedEntry);
      setRunningEntry(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-dark-400">Lädt...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show Auth screen
  if (!isAuthenticated) {
    return <Auth />;
  }

  // Authenticated - show main app
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-50 overflow-x-hidden">
      {/* Offline Banner */}
      <OfflineBanner
        isOnline={isOnline}
        wasOffline={wasOffline}
        pendingCount={pendingCount}
        failedCount={failedCount}
        isSyncing={isSyncing}
        syncError={syncError}
        onRetryFailed={handleRetryFailedEntry}
        onDiscardFailed={handleDiscardFailedEntry}
        onRetryAll={syncPendingEntries}
      />

      {/* Forgotten-timer warning (>8h running) */}
      <ForgottenTimerBanner
        runningEntry={runningEntry}
        onGoToTimer={() => navigateTo('arbeiten', 'stopwatch')}
        onStopTimer={handleFABStopTimer}
      />

      {/* Global Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette onNavigate={handleSubViewChange} />

      {/* Top Navigation Header */}
      <AreaNavigation
        currentArea={currentArea}
        currentSubView={currentSubView}
        onAreaChange={handleAreaChange}
        onSubViewChange={handleSubViewChange}
      />

      <main
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isDesktop
            ? `pt-0 pb-0`  // No padding on desktop - sidebar handles navigation
            : 'pt-12 pb-16'  // Mobile: top nav + bottom nav padding
        }`}
        style={isDesktop ? {
          marginLeft: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        } : undefined}
        {...(isDesktop ? {} : swipeHandlers)}  // Only enable swipe on mobile
      >
        {/* Suspense catches lazy-loaded modules while they are being fetched */}
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary" />
          </div>
        }>
        {currentSubView === 'stopwatch' && (
          <Stopwatch
            onSave={handleSaveEntry}
            runningEntry={runningEntry}
            onUpdateRunning={handleUpdateRunning}
            projects={projects}
            customers={customers}
            activities={activities}
            entries={entries}
            onOpenManualEntry={() => navigateToSubView('manual')}
            prefilledEntry={prefilledEntry}
            onPrefilledEntryUsed={() => setPrefilledEntry(null)}
          />
        )}
        {currentSubView === 'manual' && (
          <ManualEntryModern
            onSave={handleSaveEntry}
            projects={projects}
            customers={customers}
            activities={activities}
          />
        )}
        {(currentSubView === 'zeiten' || currentSubView === 'grid' || currentSubView === 'list' || currentSubView === 'calendar') && (
          <TimeViews
            entries={entries}
            projects={projects}
            customers={customers}
            activities={activities}
            onCreateEntry={handleSaveEntry}
            onEditEntry={handleEditEntry}
            onDeleteEntry={handleDeleteEntry}
            onRepeatEntry={handleRepeatEntry}
            onBulkUpdate={handleBulkUpdateEntries}
            onCalendarCreate={async (entry) => {
              try {
                const response = await entriesApi.create(entry);
                setEntries(prev => [...prev, response.data]);
              } catch (error) {
                console.error('Failed to create entry:', error);
              }
            }}
          />
        )}
        {currentSubView === 'tasks' && (
          <TaskHub
            runningTimerTaskId={null}
            onTimerStart={(taskId) => {
              console.log('Start timer for task:', taskId);
              // Timer is handled inside TaskHub via API
            }}
            onTimerStop={(taskId) => {
              console.log('Stop timer for task:', taskId);
              // Timer is handled inside TaskHub via API
            }}
            onOpenTicket={handleOpenTicket}
            onOpenCustomer={handleOpenCustomer}
          />
        )}
        {currentSubView === 'overview' && (
          <DashboardOverview
            entries={entries}
            projects={projects}
            customers={customers}
            runningEntry={runningEntry}
            isLoading={isInitialDataLoading}
            onNavigate={(area, subView) => navigateTo(area, subView)}
            onStartTimer={() => navigateTo('arbeiten', 'stopwatch')}
          />
        )}
        {currentSubView === 'customers' && (
          <CustomerHub
            customers={customers}
            projects={projects}
            entries={entries}
            isInitialDataLoading={isInitialDataLoading}
            initialCustomerId={initialCustomerId ?? undefined}
            onNavigateToTicket={(ticketId) => handleOpenTicket(ticketId)}
            onNavigateToTask={(_taskId) => {
              navigateTo('arbeiten', 'tasks');
            }}
            onStartTimer={(_customerId, projectId, description) => {
              if (projectId) {
                setPrefilledEntry({
                  projectId,
                  description: description || '',
                });
              }
              navigateTo('arbeiten', 'stopwatch');
            }}
            onAddManualEntry={(_customerId, projectId) => {
              if (projectId) {
                setPrefilledEntry({
                  projectId,
                  description: '',
                });
              }
              navigateTo('arbeiten', 'manual');
            }}
          />
        )}
        {currentSubView === 'tickets' && (
          <Tickets
            customers={customers}
            projects={projects}
            onStartTimer={(ticket: Ticket) => {
              // Set prefilled entry with ticket info and switch to stopwatch
              // Use ticket's project or find first active project for the customer
              let projectId = ticket.projectId;
              if (!projectId) {
                const customerProjects = projects.filter(p => p.customerId === ticket.customerId && p.isActive);
                projectId = customerProjects[0]?.id || '';
              }
              setPrefilledEntry({
                projectId: projectId || '',
                description: `${ticket.ticketNumber}: ${ticket.title}`,
                ticketId: ticket.id,
              });
              navigateTo('arbeiten', 'stopwatch');
            }}
            initialTicketId={initialTicketId}
            onTicketIdHandled={() => setInitialTicketId(null)}
          />
        )}
        {currentSubView === 'devices' && (
          <DevicesView />
        )}
        {currentSubView === 'alerts' && (
          <AlertsView />
        )}
        {currentSubView === 'maintenance' && (
          <MaintenanceView />
        )}
        {currentSubView === 'inbox' && (
          <SupportInbox />
        )}
        {currentSubView === 'invoices' && (
          <InvoiceInbox />
        )}
        {currentSubView === 'billing' && (
          <Finanzen onBack={() => navigateToSubView('overview')} />
        )}
        {currentSubView === 'crm-dashboard' && (
          <CRMDashboard
            customers={customers}
            projects={projects}
            onNavigateToCustomer={(_customerId) => {
              navigateToSubView('customers');
            }}
            onNavigateToOpportunity={(_opportunityId) => {
              navigateToSubView('pipeline');
            }}
          />
        )}
        {currentSubView === 'pipeline' && (
          <SalesPipeline />
        )}
        {currentSubView === 'leads' && (
          <Leads />
        )}
        {currentSubView === 'contracts' && (
          <Contracts />
        )}
        {currentSubView === 'social-media' && (
          <SocialMediaProvider customers={customers}>
            <SocialMediaLayout />
          </SocialMediaProvider>
        )}
        {currentSubView === 'reports' && (
          <ReportsPage
            entries={entries}
            projects={projects}
            customers={customers}
            activities={activities}
          />
        )}
        {currentSubView === 'settings' && (
          <Settings
            customers={customers}
            projects={projects}
            activities={activities}
            entries={entries}
            darkMode={currentUser?.darkMode ?? false}
            onToggleDarkMode={handleToggleDarkMode}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onAddProject={handleAddProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onAddActivity={handleAddActivity}
            onUpdateActivity={handleUpdateActivity}
            onDeleteActivity={handleDeleteActivity}
            onRefreshEntries={refreshEntries}
          />
        )}
        {currentSubView === 'admin' && (
          <AdminPortal />
        )}
        </Suspense>
      </main>

      {/* Global timer widget (mobile only) — sits above the bottom nav,
          visible on every view except the stopwatch itself while a timer
          is running. Hides the FAB by virtue of FAB's isTimerRunning guard. */}
      {!isDesktop && (
        <GlobalTimerWidget
          runningEntry={runningEntry}
          projects={projects}
          customers={customers}
          activities={activities}
          currentSubView={currentSubView}
          onGoToTimer={() => navigateTo('arbeiten', 'stopwatch')}
          onStopTimer={handleFABStopTimer}
        />
      )}

      {/* Floating Action Button - only on mobile */}
      {!isDesktop && (
        <FloatingActionButton
          isTimerRunning={!!runningEntry}
          onStartTimer={handleFABStartTimer}
          onStopTimer={handleFABStopTimer}
          currentView={currentSubView}
        />
      )}

      {/* Welcome Modal for new users */}
      {showWelcomeModal && (
        <WelcomeModal isOpen={showWelcomeModal} onClose={handleWelcomeClose} />
      )}

      {/* Notification Permission Request */}
      {showNotificationRequest && (
        <NotificationPermissionRequest onClose={() => setShowNotificationRequest(false)} />
      )}

      {/* Cookie Consent Banner */}
      <CookieConsent />

      {/* Privacy Policy Modal */}
      {showPrivacyPolicy && (
        <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );
}

export default App;
