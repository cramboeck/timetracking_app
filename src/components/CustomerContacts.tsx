import { useState, useEffect } from 'react';
import { X, Plus, Mail, Send, Trash2, Edit2, Check, UserCheck, UserX, Users } from 'lucide-react';
import { Customer, CustomerContact } from '../types';
import { ticketsApi } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface CustomerContactsProps {
  isOpen: boolean;
  customer: Customer;
  onClose: () => void;
}

export const CustomerContacts = ({ isOpen, customer, onClose }: CustomerContactsProps) => {
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/Edit contact
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formCanCreateTickets, setFormCanCreateTickets] = useState(true);
  const [formCanViewAllTickets, setFormCanViewAllTickets] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteContact, setDeleteContact] = useState<CustomerContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Invite sending
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen, customer.id]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ticketsApi.getContacts(customer.id);
      setContacts(response.data || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError('Fehler beim Laden der Kontakte');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (contact?: CustomerContact) => {
    if (contact) {
      setEditingContact(contact);
      setFormName(contact.name);
      setFormEmail(contact.email);
      setFormIsPrimary(contact.isPrimary || false);
      setFormCanCreateTickets(contact.canCreateTickets ?? true);
      setFormCanViewAllTickets(contact.canViewAllTickets ?? false);
    } else {
      setEditingContact(null);
      setFormName('');
      setFormEmail('');
      setFormIsPrimary(false);
      setFormCanCreateTickets(true);
      setFormCanViewAllTickets(false);
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingContact(null);
    setFormName('');
    setFormEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) return;

    try {
      setSaving(true);
      if (editingContact) {
        // Update
        const response = await ticketsApi.updateContact(customer.id, editingContact.id, {
          name: formName.trim(),
          email: formEmail.trim(),
          isPrimary: formIsPrimary,
          canCreateTickets: formCanCreateTickets,
          canViewAllTickets: formCanViewAllTickets,
        });
        setContacts(prev => prev.map(c => c.id === editingContact.id ? response.data : c));
      } else {
        // Create
        const response = await ticketsApi.createContact(customer.id, {
          name: formName.trim(),
          email: formEmail.trim(),
          isPrimary: formIsPrimary,
          canCreateTickets: formCanCreateTickets,
          canViewAllTickets: formCanViewAllTickets,
        });
        setContacts(prev => [...prev, response.data]);
      }
      closeForm();
    } catch (err) {
      console.error('Failed to save contact:', err);
      alert('Fehler beim Speichern des Kontakts');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteContact) return;

    try {
      setDeleting(true);
      await ticketsApi.deleteContact(customer.id, deleteContact.id);
      setContacts(prev => prev.filter(c => c.id !== deleteContact.id));
      setDeleteContact(null);
    } catch (err) {
      console.error('Failed to delete contact:', err);
      alert('Fehler beim Löschen des Kontakts');
    } finally {
      setDeleting(false);
    }
  };

  const handleSendInvite = async (contact: CustomerContact) => {
    try {
      setSendingInvite(contact.id);
      await ticketsApi.sendContactInvite(customer.id, contact.id);
      setInviteSuccess(contact.id);
      setTimeout(() => setInviteSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to send invite:', err);
      alert('Fehler beim Senden der Einladung');
    } finally {
      setSendingInvite(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: customer.color }}
            >
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Kontakte verwalten
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {customer.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">
              <p>{error}</p>
              <button onClick={loadContacts} className="mt-2 text-blue-600 hover:underline">
                Erneut versuchen
              </button>
            </div>
          ) : showForm ? (
            /* Add/Edit Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="Max Mustermann"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  E-Mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  placeholder="max@firma.de"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsPrimary}
                    onChange={(e) => setFormIsPrimary(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">Hauptkontakt</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Dieser Kontakt ist der primäre Ansprechpartner
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCanCreateTickets}
                    onChange={(e) => setFormCanCreateTickets(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">Kann Tickets erstellen</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Erlaubt das Erstellen neuer Support-Tickets
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCanViewAllTickets}
                    onChange={(e) => setFormCanViewAllTickets(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">Kann alle Tickets sehen</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Sieht alle Tickets des Unternehmens, nicht nur eigene
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving || !formName.trim() || !formEmail.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {saving ? 'Speichern...' : editingContact ? 'Aktualisieren' : 'Erstellen'}
                </button>
              </div>
            </form>
          ) : (
            /* Contact List */
            <div className="space-y-4">
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Users size={48} className="mx-auto mb-3 opacity-50" />
                  <p>Noch keine Kontakte vorhanden</p>
                  <p className="text-sm mt-1">
                    Füge Kontakte hinzu, um ihnen Zugang zum Kundenportal zu geben
                  </p>
                </div>
              ) : (
                contacts.map(contact => (
                  <div
                    key={contact.id}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {contact.name}
                          </span>
                          {contact.isPrimary && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                              Hauptkontakt
                            </span>
                          )}
                          {contact.isActivated ? (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <UserCheck size={12} />
                              Aktiviert
                            </span>
                          ) : (
                            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <UserX size={12} />
                              Nicht aktiviert
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <Mail size={14} />
                          {contact.email}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {contact.canCreateTickets && (
                            <span className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                              Kann Tickets erstellen
                            </span>
                          )}
                          {contact.canViewAllTickets && (
                            <span className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded">
                              Sieht alle Tickets
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!contact.isActivated && (
                          <button
                            onClick={() => handleSendInvite(contact)}
                            disabled={sendingInvite === contact.id}
                            className={`p-2 rounded-lg transition-colors ${
                              inviteSuccess === contact.id
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                            title="Einladung senden"
                          >
                            {sendingInvite === contact.id ? (
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            ) : inviteSuccess === contact.id ? (
                              <Check size={18} />
                            ) : (
                              <Send size={18} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => openForm(contact)}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-400"
                          title="Bearbeiten"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => setDeleteContact(contact)}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600"
                          title="Löschen"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && !loading && !error && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => openForm()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              <Plus size={20} />
              Kontakt hinzufügen
            </button>
          </div>
        )}

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={!!deleteContact}
          onClose={() => setDeleteContact(null)}
          onConfirm={handleDelete}
          title="Kontakt löschen"
          message={`Möchtest du den Kontakt "${deleteContact?.name}" wirklich löschen? Der Zugang zum Kundenportal wird entfernt.`}
          confirmText={deleting ? 'Löschen...' : 'Löschen'}
          variant="danger"
        />
      </div>
    </div>
  );
};
