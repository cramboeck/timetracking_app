import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  X,
  Edit2,
  Trash2,
  DollarSign,
  Calendar,
  User,
  TrendingUp,
  Target,
  Award,
  AlertCircle,
  Clock,
  MoreVertical,
  Search,
  FileText,
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
import { customersApi, leadsApi, Lead, organizationsApi, OrganizationMember } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CustomerEditDialog } from './CustomerEditDialog';
import { ModernDatePicker } from './ModernDatePicker';
import { SearchableSelect } from './SearchableSelect';
import { LeadForm } from './Leads';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, IconButton } from './ui/Button';
import { useToast } from '../contexts/UIContext';
import { QuoteEditor } from './QuoteEditor';

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
      className={`group bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-accent-primary/40 dark:hover:border-accent-primary transition-all ${
        isDragging ? 'opacity-50 rotate-2 scale-105' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
          {opportunity.name}
        </h4>
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
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-dark-100 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border py-1 min-w-[140px]">
                <Button
                  onClick={() => {
                    setShowMenu(false);
                    onEdit(opportunity);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={<Edit2 size={14} />}
                  className="w-full justify-start rounded-none"
                >
                  Bearbeiten
                </Button>
                <div className="border-t border-gray-200 dark:border-dark-border my-1" />
                <div className="px-3 py-1 text-xs text-gray-500 uppercase">Verschieben zu</div>
                {stages
                  .filter((s) => s.id !== opportunity.stage_id)
                  .map((stage) => (
                    <Button
                      key={stage.id}
                      onClick={() => {
                        setShowMenu(false);
                        onMove(opportunity, stage.id);
                      }}
                      variant="ghost"
                      size="sm"
                      icon={<div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />}
                      className="w-full justify-start rounded-none"
                    >
                      {stage.name}
                    </Button>
                  ))}
                <div className="border-t border-gray-200 dark:border-dark-border my-1" />
                <Button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(opportunity);
                  }}
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

      {/* Customer */}
      {opportunity.customer_name && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-dark-400 mb-2">
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
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-400">
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
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border text-xs text-gray-500 dark:text-dark-400">
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
  onDropLead?: (leadId: string, stageId: string) => void;
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
  onDropLead,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  // Number(): API liefert numerics als String — sonst konkateniert reduce → „NaN €"
  const totalValue = opportunities.reduce((sum, o) => sum + (Number(o.value) || 0), 0);

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
    // Verschmolzenes Board: ein Lead, der auf eine Stage gezogen wird,
    // startet den Qualifizieren-Flow (Opportunity entsteht erst im Dialog)
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId && onDropLead) {
      onDropLead(leadId, stage.id);
      return;
    }
    const opportunityId = e.dataTransfer.getData('opportunityId');
    if (opportunityId) {
      onDrop(opportunityId, stage.id);
    }
  };

  return (
    <div
      className={`flex-shrink-0 w-72 bg-gray-100 dark:bg-dark-100/50 rounded-xl flex flex-col max-h-full ${
        isDragOver ? 'ring-2 ring-accent-primary ring-opacity-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {stage.name}
            </h3>
            <span className="text-xs text-gray-500 bg-gray-200 dark:bg-dark-200 px-1.5 py-0.5 rounded">
              {opportunities.length}
            </span>
          </div>
          <IconButton
            onClick={() => onAddOpportunity(stage.id)}
            icon={<Plus size={16} />}
            size="sm"
            tooltip="Opportunity hinzufügen"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-dark-400">
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
          <div className="text-center py-4 text-gray-400 dark:text-dark-400 text-sm">
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
  /** Inline neu angelegter Kunde → Parent aktualisiert seine Liste */
  onCustomerCreated?: (customer: Customer) => void;
}

const formFieldClasses = 'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 text-sm';
const formLabelClasses = 'block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1';

// Erwarteter Abschluss: letzte Tage von Monat/Quartal als YYYY-MM-DD
const endOfMonth = (): string => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
};
const endOfQuarter = (): string => {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().split('T')[0];
};
const inDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const OpportunityForm: React.FC<OpportunityFormProps> = ({
  opportunity,
  initialStageId,
  stages,
  customers,
  onSave,
  onCancel,
  onCustomerCreated,
}) => {
  const showToast = useToast();
  const { currentUser } = useAuth();
  const [name, setName] = useState(opportunity?.name || '');
  const [description, setDescription] = useState(opportunity?.description || '');
  const [customerId, setCustomerId] = useState(opportunity?.customer_id || '');
  const [stageId, setStageId] = useState(opportunity?.stage_id || initialStageId || stages[0]?.id || '');
  const [value, setValue] = useState(opportunity?.value?.toString() || '');
  // Abschlussdatum treibt den Forecast — bei Neuanlage mit Monatsende
  // vorbefüllt (HubSpot-Muster) statt leer
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    opportunity?.expected_close_date?.split('T')[0] || endOfMonth()
  );
  const [nextStep, setNextStep] = useState(opportunity?.next_step || '');
  const [nextStepDate, setNextStepDate] = useState(opportunity?.next_step_date?.split('T')[0] || '');
  const [assignedTo, setAssignedTo] = useState(opportunity?.assigned_to || currentUser?.id || '');
  const [source, setSource] = useState(opportunity?.source || '');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  // Wahrscheinlichkeit ist eine Eigenschaft der Phase, kein Eingabefeld
  // (Pipedrive/Salesforce-Muster — vorher gab es ZWEI Wahrheiten dafür)
  const openStages = useMemo(() => stages.filter(s => !s.is_won && !s.is_lost), [stages]);
  const selectedStage = stages.find(s => s.id === stageId);
  const probability = selectedStage?.probability ?? 0;
  const numericValue = value.trim() ? parseFloat(value) : 0;
  const weightedValue = (Number(numericValue) || 0) * probability / 100;

  const teamMembersQuery = useQuery({
    queryKey: ['teamMembers', 'current'],
    queryFn: async () => {
      const orgResponse = await organizationsApi.getCurrent();
      if (!orgResponse.success || !orgResponse.data) return [] as OrganizationMember[];
      const membersResponse = await organizationsApi.getMembers(orgResponse.data.id);
      return (membersResponse.success ? membersResponse.data : []) as OrganizationMember[];
    },
    staleTime: 5 * 60_000,
  });
  const teamMembers = teamMembersQuery.data ?? [];

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
        value: value.trim() ? parseFloat(value) : undefined,
        probability,
        expected_close_date: expectedCloseDate || undefined,
        next_step: nextStep.trim() || undefined,
        next_step_date: nextStepDate || undefined,
        assigned_to: assignedTo || undefined,
        source: source || undefined,
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
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCustomerCreated = async (customerData: Partial<Customer> & { name: string; color: string }) => {
    try {
      const response = await customersApi.create(customerData as Omit<Customer, 'id' | 'userId' | 'createdAt'>);
      if (response.success && response.data) {
        onCustomerCreated?.(response.data);
        setCustomerId(response.data.id);
        showToast(`Kunde „${response.data.name}" angelegt`, 'success');
      }
    } catch (err) {
      console.error('Failed to create customer:', err);
      showToast('Kunde konnte nicht angelegt werden', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className={formLabelClasses}>
          Titel <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={formFieldClasses}
          placeholder="z.B. Server-Erneuerung inkl. Backup"
          autoFocus
          required
        />
      </div>

      {/* Phase als visueller Stepper — Wahrscheinlichkeit kommt aus der Phase */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={formLabelClasses.replace(' mb-1', '')}>Phase</label>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-light dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary">
            {probability}% Abschlusswahrscheinlichkeit
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {openStages.map((stage) => {
            const isActive = stage.id === stageId;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setStageId(stage.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-xl text-sm border transition-all ${
                  isActive
                    ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary font-semibold'
                    : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#9ca3af' }} />
                {stage.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Kunde: durchsuchbar + inline neu anlegbar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={formLabelClasses.replace(' mb-1', '')}>Kunde</label>
          <button
            type="button"
            onClick={() => setShowNewCustomer(true)}
            className="text-xs text-accent-primary hover:underline flex items-center gap-0.5"
          >
            <Plus size={12} /> Neuer Kunde
          </button>
        </div>
        <SearchableSelect
          options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.customerNumber ? `#${c.customerNumber}` : undefined }))}
          value={customerId}
          onChange={setCustomerId}
          placeholder="Kunde suchen…"
          emptyMessage="Kein Kunde gefunden"
          allowClear
        />
      </div>

      {/* Wert + gewichteter Wert */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={formLabelClasses}>Wert (€)</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={0}
            step={100}
            className={formFieldClasses}
            placeholder="10.000"
          />
        </div>
        <div>
          <label className={formLabelClasses}>Gewichtet (Forecast)</label>
          <div className={`${formFieldClasses} bg-gray-100 dark:bg-dark-300/50 text-gray-500 dark:text-dark-400 cursor-default`}>
            {formatCurrency(weightedValue)}
          </div>
        </div>
      </div>

      {/* Erwarteter Abschluss mit Quick-Chips */}
      <div>
        <label className={formLabelClasses}>Erwarteter Abschluss</label>
        <div className="flex flex-wrap items-center gap-2">
          <ModernDatePicker value={expectedCloseDate} onChange={setExpectedCloseDate} compact />
          {([
            ['Ende Monat', endOfMonth],
            ['Ende Quartal', endOfQuarter],
            ['+30 Tage', () => inDays(30)],
          ] as const).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              onClick={() => setExpectedCloseDate(fn())}
              className="px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-accent-light hover:text-accent-dark dark:hover:bg-accent-primary/20 dark:hover:text-accent-primary transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bearbeiter + Quelle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={formLabelClasses}>Bearbeiter</label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className={formFieldClasses}
          >
            <option value="">— Niemand —</option>
            {teamMembers.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name || m.username}{m.user_id === currentUser?.id ? ' (ich)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={formLabelClasses}>Quelle</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className={formFieldClasses}
          >
            <option value="">— Keine —</option>
            {Object.entries(LEAD_SOURCE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Nächster Schritt + Datum */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <div>
          <label className={formLabelClasses}>Nächster Schritt</label>
          <input
            type="text"
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            className={formFieldClasses}
            placeholder="z.B. Demo vereinbaren"
          />
        </div>
        <div>
          <label className={formLabelClasses}>Bis wann</label>
          <ModernDatePicker value={nextStepDate} onChange={setNextStepDate} compact />
        </div>
      </div>

      {/* Beschreibung — kompakt statt halbem Dialog */}
      <div>
        <label className={formLabelClasses}>Beschreibung</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${formFieldClasses} resize-none`}
          placeholder="Optional"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
        <Button type="button" onClick={onCancel} variant="secondary">
          Abbrechen
        </Button>
        <Button type="submit" disabled={!name.trim()} loading={saving} variant="primary">
          {opportunity ? 'Aktualisieren' : 'Erstellen'}
        </Button>
      </div>

      {/* Inline-Kundenanlage (gleicher Dialog wie Settings/CustomerHub) */}
      <CustomerEditDialog
        isOpen={showNewCustomer}
        customer={null}
        projects={[]}
        onClose={() => setShowNewCustomer(false)}
        onSave={handleCustomerCreated}
      />
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
          <div key={i} className="bg-white dark:bg-dark-100 rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-dark-200 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-dark-200 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
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

      <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
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

      <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
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

      <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
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

// ============================================
// Leads-Eingangsspalte (CRM-2 „Verschmelzen", 13.11.2026)
// Leads leben jetzt IM Pipeline-Board: Drag auf eine Stage qualifiziert
// den Lead (Dialog erzeugt Kunde optional + Opportunity). Der frühere
// separate Leads-Kanban ist aus der Navigation raus.
// ============================================

interface LeadColumnProps {
  leads: Lead[];
  onAddLead: () => void;
  onQualify: (lead: Lead) => void;
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: 'Website', referral: 'Empfehlung', cold_call: 'Kaltakquise',
  email: 'E-Mail', social_media: 'Social Media', event: 'Event',
  partner: 'Partner', other: 'Sonstiges',
};

const LeadColumn: React.FC<LeadColumnProps> = ({ leads, onAddLead, onQualify }) => {
  const totalValue = leads.reduce((sum, l) => sum + (Number(l.estimatedValue) || 0), 0);

  return (
    <div className="flex-shrink-0 w-72 bg-gray-100 dark:bg-dark-100/50 rounded-xl flex flex-col max-h-full border-2 border-dashed border-gray-300 dark:border-dark-border">
      <div className="p-3 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Leads</h3>
            <span className="text-xs bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-400 px-1.5 py-0.5 rounded-full">
              {leads.length}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-dark-400">
          {totalValue > 0 ? formatCurrency(totalValue) : 'Unqualifiziert'} · auf eine Phase ziehen = qualifizieren
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {leads.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-dark-400 text-center py-6">
            Keine offenen Leads
          </p>
        ) : (
          leads.map(lead => (
            <div
              key={lead.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('leadId', lead.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="group bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-accent-primary/40 transition-all"
            >
              <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
                {lead.company || lead.name}
              </h4>
              {lead.company && (
                <p className="text-xs text-gray-500 dark:text-dark-400 truncate mt-0.5">{lead.name}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500 dark:text-dark-400">
                  {lead.source ? (LEAD_SOURCE_LABELS[lead.source] ?? lead.source) : '—'}
                </span>
                {Number(lead.estimatedValue) > 0 && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {formatCurrency(Number(lead.estimatedValue))}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onQualify(lead)}
                className="mt-2 w-full text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-accent-light hover:text-accent-dark dark:hover:bg-accent-primary/20 dark:hover:text-accent-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                Qualifizieren →
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t border-gray-200 dark:border-dark-border">
        <button
          type="button"
          onClick={onAddLead}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-200 transition-colors"
        >
          <Plus size={16} />
          Lead
        </button>
      </div>
    </div>
  );
};

// Qualifizieren-Dialog: macht aus einem Lead eine Opportunity in der
// Ziel-Stage — mit neuem ODER bestehendem Kunden (Brandfarbe statt Blau)
interface QualifyLeadDialogProps {
  lead: Lead;
  targetStage: PipelineStage;
  customers: Customer[];
  onDone: () => void;
  onCancel: () => void;
}

const QualifyLeadDialog: React.FC<QualifyLeadDialogProps> = ({
  lead, targetStage, customers, onDone, onCancel,
}) => {
  const showToast = useToast();
  const [oppName, setOppName] = useState(lead.company || lead.name);
  const [value, setValue] = useState(lead.estimatedValue ? String(lead.estimatedValue) : '');
  const [customerChoice, setCustomerChoice] = useState<string>(lead.customerId || '__new__');
  const [saving, setSaving] = useState(false);

  const handleQualify = async () => {
    if (!oppName.trim()) return;
    try {
      setSaving(true);
      let customerId = lead.customerId;
      if (!customerId) {
        const conv = customerChoice === '__new__'
          ? await leadsApi.convert(lead.id, true, '#FF6A00')
          : await leadsApi.convert(lead.id, false, undefined, customerChoice);
        customerId = conv.customerId ?? (customerChoice !== '__new__' ? customerChoice : undefined);
      } else {
        await leadsApi.convert(lead.id, false);
      }
      await opportunitiesApi.create({
        name: oppName.trim(),
        value: value.trim() ? parseFloat(value) : undefined,
        stage_id: targetStage.id,
        customer_id: customerId,
        lead_id: lead.id,
        source: lead.source,
      });
      showToast(`Lead qualifiziert — „${oppName.trim()}" steht jetzt in „${targetStage.name}"`, 'success');
      onDone();
    } catch (err) {
      console.error('Qualify lead failed:', err);
      showToast('Lead konnte nicht qualifiziert werden', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fieldClasses = 'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Lead qualifizieren</h3>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            „{lead.company || lead.name}" wird zur Verkaufschance in <span className="font-medium">{targetStage.name}</span>
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Titel der Verkaufschance *
            </label>
            <input type="text" value={oppName} onChange={(e) => setOppName(e.target.value)} className={fieldClasses} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Wert (€)
            </label>
            <input
              type="number" min="0" step="100" value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z.B. 5000" className={fieldClasses}
            />
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
              Fließt in Pipeline-Wert und Forecast — ruhig schätzen statt leer lassen.
            </p>
          </div>
          {!lead.customerId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Kunde
              </label>
              <select value={customerChoice} onChange={(e) => setCustomerChoice(e.target.value)} className={fieldClasses}>
                <option value="__new__">Neuen Kunden „{lead.company || lead.name}" anlegen</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <Button variant="secondary" onClick={onCancel} fullWidth>Abbrechen</Button>
          <Button variant="primary" onClick={handleQualify} disabled={!oppName.trim()} loading={saving} fullWidth>
            Qualifizieren
          </Button>
        </div>
      </div>
    </div>
  );
};

const SalesPipeline: React.FC = () => {
  const showToast = useToast();
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

  // Won opportunity state - for creating quotes
  const [wonOpportunity, setWonOpportunity] = useState<Opportunity | null>(null);
  // Verschmolzenes Board: offene Leads als Eingangsspalte
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [qualifyTarget, setQualifyTarget] = useState<{ lead: Lead; stage: PipelineStage } | null>(null);
  const [showQuoteEditor, setShowQuoteEditor] = useState(false);
  const [quoteCustomerSevdeskId, setQuoteCustomerSevdeskId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pipelineRes, stagesRes, statsRes, customersRes, leadsRes] = await Promise.all([
        opportunitiesApi.getPipeline(),
        pipelineStagesApi.getAll(),
        opportunitiesApi.getStats(),
        customersApi.getAll(),
        leadsApi.getAll().catch(() => ({ success: false, data: [] as Lead[] })),
      ]);

      setPipeline(pipelineRes);
      setStages(stagesRes);
      setStats(statsRes);
      setCustomers(customersRes.data || []);
      setLeads((leadsRes.data || []).filter(l => l.status !== 'won' && l.status !== 'lost'));
    } catch (err) {
      console.error('Failed to load pipeline:', err);
      setError('Fehler beim Laden der Pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleDropLead = (leadId: string, stageId: string) => {
    const lead = leads.find(l => l.id === leadId);
    const stage = stages.find(st => st.id === stageId);
    if (lead && stage && !stage.is_won && !stage.is_lost) {
      setQualifyTarget({ lead, stage });
    }
  };

  const handleQualifyClick = (lead: Lead) => {
    const firstStage = stages.find(st => !st.is_won && !st.is_lost);
    if (firstStage) setQualifyTarget({ lead, stage: firstStage });
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

  const handleSaveOpportunity = async (_opp: Opportunity) => {
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

      // Check if moved to a "won" stage
      const targetStage = stages.find(s => s.id === stageId);
      if (targetStage?.is_won && opp.customer_id) {
        // Find customer and check if they have sevDesk link
        const customer = customers.find(c => c.id === opp.customer_id);
        if (customer?.sevdeskCustomerId) {
          setWonOpportunity(opp);
          setQuoteCustomerSevdeskId(customer.sevdeskCustomerId);
        }
      }
    } catch (err) {
      console.error('Failed to move opportunity:', err);
      showToast('Fehler beim Verschieben', 'error');
    }
  };

  const handleDropOpportunity = async (opportunityId: string, stageId: string) => {
    try {
      // Find the opportunity being moved
      let movedOpp: Opportunity | undefined;
      pipeline?.pipeline.forEach(stage => {
        const found = stage.opportunities?.find(o => o.id === opportunityId);
        if (found) movedOpp = found;
      });

      await opportunitiesApi.move(opportunityId, stageId);
      await loadData();

      // Check if moved to a "won" stage
      const targetStage = stages.find(s => s.id === stageId);
      if (targetStage?.is_won && movedOpp?.customer_id) {
        const customer = customers.find(c => c.id === movedOpp?.customer_id);
        if (customer?.sevdeskCustomerId) {
          setWonOpportunity(movedOpp);
          setQuoteCustomerSevdeskId(customer.sevdeskCustomerId);
        }
      }
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
      showToast('Fehler beim Loschen', 'error');
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
          onClick={loadData}
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sales Pipeline
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400">
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
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white w-48 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary"
            />
          </div>
          <Button
            onClick={() => handleAddOpportunity(stages[0]?.id || '')}
            variant="primary"
            icon={<Plus size={18} />}
          >
            Neue Opportunity
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsDashboard stats={stats} loading={!stats} />

      {/* Pipeline Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 min-h-full pb-4">
          <LeadColumn
            leads={leads}
            onAddLead={() => setShowLeadForm(true)}
            onQualify={handleQualifyClick}
          />
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
              onDropLead={handleDropLead}
            />
          ))}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingOpportunity ? 'Opportunity bearbeiten' : 'Neue Opportunity'}
              </h3>
              <IconButton
                onClick={() => setShowForm(false)}
                icon={<X size={20} />}
                tooltip="Schließen"
              />
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
                onCustomerCreated={(c) => setCustomers(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))}
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
        title="Opportunity löschen"
        message={`Möchtest du "${deleteOpportunity?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText={deleting ? 'Löschen...' : 'Löschen'}
        variant="danger"
      />

      {/* Lead anlegen (verschmolzenes Board) */}
      {showLeadForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLeadForm(false)} />
          <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <LeadForm
              onSave={() => { setShowLeadForm(false); loadData(); }}
              onCancel={() => setShowLeadForm(false)}
            />
          </div>
        </div>
      )}

      {/* Lead qualifizieren */}
      {qualifyTarget && (
        <QualifyLeadDialog
          lead={qualifyTarget.lead}
          targetStage={qualifyTarget.stage}
          customers={customers}
          onDone={() => { setQualifyTarget(null); loadData(); }}
          onCancel={() => setQualifyTarget(null)}
        />
      )}

      {/* Won Opportunity - Create Quote Prompt */}
      {wonOpportunity && !showQuoteEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setWonOpportunity(null)} />
          <div className="relative bg-white dark:bg-dark-100 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Award className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Gewonnen!
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  {wonOpportunity.name}
                </p>
              </div>
            </div>

            <p className="text-gray-600 dark:text-dark-400 mb-6">
              Möchtest du direkt ein Angebot für diesen gewonnenen Deal erstellen?
              Der Kunde ist bereits mit sevDesk verknüpft.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={() => setWonOpportunity(null)}
                variant="secondary"
                className="flex-1"
              >
                Später
              </Button>
              <Button
                onClick={() => {
                  setShowQuoteEditor(true);
                }}
                variant="primary"
                icon={<FileText size={18} />}
                className="flex-1"
              >
                Angebot erstellen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quote Editor Modal */}
      {showQuoteEditor && quoteCustomerSevdeskId && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-dark-50">
          <QuoteEditor
            onClose={() => {
              setShowQuoteEditor(false);
              setWonOpportunity(null);
              setQuoteCustomerSevdeskId(null);
            }}
            onSuccess={(quoteNumber) => {
              showToast(`Angebot ${quoteNumber} erstellt`, 'success');
              setShowQuoteEditor(false);
              setWonOpportunity(null);
              setQuoteCustomerSevdeskId(null);
            }}
            preselectedContactId={quoteCustomerSevdeskId}
          />
        </div>
      )}
    </div>
  );
};

export default SalesPipeline;
