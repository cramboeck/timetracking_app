import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  FileText,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Calendar,
  Building2,
  Hash,
  Euro,
  Loader2,
  ChevronRight,
  RotateCcw,
  Send,
  Trash2,
  Wand2,
  Download,
} from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { authFetch } from '../services/api';
import { useToast, useConfirm } from '../contexts/UIContext';
import { formatCurrency, formatDate } from '../utils/formatting';

interface InvoiceDraft {
  id: string;
  email_id: string | null;
  email_subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string;
  attachment_count: number;
  document_ids: string[];
  vendor_id: string | null;
  vendor_name: string | null;
  status: 'pending' | 'draft' | 'processed' | 'failed' | 'skipped';
  error_message: string | null;
  source: 'email' | 'manual' | 'sevdesk_import';
  original_filename: string | null;
  sevdesk_voucher_id: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  supplier_address: string | null;
  invoice_date: string | null;
  due_date: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  vat_amount: number | null;
  vat_rate: number | null;
  currency: string | null;
  iban: string | null;
  extracted_at: string | null;
  extraction_confidence: number | null;
}

interface DraftStats {
  pending: { count: number; amount: number };
  draft: { count: number; amount: number };
  processed: { count: number; amount: number };
  failed: { count: number; amount: number };
  skipped: { count: number; amount: number };
}

interface InvoiceDraftQueueProps {
  onClose?: () => void;
}

export function InvoiceDraftQueue({ onClose }: InvoiceDraftQueueProps) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();

  const [selectedDraft, setSelectedDraft] = useState<InvoiceDraft | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<InvoiceDraft>>({});

  // Fetch drafts
  const draftsQuery = useQuery({
    queryKey: ['invoice-drafts', 'draft'],
    queryFn: async () => {
      const res = await authFetch('/sevdesk/invoice-drafts?status=draft');
      return res.data as { drafts: InvoiceDraft[]; total: number };
    },
  });

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: ['invoice-drafts', 'stats'],
    queryFn: async () => {
      const res = await authFetch('/sevdesk/invoice-drafts/stats');
      return res.data as DraftStats;
    },
  });

  // Poll mailbox mutation
  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/sevdesk/invoice-drafts/poll', { method: 'POST' });
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Fehler beim Abrufen: ${err.message}`, 'error');
    },
  });

  // Fetch attachments mutation (for old imports without PDFs)
  const fetchAttachmentsMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/sevdesk/invoice-drafts/fetch-attachments?limit=20', { method: 'POST' });
      return res.data as { total: number; fetched: number; failed: number; message: string };
    },
    onSuccess: (data) => {
      showToast(data.message, data.failed > 0 ? 'warning' : 'success');
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Anhänge laden fehlgeschlagen: ${err.message}`, 'error');
    },
  });

  // Extract all mutation
  const extractAllMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/sevdesk/invoice-drafts/extract-all?limit=20', { method: 'POST' });
      return res.data as { total: number; extracted: number; failed: number; message: string };
    },
    onSuccess: (data) => {
      showToast(data.message, data.failed > 0 ? 'warning' : 'success');
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Extraktion fehlgeschlagen: ${err.message}`, 'error');
    },
  });

  // Re-extract mutation
  const extractMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/sevdesk/invoice-drafts/${id}/extract`, { method: 'POST' });
      return res.data;
    },
    onSuccess: () => {
      showToast('Daten neu extrahiert', 'success');
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Extraktion fehlgeschlagen: ${err.message}`, 'error');
    },
  });

  // Update draft mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InvoiceDraft> }) => {
      await authFetch(`/sevdesk/invoice-drafts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          supplierName: data.supplier_name,
          invoiceNumber: data.invoice_number,
          invoiceDate: data.invoice_date,
          dueDate: data.due_date,
          netAmount: data.net_amount,
          grossAmount: data.gross_amount,
          vatAmount: data.vat_amount,
          vatRate: data.vat_rate,
          currency: data.currency,
        }),
      });
    },
    onSuccess: () => {
      showToast('Entwurf aktualisiert', 'success');
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Fehler: ${err.message}`, 'error');
    },
  });

  // Confirm and create sevDesk voucher
  const confirmMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InvoiceDraft }) => {
      const res = await authFetch(`/sevdesk/invoice-drafts/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          supplierName: data.supplier_name || 'Unbekannt',
          invoiceNumber: data.invoice_number || 'N/A',
          invoiceDate: data.invoice_date || new Date().toISOString().split('T')[0],
          netAmount: data.net_amount || 0,
          grossAmount: data.gross_amount || 0,
          taxRate: data.vat_rate || 19,
          description: `${data.supplier_name} - ${data.invoice_number}`,
        }),
      });
      return res.data;
    },
    onSuccess: (data) => {
      showToast(data.message, 'success');
      setSelectedDraft(null);
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
    onError: (err: Error) => {
      showToast(`Fehler: ${err.message}`, 'error');
    },
  });

  // Skip draft mutation
  const skipMutation = useMutation({
    mutationFn: async (id: string) => {
      await authFetch(`/sevdesk/invoice-drafts/${id}?skip=true`, { method: 'DELETE' });
    },
    onSuccess: () => {
      showToast('Entwurf übersprungen', 'info');
      setSelectedDraft(null);
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
  });

  // Delete draft mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await authFetch(`/sevdesk/invoice-drafts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      showToast('Entwurf gelöscht', 'success');
      setSelectedDraft(null);
      queryClient.invalidateQueries({ queryKey: ['invoice-drafts'] });
    },
  });

  const handleConfirm = async () => {
    if (!selectedDraft) return;

    // Validate required fields
    const draft = editMode ? { ...selectedDraft, ...editData } : selectedDraft;
    if (!draft.supplier_name || !draft.invoice_number || !draft.gross_amount) {
      showToast('Bitte alle Pflichtfelder ausfüllen (Lieferant, Rechnungsnr., Bruttobetrag)', 'warning');
      return;
    }

    const ok = await confirm({
      title: 'Beleg in sevDesk erstellen?',
      message: `Beleg von ${draft.supplier_name} (${formatCurrency(draft.gross_amount || 0)}) wird in sevDesk als Eingangsbeleg erstellt.`,
      confirmText: 'In sevDesk erstellen',
    });

    if (ok) {
      confirmMutation.mutate({ id: selectedDraft.id, data: draft as InvoiceDraft });
    }
  };

  const handleSkip = async () => {
    if (!selectedDraft) return;

    const ok = await confirm({
      title: 'Entwurf überspringen?',
      message: 'Der Entwurf wird als übersprungen markiert und nicht mehr angezeigt.',
      confirmText: 'Überspringen',
      variant: 'warning',
    });

    if (ok) {
      skipMutation.mutate(selectedDraft.id);
    }
  };

  const handleDelete = async () => {
    if (!selectedDraft) return;

    const ok = await confirm({
      title: 'Entwurf löschen?',
      message: 'Der Entwurf und alle zugehörigen Dokumente werden unwiderruflich gelöscht.',
      confirmText: 'Löschen',
      variant: 'danger',
    });

    if (ok) {
      deleteMutation.mutate(selectedDraft.id);
    }
  };

  const stats = statsQuery.data;
  const drafts = draftsQuery.data?.drafts || [];
  const isLoading = draftsQuery.isLoading || statsQuery.isLoading;

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return 'text-gray-400';
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-3">
          <Inbox size={24} className="text-accent-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Beleg-Inbox
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Eingehende Rechnungen prüfen und bestätigen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAttachmentsMutation.mutate()}
            disabled={fetchAttachmentsMutation.isPending}
            icon={fetchAttachmentsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            title="PDFs für Einträge ohne Anhänge nachladen"
          >
            PDFs laden
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => extractAllMutation.mutate()}
            disabled={extractAllMutation.isPending}
            icon={extractAllMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            title="OCR für alle Entwürfe ohne Extraktion ausführen"
          >
            OCR starten
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending}
            icon={pollMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          >
            Postfach abrufen
          </Button>
          {onClose && (
            <IconButton icon={<X size={20} />} onClick={onClose} title="Schließen" />
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-dark-50 border-b border-gray-200 dark:border-dark-border">
          <div className="text-center">
            <div className="text-2xl font-bold text-accent-primary">{stats.draft.count}</div>
            <div className="text-xs text-gray-500 dark:text-dark-400">Zu prüfen</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.processed.count}</div>
            <div className="text-xs text-gray-500 dark:text-dark-400">Verarbeitet</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending.count}</div>
            <div className="text-xs text-gray-500 dark:text-dark-400">Ausstehend</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed.count}</div>
            <div className="text-xs text-gray-500 dark:text-dark-400">Fehlgeschlagen</div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* List */}
        <div className={`${selectedDraft ? 'hidden md:flex md:w-1/3' : 'flex w-full'} flex-col border-r border-gray-200 dark:border-dark-border`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-accent-primary" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-dark-400">
              <Inbox size={48} className="mb-4 opacity-50" />
              <p>Keine Entwürfe zu prüfen</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => pollMutation.mutate()}
                icon={<RefreshCw size={14} />}
              >
                Postfach abrufen
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => {
                    setSelectedDraft(draft);
                    setEditMode(false);
                    setEditData({});
                  }}
                  className={`p-4 border-b border-gray-100 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors ${
                    selectedDraft?.id === draft.id ? 'bg-accent-primary/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg flex-shrink-0">
                      <FileText size={20} className="text-gray-500 dark:text-dark-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white truncate">
                          {draft.supplier_name || draft.sender_name || 'Unbekannt'}
                        </span>
                        {draft.extraction_confidence !== null && (
                          <span className={`text-xs ${getConfidenceColor(draft.extraction_confidence)}`}>
                            {Math.round(draft.extraction_confidence * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-400 truncate">
                        {draft.invoice_number || draft.email_subject || draft.original_filename}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {draft.gross_amount && (
                          <span className="font-medium text-gray-700 dark:text-dark-300">
                            {formatCurrency(draft.gross_amount)}
                          </span>
                        )}
                        {draft.invoice_date && (
                          <span>{formatDate(draft.invoice_date)}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {selectedDraft && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-50">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDraft(null)}
                  className="md:hidden"
                  icon={<ChevronRight size={16} className="rotate-180" />}
                >
                  Zurück
                </Button>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {editMode ? 'Bearbeiten' : 'Details'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {!editMode && (
                  <>
                    <IconButton
                      icon={<RotateCcw size={16} />}
                      onClick={() => extractMutation.mutate(selectedDraft.id)}
                      title="Neu extrahieren"
                      disabled={extractMutation.isPending}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditMode(true);
                        setEditData({ ...selectedDraft });
                      }}
                    >
                      Bearbeiten
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-auto p-4">
              {editMode ? (
                <div className="space-y-4">
                  {/* Edit Form */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                      Lieferant *
                    </label>
                    <input
                      type="text"
                      value={editData.supplier_name || ''}
                      onChange={(e) => setEditData({ ...editData, supplier_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                      Rechnungsnummer *
                    </label>
                    <input
                      type="text"
                      value={editData.invoice_number || ''}
                      onChange={(e) => setEditData({ ...editData, invoice_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        Rechnungsdatum
                      </label>
                      <input
                        type="date"
                        value={editData.invoice_date || ''}
                        onChange={(e) => setEditData({ ...editData, invoice_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        Fälligkeitsdatum
                      </label>
                      <input
                        type="date"
                        value={editData.due_date || ''}
                        onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        Netto
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.net_amount || ''}
                        onChange={(e) => setEditData({ ...editData, net_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        Brutto *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editData.gross_amount || ''}
                        onChange={(e) => setEditData({ ...editData, gross_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                        MwSt. %
                      </label>
                      <input
                        type="number"
                        step="1"
                        value={editData.vat_rate || 19}
                        onChange={(e) => setEditData({ ...editData, vat_rate: parseFloat(e.target.value) || 19 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditMode(false);
                        setEditData({});
                      }}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => updateMutation.mutate({ id: selectedDraft.id, data: editData })}
                      disabled={updateMutation.isPending}
                      icon={updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    >
                      Speichern
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Extracted Data */}
                  <div className="grid gap-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
                      <Building2 size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-dark-400">Lieferant</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {selectedDraft.supplier_name || <span className="text-red-500">Nicht erkannt</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
                      <Hash size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-dark-400">Rechnungsnummer</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {selectedDraft.invoice_number || <span className="text-red-500">Nicht erkannt</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
                      <Calendar size={20} className="text-gray-400" />
                      <div>
                        <div className="text-xs text-gray-500 dark:text-dark-400">Rechnungsdatum</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {selectedDraft.invoice_date ? formatDate(selectedDraft.invoice_date) : <span className="text-red-500">Nicht erkannt</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
                      <Euro size={20} className="text-gray-400" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 dark:text-dark-400">Beträge</div>
                        <div className="grid grid-cols-3 gap-4 mt-1">
                          <div>
                            <div className="text-xs text-gray-400">Netto</div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {selectedDraft.net_amount ? formatCurrency(selectedDraft.net_amount) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400">MwSt. ({selectedDraft.vat_rate || 19}%)</div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {selectedDraft.vat_amount ? formatCurrency(selectedDraft.vat_amount) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400">Brutto</div>
                            <div className="font-bold text-accent-primary">
                              {selectedDraft.gross_amount ? formatCurrency(selectedDraft.gross_amount) : <span className="text-red-500">Fehlt</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Source Info */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Quelle</div>
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      {selectedDraft.source === 'email' && (
                        <>
                          E-Mail von {selectedDraft.sender_name || selectedDraft.sender_email}
                          {selectedDraft.email_subject && <div className="text-xs opacity-75 mt-1">{selectedDraft.email_subject}</div>}
                        </>
                      )}
                      {selectedDraft.source === 'manual' && 'Manuell hochgeladen'}
                      {selectedDraft.source === 'sevdesk_import' && 'sevDesk Import'}
                    </div>
                  </div>

                  {/* Confidence Warning */}
                  {selectedDraft.extraction_confidence !== null && selectedDraft.extraction_confidence < 0.6 && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <AlertTriangle size={18} className="text-yellow-600 mt-0.5" />
                      <div className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Geringe Erkennungsqualität</strong>
                        <p className="text-xs mt-1 opacity-75">
                          Bitte prüfen Sie die extrahierten Daten sorgfältig. Die automatische Erkennung war nur zu {Math.round(selectedDraft.extraction_confidence * 100)}% sicher.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detail Footer */}
            {!editMode && (
              <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      disabled={skipMutation.isPending}
                      icon={<X size={16} />}
                      className="text-gray-500"
                    >
                      Überspringen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                      icon={<Trash2 size={16} />}
                      className="text-red-500 hover:text-red-600"
                    >
                      Löschen
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleConfirm}
                    disabled={confirmMutation.isPending}
                    icon={confirmMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  >
                    In sevDesk erstellen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
