import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Stopwatch } from './components/Stopwatch';
import { ManualEntry } from './components/ManualEntry';
import { TimeEntriesList } from './components/TimeEntriesList';
import { TimeEntry, ViewMode } from './types';
import { storage } from './utils/storage';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('stopwatch');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);

  // Load entries from localStorage on mount
  useEffect(() => {
    const loadedEntries = storage.getEntries();
    setEntries(loadedEntries);

    // Find any running entry
    const running = loadedEntries.find(e => e.isRunning);
    if (running) {
      setRunningEntry(running);
    }
  }, []);

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
    if (confirm('Möchtest du diesen Eintrag wirklich löschen?')) {
      setEntries(prev => {
        const filtered = prev.filter(e => e.id !== id);
        storage.saveEntries(filtered);
        return filtered;
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <main className="flex-1 overflow-hidden pb-16">
        {currentView === 'stopwatch' && (
          <Stopwatch
            onSave={handleSaveEntry}
            runningEntry={runningEntry}
            onUpdateRunning={handleUpdateRunning}
          />
        )}
        {currentView === 'manual' && <ManualEntry onSave={handleSaveEntry} />}
        {currentView === 'list' && (
          <TimeEntriesList entries={entries} onDelete={handleDeleteEntry} />
        )}
      </main>
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
    </div>
  );
}

export default App;
