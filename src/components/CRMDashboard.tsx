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

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Calendar,
  Clock,
  Phone,
  Mail,
  MessageSquare,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Heart,
  Activity,
  Briefcase,
  FileSignature,
  AlertTriangle,
  RefreshCw,
  Plus,
  Filter,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { Customer, Project } from '../types';
import {
  interactionsApi,
  contractsApi,
  opportunitiesApi,
  Interaction,
  Contract,
  Opportunity,
} from '../services/api';
import { Button } from './ui/Button';
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

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalOpportunities: number;
  pipelineValue: number;
  monthlyRecurring: number;
  avgHealthScore: number;
  pendingFollowUps: number;
  interactionsThisWeek: number;
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

interface PipelineCardProps {
  stage: string;
  stageLabel: string;
  opportunities: Opportunity[];
  color: string;
  onOpportunityClick: (opp: Opportunity) => void;
}

const PipelineCard: React.FC<PipelineCardProps> = ({
  stage,
  stageLabel,
  opportunities,
  color,
  onOpportunityClick,
}) => {
  const totalValue = opportunities.reduce((sum, o) => sum + (o.value || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className={`px-4 py-3 ${color}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{stageLabel}</h3>
          <span className="bg-white/20 text-white text-sm px-2 py-0.5 rounded-full">
            {opportunities.length}
          </span>
        </div>
        <p className="text-white/80 text-sm mt-1">{formatCurrency(totalValue)}</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
        {opportunities.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            Keine Opportunities
          </div>
        ) : (
          opportunities.slice(0, 5).map(opp => (
            <button
              key={opp.id}
              onClick={() => onOpportunityClick(opp)}
              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {opp.title}
              </p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {opp.customer_name || 'Unbekannt'}
                </span>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(opp.value || 0)}
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
      className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
    >
      <div className={`p-2 rounded-lg ${
        isOverdue
          ? 'bg-red-100 dark:bg-red-900/30'
          : 'bg-accent-lighter dark:bg-blue-900/30'
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
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
    email: 'bg-accent-lighter dark:bg-blue-900/30 text-accent-primary dark:text-blue-400',
    meeting: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    demo: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    support: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    followup: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    note: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };

  const Icon = typeIcons[interaction.type] || MessageSquare;

  return (
    <button
      onClick={onClick}
      className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
    >
      <div className={`p-2 rounded-lg ${typeColors[interaction.type]}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {interaction.subject || interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
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
          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {interaction.outcome === 'positive' ? '+' : interaction.outcome === 'negative' ? '-' : '○'}
        </span>
      )}
    </button>
  );
};

interface CustomerHealthListProps {
  customers: { customer: Customer; healthScore: number; trend: 'up' | 'down' | 'stable' }[];
  onCustomerClick: (customerId: string) => void;
}

const CustomerHealthList: React.FC<CustomerHealthListProps> = ({ customers, onCustomerClick }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {customers.map(({ customer, healthScore, trend }) => (
        <button
          key={customer.id}
          onClick={() => onCustomerClick(customer.id)}
          className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: customer.color || '#6366f1' }}
          >
            {customer.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
              {customer.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${getScoreColor(healthScore)}`}>
              {healthScore}
            </span>
            {trend === 'up' && <TrendingUp size={14} className="text-green-500" />}
            {trend === 'down' && <TrendingDown size={14} className="text-red-500" />}
            {trend === 'stable' && <Activity size={14} className="text-gray-400" />}
          </div>
        </button>
      ))}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const CRMDashboard: React.FC<CRMDashboardProps> = ({
  customers,
  projects,
  onNavigateToCustomer,
  onNavigateToOpportunity,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [recentInteractions, setRecentInteractions] = useState<Interaction[]>([]);
  const [pendingFollowUps, setPendingFollowUps] = useState<Interaction[]>([]);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter'>('month');

  // Load dashboard data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [oppsRes, contractsRes, interactionsRes, followUpsRes] = await Promise.all([
          opportunitiesApi.getAll().catch(() => ({ data: [] })),
          contractsApi.getSummary().catch(() => ({ data: { activeContracts: 0, totalMonthlyRevenue: 0 } })),
          interactionsApi.getAll({ limit: 20 }).catch(() => ({ interactions: [] })),
          interactionsApi.getPendingFollowUps().catch(() => ({ interactions: [] })),
        ]);

        setOpportunities(oppsRes.data || []);
        setRecentInteractions(interactionsRes.interactions || []);
        setPendingFollowUps(followUpsRes.interactions || []);

        // Get full contracts list
        const fullContracts = await contractsApi.getContracts().catch(() => ({ data: [] }));
        setContracts(fullContracts.data || []);
      } catch (error) {
        console.error('Error loading CRM dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate stats
  const stats = useMemo((): DashboardStats => {
    const activeCustomers = customers.filter(c => c.isActive !== false).length;
    const activeOpps = opportunities.filter(o => o.status !== 'won' && o.status !== 'lost');
    const pipelineValue = activeOpps.reduce((sum, o) => sum + (o.value || 0), 0);
    const monthlyRecurring = contracts
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + (c.monthlyValue || 0), 0);

    // Calculate average health score (simplified)
    const avgHealthScore = Math.round(70 + Math.random() * 20); // Placeholder

    // Count interactions this week
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const interactionsThisWeek = recentInteractions.filter(
      i => new Date(i.occurred_at).getTime() > oneWeekAgo
    ).length;

    return {
      totalCustomers: customers.length,
      activeCustomers,
      totalOpportunities: activeOpps.length,
      pipelineValue,
      monthlyRecurring,
      avgHealthScore,
      pendingFollowUps: pendingFollowUps.length,
      interactionsThisWeek,
    };
  }, [customers, opportunities, contracts, recentInteractions, pendingFollowUps]);

  // Group opportunities by stage
  const opportunitiesByStage = useMemo(() => {
    const stages = {
      lead: opportunities.filter(o => o.stage === 'lead'),
      qualified: opportunities.filter(o => o.stage === 'qualified'),
      proposal: opportunities.filter(o => o.stage === 'proposal'),
      negotiation: opportunities.filter(o => o.stage === 'negotiation'),
      closing: opportunities.filter(o => o.stage === 'closing'),
    };
    return stages;
  }, [opportunities]);

  // Simulated customer health data (would come from API in production)
  const customerHealthData = useMemo(() => {
    return customers.slice(0, 10).map(customer => ({
      customer,
      healthScore: Math.round(50 + Math.random() * 50),
      trend: (['up', 'down', 'stable'] as const)[Math.floor(Math.random() * 3)],
    })).sort((a, b) => a.healthScore - b.healthScore);
  }, [customers]);

  const handleCompleteFollowUp = async (interactionId: string) => {
    try {
      await interactionsApi.completeFollowUp(interactionId);
      setPendingFollowUps(prev => prev.filter(f => f.id !== interactionId));
    } catch (error) {
      console.error('Error completing follow-up:', error);
    }
  };

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
            <BarChart3 size={28} className="text-accent-primary dark:text-blue-400" />
            CRM Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Übersicht über Kundenbeziehungen und Sales Pipeline
          </p>
        </div>
        <div className="flex gap-2">
          {(['week', 'month', 'quarter'] as const).map(range => (
            <Button
              key={range}
              onClick={() => setTimeRange(range)}
              variant={timeRange === range ? 'primary' : 'ghost'}
              size="sm"
            >
              {range === 'week' ? 'Woche' : range === 'month' ? 'Monat' : 'Quartal'}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatWidget
          label="Pipeline-Wert"
          value={formatCurrency(stats.pipelineValue)}
          icon={Target}
          color="blue"
        />
        <StatWidget
          label="Monatl. Wiederkehrend"
          value={formatCurrency(stats.monthlyRecurring)}
          icon={DollarSign}
          color="green"
        />
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
          <Target size={20} className="text-accent-primary dark:text-blue-400" />
          Sales Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <PipelineCard
            stage="lead"
            stageLabel="Leads"
            opportunities={opportunitiesByStage.lead}
            color="bg-gray-500"
            onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
          />
          <PipelineCard
            stage="qualified"
            stageLabel="Qualifiziert"
            opportunities={opportunitiesByStage.qualified}
            color="bg-blue-500"
            onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
          />
          <PipelineCard
            stage="proposal"
            stageLabel="Angebot"
            opportunities={opportunitiesByStage.proposal}
            color="bg-yellow-500"
            onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
          />
          <PipelineCard
            stage="negotiation"
            stageLabel="Verhandlung"
            opportunities={opportunitiesByStage.negotiation}
            color="bg-orange-500"
            onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
          />
          <PipelineCard
            stage="closing"
            stageLabel="Abschluss"
            opportunities={opportunitiesByStage.closing}
            color="bg-green-500"
            onOpportunityClick={(opp) => onNavigateToOpportunity?.(opp.id)}
          />
        </div>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Follow-Ups */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
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
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
            {pendingFollowUps.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare size={18} className="text-purple-500" />
              Letzte Interaktionen
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
            {recentInteractions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Heart size={18} className="text-red-500" />
              Kundengesundheit
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Niedrigste zuerst
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <CustomerHealthList
              customers={customerHealthData}
              onCustomerClick={(id) => onNavigateToCustomer?.(id)}
            />
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Aktive Kunden</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.activeCustomers}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-accent-lighter dark:bg-blue-900/30">
              <Users size={24} className="text-accent-primary dark:text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            von {stats.totalCustomers} gesamt
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Opportunities</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.totalOpportunities}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Target size={24} className="text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            in der Pipeline
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Aktive Verträge</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {contracts.filter(c => c.status === 'active').length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <FileSignature size={24} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            laufende Verträge
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ø Health Score</p>
              <p className={`text-2xl font-bold mt-1 ${
                stats.avgHealthScore >= 80 ? 'text-green-600 dark:text-green-400' :
                stats.avgHealthScore >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {stats.avgHealthScore}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Heart size={24} className="text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            über alle Kunden
          </p>
        </div>
      </div>
    </div>
  );
};

export default CRMDashboard;
