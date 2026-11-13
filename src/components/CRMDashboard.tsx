/**
 * CRM Dashboard - Sales & Customer Relationship Overview
 *
 * Provides a comprehensive view of:
 * - Sales Pipeline with opportunities
 * - Customer health metrics
 * - Follow-up tasks and reminders
 * - Recent interactions
 * - Key performance indicators
 */

import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
  DollarSign,
  CheckCircle2,
  Heart,
  Activity,
  FileSignature,
  RefreshCw,
  BarChart3,
  } from 'lucide-react';
import { Customer, Project } from '../types';
import {
  interactionsApi,
  contractsApi,
  opportunitiesApi,
  pipelineStagesApi,
  customersApi,
  sevdeskApi,
  Interaction,
  Opportunity,
  CustomerHealthEntry,
} from '../services/api';
import { StatWidget } from './ui/StatWidget';

// ============================================
// Types
// ============================================

interface CRMDashboardProps {
  customers: Customer[];
  projects: Project[];
  onNavigateToCustomer?: (customerId: string) => void;
  onNavigateToOpportunity?: (opportunityId: string) => void;
}

// ============================================
// Helper Functions
// ============================================

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return formatDate(dateStr);
};

// ============================================
// Sub-Components
// ============================================

// Farb-Palette für die dynamischen Pipeline-Stages (nach Wahrscheinlichkeit sortiert)
const PIPELINE_STAGE_COLORS = ['bg-gray-500', 'bg-blue-500', 'bg-yellow-500', 'bg-orange-500', 'bg-green-500'];

interface PipelineCardProps {
  stage: string;
  stageLabel: string;
  opportunities: Opportunity[];
  color: string;
  onOpportunityClick: (opp: Opportunity) => void;
}

const PipelineCard: React.FC<PipelineCardProps> = ({
  stageLabel,
  opportunities,
  color,
  onOpportunityClick,
}) => {
  const totalValue = opportunities.reduce((sum, o) => sum + (Number(o.value) || 0), 0);

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
      <div className={`px-4 py-3 ${color}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{stageLabel}</h3>
          <span className="bg-white/20 text-white text-sm px-2 py-0.5 rounded-full">
            {opportunities.length}
          </span>
        </div>
        <p className="text-white/80 text-sm mt-1">{formatCurrency(totalValue)}</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-64 overflow-y-auto">
        {opportunities.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-dark-400 text-sm">
            Keine Opportunities
          </div>
        ) : (
          opportunities.slice(0, 5).map(opp => (
            <button
              key={opp.id}
              onClick={() => onOpportunityClick(opp)}
              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
            >
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {opp.name}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500 dark:text-dark-400">
                  {opp.customer_name || 'Unbekannt'}
                </span>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(Number(opp.value) || 0)}
                </span>
              </div>
              {opp.expected_close_date && (
                <p className="text-xs text-gray-400 mt-1">
                  Abschluss: {formatDate(opp.expected_close_date)}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

interface FollowUpItemProps {
  interaction: Interaction;
  onComplete: (id: string) => void;
  onClick: () => void;
}

const FollowUpItem: React.FC<FollowUpItemProps> = ({ interaction, onComplete, onClick }) => {
  const isOverdue = interaction.follow_up_date && new Date(interaction.follow_up_date) < new Date();

  return (
    <button
      onClick={onClick}
      className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
    >
      <div className={`p-2 rounded-lg ${
        isOverdue
          ? 'bg-red-100 dark:bg-red-900/30'
          : 'bg-accent-lighter dark:bg-accent-primary/30'
      }`}>
        {interaction.type === 'call' ? (
          <Phone size={16} className={isOverdue ? 'text-red-600' : 'text-accent-primary'} />
        ) : interaction.type === 'email' ? (
          <Mail size={16} className={isOverdue ? 'text-red-600' : 'text-accent-primary'} />
        ) : (
          <Calendar size={16} className={isOverdue ? 'text-red-600' : 'text-accent-primary'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {interaction.follow_up_notes || interaction.subject || 'Follow-up'}
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
          {interaction.customer_name}
        </p>
        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
          {interaction.follow_up_date ? formatDate(interaction.follow_up_date) : 'Kein Datum'}
          {isOverdue && ' (überfällig)'}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onComplete(interaction.id);
        }}
        className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-400 hover:text-green-600 transition-colors"
        title="Als erledigt markieren"
      >
        <CheckCircle2 size={18} />
      </button>
    </button>
  );
};

interface RecentInteractionProps {
  interaction: Interaction;
  onClick: () => void;
}

const RecentInteraction: React.FC<RecentInteractionProps> = ({ interaction, onClick }) => {
  const typeIcons: Record<string, React.ElementType> = {
    call: Phone,
    email: Mail,
    meeting: Users,
    demo: Target,
    support: MessageSquare,
    followup: Calendar,
    note: MessageSquare,
  };

  const typeColors: Record<string, string> = {
    call: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    email: 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary',
    meeting: 'bg-accent-lighter dark:bg-accent-primary/20 text-accent-primary dark:text-accent-primary',
    demo: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    support: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    followup: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    note: 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400',
  };

  const Icon = typeIcons[interaction.type] || MessageSquare;

  return (
    <button
      onClick={onClick}
      className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
    >
      <div className={`p-2 rounded-lg ${typeColors[interaction.type]}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {interaction.subject || interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1)}
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
          {interaction.customer_name}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {getRelativeTime(interaction.occurred_at)}
        </p>
      </div>
      {interaction.outcome && (
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          interaction.outcome === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
          interaction.outcome === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
          'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400'
        }`}>
          {interaction.outcome === 'positive' ? '+' : interaction.outcome === 'negative' ? '-' : '○'}
        </span>
      )}
    </button>
  );
};

interface CustomerHealthListProps {
  entries: CustomerHealthEntry[];
  customersById: Map<string, Customer>;
  onCustomerClick: (customerId: string) => void;
}

const CustomerHealthList: React.FC<CustomerHealthListProps> = ({ entries, customersById, onCustomerClick }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-dark-border">
      {entries.map((entry) => {
        const negativeFactors = entry.factors.filter(f => f.impact === 'negative');
        return (
          <button
            key={entry.id}
            onClick={() => onCustomerClick(entry.id)}
            className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
            title={entry.factors.map(f => f.label).join(' · ')}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: customersById.get(entry.id)?.color || '#6366f1' }}
            >
              {entry.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {entry.name}
              </p>
              {negativeFactors.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                  {negativeFactors.map(f => f.label).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${getScoreColor(entry.score)}`}>
                {entry.score}
              </span>
              {entry.trend === 'up' && <TrendingUp size={14} className="text-green-500" />}
              {entry.trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
              {entry.trend === 'stable' && <Activity size={14} className="text-gray-400" />}
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

// Umrechnung der Vertrags-Zyklen auf einen Monatswert (one_time/per_call
// sind nicht wiederkehrend und zählen nicht ins MRR)
const CYCLE_MONTHLY_FACTOR: Record<string, number> = {
  monthly: 1,
  quarterly: 1 / 3,
  semi_annual: 1 / 6,
  annual: 1 / 12,
};

export const CRMDashboard: React.FC<CRMDashboardProps> = ({
  customers,
  onNavigateToCustomer,
  onNavigateToOpportunity,
}) => {
  const queryClient = useQueryClient();

  const oppsQuery = useQuery({
    queryKey: ['crm', 'opportunities'],
    queryFn: () => opportunitiesApi.getAll(),
  });
  const stagesQuery = useQuery({
    queryKey: ['crm', 'stages'],
    queryFn: () => pipelineStagesApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });
  const interactionsQuery = useQuery({
    queryKey: ['crm', 'interactions'],
    queryFn: () => interactionsApi.getAll({ limit: 20 }),
  });
  const followUpsQuery = useQuery({
    queryKey: ['crm', 'followups'],
    queryFn: () => interactionsApi.getFollowUps(),
  });
  const contractsQuery = useQuery({
    queryKey: ['crm', 'contracts'],
    queryFn: () => contractsApi.getContracts(),
  });
  // Die EINE Health-Score-Quelle (ersetzt die alten Math.random-Platzhalter)
  const healthQuery = useQuery({
    queryKey: ['crm', 'health'],
    queryFn: () => customersApi.getHealthOverview(),
    staleTime: 60 * 1000,
  });
  // Lizenz-MRR: 403 ohne Billing-Paket → dann zählt nur der Vertrags-Anteil
  const licenseMrrQuery = useQuery({
    queryKey: ['crm', 'licenseMrr'],
    queryFn: () => sevdeskApi.getLicenseMrr(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const opportunities = oppsQuery.data?.opportunities ?? [];
  const contracts = contractsQuery.data?.data ?? [];
  const recentInteractions = interactionsQuery.data?.interactions ?? [];
  const pendingFollowUps = followUpsQuery.data?.follow_ups ?? [];
  const isLoading = oppsQuery.isLoading || contractsQuery.isLoading || healthQuery.isLoading;

  const customersById = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const activeOpps = opportunities.filter(o => o.status !== 'won' && o.status !== 'lost');
    // Number(): die API liefert numerics als String — ohne Cast konkateniert
    // reduce die Werte und das KPI zeigt „NaN €"
    const pipelineValue = activeOpps.reduce((sum, o) => sum + (Number(o.value) || 0), 0);
    const weightedPipelineValue = activeOpps.reduce(
      (sum, o) => sum + (Number(o.value) || 0) * ((o.stage_probability ?? 0) / 100), 0
    );

    // MRR ehrlich: ALLE wiederkehrenden Zyklen auf Monat umgelegt + Lizenz-VK
    // des jüngsten Belegmonats (vorher zählten nur monthly-Verträge → 0 €)
    const contractMrr = contracts
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + (c.basePrice || 0) * (CYCLE_MONTHLY_FACTOR[c.billingCycle || ''] ?? 0), 0);
    const licenseMrr = licenseMrrQuery.data?.resellMrr ?? 0;

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const interactionsThisWeek = recentInteractions.filter(
      i => new Date(i.occurred_at).getTime() > oneWeekAgo
    ).length;

    return {
      totalCustomers: customers.length,
      activeCustomers: customers.length,
      totalOpportunities: activeOpps.length,
      pipelineValue,
      weightedPipelineValue,
      contractMrr,
      licenseMrr,
      monthlyRecurring: contractMrr + licenseMrr,
      avgHealthScore: healthQuery.data?.averageScore ?? null,
      pendingFollowUps: pendingFollowUps.length,
      interactionsThisWeek,
    };
  }, [customers, opportunities, contracts, recentInteractions, pendingFollowUps, healthQuery.data, licenseMrrQuery.data]);

  // Funnel: ALLE Stages der Org zeigen (vorher verschwanden leere Stages —
  // bei 2 Opportunities sah die Pipeline aus wie eine einzelne Karte im Nichts)
  const pipelineStages = useMemo(() => {
    const open = opportunities.filter(o => o.status !== 'won' && o.status !== 'lost');
    const byStage = new Map<string, Opportunity[]>();
    for (const o of open) {
      const key = o.stage_id || 'none';
      byStage.set(key, [...(byStage.get(key) ?? []), o]);
    }

    const stages = (stagesQuery.data ?? [])
      .filter(s => !s.is_won && !s.is_lost)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(s => ({
        id: s.id,
        label: s.name,
        probability: s.probability,
        opportunities: byStage.get(s.id) ?? [],
      }));

    const knownIds = new Set(stages.map(s => s.id));
    const orphans = open.filter(o => !o.stage_id || !knownIds.has(o.stage_id));
    if (orphans.length > 0) {
      stages.push({ id: 'none', label: 'Ohne Phase', probability: 0, opportunities: orphans });
    }
    return stages;
  }, [opportunities, stagesQuery.data]);

  const healthList = useMemo(
    () => (healthQuery.data?.customers ?? []).slice().sort((a, b) => a.score - b.score),
    [healthQuery.data]
  );

  const completeFollowUpMutation = useMutation({
    mutationFn: (interactionId: string) => interactionsApi.completeFollowUp(interactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'interactions'] });
    },
  });
  const handleCompleteFollowUp = (interactionId: string) => completeFollowUpMutation.mutate(interactionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={32} className="animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BarChart3 size={28} className="text-accent-primary dark:text-accent-primary" />
            CRM Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Übersicht über Kundenbeziehungen und Sales Pipeline
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-dark-400">Pipeline-Wert</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">
                {formatCurrency(stats.pipelineValue)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-accent-lighter dark:bg-accent-primary/30 flex-shrink-0">
              <Target size={24} className="text-accent-primary" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2 truncate">
            gewichtet: {formatCurrency(stats.weightedPipelineValue)}
          </p>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-gray-500 dark:text-dark-400">Monatl. Wiederkehrend</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">
                {formatCurrency(stats.monthlyRecurring)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 flex-shrink-0">
              <DollarSign size={24} className="text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2 truncate">
            {formatCurrency(stats.contractMrr)} Verträge · {formatCurrency(stats.licenseMrr)} Lizenzen
          </p>
        </div>

        <StatWidget
          label="Offene Follow-Ups"
          value={stats.pendingFollowUps}
          icon={Calendar}
          color={stats.pendingFollowUps > 5 ? 'red' : 'orange'}
        />
        <StatWidget
          label="Interaktionen (Woche)"
          value={stats.interactionsThisWeek}
          icon={MessageSquare}
          color="purple"
        />
      </div>

      {/* Sales Pipeline */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Target size={20} className="text-accent-primary dark:text-accent-primary" />
          Sales Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {pipelineStages.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center text-gray-500 dark:text-dark-400 text-sm">
              Keine offenen Verkaufschancen
            </div>
          ) : (
            pipelineStages.map((stage, index) => (
              <div key={stage.id} className={stage.opportunities.length === 0 ? 'opacity-50' : ''}>
                <PipelineCard
                  stage={stage.id}
                  stageLabel={stage.label}
                  opportunities={stage.opportunities}
                  color={stage.opportunities.length === 0
                    ? 'bg-gray-400 dark:bg-dark-300'
                    : PIPELINE_STAGE_COLORS[index % PIPELINE_STAGE_COLORS.length]}
                  onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Follow-Ups */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar size={18} className="text-orange-500" />
              Offene Follow-Ups
            </h3>
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
              pendingFollowUps.length > 5
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            }`}>
              {pendingFollowUps.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-80 overflow-y-auto">
            {pendingFollowUps.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                <p className="text-sm">Alle Follow-Ups erledigt!</p>
              </div>
            ) : (
              pendingFollowUps.map(interaction => (
                <FollowUpItem
                  key={interaction.id}
                  interaction={interaction}
                  onComplete={handleCompleteFollowUp}
                  onClick={() => onNavigateToCustomer?.(interaction.customer_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Recent Interactions */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare size={18} className="text-accent-primary" />
              Letzte Interaktionen
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-80 overflow-y-auto">
            {recentInteractions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Keine Interaktionen</p>
              </div>
            ) : (
              recentInteractions.slice(0, 8).map(interaction => (
                <RecentInteraction
                  key={interaction.id}
                  interaction={interaction}
                  onClick={() => onNavigateToCustomer?.(interaction.customer_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Customer Health */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Heart size={18} className="text-red-500" />
              Kundengesundheit
            </h3>
            <span className="text-xs text-gray-500 dark:text-dark-400">
              Niedrigste zuerst
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {healthList.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                <Heart size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Keine Kunden</p>
              </div>
            ) : (
              <CustomerHealthList
                entries={healthList}
                customersById={customersById}
                onCustomerClick={(id) => onNavigateToCustomer?.(id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-400">Aktive Kunden</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.activeCustomers}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-accent-lighter dark:bg-accent-primary/30">
              <Users size={24} className="text-accent-primary dark:text-accent-primary" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
            von {stats.totalCustomers} gesamt
          </p>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-400">Opportunities</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.totalOpportunities}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Target size={24} className="text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
            in der Pipeline
          </p>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-400">Aktive Verträge</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {contracts.filter(c => c.status === 'active').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <FileSignature size={24} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
            laufende Verträge
          </p>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-400">Ø Health Score</p>
              <p className={`text-2xl font-bold mt-1 ${
                stats.avgHealthScore === null ? 'text-gray-400 dark:text-dark-400' :
                stats.avgHealthScore >= 80 ? 'text-green-600 dark:text-green-400' :
                stats.avgHealthScore >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {stats.avgHealthScore ?? '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Heart size={24} className="text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
            über alle Kunden
          </p>
        </div>
      </div>
    </div>
  );
};

export default CRMDashboard;
