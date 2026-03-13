import { useState, useMemo, useEffect } from 'react';
import { Download, Calendar, TrendingUp, Clock, DollarSign, FileText, PieChart as PieChartIcon, ChevronDown, ChevronRight, Archive, Trash2, X, Loader2, Eye, ChevronLeft } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity, CompanyInfo } from '../types';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { ReportAssistant } from './ReportAssistant';
import { BillingWidget } from './BillingWidget';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { userApi } from '../services/api';
import { Button, IconButton } from './ui/Button';

interface DashboardProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onNavigateToBilling?: () => void;
}

interface ProjectStats {
  projectId: string;
  projectName: string;
  customerName: string;
  customerDisplayName?: string; // Short name for PDFs
  customerColor: string;
  totalSeconds: number;
  totalAmount: number;
  hourlyRate: number;
  entryCount: number;
}

type TimeframeType = 'month' | 'quarter' | 'year' | 'custom';

export const Dashboard = ({ entries, projects, customers, activities, onNavigateToBilling }: DashboardProps) => {
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
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${quarter}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [reportAssistantOpen, setReportAssistantOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  // Saved reports state
  interface SavedReportEntry {
    date: string;
    weekday: string;
    projectName: string;
    activityName: string;
    description: string;
    hours: number;
  }
  interface SavedReport {
    id: string;
    customer_id: string;
    customer_name: string;
    report_title: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    entry_count: number;
    project_count: number;
    created_at: string;
    notes: string | null;
    time_entries: SavedReportEntry[];
  }
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showSavedReports, setShowSavedReports] = useState(false);
  const [isLoadingSavedReports, setIsLoadingSavedReports] = useState(false);
  const [savedReportsFilter, setSavedReportsFilter] = useState<string>('all');

  // PDF Preview state for saved reports
  const [savedReportPreview, setSavedReportPreview] = useState<{
    show: boolean;
    pdfUrl: string | null;
    reportName: string;
    currentIndex: number;
    totalCount: number;
  }>({ show: false, pdfUrl: null, reportName: '', currentIndex: 0, totalCount: 0 });
  const [isGeneratingSavedPreview, setIsGeneratingSavedPreview] = useState(false);

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

  // Saved reports functions
  const loadSavedReports = async () => {
    setIsLoadingSavedReports(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/report-approvals/saved', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error loading saved reports:', error);
    } finally {
      setIsLoadingSavedReports(false);
    }
  };

  const openSavedReports = () => {
    setShowSavedReports(true);
    loadSavedReports();
  };

  const deleteSavedReport = async (reportId: string) => {
    if (!confirm('Report wirklich löschen?')) return;
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/report-approvals/saved/${reportId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSavedReports(prev => prev.filter(r => r.id !== reportId));
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  // Generate PDF from saved report data
  const generateSavedReportPDF = async (report: SavedReport) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const margin = 20;

    // Colors
    const dark = { r: 17, g: 24, b: 39 };
    const gray = { r: 107, g: 114, b: 128 };
    const accent = { r: 249, g: 115, b: 22 };

    // Cover Page
    let y = 30;

    // Company logo if available
    if (companyInfo?.logo) {
      try {
        doc.addImage(companyInfo.logo, 'AUTO', pageWidth - margin - 40, 20, 40, 20);
      } catch {}
    }

    // Company name
    if (companyInfo?.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(dark.r, dark.g, dark.b);
      doc.text(companyInfo.name, margin, y);
    }

    y = 80;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(report.report_title, margin, y);

    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(gray.r, gray.g, gray.b);
    // Handle long customer names with line wrap
    const savedReportMaxWidth = pageWidth - margin * 2;
    const savedNameLines = doc.splitTextToSize(report.customer_name, savedReportMaxWidth);
    savedNameLines.forEach((line: string, idx: number) => {
      doc.text(line, margin, y + (idx * 7));
    });
    y += (savedNameLines.length - 1) * 7;

    y += 10;
    doc.setFontSize(12);
    const startDate = new Date(report.start_date).toLocaleDateString('de-DE');
    const endDate = new Date(report.end_date).toLocaleDateString('de-DE');
    doc.text(`${startDate} - ${endDate}`, margin, y);

    // Summary cards
    y = 140;
    const cardW = 50;
    const cardH = 35;
    const cardGap = 10;
    const startX = (pageWidth - (cardW * 3 + cardGap * 2)) / 2;

    const cards = [
      { label: 'Gesamtstunden', value: `${report.total_hours.toFixed(2)}h` },
      { label: 'Einträge', value: String(report.entry_count) },
      { label: 'Projekte', value: String(report.project_count) }
    ];

    cards.forEach((card, i) => {
      const x = startX + i * (cardW + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text(card.value, x + cardW / 2, y + 15, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(gray.r, gray.g, gray.b);
      doc.text(card.label, x + cardW / 2, y + 26, { align: 'center' });
    });

    // Detail pages (landscape)
    if (report.time_entries && report.time_entries.length > 0) {
      doc.addPage([297, 210], 'l');
      const lPageW = 297;
      const lMargin = 15;
      let ly = 20;

      // Header (truncate if combined title + name is too long)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(dark.r, dark.g, dark.b);
      let combinedHeader = `${report.report_title} - ${report.customer_name}`;
      const maxSavedHeaderWidth = lPageW - lMargin * 2;
      while (doc.getTextWidth(combinedHeader) > maxSavedHeaderWidth && combinedHeader.length > 20) {
        combinedHeader = combinedHeader.substring(0, combinedHeader.length - 4) + '...';
      }
      doc.text(combinedHeader, lMargin, ly);

      ly += 15;

      // Table header
      const colWidths = [22, 22, 50, 40, 100, 20];
      const headers = ['Datum', 'Tag', 'Projekt', 'Tätigkeit', 'Beschreibung', 'Std'];

      doc.setFillColor(accent.r, accent.g, accent.b);
      doc.rect(lMargin, ly - 5, lPageW - lMargin * 2, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);

      let colX = lMargin + 2;
      headers.forEach((h, i) => {
        doc.text(h, colX, ly);
        colX += colWidths[i];
      });

      ly += 8;

      // Table rows
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(dark.r, dark.g, dark.b);
      const rowHeight = 7;
      let pageRowCount = 0;
      const maxRowsPerPage = 22;

      report.time_entries.forEach((entry, idx) => {
        if (pageRowCount >= maxRowsPerPage) {
          doc.addPage([297, 210], 'l');
          ly = 20;
          pageRowCount = 0;

          // Repeat header
          doc.setFillColor(accent.r, accent.g, accent.b);
          doc.rect(lMargin, ly - 5, lPageW - lMargin * 2, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          colX = lMargin + 2;
          headers.forEach((h, i) => {
            doc.text(h, colX, ly);
            colX += colWidths[i];
          });
          ly += 8;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(dark.r, dark.g, dark.b);
        }

        // Alternating row background
        if (idx % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(lMargin, ly - 4, lPageW - lMargin * 2, rowHeight, 'F');
        }

        colX = lMargin + 2;
        doc.setFontSize(8);

        const entryDate = new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        doc.text(entryDate, colX, ly);
        colX += colWidths[0];

        doc.text(entry.weekday || '', colX, ly);
        colX += colWidths[1];

        doc.text((entry.projectName || '').substring(0, 25), colX, ly);
        colX += colWidths[2];

        doc.text((entry.activityName || '-').substring(0, 20), colX, ly);
        colX += colWidths[3];

        doc.text((entry.description || '').substring(0, 60), colX, ly);
        colX += colWidths[4];

        doc.text(entry.hours.toFixed(2), colX, ly);

        ly += rowHeight;
        pageRowCount++;
      });

      // Total row
      ly += 3;
      doc.setFillColor(dark.r, dark.g, dark.b);
      doc.rect(lMargin, ly - 4, lPageW - lMargin * 2, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text('GESAMT', lMargin + 2, ly);
      doc.text(`${report.total_hours.toFixed(2)} h`, lPageW - lMargin - 18, ly);
    }

    return doc;
  };

  // Preview saved report PDF
  const previewSavedReport = async (index: number) => {
    const reports = filteredSavedReports;
    if (index < 0 || index >= reports.length) return;

    setIsGeneratingSavedPreview(true);
    try {
      const report = reports[index];
      const doc = await generateSavedReportPDF(report);
      const pdfUrl = doc.output('bloburl') as string;

      if (savedReportPreview.pdfUrl) {
        URL.revokeObjectURL(savedReportPreview.pdfUrl);
      }

      setSavedReportPreview({
        show: true,
        pdfUrl,
        reportName: `${report.customer_name} - ${report.report_title}`,
        currentIndex: index,
        totalCount: reports.length
      });
    } catch (error) {
      console.error('Error generating preview:', error);
      alert('Fehler beim Erstellen der Vorschau');
    } finally {
      setIsGeneratingSavedPreview(false);
    }
  };

  const closeSavedReportPreview = () => {
    if (savedReportPreview.pdfUrl) {
      URL.revokeObjectURL(savedReportPreview.pdfUrl);
    }
    setSavedReportPreview({ show: false, pdfUrl: null, reportName: '', currentIndex: 0, totalCount: 0 });
  };

  const navigateSavedReportPreview = async (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next'
      ? savedReportPreview.currentIndex + 1
      : savedReportPreview.currentIndex - 1;
    if (newIndex >= 0 && newIndex < savedReportPreview.totalCount) {
      await previewSavedReport(newIndex);
    }
  };

  // Get unique customers from saved reports for filter
  const savedReportCustomers = useMemo(() => {
    const uniqueCustomers = new Map<string, string>();
    savedReports.forEach(r => {
      if (r.customer_id && r.customer_name) {
        uniqueCustomers.set(r.customer_id, r.customer_name);
      }
    });
    return Array.from(uniqueCustomers.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [savedReports]);

  // Filter saved reports by selected customer
  const filteredSavedReports = useMemo(() => {
    if (savedReportsFilter === 'all') return savedReports;
    return savedReports.filter(r => r.customer_id === savedReportsFilter);
  }, [savedReports, savedReportsFilter]);

  const getProjectById = (id: string) => projects.find(p => p.id === id);
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const getActivityById = (id: string) => activities.find(a => a.id === id);

  // Get effective hourly rate: Project rate → Customer rate → 0
  const getEffectiveHourlyRate = (project: Project | undefined): number => {
    if (!project) return 0;
    if (project.hourlyRate) return project.hourlyRate;
    // Fallback to customer rate
    const customer = getCustomerById(project.customerId);
    return customer?.hourlyRate || 0;
  };

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

    // Use effective hourly rate (project → customer fallback)
    return hours * getEffectiveHourlyRate(project);
  };

  // Get current quarter/year based on selection
  const getCurrentQuarter = () => {
    // Parse from selectedQuarter format "YYYY-QN"
    const match = selectedQuarter.match(/^(\d{4})-Q(\d)$/);
    if (match) {
      return { year: parseInt(match[1]), quarter: parseInt(match[2]) };
    }
    // Fallback to current quarter
    const now = new Date();
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
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
        return entryDate.getFullYear() === parseInt(selectedYear);
      } else if (timeframeType === 'custom') {
        if (!customStartDate || !customEndDate) return true;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        return entryDate >= start && entryDate <= end;
      }

      return true;
    });
  }, [entries, selectedMonth, selectedQuarter, selectedYear, selectedCustomer, selectedProject, timeframeType, customStartDate, customEndDate, projects]);

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
          customerDisplayName: customer.displayName,
          customerColor: customer.color,
          totalSeconds: entry.duration,
          totalAmount: amount,
          hourlyRate: getEffectiveHourlyRate(project),
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

  // Generate available quarters
  const availableQuarters = useMemo(() => {
    const quarters = new Set<string>();
    entries.forEach(entry => {
      const date = new Date(entry.startTime);
      const year = date.getFullYear();
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      quarters.add(`${year}-Q${quarter}`);
    });
    return Array.from(quarters).sort().reverse();
  }, [entries]);

  // Generate available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    entries.forEach(entry => {
      const date = new Date(entry.startTime);
      years.add(String(date.getFullYear()));
    });
    return Array.from(years).sort().reverse();
  }, [entries]);

  // Get period label for PDF
  const getPeriodLabel = () => {
    if (timeframeType === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate).toLocaleDateString('de-DE');
      const end = new Date(customEndDate).toLocaleDateString('de-DE');
      return `${start} - ${end}`;
    }
    if (timeframeType === 'year') {
      return selectedYear;
    } else if (timeframeType === 'quarter') {
      const { year, quarter } = getCurrentQuarter();
      return `Q${quarter} ${year}`;
    }
    const [year, month] = selectedMonth.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  };

  // Helper to format hours as H:MM
  const formatHoursMinutes = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')} h`;
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

  const generatePDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const periodLabel = getPeriodLabel();
    const customerFilter = selectedCustomer !== 'all' ? getCustomerById(selectedCustomer) : null;

    // Page dimensions
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Colors - Modern palette (matching ReportAssistant)
    const dark = { r: 17, g: 24, b: 39 }; // Near black (#111827)
    const gray = { r: 107, g: 114, b: 128 }; // Gray (#6b7280)
    const lightGray = { r: 243, g: 244, b: 246 }; // Light gray (#f3f4f6)
    const accent = { r: 249, g: 115, b: 22 }; // App accent (#f97316)

    // Helper to add logo with proper scaling
    const addLogo = async (x: number, y: number, maxW: number, maxH: number) => {
      if (companyInfo?.logo) {
        try {
          const dims = await getImageDimensions(companyInfo.logo);
          const ratio = dims.width / dims.height;
          let w: number, h: number;
          if (ratio > maxW / maxH) {
            w = maxW;
            h = maxW / ratio;
          } else {
            h = maxH;
            w = maxH * ratio;
          }
          doc.addImage(companyInfo.logo, 'AUTO', x, y, w, h);
        } catch {
          // Ignore logo errors
        }
      }
    };

    // ============ COVER PAGE ============
    let y = 25;

    // Header area with logo
    await addLogo(pageWidth - margin - 45, y, 45, 25);

    // Company name (top left)
    if (companyInfo?.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(dark.r, dark.g, dark.b);
      doc.text(companyInfo.name, margin, y + 8);
    }

    // Main title section
    y = 80;

    // Accent bar
    doc.setFillColor(accent.r, accent.g, accent.b);
    doc.rect(margin, y, 4, 35, 'F');

    // Report title (from customer settings or default)
    let reportTitle = 'Stundenbericht';
    if (customerFilter?.reportTitle) {
      reportTitle = customerFilter.reportTitle
        .replace(/\{\{kunde\}\}/gi, customerFilter.name)
        .replace(/\{\{monat\}\}/gi, periodLabel)
        .replace(/\{\{zeitraum\}\}/gi, periodLabel);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text(reportTitle, margin + 12, y + 8);

    // Customer name or "Alle Kunden" (with automatic line wrap for long names)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(dark.r, dark.g, dark.b);
    const customerName = customerFilter?.name || 'Alle Kunden';
    const maxNameWidth = contentWidth - 60; // Leave space for logo
    const nameLines = doc.splitTextToSize(customerName, maxNameWidth);
    let nameY = y + 24;
    nameLines.forEach((line: string, index: number) => {
      doc.text(line, margin + 12, nameY + (index * 10));
    });

    // Date range (adjust position based on number of name lines)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(gray.r, gray.g, gray.b);
    const dateY = nameY + ((nameLines.length - 1) * 10) + 11;
    doc.text(periodLabel, margin + 12, dateY);

    // Summary cards
    y = 150;
    const cardWidth = (contentWidth - 16) / 3;
    const cardHeight = 50;

    // Card 1: Total Hours
    doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
    doc.roundedRect(margin, y, cardWidth, cardHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Gesamtzeit', margin + 10, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(formatHoursMinutes(totalHours), margin + 10, y + 35);

    // Card 2: Project Count
    doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
    doc.roundedRect(margin + cardWidth + 8, y, cardWidth, cardHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Projekte', margin + cardWidth + 18, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(stats.length.toString(), margin + cardWidth + 18, y + 35);

    // Card 3: Total Amount
    doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
    doc.roundedRect(margin + (cardWidth + 8) * 2, y, cardWidth, cardHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Gesamtbetrag', margin + (cardWidth + 8) * 2 + 10, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(`${totalAmount.toFixed(2)} €`, margin + (cardWidth + 8) * 2 + 10, y + 35);

    // Signature section
    y = 230;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);

    // Left signature
    doc.line(margin, y, margin + 70, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Datum, Unterschrift Auftragnehmer', margin, y + 6);

    // Right signature
    doc.line(pageWidth / 2 + 15, y, pageWidth - margin, y);
    doc.text('Datum, Unterschrift Auftraggeber', pageWidth / 2 + 15, y + 6);

    // Footer
    const now = new Date();
    doc.setFontSize(8);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text(
      `Erstellt: ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
      margin,
      pageHeight - 15
    );
    doc.text('Seite 1', pageWidth - margin, pageHeight - 15, { align: 'right' });

    // ============ DETAIL PAGE (Landscape) ============
    if (stats.length > 0) {
      doc.addPage([297, 210], 'l');

      const lWidth = 297;
      const lHeight = 210;
      let pageNum = 2;

      // Column positions for landscape - adjusted for longer customer/project names
      const colCustomer = margin;
      const colProject = margin + 70;
      const colHours = margin + 160;
      const colRate = margin + 195;
      const colAmount = lWidth - margin;

      // Header function for detail pages
      const addDetailHeader = async () => {
        // Top bar with accent color
        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.rect(0, 0, lWidth, 3, 'F');

        // Header content (truncate long names for header)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(dark.r, dark.g, dark.b);
        let headerName = customerFilter?.name || 'Alle Kunden';
        const maxHeaderWidth = lWidth - margin * 2 - 50; // Leave space for logo
        while (doc.getTextWidth(headerName) > maxHeaderWidth && headerName.length > 10) {
          headerName = headerName.substring(0, headerName.length - 4) + '...';
        }
        doc.text(headerName, margin, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(gray.r, gray.g, gray.b);
        doc.text(periodLabel, margin, 26);

        // Logo in header
        await addLogo(lWidth - margin - 35, 10, 35, 18);

        return 38;
      };

      y = await addDetailHeader();

      // Table header with background
      doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
      doc.rect(margin, y - 5, lWidth - margin * 2, 10, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(dark.r, dark.g, dark.b);
      doc.text('Kunde', colCustomer, y);
      doc.text('Projekt', colProject, y);
      doc.text('Stunden', colHours, y);
      doc.text('Stundensatz', colRate, y);
      doc.text('Betrag', colAmount, y, { align: 'right' });

      y += 10;
      let rowIndex = 0;

      for (const stat of stats) {
        // Check for page break
        if (y > lHeight - 35) {
          // Add page footer
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(gray.r, gray.g, gray.b);
          doc.text(`Seite ${pageNum}`, lWidth - margin, lHeight - 10, { align: 'right' });

          // New page
          doc.addPage([297, 210], 'l');
          pageNum++;
          y = await addDetailHeader();
          rowIndex = 0;

          // Re-add table header
          doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
          doc.rect(margin, y - 5, lWidth - margin * 2, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(dark.r, dark.g, dark.b);
          doc.text('Kunde', colCustomer, y);
          doc.text('Projekt', colProject, y);
          doc.text('Stunden', colHours, y);
          doc.text('Stundensatz', colRate, y);
          doc.text('Betrag', colAmount, y, { align: 'right' });
          y += 10;
        }

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 4, lWidth - margin * 2, 7, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(dark.r, dark.g, dark.b);

        const hours = stat.totalSeconds / 3600;

        // Customer (use displayName if available, truncate if needed) - max width 65 for 70-wide column
        let customerName = stat.customerDisplayName || stat.customerName;
        while (doc.getTextWidth(customerName) > 65 && customerName.length > 3) {
          customerName = customerName.substring(0, customerName.length - 4) + '...';
        }
        doc.text(customerName, colCustomer, y);

        // Project (truncate if needed) - max width 85 for 90-wide column
        let projectName = stat.projectName;
        while (doc.getTextWidth(projectName) > 85 && projectName.length > 3) {
          projectName = projectName.substring(0, projectName.length - 4) + '...';
        }
        doc.text(projectName, colProject, y);

        // Hours
        doc.text(formatHoursMinutes(hours), colHours, y);

        // Rate
        doc.setTextColor(gray.r, gray.g, gray.b);
        doc.text(`${(stat.hourlyRate || 0).toFixed(2)} €/h`, colRate, y);

        // Amount
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(dark.r, dark.g, dark.b);
        doc.text(`${(stat.totalAmount || 0).toFixed(2)} €`, colAmount, y, { align: 'right' });

        y += 7;
        rowIndex++;
      }

      // Total row
      y += 5;
      doc.setDrawColor(dark.r, dark.g, dark.b);
      doc.setLineWidth(0.5);
      doc.line(colHours - 10, y, lWidth - margin, y);
      y += 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Gesamt:', colHours - 10, y);
      doc.text(formatHoursMinutes(totalHours), colHours, y);
      doc.setFontSize(11);
      doc.text(`${totalAmount.toFixed(2)} €`, colAmount, y, { align: 'right' });

      // Final page footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(gray.r, gray.g, gray.b);
      doc.text(`Seite ${pageNum}`, lWidth - margin, lHeight - 10, { align: 'right' });
    }

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
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900">
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
            <Button
              onClick={() => setReportAssistantOpen(true)}
              variant="warning"
              size="sm"
              icon={<FileText size={16} />}
            >
              Report-Assistent öffnen
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Dashboard & Reports</h1>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setReportAssistantOpen(true)}
              variant="secondary"
              size="sm"
              icon={<FileText size={16} />}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              <span className="hidden xs:inline">Report-</span>Assistent
            </Button>
            <Button
              onClick={openSavedReports}
              variant="primary"
              size="sm"
              icon={<Archive size={16} />}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <span className="hidden sm:inline">Gespeicherte </span>Reports
            </Button>
            {filteredEntries.length > 0 && (
              <Button
                onClick={generatePDF}
                variant="primary"
                size="sm"
                icon={<Download size={16} />}
              >
                PDF
              </Button>
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

          {/* Month Selector (shown for month) */}
          {timeframeType === 'month' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Monat/Jahr
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableMonths.map(month => {
                  const [year, m] = month.split('-');
                  const date = new Date(parseInt(year), parseInt(m) - 1);
                  return (
                    <option key={month} value={month}>
                      {date.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Quarter Selector (shown for quarter) */}
          {timeframeType === 'quarter' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Quartal
              </label>
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableQuarters.map(q => {
                  const match = q.match(/^(\d{4})-Q(\d)$/);
                  const label = match ? `Q${match[2]} ${match[1]}` : q;
                  return (
                    <option key={q} value={q}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Year Selector (shown for year) */}
          {timeframeType === 'year' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Jahr
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
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

        {/* Billing Widget */}
        {onNavigateToBilling && (
          <div className="mb-6">
            <BillingWidget onNavigateToBilling={onNavigateToBilling} />
          </div>
        )}

        {/* Pie Chart - Hours by Customer */}
        {pieChartData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <PieChartIcon className="text-blue-600" size={24} />
              <h2 className="text-lg font-semibold dark:text-white">Stundenverteilung nach Kunde</h2>
            </div>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Pie Chart */}
              <div className="h-64 lg:h-80 flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="hours"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={30}
                      paddingAngle={2}
                      label={false}
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value.toFixed(2)} Stunden`, name]}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        padding: '10px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend as list */}
              <div className="lg:w-64 flex-shrink-0">
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {pieChartData.map((entry, index) => {
                    const percentage = totalHours > 0 ? (entry.hours / totalHours * 100).toFixed(1) : '0';
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={entry.name}>
                          {entry.name}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {entry.hours.toFixed(1)}h ({percentage}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 dark:text-white">Aufschlüsselung nach Projekt</h2>
            <div className="space-y-3 sm:space-y-4">
              {stats.map((stat) => {
                const hours = stat.totalSeconds / 3600;
                const percentage = (stat.totalSeconds / totalSeconds) * 100;
                const isExpanded = expandedProjects.has(stat.projectId);

                // Get entries for this project
                const projectEntries = filteredEntries
                  .filter(entry => entry.projectId === stat.projectId)
                  .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

                return (
                  <div key={stat.projectId} className="space-y-2">
                    <div
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors"
                      onClick={() => {
                        const newExpanded = new Set(expandedProjects);
                        if (newExpanded.has(stat.projectId)) {
                          newExpanded.delete(stat.projectId);
                        } else {
                          newExpanded.add(stat.projectId);
                        }
                        setExpandedProjects(newExpanded);
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        {isExpanded ? (
                          <ChevronDown size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        )}
                        <div
                          className="w-3 h-3 sm:w-4 sm:h-4 rounded flex-shrink-0"
                          style={{ backgroundColor: stat.customerColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium dark:text-white truncate text-sm sm:text-base">{stat.projectName}</p>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{stat.customerName}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end sm:text-right mt-2 sm:mt-0 pl-7 sm:pl-0 sm:ml-4 flex-shrink-0">
                        <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400">
                          {stat.entryCount} Einträge • {percentage.toFixed(1)}%
                        </div>
                        <div>
                          <p className="font-semibold dark:text-white text-sm sm:text-base">{hours.toFixed(2)} h</p>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{stat.totalAmount.toFixed(2)} €</p>
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2">
                      <div
                        className="h-1.5 sm:h-2 rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: stat.customerColor
                        }}
                      />
                    </div>
                    <div className="hidden sm:flex justify-between text-xs text-gray-500 dark:text-gray-400 px-2">
                      <span>{stat.entryCount} Einträge</span>
                      <span>{percentage.toFixed(1)}% der Gesamtzeit</span>
                    </div>

                    {/* Expanded entries list */}
                    {isExpanded && projectEntries.length > 0 && (
                      <div className="ml-4 sm:ml-8 mt-3 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3 sm:pl-4">
                        <h3 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Zeiteinträge:
                        </h3>
                        {projectEntries.map(entry => {
                          const entryHours = entry.duration / 3600;
                          const entryAmount = calculateAmount(entry);
                          const activity = entry.activityId ? getActivityById(entry.activityId) : null;

                          return (
                            <div
                              key={entry.id}
                              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 sm:p-3 text-xs sm:text-sm"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                                    <span className="text-gray-900 dark:text-white font-medium">
                                      {new Date(entry.startTime).toLocaleDateString('de-DE', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                      })}
                                    </span>
                                    {activity && (
                                      <span className="text-xs px-1.5 sm:px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                                        {activity.name}
                                      </span>
                                    )}
                                    <span className="sm:hidden text-gray-700 dark:text-gray-300 font-medium ml-auto">
                                      {entryHours.toFixed(2)} h • {entryAmount.toFixed(2)} €
                                    </span>
                                  </div>
                                  {entry.description && (
                                    <p className="text-gray-600 dark:text-gray-400 break-words text-xs sm:text-sm">
                                      {entry.description}
                                    </p>
                                  )}
                                  {!entry.description && (
                                    <p className="text-gray-400 dark:text-gray-500 italic text-xs sm:text-sm">
                                      (keine Beschreibung)
                                    </p>
                                  )}
                                </div>
                                <div className="hidden sm:block text-right flex-shrink-0">
                                  <p className="text-gray-900 dark:text-white font-medium">
                                    {entryHours.toFixed(2)} h
                                  </p>
                                  <p className="text-gray-500 dark:text-gray-400">
                                    {entryAmount.toFixed(2)} €
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
        activities={activities}
      />

      {/* Saved Reports Modal */}
      {showSavedReports && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Archive size={24} className="text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Gespeicherte Reports
                </h3>
              </div>
              <IconButton
                onClick={() => setShowSavedReports(false)}
                icon={<X size={20} />}
                variant="default"
                tooltip="Schließen"
              />
            </div>

            {/* Filter */}
            {savedReportCustomers.length > 0 && (
              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Kunde:</label>
                  <select
                    value={savedReportsFilter}
                    onChange={(e) => setSavedReportsFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">Alle Kunden</option>
                    {savedReportCustomers.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {isLoadingSavedReports ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                </div>
              ) : filteredSavedReports.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Archive size={48} className="mx-auto mb-4 opacity-50" />
                  <p>{savedReportsFilter === 'all' ? 'Keine gespeicherten Reports vorhanden' : 'Keine Reports für diesen Kunden'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSavedReports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {report.customer_name}
                          </h4>
                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                            {report.report_title}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            {new Date(report.start_date).toLocaleDateString('de-DE')} - {new Date(report.end_date).toLocaleDateString('de-DE')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {report.total_hours.toFixed(2)}h
                          </span>
                          <span>{report.entry_count} Einträge</span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Gespeichert am {new Date(report.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <IconButton
                          onClick={() => previewSavedReport(filteredSavedReports.indexOf(report))}
                          disabled={isGeneratingSavedPreview}
                          icon={isGeneratingSavedPreview ? <Loader2 size={18} className="animate-spin" /> : <Eye size={18} />}
                          variant="primary"
                          tooltip="PDF Vorschau"
                        />
                        <IconButton
                          onClick={() => deleteSavedReport(report.id)}
                          icon={<Trash2 size={18} />}
                          variant="danger"
                          tooltip="Report löschen"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredSavedReports.length} von {savedReports.length} Report(s)
              </span>
              <Button
                onClick={() => setShowSavedReports(false)}
                variant="secondary"
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal for Saved Reports */}
      {savedReportPreview.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-7xl flex flex-col">
            {/* Preview Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-blue-600" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {savedReportPreview.reportName}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    PDF Vorschau
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Navigation for multiple reports */}
                {savedReportPreview.totalCount > 1 && (
                  <div className="flex items-center gap-1 mr-4">
                    <button
                      onClick={() => navigateSavedReportPreview('prev')}
                      disabled={savedReportPreview.currentIndex === 0 || isGeneratingSavedPreview}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
                      {savedReportPreview.currentIndex + 1} / {savedReportPreview.totalCount}
                    </span>
                    <button
                      onClick={() => navigateSavedReportPreview('next')}
                      disabled={savedReportPreview.currentIndex === savedReportPreview.totalCount - 1 || isGeneratingSavedPreview}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                  </div>
                )}
                <button
                  onClick={closeSavedReportPreview}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 bg-gray-100 dark:bg-gray-900 overflow-hidden relative">
              {isGeneratingSavedPreview ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={40} className="animate-spin text-blue-600" />
                    <span className="text-gray-600 dark:text-gray-400">PDF wird generiert...</span>
                  </div>
                </div>
              ) : savedReportPreview.pdfUrl ? (
                <>
                  <object
                    data={savedReportPreview.pdfUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    {/* Fallback message - buttons are below */}
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                      <p className="text-gray-600 dark:text-gray-400 mb-2">PDF-Vorschau nicht verfügbar</p>
                      <p className="text-sm text-gray-500 dark:text-gray-500">Bitte Buttons unten verwenden</p>
                    </div>
                  </object>
                  {/* Action buttons - responsive for mobile */}
                  <div className="absolute bottom-4 left-4 right-4 flex flex-col sm:flex-row sm:justify-end gap-2">
                    <a
                      href={savedReportPreview.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 sm:py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-lg flex items-center justify-center gap-2"
                    >
                      <Eye size={18} />
                      In neuem Tab öffnen
                    </a>
                    <a
                      href={savedReportPreview.pdfUrl}
                      download={`${savedReportPreview.reportName}.pdf`}
                      className="px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2"
                    >
                      <Download size={18} />
                      Herunterladen
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
