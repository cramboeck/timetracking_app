import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Stopwatch } from './components/Stopwatch';
import { ManualEntry } from './components/ManualEntry';
import { TimeEntriesList } from './components/TimeEntriesList';
import { CalendarView } from './components/CalendarView';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Tickets } from './components/Tickets';
import { Auth } from './components/Auth';
import { NotificationPermissionRequest } from './components/NotificationPermissionRequest';
import { WelcomeModal } from './components/WelcomeModal';
import { CookieConsent } from './components/CookieConsent';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TimeEntry, ViewMode, Customer, Project, Activity, Ticket } from './types';
import { darkMode } from './utils/darkMode';
import { useAuth } from './contexts/AuthContext';
import { notificationService } from './utils/notifications';
import { projectsApi, customersApi, activitiesApi, entriesApi } from './services/api';

function App() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('settings');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [prefilledEntry, setPrefilledEntry] = useState<{ projectId: string; activityId?: string; description: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotificationRequest, setShowNotificationRequest] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

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

        // Initialize dark mode
        const isDark = darkMode.initialize();
        setIsDarkMode(isDark);

        // Find any running entry
        const running = (entriesResponse.data || []).find(e => e.isRunning);
        if (running) {
          setRunningEntry(running);
        }

        // If there are customers/projects, switch to stopwatch view
        if (customersResponse.data.length > 0 && projectsResponse.data.length > 0) {
          setCurrentView('stopwatch');
        }

        console.log('✅ [DATA] All data loaded successfully');
      } catch (error) {
        console.error('❌ [DATA] Error loading data:', error);
      }
    };

    loadData();
  }, [currentUser]);

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
      const today = now.toISOString().split('T')[0];
      const hasEntriesToday = entries.some(e => {
        const entryDate = new Date(e.startTime).toISOString().split('T')[0];
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
  const handleSaveEntry = async (entry: TimeEntry) => {
    // Store the previous running entry for rollback on error
    const previousRunningEntry = runningEntry;

    try {
      console.log('💾 [ENTRY] Saving entry:', entry.id);
      console.log('💾 [ENTRY] Entry isRunning:', entry.isRunning);
      console.log('💾 [ENTRY] Current runningEntry:', runningEntry?.id);

      // If this entry was running (has same ID as runningEntry), it's an update
      const isUpdatingRunningEntry = runningEntry && entry.id === runningEntry.id;
      const existsInState = entries.find(e => e.id === entry.id);

      // Clear running entry optimistically only if stopping a timer
      if (isUpdatingRunningEntry && !entry.isRunning) {
        setRunningEntry(null);
      }

      if (isUpdatingRunningEntry || existsInState) {
        // Update existing entry
        console.log('💾 [ENTRY] Updating existing entry');
        const response = await entriesApi.update(entry.id, entry);
        console.log('✅ [ENTRY] Entry updated:', response);
        setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
      } else {
        // Create new entry
        console.log('💾 [ENTRY] Creating new entry');
        const response = await entriesApi.create(entry);
        console.log('✅ [ENTRY] Entry created:', response);
        setEntries(prev => [...prev.filter(e => e.id !== entry.id), response.data]);
      }
    } catch (error) {
      console.error('❌ [ENTRY] Failed to save entry:', error);
      // Rollback: restore the running entry if the API call failed
      if (previousRunningEntry && !entry.isRunning) {
        console.log('🔄 [ENTRY] Rolling back running entry due to error');
        setRunningEntry(previousRunningEntry);
      }
    }
  };

  const handleUpdateRunning = async (entry: TimeEntry) => {
    try {
      console.log('⏱️ [ENTRY] Updating running entry:', entry.id);
      setRunningEntry(entry);

      if (entry.id && entries.find(e => e.id === entry.id)) {
        // Update existing entry
        const response = await entriesApi.update(entry.id, entry);
        console.log('✅ [ENTRY] Running entry updated:', response);
        setEntries(prev => prev.map(e => e.id === entry.id ? response.data : e));
      } else {
        // Create new entry
        const response = await entriesApi.create(entry);
        console.log('✅ [ENTRY] Running entry created:', response);
        setEntries(prev => [...prev.filter(e => !e.isRunning), response.data]);
      }
    } catch (error) {
      console.error('❌ [ENTRY] Failed to update running entry:', error);
    }
  };

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

  // Repeat Entry handler
  const handleRepeatEntry = (entry: TimeEntry) => {
    setPrefilledEntry({
      projectId: entry.projectId,
      activityId: entry.activityId,
      description: entry.description
    });
    setCurrentView('stopwatch');
  };

  // Dark Mode handler
  const handleToggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    darkMode.set(newMode);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Lädt...</p>
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
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <main className="flex-1 overflow-y-auto pb-16">
        {currentView === 'stopwatch' && (
          <Stopwatch
            onSave={handleSaveEntry}
            runningEntry={runningEntry}
            onUpdateRunning={handleUpdateRunning}
            projects={projects}
            customers={customers}
            activities={activities}
            onOpenManualEntry={() => setCurrentView('manual')}
            prefilledEntry={prefilledEntry}
            onPrefilledEntryUsed={() => setPrefilledEntry(null)}
          />
        )}
        {currentView === 'manual' && (
          <ManualEntry
            onSave={handleSaveEntry}
            projects={projects}
            customers={customers}
            activities={activities}
          />
        )}
        {currentView === 'list' && (
          <TimeEntriesList
            entries={entries}
            projects={projects}
            customers={customers}
            activities={activities}
            onDelete={handleDeleteEntry}
            onEdit={handleEditEntry}
            onRepeatEntry={handleRepeatEntry}
          />
        )}
        {currentView === 'calendar' && (
          <CalendarView
            entries={entries}
            projects={projects}
            customers={customers}
            activities={activities}
            onEditEntry={(entry) => {
              // Open edit modal - for now, just log
              console.log('Edit entry:', entry);
              // TODO: Implement edit modal
            }}
            onUpdateEntry={handleEditEntry}
            onCreateEntry={async (entry) => {
              try {
                const response = await entriesApi.create(entry);
                setEntries(prev => [...prev, response.data]);
              } catch (error) {
                console.error('Failed to create entry:', error);
              }
            }}
          />
        )}
        {currentView === 'dashboard' && (
          <Dashboard
            entries={entries}
            projects={projects}
            customers={customers}
            activities={activities}
          />
        )}
        {currentView === 'tickets' && (
          <Tickets
            customers={customers}
            projects={projects}
            onStartTimer={(ticket: Ticket) => {
              // Set prefilled entry with ticket info and switch to stopwatch
              const project = projects.find(p => p.id === ticket.projectId);
              setPrefilledEntry({
                projectId: project?.id || '',
                description: `${ticket.ticketNumber}: ${ticket.title}`,
              });
              setCurrentView('stopwatch');
            }}
          />
        )}
        {currentView === 'settings' && (
          <Settings
            customers={customers}
            projects={projects}
            activities={activities}
            entries={entries}
            darkMode={isDarkMode}
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
          />
        )}
      </main>
      <Navigation currentView={currentView} onViewChange={setCurrentView} />

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
