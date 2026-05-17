import { useState, useEffect } from 'react';
import { X, Plus, Mail, Send, Trash2, Edit2, Check, UserCheck, UserX, Users, Bell, Key, Eye, EyeOff } from 'lucide-react';
import { Customer, CustomerContact } from '../types';
import { ticketsApi } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, IconButton } from './ui/Button';

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
  const [formCanViewDevices, setFormCanViewDevices] = useState(false);
  const [formCanViewInvoices, setFormCanViewInvoices] = useState(false);
  const [formCanViewQuotes, setFormCanViewQuotes] = useState(false);
  const [formNotifyTicketCreated, setFormNotifyTicketCreated] = useState(true);
  const [formNotifyTicketStatusChanged, setFormNotifyTicketStatusChanged] = useState(true);
  const [formNotifyTicketReply, setFormNotifyTicketReply] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteContact, setDeleteContact] = useState<CustomerContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Invite sending
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Password setting
  const [passwordContact, setPasswordContact] = useState<CustomerContact | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

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
      setFormCanViewDevices(contact.canViewDevices ?? false);
      setFormCanViewInvoices(contact.canViewInvoices ?? false);
      setFormCanViewQuotes(contact.canViewQuotes ?? false);
      setFormNotifyTicketCreated(contact.notifyTicketCreated ?? true);
      setFormNotifyTicketStatusChanged(contact.notifyTicketStatusChanged ?? true);
      setFormNotifyTicketReply(contact.notifyTicketReply ?? true);
    } else {
      setEditingContact(null);
      setFormName('');
      setFormEmail('');
      setFormIsPrimary(false);
      setFormCanCreateTickets(true);
      setFormCanViewAllTickets(false);
      setFormCanViewDevices(false);
      setFormCanViewInvoices(false);
      setFormCanViewQuotes(false);
      setFormNotifyTicketCreated(true);
      setFormNotifyTicketStatusChanged(true);
      setFormNotifyTicketReply(true);
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
          canViewDevices: formCanViewDevices,
          canViewInvoices: formCanViewInvoices,
          canViewQuotes: formCanViewQuotes,
          notifyTicketCreated: formNotifyTicketCreated,
          notifyTicketStatusChanged: formNotifyTicketStatusChanged,
          notifyTicketReply: formNotifyTicketReply,
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
          canViewDevices: formCanViewDevices,
          canViewInvoices: formCanViewInvoices,
          canViewQuotes: formCanViewQuotes,
          notifyTicketCreated: formNotifyTicketCreated,
          notifyTicketStatusChanged: formNotifyTicketStatusChanged,
          notifyTicketReply: formNotifyTicketReply,
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

  const handleSetPassword = async () => {
    if (!passwordContact || !newPassword || newPassword.length < 8) return;

    try {
      setSettingPassword(true);
      await ticketsApi.setContactPassword(customer.id, passwordContact.id, newPassword);
      // Reload contacts to update the isActivated status
      await loadContacts();
      setPasswordContact(null);
      setNewPassword('');
      setShowPassword(false);
    } catch (err) {
      console.error('Failed to set password:', err);
      alert('Fehler beim Setzen des Passworts');
    } finally {
      setSettingPassword(false);
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
          <IconButton
            onClick={onClose}
            icon={<X size={20} />}
            tooltip="Schließen"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">
              <p>{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadContacts}
                className="mt-2"
              >
                Erneut versuchen
              </Button>
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

                {/* Devices permission (Support feature) */}
                {customer.ninjarmmOrganizationId && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanViewDevices}
                      onChange={(e) => setFormCanViewDevices(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Kann Geräte sehen</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Sieht alle Geräte des Unternehmens im Portal
                      </p>
                    </div>
                  </label>
                )}

                {/* Invoices permission (Business feature) */}
                {customer.sevdeskCustomerId && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanViewInvoices}
                      onChange={(e) => setFormCanViewInvoices(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Kann Rechnungen sehen</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Sieht alle Rechnungen des Unternehmens im Portal
                      </p>
                    </div>
                  </label>
                )}

                {/* Quotes permission (Business feature) */}
                {customer.sevdeskCustomerId && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanViewQuotes}
                      onChange={(e) => setFormCanViewQuotes(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Kann Angebote sehen</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Sieht alle Angebote des Unternehmens im Portal
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Email Notification Preferences */}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Bell size={16} className="text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    E-Mail-Benachrichtigungen
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyTicketCreated}
                      onChange={(e) => setFormNotifyTicketCreated(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Ticket erstellt</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Bestätigung bei Ticket-Erstellung
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyTicketStatusChanged}
                      onChange={(e) => setFormNotifyTicketStatusChanged(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Status geändert</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Bei Statusänderungen des Tickets
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyTicketReply}
                      onChange={(e) => setFormNotifyTicketReply(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">Neue Antwort</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Bei neuen Antworten auf das Ticket
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button
                  type="button"
                  onClick={closeForm}
                  variant="secondary"
                >
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={!formName.trim() || !formEmail.trim()}
                  loading={saving}
                  variant="primary"
                >
                  {editingContact ? 'Aktualisieren' : 'Erstellen'}
                </Button>
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
                            <span className="text-xs bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-300 px-2 py-0.5 rounded-full">
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
                          {contact.canViewDevices && (
                            <span className="bg-accent-lighter dark:bg-blue-900/30 text-accent-dark dark:text-blue-300 px-2 py-0.5 rounded">
                              Geräte
                            </span>
                          )}
                          {contact.canViewInvoices && (
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                              Rechnungen
                            </span>
                          )}
                          {contact.canViewQuotes && (
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                              Angebote
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!contact.isActivated && (
                          <>
                            <IconButton
                              onClick={() => handleSendInvite(contact)}
                              disabled={sendingInvite === contact.id}
                              icon={
                                sendingInvite === contact.id ? (
                                  <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                                ) : inviteSuccess === contact.id ? (
                                  <Check size={18} />
                                ) : (
                                  <Send size={18} />
                                )
                              }
                              variant={inviteSuccess === contact.id ? 'success' : 'default'}
                              tooltip="Einladung senden"
                            />
                            <IconButton
                              onClick={() => setPasswordContact(contact)}
                              icon={<Key size={18} />}
                              variant="warning"
                              tooltip="Passwort setzen"
                            />
                          </>
                        )}
                        <IconButton
                          onClick={() => openForm(contact)}
                          icon={<Edit2 size={18} />}
                          tooltip="Bearbeiten"
                        />
                        <IconButton
                          onClick={() => setDeleteContact(contact)}
                          icon={<Trash2 size={18} />}
                          variant="danger"
                          tooltip="Löschen"
                        />
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
            <Button
              onClick={() => openForm()}
              variant="primary"
              icon={<Plus size={20} />}
              fullWidth
            >
              Kontakt hinzufügen
            </Button>
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

        {/* Set Password Dialog */}
        {passwordContact && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setPasswordContact(null); setNewPassword(''); setShowPassword(false); }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Key size={20} className="text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Passwort setzen
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {passwordContact.name}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSetPassword(); }} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Neues Passwort
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mindestens 8 Zeichen"
                      className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                      minLength={8}
                    />
                    <IconButton
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      icon={showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      tooltip={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Das Passwort muss mindestens 8 Zeichen lang sein.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={() => { setPasswordContact(null); setNewPassword(''); setShowPassword(false); }}
                    variant="outline"
                    className="flex-1"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="submit"
                    disabled={newPassword.length < 8}
                    loading={settingPassword}
                    variant="warning"
                    className="flex-1"
                  >
                    Passwort setzen
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
