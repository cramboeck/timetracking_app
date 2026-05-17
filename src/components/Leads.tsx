import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  Globe,
  Building2,
  User,
  Calendar,
  DollarSign,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  MoreVertical,
  UserPlus,
  TrendingUp,
  Filter,
  Search,
  Flame,
} from 'lucide-react';
import {
  leadsApi,
  Lead,
  LeadStatus,
  LeadSource,
  LeadPriority,
  LeadActivity,
  CreateLeadInput,
} from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, IconButton } from './ui/Button';

// ============================================
// Constants
// ============================================

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: 'Neu', color: 'text-accent-primary', bgColor: 'bg-accent-lighter dark:bg-blue-900/30' },
  contacted: { label: 'Kontaktiert', color: 'text-cyan-600', bgColor: 'bg-cyan-100 dark:bg-cyan-900/30' },
  qualified: { label: 'Qualifiziert', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  proposal: { label: 'Angebot', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  negotiation: { label: 'Verhandlung', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  won: { label: 'Gewonnen', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  lost: { label: 'Verloren', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  referral: 'Empfehlung',
  cold_call: 'Kaltakquise',
  email: 'E-Mail',
  event: 'Event',
  social_media: 'Social Media',
  advertising: 'Werbung',
  other: 'Sonstiges',
};

const PRIORITY_CONFIG: Record<LeadPriority, { label: string; color: string; icon?: React.ReactNode }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-accent-primary' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  hot: { label: 'Hot', color: 'text-red-500', icon: <Flame size={14} /> },
};

// ============================================
// Helper Functions
// ============================================

const formatCurrency = (amount: number | undefined) => {
  if (!amount) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// ============================================
// Lead Card Component
// ============================================

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onConvert: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}

const LeadCard: React.FC<LeadCardProps> = ({ lead, onEdit, onStatusChange, onConvert, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[lead.priority];
  const statusConfig = STATUS_CONFIG[lead.status];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('leadId', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-300 dark:hover:border-accent-primary transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
              {lead.name}
            </h4>
            {lead.priority === 'hot' && (
              <Flame size={14} className="text-red-500 flex-shrink-0" />
            )}
          </div>
          {lead.company && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {lead.company}
            </p>
          )}
        </div>
        <div className="relative">
          <IconButton
            onClick={() => setShowMenu(!showMenu)}
            icon={<MoreVertical size={14} />}
            size="sm"
            tooltip="Menü"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
                <Button
                  onClick={() => { setShowMenu(false); onEdit(lead); }}
                  variant="ghost"
                  size="sm"
                  icon={<Edit2 size={14} />}
                  className="w-full justify-start rounded-none"
                >
                  Bearbeiten
                </Button>
                {lead.status !== 'won' && lead.status !== 'lost' && (
                  <Button
                    onClick={() => { setShowMenu(false); onConvert(lead); }}
                    variant="ghost"
                    size="sm"
                    icon={<UserPlus size={14} />}
                    className="w-full justify-start rounded-none text-green-600 dark:text-green-400"
                  >
                    Zu Kunde konvertieren
                  </Button>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <div className="px-3 py-1 text-xs text-gray-500 uppercase">Status ändern</div>
                {(Object.keys(STATUS_CONFIG) as LeadStatus[])
                  .filter((s) => s !== lead.status && s !== 'won' && s !== 'lost')
                  .map((status) => (
                    <Button
                      key={status}
                      onClick={() => { setShowMenu(false); onStatusChange(lead, status); }}
                      variant="ghost"
                      size="sm"
                      icon={<div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[status].bgColor}`} />}
                      className="w-full justify-start rounded-none"
                    >
                      {STATUS_CONFIG[status].label}
                    </Button>
                  ))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <Button
                  onClick={() => { setShowMenu(false); onStatusChange(lead, 'won'); }}
                  variant="ghost"
                  size="sm"
                  icon={<CheckCircle size={14} />}
                  className="w-full justify-start rounded-none text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  Als gewonnen markieren
                </Button>
                <Button
                  onClick={() => { setShowMenu(false); onStatusChange(lead, 'lost'); }}
                  variant="ghost"
                  size="sm"
                  icon={<XCircle size={14} />}
                  className="w-full justify-start rounded-none text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Als verloren markieren
                </Button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <Button
                  onClick={() => { setShowMenu(false); onDelete(lead); }}
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  className="w-full justify-start rounded-none text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Loschen
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
        {lead.email && (
          <div className="flex items-center gap-1.5 truncate">
            <Mail size={12} />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={12} />
            <span>{lead.phone}</span>
          </div>
        )}
      </div>

      {/* Value & Probability */}
      {(lead.estimatedValue || lead.probability) && (
        <div className="flex items-center gap-3 text-sm mb-2">
          {lead.estimatedValue && (
            <div className="flex items-center gap-1 text-green-600 font-medium">
              <DollarSign size={14} />
              {formatCurrency(lead.estimatedValue)}
            </div>
          )}
          {lead.probability && (
            <div className="flex items-center gap-1 text-gray-500">
              <Target size={12} />
              {lead.probability}%
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-600">
        {lead.source && (
          <span className="bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded">
            {SOURCE_LABELS[lead.source]}
          </span>
        )}
        {lead.nextFollowUp && (
          <div className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(lead.nextFollowUp)}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Lead Column Component
// ============================================

interface LeadColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onAddLead: (status: LeadStatus) => void;
  onEditLead: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onConvertLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => void;
  onDrop: (leadId: string, status: LeadStatus) => void;
}

const LeadColumn: React.FC<LeadColumnProps> = ({
  status,
  leads,
  onAddLead,
  onEditLead,
  onStatusChange,
  onConvertLead,
  onDeleteLead,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const config = STATUS_CONFIG[status];
  const totalValue = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) onDrop(leadId, status);
  };

  // Don't show closed columns as drag targets
  const isClosedStatus = status === 'won' || status === 'lost';

  return (
    <div
      className={`flex-shrink-0 w-72 bg-gray-100 dark:bg-gray-800/50 rounded-xl flex flex-col max-h-full ${
        isDragOver && !isClosedStatus ? 'ring-2 ring-accent-primary ring-opacity-50' : ''
      }`}
      onDragOver={!isClosedStatus ? handleDragOver : undefined}
      onDragLeave={!isClosedStatus ? handleDragLeave : undefined}
      onDrop={!isClosedStatus ? handleDrop : undefined}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${config.bgColor}`} />
            <h3 className={`font-semibold text-sm ${config.color}`}>{config.label}</h3>
            <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {leads.length}
            </span>
          </div>
          {!isClosedStatus && (
            <IconButton
              onClick={() => onAddLead(status)}
              icon={<Plus size={16} />}
              size="sm"
              tooltip="Lead hinzufügen"
            />
          )}
        </div>
        {totalValue > 0 && (
          <div className="text-xs text-gray-500">{formatCurrency(totalValue)}</div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onEdit={onEditLead}
            onStatusChange={onStatusChange}
            onConvert={onConvertLead}
            onDelete={onDeleteLead}
          />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">
            Keine Leads
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Lead Form Modal
// ============================================

interface LeadFormProps {
  lead?: Lead;
  initialStatus?: LeadStatus;
  onSave: (lead: Lead) => void;
  onCancel: () => void;
}

const LeadForm: React.FC<LeadFormProps> = ({ lead, initialStatus, onSave, onCancel }) => {
  const [name, setName] = useState(lead?.name || '');
  const [company, setCompany] = useState(lead?.company || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [website, setWebsite] = useState(lead?.website || '');
  const [status, setStatus] = useState<LeadStatus>(lead?.status || initialStatus || 'new');
  const [source, setSource] = useState<LeadSource | ''>(lead?.source || '');
  const [priority, setPriority] = useState<LeadPriority>(lead?.priority || 'normal');
  const [estimatedValue, setEstimatedValue] = useState(lead?.estimatedValue?.toString() || '');
  const [probability, setProbability] = useState(lead?.probability?.toString() || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(lead?.expectedCloseDate?.split('T')[0] || '');
  const [nextFollowUp, setNextFollowUp] = useState(lead?.nextFollowUp?.split('T')[0] || '');
  const [description, setDescription] = useState(lead?.description || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      const data: CreateLeadInput = {
        name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        status,
        source: source || undefined,
        priority,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
        probability: probability ? parseInt(probability) : undefined,
        expectedCloseDate: expectedCloseDate || undefined,
        nextFollowUp: nextFollowUp || undefined,
        description: description.trim() || undefined,
      };

      let result;
      if (lead) {
        result = await leadsApi.update(lead.id, data);
      } else {
        result = await leadsApi.create(data);
      }
      onSave(result.data);
    } catch (err) {
      console.error('Failed to save lead:', err);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name & Company */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Firma
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            E-Mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Telefon
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Status & Priority */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Prioritat
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as LeadPriority)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {(Object.keys(PRIORITY_CONFIG) as LeadPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Source & Value */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Quelle
          </label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Keine Angabe</option>
            {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Geschaftswert (EUR)
          </label>
          <input
            type="number"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            min={0}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Probability & Dates */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Wahrscheinlichkeit (%)
          </label>
          <input
            type="number"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            min={0}
            max={100}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Abschluss erwartet
          </label>
          <input
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nachstes Follow-up
          </label>
          <input
            type="date"
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Beschreibung
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
        >
          Abbrechen
        </Button>
        <Button
          type="submit"
          disabled={!name.trim()}
          loading={saving}
          variant="primary"
        >
          {lead ? 'Aktualisieren' : 'Erstellen'}
        </Button>
      </div>
    </form>
  );
};

// ============================================
// Main Component
// ============================================

const Leads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [initialStatus, setInitialStatus] = useState<LeadStatus | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await leadsApi.getAll();
      setLeads(result.data || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
      setError('Fehler beim Laden der Leads');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLead = (status: LeadStatus) => {
    setEditingLead(null);
    setInitialStatus(status);
    setShowForm(true);
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setInitialStatus(null);
    setShowForm(true);
  };

  const handleSaveLead = (lead: Lead) => {
    if (editingLead) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    } else {
      setLeads((prev) => [lead, ...prev]);
    }
    setShowForm(false);
    setEditingLead(null);
    setInitialStatus(null);
  };

  const handleStatusChange = async (lead: Lead, newStatus: LeadStatus) => {
    try {
      const result = await leadsApi.update(lead.id, { status: newStatus });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? result.data : l)));
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Fehler beim Aktualisieren');
    }
  };

  const handleDrop = async (leadId: string, newStatus: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.status !== newStatus) {
      await handleStatusChange(lead, newStatus);
    }
  };

  const handleConvertLead = async (lead: Lead) => {
    if (!confirm(`"${lead.name}" zu Kunde konvertieren?`)) return;

    try {
      await leadsApi.convert(lead.id, true);
      await loadLeads();
      alert('Lead erfolgreich konvertiert!');
    } catch (err) {
      console.error('Failed to convert lead:', err);
      alert('Fehler beim Konvertieren');
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteLead) return;

    try {
      setDeleting(true);
      await leadsApi.delete(deleteLead.id);
      setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
      setDeleteLead(null);
    } catch (err) {
      console.error('Failed to delete lead:', err);
      alert('Fehler beim Loschen');
    } finally {
      setDeleting(false);
    }
  };

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !lead.name.toLowerCase().includes(q) &&
        !lead.company?.toLowerCase().includes(q) &&
        !lead.email?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Group by status
  const openStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
  const closedStatuses: LeadStatus[] = ['won', 'lost'];
  const displayStatuses = showClosed ? [...openStatuses, ...closedStatuses] : openStatuses;

  const getLeadsByStatus = (status: LeadStatus) =>
    filteredLeads.filter((l) => l.status === status);

  // Stats
  const totalValue = filteredLeads
    .filter((l) => !closedStatuses.includes(l.status))
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  const wonValue = filteredLeads
    .filter((l) => l.status === 'won')
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <AlertCircle size={48} className="mb-4 text-red-500" />
        <p>{error}</p>
        <Button
          onClick={loadLeads}
          variant="primary"
          className="mt-4"
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredLeads.filter((l) => !closedStatuses.includes(l.status)).length} offene Leads
            {totalValue > 0 && ` - ${formatCurrency(totalValue)} Pipeline`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suchen..."
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary"
            />
          </div>
          <Button
            onClick={() => setShowClosed(!showClosed)}
            variant={showClosed ? 'primary' : 'secondary'}
            size="sm"
          >
            {showClosed ? 'Abgeschlossene ausblenden' : 'Abgeschlossene anzeigen'}
          </Button>
          <Button
            onClick={() => handleAddLead('new')}
            variant="primary"
            icon={<Plus size={18} />}
          >
            Neuer Lead
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-h-full pb-4">
          {displayStatuses.map((status) => (
            <LeadColumn
              key={status}
              status={status}
              leads={getLeadsByStatus(status)}
              onAddLead={handleAddLead}
              onEditLead={handleEditLead}
              onStatusChange={handleStatusChange}
              onConvertLead={handleConvertLead}
              onDeleteLead={setDeleteLead}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingLead ? 'Lead bearbeiten' : 'Neuer Lead'}
              </h3>
              <IconButton
                onClick={() => setShowForm(false)}
                icon={<X size={20} />}
                tooltip="Schließen"
              />
            </div>
            <div className="p-4">
              <LeadForm
                lead={editingLead || undefined}
                initialStatus={initialStatus || undefined}
                onSave={handleSaveLead}
                onClose={() => {
                  setShowForm(false);
                  setEditingLead(null);
                  setInitialStatus(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteLead}
        onClose={() => setDeleteLead(null)}
        onConfirm={handleDeleteLead}
        title="Lead löschen"
        message={`Möchtest du "${deleteLead?.name}" wirklich löschen?`}
        confirmText={deleting ? 'Löschen...' : 'Löschen'}
        variant="danger"
      />
    </div>
  );
};

export default Leads;
