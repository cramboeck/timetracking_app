import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  Edit2,
  Trash2,
  DollarSign,
  Calendar,
  User,
  Building2,
  TrendingUp,
  Target,
  Award,
  AlertCircle,
  ChevronRight,
  Clock,
  MoreVertical,
  GripVertical,
  Settings,
  BarChart3,
  Filter,
  Search,
} from 'lucide-react';
import {
  opportunitiesApi,
  pipelineStagesApi,
  Opportunity,
  PipelineStage,
  PipelineView,
  OpportunityStats,
} from '../services/api';
import { Customer } from '../types';
import { customersApi } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

// ============================================
// Helper Functions
// ============================================

const formatCurrency = (amount: number | undefined | null, currency = 'EUR') => {
  if (!amount) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

const getDaysUntil = (dateStr?: string) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// ============================================
// Opportunity Card Component
// ============================================

interface OpportunityCardProps {
  opportunity: Opportunity;
  onEdit: (opp: Opportunity) => void;
  onMove: (opp: Opportunity, stageId: string) => void;
  onDelete: (opp: Opportunity) => void;
  stages: PipelineStage[];
  isDragging?: boolean;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  onEdit,
  onMove,
  onDelete,
  stages,
  isDragging,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const daysUntil = getDaysUntil(opportunity.expected_close_date);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('opportunityId', opportunity.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all ${
        isDragging ? 'opacity-50 rotate-2 scale-105' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
          {opportunity.name}
        </h4>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onEdit(opportunity);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Edit2 size={14} />
                  Bearbeiten
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <div className="px-3 py-1 text-xs text-gray-500 uppercase">Verschieben zu</div>
                {stages
                  .filter((s) => s.id !== opportunity.stage_id)
                  .map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => {
                        setShowMenu(false);
                        onMove(opportunity, stage.id);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                    </button>
                  ))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(opportunity);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Loschen
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Customer */}
      {opportunity.customer_name && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: opportunity.customer_color || '#6B7280' }}
          />
          {opportunity.customer_name}
        </div>
      )}

      {/* Value */}
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-2">
        <DollarSign size={14} className="text-green-600" />
        {formatCurrency(opportunity.value, opportunity.currency)}
        {opportunity.probability !== undefined && (
          <span className="text-xs font-normal text-gray-500 ml-1">
            ({opportunity.probability}%)
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        {/* Expected Close */}
        <div className="flex items-center gap-1">
          <Calendar size={12} />
          {opportunity.expected_close_date ? (
            <span className={daysUntil !== null && daysUntil < 0 ? 'text-red-500' : ''}>
              {daysUntil !== null && daysUntil < 0
                ? `${Math.abs(daysUntil)} Tage uberfällig`
                : daysUntil !== null && daysUntil === 0
                ? 'Heute'
                : daysUntil !== null && daysUntil <= 7
                ? `${daysUntil} Tage`
                : formatDate(opportunity.expected_close_date)}
            </span>
          ) : (
            '-'
          )}
        </div>

        {/* Assignee */}
        {opportunity.assigned_to_name && (
          <div className="flex items-center gap-1">
            <User size={12} />
            <span className="truncate max-w-[60px]">{opportunity.assigned_to_name}</span>
          </div>
        )}
      </div>

      {/* Next Step */}
      {opportunity.next_step && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium">Nächster Schritt:</span> {opportunity.next_step}
        </div>
      )}
    </div>
  );
};

// ============================================
// Pipeline Column Component
// ============================================

interface PipelineColumnProps {
  stage: PipelineStage;
  opportunities: Opportunity[];
  stages: PipelineStage[];
  onAddOpportunity: (stageId: string) => void;
  onEditOpportunity: (opp: Opportunity) => void;
  onMoveOpportunity: (opp: Opportunity, stageId: string) => void;
  onDeleteOpportunity: (opp: Opportunity) => void;
  onDrop: (opportunityId: string, stageId: string) => void;
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  opportunities,
  stages,
  onAddOpportunity,
  onEditOpportunity,
  onMoveOpportunity,
  onDeleteOpportunity,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const totalValue = opportunities.reduce((sum, o) => sum + (o.value || 0), 0);
  const weightedValue = opportunities.reduce((sum, o) => sum + (o.weighted_value || 0), 0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const opportunityId = e.dataTransfer.getData('opportunityId');
    if (opportunityId) {
      onDrop(opportunityId, stage.id);
    }
  };

  return (
    <div
      className={`flex-shrink-0 w-72 bg-gray-100 dark:bg-gray-800/50 rounded-xl flex flex-col max-h-full ${
        isDragOver ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {stage.name}
            </h3>
            <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {opportunities.length}
            </span>
          </div>
          <button
            onClick={() => onAddOpportunity(stage.id)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatCurrency(totalValue)}</span>
          <span>{stage.probability}% Chance</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {opportunities.map((opp) => (
          <OpportunityCard
            key={opp.id}
            opportunity={opp}
            stages={stages}
            onEdit={onEditOpportunity}
            onMove={onMoveOpportunity}
            onDelete={onDeleteOpportunity}
          />
        ))}

        {opportunities.length === 0 && (
          <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">
            Keine Opportunities
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Opportunity Form Modal
// ============================================

interface OpportunityFormProps {
  opportunity?: Opportunity;
  initialStageId?: string;
  stages: PipelineStage[];
  customers: Customer[];
  onSave: (opp: Opportunity) => void;
  onCancel: () => void;
}

const OpportunityForm: React.FC<OpportunityFormProps> = ({
  opportunity,
  initialStageId,
  stages,
  customers,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(opportunity?.name || '');
  const [description, setDescription] = useState(opportunity?.description || '');
  const [customerId, setCustomerId] = useState(opportunity?.customer_id || '');
  const [stageId, setStageId] = useState(opportunity?.stage_id || initialStageId || stages[0]?.id || '');
  const [value, setValue] = useState(opportunity?.value?.toString() || '');
  const [probability, setProbability] = useState(opportunity?.probability?.toString() || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    opportunity?.expected_close_date?.split('T')[0] || ''
  );
  const [nextStep, setNextStep] = useState(opportunity?.next_step || '');
  const [notes, setNotes] = useState(opportunity?.notes || '');
  const [saving, setSaving] = useState(false);

  // Update probability when stage changes
  useEffect(() => {
    if (!opportunity) {
      const stage = stages.find((s) => s.id === stageId);
      if (stage) {
        setProbability(stage.probability.toString());
      }
    }
  }, [stageId, stages, opportunity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      const data: Partial<Opportunity> = {
        name: name.trim(),
        description: description.trim() || undefined,
        customer_id: customerId || undefined,
        stage_id: stageId,
        value: value ? parseFloat(value) : undefined,
        probability: probability ? parseInt(probability) : undefined,
        expected_close_date: expectedCloseDate || undefined,
        next_step: nextStep.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      let result: Opportunity;
      if (opportunity) {
        result = await opportunitiesApi.update(opportunity.id, data);
      } else {
        result = await opportunitiesApi.create(data);
      }
      onSave(result);
    } catch (err) {
      console.error('Failed to save opportunity:', err);
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="z.B. Website Redesign"
          required
        />
      </div>

      {/* Customer */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Kunde
        </label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">Kein Kunde</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Value & Probability */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Wert (EUR)
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={0}
            step={100}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="10000"
          />
        </div>
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
      </div>

      {/* Stage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Pipeline-Phase
        </label>
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.probability}%)
            </option>
          ))}
        </select>
      </div>

      {/* Expected Close Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Erwarteter Abschluss
        </label>
        <input
          type="date"
          value={expectedCloseDate}
          onChange={(e) => setExpectedCloseDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Next Step */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Nachster Schritt
        </label>
        <input
          type="text"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder="z.B. Demo vereinbaren"
        />
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
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium"
        >
          {saving ? 'Speichern...' : opportunity ? 'Aktualisieren' : 'Erstellen'}
        </button>
      </div>
    </form>
  );
};

// ============================================
// Stats Dashboard Component
// ============================================

interface StatsDashboardProps {
  stats: OpportunityStats | null;
  loading: boolean;
}

const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
          <Target size={16} />
          Pipeline-Wert
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatCurrency(stats.summary.open_value)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Gewichtet: {formatCurrency(stats.summary.weighted_value)}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
          <TrendingUp size={16} />
          Win-Rate
        </div>
        <div className="text-2xl font-bold text-green-600">
          {stats.win_rate}%
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Letzte 90 Tage
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
          <Award size={16} />
          Gewonnen diesen Monat
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatCurrency(stats.summary.won_this_month)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {stats.summary.won_count} Deals gewonnen
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
          <Clock size={16} />
          Bald abschliessend
        </div>
        <div className="text-2xl font-bold text-orange-600">
          {stats.closing_soon.count}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {formatCurrency(stats.closing_soon.value)} in 30 Tagen
        </div>
      </div>
    </div>
  );
};

// ============================================
// Main Component
// ============================================

const SalesPipeline: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineView | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stats, setStats] = useState<OpportunityStats | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [initialStageId, setInitialStageId] = useState<string | null>(null);
  const [deleteOpportunity, setDeleteOpportunity] = useState<Opportunity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pipelineRes, stagesRes, statsRes, customersRes] = await Promise.all([
        opportunitiesApi.getPipeline(),
        pipelineStagesApi.getAll(),
        opportunitiesApi.getStats(),
        customersApi.getAll(),
      ]);

      setPipeline(pipelineRes);
      setStages(stagesRes);
      setStats(statsRes);
      setCustomers(customersRes.data || []);
    } catch (err) {
      console.error('Failed to load pipeline:', err);
      setError('Fehler beim Laden der Pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOpportunity = (stageId: string) => {
    setEditingOpportunity(null);
    setInitialStageId(stageId);
    setShowForm(true);
  };

  const handleEditOpportunity = (opp: Opportunity) => {
    setEditingOpportunity(opp);
    setInitialStageId(null);
    setShowForm(true);
  };

  const handleSaveOpportunity = async (opp: Opportunity) => {
    // Reload pipeline to get updated data
    await loadData();
    setShowForm(false);
    setEditingOpportunity(null);
    setInitialStageId(null);
  };

  const handleMoveOpportunity = async (opp: Opportunity, stageId: string) => {
    try {
      await opportunitiesApi.move(opp.id, stageId);
      await loadData();
    } catch (err) {
      console.error('Failed to move opportunity:', err);
      alert('Fehler beim Verschieben');
    }
  };

  const handleDropOpportunity = async (opportunityId: string, stageId: string) => {
    try {
      await opportunitiesApi.move(opportunityId, stageId);
      await loadData();
    } catch (err) {
      console.error('Failed to move opportunity:', err);
    }
  };

  const handleDeleteOpportunity = async () => {
    if (!deleteOpportunity) return;

    try {
      setDeleting(true);
      await opportunitiesApi.delete(deleteOpportunity.id);
      await loadData();
      setDeleteOpportunity(null);
    } catch (err) {
      console.error('Failed to delete opportunity:', err);
      alert('Fehler beim Loschen');
    } finally {
      setDeleting(false);
    }
  };

  // Filter opportunities by search
  const filterOpportunities = (opportunities: Opportunity[]) => {
    if (!searchQuery.trim()) return opportunities;
    const query = searchQuery.toLowerCase();
    return opportunities.filter(
      (o) =>
        o.name.toLowerCase().includes(query) ||
        o.customer_name?.toLowerCase().includes(query) ||
        o.description?.toLowerCase().includes(query)
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <AlertCircle size={48} className="mb-4 text-red-500" />
        <p>{error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sales Pipeline
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pipeline?.totals.total_opportunities || 0} offene Opportunities
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
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => handleAddOpportunity(stages[0]?.id || '')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Plus size={18} />
            Neue Opportunity
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsDashboard stats={stats} loading={!stats} />

      {/* Pipeline Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-h-full pb-4">
          {pipeline?.pipeline.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              opportunities={filterOpportunities(stage.opportunities || [])}
              stages={stages}
              onAddOpportunity={handleAddOpportunity}
              onEditOpportunity={handleEditOpportunity}
              onMoveOpportunity={handleMoveOpportunity}
              onDeleteOpportunity={setDeleteOpportunity}
              onDrop={handleDropOpportunity}
            />
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingOpportunity ? 'Opportunity bearbeiten' : 'Neue Opportunity'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <OpportunityForm
                opportunity={editingOpportunity || undefined}
                initialStageId={initialStageId || undefined}
                stages={stages}
                customers={customers}
                onSave={handleSaveOpportunity}
                onCancel={() => {
                  setShowForm(false);
                  setEditingOpportunity(null);
                  setInitialStageId(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteOpportunity}
        onClose={() => setDeleteOpportunity(null)}
        onConfirm={handleDeleteOpportunity}
        title="Opportunity loschen"
        message={`Mochtest du "${deleteOpportunity?.name}" wirklich loschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText={deleting ? 'Loschen...' : 'Loschen'}
        variant="danger"
      />
    </div>
  );
};

export default SalesPipeline;
