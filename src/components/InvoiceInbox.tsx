import { useState, useEffect, Fragment } from 'react';
import {
  FileText, RefreshCw, Loader2, Eye, Download, Check, Trash2,
  ChevronDown, ChevronUp, File, Undo2, CheckCircle, XCircle,
  Mail, AlertTriangle, X, Edit2
} from 'lucide-react';
import { microsoft365Api, ProcessedInvoice, InvoiceDocument, ExtractedInvoiceData } from '../services/api';
import { Button, IconButton } from './ui/Button';

// Format file size helper
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const InvoiceInbox = () => {
  const [loading, setLoading] = useState(true);
  const [processingInvoices, setProcessingInvoices] = useState(false);
  const [processedInvoices, setProcessedInvoices] = useState<ProcessedInvoice[]>([]);
  const [invoiceProcessResult, setInvoiceProcessResult] = useState<{
    processedCount: number;
    skippedCount: number;
    failedCount: number
  } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Document viewing state
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [invoiceDocuments, setInvoiceDocuments] = useState<Record<string, InvoiceDocument[]>>({});
  const [loadingDocuments, setLoadingDocuments] = useState<string | null>(null);

  // Config state
  const [invoiceMailbox, setInvoiceMailbox] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingInvoice, setConfirmingInvoice] = useState<ProcessedInvoice | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [extractingData, setExtractingData] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load config to check if invoice mailbox is configured
      const configResponse = await microsoft365Api.getConfig();
      if (configResponse.success && configResponse.data) {
        const mailbox = configResponse.data.invoiceMailbox || '';
        setInvoiceMailbox(mailbox);
        setIsConfigured(!!configResponse.data.configured && !!mailbox);

        if (mailbox) {
          await loadProcessedInvoices();
        }
      }
    } catch (err) {
      console.error('Failed to load config:', err);
      setError('Fehler beim Laden der Konfiguration');
    } finally {
      setLoading(false);
    }
  };

  const loadProcessedInvoices = async () => {
    try {
      const response = await microsoft365Api.getProcessedInvoices({ limit: 50 });
      if (response.success) {
        setProcessedInvoices(response.data);
      }
    } catch (err) {
      console.error('Failed to load processed invoices:', err);
    }
  };

  const handleProcessInvoices = async (includeRead: boolean = false) => {
    setProcessingInvoices(true);
    setInvoiceProcessResult(null);
    setError('');
    setSuccess('');

    try {
      const response = await microsoft365Api.processInvoices({ includeRead });
      if (response.success && response.data) {
        setInvoiceProcessResult({
          processedCount: response.data.processedCount,
          skippedCount: response.data.skippedCount,
          failedCount: response.data.failedCount,
        });
        if (response.data.processedCount > 0) {
          setSuccess(`${response.data.processedCount} Entwürfe erstellt`);
        } else if (includeRead) {
          setSuccess('Keine neuen E-Mails zum Verarbeiten gefunden');
        } else {
          setSuccess('Keine ungelesenen E-Mails gefunden');
        }
        await loadProcessedInvoices();
      }
    } catch (err: any) {
      setError(err.message || 'Fehler bei der Verarbeitung');
    } finally {
      setProcessingInvoices(false);
    }
  };

  const handleToggleDocuments = async (invoiceId: string) => {
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null);
      return;
    }

    setExpandedInvoiceId(invoiceId);

    if (!invoiceDocuments[invoiceId]) {
      setLoadingDocuments(invoiceId);
      try {
        const response = await microsoft365Api.getInvoiceDocuments(invoiceId);
        if (response.success) {
          setInvoiceDocuments(prev => ({
            ...prev,
            [invoiceId]: response.data
          }));
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoadingDocuments(null);
      }
    }
  };

  const handleDownloadDocument = async (documentId: string, inline?: boolean) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('Nicht authentifiziert');
      return;
    }

    const baseUrl = import.meta.env.VITE_API_URL || '';
    const params = new URLSearchParams();
    params.set('token', token);
    if (inline) {
      params.set('inline', 'true');
    }

    const url = `${baseUrl}/microsoft365/documents/${documentId}/download?${params.toString()}`;
    window.open(url, inline ? '_blank' : '_self');
  };

  const handleApproveDraft = async (invoiceId: string) => {
    // Find the invoice
    const invoice = processedInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    setConfirmingInvoice(invoice);
    setExtractedData(null);
    setShowConfirmModal(true);
    setExtractingData(true);
    setError('');

    try {
      // Extract invoice data from PDF
      const response = await microsoft365Api.extractInvoiceData(invoiceId);
      if (response.success && response.data) {
        setExtractedData(response.data);
      } else {
        // Set empty data if extraction fails
        setExtractedData({
          supplierName: invoice.senderName || null,
          invoiceNumber: null,
          invoiceDate: null,
          dueDate: null,
          netAmount: null,
          grossAmount: null,
          vatAmount: null,
          vatRate: 19,
          currency: 'EUR',
          confidence: 0,
        });
      }
    } catch (err: any) {
      console.error('Data extraction failed:', err);
      // Set default data on error
      setExtractedData({
        supplierName: invoice.senderName || null,
        invoiceNumber: null,
        invoiceDate: null,
        dueDate: null,
        netAmount: null,
        grossAmount: null,
        vatAmount: null,
        vatRate: 19,
        currency: 'EUR',
        confidence: 0,
      });
    } finally {
      setExtractingData(false);
    }
  };

  const handleConfirmApproval = async () => {
    if (!confirmingInvoice || !extractedData) return;

    setApproving(true);
    setError('');

    try {
      const response = await microsoft365Api.approveInvoiceDraft(confirmingInvoice.id, extractedData);
      if (response.success) {
        setShowConfirmModal(false);
        setConfirmingInvoice(null);
        setExtractedData(null);
        await loadProcessedInvoices();
        setSuccess('Rechnung bestätigt und sevDesk-Beleg erstellt');
      } else {
        setError(response.error || 'Fehler beim Bestätigen');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Bestätigen');
    } finally {
      setApproving(false);
    }
  };

  const handleCancelApproval = () => {
    setShowConfirmModal(false);
    setConfirmingInvoice(null);
    setExtractedData(null);
  };

  const updateExtractedField = (field: keyof ExtractedInvoiceData, value: any) => {
    if (!extractedData) return;
    setExtractedData({ ...extractedData, [field]: value });
  };

  const formatAmount = (amount: number | null): string => {
    if (amount === null) return '';
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const parseAmount = (value: string): number | null => {
    if (!value.trim()) return null;
    // Parse German format: 1.234,56 -> 1234.56
    const cleaned = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Validate extracted invoice data for consistency
  const validateExtractedData = (data: ExtractedInvoiceData): string[] => {
    const warnings: string[] = [];
    const { netAmount, grossAmount, vatAmount, vatRate } = data;
    const rate = vatRate ?? 19;

    if (grossAmount === null && netAmount === null) {
      warnings.push('Weder Brutto- noch Nettobetrag erkannt');
      return warnings;
    }

    // Check if all three amounts are present and consistent
    if (netAmount !== null && grossAmount !== null) {
      if (vatAmount !== null) {
        // We have all three - check if net + vat = gross
        const calculatedGross = netAmount + vatAmount;
        const diff = Math.abs(grossAmount - calculatedGross);
        if (diff > 0.02) {
          warnings.push(
            `Beträge inkonsistent: ${formatAmount(netAmount)}€ + ${formatAmount(vatAmount)}€ = ${formatAmount(calculatedGross)}€ ≠ ${formatAmount(grossAmount)}€ Brutto`
          );
        }
        // Check if VAT rate matches
        const actualRate = (vatAmount / netAmount) * 100;
        if (Math.abs(actualRate - rate) > 0.5) {
          warnings.push(
            `MwSt-Satz inkonsistent: ${rate}% angegeben, aber ${actualRate.toFixed(1)}% berechnet`
          );
        }
      } else {
        // Check if gross = net * (1 + rate)
        const expectedGross = netAmount * (1 + rate / 100);
        const diff = Math.abs(grossAmount - expectedGross);
        if (diff > 0.02) {
          const impliedRate = ((grossAmount / netAmount) - 1) * 100;
          warnings.push(
            `MwSt-Satz prüfen: ${rate}% ergibt ${formatAmount(expectedGross)}€ Brutto, aber ${formatAmount(grossAmount)}€ erkannt (${impliedRate.toFixed(1)}%)`
          );
        }
      }
    }

    // Warn about unusual VAT rates
    if (vatRate !== null && ![0, 7, 19].includes(vatRate)) {
      warnings.push(`Ungewöhnlicher MwSt-Satz: ${vatRate}% (Standard: 0%, 7%, 19%)`);
    }

    return warnings;
  };

  // Get current validation warnings
  const validationWarnings = extractedData ? validateExtractedData(extractedData) : [];

  const handleDeleteDraft = async (invoiceId: string) => {
    if (!confirm('Entwurf wirklich löschen?')) return;

    try {
      const response = await microsoft365Api.deleteDraft(invoiceId);
      if (response.success) {
        await loadProcessedInvoices();
        setSuccess('Entwurf gelöscht');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Löschen');
    }
  };

  const handleRevertToDraft = async (invoiceId: string) => {
    try {
      const response = await microsoft365Api.revertToDraft(invoiceId);
      if (response.success) {
        await loadProcessedInvoices();
        setSuccess('Zurück zu Entwurf');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Zurücksetzen');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={48} />
          <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Rechnungspostfach nicht konfiguriert
          </h3>
          <p className="text-amber-700 dark:text-amber-300 mb-4">
            Bitte konfigurieren Sie zuerst das Rechnungspostfach in den Microsoft 365 Einstellungen.
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Einstellungen → Microsoft 365 → Rechnungspostfach
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="text-accent-primary" />
            Rechnungseingang
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Postfach: <span className="font-medium text-gray-700 dark:text-gray-300">{invoiceMailbox}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => handleProcessInvoices(false)}
            disabled={processingInvoices}
            loading={processingInvoices}
            icon={<RefreshCw size={16} />}
          >
            Neue E-Mails
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleProcessInvoices(true)}
            disabled={processingInvoices}
            loading={processingInvoices}
            icon={<RefreshCw size={16} />}
          >
            Alle erneut
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
          <XCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 flex items-center gap-2">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {/* Processing Result */}
      {invoiceProcessResult && (
        <div className="p-3 bg-accent-light dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex gap-4 text-sm">
            <span className="text-green-600 dark:text-green-400">
              ✓ {invoiceProcessResult.processedCount} verarbeitet
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              ○ {invoiceProcessResult.skippedCount} übersprungen
            </span>
            {invoiceProcessResult.failedCount > 0 && (
              <span className="text-red-600 dark:text-red-400">
                ✗ {invoiceProcessResult.failedCount} fehlgeschlagen
              </span>
            )}
          </div>
        </div>
      )}

      {/* Invoices List */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
        {processedInvoices.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-dark-300 max-h-[60vh] overflow-y-auto scroll-touch touch-manipulation">
              {processedInvoices.map((invoice) => (
                <div key={invoice.id} className="p-4 space-y-3">
                  {/* Header mit Datum und Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(invoice.receivedAt).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      invoice.status === 'processed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : invoice.status === 'draft'
                        ? 'bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400'
                        : invoice.status === 'failed'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : invoice.status === 'skipped'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {invoice.status === 'processed' && <CheckCircle size={12} />}
                      {invoice.status === 'draft' && <FileText size={12} />}
                      {invoice.status === 'failed' && <XCircle size={12} />}
                      {invoice.status === 'processed' ? 'Bestätigt' :
                       invoice.status === 'draft' ? 'Entwurf' :
                       invoice.status === 'failed' ? 'Fehler' :
                       invoice.status === 'skipped' ? 'Übersprungen' : 'Ausstehend'}
                    </span>
                  </div>

                  {/* Absender */}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {invoice.senderName || invoice.senderEmail}
                    </div>
                    {invoice.vendorName && (
                      <div className="text-xs text-accent-primary">→ {invoice.vendorName}</div>
                    )}
                  </div>

                  {/* Betreff */}
                  <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {invoice.emailSubject}
                  </div>

                  {invoice.errorMessage && (
                    <div className="text-xs text-red-500 dark:text-red-400">
                      {invoice.errorMessage}
                    </div>
                  )}

                  {/* Anhänge */}
                  {invoice.attachmentCount > 0 && (
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleDocuments(invoice.id)}
                        className="text-accent-primary dark:text-blue-400"
                        icon={loadingDocuments === invoice.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      >
                        {invoice.attachmentCount} Anhang{invoice.attachmentCount !== 1 ? 'e' : ''}
                        {expandedInvoiceId === invoice.id ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </Button>

                      {/* Expanded Documents */}
                      {expandedInvoiceId === invoice.id && (
                        <div className="mt-2 pl-3 border-l-2 border-blue-300 dark:border-accent-primary space-y-2">
                          {loadingDocuments === invoice.id ? (
                            <div className="flex items-center gap-2 text-gray-500 text-sm">
                              <Loader2 size={14} className="animate-spin" />
                              Lade...
                            </div>
                          ) : invoiceDocuments[invoice.id]?.length > 0 ? (
                            invoiceDocuments[invoice.id].map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-dark-200 rounded-lg"
                              >
                                <File size={16} className="text-red-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {doc.originalFilename}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {formatFileSize(doc.size)}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <IconButton
                                    icon={<Eye size={16} />}
                                    onClick={() => handleDownloadDocument(doc.id, true)}
                                    variant="primary"
                                    tooltip="Ansehen"
                                  />
                                  <IconButton
                                    icon={<Download size={16} />}
                                    onClick={() => handleDownloadDocument(doc.id)}
                                    variant="success"
                                    tooltip="Download"
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-gray-500">Keine Dokumente</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Aktionen */}
                  {(invoice.status === 'draft' || invoice.status === 'processed') && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-dark-300">
                      {invoice.status === 'draft' && (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => handleApproveDraft(invoice.id)}
                            icon={<Check size={16} />}
                            fullWidth
                            className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
                          >
                            Bestätigen
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteDraft(invoice.id)}
                            icon={<Trash2 size={16} />}
                            fullWidth
                            className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            Löschen
                          </Button>
                        </>
                      )}
                      {invoice.status === 'processed' && (
                        <Button
                          variant="warning"
                          size="sm"
                          onClick={() => handleRevertToDraft(invoice.id)}
                          icon={<Undo2 size={16} />}
                          fullWidth
                          className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-200 border-b border-gray-200 dark:border-dark-300">
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Datum</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Absender</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Betreff</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Anhänge</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {processedInvoices.map((invoice) => (
                    <Fragment key={invoice.id}>
                      <tr className="border-b border-gray-100 dark:border-dark-300 hover:bg-gray-50 dark:hover:bg-dark-200 transition-colors">
                        <td className="py-3 px-4 text-gray-900 dark:text-white whitespace-nowrap">
                          {new Date(invoice.receivedAt).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white">
                          <div className="truncate max-w-[200px]" title={invoice.senderEmail}>
                            {invoice.senderName || invoice.senderEmail}
                          </div>
                          {invoice.vendorName && (
                            <div className="text-xs text-accent-primary">→ {invoice.vendorName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                          <div className="truncate max-w-[250px]" title={invoice.emailSubject}>
                            {invoice.emailSubject}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {invoice.attachmentCount > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleDocuments(invoice.id)}
                              className="text-accent-primary dark:text-blue-400"
                              icon={loadingDocuments === invoice.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            >
                              {invoice.attachmentCount}
                              {expandedInvoiceId === invoice.id ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-400">
                              <Download size={14} />
                              0
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            invoice.status === 'processed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : invoice.status === 'draft'
                              ? 'bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400'
                              : invoice.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : invoice.status === 'skipped'
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          }`}>
                            {invoice.status === 'processed' && <CheckCircle size={12} />}
                            {invoice.status === 'draft' && <FileText size={12} />}
                            {invoice.status === 'failed' && <XCircle size={12} />}
                            {invoice.status === 'processed' ? 'Bestätigt' :
                             invoice.status === 'draft' ? 'Entwurf' :
                             invoice.status === 'failed' ? 'Fehlgeschlagen' :
                             invoice.status === 'skipped' ? 'Übersprungen' : 'Ausstehend'}
                          </span>
                          {invoice.errorMessage && (
                            <div className="text-xs text-red-500 mt-1 truncate max-w-[150px]" title={invoice.errorMessage}>
                              {invoice.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-1 justify-end">
                            {invoice.status === 'draft' && (
                              <>
                                <IconButton
                                  icon={<Check size={16} />}
                                  onClick={() => handleApproveDraft(invoice.id)}
                                  variant="success"
                                  tooltip="Bestätigen"
                                />
                                <IconButton
                                  icon={<Trash2 size={16} />}
                                  onClick={() => handleDeleteDraft(invoice.id)}
                                  variant="danger"
                                  tooltip="Löschen"
                                />
                              </>
                            )}
                            {invoice.status === 'processed' && (
                              <IconButton
                                icon={<Undo2 size={16} />}
                                onClick={() => handleRevertToDraft(invoice.id)}
                                variant="warning"
                                tooltip="Zurück zu Entwurf"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expandable documents row */}
                      {expandedInvoiceId === invoice.id && (
                        <tr className="bg-gray-50 dark:bg-dark-200">
                          <td colSpan={6} className="py-3 px-4">
                            <div className="pl-4 border-l-2 border-blue-300 dark:border-accent-primary">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Anhänge
                              </div>
                              {loadingDocuments === invoice.id ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                  <Loader2 size={16} className="animate-spin" />
                                  Lade Dokumente...
                                </div>
                              ) : invoiceDocuments[invoice.id]?.length > 0 ? (
                                <div className="space-y-2">
                                  {invoiceDocuments[invoice.id].map((doc) => (
                                    <div
                                      key={doc.id}
                                      className="flex items-center gap-3 p-2 bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300"
                                    >
                                      <File size={20} className="text-red-500 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 dark:text-white truncate">
                                          {doc.originalFilename}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          {formatFileSize(doc.size)} • {doc.mimeType}
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        <IconButton
                                          icon={<Eye size={16} />}
                                          onClick={() => handleDownloadDocument(doc.id, true)}
                                          variant="primary"
                                          tooltip="Ansehen"
                                        />
                                        <IconButton
                                          icon={<Download size={16} />}
                                          onClick={() => handleDownloadDocument(doc.id)}
                                          variant="success"
                                          tooltip="Herunterladen"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  Keine Dokumente gefunden
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">Noch keine Rechnungen verarbeitet</p>
            <p className="text-sm mt-1">Klicken Sie auf "Neue E-Mails" um das Postfach abzurufen</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && confirmingInvoice && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={handleCancelApproval}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-dark-100 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto scroll-touch touch-manipulation">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-300">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Rechnungsdaten prüfen
                </h3>
                <IconButton
                  icon={<X size={20} />}
                  onClick={handleCancelApproval}
                  tooltip="Schließen"
                />
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                {/* Invoice Info */}
                <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">Betreff</div>
                  <div className="font-medium text-gray-900 dark:text-white">{confirmingInvoice.emailSubject}</div>
                  <div className="text-gray-600 dark:text-gray-400 mt-2">Absender</div>
                  <div className="text-gray-900 dark:text-white">{confirmingInvoice.senderName} ({confirmingInvoice.senderEmail})</div>
                </div>

                {extractingData ? (
                  <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                    <Loader2 size={24} className="animate-spin mr-2" />
                    Extrahiere Rechnungsdaten aus PDF...
                  </div>
                ) : extractedData ? (
                  <>
                    {/* Confidence Indicator */}
                    {extractedData.confidence > 0 && (
                      <div className={`text-sm px-3 py-2 rounded-lg ${
                        extractedData.confidence >= 0.7
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : extractedData.confidence >= 0.4
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      }`}>
                        {extractedData.confidence >= 0.7 ? 'Hohe' : extractedData.confidence >= 0.4 ? 'Mittlere' : 'Niedrige'} Extraktions-Zuverlässigkeit ({Math.round(extractedData.confidence * 100)}%)
                        {extractedData.confidence < 0.7 && ' - Bitte prüfen Sie die Daten'}
                      </div>
                    )}

                    {/* Extracted Fields - Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Supplier Name */}
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Lieferant / Anbieter
                        </label>
                        <input
                          type="text"
                          value={extractedData.supplierName || ''}
                          onChange={(e) => updateExtractedField('supplierName', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="Name des Lieferanten"
                        />
                      </div>

                      {/* Recipient Name (if extracted) */}
                      {extractedData.recipientName && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rechnungsempfänger
                          </label>
                          <input
                            type="text"
                            value={extractedData.recipientName || ''}
                            onChange={(e) => updateExtractedField('recipientName', e.target.value || null)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                            placeholder="Name des Empfängers"
                          />
                        </div>
                      )}

                      {/* Invoice Number */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rechnungsnummer
                        </label>
                        <input
                          type="text"
                          value={extractedData.invoiceNumber || ''}
                          onChange={(e) => updateExtractedField('invoiceNumber', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="RE-12345"
                        />
                      </div>

                      {/* Customer Number (if extracted) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Kundennummer
                        </label>
                        <input
                          type="text"
                          value={extractedData.customerNumber || ''}
                          onChange={(e) => updateExtractedField('customerNumber', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="K12345"
                        />
                      </div>

                      {/* Invoice Date */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rechnungsdatum
                        </label>
                        <input
                          type="date"
                          value={extractedData.invoiceDate || ''}
                          onChange={(e) => updateExtractedField('invoiceDate', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                        />
                      </div>

                      {/* Due Date */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Fälligkeitsdatum
                        </label>
                        <input
                          type="date"
                          value={extractedData.dueDate || ''}
                          onChange={(e) => updateExtractedField('dueDate', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                        />
                      </div>

                      {/* Net Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Nettobetrag (EUR)
                        </label>
                        <input
                          type="text"
                          value={extractedData.netAmount !== null ? formatAmount(extractedData.netAmount) : ''}
                          onChange={(e) => updateExtractedField('netAmount', parseAmount(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="0,00"
                        />
                      </div>

                      {/* VAT Rate */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          MwSt.-Satz (%)
                        </label>
                        <select
                          value={extractedData.vatRate || 19}
                          onChange={(e) => updateExtractedField('vatRate', parseInt(e.target.value, 10))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                        >
                          <option value={0}>0%</option>
                          <option value={7}>7%</option>
                          <option value={19}>19%</option>
                        </select>
                      </div>

                      {/* VAT Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          MwSt. (EUR)
                        </label>
                        <input
                          type="text"
                          value={extractedData.vatAmount !== null ? formatAmount(extractedData.vatAmount) : ''}
                          onChange={(e) => updateExtractedField('vatAmount', parseAmount(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="0,00"
                        />
                      </div>

                      {/* Gross Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Bruttobetrag (EUR)
                        </label>
                        <input
                          type="text"
                          value={extractedData.grossAmount !== null ? formatAmount(extractedData.grossAmount) : ''}
                          onChange={(e) => updateExtractedField('grossAmount', parseAmount(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                          placeholder="0,00"
                        />
                      </div>
                    </div>

                    {/* Payment Details (collapsible) */}
                    {(extractedData.iban || extractedData.bic || extractedData.taxId) && (
                      <details className="mt-4 border border-gray-200 dark:border-dark-300 rounded-lg">
                        <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-200 rounded-lg">
                          Zahlungsdetails & Steuerdaten
                        </summary>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-dark-300">
                          {extractedData.iban && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                IBAN
                              </label>
                              <input
                                type="text"
                                value={extractedData.iban || ''}
                                onChange={(e) => updateExtractedField('iban', e.target.value || null)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent font-mono text-sm"
                              />
                            </div>
                          )}
                          {extractedData.bic && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                BIC
                              </label>
                              <input
                                type="text"
                                value={extractedData.bic || ''}
                                onChange={(e) => updateExtractedField('bic', e.target.value || null)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent font-mono text-sm"
                              />
                            </div>
                          )}
                          {extractedData.taxId && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                USt-IdNr.
                              </label>
                              <input
                                type="text"
                                value={extractedData.taxId || ''}
                                onChange={(e) => updateExtractedField('taxId', e.target.value || null)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent font-mono text-sm"
                              />
                            </div>
                          )}
                          {extractedData.paymentMethod && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Zahlungsart
                              </label>
                              <input
                                type="text"
                                value={extractedData.paymentMethod || ''}
                                onChange={(e) => updateExtractedField('paymentMethod', e.target.value || null)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary focus:border-transparent"
                              />
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {/* Validation Warnings */}
                    {validationWarnings.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                              Bitte prüfen
                            </h4>
                            <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                              {validationWarnings.map((warning, idx) => (
                                <li key={idx}>• {warning}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Line Items Section */}
                    {extractedData.lineItems && extractedData.lineItems.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-300">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                          <span>Rechnungspositionen ({extractedData.lineItems.length})</span>
                          {extractedData.lineItems.some(item => item.customerName) && (
                            <span className="text-xs bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-400 px-2 py-0.5 rounded">
                              MSP/Reseller
                            </span>
                          )}
                        </h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto scroll-touch touch-manipulation">
                          {extractedData.lineItems.map((item, index) => (
                            <div
                              key={index}
                              className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3 text-sm"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    {item.position !== null && (
                                      <span className="text-xs bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                        #{item.position}
                                      </span>
                                    )}
                                    <span className="font-medium text-gray-900 dark:text-white truncate">
                                      {item.description}
                                    </span>
                                  </div>
                                  {item.articleNumber && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                                      Art.-Nr.: {item.articleNumber}
                                    </div>
                                  )}
                                  {item.customerName && (
                                    <div className="text-xs text-accent-primary dark:text-blue-400 mt-1 font-medium">
                                      → Kunde: {item.customerName}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {item.productType && (
                                      <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 rounded">
                                        {item.productType}
                                      </span>
                                    )}
                                    {item.period && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {item.period}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  {item.quantity !== null && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {item.quantity} {item.unit || 'x'} {item.unitPrice !== null ? `à ${formatAmount(item.unitPrice)} €` : ''}
                                    </div>
                                  )}
                                  {item.totalPrice !== null && (
                                    <div className="font-medium text-gray-900 dark:text-white">
                                      {formatAmount(item.totalPrice)} €
                                    </div>
                                  )}
                                  {item.vatRate !== null && item.vatRate !== extractedData.vatRate && (
                                    <div className="text-xs text-amber-600 dark:text-amber-400">
                                      {item.vatRate}% MwSt.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Diese Positionen können später für die Weiterverrechnung verwendet werden.
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-300 bg-gray-50 dark:bg-dark-200">
                <Button
                  variant="secondary"
                  onClick={handleCancelApproval}
                  disabled={approving}
                >
                  Abbrechen
                </Button>
                <Button
                  variant="success"
                  onClick={handleConfirmApproval}
                  disabled={extractingData || approving || !extractedData}
                  loading={approving}
                  icon={<Check size={16} />}
                >
                  Bestätigen & sevDesk-Beleg erstellen
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
