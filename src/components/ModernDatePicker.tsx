import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './ui';

interface ModernDatePickerProps {
  value: string; // Format: "YYYY-MM-DD"
  onChange: (value: string) => void;
  label?: string;
  maxDate?: string;
}

export const ModernDatePicker = ({
  value,
  onChange,
  label,
  maxDate,
}: ModernDatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? new Date(value) : null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get today's date (recalculated on each render to stay current)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Quick dates - calculate fresh each time
  const quickDates = [
    {
      label: 'Heute',
      date: new Date(today),
      shortLabel: 'Heute'
    },
    {
      label: 'Gestern',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
      shortLabel: 'Gestern'
    },
    {
      label: 'Vorgestern',
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
      shortLabel: 'Vorgestern'
    },
  ];

  // Week days starting from Monday - calculate fresh
  const weekDays = (() => {
    const days = [];
    const startOfWeek = new Date(today);
    // Get Monday of current week (handles Sunday correctly)
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = go back 6 days
    startOfWeek.setDate(today.getDate() + diff);

    for (let i = -7; i <= 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  })();

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    // Start from Monday
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

    return days;
  }, [viewMonth]);

  const formatDate = (d: Date) => {
    return d.toISOString().split('T')[0];
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const isSelectedDate = (d: Date | null) => {
    if (!d || !selectedDate) return false;
    return formatDate(d) === formatDate(selectedDate);
  };

  const isToday = (d: Date | null) => {
    if (!d) return false;
    return formatDate(d) === formatDate(today);
  };

  const isFuture = (d: Date | null) => {
    if (!d) return false;
    return d > today;
  };

  const handleSelectDate = (d: Date) => {
    if (isFuture(d)) return;
    onChange(formatDate(d));
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}

      {/* Quick Date Buttons */}
      <div className="flex gap-2 mb-3">
        {quickDates.map(({ label, date, shortLabel }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(formatDate(date))}
            className={`
              flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200
              ${formatDate(date) === value
                ? 'bg-accent-primary text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }
            `}
          >
            {shortLabel}
          </button>
        ))}
      </div>

      {/* Week Scroll */}
      <div className="overflow-x-auto pb-2 scrollbar-hide mb-3">
        <div className="flex gap-2" style={{ width: 'max-content' }}>
          {weekDays.map((d, i) => {
            const isSelected = selectedDate && formatDate(d) === formatDate(selectedDate);
            const isTodayDate = formatDate(d) === formatDate(today);
            const isFutureDate = d > today;

            return (
              <button
                key={i}
                type="button"
                onClick={() => !isFutureDate && handleSelectDate(d)}
                disabled={isFutureDate}
                className={`
                  flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-all duration-200
                  ${isSelected
                    ? 'bg-accent-primary text-white shadow-lg scale-105'
                    : isTodayDate
                      ? 'bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400'
                      : isFutureDate
                        ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }
                `}
              >
                <span className="text-[10px] uppercase font-medium opacity-70">
                  {d.toLocaleDateString('de-DE', { weekday: 'short' })}
                </span>
                <span className="text-lg font-bold">
                  {d.getDate()}
                </span>
                <span className="text-[10px] opacity-70">
                  {d.toLocaleDateString('de-DE', { month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-3 px-4 py-3
          bg-white dark:bg-gray-800
          border-2 rounded-xl
          transition-all duration-200
          ${isOpen
            ? 'border-accent-primary ring-2 ring-accent-primary/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
            <Calendar size={20} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-left">
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {value ? formatDisplayDate(value) : 'Datum wählen'}
            </span>
          </div>
        </div>
        <ChevronRight size={20} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <IconButton
              icon={<ChevronLeft size={20} />}
              size="md"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            />
            <span className="font-semibold text-gray-900 dark:text-white">
              {viewMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </span>
            <IconButton
              icon={<ChevronRight size={20} />}
              size="md"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
            />
          </div>

          {/* Day Labels */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => d && handleSelectDate(d)}
                disabled={!d || isFuture(d)}
                className={`
                  aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors
                  ${!d
                    ? 'invisible'
                    : isSelectedDate(d)
                      ? 'bg-accent-primary text-white'
                      : isToday(d)
                        ? 'bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400'
                        : isFuture(d)
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                {d?.getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
