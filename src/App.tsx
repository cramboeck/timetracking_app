import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Stopwatch } from './components/Stopwatch';
import { ManualEntry } from './components/ManualEntry';
import { TimeEntriesList } from './components/TimeEntriesList';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Auth } from './components/Auth';
import { TimeEntry, ViewMode, Customer, Project, Activity } from './types';
import { storage } from './utils/storage';
import { darkMode } from './utils/darkMode';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('settings');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
    </div>
  );
}

export default App;
