import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Ticket,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  ExternalLink,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { Customer, Project, TimeEntry, Ticket as TicketType } from '../types';
import { InteractionsTimeline } from './InteractionsTimeline';
import { ticketsApi, entriesApi } from '../services/api';

// ============================================
// Types
// ============================================

interface CustomerDetailModalProps {
  isOpen: boolean;
  customer: Customer;
  projects: Project[];
  onClose: () => void;
  onEdit?: () => void;
  onNavigateToTickets?: (customerId: string) => void;
}

type TabType = 'overview' | 'interactions' | 'tickets' | 'timeentries';

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

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

// ============================================
// Sub-Components
// ============================================

interface OverviewTabProps {
  customer: Customer;
  projects: Project[];
  stats: {
    totalTickets: number;
    openTickets: number;
    totalHours: number;
    thisMonthHours: number;
  };
}

const OverviewTab: React.FC<OverviewTabProps> = ({ customer, projects, stats }) => {
  const customerProjects = projects.filter((p) => p.customerId === customer.id);

  return (
    <div className="space-y-6">
      {/* Customer Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">Kontaktdaten</h4>
        <div className="space-y-2 text-sm">
          {customer.contactPerson && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <User size={16} />
              <span>{customer.contactPerson}</span>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Mail size={16} />
              <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                {customer.email}
              </a>
            </div>
          )}
          {customer.address && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <MapPin size={16} />
              <span>{customer.address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Calendar size={16} />
            <span>Kunde seit {formatDate(customer.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{customerProjects.length}</div>
          <div className="text-xs text-blue-600/80">Projekte</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.totalTickets}</div>
          <div className="text-xs text-purple-600/80">Tickets gesamt</div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{stats.openTickets}</div>
          <div className="text-xs text-orange-600/80">Offene Tickets</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.thisMonthHours.toFixed(1)}h</div>
          <div className="text-xs text-green-600/80">Stunden (Monat)</div>
        </div>
      </div>

      {/* Projects */}
      <div>
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">Projekte</h4>
        {customerProjects.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Keine Projekte vorhanden</p>
        ) : (
          <div className="space-y-2">
            {customerProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                  <div className="text-xs text-gray-500">
                    {project.hourlyRate} EUR / {project.rateType === 'daily' ? 'Tag' : 'Stunde'}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    project.isActive
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {project.isActive ? 'Aktiv' : 'Inaktiv'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integrations */}
      {(customer.sevdeskCustomerId || customer.ninjarmmOrganizationId) && (
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Integrationen</h4>
          <div className="flex flex-wrap gap-2">
            {customer.sevdeskCustomerId && (
              <span className="flex items-center gap-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg">
                <ExternalLink size={14} />
                sevDesk verknupft
              </span>
            )}
            {customer.ninjarmmOrganizationId && (
              <span className="flex items-center gap-1 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-3 py-1.5 rounded-lg">
                <ExternalLink size={14} />
                NinjaRMM verknupft
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface TicketsTabProps {
  customerId: string;
  onNavigateToTickets?: (customerId: string) => void;
}

const TicketsTab: React.FC<TicketsTabProps> = ({ customerId, onNavigateToTickets }) => {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, [customerId]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const response = await ticketsApi.getAll({ customer_id: customerId, limit: 10 });
      setTickets(response.data || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Ticket size={40} className="mx-auto mb-3 opacity-50" />
        <p>Keine Tickets vorhanden</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
      case 'in_progress':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'resolved':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'closed':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{ticket.ticketNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(ticket.status)}`}>
                  {ticket.status}
                </span>
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mt-1 line-clamp-1">
                {ticket.title}
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                {formatDate(ticket.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ))}

      {onNavigateToTickets && (
        <button
          onClick={() => onNavigateToTickets(customerId)}
          className="w-full flex items-center justify-center gap-2 p-3 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          Alle Tickets anzeigen
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
};

interface TimeEntriesTabProps {
  customerId: string;
  projects: Project[];
}

const TimeEntriesTab: React.FC<TimeEntriesTabProps> = ({ customerId, projects }) => {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const customerProjectIds = projects.filter((p) => p.customerId === customerId).map((p) => p.id);

  useEffect(() => {
    loadEntries();
  }, [customerId]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      const response = await entriesApi.getAll();
      const customerEntries = (response.data || [])
        .filter((e: TimeEntry) => customerProjectIds.includes(e.projectId))
        .slice(0, 15);
      setEntries(customerEntries);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Clock size={40} className="mx-auto mb-3 opacity-50" />
        <p>Keine Zeiteinträge vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const project = projects.find((p) => p.id === entry.projectId);
        return (
          <div
            key={entry.id}
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                  {entry.description || 'Keine Beschreibung'}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span>{project?.name}</span>
                  <span>-</span>
                  <span>{formatDate(entry.startTime)}</span>
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatDuration(entry.duration)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  customer,
  projects,
  onClose,
  onEdit,
  onNavigateToTickets,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    totalHours: 0,
    thisMonthHours: 0,
  });

  useEffect(() => {
    if (isOpen) {
      loadStats();
      setActiveTab('overview');
    }
  }, [isOpen, customer.id]);

  const loadStats = async () => {
    try {
      // Load ticket stats
      const ticketResponse = await ticketsApi.getAll({ customer_id: customer.id });
      const tickets = ticketResponse.data || [];
      const openTickets = tickets.filter((t: TicketType) => ['open', 'in_progress'].includes(t.status));

      // Load time entry stats
      const entriesResponse = await entriesApi.getAll();
      const customerProjectIds = projects.filter((p) => p.customerId === customer.id).map((p) => p.id);
      const customerEntries = (entriesResponse.data || []).filter((e: TimeEntry) =>
        customerProjectIds.includes(e.projectId)
      );

      const totalSeconds = customerEntries.reduce((sum: number, e: TimeEntry) => sum + e.duration, 0);

      // This month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthEntries = customerEntries.filter(
        (e: TimeEntry) => new Date(e.startTime) >= monthStart
      );
      const thisMonthSeconds = thisMonthEntries.reduce((sum: number, e: TimeEntry) => sum + e.duration, 0);

      setStats({
        totalTickets: tickets.length,
        openTickets: openTickets.length,
        totalHours: totalSeconds / 3600,
        thisMonthHours: thisMonthSeconds / 3600,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'overview' as TabType, label: 'Ubersicht', icon: Building2 },
    { id: 'interactions' as TabType, label: 'Interaktionen', icon: MessageSquare },
    { id: 'tickets' as TabType, label: 'Tickets', icon: Ticket },
    { id: 'timeentries' as TabType, label: 'Zeiteinträge', icon: Clock },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: customer.color }}
            >
              {customer.customerType === 'individual' ? (
                <User size={24} className="text-white" />
              ) : (
                <Building2 size={24} className="text-white" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{customer.name}</h2>
              {customer.customerNumber && (
                <p className="text-sm text-gray-500 dark:text-gray-400">#{customer.customerNumber}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <OverviewTab customer={customer} projects={projects} stats={stats} />
          )}

          {activeTab === 'interactions' && (
            <InteractionsTimeline customerId={customer.id} customer={customer} />
          )}

          {activeTab === 'tickets' && (
            <TicketsTab customerId={customer.id} onNavigateToTickets={onNavigateToTickets} />
          )}

          {activeTab === 'timeentries' && (
            <TimeEntriesTab customerId={customer.id} projects={projects} />
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDetailModal;
