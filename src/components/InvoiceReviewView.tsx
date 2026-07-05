import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Check, Loader2, RefreshCw, AlertTriangle,
  Building2, Calendar, Hash, CreditCard, FileText,
  ChevronDown, ChevronUp, Wand2, Link2, Search, ExternalLink
} from 'lucide-react';
import { Button } from './ui/Button';
import {
  microsoft365Api,
  sevdeskApi,
  ProcessedInvoice,
  ExtractedInvoiceData,
  InvoiceLineItem,
  LineItemWithMatch,
  SevdeskCustomer
} from '../services/api';
import { customersApi } from '../services/api';
import { Customer } from '../types';
import { useToast } from '../contexts/UIContext';

interface InvoiceReviewViewProps {
  invoice: ProcessedInvoice;
  onClose: () => void;
  onApproved: () => void;
}

const formatAmount = (amount: number | null): string => {
  if (amount === null) return '-';
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export const InvoiceReviewView = ({ invoice, onClose, onApproved }: InvoiceReviewViewProps) => {
  const toast = useToast();

  // Extraction state
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [extracting, setExtracting] = useState(true);
  const [approving, setApproving] = useState(false);

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemWithMatch[]>([]);
  const [autoMatching, setAutoMatching] = useState(false);
  const [expandedPositions, setExpandedPositions] = useState(true);

  // Customer search
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingLineItem, setEditingLineItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveAsAlias, setSaveAsAlias] = useState(false);
  const [updatingLineItem, setUpdatingLineItem] = useState<string | null>(null);

  // sevDesk supplier search
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<SevdeskCustomer[]>([]);
  const [searchingSuppliers, setSearchingSuppliers] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSevdeskContact, setSelectedSevdeskContact] = useState<SevdeskCustomer | null>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  // PDF URL
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Load extraction data on mount
  useEffect(() => {
    loadExtraction();
    loadCustomers();
    loadPdfUrl();
  }, [invoice.id]);

  // Debounced supplier search
  useEffect(() => {
    if (supplierSearch.length < 2) {
      setSupplierResults([]);
      return;
    }
    setSearchingSuppliers(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await sevdeskApi.getContacts({ type: 'suppliers', search: supplierSearch });
        if (res.success) {
          setSupplierResults(res.data.slice(0, 10));
        }
      } catch (err) {
        console.error('Supplier search failed:', err);
      } finally {
        setSearchingSuppliers(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [supplierSearch]);

  const loadExtraction = async () => {
    try {
      setExtracting(true);
      const response = await microsoft365Api.extractInvoiceData(invoice.id);
      if (response.success && response.data) {
        setExtractedData(response.data);
        // Load persisted line items if any
        if (response.data.lineItems && response.data.lineItems.length > 0) {
          await loadLineItems();
        }
      }
    } catch (err) {
      console.error('Extraction failed:', err);
      toast('Extraktion fehlgeschlagen', 'error');
    } finally {
      setExtracting(false);
    }
  };

  const loadLineItems = async () => {
    try {
      const response = await sevdeskApi.getLineItems(invoice.id);
      if (response.success) {
        setLineItems(response.data);
      }
    } catch (err) {
      console.error('Failed to load line items:', err);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await customersApi.getAll();
      if (response.success) {
        setCustomers(response.data);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadPdfUrl = async () => {
    try {
      const docsResponse = await microsoft365Api.getInvoiceDocuments(invoice.id);
      if (docsResponse.success && docsResponse.data.length > 0) {
        const pdfDoc = docsResponse.data.find(d => d.mimeType === 'application/pdf') || docsResponse.data[0];
        const url = microsoft365Api.getDocumentDownloadUrl(pdfDoc.id, true);
        setPdfUrl(url);
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
    }
  };

  const handleReExtract = async () => {
    try {
      setExtracting(true);
      const response = await microsoft365Api.extractInvoiceData(invoice.id, { force: true });
      if (response.success && response.data) {
        setExtractedData(response.data);
        await loadLineItems();
        toast('Daten neu extrahiert', 'success');
      }
    } catch (err) {
      toast('Neu-Extraktion fehlgeschlagen', 'error');
    } finally {
      setExtracting(false);
    }
  };

  const handleAutoMatch = async () => {
    try {
      setAutoMatching(true);
      const result = await sevdeskApi.autoMatchLineItems(invoice.id, 0.7);
      if (result.success) {
        await loadLineItems();
        toast(`${result.data.applied} Positionen automatisch zugeordnet`, 'success');
      }
    } catch (err) {
      toast('Auto-Match fehlgeschlagen', 'error');
    } finally {
      setAutoMatching(false);
    }
  };

  const handleAssignCustomer = async (lineItemId: string, customerId: string) => {
    try {
      setUpdatingLineItem(lineItemId);
      const result = await sevdeskApi.assignLineItemCustomer(lineItemId, customerId, saveAsAlias);
      if (result.success) {
        await loadLineItems();
        setEditingLineItem(null);
        setSaveAsAlias(false);
        setSearchQuery('');
      }
    } catch (err) {
      toast('Zuweisung fehlgeschlagen', 'error');
    } finally {
      setUpdatingLineItem(null);
    }
  };

  const handleApprove = async () => {
    if (!extractedData) return;

    try {
      setApproving(true);

      // Build approval data
      const approvalData = {
        ...extractedData,
        sevdeskContactId: selectedSevdeskContact?.id || null,
      };

      const response = await microsoft365Api.approveInvoiceDraft(invoice.id, approvalData);
      if (response.success) {
        toast('Beleg erfolgreich freigegeben', 'success');
        onApproved();
      } else {
        toast('Freigabe fehlgeschlagen', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Freigabe fehlgeschlagen', 'error');
    } finally {
      setApproving(false);
    }
  };

  const updateField = (field: keyof ExtractedInvoiceData, value: any) => {
    if (!extractedData) return;
    setExtractedData({ ...extractedData, [field]: value });
  };

  const filteredCustomers = searchQuery.length >= 2
    ? customers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customerNumber && c.customerNumber.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : customers.slice(0, 10);

  const unmatchedCount = lineItems.filter(i => !i.customerId).length;
  const matchedCount = lineItems.filter(i => i.customerId).length;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-dark-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              Beleg prüfen
            </h1>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              {invoice.emailSubject || invoice.senderName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReExtract}
            disabled={extracting}
            icon={<RefreshCw size={16} className={extracting ? 'animate-spin' : ''} />}
          >
            Neu extrahieren
          </Button>
          <Button
            variant="primary"
            onClick={handleApprove}
            disabled={approving || extracting || !extractedData}
            icon={approving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          >
            Freigeben
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: PDF Preview */}
        <div className="w-1/2 border-r border-gray-200 dark:border-dark-border flex flex-col bg-gray-900">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800 text-white text-sm">
            <span>PDF-Vorschau</span>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-accent-primary"
              >
                <ExternalLink size={14} />
                Öffnen
              </a>
            )}
          </div>
          <div className="flex-1">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title="PDF Vorschau"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Right: Extracted Data */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          {extracting ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-accent-primary" />
                <p className="text-gray-600 dark:text-dark-400">Extrahiere Daten...</p>
              </div>
            </div>
          ) : extractedData ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Confidence Indicator */}
              {extractedData.confidence > 0 && (
                <div className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                  extractedData.confidence >= 0.7
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : extractedData.confidence >= 0.4
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                }`}>
                  {extractedData.confidence >= 0.7 ? (
                    <Check size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  {Math.round(extractedData.confidence * 100)}% Erkennungsrate
                </div>
              )}

              {/* Basic Fields */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText size={16} />
                  Rechnungsdaten
                </h3>

                {/* Supplier with sevDesk search */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                    Lieferant
                    {selectedSevdeskContact && (
                      <span className="ml-2 text-green-600 dark:text-green-400">✓ sevDesk</span>
                    )}
                  </label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={supplierInputRef}
                      type="text"
                      value={extractedData.supplierName || ''}
                      onChange={(e) => {
                        updateField('supplierName', e.target.value || null);
                        setSupplierSearch(e.target.value);
                        setShowSupplierDropdown(true);
                        if (selectedSevdeskContact && e.target.value !== selectedSevdeskContact.name) {
                          setSelectedSevdeskContact(null);
                        }
                      }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                      placeholder="Lieferant suchen..."
                    />
                    {searchingSuppliers && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                    )}
                  </div>
                  {showSupplierDropdown && supplierResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-dark-200 border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {supplierResults.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-300"
                          onClick={() => {
                            updateField('supplierName', contact.name);
                            setSelectedSevdeskContact(contact);
                            setShowSupplierDropdown(false);
                          }}
                        >
                          <span className="font-medium">{contact.name}</span>
                          {contact.customerNumber && (
                            <span className="text-xs text-gray-500 ml-2">({contact.customerNumber})</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Rechnungsnummer
                    </label>
                    <div className="relative">
                      <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={extractedData.invoiceNumber || ''}
                        onChange={(e) => updateField('invoiceNumber', e.target.value || null)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Kundennummer
                    </label>
                    <input
                      type="text"
                      value={extractedData.customerNumber || ''}
                      onChange={(e) => updateField('customerNumber', e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Rechnungsdatum
                    </label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="date"
                        value={extractedData.invoiceDate || ''}
                        onChange={(e) => updateField('invoiceDate', e.target.value || null)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Fälligkeitsdatum
                    </label>
                    <input
                      type="date"
                      value={extractedData.dueDate || ''}
                      onChange={(e) => updateField('dueDate', e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                {/* Amounts */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Netto
                    </label>
                    <div className="relative">
                      <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        value={extractedData.netAmount ?? ''}
                        onChange={(e) => updateField('netAmount', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      MwSt.
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={extractedData.vatAmount ?? ''}
                      onChange={(e) => updateField('vatAmount', e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">
                      Brutto
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={extractedData.grossAmount ?? ''}
                      onChange={(e) => updateField('grossAmount', e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Section */}
              {(lineItems.length > 0 || (extractedData.lineItems && extractedData.lineItems.length > 0)) && (
                <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setExpandedPositions(!expandedPositions)}
                      className="flex items-center gap-2 font-medium text-gray-900 dark:text-white"
                    >
                      {expandedPositions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Positionen ({lineItems.length || extractedData.lineItems?.length || 0})
                    </button>
                    <div className="flex items-center gap-2">
                      {lineItems.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-dark-400">
                          {matchedCount}/{lineItems.length} zugeordnet
                        </span>
                      )}
                      {unmatchedCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleAutoMatch}
                          disabled={autoMatching}
                          icon={autoMatching ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                        >
                          Auto
                        </Button>
                      )}
                    </div>
                  </div>

                  {expandedPositions && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(lineItems.length > 0 ? lineItems : extractedData.lineItems || []).map((item, index) => {
                        const isPersistedItem = 'id' in item;
                        const itemId = isPersistedItem ? (item as LineItemWithMatch).id : `temp-${index}`;
                        const persistedItem = isPersistedItem ? item as LineItemWithMatch : null;
                        const extractedItem = !isPersistedItem ? item as InvoiceLineItem : null;

                        return (
                          <div
                            key={itemId}
                            className={`bg-gray-50 dark:bg-dark-200 rounded-lg p-3 text-sm ${
                              persistedItem && !persistedItem.customerId ? 'border-l-2 border-amber-400' : ''
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {(persistedItem?.positionNumber ?? extractedItem?.position) !== null && (
                                    <span className="text-xs bg-gray-200 dark:bg-dark-300 px-1.5 py-0.5 rounded">
                                      #{persistedItem?.positionNumber ?? extractedItem?.position}
                                    </span>
                                  )}
                                  <span className="font-medium text-gray-900 dark:text-white truncate">
                                    {persistedItem?.description || extractedItem?.description}
                                  </span>
                                </div>

                                {/* Extracted customer info */}
                                {(persistedItem?.extractedCustomerName || extractedItem?.customerName) && (
                                  <div className="text-xs text-accent-primary mt-1">
                                    → {persistedItem?.extractedCustomerName || extractedItem?.customerName}
                                  </div>
                                )}

                                {/* Assigned customer */}
                                {persistedItem?.customerId && persistedItem.customerName && editingLineItem !== itemId && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                      <Link2 size={12} />
                                      {persistedItem.customerName}
                                    </span>
                                    <button
                                      onClick={() => setEditingLineItem(itemId)}
                                      className="text-xs text-gray-400 hover:text-gray-600"
                                    >
                                      ändern
                                    </button>
                                  </div>
                                )}

                                {/* Customer selection */}
                                {persistedItem && (editingLineItem === itemId || !persistedItem.customerId) && (
                                  <div className="mt-2 space-y-2">
                                    <div className="relative">
                                      <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                      <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Kunde suchen..."
                                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-100"
                                      />
                                    </div>
                                    <div className="max-h-24 overflow-y-auto border border-gray-200 dark:border-dark-300 rounded bg-white dark:bg-dark-100">
                                      {filteredCustomers.map((customer) => (
                                        <button
                                          key={customer.id}
                                          onClick={() => handleAssignCustomer(itemId, customer.id)}
                                          disabled={updatingLineItem === itemId}
                                          className="w-full px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-dark-200 disabled:opacity-50"
                                        >
                                          {customer.name}
                                        </button>
                                      ))}
                                    </div>
                                    <label className="flex items-center gap-1 text-xs text-gray-500">
                                      <input
                                        type="checkbox"
                                        checked={saveAsAlias}
                                        onChange={(e) => setSaveAsAlias(e.target.checked)}
                                        className="rounded text-accent-primary"
                                      />
                                      Als Alias speichern
                                    </label>
                                  </div>
                                )}
                              </div>

                              <div className="text-right flex-shrink-0">
                                {(persistedItem?.totalPrice ?? extractedItem?.totalPrice) !== null && (
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {formatAmount(persistedItem?.totalPrice ?? extractedItem?.totalPrice ?? null)} €
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Additional Fields (collapsed by default) */}
              {(extractedData.iban || extractedData.bic || extractedData.taxId) && (
                <details className="border-t border-gray-200 dark:border-dark-border pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white">
                    Weitere Felder
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {extractedData.iban && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">IBAN</label>
                        <input
                          type="text"
                          value={extractedData.iban}
                          onChange={(e) => updateField('iban', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm font-mono"
                        />
                      </div>
                    )}
                    {extractedData.bic && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">BIC</label>
                        <input
                          type="text"
                          value={extractedData.bic}
                          onChange={(e) => updateField('bic', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm font-mono"
                        />
                      </div>
                    )}
                    {extractedData.taxId && (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">USt-IdNr.</label>
                        <input
                          type="text"
                          value={extractedData.taxId}
                          onChange={(e) => updateField('taxId', e.target.value || null)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-300 bg-white dark:bg-dark-200 text-gray-900 dark:text-white text-sm font-mono"
                        />
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500 dark:text-dark-400">
                <AlertTriangle size={32} className="mx-auto mb-2" />
                <p>Keine Daten extrahiert</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceReviewView;
