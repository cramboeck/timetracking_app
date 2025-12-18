import { useState, useMemo, useEffect } from 'react';
import { X, FileText, Download, Mail, CheckCircle2, Calendar, Clock, Euro } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity, CompanyInfo } from '../types';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { userApi } from '../services/api';
import { roundTimeUp } from '../utils/timeRounding';

interface ReportAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

interface CustomerReportData {
  customer: Customer;
  totalHours: number;
  totalAmount: number;
  projectCount: number;
  entryCount: number;
}

interface ReportEntry {
  date: Date;
  weekday: string;
  project: Project;
  activity?: Activity;
  description: string;
  hours: number;
  amount: number;
}

// Helper to format hours as H:MM
const formatHoursMinutes = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')} h`;
};

// Helper to get weekday abbreviation in German
const getWeekdayAbbr = (date: Date): string => {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return days[date.getDay()];
};

// Helper to format date range
const formatDateRange = (start: Date, end: Date): string => {
  const startStr = start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} – ${endStr}`;
};

export const ReportAssistant = ({
  isOpen,
  onClose,
  entries,
  projects,
  customers,
  activities
}: ReportAssistantProps) => {
  const { currentUser } = useAuth();
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [emailTemplate, setEmailTemplate] = useState('');
  const [showEmailTemplate, setShowEmailTemplate] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  // Report options
  const [showAmounts, setShowAmounts] = useState(false);
  const [dateRangeType, setDateRangeType] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${quarter}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });

  // Calculate effective date range
  const dateRange = useMemo(() => {
    if (dateRangeType === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59)
      };
    } else if (dateRangeType === 'quarter') {
      const [year, q] = selectedQuarter.split('-Q');
      const quarter = parseInt(q);
      const startMonth = (quarter - 1) * 3;
      return {
        start: new Date(parseInt(year), startMonth, 1),
        end: new Date(parseInt(year), startMonth + 3, 0, 23, 59, 59)
      };
    } else if (dateRangeType === 'year') {
      const year = parseInt(selectedYear);
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31, 23, 59, 59)
      };
    } else {
      return {
        start: new Date(customStartDate),
        end: new Date(customEndDate + 'T23:59:59')
      };
    }
  }, [dateRangeType, selectedMonth, selectedQuarter, selectedYear, customStartDate, customEndDate]);

  // Load company info from API
  useEffect(() => {
    const loadCompanyInfo = async () => {
      try {
        const info = await userApi.getCompany();
        setCompanyInfo(info);
      } catch (error) {
        console.error('Error loading company info:', error);
      }
    };
    loadCompanyInfo();
  }, []);

  // Calculate data for selected date range
  const reportData = useMemo(() => {
    const customerMap = new Map<string, CustomerReportData>();

    entries.forEach(entry => {
      if (entry.isRunning) return;

      const entryDate = new Date(entry.startTime);
      if (entryDate < dateRange.start || entryDate > dateRange.end) return;

      const project = projects.find(p => p.id === entry.projectId);
      const customer = project ? customers.find(c => c.id === project.customerId) : null;

      if (!project || !customer) return;

      // Apply time rounding for reports
      const roundedDuration = roundTimeUp(entry.duration, currentUser?.timeRoundingInterval || 15);
      const hours = roundedDuration / 3600;
      const amount = hours * project.hourlyRate;

      const existing = customerMap.get(customer.id);
      if (existing) {
        existing.totalHours += hours;
        existing.totalAmount += amount;
        existing.entryCount += 1;
        // Count unique projects
        const projectIds = new Set<string>();
        entries.forEach(e => {
          if (e.isRunning) return;
          const eDate = new Date(e.startTime);
          if (eDate < dateRange.start || eDate > dateRange.end) return;
          const p = projects.find(pr => pr.id === e.projectId);
          if (p?.customerId === customer.id) projectIds.add(p.id);
        });
        existing.projectCount = projectIds.size;
      } else {
        customerMap.set(customer.id, {
          customer,
          totalHours: hours,
          totalAmount: amount,
          projectCount: 1,
          entryCount: 1
        });
      }
    });

    return Array.from(customerMap.values())
      .filter(data => data.totalHours > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [entries, projects, customers, dateRange, currentUser?.timeRoundingInterval]);

  const toggleCustomer = (customerId: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  const selectAll = () => {
    setSelectedCustomers(new Set(reportData.map(d => d.customer.id)));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  // Get entries for a specific customer within date range
  const getCustomerEntries = (customerId: string): ReportEntry[] => {
    const customerEntries: ReportEntry[] = [];

    entries.forEach(entry => {
      if (entry.isRunning) return;

      const entryDate = new Date(entry.startTime);
      if (entryDate < dateRange.start || entryDate > dateRange.end) return;

      const project = projects.find(p => p.id === entry.projectId);
      if (!project || project.customerId !== customerId) return;

      const activity = entry.activityId ? activities.find(a => a.id === entry.activityId) : undefined;
      const roundedDuration = roundTimeUp(entry.duration, currentUser?.timeRoundingInterval || 15);
      const hours = roundedDuration / 3600;

      customerEntries.push({
        date: entryDate,
        weekday: getWeekdayAbbr(entryDate),
        project,
        activity,
        description: entry.description || '',
        hours,
        amount: hours * project.hourlyRate
      });
    });

    // Sort by date
    return customerEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
  };

  // Helper to get image dimensions from base64/data URL
  const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 200, height: 100 }); // fallback
      img.src = src;
    });
  };

  // Generate Clockodo-style PDF
  const generateClockodoPDF = async (customerData: CustomerReportData) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const customerEntries = getCustomerEntries(customerData.customer.id);

    // Portrait page dimensions
    const portraitWidth = 210;
    const portraitHeight = 297;
    // Landscape page dimensions
    const landscapeWidth = 297;
    const landscapeHeight = 210;

    const marginLeft = 20;
    const marginRight = 20;

    // Colors
    const accentColor = { r: 249, g: 115, b: 22 }; // Orange (#f97316)

    // ============ COVER PAGE (Portrait) ============
    let y = 40;

    // Logo (top right, properly scaled maintaining aspect ratio)
    if (companyInfo?.logo) {
      try {
        const imgDims = await getImageDimensions(companyInfo.logo);

        // Max dimensions for logo on cover
        const maxLogoWidth = 50;
        const maxLogoHeight = 28;

        // Calculate proper scaling
        const aspectRatio = imgDims.width / imgDims.height;
        let logoWidth: number;
        let logoHeight: number;

        if (aspectRatio > maxLogoWidth / maxLogoHeight) {
          // Width is the limiting factor
          logoWidth = maxLogoWidth;
          logoHeight = maxLogoWidth / aspectRatio;
        } else {
          // Height is the limiting factor
          logoHeight = maxLogoHeight;
          logoWidth = maxLogoHeight * aspectRatio;
        }

        doc.addImage(companyInfo.logo, 'AUTO', portraitWidth - marginRight - logoWidth, 15, logoWidth, logoHeight);
      } catch (error) {
        console.error('Error adding logo:', error);
      }
    }

    // Orange accent line (left side)
    doc.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
    doc.setLineWidth(3);
    doc.line(marginLeft, y, marginLeft, y + 50);

    // Report type
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text('Dienstleistungsreport', marginLeft + 8, y + 5);

    // Customer name (bold, large)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text(customerData.customer.name, marginLeft + 8, y + 20);

    // Date range
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(formatDateRange(dateRange.start, dateRange.end), marginLeft + 8, y + 32);

    // Summary box (gray background)
    y = 140;
    const coverContentWidth = portraitWidth - marginLeft - marginRight;
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(marginLeft, y, coverContentWidth, 40, 3, 3, 'F');

    // Clock icon placeholder (circle)
    doc.setFillColor(50, 50, 50);
    doc.circle(marginLeft + 20, y + 20, 10, 'F');
    doc.setFillColor(245, 245, 245);
    doc.circle(marginLeft + 20, y + 20, 7, 'F');
    // Clock hands
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(1.5);
    doc.line(marginLeft + 20, y + 20, marginLeft + 20, y + 14);
    doc.line(marginLeft + 20, y + 20, marginLeft + 25, y + 20);

    // Total time label and value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Gesamtzeit', marginLeft + 40, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    doc.text(formatHoursMinutes(customerData.totalHours), marginLeft + 40, y + 30);

    // Signature section
    y = 220;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);

    // Left signature line
    doc.line(marginLeft, y, marginLeft + 75, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Unterschrift ${companyInfo?.name || 'Auftragnehmer'}`, marginLeft, y + 6);

    // Right signature line
    doc.line(portraitWidth / 2 + 10, y, portraitWidth - marginRight, y);
    doc.text('Unterschrift Akzeptanz', portraitWidth / 2 + 10, y + 6);

    // Creation timestamp
    const now = new Date();
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Erstellt am ${now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`,
      marginLeft,
      portraitHeight - 20
    );

    // ============ DETAIL PAGES (Landscape) ============
    if (customerEntries.length > 0) {
      // Add landscape page for details
      doc.addPage('landscape');
      y = 20;

      // Column positions for landscape (297mm wide)
      const colDatum = marginLeft;
      const colTag = marginLeft + 28;
      const colLeistung = marginLeft + 45;
      const colBeschreibung = marginLeft + 100;
      const colMenge = landscapeWidth - marginRight;

      // Header on detail pages (landscape)
      const addDetailHeader = async () => {
        // Orange accent line
        doc.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
        doc.setLineWidth(2);
        doc.line(marginLeft, 15, marginLeft, 42);

        // Report info
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text('Dienstleistungsreport', marginLeft + 6, 20);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(customerData.customer.name, marginLeft + 6, 28);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(formatDateRange(dateRange.start, dateRange.end), marginLeft + 6, 36);

        // Logo on detail pages (landscape) - properly scaled
        if (companyInfo?.logo) {
          try {
            const imgDims = await getImageDimensions(companyInfo.logo);
            const maxLogoWidth = 40;
            const maxLogoHeight = 20;
            const aspectRatio = imgDims.width / imgDims.height;
            let logoWidth: number;
            let logoHeight: number;

            if (aspectRatio > maxLogoWidth / maxLogoHeight) {
              logoWidth = maxLogoWidth;
              logoHeight = maxLogoWidth / aspectRatio;
            } else {
              logoHeight = maxLogoHeight;
              logoWidth = maxLogoHeight * aspectRatio;
            }

            doc.addImage(companyInfo.logo, 'AUTO', landscapeWidth - marginRight - logoWidth, 15, logoWidth, logoHeight);
          } catch (error) {
            // Ignore logo errors
          }
        }

        return 50;
      };

      y = await addDetailHeader();

      // Table header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      doc.text('Datum', colDatum, y);
      doc.text('Tag', colTag, y);
      doc.text('Leistung', colLeistung, y);
      doc.text('Beschreibung', colBeschreibung, y);
      doc.text('Menge', colMenge, y, { align: 'right' });

      y += 3;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, y, landscapeWidth - marginRight, y);
      y += 8;

      // Table rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      for (const entry of customerEntries) {
        // Check for page break (landscape height is 210mm)
        if (y > landscapeHeight - 25) {
          doc.addPage('landscape');
          y = await addDetailHeader();

          // Re-add table header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text('Datum', colDatum, y);
          doc.text('Tag', colTag, y);
          doc.text('Leistung', colLeistung, y);
          doc.text('Beschreibung', colBeschreibung, y);
          doc.text('Menge', colMenge, y, { align: 'right' });
          y += 3;
          doc.setLineWidth(0.5);
          doc.line(marginLeft, y, landscapeWidth - marginRight, y);
          y += 8;
          doc.setFont('helvetica', 'normal');
        }

        // Date
        doc.text(entry.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), colDatum, y);

        // Weekday
        doc.text(entry.weekday, colTag, y);

        // Service/Activity (use project name or activity)
        const leistung = entry.activity?.name || entry.project.name;
        const maxLeistungWidth = 50;
        let truncatedLeistung = leistung;
        while (doc.getTextWidth(truncatedLeistung) > maxLeistungWidth && truncatedLeistung.length > 3) {
          truncatedLeistung = truncatedLeistung.substring(0, truncatedLeistung.length - 4) + '...';
        }
        doc.text(truncatedLeistung, colLeistung, y);

        // Description (truncate if needed) - more space in landscape
        const maxDescWidth = colMenge - colBeschreibung - 25;
        let desc = entry.description || '-';
        while (doc.getTextWidth(desc) > maxDescWidth && desc.length > 3) {
          desc = desc.substring(0, desc.length - 4) + '...';
        }
        doc.text(desc, colBeschreibung, y);

        // Hours
        doc.text(formatHoursMinutes(entry.hours), colMenge, y, { align: 'right' });

        y += 6;
      }

      // Optional: Total at bottom of last page
      if (y < landscapeHeight - 30) {
        y += 5;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(colMenge - 30, y, landscapeWidth - marginRight, y);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Gesamt:', colMenge - 30, y);
        doc.text(formatHoursMinutes(customerData.totalHours), colMenge, y, { align: 'right' });
      }
    }

    return doc;
  };

  const exportSelected = async () => {
    for (const customerId of Array.from(selectedCustomers)) {
      const customerData = reportData.find(d => d.customer.id === customerId);
      if (customerData) {
        const doc = await generateClockodoPDF(customerData);
        let dateStr: string;
        switch (dateRangeType) {
          case 'month':
            dateStr = selectedMonth.replace('-', '_');
            break;
          case 'quarter':
            dateStr = selectedQuarter.replace('-', '_');
            break;
          case 'year':
            dateStr = selectedYear;
            break;
          default:
            dateStr = `${customStartDate}_${customEndDate}`;
        }
        doc.save(`Dienstleistungsreport_${customerData.customer.name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
      }
    }
  };

  const generateEmailTemplate = () => {
    const selectedData = reportData.filter(d => selectedCustomers.has(d.customer.id));
    if (selectedData.length === 0) return;

    const dateRangeStr = formatDateRange(dateRange.start, dateRange.end);

    const template = `Betreff: Dienstleistungsreport ${dateRangeStr}

Guten Tag,

anbei erhalten Sie den Dienstleistungsreport für den Zeitraum ${dateRangeStr}.

${selectedData.map(data => `
${data.customer.name}
- Gesamtstunden: ${formatHoursMinutes(data.totalHours)}${showAmounts ? `\n- Gesamtbetrag: ${data.totalAmount.toFixed(2)} EUR` : ''}
`).join('\n')}

Bei Fragen stehe ich Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
${companyInfo?.name || 'Ihr Name'}
${companyInfo?.email || ''}
${companyInfo?.phone || ''}`;

    setEmailTemplate(template);
    setShowEmailTemplate(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailTemplate);
    alert('E-Mail Vorlage in Zwischenablage kopiert!');
  };

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  }, []);

  // Generate quarter options (last 8 quarters)
  const quarterOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const currentYear = now.getFullYear();

    for (let i = 0; i < 8; i++) {
      let q = currentQuarter - i;
      let y = currentYear;
      while (q <= 0) {
        q += 4;
        y -= 1;
      }
      const quarterNames = ['Q1 (Jan-Mär)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Okt-Dez)'];
      options.push({
        value: `${y}-Q${q}`,
        label: `${quarterNames[q - 1]} ${y}`
      });
    }
    return options;
  }, []);

  // Generate year options (last 5 years)
  const yearOptions = useMemo(() => {
    const options = [];
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const year = currentYear - i;
      options.push({ value: year.toString(), label: year.toString() });
    }
    return options;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-dark-100 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText size={24} className="text-accent-primary" />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Report-Assistent
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Dienstleistungsreports im Clockodo-Stil
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Options */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-200 bg-gray-50 dark:bg-dark-50">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Date Range Type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Zeitraum
              </label>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setDateRangeType('month')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    dateRangeType === 'month'
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Monat
                </button>
                <button
                  onClick={() => setDateRangeType('quarter')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    dateRangeType === 'quarter'
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Quartal
                </button>
                <button
                  onClick={() => setDateRangeType('year')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    dateRangeType === 'year'
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Jahr
                </button>
                <button
                  onClick={() => setDateRangeType('custom')}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    dateRangeType === 'custom'
                      ? 'bg-accent-primary text-white border-accent-primary'
                      : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Frei
                </button>
              </div>
            </div>

            {/* Date Range Selector based on type */}
            {dateRangeType === 'month' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Monat wählen
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {dateRangeType === 'quarter' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Quartal wählen
                </label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {quarterOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {dateRangeType === 'year' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Jahr wählen
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {yearOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {dateRangeType === 'custom' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Von
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Bis
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>
              </>
            )}

            {/* Show Amounts Toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setShowAmounts(!showAmounts)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                  showAmounts
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700'
                    : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-200 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Euro size={14} />
                Beträge {showAmounts ? 'ausblenden' : 'anzeigen'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {reportData.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>Keine Zeiterfassungen für diesen Zeitraum</p>
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600 dark:text-dark-400">
                  {selectedCustomers.size} von {reportData.length} Kunde(n) ausgewählt
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm px-3 py-1 text-accent-primary hover:bg-accent-light dark:hover:bg-accent-primary/10 rounded-lg transition-colors"
                  >
                    Alle auswählen
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-sm px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  >
                    Abwählen
                  </button>
                </div>
              </div>

              {/* Customer List */}
              <div className="space-y-3 mb-6">
                {reportData.map(data => (
                  <div
                    key={data.customer.id}
                    onClick={() => toggleCustomer(data.customer.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedCustomers.has(data.customer.id)
                        ? 'border-accent-primary bg-orange-50 dark:bg-orange-900/10'
                        : 'border-gray-200 dark:border-dark-200 hover:border-gray-300 dark:hover:border-dark-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className="w-12 h-12 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: data.customer.color }}
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {data.customer.name}
                          </h3>
                          <div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              {formatHoursMinutes(data.totalHours)}
                            </span>
                            {showAmounts && (
                              <span className="flex items-center gap-1">
                                <Euro size={14} />
                                {data.totalAmount.toFixed(2)} EUR
                              </span>
                            )}
                            <span>{data.entryCount} Einträge</span>
                          </div>
                        </div>
                        {selectedCustomers.has(data.customer.id) && (
                          <CheckCircle2 size={24} className="text-accent-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Email Template */}
              {showEmailTemplate && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Mail size={18} />
                      E-Mail Vorlage
                    </h3>
                    <button
                      onClick={copyToClipboard}
                      className="text-sm px-3 py-1 btn-accent"
                    >
                      Kopieren
                    </button>
                  </div>
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-white dark:bg-dark-100 p-3 rounded border border-gray-200 dark:border-dark-200">
                    {emailTemplate}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {reportData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200 flex flex-wrap gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg font-medium transition-colors"
            >
              Schließen
            </button>
            <button
              onClick={generateEmailTemplate}
              disabled={selectedCustomers.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail size={18} />
              E-Mail Vorlage
            </button>
            <button
              onClick={exportSelected}
              disabled={selectedCustomers.size === 0}
              className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              PDFs exportieren ({selectedCustomers.size})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
