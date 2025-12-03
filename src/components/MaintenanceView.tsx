import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, Send, Plus, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, Trash2, Edit, Eye, ChevronDown, ChevronUp,
  Users, Monitor, Bell, Filter, MoreHorizontal, FileText
} from 'lucide-react';
import {
  maintenanceApi,
  MaintenanceAnnouncement,
  MaintenanceAnnouncementCustomer,
  MaintenanceType,
  MaintenanceStatus,
  MaintenanceDashboard,
  customersApi,
  Customer
} from '../services/api';

const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  patch: 'Patch/Update',
  reboot: 'Neustart',
  security_update: 'Sicherheitsupdate',
  firmware: 'Firmware-Update',
  general: 'Allgemeine Wartung'
};

const MAINTENANCE_TYPE_ICONS: Record<MaintenanceType, string> = {
  patch: '🔧',
  reboot: '🔄',
  security_update: '🔒',
  firmware: '💾',
  general: '🛠️'
};

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  sent: 'Gesendet',
  in_progress: 'In Bearbeitung',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen'
};

const STATUS_COLORS: Record<MaintenanceStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  sent: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

// Default templates per maintenance type
const MAINTENANCE_TYPE_TEMPLATES: Record<MaintenanceType, { title: string; description: string; affectedSystems: string }> = {
  patch: {
    title: 'Patch- und Update-Installation',
    description: `Sehr geehrte Damen und Herren,

im Rahmen unserer regelmäßigen Wartungsarbeiten werden wir wichtige Sicherheits- und Systemupdates installieren.

Während der Wartungsarbeiten kann es zu kurzzeitigen Unterbrechungen kommen. Wir empfehlen, wichtige Arbeiten vor dem Wartungsfenster zu speichern.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.`,
    affectedSystems: 'Windows Server, Clients'
  },
  reboot: {
    title: 'Geplanter Systemneustart',
    description: `Sehr geehrte Damen und Herren,

zur Anwendung von installierten Updates und zur Systemoptimierung ist ein Neustart der betroffenen Systeme erforderlich.

Während des Neustarts (ca. 10-15 Minuten) sind die Systeme nicht verfügbar. Bitte speichern Sie Ihre Arbeit und melden Sie sich vor dem Wartungszeitpunkt ab.

Vielen Dank für Ihr Verständnis.`,
    affectedSystems: 'Server, Clients'
  },
  security_update: {
    title: 'Kritische Sicherheitsupdates',
    description: `Sehr geehrte Damen und Herren,

aufgrund wichtiger Sicherheitsupdates müssen wir dringend Aktualisierungen an Ihren Systemen durchführen. Diese Updates schließen bekannte Sicherheitslücken und schützen Ihre IT-Infrastruktur.

Während der Wartungsarbeiten kann es zu kurzzeitigen Einschränkungen kommen. Die Systeme werden nach Abschluss der Arbeiten automatisch wieder verfügbar sein.

Bei Fragen zur Dringlichkeit dieser Updates kontaktieren Sie uns gerne.`,
    affectedSystems: 'Firewall, Server, Endpoints'
  },
  firmware: {
    title: 'Firmware-Aktualisierung',
    description: `Sehr geehrte Damen und Herren,

wir führen eine Firmware-Aktualisierung an Ihren Netzwerkgeräten durch. Diese Updates verbessern die Stabilität, Sicherheit und Leistung der Hardware.

Während der Aktualisierung (je nach Gerät 5-30 Minuten) kann es zu Verbindungsunterbrechungen kommen.

Wir empfehlen, keine kritischen Arbeiten während des Wartungsfensters durchzuführen.`,
    affectedSystems: 'Firewall, Switches, Access Points'
  },
  general: {
    title: 'Geplante Wartungsarbeiten',
    description: `Sehr geehrte Damen und Herren,

wir führen geplante Wartungsarbeiten an Ihrer IT-Infrastruktur durch.

Während der Wartungsarbeiten kann es zu Einschränkungen bei der Systemverfügbarkeit kommen. Wir werden die Arbeiten so schnell wie möglich abschließen.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.`,
    affectedSystems: ''
  }
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Create/Edit Dialog
function AnnouncementDialog({
  announcement,
  customers,
  existingCustomerIds,
  onSave,
  onClose
}: {
  announcement?: MaintenanceAnnouncement;
  customers: Customer[];
  existingCustomerIds?: string[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const initialType = (announcement?.maintenance_type || 'general') as MaintenanceType;
  const initialTemplate = MAINTENANCE_TYPE_TEMPLATES[initialType];

  const [formData, setFormData] = useState({
    title: announcement?.title || initialTemplate.title,
    description: announcement?.description || initialTemplate.description,
    maintenanceType: initialType,
    affectedSystems: announcement?.affected_systems || initialTemplate.affectedSystems,
    scheduledStart: announcement?.scheduled_start
      ? new Date(announcement.scheduled_start).toISOString().slice(0, 16)
      : '',
    scheduledEnd: announcement?.scheduled_end
      ? new Date(announcement.scheduled_end).toISOString().slice(0, 16)
      : '',
    requireApproval: announcement?.require_approval ?? true,
    approvalDeadline: announcement?.approval_deadline
      ? new Date(announcement.approval_deadline).toISOString().slice(0, 16)
      : '',
    autoProceedOnNoResponse: announcement?.auto_proceed_on_no_response ?? false,
    notes: announcement?.notes || '',
    customerIds: existingCustomerIds || [] as string[],
    createTicket: false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Handle maintenance type change - apply template if fields are empty or unchanged
  const handleTypeChange = (newType: MaintenanceType) => {
    const template = MAINTENANCE_TYPE_TEMPLATES[newType];
    const currentTemplate = MAINTENANCE_TYPE_TEMPLATES[formData.maintenanceType];

    // Check if current values match the current template (unchanged) or are empty
    const titleIsDefault = !formData.title || formData.title === currentTemplate.title;
    const descriptionIsDefault = !formData.description || formData.description === currentTemplate.description;
    const systemsIsDefault = !formData.affectedSystems || formData.affectedSystems === currentTemplate.affectedSystems;

    setFormData({
      ...formData,
      maintenanceType: newType,
      // Only update if the field was empty or had the default value
      title: titleIsDefault ? template.title : formData.title,
      description: descriptionIsDefault ? template.description : formData.description,
      affectedSystems: systemsIsDefault ? template.affectedSystems : formData.affectedSystems
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.scheduledStart) {
      setError('Bitte Titel und Startzeit angeben');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        ...formData,
        scheduledStart: new Date(formData.scheduledStart).toISOString(),
        scheduledEnd: formData.scheduledEnd ? new Date(formData.scheduledEnd).toISOString() : undefined,
        approvalDeadline: formData.approvalDeadline ? new Date(formData.approvalDeadline).toISOString() : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {announcement ? 'Wartung bearbeiten' : 'Neue Wartungsankündigung'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titel *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="z.B. Windows Updates Januar 2025"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Typ
              </label>
              <select
                value={formData.maintenanceType}
                onChange={(e) => handleTypeChange(e.target.value as MaintenanceType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {MAINTENANCE_TYPE_ICONS[value as MaintenanceType]} {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Betroffene Systeme
              </label>
              <input
                type="text"
                value={formData.affectedSystems}
                onChange={(e) => setFormData({ ...formData, affectedSystems: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="z.B. Windows Server, Clients"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Startzeitpunkt *
              </label>
              <input
                type="datetime-local"
                value={formData.scheduledStart}
                onChange={(e) => setFormData({ ...formData, scheduledStart: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Endzeitpunkt (optional)
              </label>
              <input
                type="datetime-local"
                value={formData.scheduledEnd}
                onChange={(e) => setFormData({ ...formData, scheduledEnd: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Beschreibung
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Detaillierte Beschreibung der Wartung..."
            />
          </div>

          <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.requireApproval}
                onChange={(e) => setFormData({ ...formData, requireApproval: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Kunden-Freigabe erforderlich
              </span>
            </label>

            {formData.requireApproval && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Freigabe-Frist
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.approvalDeadline}
                    onChange={(e) => setFormData({ ...formData, approvalDeadline: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.autoProceedOnNoResponse}
                    onChange={(e) => setFormData({ ...formData, autoProceedOnNoResponse: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Bei fehlender Antwort automatisch fortfahren
                  </span>
                </label>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Kunden auswählen
            </label>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto">
              {customers.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">Keine Kunden vorhanden</p>
              ) : (
                customers.map((customer) => (
                  <label
                    key={customer.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={formData.customerIds.includes(customer.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, customerIds: [...formData.customerIds, customer.id] });
                        } else {
                          setFormData({ ...formData, customerIds: formData.customerIds.filter(id => id !== customer.id) });
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">{customer.name}</span>
                    {customer.email && (
                      <span className="text-xs text-gray-500 ml-auto">{customer.email}</span>
                    )}
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formData.customerIds.length} Kunde(n) ausgewählt
            </p>
          </div>

          {/* Ticket creation option - only shown when exactly one customer is selected */}
          {formData.customerIds.length === 1 && !announcement && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.createTicket}
                  onChange={(e) => setFormData({ ...formData, createTicket: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <div>
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Ticket für Zeiterfassung erstellen
                  </span>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    Erstellt automatisch ein Ticket mit dem Wartungstitel für die Zeiterfassung
                  </p>
                </div>
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Interne Notizen
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Interne Notizen (nicht sichtbar für Kunden)..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {announcement ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Announcement Detail View
function AnnouncementDetail({
  announcementId,
  onClose,
  onRefresh,
  onEdit
}: {
  announcementId: string;
  onClose: () => void;
  onRefresh: () => void;
  onEdit: (announcement: MaintenanceAnnouncement, customerIds: string[]) => void;
}) {
  const [data, setData] = useState<{
    announcement: MaintenanceAnnouncement;
    customers: MaintenanceAnnouncementCustomer[];
    devices: any[];
    activityLog: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const result = await maintenanceApi.getAnnouncement(announcementId);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [announcementId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendNotifications = async () => {
    if (!data) return;
    const pendingCustomers = data.customers.filter(c => !c.notification_sent_at);
    if (pendingCustomers.length === 0) return;

    setSending(true);
    try {
      await maintenanceApi.sendNotifications(
        announcementId,
        pendingCustomers.map(c => c.customer_id)
      );
      await loadData();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSendReminders = async () => {
    setSending(true);
    try {
      await maintenanceApi.sendReminders(announcementId);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (status: MaintenanceStatus) => {
    try {
      await maintenanceApi.updateStatus(announcementId, status);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { announcement, customers, activityLog } = data;
  const pendingCount = customers.filter(c => !c.notification_sent_at).length;
  const awaitingApproval = customers.filter(c => c.notification_sent_at && c.status === 'pending').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{MAINTENANCE_TYPE_ICONS[announcement.maintenance_type]}</span>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {announcement.title}
              </h2>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[announcement.status]}`}>
                {STATUS_LABELS[announcement.status]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {MAINTENANCE_TYPE_LABELS[announcement.maintenance_type]}
              {announcement.affected_systems && ` • ${announcement.affected_systems}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Time Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                Start
              </div>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatDateTime(announcement.scheduled_start)}
              </p>
            </div>
            {announcement.scheduled_end && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <Clock className="w-4 h-4" />
                  Ende
                </div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDateTime(announcement.scheduled_end)}
                </p>
              </div>
            )}
            {announcement.approval_deadline && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  Freigabe-Frist
                </div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  {formatDateTime(announcement.approval_deadline)}
                </p>
              </div>
            )}
          </div>

          {announcement.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Beschreibung</h3>
              <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{announcement.description}</p>
            </div>
          )}

          {/* Customers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Kunden ({customers.length})
              </h3>
              <div className="flex gap-2">
                {awaitingApproval > 0 && (
                  <button
                    onClick={handleSendReminders}
                    disabled={sending}
                    className="px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 flex items-center gap-1"
                  >
                    <Bell className="w-4 h-4" />
                    Erinnerung senden ({awaitingApproval})
                  </button>
                )}
                {pendingCount > 0 && (
                  <button
                    onClick={handleSendNotifications}
                    disabled={sending}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                  >
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Benachrichtigen ({pendingCount})
                  </button>
                )}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kunde</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gesendet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Antwort</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{customer.customer_name}</div>
                        {customer.customer_email && (
                          <div className="text-xs text-gray-500">{customer.customer_email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {customer.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            <CheckCircle className="w-3 h-3" /> Genehmigt
                          </span>
                        ) : customer.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                            <XCircle className="w-3 h-3" /> Abgelehnt
                          </span>
                        ) : customer.notification_sent_at ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                            <Clock className="w-3 h-3" /> Ausstehend
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            Nicht gesendet
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {customer.notification_sent_at ? formatDateTime(customer.notification_sent_at) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {customer.approved_at ? (
                          <div>
                            <div>{formatDateTime(customer.approved_at)}</div>
                            {customer.approved_by && (
                              <div className="text-xs">von {customer.approved_by}</div>
                            )}
                          </div>
                        ) : '-'}
                        {customer.rejection_reason && (
                          <div className="text-xs text-red-600 mt-1">Grund: {customer.rejection_reason}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Log */}
          {activityLog.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Aktivitäten</h3>
              <div className="space-y-2">
                {activityLog.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {log.actor_name && <strong>{log.actor_name}: </strong>}
                      {log.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <div className="flex gap-2">
            {/* Edit button - only for draft, scheduled, or sent status */}
            {['draft', 'scheduled', 'sent'].includes(announcement.status) && (
              <button
                onClick={() => onEdit(announcement, customers.map(c => c.customer_id))}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Bearbeiten
              </button>
            )}
            {announcement.status === 'draft' && (
              <button
                onClick={() => handleUpdateStatus('scheduled')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Als geplant markieren
              </button>
            )}
            {(announcement.status === 'scheduled' || announcement.status === 'sent') && (
              <button
                onClick={() => handleUpdateStatus('in_progress')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Starten
              </button>
            )}
            {announcement.status === 'in_progress' && (
              <button
                onClick={() => handleUpdateStatus('completed')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Abschließen
              </button>
            )}
            {!['completed', 'cancelled'].includes(announcement.status) && (
              <button
                onClick={() => handleUpdateStatus('cancelled')}
                className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
              >
                Abbrechen
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Component
export default function MaintenanceView() {
  const [announcements, setAnnouncements] = useState<MaintenanceAnnouncement[]>([]);
  const [dashboard, setDashboard] = useState<MaintenanceDashboard | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | ''>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<MaintenanceAnnouncement | null>(null);
  const [editingCustomerIds, setEditingCustomerIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [announcementsRes, dashboardRes, customersRes] = await Promise.all([
        maintenanceApi.getAnnouncements({ status: statusFilter || undefined }),
        maintenanceApi.getDashboard(),
        customersApi.getAll()
      ]);
      setAnnouncements(announcementsRes.announcements);
      setDashboard(dashboardRes);
      setCustomers(customersRes.data || customersRes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (data: any) => {
    await maintenanceApi.createAnnouncement(data);
    await loadData();
  };

  const handleUpdate = async (data: any) => {
    if (!editingAnnouncement) return;
    await maintenanceApi.updateAnnouncement(editingAnnouncement.id, data);
    await loadData();
    setEditingAnnouncement(null);
    setEditingCustomerIds([]);
  };

  const handleEdit = (announcement: MaintenanceAnnouncement, customerIds: string[]) => {
    setEditingAnnouncement(announcement);
    setEditingCustomerIds(customerIds);
    setSelectedAnnouncementId(null); // Close detail view
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Wartungsankündigung wirklich löschen?')) return;
    try {
      await maintenanceApi.deleteAnnouncement(id);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wartungsankündigungen</h1>
          <p className="text-gray-500">Planen und verwalten Sie Wartungsfenster für Ihre Kunden</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Neue Ankündigung
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dashboard.statistics.scheduled_count}
                </p>
                <p className="text-sm text-gray-500">Geplant</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dashboard.pendingApprovals}
                </p>
                <p className="text-sm text-gray-500">Ausstehende Freigaben</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dashboard.statistics.in_progress_count}
                </p>
                <p className="text-sm text-gray-500">In Bearbeitung</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dashboard.statistics.completed_count}
                </p>
                <p className="text-sm text-gray-500">Abgeschlossen</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MaintenanceStatus | '')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={loadData}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Announcements List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {announcements.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Keine Ankündigungen
            </h3>
            <p className="text-gray-500 mb-4">
              Erstellen Sie Ihre erste Wartungsankündigung
            </p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Ankündigung erstellen
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="text-2xl">
                    {MAINTENANCE_TYPE_ICONS[announcement.maintenance_type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {announcement.title}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[announcement.status]}`}>
                        {STATUS_LABELS[announcement.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDateTime(announcement.scheduled_start)}
                      </span>
                      {announcement.customer_count !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {announcement.customer_count} Kunden
                        </span>
                      )}
                      {announcement.require_approval && announcement.pending_count !== undefined && announcement.pending_count > 0 && (
                        <span className="flex items-center gap-1 text-yellow-600">
                          <Clock className="w-4 h-4" />
                          {announcement.pending_count} ausstehend
                        </span>
                      )}
                      {announcement.approved_count !== undefined && announcement.approved_count > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          {announcement.approved_count} genehmigt
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAnnouncementId(announcement.id)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                      title="Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    {['draft', 'scheduled', 'sent'].includes(announcement.status) && (
                      <button
                        onClick={async () => {
                          // Load announcement details to get customer IDs
                          try {
                            const details = await maintenanceApi.getAnnouncement(announcement.id);
                            handleEdit(announcement, details.customers.map(c => c.customer_id));
                          } catch (err) {
                            console.error('Failed to load announcement for editing:', err);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg"
                        title="Bearbeiten"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {announcement.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(announcement.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        title="Löschen"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <AnnouncementDialog
          customers={customers}
          existingCustomerIds={[]}
          onSave={handleCreate}
          onClose={() => setShowCreateDialog(false)}
        />
      )}

      {/* Edit Dialog */}
      {editingAnnouncement && (
        <AnnouncementDialog
          announcement={editingAnnouncement}
          customers={customers}
          existingCustomerIds={editingCustomerIds}
          onSave={handleUpdate}
          onClose={() => {
            setEditingAnnouncement(null);
            setEditingCustomerIds([]);
          }}
        />
      )}

      {/* Detail View */}
      {selectedAnnouncementId && (
        <AnnouncementDetail
          announcementId={selectedAnnouncementId}
          onClose={() => setSelectedAnnouncementId(null)}
          onRefresh={loadData}
          onEdit={handleEdit}
        />
      )}
    </div>
  );
}
