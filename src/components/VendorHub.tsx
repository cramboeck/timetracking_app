import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Mail,
  FileText,
  Globe,
  Package,
  X,
  RefreshCw,
  ExternalLink,
  Paperclip,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit3,
  Save,
  Inbox,
} from 'lucide-react';
import { customersApi } from '../services/api';
import type { Customer } from '../types';

interface VendorInvoice {
  id: string;
  emailId: string;
  emailSubject: string;
  senderEmail: string;
  senderName: string;
  receivedAt: string;
  attachmentCount: number;
  status: string;
  errorMessage: string | null;
  processedAt: string;
}

interface VendorDocument {
  id: string;
  processedInvoiceId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface VendorEmail {
  id: string;
  subject: string;
  from: { name: string; email: string };
  receivedDateTime: string;
  bodyPreview: string;
  hasAttachments: boolean;
  mailboxType: 'support' | 'invoice';
}

interface VendorStats {
  totalInvoices: number;
  draftInvoices: number;
  processedInvoices: number;
  failedInvoices: number;
  totalDocuments: number;
}

interface VendorHubProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function VendorHub({ customer, isOpen, onClose, onUpdate }: VendorHubProps) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [emails, setEmails] = useState<VendorEmail[]>([]);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'emails' | 'invoices' | 'settings'>('overview');

  // Settings editing
  const [isEditing, setIsEditing] = useState(false);
  const [vendorDomain, setVendorDomain] = useState(customer.vendorDomain || '');
  const [vendorNotes, setVendorNotes] = useState(customer.vendorNotes || '');
  const [isVendor, setIsVendor] = useState(customer.isVendor || false);
  const [saving, setSaving] = useState(false);

  const loadHubData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customersApi.getVendorHub(customer.id);
      if (response.success) {
        setInvoices(response.data.invoices);
        setDocuments(response.data.documents);
        setStats(response.data.stats);
      }
    } catch (err) {
      console.error('Failed to load vendor hub:', err);
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  const loadEmails = useCallback(async () => {
    try {
      const response = await customersApi.getVendorEmails(customer.id);
      if (response.success) {
        setEmails(response.data.emails);
      }
    } catch (err) {
      console.error('Failed to load vendor emails:', err);
    }
  }, [customer.id]);

  useEffect(() => {
    if (isOpen) {
      loadHubData();
      loadEmails();
    }
  }, [isOpen, loadHubData, loadEmails]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await customersApi.update(customer.id, {
        isVendor,
        vendorDomain: vendorDomain || null,
        vendorNotes: vendorNotes || null,
      });
      setIsEditing(false);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to save vendor settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'draft':
        return <Clock size={16} className="text-yellow-500" />;
      case 'failed':
        return <AlertCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processed': return 'Verarbeitet';
      case 'draft': return 'Entwurf';
      case 'failed': return 'Fehlgeschlagen';
      case 'skipped': return 'Übersprungen';
      default: return status;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: customer.color }}
            >
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {customer.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {customer.vendorDomain ? `@${customer.vendorDomain}` : customer.email || 'Lieferanten-Hub'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadHubData(); loadEmails(); }}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <RefreshCw size={18} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'overview', label: 'Übersicht', icon: Package },
            { id: 'emails', label: 'E-Mails', icon: Mail },
            { id: 'invoices', label: 'Belege', icon: FileText },
            { id: 'settings', label: 'Einstellungen', icon: Edit3 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="animate-spin text-gray-400" size={32} />
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {stats.totalInvoices}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Belege gesamt</div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                          {stats.draftInvoices}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Entwürfe</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {stats.processedInvoices}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Verarbeitet</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {stats.totalDocuments}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Dokumente</div>
                      </div>
                    </div>
                  )}

                  {/* Recent Emails */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Mail size={18} />
                      Neueste E-Mails
                    </h3>
                    {emails.length > 0 ? (
                      <div className="space-y-2">
                        {emails.slice(0, 5).map(email => (
                          <div
                            key={email.id}
                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    email.mailboxType === 'invoice'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                  }`}>
                                    {email.mailboxType === 'invoice' ? 'Rechnung' : 'Support'}
                                  </span>
                                  {email.hasAttachments && <Paperclip size={12} className="text-gray-400" />}
                                </div>
                                <p className="font-medium text-gray-900 dark:text-white truncate mt-1">
                                  {email.subject}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {email.from.name} &lt;{email.from.email}&gt;
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                {formatDate(email.receivedDateTime)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Inbox size={48} className="mx-auto mb-2 opacity-30" />
                        <p>Keine E-Mails gefunden</p>
                        <p className="text-sm">Domain: {customer.vendorDomain || 'nicht konfiguriert'}</p>
                      </div>
                    )}
                  </div>

                  {/* Recent Invoices */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <FileText size={18} />
                      Neueste Belege
                    </h3>
                    {invoices.length > 0 ? (
                      <div className="space-y-2">
                        {invoices.slice(0, 5).map(invoice => (
                          <div
                            key={invoice.id}
                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              {getStatusIcon(invoice.status)}
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {invoice.emailSubject}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {invoice.attachmentCount} Anhänge
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDate(invoice.receivedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText size={48} className="mx-auto mb-2 opacity-30" />
                        <p>Keine Belege gefunden</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Emails Tab */}
              {activeTab === 'emails' && (
                <div className="space-y-2">
                  {emails.length > 0 ? (
                    emails.map(email => (
                      <div
                        key={email.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-2 ${
                            email.mailboxType === 'invoice' ? 'bg-purple-500' : 'bg-blue-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                email.mailboxType === 'invoice'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                              }`}>
                                {email.mailboxType === 'invoice' ? 'Rechnungs-Postfach' : 'Support-Postfach'}
                              </span>
                              {email.hasAttachments && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <Paperclip size={12} />
                                  Anhänge
                                </span>
                              )}
                              <span className="text-xs text-gray-500 ml-auto">
                                {formatDate(email.receivedDateTime)}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {email.subject}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Von: {email.from.name} &lt;{email.from.email}&gt;
                            </p>
                            {email.bodyPreview && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                                {email.bodyPreview}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-gray-500">
                      <Inbox size={64} className="mx-auto mb-4 opacity-30" />
                      <p className="text-lg">Keine E-Mails gefunden</p>
                      <p className="text-sm mt-2">
                        {customer.vendorDomain
                          ? `Keine E-Mails von @${customer.vendorDomain}`
                          : 'Bitte Vendor-Domain in den Einstellungen konfigurieren'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Invoices Tab */}
              {activeTab === 'invoices' && (
                <div className="space-y-4">
                  {/* Documents grouped by invoice */}
                  {invoices.length > 0 ? (
                    invoices.map(invoice => {
                      const invoiceDocs = documents.filter(d => d.processedInvoiceId === invoice.id);
                      return (
                        <div
                          key={invoice.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(invoice.status)}
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {invoice.emailSubject}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {invoice.senderName} &lt;{invoice.senderEmail}&gt;
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-xs px-2 py-1 rounded ${
                                invoice.status === 'processed' ? 'bg-green-100 text-green-700' :
                                invoice.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                                invoice.status === 'failed' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {getStatusText(invoice.status)}
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDate(invoice.receivedAt)}
                              </p>
                            </div>
                          </div>
                          {invoiceDocs.length > 0 && (
                            <div className="p-3 bg-white dark:bg-gray-800 space-y-2">
                              {invoiceDocs.map(doc => (
                                <div
                                  key={doc.id}
                                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText size={16} className="text-gray-400" />
                                    <span className="text-sm">{doc.originalFilename}</span>
                                  </div>
                                  <span className="text-xs text-gray-500">{formatSize(doc.size)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {invoice.errorMessage && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                              {invoice.errorMessage}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-16 text-gray-500">
                      <FileText size={64} className="mx-auto mb-4 opacity-30" />
                      <p className="text-lg">Keine Belege gefunden</p>
                      <p className="text-sm mt-2">
                        Belege werden automatisch aus dem Rechnungs-Postfach importiert
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="max-w-xl space-y-6">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isVendor}
                        onChange={(e) => setIsVendor(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Als Lieferant markieren
                        </p>
                        <p className="text-sm text-gray-500">
                          Aktiviert den Lieferanten-Hub und E-Mail-Zuordnung
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Globe size={16} className="inline mr-1" />
                      Vendor-Domain
                    </label>
                    <input
                      type="text"
                      value={vendorDomain}
                      onChange={(e) => setVendorDomain(e.target.value)}
                      placeholder="z.B. elovade.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Alle E-Mails von @{vendorDomain || 'domain.com'} werden diesem Lieferanten zugeordnet
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notizen
                    </label>
                    <textarea
                      value={vendorNotes}
                      onChange={(e) => setVendorNotes(e.target.value)}
                      rows={4}
                      placeholder="Interne Notizen zum Lieferanten..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                    />
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? 'Speichern...' : 'Einstellungen speichern'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
