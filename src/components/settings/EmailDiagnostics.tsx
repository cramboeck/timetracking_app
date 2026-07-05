import { useState, useEffect } from 'react';
import {
  Mail, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Send, Users, MessageSquare, Clock, Info, Shield
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { Button } from '../ui/Button';
import { useToast } from '../../contexts/UIContext';

interface EmailDiagnosis {
  emailProvider: {
    provider: string;
    connected: boolean;
    error?: string;
    testMode: boolean;
    testRecipient?: string;
  };
  issues: {
    ticketsWithoutContact: number;
    contactsWithoutEmail: number;
    notificationsDisabled: {
      created: number;
      statusChange: number;
      reply: number;
      totalContacts: number;
    };
  };
  recentTicketEmails: Array<{
    email_type: string;
    status: string;
    count: number;
    last_sent: string;
  }>;
  recentFailures: Array<{
    email_type: string;
    recipient_email: string;
    error_message: string;
    created_at: string;
  }>;
  sampleTickets: Array<{
    ticketNumber: string;
    hasContact: boolean;
    contactEmail: string | null;
    notifyStatusChange: boolean;
    notifyReply: boolean;
    notifyCreated: boolean;
  }>;
  recommendations: string[];
}

export const EmailDiagnostics = () => {
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [diagnosis, setDiagnosis] = useState<EmailDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.diagnoseEmail();
      setDiagnosis(data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Diagnose');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnosis();
  }, []);

  const handleSendTestEmail = async () => {
    setSending(true);
    try {
      const result = await adminApi.sendTestEmail();
      if (result.success) {
        showToast(result.message || 'Test-E-Mail wurde gesendet', 'success');
      } else {
        showToast(result.error || 'Fehler beim Senden', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Senden der Test-E-Mail', 'error');
    } finally {
      setSending(false);
    }
  };

  const getStatusIcon = (connected: boolean) => {
    if (connected) {
      return <CheckCircle size={20} className="text-green-500" />;
    }
    return <XCircle size={20} className="text-red-500" />;
  };

  const getRecommendationIcon = (text: string) => {
    if (text.startsWith('KRITISCH:')) {
      return <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />;
    }
    if (text.startsWith('WARNUNG:')) {
      return <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />;
    }
    if (text.startsWith('INFO:')) {
      return <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />;
    }
    if (text.startsWith('OK:')) {
      return <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />;
    }
    return <Info size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />;
  };

  const getRecommendationStyle = (text: string) => {
    if (text.startsWith('KRITISCH:')) {
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
    }
    if (text.startsWith('WARNUNG:')) {
      return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200';
    }
    if (text.startsWith('INFO:')) {
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
    }
    if (text.startsWith('OK:')) {
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
    }
    return 'bg-gray-50 dark:bg-dark-50 border-gray-200 dark:border-dark-200 text-gray-800 dark:text-gray-200';
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 dark:text-dark-400">Diagnose wird geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-red-200 dark:border-red-800 p-6">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <XCircle size={24} />
            <div>
              <p className="font-medium">Fehler beim Laden der E-Mail-Diagnose</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadDiagnosis}
            icon={<RefreshCw size={18} />}
            className="mt-4"
          >
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  if (!diagnosis) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-light dark:bg-accent-lighter/10 rounded-lg">
            <Mail size={24} className="text-accent-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">E-Mail-Diagnose</h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Status und Problemanalyse der E-Mail-Funktionen
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={loadDiagnosis}
          icon={<RefreshCw size={18} />}
          disabled={loading}
        >
          Aktualisieren
        </Button>
      </div>

      {/* Provider Status */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield size={20} className="text-accent-primary" />
            Provider-Status
          </h3>
          <Button
            variant="primary"
            onClick={handleSendTestEmail}
            icon={sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={18} />}
            disabled={!diagnosis.emailProvider.connected || sending}
          >
            {sending ? 'Sende...' : 'Test-E-Mail senden'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Connection Status */}
          <div className={`p-4 rounded-lg border ${
            diagnosis.emailProvider.connected
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-3">
              {getStatusIcon(diagnosis.emailProvider.connected)}
              <div>
                <p className={`font-medium ${
                  diagnosis.emailProvider.connected
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}>
                  {diagnosis.emailProvider.connected ? 'Verbunden' : 'Nicht verbunden'}
                </p>
                <p className={`text-sm ${
                  diagnosis.emailProvider.connected
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  Provider: {diagnosis.emailProvider.provider || 'Keiner'}
                </p>
              </div>
            </div>
            {diagnosis.emailProvider.error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {diagnosis.emailProvider.error}
              </p>
            )}
          </div>

          {/* Test Mode Warning */}
          {diagnosis.emailProvider.testMode && (
            <div className="p-4 rounded-lg border bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-orange-500" />
                <div>
                  <p className="font-medium text-orange-800 dark:text-orange-200">
                    Test-Modus aktiv
                  </p>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    Alle E-Mails gehen an: {diagnosis.emailProvider.testRecipient || 'nicht konfiguriert'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Issues */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-orange-500" />
          Erkannte Probleme
        </h3>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Tickets without Contact */}
          <div className={`p-4 rounded-lg border ${
            diagnosis.issues.ticketsWithoutContact > 0
              ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              : 'bg-gray-50 dark:bg-dark-50 border-gray-200 dark:border-dark-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={18} className={
                diagnosis.issues.ticketsWithoutContact > 0 ? 'text-orange-500' : 'text-gray-400'
              } />
              <span className={`font-medium ${
                diagnosis.issues.ticketsWithoutContact > 0
                  ? 'text-orange-800 dark:text-orange-200'
                  : 'text-gray-700 dark:text-dark-500'
              }`}>
                Tickets ohne Kontakt
              </span>
            </div>
            <p className={`text-2xl font-bold ${
              diagnosis.issues.ticketsWithoutContact > 0
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-600 dark:text-dark-400'
            }`}>
              {diagnosis.issues.ticketsWithoutContact}
            </p>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
              Letzte 30 Tage
            </p>
          </div>

          {/* Contacts without Email */}
          <div className={`p-4 rounded-lg border ${
            diagnosis.issues.contactsWithoutEmail > 0
              ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              : 'bg-gray-50 dark:bg-dark-50 border-gray-200 dark:border-dark-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className={
                diagnosis.issues.contactsWithoutEmail > 0 ? 'text-orange-500' : 'text-gray-400'
              } />
              <span className={`font-medium ${
                diagnosis.issues.contactsWithoutEmail > 0
                  ? 'text-orange-800 dark:text-orange-200'
                  : 'text-gray-700 dark:text-dark-500'
              }`}>
                Kontakte ohne E-Mail
              </span>
            </div>
            <p className={`text-2xl font-bold ${
              diagnosis.issues.contactsWithoutEmail > 0
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-600 dark:text-dark-400'
            }`}>
              {diagnosis.issues.contactsWithoutEmail}
            </p>
          </div>

          {/* Notifications Disabled */}
          <div className="p-4 rounded-lg border bg-gray-50 dark:bg-dark-50 border-gray-200 dark:border-dark-200">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={18} className="text-gray-400" />
              <span className="font-medium text-gray-700 dark:text-dark-500">
                Benachrichtigungen deaktiviert
              </span>
            </div>
            <div className="space-y-1 text-sm text-gray-600 dark:text-dark-400">
              <div className="flex justify-between">
                <span>Erstellt:</span>
                <span>{diagnosis.issues.notificationsDisabled.created}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span>{diagnosis.issues.notificationsDisabled.statusChange}</span>
              </div>
              <div className="flex justify-between">
                <span>Antwort:</span>
                <span>{diagnosis.issues.notificationsDisabled.reply}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-2 pt-2 border-t border-gray-200 dark:border-dark-200">
              von {diagnosis.issues.notificationsDisabled.totalContacts} Kontakten
            </p>
          </div>
        </div>
      </div>

      {/* Recent Failures */}
      {diagnosis.recentFailures.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-red-200 dark:border-red-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <XCircle size={20} className="text-red-500" />
            Letzte Fehler (7 Tage)
          </h3>

          <div className="space-y-3">
            {diagnosis.recentFailures.map((failure, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-red-800 dark:text-red-200">
                    {failure.email_type}
                  </span>
                  <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(failure.created_at).toLocaleString('de-DE')}
                  </span>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mb-1">
                  An: {failure.recipient_email}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-900/40 rounded px-2 py-1">
                  {failure.error_message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Ticket Emails */}
      {diagnosis.recentTicketEmails.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Mail size={20} className="text-accent-primary" />
            Ticket-E-Mails (7 Tage)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Typ</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Status</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Anzahl</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Zuletzt</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.recentTicketEmails.map((email, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-100 dark:border-dark-200 last:border-0"
                  >
                    <td className="py-2 px-3 text-gray-900 dark:text-white">
                      {email.email_type}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        email.status === 'sent'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {email.status === 'sent' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {email.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                      {email.count}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-500 dark:text-dark-400">
                      {email.last_sent ? new Date(email.last_sent).toLocaleString('de-DE') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Info size={20} className="text-blue-500" />
          Empfehlungen
        </h3>

        <div className="space-y-3">
          {diagnosis.recommendations.map((rec, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border flex items-start gap-3 ${getRecommendationStyle(rec)}`}
            >
              {getRecommendationIcon(rec)}
              <p className="text-sm flex-1">
                {rec.replace(/^(KRITISCH|WARNUNG|INFO|OK): /, '')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sample Tickets */}
      {diagnosis.sampleTickets.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <MessageSquare size={20} className="text-accent-primary" />
            Beispiel-Tickets
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Ticket</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Kontakt</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-dark-400">E-Mail</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-dark-400">Benachrichtigungen</th>
                </tr>
              </thead>
              <tbody>
                {diagnosis.sampleTickets.map((ticket, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-100 dark:border-dark-200 last:border-0"
                  >
                    <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">
                      {ticket.ticketNumber}
                    </td>
                    <td className="py-2 px-3">
                      {ticket.hasContact ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <XCircle size={16} className="text-red-500" />
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-600 dark:text-dark-400">
                      {ticket.contactEmail || <span className="text-red-500">-</span>}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex justify-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          ticket.notifyCreated
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
                        }`}>
                          Neu
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          ticket.notifyStatusChange
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
                        }`}>
                          Status
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          ticket.notifyReply
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
                        }`}>
                          Antwort
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
