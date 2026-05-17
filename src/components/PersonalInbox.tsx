import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Loader2, AlertTriangle, RefreshCw, Users, MessageSquare,
  CheckCircle, Paperclip, Clock, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, Search
} from 'lucide-react';
import { microsoft365Api, customersApi, SupportEmail } from '../services/api';
import { UnknownCustomerDialog } from './UnknownCustomerDialog';
import { Button, IconButton } from './ui/Button';
import { sanitizeHtml } from '../utils/sanitize';

interface PersonalEmail extends SupportEmail {
  matchedCustomer?: {
    id: string;
    name: string;
    matchType: string;
  } | null;
}

interface PersonalInboxProps {
  onEmailSaved?: (interactionId: string, customerId: string) => void;
}

export const PersonalInbox: React.FC<PersonalInboxProps> = ({ onEmailSaved }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [emails, setEmails] = useState<PersonalEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<PersonalEmail | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Unknown customer dialog state
  const [showUnknownCustomerDialog, setShowUnknownCustomerDialog] = useState(false);
  const [senderInfo, setSenderInfo] = useState<{
    email: string;
    name: string;
    domain: string | null;
  } | null>(null);

  const loadEmails = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await microsoft365Api.getPersonalEmails({
        includeRead: showRead,
        limit: 50,
      });
      if (response.success) {
        setEmails(response.data || []);
        setUserEmail(response.userEmail || '');
      } else {
        setError(response.error || 'Fehler beim Laden der E-Mails');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [showRead]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  // Save email as interaction
  const handleSaveAsInteraction = async (customerId?: string) => {
    if (!selectedEmail) return;

    setSaving(true);
    try {
      const response = await microsoft365Api.savePersonalEmailAsInteraction(
        selectedEmail.id,
        customerId
      );

      if (response.success) {
        if (response.alreadyExists) {
          alert('Diese E-Mail wurde bereits als Interaktion gespeichert.');
        } else if (response.data) {
          alert(`E-Mail wurde als Interaktion bei "${response.data.customerName}" gespeichert.`);
          onEmailSaved?.(response.data.interactionId, response.data.customerId);
          await loadEmails();
        }
        setShowUnknownCustomerDialog(false);
      } else if (response.requiresCustomer) {
        // Need to select customer first
        if (response.sender) {
          setSenderInfo(response.sender);
        }
        setShowUnknownCustomerDialog(true);
      } else {
        alert(response.error || 'Fehler beim Speichern der Interaktion');
      }
    } catch (err: any) {
      alert(err.message || 'Fehler beim Speichern der Interaktion');
    } finally {
      setSaving(false);
    }
  };

  // Handler: Select existing customer
  const handleSelectCustomer = async (customerId: string) => {
    setShowUnknownCustomerDialog(false);
    await handleSaveAsInteraction(customerId);
  };

  // Handler: Create new customer
  const handleCreateCustomer = async (customerData: {
    name: string;
    email?: string;
    domain?: string;
  }) => {
    try {
      const newCustomer = await customersApi.create({
        name: customerData.name,
        email: customerData.email,
        website: customerData.domain ? `https://${customerData.domain}` : undefined,
        isActive: true,
      });
      setShowUnknownCustomerDialog(false);
      await handleSaveAsInteraction(newCustomer.id);
    } catch (err: any) {
      alert(err.message || 'Fehler beim Erstellen des Kunden');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // Filter emails by search query
  const filteredEmails = emails.filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject.toLowerCase().includes(query) ||
      email.from.email.toLowerCase().includes(query) ||
      email.from.name.toLowerCase().includes(query) ||
      email.bodyPreview.toLowerCase().includes(query) ||
      email.matchedCustomer?.name.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent-primary" size={32} />
      </div>
    );
  }

  if (error && !emails.length) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={48} />
          <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Fehler beim Laden
          </h3>
          <p className="text-amber-700 dark:text-amber-300 mb-4">
            {error}
          </p>
          <Button onClick={loadEmails} variant="primary">
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="text-accent-primary" />
            Mein Posteingang
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            {userEmail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
            <input
              type="checkbox"
              checked={showRead}
              onChange={(e) => setShowRead(e.target.checked)}
              className="rounded border-gray-300 dark:border-dark-border"
            />
            Gelesene anzeigen
          </label>
          <IconButton
            icon={<RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />}
            onClick={loadEmails}
            disabled={refreshing}
            tooltip="Aktualisieren"
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="E-Mails durchsuchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-300 rounded-lg
                     bg-white dark:bg-dark-100 text-gray-900 dark:text-white
                     focus:ring-2 focus:ring-accent-primary focus:border-transparent"
        />
      </div>

      {/* Email List & Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Email List */}
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
          <div className="max-h-[50vh] md:max-h-[500px] overflow-y-auto divide-y divide-gray-100 dark:divide-dark-200 scroll-touch touch-manipulation">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                <Mail size={48} className="mx-auto mb-3 opacity-30" />
                <p>Keine E-Mails gefunden</p>
              </div>
            ) : (
              filteredEmails.map(email => (
                <div
                  key={email.id}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedEmail?.id === email.id
                      ? 'bg-accent-primary/10 border-l-4 border-accent-primary'
                      : 'hover:bg-gray-50 dark:hover:bg-dark-200 border-l-4 border-transparent'
                  } ${!email.isRead ? 'bg-accent-light/50 dark:bg-accent-primary/40/10' : ''}`}
                  onClick={() => setSelectedEmail(email)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium truncate ${!email.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-dark-400'}`}>
                          {email.from.name || email.from.email}
                        </span>
                        {email.hasAttachments && (
                          <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-sm truncate ${!email.isRead ? 'font-medium text-gray-800 dark:text-dark-500' : 'text-gray-600 dark:text-dark-400'}`}>
                        {email.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">
                          {formatDate(email.receivedDateTime)}
                        </span>
                        {email.matchedCustomer && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {email.matchedCustomer.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Email Detail */}
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
          {selectedEmail ? (
            <div className="flex flex-col h-full">
              {/* Email Header */}
              <div className="p-4 border-b border-gray-200 dark:border-dark-300">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  {selectedEmail.subject}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
                  <span className="font-medium">{selectedEmail.from.name}</span>
                  <span>&lt;{selectedEmail.from.email}&gt;</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Clock size={14} className="text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {new Date(selectedEmail.receivedDateTime).toLocaleString('de-DE')}
                  </span>
                  {selectedEmail.matchedCustomer && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                      <Users size={12} />
                      {selectedEmail.matchedCustomer.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Email Body */}
              <div className="flex-1 p-4 overflow-y-auto max-h-[35vh] md:max-h-[250px] scroll-touch touch-manipulation">
                {expandedEmail === selectedEmail.id ? (
                  <div
                    className="prose dark:prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(selectedEmail.body?.content || selectedEmail.bodyPreview)
                    }}
                  />
                ) : (
                  <p className="text-sm text-gray-600 dark:text-dark-400">
                    {selectedEmail.bodyPreview}
                  </p>
                )}
                {selectedEmail.body?.content && (
                  <button
                    onClick={() => setExpandedEmail(
                      expandedEmail === selectedEmail.id ? null : selectedEmail.id
                    )}
                    className="mt-2 text-sm text-accent-primary hover:underline flex items-center gap-1"
                  >
                    {expandedEmail === selectedEmail.id ? (
                      <>
                        <ChevronUp size={14} />
                        Weniger anzeigen
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        Mehr anzeigen
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-200 dark:border-dark-300">
                <p className="text-xs text-gray-500 dark:text-dark-400 mb-2 flex items-center gap-1">
                  <MessageSquare size={14} />
                  Als Kunden-Interaktion speichern:
                </p>
                <Button
                  onClick={() => handleSaveAsInteraction()}
                  disabled={saving}
                  loading={saving}
                  variant="primary"
                  size="sm"
                  className="w-full"
                  icon={selectedEmail.matchedCustomer ? <CheckCircle size={16} /> : <Users size={16} />}
                >
                  {selectedEmail.matchedCustomer
                    ? `Bei "${selectedEmail.matchedCustomer.name}" speichern`
                    : 'Im CRM speichern'
                  }
                </Button>
                {!selectedEmail.matchedCustomer && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Kein Kunde erkannt - Sie werden aufgefordert, einen Kunden auszuwählen.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-dark-400">
              <Mail size={48} className="mb-3 opacity-30" />
              <p className="text-center">
                Wählen Sie eine E-Mail aus,<br />um Details anzuzeigen
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-accent-light dark:bg-accent-primary/20 rounded-lg p-4 border border-accent-primary/30 dark:border-accent-primary/40">
        <div className="flex items-start gap-3">
          <MessageSquare className="text-accent-primary dark:text-accent-primary flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-medium text-accent-dark dark:text-accent-primary">
              E-Mails als Interaktionen speichern
            </h4>
            <p className="text-sm text-accent-dark dark:text-accent-primary mt-1">
              Speichern Sie wichtige E-Mails direkt im CRM, um die komplette Kommunikationshistorie
              mit Ihren Kunden zu dokumentieren. Die E-Mails erscheinen dann in der Timeline des Kunden.
            </p>
          </div>
        </div>
      </div>

      {/* Unknown Customer Dialog */}
      {showUnknownCustomerDialog && senderInfo && (
        <UnknownCustomerDialog
          isOpen={showUnknownCustomerDialog}
          onClose={() => setShowUnknownCustomerDialog(false)}
          onSelectCustomer={handleSelectCustomer}
          onCreateCustomer={handleCreateCustomer}
          senderEmail={senderInfo.email}
          senderName={senderInfo.name}
          senderDomain={senderInfo.domain}
        />
      )}
    </div>
  );
};
