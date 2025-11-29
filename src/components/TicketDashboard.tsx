import { useState, useEffect } from 'react';
import {
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Pause,
  X,
  RefreshCw,
  ChevronRight,
  Target,
  Zap,
  Shield,
  Timer,
} from 'lucide-react';
import { ticketsApi, TicketDashboardData } from '../services/api';

interface TicketDashboardProps {
  onTicketSelect: (ticketId: string) => void;
  onViewAll: () => void;
}

const formatMinutes = (minutes: number): string => {
  if (minutes < 0) return 'Überfällig';
  if (minutes < 60) return `${Math.round(minutes)} Min.`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} Std.`;
  return `${Math.round(minutes / 1440)} Tage`;
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffMins < 1440) return `vor ${Math.floor(diffMins / 60)} Std.`;
  return `vor ${Math.floor(diffMins / 1440)} Tagen`;
};

const getActionText = (action: string, oldValue?: string | null, newValue?: string | null): string => {
  const statusLabels: Record<string, string> = {
    open: 'Offen',
    in_progress: 'In Bearbeitung',
    waiting: 'Wartend',
    resolved: 'Gelöst',
    closed: 'Geschlossen',
  };

  const priorityLabels: Record<string, string> = {
    low: 'Niedrig',
    normal: 'Normal',
    high: 'Hoch',
    critical: 'Kritisch',
  };

  const actionMap: Record<string, string> = {
    created: 'Ticket erstellt',
    status_changed: `Status: ${statusLabels[oldValue || ''] || oldValue} → ${statusLabels[newValue || ''] || newValue}`,
    priority_changed: `Priorität: ${priorityLabels[oldValue || ''] || oldValue} → ${priorityLabels[newValue || ''] || newValue}`,
    assigned: `Zugewiesen an ${newValue}`,
    unassigned: 'Zuweisung entfernt',
    comment_added: 'Kommentar hinzugefügt',
    internal_comment_added: 'Interne Notiz',
    attachment_added: 'Anhang hochgeladen',
    tag_added: `Tag "${newValue}" hinzugefügt`,
    tag_removed: `Tag "${oldValue}" entfernt`,
    resolved: 'Ticket gelöst',
    closed: 'Ticket geschlossen',
    reopened: 'Ticket wiedereröffnet',
    rating_added: `Bewertung: ${newValue}`,
  };
  return actionMap[action] || action;
};

const getPriorityLabel = (priority: string): string => {
  const labels: Record<string, string> = {
    low: 'Niedrig',
    normal: 'Normal',
    high: 'Hoch',
    critical: 'Kritisch',
  };
  return labels[priority] || priority;
};

export const TicketDashboard = ({ onTicketSelect, onViewAll }: TicketDashboardProps) => {
  const [data, setData] = useState<TicketDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ticketsApi.getDashboard();
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Dashboard konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Dashboard wird geladen...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={loadDashboard}
            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:opacity-90"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Calculate trends
  const createdChange = data.trends.ticketsLastWeek > 0
    ? Math.round(((data.trends.ticketsThisWeek - data.trends.ticketsLastWeek) / data.trends.ticketsLastWeek) * 100)
    : 0;

  // Calculate overall SLA compliance (average of response and resolution)
  const overallCompliance = Math.round((data.sla.responseCompliance + data.sla.resolutionCompliance) / 2);
  const totalBreached = data.sla.responseBreached + data.sla.resolutionBreached;
  const totalOverdue = data.sla.responseOverdue + data.sla.resolutionOverdue;

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Zuletzt aktualisiert: {lastRefresh.toLocaleTimeString('de-DE')}
          </p>
        </div>
        <button
          onClick={loadDashboard}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Aktualisieren</span>
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatusCard
          label="Offen"
          count={parseInt(String(data.overview.open)) || 0}
          icon={AlertCircle}
          color="blue"
          onClick={onViewAll}
        />
        <StatusCard
          label="In Bearbeitung"
          count={parseInt(String(data.overview.in_progress)) || 0}
          icon={Clock}
          color="yellow"
          onClick={onViewAll}
        />
        <StatusCard
          label="Wartend"
          count={parseInt(String(data.overview.waiting)) || 0}
          icon={Pause}
          color="purple"
          onClick={onViewAll}
        />
        <StatusCard
          label="Gelöst"
          count={parseInt(String(data.overview.resolved)) || 0}
          icon={CheckCircle}
          color="green"
          onClick={onViewAll}
        />
        <StatusCard
          label="Geschlossen"
          count={parseInt(String(data.overview.closed)) || 0}
          icon={X}
          color="gray"
          onClick={onViewAll}
        />
        <StatusCard
          label="Gesamt"
          count={parseInt(String(data.overview.total)) || 0}
          icon={BarChart3}
          color="accent"
          onClick={onViewAll}
        />
      </div>

      {/* Priority & SLA Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Target size={20} className="text-accent-primary" />
            Prioritäten (Aktive Tickets)
          </h2>
          <div className="space-y-3">
            <PriorityBar
              label="Kritisch"
              count={parseInt(String(data.overview.critical)) || 0}
              total={parseInt(String(data.overview.active_total)) || 1}
              color="bg-red-500"
            />
            <PriorityBar
              label="Hoch"
              count={parseInt(String(data.overview.high)) || 0}
              total={parseInt(String(data.overview.active_total)) || 1}
              color="bg-orange-500"
            />
            <PriorityBar
              label="Normal"
              count={parseInt(String(data.overview.normal)) || 0}
              total={parseInt(String(data.overview.active_total)) || 1}
              color="bg-blue-500"
            />
            <PriorityBar
              label="Niedrig"
              count={parseInt(String(data.overview.low)) || 0}
              total={parseInt(String(data.overview.active_total)) || 1}
              color="bg-gray-400"
            />
          </div>
        </div>

        {/* SLA Compliance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Shield size={20} className="text-accent-primary" />
            SLA Compliance
          </h2>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${overallCompliance * 3.52} 352`}
                  className={`${
                    overallCompliance >= 90
                      ? 'text-green-500'
                      : overallCompliance >= 70
                      ? 'text-yellow-500'
                      : 'text-red-500'
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {overallCompliance}%
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
              <div className="font-bold text-blue-600 dark:text-blue-400">{data.sla.responseCompliance}%</div>
              <div className="text-blue-600 dark:text-blue-400 text-xs">Erste Antwort</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
              <div className="font-bold text-green-600 dark:text-green-400">{data.sla.resolutionCompliance}%</div>
              <div className="text-green-600 dark:text-green-400 text-xs">Lösung</div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2">
              <div className="font-bold text-orange-600 dark:text-orange-400">{totalOverdue}</div>
              <div className="text-orange-600 dark:text-orange-400 text-xs">Überfällig</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              <div className="font-bold text-red-600 dark:text-red-400">{totalBreached}</div>
              <div className="text-red-600 dark:text-red-400 text-xs">Verletzt</div>
            </div>
          </div>
        </div>
      </div>

      {/* Response Times & Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Average Times */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Timer size={20} className="text-accent-primary" />
            Durchschnittliche Zeiten
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <Zap size={20} className="text-blue-500" />
                <span className="text-gray-700 dark:text-gray-300">Erste Antwort</span>
              </div>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {data.trends.avgFirstResponseMinutes
                  ? formatMinutes(data.trends.avgFirstResponseMinutes)
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-500" />
                <span className="text-gray-700 dark:text-gray-300">Lösung</span>
              </div>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {data.trends.avgResolutionMinutes
                  ? formatMinutes(data.trends.avgResolutionMinutes)
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Trends */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity size={20} className="text-accent-primary" />
            Wochenvergleich
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <TrendCard
              label="Erstellt (diese Woche)"
              value={data.trends.ticketsThisWeek}
              change={createdChange}
              inverse
            />
            <TrendCard
              label="Gelöst (diese Woche)"
              value={data.trends.resolvedThisWeek}
            />
            <TrendCard
              label="Erstellt (letzte Woche)"
              value={data.trends.ticketsLastWeek}
              showChange={false}
            />
          </div>
        </div>
      </div>

      {/* Urgent Tickets & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Tickets */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            Dringende Tickets
            {data.urgentTickets.length > 0 && (
              <span className="ml-auto bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full text-sm font-medium">
                {data.urgentTickets.length}
              </span>
            )}
          </h2>
          {data.urgentTickets.length > 0 ? (
            <div className="space-y-2">
              {data.urgentTickets.slice(0, 5).map((ticket) => {
                const minutesRemaining = ticket.responseMinutesRemaining ?? ticket.resolutionMinutesRemaining ?? 0;
                const isOverdue = minutesRemaining < 0;

                return (
                  <button
                    key={ticket.id}
                    onClick={() => onTicketSelect(ticket.id)}
                    className="w-full text-left p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                          <span className="font-mono">{ticket.ticketNumber}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            ticket.priority === 'critical'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                              : ticket.priority === 'high'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          }`}>
                            {getPriorityLabel(ticket.priority)}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {ticket.title}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {ticket.customerName}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-sm font-medium ${
                          isOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : minutesRemaining < 30
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}>
                          {isOverdue
                            ? 'Überfällig!'
                            : `${formatMinutes(minutesRemaining)} verbleibend`}
                        </div>
                        <ChevronRight size={16} className="ml-auto text-gray-400 mt-1" />
                      </div>
                    </div>
                  </button>
                );
              })}
              {data.urgentTickets.length > 5 && (
                <button
                  onClick={onViewAll}
                  className="w-full text-center py-2 text-accent-primary hover:underline text-sm"
                >
                  Alle {data.urgentTickets.length} anzeigen
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
              <p>Keine dringenden Tickets</p>
              <p className="text-sm">Alle SLAs sind im grünen Bereich</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity size={20} className="text-accent-primary" />
            Letzte Aktivitäten
          </h2>
          {data.recentActivity.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {data.recentActivity.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => onTicketSelect(activity.ticketId)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                >
                  <div className="flex items-start gap-3">
                    <ActivityIcon actionType={activity.action} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{activity.actorName}</span>{' '}
                        <span className="text-gray-500 dark:text-gray-400">
                          {getActionText(activity.action, activity.oldValue, activity.newValue)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {activity.ticketNumber}: {activity.ticketTitle}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatRelativeTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Activity size={32} className="mx-auto mb-2 opacity-50" />
              <p>Keine aktuellen Aktivitäten</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      {data.topCustomers.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users size={20} className="text-accent-primary" />
            Top Kunden (aktive Tickets)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {data.topCustomers.slice(0, 5).map((customer, index) => (
              <div
                key={customer.id}
                className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white"
                    style={{ backgroundColor: customer.color || '#6366f1' }}
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white truncate flex-1">
                    {customer.name}
                  </span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {customer.ticketCount} {customer.ticketCount === 1 ? 'Ticket' : 'Tickets'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Components
interface StatusCardProps {
  label: string;
  count: number;
  icon: typeof Clock;
  color: 'blue' | 'yellow' | 'purple' | 'green' | 'gray' | 'accent';
  onClick: () => void;
}

const StatusCard = ({ label, count, icon: Icon, color, onClick }: StatusCardProps) => {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    green: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
    gray: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    accent: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border ${colorClasses[color]} hover:opacity-80 transition-opacity text-left`}
    >
      <Icon size={24} className="mb-2" />
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm opacity-80">{label}</div>
    </button>
  );
};

interface PriorityBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const PriorityBar = ({ label, count, total, color }: PriorityBarProps) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-medium text-gray-900 dark:text-white">
        {count}
      </span>
    </div>
  );
};

interface TrendCardProps {
  label: string;
  value: number;
  change?: number;
  showChange?: boolean;
  inverse?: boolean;
}

const TrendCard = ({ label, value, change = 0, showChange = true, inverse = false }: TrendCardProps) => {
  const isPositive = inverse ? change < 0 : change > 0;
  const isNegative = inverse ? change > 0 : change < 0;

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      {showChange && change !== 0 && (
        <div className={`flex items-center gap-1 text-xs ${
          isPositive
            ? 'text-green-600 dark:text-green-400'
            : isNegative
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>
            {change > 0 ? '+' : ''}{change}%
          </span>
        </div>
      )}
    </div>
  );
};

const ActivityIcon = ({ actionType }: { actionType: string }) => {
  const iconMap: Record<string, { icon: typeof Clock; color: string }> = {
    created: { icon: AlertCircle, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30' },
    status_changed: { icon: Activity, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30' },
    priority_changed: { icon: Target, color: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30' },
    assigned: { icon: Users, color: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/30' },
    unassigned: { icon: Users, color: 'text-gray-500 bg-gray-100 dark:bg-gray-700' },
    comment_added: { icon: Activity, color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    internal_comment_added: { icon: Activity, color: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30' },
    resolved: { icon: CheckCircle, color: 'text-green-500 bg-green-100 dark:bg-green-900/30' },
    closed: { icon: X, color: 'text-gray-500 bg-gray-100 dark:bg-gray-700' },
    reopened: { icon: RefreshCw, color: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30' },
  };

  const { icon: Icon, color } = iconMap[actionType] || { icon: Activity, color: 'text-gray-500 bg-gray-100 dark:bg-gray-700' };

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon size={14} />
    </div>
  );
};
