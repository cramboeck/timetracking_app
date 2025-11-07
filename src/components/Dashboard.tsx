import { useState, useMemo } from 'react';
import { Download, Calendar, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { TimeEntry, Project, Customer } from '../types';
import jsPDF from 'jspdf';

interface DashboardProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
}

interface ProjectStats {
  projectId: string;
  projectName: string;
  customerName: string;
  customerColor: string;
  totalSeconds: number;
  totalAmount: number;
  hourlyRate: number;
  entryCount: number;
}

export const Dashboard = ({ entries, projects, customers }: DashboardProps) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const getProjectById = (id: string) => projects.find(p => p.id === id);
  const getCustomerById = (id: string) => customers.find(c => c.id === id);

  // Filter entries by selected month
  const monthlyEntries = useMemo(() => {
    return entries.filter(entry => {
      const entryDate = new Date(entry.startTime);
      const entryMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      return entryMonth === selectedMonth && !entry.isRunning;
    });
  }, [entries, selectedMonth]);

  // Calculate statistics
  const stats = useMemo(() => {
    const projectMap = new Map<string, ProjectStats>();

    monthlyEntries.forEach(entry => {
      const project = getProjectById(entry.projectId);
      const customer = project ? getCustomerById(project.customerId) : null;

      if (!project || !customer) return;

      const existing = projectMap.get(entry.projectId);
      const hours = entry.duration / 3600;
      const amount = hours * project.hourlyRate;

      if (existing) {
        existing.totalSeconds += entry.duration;
        existing.totalAmount += amount;
        existing.entryCount += 1;
      } else {
        projectMap.set(entry.projectId, {
          projectId: entry.projectId,
          projectName: project.name,
          customerName: customer.name,
          customerColor: customer.color,
          totalSeconds: entry.duration,
          totalAmount: amount,
          hourlyRate: project.hourlyRate,
          entryCount: 1
        });
      }
    });

    return Array.from(projectMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [monthlyEntries, projects, customers]);

  const totalSeconds = stats.reduce((sum, s) => sum + s.totalSeconds, 0);
  const totalAmount = stats.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalHours = totalSeconds / 3600;

  // Generate available months
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    entries.forEach(entry => {
      const date = new Date(entry.startTime);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(month);
    });
    return Array.from(months).sort().reverse();
  }, [entries]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

    // Header
    doc.setFontSize(20);
    doc.text('Stundenbericht', 20, 20);
    doc.setFontSize(12);
    doc.text(monthName, 20, 30);

    // Summary
    doc.setFontSize(10);
    doc.text(`Gesamtstunden: ${totalHours.toFixed(2)} h`, 20, 45);
    doc.text(`Gesamtbetrag: ${totalAmount.toFixed(2)} EUR`, 20, 52);

    // Table Header
    let y = 70;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Kunde', 20, y);
    doc.text('Projekt', 70, y);
    doc.text('Stunden', 120, y);
    doc.text('Satz', 145, y);
    doc.text('Betrag', 170, y);

    // Table Rows
    y += 7;
    doc.setFont('helvetica', 'normal');

    stats.forEach((stat) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const hours = stat.totalSeconds / 3600;
      doc.text(stat.customerName.substring(0, 25), 20, y);
      doc.text(stat.projectName.substring(0, 25), 70, y);
      doc.text(hours.toFixed(2), 120, y);
      doc.text(stat.hourlyRate.toFixed(2), 145, y);
      doc.text(stat.totalAmount.toFixed(2), 170, y);

      y += 7;
    });

    // Total
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamt:', 100, y);
    doc.text(totalHours.toFixed(2), 120, y);
    doc.text(totalAmount.toFixed(2) + ' EUR', 170, y);

    // Save
    doc.save(`Stundenbericht_${monthName.replace(' ', '_')}.pdf`);
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col h-full p-6 dark:bg-gray-900">
        <h1 className="text-2xl font-bold mb-6 dark:text-white">Dashboard</h1>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
            <p>Noch keine Daten vorhanden</p>
            <p className="text-sm mt-2">Erfasse Zeit um Statistiken zu sehen</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold dark:text-white">Dashboard & Reports</h1>
          {monthlyEntries.length > 0 && (
            <button
              onClick={generatePDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              PDF Export
            </button>
          )}
        </div>
      </div>

      {/* Month Selector */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-gray-600 dark:text-gray-400" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableMonths.map(month => {
              const [year, m] = month.split('-');
              const date = new Date(parseInt(year), parseInt(m) - 1);
              const label = date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
              return (
                <option key={month} value={month}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="text-blue-600" size={24} />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Gesamtstunden</h3>
            </div>
            <p className="text-3xl font-bold dark:text-white">{totalHours.toFixed(2)} h</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="text-green-600" size={24} />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Gesamtumsatz</h3>
            </div>
            <p className="text-3xl font-bold dark:text-white">{totalAmount.toFixed(2)} €</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="text-purple-600" size={24} />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Projekte</h3>
            </div>
            <p className="text-3xl font-bold dark:text-white">{stats.length}</p>
          </div>
        </div>

        {/* Project Breakdown */}
        {monthlyEntries.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <Calendar size={48} className="mx-auto mb-4 text-gray-400 opacity-50" />
            <p className="text-gray-500 dark:text-gray-400">Keine Einträge für diesen Monat</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold mb-4 dark:text-white">Aufschlüsselung nach Projekt</h2>
            <div className="space-y-4">
              {stats.map((stat) => {
                const hours = stat.totalSeconds / 3600;
                const percentage = (stat.totalSeconds / totalSeconds) * 100;

                return (
                  <div key={stat.projectId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: stat.customerColor }}
                        />
                        <div>
                          <p className="font-medium dark:text-white">{stat.projectName}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{stat.customerName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold dark:text-white">{hours.toFixed(2)} h</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{stat.totalAmount.toFixed(2)} €</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: stat.customerColor
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{stat.entryCount} Einträge</span>
                      <span>{percentage.toFixed(1)}% der Gesamtzeit</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
