import { useState, useMemo, useEffect } from 'react';
import { X, FileText, Download, Mail, CheckCircle2, Calendar, Clock, Euro, Save, Loader2, Eye, ChevronLeft, ChevronRight, Archive, Trash2, Send, Copy, Link, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
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
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  // Check if it's a full quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
  const isFirstOfMonth = start.getDate() === 1;
  const isLastOfMonth = end.getDate() === new Date(endYear, endMonth + 1, 0).getDate();
  const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth);

  if (isFirstOfMonth && isLastOfMonth && monthDiff === 2 && startMonth % 3 === 0 && startYear === endYear) {
    const quarter = Math.floor(startMonth / 3) + 1;
    return `Q${quarter} ${startYear}`;
  }

  // Check if it's a full year
  if (isFirstOfMonth && isLastOfMonth && startMonth === 0 && endMonth === 11 && startYear === endYear) {
    return `Jahr ${startYear}`;
  }

  // Check if it's a full month
  if (isFirstOfMonth && isLastOfMonth && startMonth === endMonth && startYear === endYear) {
    return start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }

  // Different months or years - show full dates
  if (startMonth !== endMonth || startYear !== endYear) {
    const startStr = start.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    const endStr = end.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }

  // Same month - show abbreviated format
  const startStr = start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
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

  // PDF Configuration state
  interface PdfConfig {
    reportTitle: string;
    includeCoverPage: boolean;
    includeTimeEntries: boolean;
    columns: {
      date: boolean;
      weekday: boolean;
      times: boolean;
      project: boolean;
      activity: boolean;
      description: boolean;
      hours: boolean;
    };
  }
  const [pdfConfigModal, setPdfConfigModal] = useState<{
    show: boolean;
    customerId: string | null;
    customerName: string;
  }>({ show: false, customerId: null, customerName: '' });
  const [pdfConfig, setPdfConfig] = useState<PdfConfig>({
    reportTitle: 'Dienstleistungsnachweis',
    includeCoverPage: true,
    includeTimeEntries: true,
    columns: {
      date: true,
      weekday: true,
      times: false,
      project: true,
      activity: true,
      description: true,
      hours: true,
    },
  });
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

  // Saved reports state
  interface SavedReport {
    id: string;
    token: string;
    customer_id: string;
    customer_name: string;
    recipient_email: string;
    report_title: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    entry_count: number;
    project_count: number;
    status: 'saved' | 'pending' | 'approved' | 'rejected';
    created_at: string;
    reviewed_at: string | null;
    expires_at: string | null;
    notes: string | null;
    time_entries: any[];
  }
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showSavedReports, setShowSavedReports] = useState(false);
  const [isLoadingSavedReports, setIsLoadingSavedReports] = useState(false);
  const [savedReportsFilter, setSavedReportsFilter] = useState<'all' | 'saved' | 'pending' | 'approved' | 'rejected'>('all');

  // Send for approval state
  const [sendApprovalDialog, setSendApprovalDialog] = useState<{
    show: boolean;
    report: SavedReport | null;
    email: string;
    name: string;
    isSending: boolean;
    testMode: boolean;
  }>({ show: false, report: null, email: '', name: '', isSending: false, testMode: true });

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
  const generateModernPDF = async (customerData: CustomerReportData, config: PdfConfig = pdfConfig) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const customerEntries = getCustomerEntries(customerData.customer.id);

    // Use config for report title
    const reportTitle = config.reportTitle || customerData.customer.reportTitle || 'Dienstleistungsnachweis';

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

    // Helper to add logo with proper scaling and compression
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

          // Only resize very large logos to reduce PDF size (keep format to preserve transparency)
          let logoData = companyInfo.logo;
          const maxDimension = 300;
          if (dims.width > maxDimension || dims.height > maxDimension) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const scale = Math.min(maxDimension / dims.width, maxDimension / dims.height);
              canvas.width = Math.round(dims.width * scale);
              canvas.height = Math.round(dims.height * scale);

              const img = new Image();
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = companyInfo.logo!;
              });

              // Keep PNG format to preserve transparency
              logoData = canvas.toDataURL('image/png');
            }
          }

          doc.addImage(logoData, 'PNG', x, y, w, h);
        } catch {
          // Ignore logo errors
        }
      }
    };

    // ============ COVER PAGE ============
    let y = 25;
    let pageNum = 0;

    if (config.includeCoverPage) {
      pageNum = 1;
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

      // Report title
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

      // ============ DONUT CHART SECTION ============
      y = 210;

      // Calculate project breakdown
      const projectBreakdown = new Map<string, { name: string; hours: number }>();
      customerEntries.forEach(entry => {
        const existing = projectBreakdown.get(entry.project.id);
        if (existing) {
          existing.hours += entry.hours;
        } else {
          projectBreakdown.set(entry.project.id, {
            name: entry.project.name,
            hours: entry.hours
          });
        }
      });

      const projectData = Array.from(projectBreakdown.values()).sort((a, b) => b.hours - a.hours);

      if (projectData.length > 0) {
        // Donut chart configuration (compact size to avoid overlap)
        const centerX = margin + 30;
        const centerY = y + 25;
        const outerRadius = 22;
        const innerRadius = 10; // Creates donut hole

        // Draw chart title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(dark.r, dark.g, dark.b);
        doc.text('Zeitverteilung nach Projekten', margin, y);

        // Calculate total hours
        const totalHours = projectData.reduce((sum, p) => sum + p.hours, 0);

        // High-contrast color palette (always used for better visibility)
        const chartColors = [
          { r: 249, g: 115, b: 22 },   // Orange #f97316
          { r: 59, g: 130, b: 246 },   // Blue #3b82f6
          { r: 16, g: 185, b: 129 },   // Green #10b981
          { r: 139, g: 92, b: 246 },   // Purple #8b5cf6
          { r: 239, g: 68, b: 68 },    // Red #ef4444
          { r: 245, g: 158, b: 11 },   // Amber #f59e0b
          { r: 6, g: 182, b: 212 },    // Cyan #06b6d4
          { r: 236, g: 72, b: 153 },   // Pink #ec4899
          { r: 132, g: 204, b: 22 },   // Lime #84cc16
          { r: 99, g: 102, b: 241 },   // Indigo #6366f1
        ];

        // Draw donut segments
        let startAngle = -Math.PI / 2; // Start at 12 o'clock

        projectData.forEach((project, index) => {
          const percentage = project.hours / totalHours;
          const sweepAngle = percentage * 2 * Math.PI;
          const rgb = chartColors[index % chartColors.length];

          doc.setFillColor(rgb.r, rgb.g, rgb.b);

          // Draw segment with fewer steps for smaller file size (12-24 triangles per segment is enough)
          const steps = Math.max(12, Math.min(24, Math.floor(sweepAngle * 8)));
          const angleStep = sweepAngle / steps;

          // Draw outer arc triangles
          for (let i = 0; i < steps; i++) {
            const a1 = startAngle + angleStep * i;
            const a2 = startAngle + angleStep * (i + 1);
            doc.triangle(
              centerX, centerY,
              centerX + outerRadius * Math.cos(a1), centerY + outerRadius * Math.sin(a1),
              centerX + outerRadius * Math.cos(a2), centerY + outerRadius * Math.sin(a2),
              'F'
            );
          }

          startAngle += sweepAngle;
        });

        // Draw white center circle to create donut effect (fewer triangles)
        doc.setFillColor(255, 255, 255);
        const circleSteps = 24; // Reduced from 60
        for (let i = 0; i < circleSteps; i++) {
          const a1 = (i / circleSteps) * 2 * Math.PI;
          const a2 = ((i + 1) / circleSteps) * 2 * Math.PI;
          doc.triangle(
            centerX, centerY,
            centerX + innerRadius * Math.cos(a1), centerY + innerRadius * Math.sin(a1),
            centerX + innerRadius * Math.cos(a2), centerY + innerRadius * Math.sin(a2),
            'F'
          );
        }

        // Draw legend on the right side
        const legendX = margin + 65;
        let legendY = y + 10;
        const legendItemHeight = 12;
        const maxLegendItems = 5;

        const displayProjects = projectData.slice(0, maxLegendItems);
        const hasMore = projectData.length > maxLegendItems;

        displayProjects.forEach((project, index) => {
          const percentage = (project.hours / totalHours * 100).toFixed(1);
          const rgb = chartColors[index % chartColors.length];

          // Color box (rounded)
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.roundedRect(legendX, legendY - 3, 5, 5, 1, 1, 'F');

          // Project name (longer text allowed)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(dark.r, dark.g, dark.b);
          const maxNameLength = 35;
          const nameText = project.name.length > maxNameLength
            ? project.name.substring(0, maxNameLength - 3) + '...'
            : project.name;
          doc.text(nameText, legendX + 8, legendY);

          // Hours and percentage
          doc.setTextColor(gray.r, gray.g, gray.b);
          doc.text(`${formatHoursMinutes(project.hours)} (${percentage}%)`, legendX + 8, legendY + 5);

          legendY += legendItemHeight;
        });

        if (hasMore) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(gray.r, gray.g, gray.b);
          doc.text(`+ ${projectData.length - maxLegendItems} weitere Projekte`, legendX + 8, legendY);
        }
      }

      // Signature section (positioned below donut chart)
      y = 270;
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
    }

    // ============ DETAIL PAGES (Landscape) ============
    if (config.includeTimeEntries && customerEntries.length > 0) {
      // Add landscape page - correct jsPDF syntax
      if (config.includeCoverPage) {
        doc.addPage([297, 210], 'l');
      } else {
        // If no cover page, we're on the first page but need landscape
        // jsPDF doesn't support changing orientation, so we add a new page anyway
        doc.addPage([297, 210], 'l');
        doc.deletePage(1); // Remove the empty portrait page
      }

      const lWidth = 297;
      const lHeight = 210;
      pageNum = config.includeCoverPage ? 2 : 1;

      // Calculate dynamic column positions based on selected columns
      const cols = config.columns;
      const colWidths: { [key: string]: number } = {
        date: 28,
        weekday: 15,
        times: 30,
        project: 55,
        activity: 50,
        description: 0, // Will take remaining space
        hours: 25,
      };

      // Calculate total fixed width and determine description width
      let fixedWidth = margin * 2; // margins
      if (cols.date) fixedWidth += colWidths.date;
      if (cols.weekday) fixedWidth += colWidths.weekday;
      if (cols.times) fixedWidth += colWidths.times;
      if (cols.project) fixedWidth += colWidths.project;
      if (cols.activity) fixedWidth += colWidths.activity;
      if (cols.hours) fixedWidth += colWidths.hours;
      if (cols.description) colWidths.description = lWidth - fixedWidth - 5;

      // Build column positions dynamically
      let currentX = margin;
      const colPositions: { [key: string]: number } = {};

      if (cols.date) { colPositions.date = currentX; currentX += colWidths.date; }
      if (cols.weekday) { colPositions.weekday = currentX; currentX += colWidths.weekday; }
      if (cols.times) { colPositions.times = currentX; currentX += colWidths.times; }
      if (cols.project) { colPositions.project = currentX; currentX += colWidths.project; }
      if (cols.activity) { colPositions.activity = currentX; currentX += colWidths.activity; }
      if (cols.description) { colPositions.description = currentX; currentX += colWidths.description; }
      if (cols.hours) { colPositions.hours = lWidth - margin; } // Always right-aligned

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

      // Function to render table headers
      const renderTableHeader = (yPos: number) => {
        doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
        doc.rect(margin, yPos - 5, lWidth - margin * 2, 10, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(dark.r, dark.g, dark.b);

        if (cols.date) doc.text('Datum', colPositions.date, yPos);
        if (cols.weekday) doc.text('Tag', colPositions.weekday, yPos);
        if (cols.times) doc.text('Uhrzeiten', colPositions.times, yPos);
        if (cols.project) doc.text('Projekt', colPositions.project, yPos);
        if (cols.activity) doc.text('Tätigkeit', colPositions.activity, yPos);
        if (cols.description) doc.text('Beschreibung', colPositions.description, yPos);
        if (cols.hours) doc.text('Zeit', colPositions.hours, yPos, { align: 'right' });
      };

      y = await addDetailHeader();
      renderTableHeader(y);

      y += 10;
      let rowIndex = 0;
      const lineHeight = 4; // Height per line of text
      const minRowHeight = 7; // Minimum row height
      const maxDescWidth = cols.description ? colWidths.description - 5 : 100;

      for (const entry of customerEntries) {
        // Calculate description lines first to know row height
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const desc = entry.description || '-';
        const descLines = cols.description ? doc.splitTextToSize(desc, maxDescWidth) : ['-'];
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
          renderTableHeader(y);
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
        if (cols.date) {
          doc.text(entry.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), colPositions.date, y);
        }

        // Weekday
        if (cols.weekday) {
          doc.setTextColor(gray.r, gray.g, gray.b);
          doc.text(entry.weekday, colPositions.weekday, y);
          doc.setTextColor(dark.r, dark.g, dark.b);
        }

        // Times (start - end)
        if (cols.times) {
          const startTime = entry.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          const endDate = new Date(entry.date.getTime() + entry.hours * 3600000);
          const endTime = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          doc.setTextColor(gray.r, gray.g, gray.b);
          doc.text(`${startTime}-${endTime}`, colPositions.times, y);
          doc.setTextColor(dark.r, dark.g, dark.b);
        }

        // Project (truncate if needed)
        if (cols.project) {
          const maxProjectWidth = colWidths.project - 5;
          let projectName = entry.project.name;
          while (doc.getTextWidth(projectName) > maxProjectWidth && projectName.length > 3) {
            projectName = projectName.substring(0, projectName.length - 4) + '...';
          }
          doc.text(projectName, colPositions.project, y);
        }

        // Activity (truncate if needed)
        if (cols.activity) {
          const maxActivityWidth = colWidths.activity - 5;
          let activityName = entry.activity?.name || '-';
          while (doc.getTextWidth(activityName) > maxActivityWidth && activityName.length > 3) {
            activityName = activityName.substring(0, activityName.length - 4) + '...';
          }
          doc.text(activityName, colPositions.activity, y);
        }

        // Description - multi-line
        if (cols.description) {
          doc.text(descLines, colPositions.description, y);
        }

        // Hours (vertically centered if multi-line)
        if (cols.hours) {
          doc.setFont('helvetica', 'bold');
          const hoursY = descLines.length > 1 ? y + ((descLines.length - 1) * lineHeight) / 2 : y;
          doc.text(formatHoursMinutes(entry.hours), colPositions.hours, hoursY, { align: 'right' });
        }

        y += rowHeight;
        rowIndex++;
      }

      // Total row
      if (cols.hours) {
        y += 5;
        doc.setDrawColor(dark.r, dark.g, dark.b);
        doc.setLineWidth(0.5);
        doc.line(colPositions.hours - 50, y, lWidth - margin, y);
        y += 7;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Gesamt:', colPositions.hours - 50, y);
        doc.setFontSize(11);
        doc.text(formatHoursMinutes(customerData.totalHours), colPositions.hours, y, { align: 'right' });
      }

      // Final page footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(gray.r, gray.g, gray.b);
      doc.text(`Seite ${pageNum}`, lWidth - margin, lHeight - 10, { align: 'right' });
    }

    return doc;
  };

  // Open PDF config modal before export
  const openPdfConfigModal = () => {
    if (selectedCustomers.size === 0) return;

    // Get the first selected customer to use their reportTitle as default
    const firstCustomerId = Array.from(selectedCustomers)[0];
    const firstCustomerData = reportData.find(d => d.customer.id === firstCustomerId);

    setPdfConfig(prev => ({
      ...prev,
      reportTitle: firstCustomerData?.customer.reportTitle || 'Dienstleistungsnachweis',
    }));

    setPdfConfigModal({
      show: true,
      customerId: null, // null means all selected
      customerName: selectedCustomers.size === 1
        ? firstCustomerData?.customer.name || ''
        : `${selectedCustomers.size} Kunden`,
    });
  };

  const exportWithConfig = async () => {
    setPdfConfigModal({ show: false, customerId: null, customerName: '' });

    for (const customerId of Array.from(selectedCustomers)) {
      const customerData = reportData.find(d => d.customer.id === customerId);
      if (customerData) {
        const doc = await generateModernPDF(customerData, pdfConfig);
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
        const fileTitle = pdfConfig.reportTitle.replace(/\s+/g, '_');
        doc.save(`${fileTitle}_${customerData.customer.name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
      }
    }
  };

  // Legacy direct export (for backward compatibility)
  const exportSelected = async () => {
    openPdfConfigModal();
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
  const openPreview = async (index: number = 0, config?: PdfConfig) => {
    const selectedIds = Array.from(selectedCustomers);
    console.log('Opening preview, selectedIds:', selectedIds, 'index:', index);
    if (selectedIds.length === 0) {
      console.log('No customers selected for preview');
      return;
    }

    setIsGeneratingPreview(true);

    try {
      const customerId = selectedIds[index];
      const customerData = reportData.find(d => d.customer.id === customerId);
      console.log('Customer data for preview:', customerData?.customer.name);

      if (customerData) {
        console.log('Generating PDF...');
        const doc = await generateModernPDF(customerData, config || pdfConfig);
        console.log('PDF generated, creating blob URL...');
        const pdfUrl = doc.output('bloburl');
        console.log('Blob URL created:', pdfUrl);

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
        console.log('Preview state updated');
      } else {
        console.log('No customer data found for id:', customerId);
      }
    } catch (error) {
      console.error('Preview generation error:', error);
      alert('Fehler bei PDF-Vorschau: ' + (error as Error).message);
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
      await openPreview(newIndex, pdfConfig);
    }
  };

  // Load saved reports
  const loadSavedReports = async (filterStatus?: string) => {
    setIsLoadingSavedReports(true);
    try {
      const token = localStorage.getItem('auth_token');
      const status = filterStatus || savedReportsFilter;
      const response = await fetch(`/api/report-approvals/saved?status=${status}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedReports(data.reports || []);
      } else {
        console.error('Failed to load saved reports');
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

  // Send report for approval
  const openSendApprovalDialog = (report: SavedReport) => {
    setSendApprovalDialog({
      show: true,
      report,
      email: report.recipient_email || '',
      name: '',
      isSending: false,
      testMode: true
    });
  };

  const sendForApproval = async () => {
    if (!sendApprovalDialog.report || !sendApprovalDialog.email) return;

    setSendApprovalDialog(prev => ({ ...prev, isSending: true }));

    try {
      const token = localStorage.getItem('auth_token');
      const report = sendApprovalDialog.report;

      const response = await fetch('/api/report-approvals/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientEmail: sendApprovalDialog.email,
          recipientName: sendApprovalDialog.name || sendApprovalDialog.email,
          reportData: {
            customerId: report.customer_id,
            customerName: report.customer_name,
            reportTitle: report.report_title,
            timeEntries: report.time_entries,
            startDate: report.start_date,
            endDate: report.end_date,
            totalHours: report.total_hours,
            entryCount: report.entry_count,
            projectCount: report.project_count
          },
          expiresInDays: 7,
          testMode: sendApprovalDialog.testMode
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSaveMessage({
          type: 'success',
          text: sendApprovalDialog.testMode
            ? `[TEST] Freigabe-Anfrage wurde erstellt (keine E-Mail versendet)`
            : `Freigabe-Anfrage wurde an ${sendApprovalDialog.email} gesendet`
        });
        setTimeout(() => setSaveMessage(null), 5000);

        // Close dialog and refresh list
        setSendApprovalDialog({ show: false, report: null, email: '', name: '', isSending: false, testMode: true });
        loadSavedReports();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Senden');
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setSendApprovalDialog(prev => ({ ...prev, isSending: false }));
    }
  };

  // Copy approval link to clipboard
  const copyApprovalLink = async (report: SavedReport) => {
    const approvalUrl = `${window.location.origin}/approve/${report.token}`;
    try {
      await navigator.clipboard.writeText(approvalUrl);
      setSaveMessage({ type: 'success', text: 'Link in Zwischenablage kopiert' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      // Fallback for older browsers
      prompt('Freigabe-Link:', approvalUrl);
    }
  };

  // Get status badge for report
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'saved':
        return { label: 'Gespeichert', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: Save };
      case 'pending':
        return { label: 'Wartet', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock };
      case 'approved':
        return { label: 'Genehmigt', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle };
      case 'rejected':
        return { label: 'Abgelehnt', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-700', icon: AlertCircle };
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
              <div className="flex-1 bg-gray-100 dark:bg-dark-200 overflow-hidden relative">
                {isGeneratingPreview ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={40} className="animate-spin text-accent-primary" />
                      <span className="text-gray-600 dark:text-gray-300">PDF wird generiert...</span>
                    </div>
                  </div>
                ) : pdfPreview.pdfUrl ? (
                  <>
                    <object
                      data={pdfPreview.pdfUrl}
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
                        href={pdfPreview.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 sm:py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-lg flex items-center justify-center gap-2"
                      >
                        <Eye size={18} />
                        In neuem Tab öffnen
                      </a>
                      <a
                        href={pdfPreview.pdfUrl}
                        download={`${pdfPreview.customerName}.pdf`}
                        className="px-4 py-3 sm:py-2 bg-accent-primary text-white rounded-lg hover:opacity-90 shadow-lg flex items-center justify-center gap-2"
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
          <div className="px-3 sm:px-6 py-2 sm:py-4 border-t border-gray-200 dark:border-dark-200">
            {/* Save Message */}
            {saveMessage && (
              <div className={`mb-2 px-3 py-2 rounded-lg text-sm ${
                saveMessage.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {saveMessage.text}
              </div>
            )}
            {/* Mobile: Icon-only compact buttons, Desktop: Full buttons with text */}
            <div className="flex gap-1.5 sm:gap-3 sm:flex-wrap justify-center sm:justify-start">
              <button
                onClick={onClose}
                title="Schließen"
                className="p-2.5 sm:px-4 sm:py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg font-medium transition-colors"
              >
                <X size={18} className="sm:hidden" />
                <span className="hidden sm:inline">Schließen</span>
              </button>
              <button
                onClick={openSavedReports}
                title="Gespeicherte Reports"
                className="p-2.5 sm:px-4 sm:py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                <Archive size={18} />
                <span className="hidden sm:inline">Gespeicherte Reports</span>
              </button>
              <button
                onClick={() => openPreview()}
                disabled={selectedCustomers.size === 0 || isGeneratingPreview}
                title="Vorschau"
                className="p-2.5 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isGeneratingPreview ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Eye size={18} />
                )}
                <span className="hidden sm:inline">Vorschau</span>
              </button>
              <button
                onClick={() => saveReports()}
                disabled={selectedCustomers.size === 0 || isSaving}
                title="Als Nachweis speichern"
                className="p-2.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                <span className="hidden sm:inline">Als Nachweis Speichern</span>
              </button>
              <button
                onClick={generateEmailTemplate}
                disabled={selectedCustomers.size === 0}
                title="E-Mail Vorlage"
                className="p-2.5 sm:px-4 sm:py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Mail size={18} />
                <span className="hidden sm:inline">E-Mail</span>
              </button>
              <button
                onClick={exportSelected}
                disabled={selectedCustomers.size === 0}
                title={`PDF exportieren (${selectedCustomers.size})`}
                className="p-2.5 sm:px-4 sm:py-2 btn-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Download size={18} />
                <span className="hidden sm:inline">PDF ({selectedCustomers.size})</span>
                <span className="sm:hidden text-xs font-bold">{selectedCustomers.size}</span>
              </button>
            </div>
          </div>
        )}

        {/* Saved Reports Modal */}
        {showSavedReports && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Archive size={24} className="text-accent-primary" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Reports & Genehmigungen
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status Filter */}
                  <select
                    value={savedReportsFilter}
                    onChange={(e) => {
                      const newFilter = e.target.value as typeof savedReportsFilter;
                      setSavedReportsFilter(newFilter);
                      loadSavedReports(newFilter);
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-200 text-gray-700 dark:text-gray-300"
                  >
                    <option value="all">Alle Status</option>
                    <option value="saved">Gespeichert</option>
                    <option value="pending">Wartet auf Genehmigung</option>
                    <option value="approved">Genehmigt</option>
                    <option value="rejected">Abgelehnt</option>
                  </select>
                  <button
                    onClick={() => setShowSavedReports(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-4 sm:p-6">
                {isLoadingSavedReports ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={32} className="animate-spin text-accent-primary" />
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Archive size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Keine Reports für diesen Filter vorhanden</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedReports.map((report) => {
                      const statusBadge = getStatusBadge(report.status);
                      const StatusIcon = statusBadge.icon;
                      return (
                        <div
                          key={report.id}
                          className="bg-gray-50 dark:bg-dark-200 rounded-lg p-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Header row with name and status */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                  {report.customer_name}
                                </h4>
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${statusBadge.color}`}>
                                  <StatusIcon size={12} />
                                  {statusBadge.label}
                                </span>
                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                                  {report.report_title}
                                </span>
                              </div>
                              {/* Details row */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
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
                              {/* Meta info */}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-500 mt-1">
                                <span>
                                  Erstellt: {new Date(report.created_at).toLocaleDateString('de-DE', {
                                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                                {report.status === 'pending' && report.recipient_email && (
                                  <span className="text-yellow-600 dark:text-yellow-400">
                                    Gesendet an: {report.recipient_email}
                                  </span>
                                )}
                                {report.reviewed_at && (
                                  <span className={report.status === 'approved' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                    {report.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}: {new Date(report.reviewed_at).toLocaleDateString('de-DE')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Send for approval (only for saved reports) */}
                              {report.status === 'saved' && (
                                <button
                                  onClick={() => openSendApprovalDialog(report)}
                                  className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                  title="Zur Genehmigung senden"
                                >
                                  <Send size={18} />
                                </button>
                              )}
                              {/* Copy approval link (for pending reports) */}
                              {report.status === 'pending' && report.token && (
                                <button
                                  onClick={() => copyApprovalLink(report)}
                                  className="p-2 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                                  title="Freigabe-Link kopieren"
                                >
                                  <Link size={18} />
                                </button>
                              )}
                              {/* Open approval page (for pending reports) */}
                              {report.status === 'pending' && report.token && (
                                <a
                                  href={`/approve/${report.token}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-gray-600 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg transition-colors"
                                  title="Freigabe-Seite öffnen"
                                >
                                  <ExternalLink size={18} />
                                </a>
                              )}
                              {/* Delete (only for saved or rejected) */}
                              {(report.status === 'saved' || report.status === 'rejected') && (
                                <button
                                  onClick={() => deleteSavedReport(report.id)}
                                  className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                  title="Report löschen"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200 flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {savedReports.length} Report(s)
                </span>
                <button
                  onClick={() => setShowSavedReports(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Configuration Modal */}
        {pdfConfigModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-[90vw] max-w-lg max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={24} className="text-accent-primary" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      PDF erstellen
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {pdfConfigModal.customerName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPdfConfigModal({ show: false, customerId: null, customerName: '' })}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Report Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Berichtstitel
                  </label>
                  <input
                    type="text"
                    value={pdfConfig.reportTitle}
                    onChange={(e) => setPdfConfig(prev => ({ ...prev, reportTitle: e.target.value }))}
                    placeholder="Dienstleistungsnachweis"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                  />
                </div>

                {/* Page Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Seiten erstellen
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfConfig.includeCoverPage}
                        onChange={(e) => setPdfConfig(prev => ({ ...prev, includeCoverPage: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
                      />
                      <div>
                        <span className="text-gray-900 dark:text-white font-medium">Deckblatt</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Mit Zusammenfassung und Unterschriftsfeld</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfConfig.includeTimeEntries}
                        onChange={(e) => setPdfConfig(prev => ({ ...prev, includeTimeEntries: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
                      />
                      <div>
                        <span className="text-gray-900 dark:text-white font-medium">Liste der Zeiteinträge</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Detaillierte Auflistung aller Einträge</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Column Selection - only show if time entries are included */}
                {pdfConfig.includeTimeEntries && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Spalten anzeigen
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'date', label: 'Datum' },
                        { key: 'weekday', label: 'Wochentag' },
                        { key: 'times', label: 'Uhrzeiten' },
                        { key: 'project', label: 'Projekt' },
                        { key: 'activity', label: 'Tätigkeit' },
                        { key: 'description', label: 'Beschreibung' },
                        { key: 'hours', label: 'Zeit' },
                      ].map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-dark-200 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-300 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={pdfConfig.columns[key as keyof typeof pdfConfig.columns]}
                            onChange={(e) => setPdfConfig(prev => ({
                              ...prev,
                              columns: { ...prev.columns, [key]: e.target.checked }
                            }))}
                            className="w-4 h-4 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200 flex justify-end gap-3">
                <button
                  onClick={() => setPdfConfigModal({ show: false, customerId: null, customerName: '' })}
                  className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={exportWithConfig}
                  disabled={!pdfConfig.includeCoverPage && !pdfConfig.includeTimeEntries}
                  className="px-4 py-2 btn-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Download size={18} />
                  PDF erstellen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Send for Approval Dialog */}
        {sendApprovalDialog.show && sendApprovalDialog.report && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-[90vw] max-w-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <Send size={24} className="text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Zur Genehmigung senden
                </h3>
              </div>

              <div className="mb-4 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>{sendApprovalDialog.report.customer_name}</strong>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {new Date(sendApprovalDialog.report.start_date).toLocaleDateString('de-DE')} - {new Date(sendApprovalDialog.report.end_date).toLocaleDateString('de-DE')} | {sendApprovalDialog.report.total_hours.toFixed(2)}h
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    E-Mail Adresse des Empfängers *
                  </label>
                  <input
                    type="email"
                    value={sendApprovalDialog.email}
                    onChange={(e) => setSendApprovalDialog(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="kunde@beispiel.de"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name des Empfängers (optional)
                  </label>
                  <input
                    type="text"
                    value={sendApprovalDialog.name}
                    onChange={(e) => setSendApprovalDialog(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Max Mustermann"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Test Mode Toggle */}
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-sm text-amber-800 dark:text-amber-300">Test-Modus</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSendApprovalDialog(prev => ({ ...prev, testMode: !prev.testMode }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      sendApprovalDialog.testMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        sendApprovalDialog.testMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {sendApprovalDialog.testMode && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 -mt-2">
                    Im Test-Modus wird keine E-Mail versendet. Der Freigabe-Link wird nur erstellt und kann kopiert werden.
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setSendApprovalDialog({ show: false, report: null, email: '', name: '', isSending: false, testMode: true })}
                  disabled={sendApprovalDialog.isSending}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-dark-300 transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={sendForApproval}
                  disabled={!sendApprovalDialog.email || sendApprovalDialog.isSending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sendApprovalDialog.isSending ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      {sendApprovalDialog.testMode ? 'Link erstellen' : 'Senden'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
