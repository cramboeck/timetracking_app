import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Stopwatch } from './components/Stopwatch';
import { ManualEntry } from './components/ManualEntry';
import { TimeEntriesList } from './components/TimeEntriesList';
import { Settings } from './components/Settings';
import { TimeEntry, ViewMode, Customer, Project } from './types';
import { storage } from './utils/storage';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('settings');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);

  // Load all data from localStorage on mount
  useEffect(() => {
    const loadedEntries = storage.getEntries();
    const loadedCustomers = storage.getCustomers();
    const loadedProjects = storage.getProjects();

    setEntries(loadedEntries);
    setCustomers(loadedCustomers);
    setProjects(loadedProjects);

    // Find any running entry
    const running = loadedEntries.find(e => e.isRunning);
    if (running) {
      setRunningEntry(running);
    }

    // If there are customers/projects, switch to stopwatch view
    if (loadedCustomers.length > 0 && loadedProjects.length > 0) {
      setCurrentView('stopwatch');
    }
  }, []);

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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <main className="flex-1 overflow-hidden pb-16">
        {currentView === 'stopwatch' && (
          <Stopwatch
            onSave={handleSaveEntry}
            runningEntry={runningEntry}
            onUpdateRunning={handleUpdateRunning}
            projects={projects}
            customers={customers}
          />
        )}
        {currentView === 'manual' && (
          <ManualEntry
            onSave={handleSaveEntry}
            projects={projects}
            customers={customers}
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
        {currentView === 'settings' && (
          <Settings
            customers={customers}
            projects={projects}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onAddProject={handleAddProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
          />
        )}
      </main>
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
    </div>
  );
}

export default App;
