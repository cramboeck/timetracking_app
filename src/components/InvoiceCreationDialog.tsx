import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  FileText,
  Clock,
  Euro,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button, IconButton } from './ui';
import { sevdeskApi, BillingSummaryItem } from '../services/api';

interface InvoicePosition {
  projectName: string;
  hours: number;
  roundedHours: number;
  amount: number;
  entries: Array<{
    id: string;
    description: string;
    duration: number;
    ticketNumber?: string;
    ticketTitle?: string;
  }>;
  // AI-generated or manual text
  title: string;
  description: string;
}

interface InvoiceCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer: BillingSummaryItem;
  periodStart: Date;
  periodEnd: Date;
  onSuccess: (invoiceNumber: string) => void;
}

export const InvoiceCreationDialog = ({
  isOpen,
  onClose,
  customer,
  periodStart,
  periodEnd,
  onSuccess,
}: InvoiceCreationDialogProps) => {
  const [positions, setPositions] = useState<InvoicePosition[]>([]);
  const [expandedPositions, setExpandedPositions] = useState<Set<number>>(new Set());
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Header texts
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [headText, setHeadText] = useState('');
  const [footText, setFootText] = useState('');

  // Generate service report filename in format: Dienstleistungsnachweis_Kundenname_YYYY_MM.pdf
  const generateReportFilename = () => {
    const customerSlug = customer.customerName
      .replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '')
      .replace(/\s+/g, '_');

    const year = periodStart.getFullYear();
    const month = String(periodStart.getMonth() + 1).padStart(2, '0');

    return `Dienstleistungsnachweis_${customerSlug}_${year}_${month}.pdf`;
  };

  // Calculate payment due date based on customer's payment terms
  const calculateDueDate = () => {
    const paymentTermsDays = customer.paymentTermsDays || 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    return dueDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Group entries by project
  useEffect(() => {
    if (!isOpen || !customer) return;

    const projectMap = new Map<string, InvoicePosition>();
    const roundingInterval = customer.timeRoundingInterval || 15;
    const reportFilename = generateReportFilename();

    customer.entries.forEach(entry => {
      const projectName = entry.projectName || 'Sonstige Arbeiten';
      const existing = projectMap.get(projectName);

      if (existing) {
        existing.hours += entry.duration / 3600;
        existing.entries.push({
          id: entry.id,
          description: entry.description,
          duration: entry.duration,
          ticketNumber: entry.ticketNumber,
          ticketTitle: entry.ticketTitle,
        });
      } else {
        projectMap.set(projectName, {
          projectName,
          hours: entry.duration / 3600,
          roundedHours: 0,
          amount: 0,
          entries: [{
            id: entry.id,
            description: entry.description,
            duration: entry.duration,
            ticketNumber: entry.ticketNumber,
            ticketTitle: entry.ticketTitle,
          }],
          title: `IT-Consulting - ${projectName}`,
          description: `Tätigkeit: IT Consulting\n\nsiehe ${reportFilename}`,
        });
      }
    });

    // Calculate rounded hours and amounts
    const hourlyRate = customer.hourlyRate || 95;
    const positionsArray = Array.from(projectMap.values()).map(pos => {
      // Round each entry individually then sum
      const roundedSeconds = pos.entries.reduce((sum, e) => {
        const intervalSeconds = roundingInterval * 60;
        return sum + Math.ceil(e.duration / intervalSeconds) * intervalSeconds;
      }, 0);
      pos.roundedHours = Math.round((roundedSeconds / 3600) * 100) / 100;
      pos.amount = Math.round(pos.roundedHours * hourlyRate * 100) / 100;
      return pos;
    });

    // Sort by hours descending
    positionsArray.sort((a, b) => b.hours - a.hours);

    setPositions(positionsArray);

    // Set default header
    const monthYear = periodStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    setInvoiceHeader(`IT-Dienstleistungen ${monthYear}`);
    setHeadText(`Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!\nHiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:`);

    // Default footer with payment terms and due date
    const paymentTermsDays = customer.paymentTermsDays || 14;
    const dueDate = calculateDueDate();
    setFootText(`Zahlungsbedingungen: Zahlung innerhalb von ${paymentTermsDays} Tagen ab Rechnungseingang ohne Abzüge.\nBitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.\nDer Rechnungsbetrag ist zum ${dueDate} fällig.`);
  }, [isOpen, customer, periodStart, periodEnd]);

  const totalHours = useMemo(() =>
    positions.reduce((sum, p) => sum + p.hours, 0), [positions]
  );

  const totalRoundedHours = useMemo(() =>
    positions.reduce((sum, p) => sum + p.roundedHours, 0), [positions]
  );

  const totalAmount = useMemo(() =>
    positions.reduce((sum, p) => sum + p.amount, 0), [positions]
  );

  const togglePosition = (index: number) => {
    const newExpanded = new Set(expandedPositions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPositions(newExpanded);
  };

  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    setError(null);

    try {
      const response = await sevdeskApi.generateInvoiceTexts({
        customerId: customer.customerId,
        sevdeskContactId: customer.sevdeskCustomerId || undefined,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        entries: customer.entries.map(e => ({
          description: e.description,
          hours: e.duration / 3600,
          projectName: e.projectName,
        })),
      });

      if (response.success && response.data) {
        setInvoiceHeader(response.data.header);
        setHeadText(response.data.headText);
        setFootText(response.data.footText);

        // Apply AI-generated position texts if available
        if (response.data.positionTexts && response.data.positionTexts.length > 0) {
          setPositions(prev => prev.map((pos, idx) => ({
            ...pos,
            title: response.data.positionTexts[idx] || pos.title,
          })));
        }

        setAiGenerated(true);
      }
    } catch (err: any) {
      setError(err.message || 'KI-Generierung fehlgeschlagen');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCreateInvoice = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const entryIds = customer.entries.map(e => e.id);
      const hourlyRate = customer.hourlyRate || 95;

      // Build positions array with header position first (quantity 0 = bold header in sevDesk)
      const invoicePositions = [
        // Header position (quantity 0 displays as bold header)
        {
          title: 'Dienstleistungen',
          description: '',
          hours: 0,
          amount: 0,
          hourlyRate: 0,
          isHeader: true, // Mark as header for special handling
        },
        // Regular positions
        ...positions.map(pos => ({
          title: pos.title,
          description: pos.description,
          hours: pos.roundedHours,
          amount: pos.amount,
          hourlyRate: hourlyRate,
        })),
      ];

      // Create invoice with grouped positions and custom texts
      const response = await sevdeskApi.createInvoice({
        customerId: customer.customerId,
        entryIds,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        header: invoiceHeader,
        headText: headText,
        footText: footText,
        positions: invoicePositions,
      });

      if (response.success) {
        onSuccess(response.data.invoiceNumber);
        onClose();
      } else {
        throw new Error('Rechnungserstellung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Rechnung');
    } finally {
      setIsCreating(false);
    }
  };

  const updatePositionTitle = (index: number, title: string) => {
    setPositions(prev => prev.map((p, i) =>
      i === index ? { ...p, title } : p
    ));
  };

  const updatePositionDescription = (index: number, description: string) => {
    setPositions(prev => prev.map((p, i) =>
      i === index ? { ...p, description } : p
    ));
  };

  if (!isOpen) return null;

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')} h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Rechnung erstellen
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {customer.customerName} • {periodStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            size="lg"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {/* AI Button */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-accent-light dark:from-purple-900/20 dark:to-accent-primary/20 rounded-xl border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                <Sparkles size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">KI-Textgenerierung</p>
                <p className="text-sm text-gray-500">
                  Analysiert bisherige Rechnungen und generiert professionelle Texte
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerateAI}
              disabled={isGeneratingAI}
              loading={isGeneratingAI}
              variant="primary"
              icon={aiGenerated ? <Check size={16} /> : <Sparkles size={16} />}
            >
              {isGeneratingAI ? 'Generiere...' : aiGenerated ? 'Neu generieren' : 'Texte generieren'}
            </Button>
          </div>

          {/* Invoice Header */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText size={18} />
              Rechnungstexte
            </h3>

            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Betreff / Header
                </label>
                <input
                  type="text"
                  value={invoiceHeader}
                  onChange={(e) => setInvoiceHeader(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Einleitungstext
                </label>
                <textarea
                  value={headText}
                  onChange={(e) => setHeadText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Schlusstext
                </label>
                <input
                  type="text"
                  value={footText}
                  onChange={(e) => setFootText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Positions */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock size={18} />
              Positionen ({positions.length} Projekte)
            </h3>

            <div className="space-y-3">
              {positions.map((position, index) => (
                <div
                  key={index}
                  className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden"
                >
                  {/* Position Header */}
                  <div
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-200/50 cursor-pointer"
                    onClick={() => togglePosition(index)}
                  >
                    <div className="flex-1">
                      <input
                        type="text"
                        value={position.title}
                        onChange={(e) => {
                          e.stopPropagation();
                          updatePositionTitle(index, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full font-medium text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 focus:border-orange-500 focus:outline-none"
                        placeholder="Positionsbezeichnung"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        {position.entries.length} Einträge • {formatHours(position.roundedHours)} • {formatCurrency(position.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold text-gray-900 dark:text-white">
                          {formatCurrency(position.amount)}
                        </p>
                      </div>
                      {expandedPositions.has(index) ? (
                        <ChevronUp size={20} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={20} className="text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Position Details */}
                  {expandedPositions.has(index) && (
                    <div className="p-4 space-y-3 bg-white dark:bg-dark-100">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                          Beschreibung
                        </label>
                        <textarea
                          value={position.description}
                          onChange={(e) => updatePositionDescription(index, e.target.value)}
                          rows={2}
                          placeholder="Tätigkeit: IT Consulting im Bereich..."
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500"
                        />
                      </div>

                      <div className="text-sm text-gray-500">
                        <p className="font-medium mb-2">Enthaltene Einträge:</p>
                        <ul className="space-y-1 max-h-32 overflow-y-auto">
                          {position.entries.map((entry, entryIdx) => (
                            <li key={entryIdx} className="flex justify-between">
                              <span className="truncate flex-1">
                                {entry.ticketNumber && <span className="text-orange-600">{entry.ticketNumber}: </span>}
                                {entry.description || 'Keine Beschreibung'}
                              </span>
                              <span className="ml-2 whitespace-nowrap">
                                {formatHours(entry.duration / 3600)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-100/50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">
                Gesamtstunden: {formatHours(totalHours)} → aufgerundet: {formatHours(totalRoundedHours)}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Euro size={20} />
                {formatCurrency(totalAmount)} netto
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={onClose}
                variant="secondary"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreateInvoice}
                disabled={isCreating || positions.length === 0}
                loading={isCreating}
                variant="warning"
                icon={<FileText size={18} />}
              >
                {isCreating ? 'Erstelle...' : 'Rechnung erstellen'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
