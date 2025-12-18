import { useState, useMemo, useEffect } from 'react';
import { X, FileText, Download, Mail, CheckCircle2, Calendar, Clock, Euro, Save, Loader2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
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

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Duplicate confirmation state
  interface ExistingReport {
    id: string;
    customerName: string;
    savedAt: string;
    totalHours: number;
  }
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    show: boolean;
    existingReports: ExistingReport[];
    pendingCustomerIds: string[];
  }>({ show: false, existingReports: [], pendingCustomerIds: [] });

  // PDF Preview state
  const [pdfPreview, setPdfPreview] = useState<{
    show: boolean;
    pdfUrl: string | null;
    customerName: string;
    currentIndex: number;
    totalCount: number;
  }>({ show: false, pdfUrl: null, customerName: '', currentIndex: 0, totalCount: 0 });
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

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

  // Generate Modern PDF Report
  const generateModernPDF = async (customerData: CustomerReportData) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const customerEntries = getCustomerEntries(customerData.customer.id);

    // Page dimensions
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Colors - Modern palette
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
    const reportTitle = customerData.customer.reportTitle || 'Dienstleistungsnachweis';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text(reportTitle, margin + 12, y + 8);

    // Customer name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(customerData.customer.name, margin + 12, y + 24);

    // Date range
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text(formatDateRange(dateRange.start, dateRange.end), margin + 12, y + 35);

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
    doc.text(formatHoursMinutes(customerData.totalHours), margin + 10, y + 35);

    // Card 2: Entry Count
    doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
    doc.roundedRect(margin + cardWidth + 8, y, cardWidth, cardHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Einträge', margin + cardWidth + 18, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(customerData.entryCount.toString(), margin + cardWidth + 18, y + 35);

    // Card 3: Projects
    doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
    doc.roundedRect(margin + (cardWidth + 8) * 2, y, cardWidth, cardHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(gray.r, gray.g, gray.b);
    doc.text('Projekte', margin + (cardWidth + 8) * 2 + 10, y + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(dark.r, dark.g, dark.b);
    doc.text(customerData.projectCount.toString(), margin + (cardWidth + 8) * 2 + 10, y + 35);

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

    // ============ DETAIL PAGES (Landscape) ============
    if (customerEntries.length > 0) {
      // Add landscape page - correct jsPDF syntax
      doc.addPage([297, 210], 'l');

      const lWidth = 297;
      const lHeight = 210;
      let pageNum = 2;

      // Column positions for landscape
      const colDate = margin;
      const colDay = margin + 25;
      const colProject = margin + 42;
      const colActivity = margin + 100;
      const colDesc = margin + 155;
      const colHours = lWidth - margin;

      // Header function for detail pages
      const addDetailHeader = async () => {
        // Top bar with accent color
        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.rect(0, 0, lWidth, 3, 'F');

        // Header content
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(dark.r, dark.g, dark.b);
        doc.text(customerData.customer.name, margin, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(gray.r, gray.g, gray.b);
        doc.text(formatDateRange(dateRange.start, dateRange.end), margin, 26);

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
      doc.text('Datum', colDate, y);
      doc.text('Tag', colDay, y);
      doc.text('Projekt', colProject, y);
      doc.text('Tätigkeit', colActivity, y);
      doc.text('Beschreibung', colDesc, y);
      doc.text('Zeit', colHours, y, { align: 'right' });

      y += 10;
      let rowIndex = 0;
      const lineHeight = 4; // Height per line of text
      const minRowHeight = 7; // Minimum row height
      const maxDescWidth = colHours - colDesc - 15; // Width for description column

      for (const entry of customerEntries) {
        // Calculate description lines first to know row height
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const desc = entry.description || '-';
        const descLines = doc.splitTextToSize(desc, maxDescWidth);
        const rowHeight = Math.max(minRowHeight, descLines.length * lineHeight + 3);

        // Check for page break with dynamic row height
        if (y + rowHeight > lHeight - 25) {
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
          doc.text('Datum', colDate, y);
          doc.text('Tag', colDay, y);
          doc.text('Projekt', colProject, y);
          doc.text('Tätigkeit', colActivity, y);
          doc.text('Beschreibung', colDesc, y);
          doc.text('Zeit', colHours, y, { align: 'right' });
          y += 10;
        }

        // Alternating row background with dynamic height
        if (rowIndex % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin, y - 4, lWidth - margin * 2, rowHeight, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(dark.r, dark.g, dark.b);

        // Date
        doc.text(entry.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), colDate, y);

        // Weekday
        doc.setTextColor(gray.r, gray.g, gray.b);
        doc.text(entry.weekday, colDay, y);
        doc.setTextColor(dark.r, dark.g, dark.b);

        // Project (truncate if needed)
        const maxProjectWidth = 52;
        let projectName = entry.project.name;
        while (doc.getTextWidth(projectName) > maxProjectWidth && projectName.length > 3) {
          projectName = projectName.substring(0, projectName.length - 4) + '...';
        }
        doc.text(projectName, colProject, y);

        // Activity (truncate if needed)
        const maxActivityWidth = 50;
        let activityName = entry.activity?.name || '-';
        while (doc.getTextWidth(activityName) > maxActivityWidth && activityName.length > 3) {
          activityName = activityName.substring(0, activityName.length - 4) + '...';
        }
        doc.text(activityName, colActivity, y);

        // Description - multi-line
        doc.text(descLines, colDesc, y);

        // Hours (vertically centered if multi-line)
        doc.setFont('helvetica', 'bold');
        const hoursY = descLines.length > 1 ? y + ((descLines.length - 1) * lineHeight) / 2 : y;
        doc.text(formatHoursMinutes(entry.hours), colHours, hoursY, { align: 'right' });

        y += rowHeight;
        rowIndex++;
      }

      // Total row
      y += 5;
      doc.setDrawColor(dark.r, dark.g, dark.b);
      doc.setLineWidth(0.5);
      doc.line(colHours - 50, y, lWidth - margin, y);
      y += 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Gesamt:', colHours - 50, y);
      doc.setFontSize(11);
      doc.text(formatHoursMinutes(customerData.totalHours), colHours, y, { align: 'right' });

      // Final page footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(gray.r, gray.g, gray.b);
      doc.text(`Seite ${pageNum}`, lWidth - margin, lHeight - 10, { align: 'right' });
    }

    return doc;
  };

  const exportSelected = async () => {
    for (const customerId of Array.from(selectedCustomers)) {
      const customerData = reportData.find(d => d.customer.id === customerId);
      if (customerData) {
        const doc = await generateModernPDF(customerData);
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
        const fileTitle = (customerData.customer.reportTitle || 'Dienstleistungsnachweis').replace(/\s+/g, '_');
        doc.save(`${fileTitle}_${customerData.customer.name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
      }
    }
  };

  // Check for existing reports before saving
  const checkForDuplicates = async (): Promise<ExistingReport[]> => {
    const token = localStorage.getItem('auth_token');
    const existingReports: ExistingReport[] = [];

    for (const customerId of Array.from(selectedCustomers)) {
      const customerData = reportData.find(d => d.customer.id === customerId);
      if (customerData) {
        try {
          const response = await fetch('/api/report-approvals/check-exists', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              customerId,
              startDate: dateRange.start.toISOString(),
              endDate: dateRange.end.toISOString()
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.exists) {
              existingReports.push(data.existingReport);
            }
          }
        } catch (error) {
          console.error('Check duplicates error:', error);
        }
      }
    }

    return existingReports;
  };

  // Save reports to database as proof
  const saveReports = async (overwrite = false) => {
    if (selectedCustomers.size === 0) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const token = localStorage.getItem('auth_token');
      console.log('Save reports - Token exists:', !!token, 'Length:', token?.length);

      if (!token) {
        setSaveMessage({ type: 'error', text: 'Nicht eingeloggt - bitte neu anmelden' });
        setIsSaving(false);
        return;
      }

      // Check for duplicates first (unless we're overwriting)
      if (!overwrite) {
        const existingReports = await checkForDuplicates();
        if (existingReports.length > 0) {
          setIsSaving(false);
          setDuplicateConfirm({
            show: true,
            existingReports,
            pendingCustomerIds: Array.from(selectedCustomers)
          });
          return;
        }
      }

      // Delete existing reports if overwriting
      if (overwrite && duplicateConfirm.existingReports.length > 0) {
        for (const existing of duplicateConfirm.existingReports) {
          await fetch(`/api/report-approvals/saved/${existing.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
      }

      let savedCount = 0;

      for (const customerId of Array.from(selectedCustomers)) {
        const customerData = reportData.find(d => d.customer.id === customerId);
        if (customerData) {
          const customerEntries = getCustomerEntries(customerId);

          const reportPayload = {
            reportData: {
              customerId: String(customerData.customer.id),
              customerName: customerData.customer.name,
              reportTitle: customerData.customer.reportTitle || 'Dienstleistungsnachweis',
              timeEntries: customerEntries.map(e => ({
                date: e.date.toISOString(),
                weekday: e.weekday,
                projectName: e.project.name,
                activityName: e.activity?.name || '-',
                description: e.description,
                hours: e.hours
              })),
              startDate: dateRange.start.toISOString(),
              endDate: dateRange.end.toISOString(),
              totalHours: customerData.totalHours,
              entryCount: customerData.entryCount,
              projectCount: customerData.projectCount
            }
          };

          const response = await fetch('/api/report-approvals/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(reportPayload)
          });

          if (response.ok) {
            savedCount++;
          } else {
            const errorText = await response.text();
            console.error('Save error status:', response.status, 'body:', errorText);
            // Show the actual error to user
            setSaveMessage({
              type: 'error',
              text: `Fehler: ${response.status} - ${errorText.substring(0, 100)}`
            });
          }
        }
      }

      // Reset duplicate confirm state
      setDuplicateConfirm({ show: false, existingReports: [], pendingCustomerIds: [] });

      if (savedCount > 0) {
        setSaveMessage({
          type: 'success',
          text: `${savedCount} Report(s) erfolgreich gespeichert`
        });
        // Clear message after 3 seconds
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({
          type: 'error',
          text: 'Keine Reports gespeichert'
        });
      }
    } catch (error) {
      console.error('Save reports error:', error);
      setSaveMessage({
        type: 'error',
        text: 'Fehler beim Speichern'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel duplicate overwrite
  const cancelDuplicateOverwrite = () => {
    setDuplicateConfirm({ show: false, existingReports: [], pendingCustomerIds: [] });
  };

  // PDF Preview functions
  const openPreview = async (index: number = 0) => {
    const selectedIds = Array.from(selectedCustomers);
    if (selectedIds.length === 0) return;

    setIsGeneratingPreview(true);

    try {
      const customerId = selectedIds[index];
      const customerData = reportData.find(d => d.customer.id === customerId);

      if (customerData) {
        const doc = await generateModernPDF(customerData);
        const pdfUrl = doc.output('bloburl');

        // Revoke previous URL to prevent memory leaks
        if (pdfPreview.pdfUrl) {
          URL.revokeObjectURL(pdfPreview.pdfUrl);
        }

        setPdfPreview({
          show: true,
          pdfUrl: pdfUrl as string,
          customerName: customerData.customer.name,
          currentIndex: index,
          totalCount: selectedIds.length
        });
      }
    } catch (error) {
      console.error('Preview generation error:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const closePreview = () => {
    if (pdfPreview.pdfUrl) {
      URL.revokeObjectURL(pdfPreview.pdfUrl);
    }
    setPdfPreview({ show: false, pdfUrl: null, customerName: '', currentIndex: 0, totalCount: 0 });
  };

  const navigatePreview = async (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next'
      ? pdfPreview.currentIndex + 1
      : pdfPreview.currentIndex - 1;

    if (newIndex >= 0 && newIndex < pdfPreview.totalCount) {
      await openPreview(newIndex);
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
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Professionelle Tätigkeitsnachweise erstellen
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

        {/* PDF Preview Modal */}
        {pdfPreview.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-7xl flex flex-col">
              {/* Preview Header */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-accent-primary" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {pdfPreview.customerName}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateRange(dateRange.start, dateRange.end)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Navigation for multiple reports */}
                  {pdfPreview.totalCount > 1 && (
                    <div className="flex items-center gap-1 mr-4">
                      <button
                        onClick={() => navigatePreview('prev')}
                        disabled={pdfPreview.currentIndex === 0 || isGeneratingPreview}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
                      </button>
                      <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
                        {pdfPreview.currentIndex + 1} / {pdfPreview.totalCount}
                      </span>
                      <button
                        onClick={() => navigatePreview('next')}
                        disabled={pdfPreview.currentIndex === pdfPreview.totalCount - 1 || isGeneratingPreview}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={closePreview}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 bg-gray-100 dark:bg-dark-200 overflow-hidden">
                {isGeneratingPreview ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={40} className="animate-spin text-accent-primary" />
                      <span className="text-gray-600 dark:text-gray-300">PDF wird generiert...</span>
                    </div>
                  </div>
                ) : pdfPreview.pdfUrl ? (
                  <iframe
                    src={pdfPreview.pdfUrl}
                    className="w-full h-full border-0"
                    title="PDF Preview"
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Confirmation Dialog */}
        {duplicateConfirm.show && (
          <div className="px-6 py-4 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
                <span className="text-amber-600 dark:text-amber-400 text-xl">⚠</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Bereits gespeicherte Reports gefunden
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                  Für folgende Kunden existieren bereits Reports im gewählten Zeitraum:
                </p>
                <ul className="text-sm text-amber-700 dark:text-amber-400 mb-4 space-y-1">
                  {duplicateConfirm.existingReports.map((report, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      <strong>{report.customerName}</strong>
                      <span className="text-amber-600 dark:text-amber-500">
                        ({formatHoursMinutes(report.totalHours)}, gespeichert am {new Date(report.savedAt).toLocaleDateString('de-DE')})
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3">
                  <button
                    onClick={cancelDuplicateOverwrite}
                    className="px-4 py-2 text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-lg font-medium transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => saveReports(true)}
                    disabled={isSaving}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Überschreibe...' : 'Überschreiben'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {reportData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200">
            {/* Save Message */}
            {saveMessage && (
              <div className={`mb-3 px-3 py-2 rounded-lg text-sm ${
                saveMessage.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {saveMessage.text}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg font-medium transition-colors"
              >
                Schließen
              </button>
              <button
                onClick={() => openPreview()}
                disabled={selectedCustomers.size === 0 || isGeneratingPreview}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPreview ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Eye size={18} />
                )}
                Vorschau
              </button>
              <button
                onClick={() => saveReports()}
                disabled={selectedCustomers.size === 0 || isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {isSaving ? 'Speichern...' : 'Als Nachweis speichern'}
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
          </div>
        )}
      </div>
    </div>
  );
};
