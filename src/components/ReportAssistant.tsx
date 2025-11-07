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

    let y = 20;

    // Company Header
    if (companyInfo) {
      if (companyInfo.logo) {
        try {
          doc.addImage(companyInfo.logo, 'PNG', 20, y, 30, 20);
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

    // Summary
    y += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, 170, 20, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Gesamtstunden: ${customerData.totalHours.toFixed(2)} h`, 25, y + 8);
    doc.text(`Gesamtbetrag: ${customerData.totalAmount.toFixed(2)} EUR`, 25, y + 15);

    // Footer
    if (companyInfo?.taxId) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`Steuernummer: ${companyInfo.taxId}`, 105, 280, { align: 'center' });
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
