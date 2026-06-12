import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, Coffee, Calendar, Briefcase, Download, Filter, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { entriesApi, TeamEntryFilters, TeamMember } from '../services/api';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useToast } from '../contexts/UIContext';
import { EntryScope } from '../types';

// Entry scope category labels
const INTERNAL_CATEGORY_LABELS: Record<string, string> = {
  admin: 'Administration',
  accounting: 'Buchhaltung',
  sales: 'Vertrieb',
  marketing: 'Marketing',
  training: 'Weiterbildung',
  meeting: 'Meeting',
  internal_support: 'Interner Support',
  travel: 'Reise',
};

const ABSENCE_CATEGORY_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  special_leave: 'Sonderurlaub',
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')} h`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const AdminTeamTimeView = () => {
  const showToast = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  // Filters
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<EntryScope | ''>('');
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Build filter params
  const filters = useMemo((): TeamEntryFilters => {
    const f: TeamEntryFilters = { limit: 500 };

    if (selectedUserId) f.userId = selectedUserId;
    if (selectedScope) f.entryScope = selectedScope;

    // Date range
    if (dateRange === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      if (y && m) {
        f.startDate = new Date(y, m - 1, 1).toISOString();
        f.endDate = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
      }
    } else if (dateRange === 'quarter') {
      const match = selectedQuarter.match(/^(\d{4})-Q(\d)$/);
      if (match) {
        const y = parseInt(match[1], 10);
        const q = parseInt(match[2], 10);
        const startMonth = (q - 1) * 3;
        f.startDate = new Date(y, startMonth, 1).toISOString();
        f.endDate = new Date(y, startMonth + 3, 0, 23, 59, 59, 999).toISOString();
      }
    } else if (dateRange === 'year') {
      const y = parseInt(selectedYear, 10);
      if (y) {
        f.startDate = new Date(y, 0, 1).toISOString();
        f.endDate = new Date(y, 11, 31, 23, 59, 59, 999).toISOString();
      }
    } else if (dateRange === 'custom') {
      if (customDateFrom) f.startDate = new Date(`${customDateFrom}T00:00:00`).toISOString();
      if (customDateTo) f.endDate = new Date(`${customDateTo}T23:59:59.999`).toISOString();
    }

    return f;
  }, [selectedUserId, selectedScope, dateRange, selectedMonth, selectedQuarter, selectedYear, customDateFrom, customDateTo]);

  // Fetch team entries
  const { data, isLoading, error } = useQuery({
    queryKey: ['entries', 'team', filters],
    queryFn: () => entriesApi.getTeam(filters),
    staleTime: 30000,
  });

  const members = data?.data?.members || [];
  const entries = data?.data?.entries || [];
  const stats = data?.data?.stats;

  // Generate available months (last 12 months)
  const availableMonths = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }, []);

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  };

  // Group entries by user for summary
  const entriesByUser = useMemo(() => {
    const grouped: Record<string, { member: TeamMember; duration: number; count: number }> = {};

    entries.forEach(entry => {
      const userId = entry.userId;
      if (!grouped[userId]) {
        const member = members.find(m => m.id === userId);
        grouped[userId] = {
          member: member || { id: userId, username: 'Unbekannt', displayName: null, email: '', role: '' },
          duration: 0,
          count: 0,
        };
      }
      grouped[userId].duration += entry.duration || 0;
      grouped[userId].count += 1;
    });

    return Object.values(grouped).sort((a, b) => b.duration - a.duration);
  }, [entries, members]);

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await entriesApi.exportTeamCSV(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `team-zeiterfassung-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('CSV-Export erstellt', 'success');
    } catch {
      showToast('Export fehlgeschlagen', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const getMemberName = (member: TeamMember | undefined) => {
    if (!member) return 'Unbekannt';
    return member.displayName || member.username;
  };

  const getEntryScopeBadge = (entry: typeof entries[0]) => {
    if (entry.entryScope === 'internal') {
      const categoryLabel = entry.internalCategory
        ? INTERNAL_CATEGORY_LABELS[entry.internalCategory] || entry.internalCategory
        : 'Intern';
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-400">
          <Coffee size={12} />
          {categoryLabel}
        </span>
      );
    }
    if (entry.entryScope === 'absence') {
      const categoryLabel = entry.internalCategory
        ? ABSENCE_CATEGORY_LABELS[entry.internalCategory] || entry.internalCategory
        : 'Abwesenheit';
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
          <Calendar size={12} />
          {categoryLabel}
        </span>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">Fehler beim Laden der Team-Zeiten. Möglicherweise fehlen Berechtigungen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-lighter dark:bg-accent-primary/30 rounded-xl">
              <Users className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Team-Zeitübersicht</h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Alle Zeiteinträge deiner Teammitglieder
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Filter size={16} />}
              onClick={() => setShowFilters(!showFilters)}
            >
              Filter
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              onClick={handleExport}
              disabled={isExporting || isLoading}
            >
              CSV Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-dark-border">
            {/* Member filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
                Mitarbeiter
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="">Alle Mitarbeiter</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberName(member)}
                  </option>
                ))}
              </select>
            </div>

            {/* Scope filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
                Buchungsart
              </label>
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value as EntryScope | '')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="">Alle Buchungsarten</option>
                <option value="customer_project">Projektzeit</option>
                <option value="internal">Interne Zeit</option>
                <option value="absence">Abwesenheit</option>
              </select>
            </div>

            {/* Date range type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
                Zeitraum
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="month">Monat</option>
                <option value="quarter">Quartal</option>
                <option value="year">Jahr</option>
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </div>

            {/* Date range value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
                {dateRange === 'month' ? 'Monat' : dateRange === 'quarter' ? 'Quartal' : dateRange === 'year' ? 'Jahr' : 'Von - Bis'}
              </label>
              {dateRange === 'month' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
              )}
              {dateRange === 'quarter' && (
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {[1, 2, 3, 4].map((q) => {
                    const year = new Date().getFullYear();
                    return (
                      <option key={`${year}-Q${q}`} value={`${year}-Q${q}`}>Q{q} {year}</option>
                    );
                  })}
                </select>
              )}
              {dateRange === 'year' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {[0, 1, 2].map((offset) => {
                    const year = new Date().getFullYear() - offset;
                    return <option key={year} value={String(year)}>{year}</option>;
                  })}
                </select>
              )}
              {dateRange === 'custom' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => setCustomDateFrom(e.target.value)}
                    className="flex-1 px-2 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => setCustomDateTo(e.target.value)}
                    className="flex-1 px-2 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
              <Clock size={16} />
              <span className="text-sm">Gesamt</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatDuration(stats.totalDuration)}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-400">{stats.entryCount} Einträge</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
              <Briefcase size={16} />
              <span className="text-sm">Projektzeit</span>
            </div>
            <p className="text-2xl font-bold text-accent-primary">
              {formatDuration(stats.projectDuration)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
              <Coffee size={16} />
              <span className="text-sm">Intern</span>
            </div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {formatDuration(stats.internalDuration)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
              <Calendar size={16} />
              <span className="text-sm">Abwesenheit</span>
            </div>
            <p className="text-2xl font-bold text-orange-500">
              {formatDuration(stats.absenceDuration)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
              <Clock size={16} className="text-green-500" />
              <span className="text-sm">Verrechenbar</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatDuration(stats.billableDuration)}
            </p>
          </Card>
        </div>
      )}

      {/* Summary by member */}
      {entriesByUser.length > 0 && !selectedUserId && (
        <Card className="p-6">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-left"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Zusammenfassung nach Mitarbeiter
            </h3>
            {showDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {showDetails && (
            <div className="mt-4 space-y-3">
              {entriesByUser.map(({ member, duration, count }) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-dark-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent-lighter dark:bg-accent-primary/30 flex items-center justify-center">
                      <span className="text-sm font-medium text-accent-primary">
                        {getMemberName(member).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{getMemberName(member)}</p>
                      <p className="text-xs text-gray-500 dark:text-dark-400">{count} Einträge</p>
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatDuration(duration)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Entries list */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Zeiteinträge {entries.length > 0 && `(${entries.length})`}
          </h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-accent-primary" />
            <p className="mt-2 text-gray-500 dark:text-dark-400">Lade Einträge...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-dark-400">
            Keine Einträge für den gewählten Zeitraum gefunden.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-[600px] overflow-y-auto">
            {entries.map((entry) => {
              const member = members.find(m => m.id === entry.userId);
              return (
                <div
                  key={entry.id}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-dark-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getMemberName(member)}
                        </span>
                        {getEntryScopeBadge(entry)}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-dark-400">
                        {entry.entryScope === 'customer_project' ? (
                          <>
                            {entry.customerName && <span className="font-medium">{entry.customerName}</span>}
                            {entry.projectName && <span> / {entry.projectName}</span>}
                            {entry.activityName && <span className="text-gray-500"> ({entry.activityName})</span>}
                          </>
                        ) : (
                          entry.description || '-'
                        )}
                      </p>
                      {entry.entryScope === 'customer_project' && entry.description && (
                        <p className="text-sm text-gray-500 dark:text-dark-500 mt-1 truncate">
                          {entry.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatDuration(entry.duration || 0)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        {formatDate(entry.startTime)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        {formatTime(entry.startTime)} - {entry.endTime ? formatTime(entry.endTime) : 'laufend'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
