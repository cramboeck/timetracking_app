import React, { useState, useEffect } from 'react';
import {
  Phone,
  Mail,
  Users,
  MessageSquare,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Edit2,
  Trash2,
  ArrowRight,
  User,
  Building2,
  Filter,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PhoneIncoming,
  PhoneOutgoing,
} from 'lucide-react';
import {
  interactionsApi,
  Interaction,
  InteractionType,
  InteractionDirection,
  InteractionOutcome,
  TimelineItem,
} from '../services/api';
import { Customer } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, IconButton } from './ui';
import { useToast } from '../contexts/UIContext';

// ============================================
// Types
// ============================================

interface InteractionsTimelineProps {
  customerId?: string;
  customer?: Customer;
  compact?: boolean;
  onInteractionClick?: (interaction: Interaction) => void;
}

// ============================================
// Helper functions
// ============================================

const getTypeIcon = (type: InteractionType) => {
  switch (type) {
    case 'call':
      return Phone;
    case 'email':
      return Mail;
    case 'meeting':
      return Users;
    case 'demo':
      return Calendar;
    case 'support':
      return MessageSquare;
    case 'followup':
      return Clock;
    case 'note':
    default:
      return MessageSquare;
  }
};

const getTypeColor = (type: InteractionType) => {
  switch (type) {
    case 'call':
      return 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
    case 'email':
      return 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary';
    case 'meeting':
      return 'bg-accent-lighter dark:bg-accent-primary/20 text-accent-primary dark:text-accent-primary';
    case 'demo':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    case 'support':
      return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    case 'followup':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400';
    default:
      return 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400';
  }
};

const getTypeLabel = (type: InteractionType) => {
  switch (type) {
    case 'call':
      return 'Anruf';
    case 'email':
      return 'E-Mail';
    case 'meeting':
      return 'Meeting';
    case 'demo':
      return 'Demo';
    case 'support':
      return 'Support';
    case 'followup':
      return 'Follow-up';
    case 'note':
    default:
      return 'Notiz';
  }
};

const getOutcomeColor = (outcome?: InteractionOutcome) => {
  switch (outcome) {
    case 'positive':
      return 'text-green-600 dark:text-green-400';
    case 'negative':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-dark-400';
  }
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Heute, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Gestern, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ============================================
// InteractionForm Component
// ============================================

interface InteractionFormProps {
  customerId: string;
  interaction?: Interaction;
  onSave: (interaction: Interaction) => void;
  onCancel: () => void;
}

const InteractionForm: React.FC<InteractionFormProps> = ({
  customerId,
  interaction,
  onSave,
  onCancel,
}) => {
  const showToast = useToast();
  const [type, setType] = useState<InteractionType>(interaction?.type || 'call');
  const [direction, setDirection] = useState<InteractionDirection>(interaction?.direction || 'outbound');
  const [subject, setSubject] = useState(interaction?.subject || '');
  const [content, setContent] = useState(interaction?.content || '');
  const [summary, setSummary] = useState(interaction?.summary || '');
  const [durationMinutes, setDurationMinutes] = useState(interaction?.duration_minutes || 15);
  const [outcome, setOutcome] = useState<InteractionOutcome | ''>(interaction?.outcome || '');
  const [followUpRequired, setFollowUpRequired] = useState(interaction?.follow_up_required || false);
  const [followUpDate, setFollowUpDate] = useState(interaction?.follow_up_date?.split('T')[0] || '');
  const [followUpNotes, setFollowUpNotes] = useState(interaction?.follow_up_notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    try {
      setSaving(true);
      const data: Partial<Interaction> = {
        customer_id: customerId,
        type,
        direction: type === 'call' ? direction : undefined,
        subject: subject.trim(),
        content: content.trim() || undefined,
        summary: summary.trim() || undefined,
        duration_minutes: durationMinutes || undefined,
        outcome: outcome || undefined,
        follow_up_required: followUpRequired,
        follow_up_date: followUpRequired && followUpDate ? followUpDate : undefined,
        follow_up_notes: followUpRequired && followUpNotes ? followUpNotes : undefined,
      };

      let result: Interaction;
      if (interaction) {
        result = await interactionsApi.update(interaction.id, data);
      } else {
        result = await interactionsApi.create(data);
      }
      onSave(result);
    } catch (err) {
      console.error('Failed to save interaction:', err);
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setSaving(false);
    }
  };

  const interactionTypes: InteractionType[] = ['call', 'email', 'meeting', 'demo', 'support', 'note'];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
          Typ
        </label>
        <div className="flex flex-wrap gap-2">
          {interactionTypes.map((t) => {
            const Icon = getTypeIcon(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t
                    ? getTypeColor(t)
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                }`}
              >
                <Icon size={16} />
                {getTypeLabel(t)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Direction (only for calls) */}
      {type === 'call' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
            Richtung
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('outbound')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                direction === 'outbound'
                  ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary'
                  : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
              }`}
            >
              <PhoneOutgoing size={16} />
              Ausgehend
            </button>
            <button
              type="button"
              onClick={() => setDirection('inbound')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                direction === 'inbound'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
              }`}
            >
              <PhoneIncoming size={16} />
              Eingehend
            </button>
          </div>
        </div>
      )}

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
          Betreff <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
          placeholder="Kurze Beschreibung..."
          required
        />
      </div>

      {/* Content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
          Details
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white resize-none"
          placeholder="Ausführliche Notizen..."
        />
      </div>

      {/* Duration & Outcome */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
            Dauer (Minuten)
          </label>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
            min={0}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
            Ergebnis
          </label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as InteractionOutcome | '')}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
          >
            <option value="">Nicht bewertet</option>
            <option value="positive">Positiv</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negativ</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
          Zusammenfassung
        </label>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
          placeholder="Kurze Zusammenfassung..."
        />
      </div>

      {/* Follow-up */}
      <div className="border-t border-gray-200 dark:border-dark-border pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={followUpRequired}
            onChange={(e) => setFollowUpRequired(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-accent-primary"
          />
          <span className="text-gray-900 dark:text-white font-medium">Follow-up erforderlich</span>
        </label>

        {followUpRequired && (
          <div className="mt-3 ml-8 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Datum
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Notizen
              </label>
              <input
                type="text"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                placeholder="Was ist zu tun?"
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          Abbrechen
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={saving || !subject.trim()}
          loading={saving}
        >
          {interaction ? 'Aktualisieren' : 'Erstellen'}
        </Button>
      </div>
    </form>
  );
};

// ============================================
// Main Component
// ============================================

export const InteractionsTimeline: React.FC<InteractionsTimelineProps> = ({
  customerId,
  customer,
  compact = false,
  onInteractionClick,
}) => {
  const showToast = useToast();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState<Interaction | null>(null);
  const [deleteInteraction, setDeleteInteraction] = useState<Interaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterType, setFilterType] = useState<InteractionType | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (customerId) {
      loadInteractions();
    }
  }, [customerId, filterType]);

  const loadInteractions = async () => {
    if (!customerId) return;

    try {
      setLoading(true);
      setError(null);
      const result = await interactionsApi.getAll({
        customer_id: customerId,
        type: filterType || undefined,
        limit: compact ? 5 : 50,
      });
      setInteractions(result.interactions);
    } catch (err) {
      console.error('Failed to load interactions:', err);
      setError('Fehler beim Laden der Interaktionen');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (interaction: Interaction) => {
    if (editingInteraction) {
      setInteractions((prev) => prev.map((i) => (i.id === interaction.id ? interaction : i)));
    } else {
      setInteractions((prev) => [interaction, ...prev]);
    }
    setShowForm(false);
    setEditingInteraction(null);
  };

  const handleDelete = async () => {
    if (!deleteInteraction) return;

    try {
      setDeleting(true);
      await interactionsApi.delete(deleteInteraction.id);
      setInteractions((prev) => prev.filter((i) => i.id !== deleteInteraction.id));
      setDeleteInteraction(null);
    } catch (err) {
      console.error('Failed to delete interaction:', err);
      showToast('Fehler beim Loschen', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCompleteFollowUp = async (interaction: Interaction) => {
    try {
      await interactionsApi.completeFollowUp(interaction.id);
      setInteractions((prev) =>
        prev.map((i) =>
          i.id === interaction.id ? { ...i, follow_up_completed: true } : i
        )
      );
    } catch (err) {
      console.error('Failed to complete follow-up:', err);
    }
  };

  if (!customerId) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-dark-400">
        Kein Kunde ausgewahlt
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Interaktionen
          </h3>
          {!compact && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg text-gray-500"
            >
              <Filter size={16} />
            </button>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={16} />}
          onClick={() => {
            setEditingInteraction(null);
            setShowForm(true);
          }}
        >
          Neu
        </Button>
      </div>

      {/* Filters */}
      {showFilters && !compact && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
          <button
            onClick={() => setFilterType('')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filterType === ''
                ? 'bg-accent-primary text-white'
                : 'bg-white dark:bg-dark-200 text-gray-600 dark:text-dark-400'
            }`}
          >
            Alle
          </button>
          {(['call', 'email', 'meeting', 'demo', 'support', 'note'] as InteractionType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                filterType === t
                  ? 'bg-accent-primary text-white'
                  : 'bg-white dark:bg-dark-200 text-gray-600 dark:text-dark-400'
              }`}
            >
              {getTypeLabel(t)}
            </button>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingInteraction ? 'Interaktion bearbeiten' : 'Neue Interaktion'}
              </h3>
              <IconButton
                icon={<X size={20} />}
                onClick={() => setShowForm(false)}
              />
            </div>
            <div className="p-4">
              <InteractionForm
                customerId={customerId}
                interaction={editingInteraction || undefined}
                onSave={handleSave}
                onClose={() => {
                  setShowForm(false);
                  setEditingInteraction(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-4 text-red-500">
          <p>{error}</p>
          <Button variant="ghost" onClick={loadInteractions} className="mt-2">
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && interactions.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-dark-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
          <p>Noch keine Interaktionen</p>
          <p className="text-sm mt-1">Protokolliere Anrufe, E-Mails und Meetings</p>
        </div>
      )}

      {/* Timeline */}
      {!loading && !error && interactions.length > 0 && (
        <div className="space-y-3">
          {interactions.map((interaction) => {
            const Icon = getTypeIcon(interaction.type);
            return (
              <div
                key={interaction.id}
                className="group relative flex gap-3 p-3 bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border transition-colors"
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${getTypeColor(interaction.type)}`}>
                  <Icon size={20} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {interaction.subject}
                        </span>
                        {interaction.direction && (
                          <span className="text-xs text-gray-500">
                            {interaction.direction === 'inbound' ? (
                              <PhoneIncoming size={14} className="inline" />
                            ) : (
                              <PhoneOutgoing size={14} className="inline" />
                            )}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-dark-400 mt-0.5">
                        {formatDate(interaction.occurred_at)}
                        {interaction.duration_minutes && (
                          <span className="ml-2">
                            <Clock size={12} className="inline mr-1" />
                            {interaction.duration_minutes} min
                          </span>
                        )}
                        {interaction.user_name && (
                          <span className="ml-2">
                            <User size={12} className="inline mr-1" />
                            {interaction.user_name}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <IconButton
                        icon={<Edit2 size={14} />}
                        size="sm"
                        onClick={() => {
                          setEditingInteraction(interaction);
                          setShowForm(true);
                        }}
                      />
                      <IconButton
                        icon={<Trash2 size={14} />}
                        size="sm"
                        variant="danger"
                        onClick={() => setDeleteInteraction(interaction)}
                      />
                    </div>
                  </div>

                  {/* Summary/Content */}
                  {(interaction.summary || interaction.content) && (
                    <p className="text-sm text-gray-600 dark:text-dark-500 mt-2 line-clamp-2">
                      {interaction.summary || interaction.content}
                    </p>
                  )}

                  {/* Outcome */}
                  {interaction.outcome && (
                    <div className={`mt-2 text-sm ${getOutcomeColor(interaction.outcome)}`}>
                      {interaction.outcome === 'positive' && <CheckCircle size={14} className="inline mr-1" />}
                      {interaction.outcome === 'negative' && <AlertCircle size={14} className="inline mr-1" />}
                      {interaction.outcome === 'positive' ? 'Positiv' : interaction.outcome === 'negative' ? 'Negativ' : 'Neutral'}
                    </div>
                  )}

                  {/* Follow-up */}
                  {interaction.follow_up_required && !interaction.follow_up_completed && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg flex items-center gap-1">
                        <Clock size={12} />
                        Follow-up: {interaction.follow_up_date ? new Date(interaction.follow_up_date).toLocaleDateString('de-DE') : 'Offen'}
                      </span>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleCompleteFollowUp(interaction)}
                      >
                        Erledigt
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Show more link for compact mode */}
      {compact && interactions.length >= 5 && (
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          icon={<ArrowRight size={14} />}
          iconPosition="right"
          onClick={() => onInteractionClick?.(interactions[0])}
        >
          Alle anzeigen
        </Button>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteInteraction}
        onClose={() => setDeleteInteraction(null)}
        onConfirm={handleDelete}
        title="Interaktion löschen"
        message={`Möchtest du die Interaktion "${deleteInteraction?.subject}" wirklich löschen?`}
        confirmText={deleting ? 'Löschen...' : 'Löschen'}
        variant="danger"
      />
    </div>
  );
};

export default InteractionsTimeline;
