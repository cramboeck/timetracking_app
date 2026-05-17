import { useState, useMemo } from 'react';
import {
  Users, Building2, Mail, Phone, Globe, MapPin,
  Clock, Ticket, FileText, Receipt, Target, Calendar,
  ChevronRight, Plus, Search, Filter, MoreHorizontal,
  TrendingUp, DollarSign, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Customer, Project, TimeEntry, Ticket as TicketType } from '../types';
import { StatWidget } from './ui/StatWidget';
import { Button, IconButton } from './ui/Button';

interface CustomerViewProps {
  customers: Customer[];
  projects: Project[];
  entries: TimeEntry[];
  tickets?: TicketType[];
  onSelectCustomer?: (customerId: string) => void;
  onCreateCustomer?: () => void;
}

export const CustomerView = ({
  customers,
  projects,
  entries,
  tickets = [],
  onSelectCustomer,
  onCreateCustomer,
}: CustomerViewProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

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

  // Calculate customer stats
  const getCustomerStats = (customerId: string) => {
    const customerProjects = projects.filter(p => p.customerId === customerId);
    const projectIds = customerProjects.map(p => p.id);
    const customerEntries = entries.filter(e => projectIds.includes(e.projectId));
    const customerTickets = tickets.filter(t => t.customerId === customerId);

    const totalSeconds = customerEntries.reduce((sum, e) => {
      if (e.duration && e.duration > 0) {
        return sum + e.duration;
      }
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    const unbilledEntries = customerEntries.filter(e => !e.billed);
    const unbilledSeconds = unbilledEntries.reduce((sum, e) => {
      if (e.duration && e.duration > 0) {
        return sum + e.duration;
      }
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
      projectCount: customerProjects.length,
      activeProjects: customerProjects.filter(p => p.isActive).length,
      totalHours: Math.round(totalSeconds / 3600),
      unbilledHours: Math.round(unbilledSeconds / 3600),
      entryCount: customerEntries.length,
      openTickets: customerTickets.filter(t => t.status !== 'resolved').length,
      totalTickets: customerTickets.length,
    };
  };

  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c.id === selectedCustomerId)
    : null;

  const selectedStats = selectedCustomerId
    ? getCustomerStats(selectedCustomerId)
    : null;

  // Get recent entries for selected customer
  const recentEntries = useMemo(() => {
    if (!selectedCustomerId) return [];
    const customerProjects = projects.filter(p => p.customerId === selectedCustomerId);
    const projectIds = customerProjects.map(p => p.id);
    return entries
      .filter(e => projectIds.includes(e.projectId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
      .map(entry => {
        const project = projects.find(p => p.id === entry.projectId);
        return { ...entry, projectName: project?.name || 'Unbekannt' };
      });
  }, [selectedCustomerId, entries, projects]);

  // Get recent tickets for selected customer
  const recentTickets = useMemo(() => {
    if (!selectedCustomerId) return [];
    return tickets
      .filter(t => t.customerId === selectedCustomerId)
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      .slice(0, 5);
  }, [selectedCustomerId, tickets]);

  const formatDuration = (entry: TimeEntry) => {
    if (entry.duration && entry.duration > 0) {
      const hours = Math.floor(entry.duration / 3600);
      const minutes = Math.floor((entry.duration % 3600) / 60);
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    if (entry.startTime && entry.endTime) {
      const start = new Date(entry.startTime);
      const end = new Date(entry.endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const seconds = (end.getTime() - start.getTime()) / 1000;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}:${String(minutes).padStart(2, '0')}`;
      }
    }
    return '0:00';
  };

  return (
    <div className="flex h-full">
      {/* Customer List - Left Panel */}
      <div className={`
        ${selectedCustomerId ? 'hidden lg:block lg:w-1/3 xl:w-1/4' : 'w-full'}
        border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
        flex flex-col
      `}>
        {/* Search Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 size={24} className="text-accent-primary dark:text-blue-400" />
              Kunden
            </h1>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({filteredCustomers.length})
            </span>
            {onCreateCustomer && (
              <IconButton
                onClick={onCreateCustomer}
                icon={<Plus size={18} />}
                variant="primary"
                tooltip="Kunde erstellen"
                className="ml-auto bg-accent-primary text-white hover:bg-accent-primary/90"
              />
            )}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600
                bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
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
          {filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Users size={48} className="mx-auto mb-3 opacity-50" />
              <p>Keine Kunden gefunden</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredCustomers.map(customer => {
                const stats = getCustomerStats(customer.id);
                const isSelected = selectedCustomerId === customer.id;

                return (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      onSelectCustomer?.(customer.id);
                    }}
                    className={`w-full p-4 text-left transition-colors ${
                      isSelected
                        ? 'bg-accent-light dark:bg-blue-900/20 border-l-4 border-accent-primary'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: customer.color || '#6366f1' }}
                      >
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {customer.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {stats.activeProjects} Projekte • {stats.totalHours}h
                        </p>
                      </div>
                      {stats.openTickets > 0 && (
                        <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-full">
                          {stats.openTickets}
                        </span>
                      )}
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Customer Detail - Right Panel */}
      {selectedCustomer && selectedStats ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {/* Back Button (Mobile) */}
          <Button
            onClick={() => setSelectedCustomerId(null)}
            variant="ghost"
            icon={<ChevronRight size={18} className="rotate-180" />}
            className="lg:hidden m-4 text-accent-primary dark:text-blue-400"
          >
            Zurück
          </Button>

          {/* Customer Header */}
          <div className="bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl"
                style={{ backgroundColor: selectedCustomer.color || '#6366f1' }}
              >
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedCustomer.name}
                </h2>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {selectedCustomer.email && (
                    <span className="flex items-center gap-1">
                      <Mail size={14} />
                      {selectedCustomer.email}
                    </span>
                  )}
                  {selectedCustomer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={14} />
                      {selectedCustomer.phone}
                    </span>
                  )}
                  {selectedCustomer.website && (
                    <span className="flex items-center gap-1">
                      <Globe size={14} />
                      {selectedCustomer.website}
                    </span>
                  )}
                </div>
              </div>
              <IconButton
                icon={<MoreHorizontal size={20} />}
                tooltip="Optionen"
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="p-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatWidget
                label="Projekte"
                value={selectedStats.projectCount}
                icon={Target}
                color="blue"
                size="sm"
              />
              <StatWidget
                label="Gesamtstunden"
                value={selectedStats.totalHours + 'h'}
                icon={Clock}
                color="green"
                size="sm"
              />
              <StatWidget
                label="Nicht abgerechnet"
                value={selectedStats.unbilledHours + 'h'}
                icon={Receipt}
                color="orange"
                size="sm"
              />
              <StatWidget
                label="Offene Tickets"
                value={selectedStats.openTickets}
                icon={Ticket}
                color={selectedStats.openTickets > 0 ? 'red' : 'gray'}
                size="sm"
              />
            </div>

            {/* Two Column Content */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Time Entries */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Clock size={18} className="text-accent-primary dark:text-blue-400" />
                    Letzte Zeiteinträge
                  </h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recentEntries.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                      <Clock size={24} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Keine Einträge</p>
                    </div>
                  ) : (
                    recentEntries.map(entry => (
                      <div key={entry.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {entry.description || entry.projectName}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(entry.date).toLocaleDateString('de-DE')} • {entry.projectName}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatDuration(entry)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Tickets */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Ticket size={18} className="text-orange-600 dark:text-orange-400" />
                    Tickets
                  </h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recentTickets.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                      <CheckCircle2 size={24} className="mx-auto mb-2 text-green-500" />
                      <p className="text-sm">Keine Tickets</p>
                    </div>
                  ) : (
                    recentTickets.map(ticket => {
                      const statusColors = {
                        open: 'bg-blue-500',
                        in_progress: 'bg-yellow-500',
                        waiting: 'bg-purple-500',
                        resolved: 'bg-green-500',
                      };
                      const priorityLabels = {
                        critical: 'Kritisch',
                        high: 'Hoch',
                        normal: 'Normal',
                        low: 'Niedrig',
                      };

                      return (
                        <div key={ticket.id} className="p-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${statusColors[ticket.status]}`} />
                            <p className="text-sm font-medium text-gray-900 dark:text-white flex-1 truncate">
                              {ticket.title}
                            </p>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {priorityLabels[ticket.priority]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-4">
                            {ticket.ticketNumber}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Projects List */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 lg:col-span-2">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Target size={18} className="text-indigo-600 dark:text-indigo-400" />
                    Projekte
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-accent-primary dark:text-blue-400"
                  >
                    Alle anzeigen
                  </Button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {projects.filter(p => p.customerId === selectedCustomerId).length === 0 ? (
                    <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                      <Target size={24} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Keine Projekte</p>
                    </div>
                  ) : (
                    projects
                      .filter(p => p.customerId === selectedCustomerId)
                      .map(project => (
                        <div key={project.id} className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${project.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {project.name}
                              </p>
                              {project.hourlyRate && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {project.hourlyRate}€/h
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            project.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}>
                            {project.isActive ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        !selectedCustomerId && (
          <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Building2 size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Wählen Sie einen Kunden</p>
              <p className="text-sm mt-1">um Details anzuzeigen</p>
            </div>
          </div>
        )
      )}
    </div>
  );
};
