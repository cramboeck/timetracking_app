/**
 * CustomerHub - 360° Customer View
 *
 * Central hub for all customer-related information across all modules:
 * - Overview with health score and key metrics
 * - Contacts management
 * - Interaction timeline
 * - Tickets
 * - Tasks
 * - Contracts
 * - Time entries
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Users,
  Mail,
  Phone,
  Globe,
  MapPin,
  Clock,
  Ticket,
  FileSignature,
  MessageSquare,
  Target,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Activity,
  Heart,
  DollarSign,
  RefreshCw,
  ExternalLink,
  Edit2,
  ListTodo,
  FileText,
  UserPlus,
  PhoneCall,
  MailPlus,
  ClipboardList,
  Timer,
  Briefcase,
  AlertTriangle,
  Award,
  Zap,
  Inbox,
  X,
} from 'lucide-react';
import { Customer, Project, TimeEntry, Ticket as TicketType, Task } from '../types';
import {
  contactsApi,
  interactionsApi,
  ticketsApi,
  tasksApi,
  contractsApi,
  CRMContact,
  Interaction,
  Contract,
} from '../services/api';
import { Button, IconButton } from './ui/Button';
import { StatWidget } from './ui/StatWidget';
import { SkeletonListItem } from './Skeleton';
import { PersonalInbox } from './PersonalInbox';
import { InteractionsTimeline } from './InteractionsTimeline';
import { Modal } from './Modal';
import { CustomerContacts } from './CustomerContacts';
import { CreateTicketDialog } from './CreateTicketDialog';
import { useToast } from '../contexts/UIContext';
import TaskModal from './TaskModal';

// ============================================
// Types
// ============================================

interface CustomerHubProps {
  customers: Customer[];
  projects: Project[];
  entries: TimeEntry[];
  onSelectCustomer?: (customerId: string) => void;
  onCreateCustomer?: () => void;
  onNavigateToTicket?: (ticketId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  onStartTimer?: (customerId: string, projectId?: string, description?: string) => void;
  onAddManualEntry?: (customerId: string, projectId?: string) => void;
  initialCustomerId?: string;
  // True while App.tsx is still fetching customers/projects/entries on
  // boot. Renamed from `isLoading` to avoid colliding with the local
  // detail-fetch `isLoading` state below.
  isInitialDataLoading?: boolean;
}

type TabType = 'overview' | 'contacts' | 'interactions' | 'tickets' | 'tasks' | 'contracts' | 'entries';

interface CustomerHealthScore {
  score: number; // 0-100
  trend: 'up' | 'down' | 'stable';
  factors: {
    label: string;
    value: number;
    impact: 'positive' | 'negative' | 'neutral';
  }[];
}

interface UnifiedTimelineItem {
  id: string;
  type: 'interaction' | 'ticket' | 'task' | 'entry' | 'contract';
  subType?: string;
  title: string;
  description?: string;
  timestamp: string;
  icon: React.ElementType;
  color: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Helper Functions
// ============================================

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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
// Health Score Calculation
// ============================================

const calculateHealthScore = (
  customer: Customer,
  tickets: TicketType[],
  tasks: Task[],
  interactions: Interaction[],
  entries: TimeEntry[],
  contracts: Contract[]
): CustomerHealthScore => {
  const factors: CustomerHealthScore['factors'] = [];
  let totalScore = 0;
  let factorCount = 0;

  // Factor 1: Open Tickets (negative impact)
  const openTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed');
  const criticalTickets = openTickets.filter(t => t.priority === 'critical' || t.priority === 'high');
  const ticketScore = Math.max(0, 100 - (openTickets.length * 10) - (criticalTickets.length * 15));
  factors.push({
    label: `${openTickets.length} offene Tickets`,
    value: ticketScore,
    impact: openTickets.length === 0 ? 'positive' : criticalTickets.length > 0 ? 'negative' : 'neutral',
  });
  totalScore += ticketScore;
  factorCount++;

  // Factor 2: Recent Interactions (positive impact)
  const recentInteractions = interactions.filter(i => {
    const daysDiff = (Date.now() - new Date(i.occurred_at).getTime()) / 86400000;
    return daysDiff <= 30;
  });
  const interactionScore = Math.min(100, recentInteractions.length * 15);
  factors.push({
    label: `${recentInteractions.length} Kontakte (30 Tage)`,
    value: interactionScore,
    impact: recentInteractions.length >= 3 ? 'positive' : recentInteractions.length === 0 ? 'negative' : 'neutral',
  });
  totalScore += interactionScore;
  factorCount++;

  // Factor 3: Overdue Tasks (negative impact)
  const overdueTasks = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < new Date();
  });
  const taskScore = Math.max(0, 100 - (overdueTasks.length * 20));
  factors.push({
    label: `${overdueTasks.length} überfällige Aufgaben`,
    value: taskScore,
    impact: overdueTasks.length === 0 ? 'positive' : 'negative',
  });
  totalScore += taskScore;
  factorCount++;

  // Factor 4: Active Contracts (positive impact)
  const activeContracts = contracts.filter(c => c.status === 'active');
  const contractScore = activeContracts.length > 0 ? 100 : 50;
  factors.push({
    label: `${activeContracts.length} aktive Verträge`,
    value: contractScore,
    impact: activeContracts.length > 0 ? 'positive' : 'neutral',
  });
  totalScore += contractScore;
  factorCount++;

  // Factor 5: Recent Activity (time entries)
  const recentEntries = entries.filter(e => {
    const daysDiff = (Date.now() - new Date(e.date || e.startTime).getTime()) / 86400000;
    return daysDiff <= 30;
  });
  const activityScore = Math.min(100, recentEntries.length * 5);
  factors.push({
    label: `${recentEntries.length} Zeiteinträge (30 Tage)`,
    value: activityScore,
    impact: recentEntries.length >= 10 ? 'positive' : recentEntries.length === 0 ? 'negative' : 'neutral',
  });
  totalScore += activityScore;
  factorCount++;

  const finalScore = Math.round(totalScore / factorCount);

  // Determine trend based on recent changes
  const trend: 'up' | 'down' | 'stable' =
    criticalTickets.length > 0 || overdueTasks.length > 2 ? 'down' :
    recentInteractions.length >= 3 && openTickets.length === 0 ? 'up' : 'stable';

  return { score: finalScore, trend, factors };
};

// ============================================
// Sub-Components
// ============================================

interface HealthBadgeProps {
  score: number;
  trend: 'up' | 'down' | 'stable';
  showDetails?: boolean;
  factors?: CustomerHealthScore['factors'];
}

const HealthBadge: React.FC<HealthBadgeProps> = ({ score, trend, showDetails, factors }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const getColor = () => {
    if (score >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    if (score >= 40) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Activity;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${getColor()}`}
      >
        <Heart size={16} />
        <span className="font-semibold">{score}</span>
        <TrendIcon size={14} className={trendColor} />
      </button>

      {showTooltip && factors && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-dark-100 rounded-lg shadow-xl border border-gray-200 dark:border-dark-border p-3 z-50">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Health Score Details</h4>
          <div className="space-y-2">
            {factors.map((factor, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-dark-400">{factor.label}</span>
                <span className={
                  factor.impact === 'positive' ? 'text-green-600 dark:text-green-400' :
                  factor.impact === 'negative' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-500'
                }>
                  {factor.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface QuickActionsProps {
  customerId: string;
  onAddContact: () => void;
  onAddInteraction: () => void;
  onCreateTicket: () => void;
  onCreateTask: () => void;
  onStartTimer: () => void;
  onAddManualEntry: () => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({
  onAddContact,
  onAddInteraction,
  onCreateTicket,
  onCreateTask,
  onStartTimer,
  onAddManualEntry,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { icon: UserPlus, label: 'Kontakt hinzufügen', onClick: onAddContact, color: 'text-accent-primary' },
    { icon: PhoneCall, label: 'Interaktion erfassen', onClick: onAddInteraction, color: 'text-green-600' },
    { icon: Ticket, label: 'Ticket erstellen', onClick: onCreateTicket, color: 'text-orange-600' },
    { icon: ListTodo, label: 'Aufgabe erstellen', onClick: onCreateTask, color: 'text-accent-primary' },
    { icon: Timer, label: 'Timer starten', onClick: onStartTimer, color: 'text-indigo-600' },
    { icon: Clock, label: 'Zeit manuell erfassen', onClick: onAddManualEntry, color: 'text-teal-600' },
  ];

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="primary"
        icon={<Plus size={18} />}
      >
        Aktion
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-100 rounded-lg shadow-xl border border-gray-200 dark:border-dark-border py-2 z-50">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-200 transition-colors"
              >
                <action.icon size={18} className={action.color} />
                <span className="text-gray-700 dark:text-dark-500">{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// Tab Components
// ============================================

interface OverviewTabProps {
  customer: Customer;
  projects: Project[];
  healthScore: CustomerHealthScore;
  stats: {
    totalHours: number;
    unbilledHours: number;
    openTickets: number;
    totalTickets: number;
    activeTasks: number;
    activeContracts: number;
    monthlyRevenue: number;
  };
  timeline: UnifiedTimelineItem[];
  onTimelineItemClick: (item: UnifiedTimelineItem) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  customer,
  projects,
  healthScore,
  stats,
  timeline,
  onTimelineItemClick,
}) => {
  const customerProjects = projects.filter(p => p.customerId === customer.id);
  const activeProjects = customerProjects.filter(p => p.isActive);

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          label="Gesamtstunden"
          value={`${stats.totalHours}h`}
          icon={Clock}
          color="blue"
          size="sm"
        />
        <StatWidget
          label="Nicht abgerechnet"
          value={`${stats.unbilledHours}h`}
          icon={DollarSign}
          color={stats.unbilledHours > 0 ? 'orange' : 'green'}
          size="sm"
        />
        <StatWidget
          label="Offene Tickets"
          value={stats.openTickets}
          icon={Ticket}
          color={stats.openTickets > 0 ? 'red' : 'green'}
          size="sm"
        />
        <StatWidget
          label="Aktive Aufgaben"
          value={stats.activeTasks}
          icon={ListTodo}
          color={stats.activeTasks > 0 ? 'purple' : 'gray'}
          size="sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score Details */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Heart size={18} className="text-red-500" />
            Kundengesundheit
          </h3>
          <div className="flex items-center justify-center mb-4">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold ${
              healthScore.score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              healthScore.score >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
              healthScore.score >= 40 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {healthScore.score}
            </div>
          </div>
          <div className="space-y-2">
            {healthScore.factors.map((factor, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-dark-400">{factor.label}</span>
                <div className={`w-2 h-2 rounded-full ${
                  factor.impact === 'positive' ? 'bg-green-500' :
                  factor.impact === 'negative' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
              </div>
            ))}
          </div>
        </div>

        {/* Projects Overview */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Briefcase size={18} className="text-indigo-500" />
            Projekte ({activeProjects.length}/{customerProjects.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {customerProjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">
                Keine Projekte
              </p>
            ) : (
              customerProjects.slice(0, 5).map(project => (
                <div key={project.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-200/50">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${project.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-sm text-gray-900 dark:text-white">{project.name}</span>
                  </div>
                  {project.hourlyRate && (
                    <span className="text-xs text-gray-500 dark:text-dark-400">
                      {project.hourlyRate}€/h
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-accent-primary" />
            Kontaktdaten
          </h3>
          <div className="space-y-3 text-sm">
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary dark:hover:text-accent-primary">
                <Mail size={16} />
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary dark:hover:text-accent-primary">
                <Phone size={16} />
                {customer.phone}
              </a>
            )}
            {customer.website && (
              <a href={customer.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary dark:hover:text-accent-primary">
                <Globe size={16} />
                {customer.website}
              </a>
            )}
            {customer.address && (
              <div className="flex items-start gap-2 text-gray-600 dark:text-dark-400">
                <MapPin size={16} className="mt-0.5" />
                <span>{customer.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified Timeline */}
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity size={18} className="text-accent-primary" />
            Letzte Aktivitäten
          </h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-dark-border max-h-96 overflow-y-auto">
          {timeline.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-dark-400">
              <Activity size={32} className="mx-auto mb-2 opacity-50" />
              <p>Keine Aktivitäten</p>
            </div>
          ) : (
            timeline.slice(0, 10).map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => onTimelineItemClick(item)}
                className="w-full p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
              >
                <div className={`p-2 rounded-lg ${item.color}`}>
                  <item.icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
                      {item.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-dark-400 mt-1">
                    {getRelativeTime(item.timestamp)}
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-400 mt-1" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface ContactsTabProps {
  contacts: CRMContact[];
  onAddContact: () => void;
  onEditContact: (contact: CRMContact) => void;
  onEnablePortalAccess: (contact: CRMContact) => void;
}

const ContactsTab: React.FC<ContactsTabProps> = ({
  contacts,
  onAddContact,
  onEditContact,
  onEnablePortalAccess,
}) => {
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'decision_maker': return 'Entscheider';
      case 'technical': return 'Technisch';
      case 'billing': return 'Buchhaltung';
      default: return 'Kontakt';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'decision_maker': return 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary';
      case 'technical': return 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary';
      case 'billing': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-400';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {contacts.length} Ansprechpartner
        </h3>
        <Button onClick={onAddContact} variant="primary" size="sm" icon={<Plus size={16} />}>
          Kontakt hinzufügen
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <Users size={48} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-dark-400">Keine Ansprechpartner vorhanden</p>
          <Button onClick={onAddContact} variant="ghost" className="mt-3" icon={<Plus size={16} />}>
            Ersten Kontakt hinzufügen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-primary to-accent-primary flex items-center justify-center text-white font-bold text-lg">
                    {(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {contact.first_name} {contact.last_name}
                      {contact.is_primary && (
                        <Award size={14} className="inline ml-1 text-yellow-500" />
                      )}
                    </p>
                    {contact.job_title && (
                      <p className="text-sm text-gray-500 dark:text-dark-400">{contact.job_title}</p>
                    )}
                  </div>
                </div>
                <IconButton
                  icon={<Edit2 size={16} />}
                  onClick={() => onEditContact(contact)}
                  tooltip="Bearbeiten"
                />
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleColor(contact.role)}`}>
                  {getRoleLabel(contact.role)}
                </span>
                {contact.has_portal_access ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Portal aktiv
                  </span>
                ) : (
                  <button
                    onClick={() => onEnablePortalAccess(contact)}
                    className="text-xs px-2 py-0.5 rounded-full bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary hover:bg-accent-lighter dark:hover:bg-accent-primary/50 transition-colors"
                  >
                    + Portal aktivieren
                  </button>
                )}
              </div>

              <div className="space-y-1 text-sm">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary">
                    <Mail size={14} />
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary">
                    <Phone size={14} />
                    {contact.phone}
                  </a>
                )}
                {contact.mobile && (
                  <a href={`tel:${contact.mobile}`} className="flex items-center gap-2 text-gray-600 dark:text-dark-400 hover:text-accent-primary">
                    <Phone size={14} />
                    {contact.mobile} (Mobil)
                  </a>
                )}
              </div>

              {contact.recent_interactions && contact.recent_interactions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
                  <p className="text-xs text-gray-500 dark:text-dark-400 mb-1">Letzte Interaktion:</p>
                  <p className="text-sm text-gray-700 dark:text-dark-500">
                    {contact.recent_interactions[0].subject || contact.recent_interactions[0].type}
                    <span className="text-gray-400 ml-2">
                      {getRelativeTime(contact.recent_interactions[0].occurred_at)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface TicketsTabProps {
  tickets: TicketType[];
  onCreateTicket: () => void;
  onTicketClick: (ticket: TicketType) => void;
}

const TicketsTab: React.FC<TicketsTabProps> = ({ tickets, onCreateTicket, onTicketClick }) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const filteredTickets = tickets.filter(t => {
    if (filter === 'open') return t.status !== 'resolved' && t.status !== 'closed';
    if (filter === 'resolved') return t.status === 'resolved' || t.status === 'closed';
    return true;
  });

  const statusColors: Record<string, string> = {
    open: 'bg-blue-500',
    in_progress: 'bg-yellow-500',
    waiting: 'bg-accent-light0',
    resolved: 'bg-green-500',
    closed: 'bg-gray-500',
  };

  const statusLabels: Record<string, string> = {
    open: 'Offen',
    in_progress: 'In Bearbeitung',
    waiting: 'Wartend',
    resolved: 'Gelöst',
    closed: 'Geschlossen',
  };

  const priorityColors: Record<string, string> = {
    critical: 'text-red-600 dark:text-red-400',
    high: 'text-orange-600 dark:text-orange-400',
    normal: 'text-accent-primary dark:text-accent-primary',
    low: 'text-gray-600 dark:text-dark-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {(['all', 'open', 'resolved'] as const).map(f => (
            <Button
              key={f}
              onClick={() => setFilter(f)}
              variant={filter === f ? 'primary' : 'ghost'}
              size="sm"
            >
              {f === 'all' ? 'Alle' : f === 'open' ? 'Offen' : 'Gelöst'}
              {f === 'open' && ` (${tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length})`}
            </Button>
          ))}
        </div>
        <Button onClick={onCreateTicket} variant="primary" size="sm" icon={<Plus size={16} />}>
          Ticket erstellen
        </Button>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-green-500" />
          <p className="text-gray-500 dark:text-dark-400">
            {filter === 'open' ? 'Keine offenen Tickets' : 'Keine Tickets vorhanden'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {filteredTickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => onTicketClick(ticket)}
              className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
            >
              <div className={`w-3 h-3 rounded-full ${statusColors[ticket.status]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-500 dark:text-dark-400">
                    {ticket.ticketNumber}
                  </span>
                  <span className={`text-xs ${priorityColors[ticket.priority]}`}>
                    {ticket.priority === 'critical' && <AlertTriangle size={12} className="inline mr-1" />}
                    {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                  </span>
                </div>
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {ticket.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                  {statusLabels[ticket.status]} • {formatDate(ticket.createdAt)}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface TasksTabProps {
  tasks: Task[];
  onCreateTask: () => void;
  onTaskClick: (task: Task) => void;
  onOpenTicket?: (ticketId: string) => void;
}

const TasksTab: React.FC<TasksTabProps> = ({ tasks, onCreateTask, onTaskClick, onOpenTicket }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  const filteredTasks = tasks.filter(t => {
    if (filter === 'active') return t.status !== 'completed' && t.status !== 'cancelled';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const statusIcons: Record<string, React.ElementType> = {
    pending: Clock,
    in_progress: RefreshCw,
    completed: CheckCircle2,
    cancelled: XCircle,
  };

  const statusColors: Record<string, string> = {
    pending: 'text-gray-500',
    in_progress: 'text-accent-primary',
    completed: 'text-green-500',
    cancelled: 'text-gray-400',
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate || task.status === 'completed' || task.status === 'cancelled') return false;
    return new Date(task.dueDate) < new Date();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {(['active', 'completed', 'all'] as const).map(f => (
            <Button
              key={f}
              onClick={() => setFilter(f)}
              variant={filter === f ? 'primary' : 'ghost'}
              size="sm"
            >
              {f === 'all' ? 'Alle' : f === 'active' ? 'Aktiv' : 'Erledigt'}
              {f === 'active' && ` (${tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length})`}
            </Button>
          ))}
        </div>
        <Button onClick={onCreateTask} variant="primary" size="sm" icon={<Plus size={16} />}>
          Aufgabe erstellen
        </Button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-green-500" />
          <p className="text-gray-500 dark:text-dark-400">
            {filter === 'active' ? 'Keine aktiven Aufgaben' : 'Keine Aufgaben vorhanden'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {filteredTasks.map(task => {
            const StatusIcon = statusIcons[task.status];
            const overdue = isOverdue(task);
            const isTicketSource = task.taskSource === 'ticket';

            return (
              <div
                key={task.id}
                className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
              >
                <StatusIcon size={20} className={statusColors[task.status]} />
                <button
                  onClick={() => isTicketSource ? (task.ticketId && onOpenTicket?.(task.ticketId)) : onTaskClick(task)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium ${
                      task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-white'
                    } truncate`}>
                      {task.title}
                    </p>
                    {isTicketSource && task.ticketNumber && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-accent-primary/10 dark:bg-accent-primary/20 text-accent-primary">
                        Ticket {task.ticketNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {task.dueDate && (
                      <span className={`text-xs flex items-center gap-1 ${
                        overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-dark-400'
                      }`}>
                        <Calendar size={12} />
                        {formatDate(task.dueDate)}
                        {overdue && ' (überfällig)'}
                      </span>
                    )}
                    {task.assignedToName && (
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        • {task.assignedToName}
                      </span>
                    )}
                  </div>
                </button>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================
// Contracts Tab
// ============================================

interface ContractsTabProps {
  contracts: Contract[];
  onContractClick?: (contract: Contract) => void;
}

const ContractsTab: React.FC<ContractsTabProps> = ({ contracts, onContractClick }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'expiring'>('all');

  const filteredContracts = contracts.filter(c => {
    if (filter === 'active') return c.status === 'active';
    if (filter === 'expiring') {
      if (c.status !== 'active' || !c.endDate) return false;
      const daysUntilExpiry = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000);
      return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
    }
    return true;
  });

  const activeContracts = contracts.filter(c => c.status === 'active');
  const expiringCount = contracts.filter(c => {
    if (c.status !== 'active' || !c.endDate) return false;
    const daysUntilExpiry = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000);
    return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
  }).length;

  const monthlyRevenue = activeContracts.reduce((sum, c) => {
    if (!c.monthlyValue) return sum;
    return sum + c.monthlyValue;
  }, 0);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    expiring: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-500',
    terminated: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Entwurf',
    active: 'Aktiv',
    paused: 'Pausiert',
    expiring: 'Läuft aus',
    expired: 'Abgelaufen',
    cancelled: 'Gekündigt',
    terminated: 'Beendet',
  };

  const typeLabels: Record<string, string> = {
    service: 'Service',
    support: 'Support',
    maintenance: 'Wartung',
    project: 'Projekt',
    subscription: 'Abonnement',
    framework: 'Rahmenvertrag',
    other: 'Sonstiges',
  };

  const getDaysUntilExpiry = (endDate: string) => {
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4">
          <p className="text-sm text-gray-500 dark:text-dark-400">Aktive Verträge</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeContracts.length}</p>
        </div>
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4">
          <p className="text-sm text-gray-500 dark:text-dark-400">Monatlicher Wert</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(monthlyRevenue)}</p>
        </div>
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4">
          <p className="text-sm text-gray-500 dark:text-dark-400">Laufen bald aus</p>
          <p className={`text-2xl font-bold ${expiringCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
            {expiringCount}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'active', 'expiring'] as const).map(f => (
          <Button
            key={f}
            onClick={() => setFilter(f)}
            variant={filter === f ? 'primary' : 'ghost'}
            size="sm"
          >
            {f === 'all' ? 'Alle' : f === 'active' ? 'Aktiv' : 'Läuft aus'}
            {f === 'expiring' && expiringCount > 0 && ` (${expiringCount})`}
          </Button>
        ))}
      </div>

      {/* Contract List */}
      {filteredContracts.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <FileSignature size={48} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-dark-400">
            {filter === 'expiring' ? 'Keine auslaufenden Verträge' : 'Keine Verträge vorhanden'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {filteredContracts.map(contract => {
            const daysUntilExpiry = contract.endDate ? getDaysUntilExpiry(contract.endDate) : null;
            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 90 && daysUntilExpiry > 0;

            return (
              <button
                key={contract.id}
                onClick={() => onContractClick?.(contract)}
                className="w-full p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                  <FileSignature size={20} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono text-gray-500 dark:text-dark-400">
                      {contract.contractNumber}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[contract.status]}`}>
                      {statusLabels[contract.status]}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400">
                      {typeLabels[contract.contractType]}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {contract.name}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-dark-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(contract.startDate)}
                      {contract.endDate && !contract.isIndefinite && ` - ${formatDate(contract.endDate)}`}
                      {contract.isIndefinite && ' - Unbefristet'}
                    </span>
                    {contract.monthlyValue && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <DollarSign size={12} />
                        {formatCurrency(contract.monthlyValue)}/Monat
                      </span>
                    )}
                  </div>
                  {isExpiringSoon && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                      <AlertTriangle size={12} />
                      Läuft in {daysUntilExpiry} Tagen aus
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-400 mt-2" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================
// Time Entries Tab
// ============================================

interface TimeEntriesTabProps {
  entries: TimeEntry[];
  projects: Project[];
  onStartTimer: () => void;
  onAddManualEntry: () => void;
}

const TimeEntriesTab: React.FC<TimeEntriesTabProps> = ({ entries, projects, onStartTimer, onAddManualEntry }) => {
  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unbekannt';
  };

  const totalSeconds = entries.reduce((sum, e) => {
    if (e.duration && e.duration > 0) return sum + e.duration;
    if (e.startTime && e.endTime) {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return sum + (end.getTime() - start.getTime()) / 1000;
      }
    }
    return sum;
  }, 0);

  const unbilledSeconds = entries.filter(e => !e.billed).reduce((sum, e) => {
    if (e.duration && e.duration > 0) return sum + e.duration;
    if (e.startTime && e.endTime) {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return sum + (end.getTime() - start.getTime()) / 1000;
      }
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <div className="text-sm">
            <span className="text-gray-500 dark:text-dark-400">Gesamt:</span>
            <span className="ml-2 font-semibold text-gray-900 dark:text-white">
              {formatDuration(totalSeconds)}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500 dark:text-dark-400">Nicht abgerechnet:</span>
            <span className="ml-2 font-semibold text-orange-600 dark:text-orange-400">
              {formatDuration(unbilledSeconds)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddManualEntry} variant="secondary" size="sm" icon={<Clock size={16} />}>
            Manuell erfassen
          </Button>
          <Button onClick={onStartTimer} variant="primary" size="sm" icon={<Timer size={16} />}>
            Timer starten
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <Clock size={48} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-dark-400">Keine Zeiteinträge vorhanden</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border">
          {entries.slice(0, 20).map(entry => {
            const duration = entry.duration ||
              (entry.startTime && entry.endTime
                ? (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 1000
                : 0);

            return (
              <div key={entry.id} className="p-4 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${entry.billed ? 'bg-green-500' : 'bg-orange-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {entry.description || getProjectName(entry.projectId)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {formatDate(entry.date || entry.startTime)} • {getProjectName(entry.projectId)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-medium text-gray-900 dark:text-white">
                    {formatDuration(duration)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {entry.billed ? 'Abgerechnet' : 'Offen'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const CustomerHub: React.FC<CustomerHubProps> = ({
  customers,
  projects,
  entries,
  onSelectCustomer,
  onCreateCustomer,
  onNavigateToTicket,
  onNavigateToTask,
  onStartTimer,
  onAddManualEntry,
  initialCustomerId,
  isInitialDataLoading = false,
}) => {
  const showToast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId || null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Data states
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modal states
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showPersonalInbox, setShowPersonalInbox] = useState(false);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && customer.isActive !== false) ||
        (filterStatus === 'inactive' && customer.isActive === false);
      return matchesSearch && matchesStatus;
    });
  }, [customers, searchQuery, filterStatus]);

  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c.id === selectedCustomerId)
    : null;

  // Load customer data when selected
  const loadCustomerData = useCallback(async (customerId: string) => {
    setIsLoading(true);
    try {
      const [contactsRes, interactionsRes, ticketsRes, tasksRes, contractsRes] = await Promise.all([
        contactsApi.getByCustomer(customerId).catch(() => []),
        interactionsApi.getAll({ customer_id: customerId, limit: 50 }).catch(() => ({ interactions: [] })),
        ticketsApi.getByCustomer(customerId).catch(() => ({ tickets: [] })),
        tasksApi.getAll({ customerId }).catch(() => ({ data: [] })),
        contractsApi.getByCustomer(customerId).catch(() => []),
      ]);

      setContacts(Array.isArray(contactsRes) ? contactsRes : []);
      setInteractions(interactionsRes.interactions || []);
      setTickets(ticketsRes.tickets || []);
      setTasks(tasksRes.data || []);
      setContracts(Array.isArray(contractsRes) ? contractsRes : []);
    } catch (error) {
      console.error('Error loading customer data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerData(selectedCustomerId);
    }
  }, [selectedCustomerId, loadCustomerData]);

  // Get entries for selected customer
  const customerEntries = useMemo(() => {
    if (!selectedCustomerId) return [];
    const customerProjects = projects.filter(p => p.customerId === selectedCustomerId);
    const projectIds = customerProjects.map(p => p.id);
    return entries.filter(e => projectIds.includes(e.projectId))
      .sort((a, b) => new Date(b.date || b.startTime).getTime() - new Date(a.date || a.startTime).getTime());
  }, [selectedCustomerId, entries, projects]);

  // Calculate health score
  const healthScore = useMemo(() => {
    if (!selectedCustomer) return { score: 0, trend: 'stable' as const, factors: [] };
    return calculateHealthScore(selectedCustomer, tickets, tasks, interactions, customerEntries, contracts);
  }, [selectedCustomer, tickets, tasks, interactions, customerEntries, contracts]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalSeconds = customerEntries.reduce((sum, e) => {
      if (e.duration && e.duration > 0) return sum + e.duration;
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    const unbilledSeconds = customerEntries.filter(e => !e.billed).reduce((sum, e) => {
      if (e.duration && e.duration > 0) return sum + e.duration;
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    return {
      totalHours: Math.round(totalSeconds / 3600),
      unbilledHours: Math.round(unbilledSeconds / 3600),
      openTickets: tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length,
      totalTickets: tickets.length,
      activeTasks: tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length,
      activeContracts: contracts.filter(c => c.status === 'active').length,
      monthlyRevenue: 0, // TODO: Calculate from contracts/invoices
    };
  }, [customerEntries, tickets, tasks, contracts]);

  // Build unified timeline
  const timeline = useMemo((): UnifiedTimelineItem[] => {
    const items: UnifiedTimelineItem[] = [];

    // Add interactions
    interactions.forEach(i => {
      items.push({
        id: i.id,
        type: 'interaction',
        subType: i.type,
        title: i.subject || `${i.type.charAt(0).toUpperCase() + i.type.slice(1)}`,
        description: i.summary || i.content?.substring(0, 100),
        timestamp: i.occurred_at,
        icon: i.type === 'call' ? Phone : i.type === 'email' ? Mail : i.type === 'meeting' ? Users : MessageSquare,
        color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      });
    });

    // Add tickets
    tickets.forEach(t => {
      items.push({
        id: t.id,
        type: 'ticket',
        subType: t.status,
        title: `Ticket: ${t.title}`,
        description: `${t.ticketNumber} - ${t.status}`,
        timestamp: t.createdAt,
        icon: Ticket,
        color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        metadata: { ticketId: t.id },
      });
    });

    // Add tasks
    tasks.forEach(t => {
      items.push({
        id: t.id,
        type: 'task',
        subType: t.status,
        title: `Aufgabe: ${t.title}`,
        description: t.status === 'completed' ? 'Erledigt' : t.dueDate ? `Fällig: ${formatDate(t.dueDate)}` : undefined,
        timestamp: t.createdAt,
        icon: ListTodo,
        color: 'bg-accent-lighter dark:bg-accent-primary/20 text-accent-primary dark:text-accent-primary',
        metadata: { taskId: t.id },
      });
    });

    // Add recent time entries (last 10)
    customerEntries.slice(0, 10).forEach(e => {
      items.push({
        id: e.id,
        type: 'entry',
        title: e.description || 'Zeiteintrag',
        description: formatDuration(e.duration || 0),
        timestamp: e.date || e.startTime,
        icon: Clock,
        color: 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary',
      });
    });

    // Sort by timestamp descending
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [interactions, tickets, tasks, customerEntries]);

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setActiveTab('overview');
    onSelectCustomer?.(customerId);
  };

  const handleTimelineItemClick = (item: UnifiedTimelineItem) => {
    if (item.type === 'ticket' && item.metadata?.ticketId) {
      onNavigateToTicket?.(item.metadata.ticketId as string);
    } else if (item.type === 'task' && item.metadata?.taskId) {
      onNavigateToTask?.(item.metadata.taskId as string);
    }
  };

  // Quick action handlers
  const handleAddContact = () => {
    setShowContactsModal(true);
  };

  const handleAddInteraction = () => {
    // Switch to interactions tab which has the form built-in
    setActiveTab('interactions');
  };

  const handleCreateTicket = () => {
    setShowTicketDialog(true);
  };

  const handleCreateTask = () => {
    setShowTaskModal(true);
  };

  const handleEnablePortalAccess = async (contact: CRMContact) => {
    try {
      const result = await contactsApi.enablePortalAccess(contact.id, true);
      if (result.success) {
        // Copy invitation link to clipboard as fallback
        if (result.invitation_token) {
          const invitationUrl = `${window.location.origin}/portal/activate?token=${result.invitation_token}`;
          await navigator.clipboard.writeText(invitationUrl);
          showToast('Portal-Zugang aktiviert. Einladungslink in Zwischenablage kopiert.', 'success');
        } else {
          showToast('Portal-Zugang aktiviert', 'success');
        }
        // Refresh contacts to show updated status
        if (selectedCustomerId) {
          const updatedContacts = await contactsApi.getByCustomer(selectedCustomerId);
          if (Array.isArray(updatedContacts)) {
            setContacts(updatedContacts);
          }
        }
      } else {
        showToast('Fehler beim Aktivieren des Portal-Zugangs', 'error');
      }
    } catch (error) {
      console.error('Error enabling portal access:', error);
      showToast('Fehler beim Aktivieren des Portal-Zugangs', 'error');
    }
  };

  const handleStartTimer = () => {
    if (selectedCustomerId) {
      const customerProjects = projects.filter(p => p.customerId === selectedCustomerId && p.isActive);
      onStartTimer?.(selectedCustomerId, customerProjects[0]?.id);
    }
  };

  const handleAddManualEntry = () => {
    if (selectedCustomerId) {
      const customerProjects = projects.filter(p => p.customerId === selectedCustomerId && p.isActive);
      onAddManualEntry?.(selectedCustomerId, customerProjects[0]?.id);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'overview', label: 'Übersicht', icon: Activity },
    { id: 'contacts', label: 'Kontakte', icon: Users, count: contacts.length },
    { id: 'interactions', label: 'Interaktionen', icon: MessageSquare, count: interactions.length },
    { id: 'tickets', label: 'Tickets', icon: Ticket, count: stats.openTickets || undefined },
    { id: 'tasks', label: 'Aufgaben', icon: ListTodo, count: stats.activeTasks || undefined },
    { id: 'contracts', label: 'Verträge', icon: FileSignature, count: stats.activeContracts || undefined },
    { id: 'entries', label: 'Zeiten', icon: Clock },
  ];

  return (
    <div className="flex h-full">
      {/* Customer List - Left Panel */}
      <div className={`
        ${selectedCustomerId ? 'hidden lg:block lg:w-80 xl:w-96' : 'w-full'}
        border-r border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100
        flex flex-col flex-shrink-0
      `}>
        {/* Search Header */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 size={24} className="text-accent-primary dark:text-accent-primary" />
              Kunden
            </h1>
            <span className="text-sm text-gray-500 dark:text-dark-400">
              ({filteredCustomers.length})
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <IconButton
                onClick={() => setShowPersonalInbox(true)}
                icon={<Inbox size={18} />}
                tooltip="Mein Posteingang"
              />
              {onCreateCustomer && (
                <IconButton
                  onClick={onCreateCustomer}
                  icon={<Plus size={18} />}
                  variant="primary"
                  tooltip="Kunde erstellen"
                />
              )}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-dark-border
                bg-gray-50 dark:bg-dark-200 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-accent-primary focus:border-transparent"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 mt-3">
            {(['all', 'active', 'inactive'] as const).map(status => (
              <Button
                key={status}
                onClick={() => setFilterStatus(status)}
                variant={filterStatus === status ? 'primary' : 'ghost'}
                size="sm"
              >
                {status === 'all' ? 'Alle' : status === 'active' ? 'Aktiv' : 'Inaktiv'}
              </Button>
            ))}
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto">
          {isInitialDataLoading && customers.length === 0 ? (
            // Initial app boot — show skeletons instead of the empty state.
            <div className="p-3 space-y-2" aria-busy="true" aria-label="Kunden werden geladen">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonListItem key={i} />
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-dark-400">
              <Users size={48} className="mx-auto mb-3 opacity-50" />
              <p>Keine Kunden gefunden</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-dark-border">
              {filteredCustomers.map(customer => {
                const isSelected = selectedCustomerId === customer.id;
                const customerProjects = projects.filter(p => p.customerId === customer.id);

                return (
                  <button
                    key={customer.id}
                    onClick={() => handleCustomerSelect(customer.id)}
                    className={`w-full p-4 text-left transition-colors ${
                      isSelected
                        ? 'bg-accent-light dark:bg-accent-primary/20 border-l-4 border-accent-primary'
                        : 'hover:bg-gray-50 dark:hover:bg-dark-200/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                        style={{ backgroundColor: customer.color || '#6366f1' }}
                      >
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {customer.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-dark-400">
                          {customerProjects.filter(p => p.isActive).length} Projekte
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Customer Detail - Right Panel */}
      {selectedCustomer ? (
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-dark-50">
          {/* Customer Header */}
          <div className="bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border p-4 lg:p-6">
            {/* Back Button (Mobile) */}
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="lg:hidden flex items-center gap-1 text-accent-primary dark:text-accent-primary mb-4"
            >
              <ChevronLeft size={18} />
              <span>Zurück</span>
            </button>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-2xl flex-shrink-0"
                  style={{ backgroundColor: selectedCustomer.color || '#6366f1' }}
                >
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {selectedCustomer.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {selectedCustomer.email && (
                      <span className="text-sm text-gray-500 dark:text-dark-400 truncate">
                        {selectedCustomer.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <HealthBadge
                  score={healthScore.score}
                  trend={healthScore.trend}
                  factors={healthScore.factors}
                />
                <QuickActions
                  customerId={selectedCustomer.id}
                  onAddContact={handleAddContact}
                  onAddInteraction={handleAddInteraction}
                  onCreateTicket={handleCreateTicket}
                  onCreateTask={handleCreateTask}
                  onStartTimer={handleStartTimer}
                  onAddManualEntry={handleAddManualEntry}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
                      : 'text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      activeTab === tab.id
                        ? 'bg-accent-light dark:bg-accent-primary/40 text-accent-dark dark:text-accent-primary'
                        : 'bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw size={32} className="animate-spin text-accent-primary" />
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab
                    customer={selectedCustomer}
                    projects={projects}
                    healthScore={healthScore}
                    stats={stats}
                    timeline={timeline}
                    onTimelineItemClick={handleTimelineItemClick}
                  />
                )}
                {activeTab === 'contacts' && (
                  <ContactsTab
                    contacts={contacts}
                    onAddContact={handleAddContact}
                    onEditContact={(contact) => console.log('Edit contact:', contact.id)}
                    onEnablePortalAccess={handleEnablePortalAccess}
                  />
                )}
                {activeTab === 'interactions' && selectedCustomer && (
                  <InteractionsTimeline
                    customerId={selectedCustomer.id}
                    customer={selectedCustomer}
                  />
                )}
                {activeTab === 'tickets' && (
                  <TicketsTab
                    tickets={tickets}
                    onCreateTicket={handleCreateTicket}
                    onTicketClick={(ticket) => onNavigateToTicket?.(ticket.id)}
                  />
                )}
                {activeTab === 'tasks' && (
                  <TasksTab
                    tasks={tasks}
                    onCreateTask={handleCreateTask}
                    onTaskClick={(task) => onNavigateToTask?.(task.id)}
                    onOpenTicket={(ticketId) => onNavigateToTicket?.(ticketId)}
                  />
                )}
                {activeTab === 'contracts' && (
                  <ContractsTab
                    contracts={contracts}
                    onContractClick={(contract) => {
                      // Navigate to contracts view or open contract modal
                      console.log('Open contract:', contract.id);
                    }}
                  />
                )}
                {activeTab === 'entries' && (
                  <TimeEntriesTab
                    entries={customerEntries}
                    projects={projects}
                    onStartTimer={handleStartTimer}
                    onAddManualEntry={handleAddManualEntry}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        !selectedCustomerId && (
          <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-50 dark:bg-dark-50">
            <div className="text-center text-gray-500 dark:text-dark-400">
              <Building2 size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Wählen Sie einen Kunden</p>
              <p className="text-sm mt-1">um die 360°-Ansicht anzuzeigen</p>
            </div>
          </div>
        )
      )}

      {/* Customer Contacts Modal */}
      {selectedCustomer && (
        <CustomerContacts
          isOpen={showContactsModal}
          customer={selectedCustomer}
          onClose={() => {
            setShowContactsModal(false);
            // Refresh contacts
            if (selectedCustomerId) {
              loadCustomerData(selectedCustomerId);
            }
          }}
        />
      )}

      {/* Create Ticket Dialog */}
      <CreateTicketDialog
        isOpen={showTicketDialog}
        onClose={() => setShowTicketDialog(false)}
        onCreated={() => {
          setShowTicketDialog(false);
          // Refresh tickets
          if (selectedCustomerId) {
            loadCustomerData(selectedCustomerId);
          }
        }}
        customers={selectedCustomer ? [selectedCustomer] : customers}
        projects={selectedCustomer ? projects.filter(p => p.customerId === selectedCustomer.id) : projects}
      />

      {/* Create Task Modal */}
      {showTaskModal && (
        <TaskModal
          onClose={() => setShowTaskModal(false)}
          onSave={() => {
            setShowTaskModal(false);
            // Refresh tasks
            if (selectedCustomerId) {
              loadCustomerData(selectedCustomerId);
            }
          }}
          defaultCustomerId={selectedCustomerId || undefined}
        />
      )}

      {/* Personal Inbox Drawer */}
      {showPersonalInbox && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowPersonalInbox(false)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-dark-100 shadow-xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-300">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Inbox className="text-accent-primary" size={20} />
                Mein Posteingang
              </h2>
              <IconButton
                icon={<X size={20} />}
                onClick={() => setShowPersonalInbox(false)}
                tooltip="Schließen"
              />
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <PersonalInbox
                onEmailSaved={(interactionId, customerId) => {
                  // Refresh customer data if viewing that customer
                  if (customerId === selectedCustomerId) {
                    loadCustomerData(customerId);
                  }
                  // Optionally navigate to the customer
                  if (customerId && onSelectCustomer) {
                    onSelectCustomer(customerId);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerHub;
