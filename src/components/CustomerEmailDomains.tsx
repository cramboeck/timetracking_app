import { useState, useEffect } from 'react';
import { X, Plus, Globe, Trash2, Star, Info, Loader2 } from 'lucide-react';
import { Customer, CustomerEmailDomain } from '../types';
import { customersApi } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, IconButton } from './ui/Button';
import { useToast } from '../contexts/UIContext';

interface CustomerEmailDomainsProps {
  isOpen: boolean;
  customer: Customer;
  onClose: () => void;
}

export const CustomerEmailDomains = ({ isOpen, customer, onClose }: CustomerEmailDomainsProps) => {
  const showToast = useToast();
  const [domains, setDomains] = useState<CustomerEmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add domain form
  const [showForm, setShowForm] = useState(false);
  const [formDomain, setFormDomain] = useState('');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteDomain, setDeleteDomain] = useState<CustomerEmailDomain | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDomains();
    }
  }, [isOpen, customer.id]);

  const loadDomains = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await customersApi.getEmailDomains(customer.id);
      setDomains(response.data || []);
    } catch (err) {
      console.error('Failed to load domains:', err);
      setError('Fehler beim Laden der Domains');
    } finally {
      setLoading(false);
    }
  };

  const openForm = () => {
    setFormDomain('');
    setFormIsPrimary(domains.length === 0); // First domain is primary by default
    setFormNotes('');
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormDomain('');
    setFormIsPrimary(false);
    setFormNotes('');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = formDomain.trim().toLowerCase();

    if (!domain) {
      setFormError('Bitte geben Sie eine Domain ein');
      return;
    }

    // Basic domain validation
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      setFormError('Ungültiges Domain-Format (z.B. firma.at)');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      const response = await customersApi.addEmailDomain(customer.id, {
        domain,
        isPrimary: formIsPrimary,
        notes: formNotes.trim() || undefined,
      });

      // If new domain is primary, update others
      if (formIsPrimary) {
        setDomains(prev => prev.map(d => ({ ...d, isPrimary: false })));
      }

      setDomains(prev => [...prev, response.data as unknown as CustomerEmailDomain]);
      closeForm();
    } catch (err: any) {
      console.error('Failed to add domain:', err);
      const errorMessage = err?.error || err?.message || 'Fehler beim Hinzufügen der Domain';
      setFormError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDomain) return;

    try {
      setDeleting(true);
      await customersApi.deleteEmailDomain(customer.id, deleteDomain.id);
      setDomains(prev => prev.filter(d => d.id !== deleteDomain.id));
      setDeleteDomain(null);
    } catch (err) {
      console.error('Failed to delete domain:', err);
      showToast('Fehler beim Löschen der Domain', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: customer.color + '20' }}
              >
                <Globe className="w-5 h-5" style={{ color: customer.color }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  E-Mail Domains
                </h2>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  {customer.name}
                </p>
              </div>
            </div>
            <IconButton
              icon={<X className="w-5 h-5" />}
              onClick={onClose}
              tooltip="Schließen"
            />
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Info Box */}
            <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-3 mb-4">
              <div className="flex gap-2">
                <Info className="w-5 h-5 text-accent-primary dark:text-accent-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-accent-dark dark:text-accent-primary">
                  E-Mails von diesen Domains werden automatisch diesem Kunden zugeordnet, wenn ein Ticket aus dem Support-Postfach erstellt wird.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600 dark:text-red-400">
                {error}
              </div>
            ) : (
              <>
                {/* Domain List */}
                {domains.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {domains.map((domain) => (
                      <div
                        key={domain.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-200/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Globe className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                @{domain.domain}
                              </span>
                              {domain.isPrimary && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded-full">
                                  <Star className="w-3 h-3" />
                                  Primär
                                </span>
                              )}
                            </div>
                            {domain.notes && (
                              <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                                {domain.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <IconButton
                          icon={<Trash2 className="w-4 h-4" />}
                          onClick={() => setDeleteDomain(domain)}
                          variant="danger"
                          tooltip="Domain entfernen"
                        />
                      </div>
                    ))}
                  </div>
                ) : !showForm ? (
                  <div className="text-center py-6 text-gray-500 dark:text-dark-400">
                    <Globe className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Noch keine E-Mail Domains zugeordnet</p>
                  </div>
                ) : null}

                {/* Add Domain Form */}
                {showForm ? (
                  <form onSubmit={handleSubmit} className="border border-gray-200 dark:border-dark-border rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                      Domain hinzufügen
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                          Domain *
                        </label>
                        <div className="flex items-center">
                          <span className="text-gray-400 mr-1">@</span>
                          <input
                            type="text"
                            value={formDomain}
                            onChange={(e) => setFormDomain(e.target.value)}
                            placeholder="firma.at"
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                          Notizen
                        </label>
                        <input
                          type="text"
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          placeholder="z.B. Hauptdomain, alte Domain..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formIsPrimary}
                          onChange={(e) => setFormIsPrimary(e.target.checked)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-dark-500">
                          Als primäre Domain markieren
                        </span>
                      </label>

                      {formError && (
                        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                          {formError}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeForm}
                      >
                        Abbrechen
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={saving}
                        loading={saving}
                      >
                        Hinzufügen
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    variant="outline"
                    onClick={openForm}
                    icon={<Plus className="w-5 h-5" />}
                    fullWidth
                    className="border-2 border-dashed"
                  >
                    Domain hinzufügen
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteDomain}
        title="Domain entfernen"
        message={`Möchten Sie die Domain "@${deleteDomain?.domain}" wirklich entfernen? E-Mails von dieser Domain werden dann nicht mehr automatisch diesem Kunden zugeordnet.`}
        confirmText="Entfernen"
        onConfirm={handleDelete}
        onClose={() => setDeleteDomain(null)}
        variant="danger"
      />
    </>
  );
};
