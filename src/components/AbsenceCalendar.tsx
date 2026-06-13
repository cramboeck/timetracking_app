import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react';
import { TimeEntry } from '../types';
import { Card } from './ui/Card';
import { Button, IconButton } from './ui/Button';

interface AbsenceCalendarProps {
  entries: TimeEntry[];
  onAddAbsence?: (date: string, category: string) => void;
}

const ABSENCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  vacation: { bg: 'bg-green-500', text: 'text-green-700 dark:text-green-400', label: 'Urlaub' },
  sick: { bg: 'bg-red-500', text: 'text-red-700 dark:text-red-400', label: 'Krankheit' },
  special_leave: { bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', label: 'Sonderurlaub' },
};

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const AbsenceCalendar = ({ entries, onAddAbsence }: AbsenceCalendarProps) => {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Filter absence entries only
  const absenceEntries = useMemo(() => {
    return entries.filter(e => e.entryScope === 'absence');
  }, [entries]);

  // Group absences by date (YYYY-MM-DD)
  const absencesByDate = useMemo(() => {
    const map: Record<string, { category: string; hours: number }[]> = {};

    absenceEntries.forEach(entry => {
      const date = new Date(entry.startTime);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push({
        category: entry.internalCategory || 'vacation',
        hours: (entry.duration || 0) / 3600,
      });
    });

    return map;
  }, [absenceEntries]);

  // Calendar grid for current view month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    // Start from Monday (adjust for German week start)
    const startOffset = (firstDay.getDay() + 6) % 7;
    const days: (Date | null)[] = [];

    // Add empty cells for days before the month starts
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i));
    }

    // Fill remaining cells to complete the grid
    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [viewMonth]);

  // Calculate stats for current month
  const monthStats = useMemo(() => {
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0, 23, 59, 59);

    const monthAbsences = absenceEntries.filter(e => {
      const date = new Date(e.startTime);
      return date >= monthStart && date <= monthEnd;
    });

    const byCategory: Record<string, number> = {};
    let totalHours = 0;

    monthAbsences.forEach(entry => {
      const hours = (entry.duration || 0) / 3600;
      const cat = entry.internalCategory || 'vacation';
      byCategory[cat] = (byCategory[cat] || 0) + hours;
      totalHours += hours;
    });

    return { byCategory, totalHours, totalDays: totalHours / 8 };
  }, [absenceEntries, viewMonth]);

  // Year stats
  const yearStats = useMemo(() => {
    const yearStart = new Date(viewMonth.getFullYear(), 0, 1);
    const yearEnd = new Date(viewMonth.getFullYear(), 11, 31, 23, 59, 59);

    const yearAbsences = absenceEntries.filter(e => {
      const date = new Date(e.startTime);
      return date >= yearStart && date <= yearEnd;
    });

    const byCategory: Record<string, number> = {};
    let totalHours = 0;

    yearAbsences.forEach(entry => {
      const hours = (entry.duration || 0) / 3600;
      const cat = entry.internalCategory || 'vacation';
      byCategory[cat] = (byCategory[cat] || 0) + hours;
      totalHours += hours;
    });

    return { byCategory, totalHours, totalDays: totalHours / 8 };
  }, [absenceEntries, viewMonth]);

  const navigateMonth = (delta: number) => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const formatMonthLabel = (date: Date) => {
    return date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleDayClick = (date: Date) => {
    if (onAddAbsence) {
      const dateKey = getDateKey(date);
      onAddAbsence(dateKey, 'vacation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
            <Calendar className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Abwesenheitskalender</h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Übersicht deiner Urlaubs- und Krankheitstage
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4">
          {Object.entries(ABSENCE_COLORS).map(([key, { bg, label }]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${bg}`} />
              <span className="text-sm text-gray-600 dark:text-dark-400">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Calendar Navigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconButton
              icon={<ChevronLeft size={20} />}
              onClick={() => navigateMonth(-1)}
              variant="default"
              size="sm"
            />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center">
              {formatMonthLabel(viewMonth)}
            </h3>
            <IconButton
              icon={<ChevronRight size={20} />}
              onClick={() => navigateMonth(1)}
              variant="default"
              size="sm"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Heute
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAY_LABELS.map((day, i) => (
            <div
              key={day}
              className={`text-center text-sm font-medium py-2 ${
                i >= 5 ? 'text-gray-400 dark:text-dark-500' : 'text-gray-600 dark:text-dark-400'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dateKey = getDateKey(date);
            const absences = absencesByDate[dateKey] || [];
            const hasAbsence = absences.length > 0;
            const primaryAbsence = absences[0];
            const absenceColor = primaryAbsence ? ABSENCE_COLORS[primaryAbsence.category] : null;
            const totalHours = absences.reduce((sum, a) => sum + a.hours, 0);
            const isFullDay = totalHours >= 8;

            return (
              <button
                key={dateKey}
                onClick={() => handleDayClick(date)}
                className={`
                  aspect-square p-1 rounded-lg relative transition-all
                  ${isToday(date) ? 'ring-2 ring-accent-primary ring-offset-2 dark:ring-offset-dark-100' : ''}
                  ${isWeekend(date) && !hasAbsence ? 'bg-gray-50 dark:bg-dark-200' : ''}
                  ${hasAbsence && isFullDay ? `${absenceColor?.bg} text-white` : ''}
                  ${hasAbsence && !isFullDay ? 'bg-gray-100 dark:bg-dark-200' : ''}
                  ${!hasAbsence ? 'hover:bg-gray-100 dark:hover:bg-dark-200' : 'hover:opacity-90'}
                `}
              >
                <span className={`
                  text-sm font-medium
                  ${hasAbsence && isFullDay ? 'text-white' : ''}
                  ${hasAbsence && !isFullDay ? absenceColor?.text : ''}
                  ${!hasAbsence && isWeekend(date) ? 'text-gray-400 dark:text-dark-500' : ''}
                  ${!hasAbsence && !isWeekend(date) ? 'text-gray-700 dark:text-dark-300' : ''}
                `}>
                  {date.getDate()}
                </span>

                {/* Partial day indicator */}
                {hasAbsence && !isFullDay && (
                  <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${absenceColor?.bg}`} />
                )}

                {/* Multiple absences indicator */}
                {absences.length > 1 && (
                  <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-white dark:bg-dark-100 rounded-full text-[10px] font-bold flex items-center justify-center text-gray-700 dark:text-white">
                    {absences.length}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* This Month */}
        <Card className="p-4">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
            {formatMonthLabel(viewMonth)}
          </h4>
          {monthStats.totalHours > 0 ? (
            <div className="space-y-2">
              {Object.entries(monthStats.byCategory).map(([cat, hours]) => {
                const color = ABSENCE_COLORS[cat] || ABSENCE_COLORS.vacation;
                const days = hours / 8;
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${color.bg}`} />
                      <span className="text-sm text-gray-600 dark:text-dark-400">{color.label}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {days.toFixed(1)} Tage
                    </span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-gray-200 dark:border-dark-border flex justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-400">Gesamt</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {monthStats.totalDays.toFixed(1)} Tage
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-dark-400">Keine Abwesenheiten</p>
          )}
        </Card>

        {/* This Year */}
        <Card className="p-4">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
            Jahr {viewMonth.getFullYear()}
          </h4>
          {yearStats.totalHours > 0 ? (
            <div className="space-y-2">
              {Object.entries(yearStats.byCategory).map(([cat, hours]) => {
                const color = ABSENCE_COLORS[cat] || ABSENCE_COLORS.vacation;
                const days = hours / 8;
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${color.bg}`} />
                      <span className="text-sm text-gray-600 dark:text-dark-400">{color.label}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {days.toFixed(1)} Tage
                    </span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-gray-200 dark:border-dark-border flex justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-dark-400">Gesamt</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {yearStats.totalDays.toFixed(1)} Tage
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-dark-400">Keine Abwesenheiten</p>
          )}
        </Card>
      </div>

      {/* Add Absence Hint */}
      {onAddAbsence && (
        <Card className="p-4 bg-gray-50 dark:bg-dark-200 border-dashed">
          <div className="flex items-center gap-3 text-gray-600 dark:text-dark-400">
            <Plus size={20} />
            <span className="text-sm">
              Klicke auf einen Tag im Kalender, um eine Abwesenheit zu erfassen
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};
