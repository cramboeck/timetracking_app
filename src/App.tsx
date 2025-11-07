import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Stopwatch } from './components/Stopwatch';
import { ManualEntry } from './components/ManualEntry';
import { TimeEntriesList } from './components/TimeEntriesList';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Auth } from './components/Auth';
import { NotificationPermissionRequest } from './components/NotificationPermissionRequest';
import { WelcomeModal } from './components/WelcomeModal';
import { TimeEntry, ViewMode, Customer, Project, Activity } from './types';
import { storage } from './utils/storage';
import { darkMode } from './utils/darkMode';
import { useAuth } from './contexts/AuthContext';
import { notificationService } from './utils/notifications';

function App() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('settings');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotificationRequest, setShowNotificationRequest] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Load all data from localStorage on mount (filtered by current user)
  useEffect(() => {
    if (!currentUser) return;

    const allEntries = storage.getEntries();
    const allCustomers = storage.getCustomers();
    const allProjects = storage.getProjects();
    const allActivities = storage.getActivities();
    const isDark = darkMode.initialize();

    // Filter data by current user ID
    const userEntries = allEntries.filter(e => e.userId === currentUser.id);
    const userCustomers = allCustomers.filter(c => c.userId === currentUser.id);
    const userProjects = allProjects.filter(p => p.userId === currentUser.id);
    const userActivities = allActivities.filter(a => a.userId === currentUser.id);

    setEntries(userEntries);
    setCustomers(userCustomers);
    setProjects(userProjects);
    setActivities(userActivities);
    setIsDarkMode(isDark);

    // Find any running entry for current user
    const running = userEntries.find(e => e.isRunning);
    if (running) {
      setRunningEntry(running);
    }

    // If there are customers/projects, switch to stopwatch view
    if (userCustomers.length > 0 && userProjects.length > 0) {
      setCurrentView('stopwatch');
    }
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

  // Time Entry handlers
  const handleSaveEntry = (entry: TimeEntry) => {
    setEntries(prev => {
      const filtered = prev.filter(e => e.id !== entry.id);
      const updated = [...filtered, entry];
      storage.saveEntries(updated);
      return updated;
    });
    setRunningEntry(null);
  };

  const handleUpdateRunning = (entry: TimeEntry) => {
    setRunningEntry(entry);
    setEntries(prev => {
      const filtered = prev.filter(e => !e.isRunning);
      const updated = [...filtered, entry];
      storage.saveEntries(updated);
      return updated;
    });
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(prev => {
      const filtered = prev.filter(e => e.id !== id);
      storage.saveEntries(filtered);
      return filtered;
    });
  };

  const handleEditEntry = (id: string, updates: Partial<TimeEntry>) => {
    setEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, ...updates } : e);
      storage.saveEntries(updated);
      return updated;
    });
  };

  // Customer handlers
  const handleAddCustomer = (customer: Customer) => {
    setCustomers(prev => {
      const updated = [...prev, customer];
      storage.saveCustomers(updated);
      return updated;
    });
  };

  const handleUpdateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      storage.saveCustomers(updated);
      return updated;
    });
  };

  const handleDeleteCustomer = (id: string) => {
    setCustomers(prev => {
      const filtered = prev.filter(c => c.id !== id);
      storage.saveCustomers(filtered);
      return filtered;
    });
  };

  // Project handlers
  const handleAddProject = (project: Project) => {
    setProjects(prev => {
      const updated = [...prev, project];
      storage.saveProjects(updated);
      return updated;
    });
  };

  const handleUpdateProject = (id: string, updates: Partial<Project>) => {
    setProjects(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      storage.saveProjects(updated);
      return updated;
    });
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => {
      const filtered = prev.filter(p => p.id !== id);
      storage.saveProjects(filtered);
      return filtered;
    });
  };

  // Activity handlers
  const handleAddActivity = (activity: Activity) => {
    setActivities(prev => {
      const updated = [...prev, activity];
      storage.saveActivities(updated);
      return updated;
    });
  };

  const handleUpdateActivity = (id: string, updates: Partial<Activity>) => {
    setActivities(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      storage.saveActivities(updated);
      return updated;
    });
  };

  const handleDeleteActivity = (id: string) => {
    setActivities(prev => {
      const filtered = prev.filter(a => a.id !== id);
      storage.saveActivities(filtered);
      return filtered;
    });
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
      <main className="flex-1 overflow-hidden pb-16">
        {currentView === 'stopwatch' && (
          <Stopwatch
            onSave={handleSaveEntry}
            runningEntry={runningEntry}
            onUpdateRunning={handleUpdateRunning}
            projects={projects}
            customers={customers}
            activities={activities}
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
            onDelete={handleDeleteEntry}
            onEdit={handleEditEntry}
          />
        )}
        {currentView === 'dashboard' && (
          <Dashboard
            entries={entries}
            projects={projects}
            customers={customers}
          />
        )}
        {currentView === 'settings' && (
          <Settings
            customers={customers}
            projects={projects}
            activities={activities}
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
    </div>
  );
}

export default App;
