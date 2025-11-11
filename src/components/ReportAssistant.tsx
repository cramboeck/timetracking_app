import { useState, useMemo } from 'react';
import { X, FileText, Download, Mail, CheckCircle2 } from 'lucide-react';
import { TimeEntry, Project, Customer } from '../types';
import jsPDF from 'jspdf';
import { storage } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';

interface ReportAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
}

interface CustomerReportData {
  customer: Customer;
  totalHours: number;
  totalAmount: number;
  projectCount: number;
  entryCount: number;
}

export const ReportAssistant = ({
  isOpen,
  onClose,
  entries,
  projects,
  customers
}: ReportAssistantProps) => {
  const { currentUser } = useAuth();
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [emailTemplate, setEmailTemplate] = useState('');
  const [showEmailTemplate, setShowEmailTemplate] = useState(false);

  // Calculate current month data for all customers
  const currentMonthData = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const customerMap = new Map<string, CustomerReportData>();

    entries.forEach(entry => {
      if (entry.isRunning) return;

      const entryDate = new Date(entry.startTime);
      const entryMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;

      if (entryMonth !== currentMonth) return;

      const project = projects.find(p => p.id === entry.projectId);
      const customer = project ? customers.find(c => c.id === project.customerId) : null;

      if (!project || !customer) return;

      const hours = entry.duration / 3600;
      const amount = hours * project.hourlyRate;

      const existing = customerMap.get(customer.id);
      if (existing) {
        existing.totalHours += hours;
        existing.totalAmount += amount;
        existing.entryCount += 1;
        existing.projectCount = new Set([
          ...Array.from({ length: existing.projectCount }),
          project.id
        ]).size;
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
  }, [entries, projects, customers]);

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
    setSelectedCustomers(new Set(currentMonthData.map(d => d.customer.id)));
  };

  const deselectAll = () => {
    setSelectedCustomers(new Set());
  };

  const generatePDFForCustomer = (customerData: CustomerReportData) => {
    const doc = new jsPDF();
    const companyInfo = currentUser ? storage.getCompanyInfoByUserId(currentUser.id) : null;
    const now = new Date();
    const monthName = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let y = 20;

    // Company Header with proper logo scaling
    if (companyInfo) {
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
          console.error('Error adding logo:', error);
        }
      }

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
      doc.text(companyInfo.email, 190, y, { align: 'right' });
      if (companyInfo.phone) {
        y += 4;
        doc.text(`Tel: ${companyInfo.phone}`, 190, y, { align: 'right' });
      }
    }

    y = Math.max(y, 45);

    // Report Title
    const reportTitle = customerData.customer.reportTitle
      ? customerData.customer.reportTitle
          .replace(/\{\{kunde\}\}/gi, customerData.customer.name)
          .replace(/\{\{monat\}\}/gi, monthName)
          .replace(/\{\{zeitraum\}\}/gi, monthName)
      : 'Stundenbericht';

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle, 105, y, { align: 'center' });

    y += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(monthName, 105, y, { align: 'center' });

    y += 15;

    // Customer Info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Kunde:', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(customerData.customer.name, 40, y);
    y += 6;

    if (customerData.customer.contactPerson) {
      doc.text(`Ansprechpartner: ${customerData.customer.contactPerson}`, 40, y);
      y += 6;
    }
    if (customerData.customer.email) {
      doc.text(`E-Mail: ${customerData.customer.email}`, 40, y);
      y += 6;
    }

    y += 5;

    // Summary Box
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, 170, 20, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gesamtstunden: ${customerData.totalHours.toFixed(2)} h`, 25, y + 8);
    doc.text(`Gesamtbetrag: ${customerData.totalAmount.toFixed(2)} EUR`, 25, y + 15);

    y += 30;

    // Get all entries for this customer in current month
    const customerEntries = entries.filter(entry => {
      if (entry.isRunning) return false;
      const entryDate = new Date(entry.startTime);
      const entryMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
      if (entryMonth !== currentMonth) return false;

      const project = projects.find(p => p.id === entry.projectId);
      return project?.customerId === customerData.customer.id;
    });

    // Group by project
    const projectMap = new Map<string, {
      project: Project;
      entries: TimeEntry[];
      totalHours: number;
      totalAmount: number;
    }>();

    customerEntries.forEach(entry => {
      const project = projects.find(p => p.id === entry.projectId);
      if (!project) return;

      const hours = entry.duration / 3600;
      const amount = hours * project.hourlyRate;

      const existing = projectMap.get(project.id);
      if (existing) {
        existing.entries.push(entry);
        existing.totalHours += hours;
        existing.totalAmount += amount;
      } else {
        projectMap.set(project.id, {
          project,
          entries: [entry],
          totalHours: hours,
          totalAmount: amount
        });
      }
    });

    // Render each project with its entries
    Array.from(projectMap.values()).forEach((projectData) => {
      // Check if we need a new page
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      // Project Header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`Projekt: ${projectData.project.name}`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${projectData.totalHours.toFixed(2)} h × ${projectData.project.hourlyRate.toFixed(2)} €/h = ${projectData.totalAmount.toFixed(2)} €`, 20, y + 5);

      y += 12;

      // Table Header
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Datum', 22, y);
      doc.text('Beschreibung', 50, y);
      doc.text('Stunden', 155, y);
      doc.text('Betrag', 175, y);
      doc.setLineWidth(0.3);
      doc.line(20, y + 1, 190, y + 1);

      y += 5;
      doc.setFont('helvetica', 'normal');

      // Sort entries by date
      const sortedEntries = projectData.entries.sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      // Render each entry
      sortedEntries.forEach(entry => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        const date = new Date(entry.startTime).toLocaleDateString('de-DE');
        const hours = entry.duration / 3600;
        const amount = hours * projectData.project.hourlyRate;
        const description = entry.description || '(keine Beschreibung)';

        // Truncate description if too long
        const maxDescLength = 60;
        const truncatedDesc = description.length > maxDescLength
          ? description.substring(0, maxDescLength) + '...'
          : description;

        doc.text(date, 22, y);
        doc.text(truncatedDesc, 50, y);
        doc.text(hours.toFixed(2), 155, y);
        doc.text(amount.toFixed(2) + ' €', 175, y);

        y += 5;
      });

      // Project subtotal
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.line(20, y - 1, 190, y - 1);
      doc.text('Zwischensumme:', 120, y + 3);
      doc.text(projectData.totalHours.toFixed(2) + ' h', 155, y + 3);
      doc.text(projectData.totalAmount.toFixed(2) + ' €', 175, y + 3);
      doc.setFont('helvetica', 'normal');

      y += 10;
    });

    // Grand Total
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    y += 5;
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Gesamtsumme:', 120, y);
    doc.text(customerData.totalHours.toFixed(2) + ' h', 155, y);
    doc.text(customerData.totalAmount.toFixed(2) + ' €', 175, y);

    // Signature section
    y += 20;
    if (y > 220) {
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

    // Footer
    if (companyInfo?.taxId) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`Steuernummer: ${companyInfo.taxId}`, 105, 285, { align: 'center' });
    }

    return doc;
  };

  const exportSelected = () => {
    selectedCustomers.forEach(customerId => {
      const customerData = currentMonthData.find(d => d.customer.id === customerId);
      if (customerData) {
        const doc = generatePDFForCustomer(customerData);
        const now = new Date();
        const monthYear = now.toLocaleString('de-DE', { month: '2-digit', year: 'numeric' }).replace('/', '-');
        doc.save(`Stundenbericht_${customerData.customer.name.replace(/\s+/g, '_')}_${monthYear}.pdf`);
      }
    });
  };

  const generateEmailTemplate = () => {
    const now = new Date();
    const monthName = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const companyInfo = currentUser ? storage.getCompanyInfoByUserId(currentUser.id) : null;

    const selectedData = currentMonthData.filter(d => selectedCustomers.has(d.customer.id));

    if (selectedData.length === 0) return;

    const template = `Betreff: Stundenbericht ${monthName}

Guten Tag,

anbei erhalten Sie den Stundenbericht für ${monthName}.

${selectedData.map(data => `
**${data.customer.name}**
- Gesamtstunden: ${data.totalHours.toFixed(2)} h
- Gesamtbetrag: ${data.totalAmount.toFixed(2)} EUR
`).join('\n')}

Bei Fragen stehe ich Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
${companyInfo?.name || 'Ihr Name'}
${companyInfo?.email || 'ihre.email@example.com'}
${companyInfo?.phone || ''}`;

    setEmailTemplate(template);
    setShowEmailTemplate(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailTemplate);
    alert('E-Mail Vorlage in Zwischenablage kopiert!');
  };

  if (!isOpen) return null;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemaining = daysInMonth - currentDay;

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
                {daysRemaining <= 3
                  ? `⚠️ Noch ${daysRemaining} Tag(e) bis Monatsende`
                  : `Aktuelle Reports für ${now.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentMonthData.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>Keine Zeiterfassungen für diesen Monat</p>
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600 dark:text-dark-400">
                  {selectedCustomers.size} von {currentMonthData.length} Kunde(n) ausgewählt
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm px-3 py-1 text-accent-primary hover:bg-accent-light dark:hover:bg-accent-lighter/10 rounded-lg transition-colors"
                  >
                    Alle auswählen
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-sm px-3 py-1 text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
                  >
                    Abwählen
                  </button>
                </div>
              </div>

              {/* Customer List */}
              <div className="space-y-3 mb-6">
                {currentMonthData.map(data => (
                  <div
                    key={data.customer.id}
                    onClick={() => toggleCustomer(data.customer.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedCustomers.has(data.customer.id)
                        ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                        : 'border-gray-200 dark:border-dark-200 hover:border-gray-300'
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
                          <div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-dark-400">
                            <span>{data.totalHours.toFixed(2)} h</span>
                            <span>{data.totalAmount.toFixed(2)} EUR</span>
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
                  <pre className="text-sm text-gray-700 dark:text-dark-300 whitespace-pre-wrap font-mono bg-white dark:bg-dark-100 p-3 rounded border border-gray-200 dark:border-dark-200">
                    {emailTemplate}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {currentMonthData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-200 flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-300 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg font-medium transition-colors"
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
