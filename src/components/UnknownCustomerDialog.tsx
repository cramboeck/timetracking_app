import { useState, useEffect } from 'react';
import { X, UserPlus, Users, ArrowRight, Globe, Loader2, AlertTriangle, Building2, ExternalLink } from 'lucide-react';
import { Customer } from '../types';
import { customersApi } from '../services/api';
import { Button, IconButton } from './ui';

interface UnknownCustomerDialogProps {
  isOpen: boolean;
  senderEmail: string;
  senderName: string;
  senderDomain: string | null;
  onCustomerSelected: (customerId: string) => void;
  onNavigateToCreateCustomer: () => void;
  onContinueWithoutCustomer: () => void;
  onCancel: () => void;
}

export const UnknownCustomerDialog = ({
  isOpen,
  senderEmail,
  senderName,
  senderDomain,
  onCustomerSelected,
  onNavigateToCreateCustomer,
  onContinueWithoutCustomer,
  onCancel,
}: UnknownCustomerDialogProps) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // View state: 'options' | 'select'
  const [view, setView] = useState<'options' | 'select'>('options');

  // Customer selection
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [saveDomainForCustomer, setSaveDomainForCustomer] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      setView('options');
      setSelectedCustomerId('');
      setSaveDomainForCustomer(true);
    }
  }, [isOpen, senderDomain, senderName, senderEmail]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const response = await customersApi.getAll();
      setCustomers(response.data || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = async () => {
    if (!selectedCustomerId) return;

    // If saveDomain is true, add the domain to the customer
    if (saveDomainForCustomer && senderDomain) {
      try {
        await customersApi.addEmailDomain(selectedCustomerId, {
          domain: senderDomain,
          isPrimary: false,
          notes: `Automatisch hinzugefügt von Support-Inbox (${new Date().toLocaleDateString('de-DE')})`
        });
      } catch (err) {
        console.error('Failed to save domain:', err);
        // Continue anyway - domain save is optional
      }
    }

    onCustomerSelected(selectedCustomerId);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Unbekannter Absender
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Kein Kunde für diese E-Mail gefunden
                </p>
              </div>
            </div>
            <IconButton
              onClick={onCancel}
              icon={<X className="w-5 h-5" />}
              size="md"
            />
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Sender Info */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                  <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                    {senderName?.charAt(0).toUpperCase() || senderEmail?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {senderName || 'Unbekannt'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {senderEmail}
                  </p>
                  {senderDomain && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                      <Globe className="w-3 h-3" />
                      Domain: @{senderDomain}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Options View */}
            {view === 'options' && (
              <div className="space-y-3">
                {/* Option 1: Create new customer - navigates to Settings */}
                <button
                  onClick={onNavigateToCreateCustomer}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-800/30 transition-colors">
                    <UserPlus className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      Neuen Kunden anlegen
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      In den Einstellungen anlegen
                      {senderDomain && `, dann Domain @${senderDomain} zuordnen`}
                    </p>
                  </div>
                </button>

                {/* Option 2: Assign to existing customer */}
                <button
                  onClick={() => setView('select')}
                  className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-accent-primary hover:bg-accent-light dark:hover:bg-accent-primary/20 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent-lighter dark:bg-accent-primary/30 flex items-center justify-center group-hover:bg-accent-lighter dark:group-hover:bg-accent-primary/30 transition-colors">
                    <Building2 className="w-6 h-6 text-accent-primary dark:text-accent-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      Bestehendem Kunden zuordnen
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Kunde auswählen und Domain speichern
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-accent-primary" />
                </button>

                {/* Option 3: Continue without customer */}
                <button
                  onClick={onContinueWithoutCustomer}
                  className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-600 dark:text-gray-300">
                      Ohne Kunde fortfahren
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Ticket ohne Kundenzuordnung erstellen
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* Select Customer View */}
            {view === 'select' && (
              <div className="space-y-4">
                <Button
                  onClick={() => setView('options')}
                  variant="ghost"
                  size="sm"
                  icon={<ArrowRight className="w-4 h-4 rotate-180" />}
                >
                  Zurück
                </Button>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Kunde auswählen
                      </label>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">-- Kunde wählen --</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} {customer.customerNumber ? `(${customer.customerNumber})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {senderDomain && (
                      <label className="flex items-start gap-3 p-3 bg-accent-light dark:bg-accent-primary/20 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveDomainForCustomer}
                          onChange={(e) => setSaveDomainForCustomer(e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Domain @{senderDomain} speichern
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Zukünftige E-Mails von dieser Domain werden automatisch zugeordnet
                          </p>
                        </div>
                      </label>
                    )}

                    <Button
                      onClick={handleSelectCustomer}
                      disabled={!selectedCustomerId}
                      variant="primary"
                      size="lg"
                      fullWidth
                      icon={<ArrowRight className="w-4 h-4" />}
                      iconPosition="right"
                    >
                      Kunde zuordnen
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
