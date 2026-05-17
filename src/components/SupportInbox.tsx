import { useState, useEffect, useCallback } from 'react';
import {
  Mail, Loader2, AlertTriangle, RefreshCw, Ticket, Eye,
  CheckCircle, Link2, Paperclip, Clock, X, ExternalLink,
  ChevronDown, ChevronUp, AlertCircle, Users, MessageSquare
} from 'lucide-react';
import { microsoft365Api, customersApi, SupportEmail } from '../services/api';
import { UnknownCustomerDialog } from './UnknownCustomerDialog';
import { Button, IconButton } from './ui/Button';
import { sanitizeEmailHtml } from '../utils/sanitize';

interface TicketInfo {
  linked: boolean;
  ticket?: {
    ticket_id: string;
    ticket_number: string;
    title: string;
    status: string;
  };
  suggestedTicket?: {
    ticket_id: string;
    ticket_number: string;
    title: string;
    status: string;
  };
}

export const SupportInbox = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [supportMailbox, setSupportMailbox] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [emails, setEmails] = useState<SupportEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SupportEmail | null>(null);
  const [selectedTicketInfo, setSelectedTicketInfo] = useState<TicketInfo | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Unknown customer dialog state
  const [showUnknownCustomerDialog, setShowUnknownCustomerDialog] = useState(false);
  const [pendingPriority, setPendingPriority] = useState<string>('normal');
  const [senderInfo, setSenderInfo] = useState<{
    email: string;
    name: string;
    domain: string | null;
  } | null>(null);

  // Save as interaction state
  const [savingInteraction, setSavingInteraction] = useState(false);

  const loadConfig = async () => {
    try {
      const configResponse = await microsoft365Api.getConfig();
      if (configResponse.success && configResponse.data) {
        const mailbox = configResponse.data.supportMailbox || '';
        setSupportMailbox(mailbox);
        setIsConfigured(!!configResponse.data.configured && !!mailbox);
        return !!configResponse.data.configured && !!mailbox;
      }
      return false;
    } catch (err) {
      console.error('Failed to load config:', err);
      return false;
    }
  };

  const loadEmails = useCallback(async () => {
    console.log('📧 Loading support emails...');
    setRefreshing(true);
    setError(null);
    try {
      const response = await microsoft365Api.getSupportEmails({
        includeRead: showRead,
        limit: 50,
      });
      console.log('📧 Support emails response:', response);
      if (response.success) {
        setEmails(response.data || []);
      } else {
        console.error('📧 Support emails error:', response.error);
        setError(response.error || 'Fehler beim Laden der E-Mails');
      }
    } catch (err: any) {
      console.error('📧 Support emails exception:', err);
      setError(err.message || 'Fehler beim Laden der E-Mails');
    } finally {
      setRefreshing(false);
    }
  }, [showRead]);

  const loadTicketInfo = async (emailId: string) => {
    try {
      const response = await microsoft365Api.getEmailTicketInfo(emailId);
      if (response.success && response.data) {
        setSelectedTicketInfo(response.data);
      }
    } catch (err) {
      console.error('Failed to load ticket info:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const configured = await loadConfig();
      if (configured) {
        await loadEmails();
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (isConfigured) {
      loadEmails();
    }
  }, [showRead, isConfigured, loadEmails]);

  useEffect(() => {
    if (selectedEmail) {
      loadTicketInfo(selectedEmail.id);
    } else {
      setSelectedTicketInfo(null);
    }
  }, [selectedEmail]);

  const handleCreateTicket = async (priority: string = 'normal') => {
    if (!selectedEmail) return;

    setCreating(true);
    try {
      // First, check if customer exists for this email
      const lookupResponse = await microsoft365Api.lookupCustomerForEmail(selectedEmail.id);

      if (lookupResponse.success && !lookupResponse.found) {
        // No customer found - show dialog
        setPendingPriority(priority);
        setSenderInfo(lookupResponse.sender);
        setShowUnknownCustomerDialog(true);
        setCreating(false);
        return;
      }

      // Customer found or lookup failed - proceed with ticket creation
      await createTicketWithCustomer(priority);
    } catch (err: any) {
      console.error('Customer lookup error:', err);
      // On error, proceed with ticket creation anyway
      await createTicketWithCustomer(priority);
    }
  };

  const createTicketWithCustomer = async (priority: string, customerId?: string) => {
    if (!selectedEmail) return;

    setCreating(true);
    try {
      const response = await microsoft365Api.createTicketFromEmail(selectedEmail.id, {
        priority,
        customerId
      });
      if (response.success && response.data) {
        const { ticketNumber, linkedToExisting, customerName } = response.data;
        const customerInfo = customerName ? ` (Kunde: ${customerName})` : '';
        alert(
          linkedToExisting
            ? `E-Mail wurde zu bestehendem Ticket ${ticketNumber} hinzugefügt${customerInfo}`
            : `Ticket ${ticketNumber} wurde erstellt${customerInfo}`
        );
        // Reload emails and ticket info
        await loadEmails();
        await loadTicketInfo(selectedEmail.id);
      } else {
        alert(response.error || 'Fehler beim Erstellen des Tickets');
      }
    } catch (err: any) {
      alert(err.message || 'Fehler beim Erstellen des Tickets');
    } finally {
      setCreating(false);
      setShowUnknownCustomerDialog(false);
    }
  };

  // Handler: Navigate to Settings to create new customer
  const handleNavigateToCreateCustomer = () => {
    // Close dialog without creating ticket
    setShowUnknownCustomerDialog(false);

    // Build params with optional domain
    const params: Record<string, string> = { tab: 'customers' };
    if (senderInfo?.domain) {
      params.domain = senderInfo.domain;
    }

    // Dispatch custom event to navigate to settings
    window.dispatchEvent(new CustomEvent('navigate-to-view', {
      detail: {
        subView: 'settings',
        params
      }
    }));
  };

  // Handler: Select existing customer
  const handleSelectCustomer = async (customerId: string) => {
    setShowUnknownCustomerDialog(false);

    // Check if this is for interaction or ticket
    if (pendingPriority === 'interaction') {
      // Save as interaction with selected customer
      if (selectedEmail) {
        setSavingInteraction(true);
        try {
          const response = await microsoft365Api.saveEmailAsInteraction(selectedEmail.id, customerId);
          if (response.success && response.data) {
            alert(`E-Mail wurde als Interaktion bei "${response.data.customerName}" gespeichert.`);
            await loadEmails();
          } else {
            alert(response.error || 'Fehler beim Speichern der Interaktion');
          }
        } catch (err: any) {
          alert(err.message || 'Fehler beim Speichern');
        } finally {
          setSavingInteraction(false);
        }
      }
    } else {
      // Create ticket with selected customer
      await createTicketWithCustomer(pendingPriority, customerId);
    }
  };

  // Handler: Continue without customer
  const handleContinueWithoutCustomer = async () => {
    setShowUnknownCustomerDialog(false);
    // Only for ticket creation - interactions require a customer
    if (pendingPriority !== 'interaction') {
      await createTicketWithCustomer(pendingPriority);
    }
  };

  const handleLinkToTicket = async () => {
    if (!selectedEmail || !selectedTicketInfo?.suggestedTicket) return;

    setCreating(true);
    try {
      const response = await microsoft365Api.linkEmailToTicket(
        selectedEmail.id,
        selectedTicketInfo.suggestedTicket.ticket_id
      );
      if (response.success && response.data) {
        alert(`E-Mail wurde zu Ticket ${response.data.ticketNumber} hinzugefügt`);
        await loadEmails();
        await loadTicketInfo(selectedEmail.id);
      } else {
        alert(response.error || 'Fehler beim Verknüpfen');
      }
    } catch (err: any) {
      alert(err.message || 'Fehler beim Verknüpfen');
    } finally {
      setCreating(false);
    }
  };

  // Save email as CRM interaction
  const handleSaveAsInteraction = async () => {
    if (!selectedEmail) return;

    setSavingInteraction(true);
    try {
      const response = await microsoft365Api.saveEmailAsInteraction(selectedEmail.id);

      if (response.success) {
        if (response.alreadyExists) {
          alert('Diese E-Mail wurde bereits als Interaktion gespeichert.');
        } else if (response.data) {
          alert(`E-Mail wurde als Interaktion bei "${response.data.customerName}" gespeichert.`);
          await loadEmails();
        }
      } else if (response.requiresCustomer) {
        // Need to select customer first - open dialog
        const lookupResponse = await microsoft365Api.lookupCustomerForEmail(selectedEmail.id);
        if (lookupResponse.success) {
          setSenderInfo(lookupResponse.sender);
          setShowUnknownCustomerDialog(true);
          // Store action type for when customer is selected
          setPendingPriority('interaction');
        }
      } else {
        alert(response.error || 'Fehler beim Speichern der Interaktion');
      }
    } catch (err: any) {
      alert(err.message || 'Fehler beim Speichern der Interaktion');
    } finally {
      setSavingInteraction(false);
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

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high':
        return 'text-red-500';
      case 'low':
        return 'text-gray-400';
      default:
        return 'text-gray-600 dark:text-dark-400';
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
            Support-Postfach nicht konfiguriert
          </h3>
          <p className="text-amber-700 dark:text-amber-300 mb-4">
            Bitte konfigurieren Sie zuerst das Support-Postfach in den Microsoft 365 Einstellungen.
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Einstellungen → Microsoft 365 → Support-Postfach
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="text-accent-primary" />
            Support E-Mails
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Postfach: <span className="font-medium text-gray-700 dark:text-dark-500">{supportMailbox}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
            <input
              type="checkbox"
              checked={showRead}
              onChange={(e) => setShowRead(e.target.checked)}
              className="rounded border-gray-300"
            />
            Gelesene anzeigen
          </label>
          <Button
            onClick={() => loadEmails()}
            disabled={refreshing}
            icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}
          >
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-red-800 dark:text-red-200 font-medium">Fehler</p>
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Email List */}
        <div className="lg:col-span-2 bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-dark-300 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">E-Mail Eingang</h2>
            <span className="text-sm text-gray-500 dark:text-dark-400">
              {emails.length} E-Mail{emails.length !== 1 ? 's' : ''}
            </span>
          </div>

          {emails.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Mail size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Keine E-Mails</p>
              <p className="text-sm mt-1">
                {showRead ? 'Keine E-Mails im Posteingang' : 'Keine ungelesenen E-Mails'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-dark-300 max-h-[50vh] md:max-h-[600px] overflow-y-auto scroll-touch touch-manipulation">
              {emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedEmail?.id === email.id
                      ? 'bg-accent-primary/10'
                      : 'hover:bg-gray-50 dark:hover:bg-dark-200'
                  } ${!email.isRead ? 'bg-accent-light/50 dark:bg-accent-primary/40/10' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      !email.isRead
                        ? 'bg-accent-primary/20'
                        : 'bg-gray-100 dark:bg-dark-200'
                    }`}>
                      <Mail size={16} className={
                        !email.isRead ? 'text-accent-primary' : 'text-gray-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-medium truncate ${
                          !email.isRead
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-600 dark:text-dark-500'
                        }`}>
                          {email.from.name || email.from.email}
                        </span>
                        {email.importance === 'high' && (
                          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                        )}
                        {email.hasAttachments && (
                          <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-sm truncate ${
                        !email.isRead
                          ? 'text-gray-800 dark:text-dark-500 font-medium'
                          : 'text-gray-600 dark:text-dark-400'
                      }`}>
                        {email.subject}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400 mt-1 line-clamp-2">
                        {email.bodyPreview}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-dark-400 flex-shrink-0">
                      {formatDate(email.receivedDateTime)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Detail / Actions */}
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
          {selectedEmail ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-gray-200 dark:border-dark-300">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">
                    {selectedEmail.subject}
                  </h3>
                  <IconButton
                    onClick={() => setSelectedEmail(null)}
                    icon={<X size={18} />}
                    size="sm"
                    tooltip="Schliessen"
                  />
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-dark-400">
                  <p>
                    <span className="text-gray-500">Von:</span>{' '}
                    {selectedEmail.from.name} &lt;{selectedEmail.from.email}&gt;
                  </p>
                  <p className="text-xs mt-1">
                    {new Date(selectedEmail.receivedDateTime).toLocaleString('de-DE')}
                  </p>
                </div>
              </div>

              {/* Ticket Info */}
              {selectedTicketInfo && (
                <div className="p-4 border-b border-gray-200 dark:border-dark-300">
                  {selectedTicketInfo.linked && selectedTicketInfo.ticket ? (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                        <CheckCircle size={16} />
                        <span className="text-sm font-medium">Bereits verknüpft</span>
                      </div>
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        Ticket {selectedTicketInfo.ticket.ticket_number}: {selectedTicketInfo.ticket.title}
                      </p>
                    </div>
                  ) : selectedTicketInfo.suggestedTicket ? (
                    <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-accent-dark dark:text-accent-primary">
                        <Link2 size={16} />
                        <span className="text-sm font-medium">Passendes Ticket gefunden</span>
                      </div>
                      <p className="text-sm text-accent-primary dark:text-accent-primary mt-1">
                        {selectedTicketInfo.suggestedTicket.ticket_number}: {selectedTicketInfo.suggestedTicket.title}
                      </p>
                      <Button
                        onClick={handleLinkToTicket}
                        disabled={creating}
                        loading={creating}
                        fullWidth
                        size="sm"
                        className="mt-2"
                      >
                        Mit Ticket verknüpfen
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600 dark:text-dark-400">
                        Diese E-Mail ist noch mit keinem Ticket verknüpft.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Email Body */}
              <div className="flex-1 p-4 overflow-y-auto max-h-[40vh] md:max-h-[300px] scroll-touch touch-manipulation">
                <Button
                  onClick={() => setExpandedEmail(expandedEmail === selectedEmail.id ? null : selectedEmail.id)}
                  variant="ghost"
                  size="sm"
                  icon={<Eye size={14} />}
                  className="mb-2 text-accent-primary"
                >
                  {expandedEmail === selectedEmail.id ? 'Vorschau' : 'Vollständige E-Mail anzeigen'}
                  {expandedEmail === selectedEmail.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>

                {expandedEmail === selectedEmail.id ? (
                  selectedEmail.body.contentType === 'html' ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedEmail.body.content) }}
                    />
                  ) : (
                    <pre className="text-sm text-gray-600 dark:text-dark-400 whitespace-pre-wrap font-sans">
                      {selectedEmail.body.content}
                    </pre>
                  )
                ) : (
                  <p className="text-sm text-gray-600 dark:text-dark-400">
                    {selectedEmail.bodyPreview}
                  </p>
                )}
              </div>

              {/* Actions */}
              {(!selectedTicketInfo?.linked) && (
                <div className="p-4 border-t border-gray-200 dark:border-dark-300 space-y-4">
                  {/* Ticket Creation */}
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Ticket erstellen:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => handleCreateTicket('normal')}
                        disabled={creating || savingInteraction}
                        loading={creating}
                        size="sm"
                      >
                        Normal
                      </Button>
                      <Button
                        onClick={() => handleCreateTicket('high')}
                        disabled={creating || savingInteraction}
                        variant="warning"
                        size="sm"
                      >
                        Hoch
                      </Button>
                      <Button
                        onClick={() => handleCreateTicket('urgent')}
                        disabled={creating || savingInteraction}
                        variant="danger"
                        size="sm"
                      >
                        Dringend
                      </Button>
                    </div>
                  </div>

                  {/* Save as Interaction */}
                  <div className="pt-2 border-t border-gray-100 dark:border-dark-200">
                    <p className="text-xs text-gray-500 dark:text-dark-400 mb-2">Als Kunden-Interaktion speichern:</p>
                    <Button
                      onClick={handleSaveAsInteraction}
                      disabled={creating || savingInteraction}
                      loading={savingInteraction}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      icon={<MessageSquare size={16} />}
                    >
                      Im Kunden-CRM speichern
                    </Button>
                    <p className="text-xs text-gray-400 dark:text-dark-400 mt-1">
                      Die E-Mail wird automatisch dem Kunden zugeordnet und in der Timeline angezeigt.
                    </p>
                  </div>
                </div>
              )}
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

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-accent-primary/10 rounded-lg">
              <Ticket className="text-accent-primary" size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">E-Mail zu Ticket</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-dark-400">
            Wählen Sie eine E-Mail aus und erstellen Sie daraus ein Support-Ticket.
            Die E-Mail wird dem Ticket zugeordnet und alle zukünftigen Antworten
            im selben Thread werden automatisch verknüpft.
          </p>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Link2 className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Automatische Zuordnung</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-dark-400">
            E-Mails aus demselben Thread werden automatisch erkannt und können
            einfach zu bestehenden Tickets hinzugefügt werden. Die E-Mail-Historie
            wird im Ticket gespeichert.
          </p>
        </div>
      </div>

      {/* Unknown Customer Dialog */}
      <UnknownCustomerDialog
        isOpen={showUnknownCustomerDialog}
        senderEmail={senderInfo?.email || ''}
        senderName={senderInfo?.name || ''}
        senderDomain={senderInfo?.domain || null}
        onCustomerSelected={handleSelectCustomer}
        onNavigateToCreateCustomer={handleNavigateToCreateCustomer}
        onContinueWithoutCustomer={handleContinueWithoutCustomer}
        onClose={() => setShowUnknownCustomerDialog(false)}
      />
    </div>
  );
};
