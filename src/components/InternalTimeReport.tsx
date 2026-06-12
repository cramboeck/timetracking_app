import { useMemo, useState } from 'react';
import { Coffee, Calendar, Clock, TrendingUp, ChevronDown, ChevronUp, Download, Mail, FileText } from 'lucide-react';
import { TimeEntry } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useToast } from '../contexts/UIContext';

interface InternalTimeReportProps {
  entries: TimeEntry[];
}

// Category labels
const INTERNAL_CATEGORY_LABELS: Record<string, string> = {
  admin: 'Administration',
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

// Category colors for visual distinction
const INTERNAL_CATEGORY_COLORS: Record<string, string> = {
  admin: 'bg-blue-500',
  sales: 'bg-green-500',
  marketing: 'bg-purple-500',
  training: 'bg-yellow-500',
  meeting: 'bg-pink-500',
  internal_support: 'bg-cyan-500',
  travel: 'bg-indigo-500',
};

const ABSENCE_CATEGORY_COLORS: Record<string, string> = {
  vacation: 'bg-green-500',
  sick: 'bg-red-500',
  special_leave: 'bg-amber-500',
};

const WEEKLY_GOAL_HOURS = 40;

export const InternalTimeReport = ({ entries }: InternalTimeReportProps) => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showDetails, setShowDetails] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Filter entries for selected month
  const monthEntries = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    return entries.filter(e => {
      const date = new Date(e.startTime);
      return date >= startOfMonth && date <= endOfMonth;
    });
  }, [entries, selectedMonth]);

  // Calculate stats by entry scope
  const stats = useMemo(() => {
    const internalByCategory: Record<string, number> = {};
    const absenceByCategory: Record<string, number> = {};
    let totalProjectHours = 0;
    let totalInternalHours = 0;
    let totalAbsenceHours = 0;

    monthEntries.forEach(entry => {
      const hours = entry.duration / 3600;

      if (entry.entryScope === 'internal') {
        totalInternalHours += hours;
        const cat = entry.internalCategory || 'unknown';
        internalByCategory[cat] = (internalByCategory[cat] || 0) + hours;
      } else if (entry.entryScope === 'absence') {
        totalAbsenceHours += hours;
        const cat = entry.internalCategory || 'unknown';
        absenceByCategory[cat] = (absenceByCategory[cat] || 0) + hours;
      } else {
        totalProjectHours += hours;
      }
    });

    return {
      totalProjectHours,
      totalInternalHours,
      totalAbsenceHours,
      totalHours: totalProjectHours + totalInternalHours + totalAbsenceHours,
      internalByCategory,
      absenceByCategory,
    };
  }, [monthEntries]);

  // Calculate weeks in selected month for goal comparison
  const weeksInMonth = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    // Approximate weeks (days / 7)
    const days = endOfMonth.getDate();
    return Math.round(days / 7 * 10) / 10; // Round to 1 decimal
  }, [selectedMonth]);

  const monthlyGoalHours = weeksInMonth * WEEKLY_GOAL_HOURS;
  const goalProgress = Math.min(100, (stats.totalHours / monthlyGoalHours) * 100);

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

  // Export to CSV
  const exportToCSV = () => {
    const internalAndAbsenceEntries = monthEntries.filter(
      e => e.entryScope === 'internal' || e.entryScope === 'absence'
    );

    const headers = ['Datum', 'Typ', 'Kategorie', 'Stunden', 'Beschreibung'];
    const rows = internalAndAbsenceEntries.map(entry => {
      const date = new Date(entry.startTime);
      const isInternal = entry.entryScope === 'internal';
      const categoryLabels = isInternal ? INTERNAL_CATEGORY_LABELS : ABSENCE_CATEGORY_LABELS;
      const category = entry.internalCategory ? categoryLabels[entry.internalCategory] || entry.internalCategory : '';

      return [
        date.toLocaleDateString('de-DE'),
        isInternal ? 'Intern' : 'Abwesenheit',
        category,
        (entry.duration / 3600).toFixed(2),
        `"${(entry.description || '').replace(/"/g, '""')}"`,
      ].join(';');
    });

    // Add summary
    rows.push('');
    rows.push(`Zusammenfassung ${formatMonthLabel(selectedMonth)}`);
    rows.push(`Projektzeit gesamt;${stats.totalProjectHours.toFixed(2)} h`);
    rows.push(`Interne Zeit gesamt;${stats.totalInternalHours.toFixed(2)} h`);
    rows.push(`Abwesenheit gesamt;${stats.totalAbsenceHours.toFixed(2)} h`);
    rows.push(`GESAMT;${stats.totalHours.toFixed(2)} h`);

    const csvContent = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Arbeitszeit_${selectedMonth}_${currentUser?.name || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('CSV-Export erstellt', 'success');
  };

  // Export summary as text for email
  const generateReportText = () => {
    const lines = [
      `ARBEITSZEITNACHWEIS`,
      `==================`,
      ``,
      `Mitarbeiter: ${currentUser?.name || 'N/A'}`,
      `Zeitraum: ${formatMonthLabel(selectedMonth)}`,
      ``,
      `ZUSAMMENFASSUNG`,
      `---------------`,
      `Projektzeit:     ${stats.totalProjectHours.toFixed(1)} Stunden`,
      `Interne Zeit:    ${stats.totalInternalHours.toFixed(1)} Stunden`,
      `Abwesenheit:     ${stats.totalAbsenceHours.toFixed(1)} Stunden (${(stats.totalAbsenceHours / 8).toFixed(1)} Tage)`,
      ``,
      `GESAMT:          ${stats.totalHours.toFixed(1)} Stunden`,
      `Monatsziel:      ${monthlyGoalHours.toFixed(1)} Stunden (${Math.round(goalProgress)}% erreicht)`,
      ``,
    ];

    if (stats.totalInternalHours > 0) {
      lines.push(`INTERNE ZEIT NACH KATEGORIE`);
      lines.push(`---------------------------`);
      Object.entries(stats.internalByCategory)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, hours]) => {
          const label = INTERNAL_CATEGORY_LABELS[cat] || cat;
          lines.push(`${label}: ${hours.toFixed(1)} h`);
        });
      lines.push(``);
    }

    if (stats.totalAbsenceHours > 0) {
      lines.push(`ABWESENHEITEN`);
      lines.push(`-------------`);
      Object.entries(stats.absenceByCategory)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, hours]) => {
          const label = ABSENCE_CATEGORY_LABELS[cat] || cat;
          lines.push(`${label}: ${(hours / 8).toFixed(1)} Tage (${hours.toFixed(1)} h)`);
        });
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`Erstellt am: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

    return lines.join('\n');
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    const text = generateReportText();
    navigator.clipboard.writeText(text).then(() => {
      showToast('Bericht in Zwischenablage kopiert', 'success');
    }).catch(() => {
      showToast('Kopieren fehlgeschlagen', 'error');
    });
  };

  // Open email client
  const sendViaEmail = () => {
    const subject = encodeURIComponent(`Arbeitszeitnachweis ${formatMonthLabel(selectedMonth)} - ${currentUser?.name || ''}`);
    const body = encodeURIComponent(generateReportText());
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    showToast('E-Mail-Programm wird geöffnet', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header with Month Selector and Export */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gray-100 dark:bg-dark-200 rounded-xl">
              <Coffee className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Interne Auswertung
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Übersicht über interne Zeit und Abwesenheiten
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            >
              {availableMonths.map(month => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Export Actions */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Arbeitszeitnachweis exportieren</h3>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Für Steuerberater, Lohnabrechnung oder Dokumentation
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={exportToCSV}
                variant="secondary"
                size="sm"
                icon={<Download size={16} />}
              >
                CSV Export
              </Button>
              <Button
                onClick={copyToClipboard}
                variant="secondary"
                size="sm"
                icon={<FileText size={16} />}
              >
                Kopieren
              </Button>
              <Button
                onClick={sendViaEmail}
                variant="primary"
                size="sm"
                icon={<Mail size={16} />}
              >
                Per E-Mail senden
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
            <Clock size={16} />
            <span className="text-sm">Gesamt</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalHours.toFixed(1)} h
          </p>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 dark:text-dark-400 mb-1">
              <span>Monatsziel</span>
              <span>{Math.round(goalProgress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-dark-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${goalProgress >= 100 ? 'bg-green-500' : 'bg-accent-primary'}`}
                style={{ width: `${goalProgress}%` }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-accent-primary mb-1">
            <TrendingUp size={16} />
            <span className="text-sm">Projektzeit</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalProjectHours.toFixed(1)} h
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
            {stats.totalHours > 0 ? Math.round((stats.totalProjectHours / stats.totalHours) * 100) : 0}% der Gesamtzeit
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
            <Coffee size={16} />
            <span className="text-sm">Interne Zeit</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalInternalHours.toFixed(1)} h
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
            {stats.totalHours > 0 ? Math.round((stats.totalInternalHours / stats.totalHours) * 100) : 0}% der Gesamtzeit
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
            <Calendar size={16} />
            <span className="text-sm">Abwesenheit</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.totalAbsenceHours.toFixed(1)} h
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
            {(stats.totalAbsenceHours / 8).toFixed(1)} Tage
          </p>
        </Card>
      </div>

      {/* Internal Time by Category */}
      {stats.totalInternalHours > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Coffee size={20} className="text-gray-500" />
            Interne Zeit nach Kategorie
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.internalByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([category, hours]) => {
                const percentage = (hours / stats.totalInternalHours) * 100;
                const label = INTERNAL_CATEGORY_LABELS[category] || category;
                const colorClass = INTERNAL_CATEGORY_COLORS[category] || 'bg-gray-500';

                return (
                  <div key={category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-dark-500">{label}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {hours.toFixed(1)} h ({Math.round(percentage)}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-dark-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colorClass}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Absence by Category */}
      {stats.totalAbsenceHours > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-orange-500" />
            Abwesenheiten nach Grund
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.absenceByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([category, hours]) => {
                const percentage = (hours / stats.totalAbsenceHours) * 100;
                const label = ABSENCE_CATEGORY_LABELS[category] || category;
                const colorClass = ABSENCE_CATEGORY_COLORS[category] || 'bg-gray-500';
                const days = hours / 8;

                return (
                  <div key={category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-dark-500">{label}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {days.toFixed(1)} Tage ({hours.toFixed(1)} h)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-dark-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colorClass}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {stats.totalInternalHours === 0 && stats.totalAbsenceHours === 0 && (
        <Card className="p-8 text-center">
          <Coffee size={48} className="mx-auto mb-4 text-gray-300 dark:text-dark-300" />
          <p className="text-gray-500 dark:text-dark-400">
            Keine internen Zeiten oder Abwesenheiten in diesem Monat erfasst.
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-400 mt-2">
            Nutze die Stoppuhr oder manuelle Erfassung um interne Tätigkeiten zu tracken.
          </p>
        </Card>
      )}

      {/* Details Toggle for Entries */}
      {(stats.totalInternalHours > 0 || stats.totalAbsenceHours > 0) && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showDetails ? 'Details ausblenden' : 'Details anzeigen'}
        </button>
      )}

      {/* Detailed Entries List */}
      {showDetails && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Einzelne Einträge
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-border">
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-dark-400 font-medium">Datum</th>
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-dark-400 font-medium">Typ</th>
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-dark-400 font-medium">Kategorie</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-dark-400 font-medium">Dauer</th>
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-dark-400 font-medium">Beschreibung</th>
                </tr>
              </thead>
              <tbody>
                {monthEntries
                  .filter(e => e.entryScope === 'internal' || e.entryScope === 'absence')
                  .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                  .map(entry => {
                    const date = new Date(entry.startTime);
                    const isInternal = entry.entryScope === 'internal';
                    const categoryLabels = isInternal ? INTERNAL_CATEGORY_LABELS : ABSENCE_CATEGORY_LABELS;
                    const category = entry.internalCategory ? categoryLabels[entry.internalCategory] || entry.internalCategory : '-';

                    return (
                      <tr key={entry.id} className="border-b border-gray-100 dark:border-dark-border/50">
                        <td className="py-2 px-2 text-gray-900 dark:text-white">
                          {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                            isInternal
                              ? 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-dark-200'
                              : 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30'
                          }`}>
                            {isInternal ? <Coffee size={12} /> : <Calendar size={12} />}
                            {isInternal ? 'Intern' : 'Abwesend'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-gray-700 dark:text-dark-500">{category}</td>
                        <td className="py-2 px-2 text-right font-medium text-gray-900 dark:text-white">
                          {(entry.duration / 3600).toFixed(1)} h
                        </td>
                        <td className="py-2 px-2 text-gray-500 dark:text-dark-400 truncate max-w-[200px]">
                          {entry.description || '-'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
