import { useState, useEffect } from 'react';
import { Clock, Calendar, ChevronDown, Briefcase, TrendingUp, ChevronRight } from 'lucide-react';
import { customerPortalApi } from '../../services/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface TimeReportData {
  month: string;
  totalHours: number;
  billableHours: number;
  byProject: {
    projectId: string;
    projectName: string;
    hours: number;
    billableHours: number;
    entries: number;
  }[];
  detailedEntries?: {
    id: string;
    date: string;
    hours: number;
    projectName: string;
    activityName: string | null;
    description: string | null;
    isBillable: boolean;
  }[];
  entryCount: number;
}

interface AvailableMonth {
  year: number;
  month: number;
  label: string;
}

export const PortalTimeReport = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TimeReportData | null>(null);
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Load available months
  useEffect(() => {
    loadAvailableMonths();
  }, []);

  // Load report when month changes
  useEffect(() => {
    if (selectedMonth) {
      loadReport(selectedMonth);
    }
  }, [selectedMonth]);

  const loadAvailableMonths = async () => {
    try {
      const response = await customerPortalApi.getTimeReportMonths();
      if (response.success && response.data.length > 0) {
        setAvailableMonths(response.data);
        setSelectedMonth(response.data[0].label);
      } else {
        // Default to current month if no data
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setSelectedMonth(currentMonth);
      }
    } catch (err) {
      console.error('Failed to load available months:', err);
      const now = new Date();
      setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  };

  const loadReport = async (month: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerPortalApi.getTimeReport(month);
      if (response.success) {
        setReportData(response.data);
      } else {
        setError('Konnte Zeitbericht nicht laden');
      }
    } catch (err) {
      console.error('Failed to load time report:', err);
      setError('Konnte Zeitbericht nicht laden');
    } finally {
      setLoading(false);
    }
  };

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)} h`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  };

  if (loading && !reportData) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary mx-auto" />
        <p className="mt-2 text-gray-500 dark:text-dark-400">Lade Zeitbericht...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => loadReport(selectedMonth)} className="mt-2">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="text-accent-primary" size={24} />
            Arbeitszeit-Übersicht
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Gebuchte Stunden für Ihre Projekte
          </p>
        </div>

        {/* Month selector */}
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white font-medium cursor-pointer"
          >
            {availableMonths.length > 0 ? (
              availableMonths.map((m) => (
                <option key={m.label} value={m.label}>
                  {formatMonthLabel(m.label)}
                </option>
              ))
            ) : (
              <option value={selectedMonth}>{formatMonthLabel(selectedMonth)}</option>
            )}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
        </div>
      </div>

      {reportData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                <Clock size={16} />
                <span className="text-sm">Gesamt</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatHours(reportData.totalHours)}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                <TrendingUp size={16} />
                <span className="text-sm">Verrechenbar</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatHours(reportData.billableHours)}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                <Briefcase size={16} />
                <span className="text-sm">Projekte</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {reportData.byProject.length}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                <Calendar size={16} />
                <span className="text-sm">Einträge</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {reportData.entryCount}
              </p>
            </Card>
          </div>

          {/* Project breakdown */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Aufschlüsselung nach Projekt
              </h3>
            </div>

            {reportData.byProject.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                Keine Zeiteinträge in diesem Monat
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {reportData.byProject.map((project) => (
                  <div key={project.projectId}>
                    <button
                      onClick={() => setExpandedProject(
                        expandedProject === project.projectId ? null : project.projectId
                      )}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded-lg">
                          <Briefcase size={18} className="text-accent-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {project.projectName}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-dark-400">
                            {project.entries} Einträge
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {formatHours(project.hours)}
                          </p>
                          {project.billableHours > 0 && project.billableHours !== project.hours && (
                            <p className="text-sm text-green-600 dark:text-green-400">
                              {formatHours(project.billableHours)} verrechenbar
                            </p>
                          )}
                        </div>
                        <ChevronRight
                          size={18}
                          className={`text-gray-400 transition-transform ${
                            expandedProject === project.projectId ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expanded detail entries */}
                    {expandedProject === project.projectId && reportData.detailedEntries && (
                      <div className="bg-gray-50 dark:bg-dark-200 border-t border-gray-200 dark:border-dark-border">
                        {reportData.detailedEntries
                          .filter(e => e.projectName === project.projectName)
                          .map((entry) => (
                            <div
                              key={entry.id}
                              className="px-4 py-3 border-b border-gray-100 dark:border-dark-border last:border-0"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatDate(entry.date)}
                                    {entry.activityName && (
                                      <span className="ml-2 text-gray-500 dark:text-dark-400">
                                        {entry.activityName}
                                      </span>
                                    )}
                                  </p>
                                  {entry.description && (
                                    <p className="text-sm text-gray-600 dark:text-dark-400 mt-1 truncate">
                                      {entry.description}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatHours(entry.hours)}
                                  </p>
                                  {entry.isBillable && (
                                    <span className="text-xs text-green-600 dark:text-green-400">
                                      verrechenbar
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        {reportData.detailedEntries.filter(e => e.projectName === project.projectName).length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-500 dark:text-dark-400">
                            Details werden vom Dienstleister nicht freigegeben
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
