import { useState, useMemo } from 'react';
import { Download, Calendar, TrendingUp, Clock, DollarSign, FileText, PieChart as PieChartIcon } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import jsPDF from 'jspdf';
import { storage } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { ReportAssistant } from './ReportAssistant';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface DashboardProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
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

type TimeframeType = 'month' | 'quarter' | 'year' | 'custom';

export const Dashboard = ({ entries, projects, customers, activities }: DashboardProps) => {
  const { currentUser } = useAuth();
  const [timeframeType, setTimeframeType] = useState<TimeframeType>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [reportAssistantOpen, setReportAssistantOpen] = useState(false);

  const getProjectById = (id: string) => projects.find(p => p.id === id);
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const getActivityById = (id: string) => activities.find(a => a.id === id);

  const calculateAmount = (entry: TimeEntry): number => {
    const hours = entry.duration / 3600;
    const project = getProjectById(entry.projectId);

    // Check if entry has an activity with flat rate
    if (entry.activityId) {
      const activity = getActivityById(entry.activityId);
      if (activity && activity.pricingType === 'flat' && activity.flatRate) {
        return activity.flatRate;
      }
    }

    // Otherwise use hourly rate
    return project ? hours * project.hourlyRate : 0;
  };

  // Get current quarter/year based on selected month
  const getCurrentQuarter = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const quarter = Math.floor((month - 1) / 3) + 1;
    return { year, quarter };
  };

  // Filter entries based on all criteria
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (entry.isRunning) return false;

      const entryDate = new Date(entry.startTime);
      const project = getProjectById(entry.projectId);

      // Filter by customer
      if (selectedCustomer !== 'all' && project?.customerId !== selectedCustomer) {
        return false;
      }

      // Filter by project
      if (selectedProject !== 'all' && entry.projectId !== selectedProject) {
        return false;
      }

      // Filter by timeframe
      if (timeframeType === 'month') {
        const entryMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
        return entryMonth === selectedMonth;
      } else if (timeframeType === 'quarter') {
        const { year, quarter } = getCurrentQuarter();
        const entryYear = entryDate.getFullYear();
        const entryQuarter = Math.floor(entryDate.getMonth() / 3) + 1;
        return entryYear === year && entryQuarter === quarter;
      } else if (timeframeType === 'year') {
        const [year] = selectedMonth.split('-').map(Number);
        return entryDate.getFullYear() === year;
      } else if (timeframeType === 'custom') {
        if (!customStartDate || !customEndDate) return true;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        return entryDate >= start && entryDate <= end;
      }

      return true;
    });
  }, [entries, selectedMonth, selectedCustomer, selectedProject, timeframeType, customStartDate, customEndDate, projects]);

  // Calculate statistics
  const stats = useMemo(() => {
    const projectMap = new Map<string, ProjectStats>();

    filteredEntries.forEach(entry => {
      const project = getProjectById(entry.projectId);
      const customer = project ? getCustomerById(project.customerId) : null;

      if (!project || !customer) return;

      const existing = projectMap.get(entry.projectId);
      const amount = calculateAmount(entry);

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
  }, [filteredEntries, projects, customers, activities]);

  const totalSeconds = stats.reduce((sum, s) => sum + s.totalSeconds, 0);
  const totalAmount = stats.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalHours = totalSeconds / 3600;

  // Prepare data for pie chart (by customer)
  const pieChartData = useMemo(() => {
    const customerMap = new Map<string, { name: string; hours: number; color: string }>();

    console.log('📊 [PIE CHART DEBUG] Total filtered entries:', filteredEntries.length);

    filteredEntries.forEach((entry, index) => {
      const project = getProjectById(entry.projectId);
      const customer = project ? getCustomerById(project.customerId) : null;

      console.log(`📊 [PIE CHART DEBUG] Entry ${index}:`, {
        entryId: entry.id,
        projectId: entry.projectId,
        projectName: project?.name,
        customerId: project?.customerId,
        customerName: customer?.name,
        duration: entry.duration,
        hours: entry.duration / 3600
      });

      if (!customer) {
        console.warn(`⚠️ [PIE CHART DEBUG] Entry ${index}: Kunde nicht gefunden! ProjectId: ${entry.projectId}, CustomerId: ${project?.customerId}`);
        return;
      }

      const hours = entry.duration / 3600;
      const existing = customerMap.get(customer.id);

      if (existing) {
        console.log(`📊 [PIE CHART DEBUG] Adding ${hours}h to existing customer: ${customer.name}`);
        existing.hours += hours;
      } else {
        console.log(`📊 [PIE CHART DEBUG] Creating new customer entry: ${customer.name} with ${hours}h`);
        customerMap.set(customer.id, {
          name: customer.name,
          hours: hours,
          color: customer.color || '#3B82F6'
        });
      }
    });

    const result = Array.from(customerMap.values())
      .sort((a, b) => b.hours - a.hours)
      .map(item => ({
        ...item,
        hours: Math.round(item.hours * 100) / 100 // Round to 2 decimals
      }));

    console.log('📊 [PIE CHART DEBUG] Final pie chart data:', result);
    console.log('📊 [PIE CHART DEBUG] Number of unique customers:', result.length);

    return result;
  }, [filteredEntries, projects, customers]);

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

  // Get period label for PDF
  const getPeriodLabel = () => {
    if (timeframeType === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate).toLocaleDateString('de-DE');
      const end = new Date(customEndDate).toLocaleDateString('de-DE');
      return `${start} - ${end}`;
    }
    const [year, month] = selectedMonth.split('-');
    if (timeframeType === 'year') {
      return year;
    } else if (timeframeType === 'quarter') {
      const { quarter } = getCurrentQuarter();
      return `Q${quarter} ${year}`;
    }
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const periodLabel = getPeriodLabel();
    const customerFilter = selectedCustomer !== 'all' ? getCustomerById(selectedCustomer) : null;

    // Load company info
    const companyInfo = currentUser ? storage.getCompanyInfoByUserId(currentUser.id) : null;

    let y = 20;

    // Company Header with Logo
    if (companyInfo) {
      // Add logo if available with proper scaling
      if (companyInfo.logo) {
        try {
          // Create temporary image to get dimensions
          const img = new Image();
          img.src = companyInfo.logo;

          // Calculate scaled dimensions (max 30mm width, max 20mm height, maintain aspect ratio)
          const maxWidth = 30;
          const maxHeight = 20;
          const aspectRatio = img.width / img.height;

          let logoWidth = maxWidth;
          let logoHeight = maxWidth / aspectRatio;

          if (logoHeight > maxHeight) {
            logoHeight = maxHeight;
            logoWidth = maxHeight * aspectRatio;
          }

          doc.addImage(companyInfo.logo, 'PNG', 20, y, logoWidth, logoHeight);
        } catch (error) {
          console.error('Error adding logo to PDF:', error);
        }
      }

      // Company info on the right side
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(companyInfo.name, 190, y, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      y += 4;
      doc.text(companyInfo.address, 190, y, { align: 'right' });
      y += 4;
      doc.text(`${companyInfo.zipCode} ${companyInfo.city}`, 190, y, { align: 'right' });
      y += 4;
      doc.text(companyInfo.country, 190, y, { align: 'right' });
      y += 5;
      doc.text(companyInfo.email, 190, y, { align: 'right' });

      if (companyInfo.phone) {
        y += 4;
        doc.text(`Tel: ${companyInfo.phone}`, 190, y, { align: 'right' });
      }

      if (companyInfo.website) {
        y += 4;
        doc.text(companyInfo.website, 190, y, { align: 'right' });
      }

      y += 10;
    }

    // Report Title - centered (use custom title if customer is filtered and has one)
    y = Math.max(y, 45); // Ensure minimum spacing

    let reportTitle = 'Stundenbericht';
    if (customerFilter?.reportTitle) {
      // Replace template variables
      reportTitle = customerFilter.reportTitle
        .replace(/\{\{kunde\}\}/gi, customerFilter.name)
        .replace(/\{\{monat\}\}/gi, getPeriodLabel())
        .replace(/\{\{zeitraum\}\}/gi, getPeriodLabel());
    }

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle, 105, y, { align: 'center' });

    y += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(periodLabel, 105, y, { align: 'center' });

    y += 15;

    // Customer Info (if filtered)
    if (customerFilter) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Kunde:', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(customerFilter.name, 40, y);
      y += 6;
      if (customerFilter.contactPerson) {
        doc.text(`Ansprechpartner: ${customerFilter.contactPerson}`, 40, y);
        y += 6;
      }
      if (customerFilter.email) {
        doc.text(`E-Mail: ${customerFilter.email}`, 40, y);
        y += 6;
      }
      y += 5;
    }

    // Summary box
    y += 5;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, 170, 20, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gesamtstunden: ${totalHours.toFixed(2)} h`, 25, y + 8);
    doc.text(`Gesamtbetrag: ${totalAmount.toFixed(2)} EUR`, 25, y + 15);

    // Table Header
    y += 30;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Kunde', 20, y);
    doc.text('Projekt', 70, y);
    doc.text('Stunden', 120, y);
    doc.text('Satz (€/h)', 142, y);
    doc.text('Betrag (€)', 170, y);
    doc.line(20, y + 2, 190, y + 2);

    // Table Rows
    y += 8;
    doc.setFont('helvetica', 'normal');

    stats.forEach((stat) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      const hours = stat.totalSeconds / 3600;
      doc.text(stat.customerName.substring(0, 22), 20, y);
      doc.text(stat.projectName.substring(0, 22), 70, y);
      doc.text(hours.toFixed(2), 120, y);
      doc.text((stat.hourlyRate || 0).toFixed(2), 145, y);
      doc.text((stat.totalAmount || 0).toFixed(2), 172, y);
      y += 6;
    });

    // Total line
    y += 3;
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamt:', 95, y);
    doc.text(totalHours.toFixed(2) + ' h', 120, y);
    doc.text(totalAmount.toFixed(2) + ' €', 168, y);

    // Signature section
    y += 20;
    if (y > 240) {
      doc.addPage();
      y = 30;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Hiermit bestätige ich die Richtigkeit der aufgeführten Stunden:', 20, y);

    y += 20;
    doc.line(20, y, 90, y);
    doc.line(120, y, 190, y);
    y += 5;
    doc.setFontSize(8);
    doc.text('Ort, Datum', 20, y);
    doc.text('Unterschrift Auftragnehmer', 120, y);

    y += 15;
    doc.line(20, y, 90, y);
    doc.line(120, y, 190, y);
    y += 5;
    doc.text('Ort, Datum', 20, y);
    doc.text('Unterschrift Auftraggeber', 120, y);

    // Footer with company tax info and note
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');

    if (companyInfo?.taxId) {
      doc.text(`Steuernummer: ${companyInfo.taxId}`, 105, 280, { align: 'center' });
    }

    doc.setTextColor(150, 150, 150);
    doc.text('// TODO: Microsoft 365 Integration - Automatischer Versand via Graph API', 20, 285);

    // Save
    const filename = customerFilter
      ? `Stundenbericht_${customerFilter.name.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}.pdf`
      : `Stundenbericht_${periodLabel.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
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

  // Check if we're approaching month end (3 days or less)
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = daysInMonth - currentDay;
  const showMonthEndNotification = daysRemaining <= 3;

  return (
    <div className="flex flex-col min-h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {/* Month-End Notification Banner */}
      {showMonthEndNotification && entries.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-700 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-orange-600 dark:text-orange-400" />
              <div>
                <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                  Monatsende naht! Noch {daysRemaining} Tag(e) bis zum {daysInMonth}.
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  Erstelle jetzt deine monatlichen Reports
                </p>
              </div>
            </div>
            <button
              onClick={() => setReportAssistantOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors text-sm"
            >
              <FileText size={16} />
              Report-Assistent öffnen
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold dark:text-white">Dashboard & Reports</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setReportAssistantOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              <FileText size={18} />
              Report-Assistent
            </button>
            {filteredEntries.length > 0 && (
              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 btn-accent"
              >
                <Download size={18} />
                PDF Export
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Timeframe Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Zeitraum
            </label>
            <select
              value={timeframeType}
              onChange={(e) => setTimeframeType(e.target.value as TimeframeType)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">Monat</option>
              <option value="quarter">Quartal</option>
              <option value="year">Jahr</option>
              <option value="custom">Benutzerdefiniert</option>
            </select>
          </div>

          {/* Month/Year Selector (shown for month/quarter/year) */}
          {timeframeType !== 'custom' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {timeframeType === 'year' ? 'Jahr' : 'Monat/Jahr'}
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableMonths.map(month => {
                  const [year, m] = month.split('-');
                  const date = new Date(parseInt(year), parseInt(m) - 1);
                  const label = timeframeType === 'year'
                    ? year
                    : date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
                  return (
                    <option key={month} value={month}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Custom Date Range (shown when timeframeType === 'custom') */}
          {timeframeType === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Von
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Bis
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {/* Customer Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Kunde
            </label>
            <select
              value={selectedCustomer}
              onChange={(e) => {
                setSelectedCustomer(e.target.value);
                setSelectedProject('all'); // Reset project filter when customer changes
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Alle Kunden</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Projekt
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Alle Projekte</option>
              {projects
                .filter(p => selectedCustomer === 'all' || p.customerId === selectedCustomer)
                .map(project => {
                  const customer = getCustomerById(project.customerId);
                  return (
                    <option key={project.id} value={project.id}>
                      {customer?.name} - {project.name}
                    </option>
                  );
                })}
            </select>
          </div>
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

        {/* Pie Chart - Hours by Customer */}
        {pieChartData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <PieChartIcon className="text-blue-600" size={24} />
              <h2 className="text-lg font-semibold dark:text-white">Stundenverteilung nach Kunde</h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.hours}h`}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)} Stunden`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: '10px'
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value, entry: any) => `${value} (${entry.payload.hours}h)`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Project Breakdown */}
        {filteredEntries.length === 0 ? (
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

      {/* Report Assistant Modal */}
      <ReportAssistant
        isOpen={reportAssistantOpen}
        onClose={() => setReportAssistantOpen(false)}
        entries={entries}
        projects={projects}
        customers={customers}
      />
    </div>
  );
};
