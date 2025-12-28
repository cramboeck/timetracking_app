import { useState, useEffect } from 'react';
import {
  Mail, Loader2, AlertTriangle, RefreshCw, Ticket, Clock,
  CheckCircle, ArrowRight
} from 'lucide-react';
import { microsoft365Api } from '../services/api';

export const SupportInbox = () => {
  const [loading, setLoading] = useState(true);
  const [supportMailbox, setSupportMailbox] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const configResponse = await microsoft365Api.getConfig();
      if (configResponse.success && configResponse.data) {
        const mailbox = configResponse.data.supportMailbox || '';
        setSupportMailbox(mailbox);
        setIsConfigured(!!configResponse.data.configured && !!mailbox);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
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
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="text-accent-primary" />
            Support E-Mails
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Postfach: <span className="font-medium text-gray-700 dark:text-gray-300">{supportMailbox}</span>
          </p>
        </div>

        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg opacity-50 cursor-not-allowed"
        >
          <RefreshCw size={16} />
          E-Mails abrufen
        </button>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Mail className="text-blue-600 dark:text-blue-400" size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Support E-Mail Integration - Demnächst verfügbar
            </h3>
            <p className="text-blue-700 dark:text-blue-300 mb-4">
              Die Integration des Support-Postfachs wird bald aktiviert. Dann können Sie:
            </p>
            <ul className="space-y-2 text-sm text-blue-600 dark:text-blue-400">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                E-Mails aus dem Support-Postfach abrufen
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight size={16} />
                E-Mails direkt in Tickets konvertieren
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight size={16} />
                Ticket-Antworten als E-Mail senden
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight size={16} />
                E-Mail-Threads mit Tickets verknüpfen
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Preview/Placeholder Table */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-dark-300 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">E-Mail Eingang</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">0 E-Mails</span>
        </div>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Mail size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Keine E-Mails geladen</p>
          <p className="text-sm mt-1">Die E-Mail-Abruffunktion wird bald aktiviert</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-accent-primary/10 rounded-lg">
              <Ticket className="text-accent-primary" size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Ticket erstellen</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Wählen Sie eine E-Mail aus, um daraus ein Support-Ticket zu erstellen.
          </p>
          <button
            disabled
            className="w-full py-2 text-sm text-gray-400 bg-gray-100 dark:bg-dark-200 rounded-lg cursor-not-allowed"
          >
            Keine E-Mail ausgewählt
          </button>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Clock className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Automatische Verarbeitung</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Konfigurieren Sie Regeln für automatische Ticket-Erstellung.
          </p>
          <button
            disabled
            className="w-full py-2 text-sm text-gray-400 bg-gray-100 dark:bg-dark-200 rounded-lg cursor-not-allowed"
          >
            Demnächst verfügbar
          </button>
        </div>
      </div>
    </div>
  );
};
