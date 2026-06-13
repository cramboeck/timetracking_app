import { useState, useEffect } from 'react';
import { Ticket, Monitor, Clock, FileText, AlertTriangle, ChevronRight, CheckCircle, TrendingUp } from 'lucide-react';
import { customerPortalApi, PortalContact, PortalTicket } from '../../services/api';
import { Card } from '../ui/Card';

interface PortalDashboardProps {
  contact: PortalContact;
  portalSettings?: {
    showTimeReport?: boolean;
    showContractInfo?: boolean;
  } | null;
  onNavigate: (view: string) => void;
}

interface DashboardData {
  tickets: {
    open: number;
    waiting: number;
    lastUpdate: string | null;
  };
  devices: {
    total: number;
    withAlerts: number;
    offline: number;
  };
  timeReport: {
    hoursThisMonth: number;
    billableHours: number;
  } | null;
  contract: {
    name: string;
    usedHours: number;
    totalHours: number;
    status: string;
  } | null;
}

export const PortalDashboard = ({ contact, portalSettings, onNavigate }: PortalDashboardProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const dashboardData: DashboardData = {
        tickets: { open: 0, waiting: 0, lastUpdate: null },
        devices: { total: 0, withAlerts: 0, offline: 0 },
        timeReport: null,
        contract: null,
      };

      // Load tickets
      try {
        const tickets = await customerPortalApi.getTickets();
        const openTickets = tickets.filter((t: PortalTicket) =>
          t.status !== 'closed' && t.status !== 'resolved'
        );
        const waitingTickets = tickets.filter((t: PortalTicket) =>
          t.status === 'waiting_for_customer' || t.status === 'waiting'
        );
        const lastUpdated = tickets.length > 0
          ? tickets.sort((a: PortalTicket, b: PortalTicket) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )[0].updatedAt
          : null;

        dashboardData.tickets = {
          open: openTickets.length,
          waiting: waitingTickets.length,
          lastUpdate: lastUpdated,
        };
      } catch (err) {
        console.error('Failed to load tickets:', err);
      }

      // Load devices if permitted
      if (contact.canViewDevices) {
        try {
          const devicesRes = await customerPortalApi.getDevices();
          const devices = devicesRes.data || [];
          dashboardData.devices = {
            total: devices.length,
            withAlerts: devices.filter((d: any) => d.openAlerts > 0).length,
            offline: devices.filter((d: any) => d.offline).length,
          };
        } catch (err) {
          console.error('Failed to load devices:', err);
        }
      }

      // Load time report if permitted
      if (contact.canViewTimeReport && portalSettings?.showTimeReport) {
        try {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const timeRes = await customerPortalApi.getTimeReport(currentMonth);
          if (timeRes.success) {
            dashboardData.timeReport = {
              hoursThisMonth: timeRes.data.totalHours,
              billableHours: timeRes.data.billableHours,
            };
          }
        } catch (err) {
          console.error('Failed to load time report:', err);
        }
      }

      // Load contract if permitted
      if (contact.canViewContract && portalSettings?.showContractInfo) {
        try {
          const contractRes = await customerPortalApi.getContract();
          if (contractRes.success && contractRes.data) {
            dashboardData.contract = {
              name: contractRes.data.name,
              usedHours: contractRes.data.usedHoursThisMonth,
              totalHours: contractRes.data.monthlyHours || 0,
              status: contractRes.data.status,
            };
          }
        } catch (err) {
          console.error('Failed to load contract:', err);
        }
      }

      setData(dashboardData);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays === 1) return 'gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE');
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary" />
      </div>
    );
  }

  if (!data) return null;

  const hoursPercentage = data.contract && data.contract.totalHours > 0
    ? Math.min((data.contract.usedHours / data.contract.totalHours) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Willkommen, {contact.name.split(' ')[0]}!
        </h2>
        <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
          Hier ist Ihre Übersicht
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tickets Card */}
        <button
          onClick={() => onNavigate('tickets')}
          className="text-left bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-accent-primary dark:hover:border-accent-primary transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded-lg">
                <Ticket size={20} className="text-accent-primary" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white">Tickets</span>
            </div>
            <ChevronRight size={18} className="text-gray-400" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-dark-400">Offen</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{data.tickets.open}</span>
            </div>
            {data.tickets.waiting > 0 && (
              <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertTriangle size={14} />
                <span>{data.tickets.waiting} warten auf Ihre Rückmeldung</span>
              </div>
            )}
            {data.tickets.lastUpdate && (
              <p className="text-xs text-gray-400 dark:text-dark-400">
                Letztes Update: {formatRelativeTime(data.tickets.lastUpdate)}
              </p>
            )}
          </div>
        </button>

        {/* Devices Card */}
        {contact.canViewDevices && (
          <button
            onClick={() => onNavigate('devices')}
            className="text-left bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-accent-primary dark:hover:border-accent-primary transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${
                  data.devices.withAlerts > 0
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  <Monitor size={20} className={
                    data.devices.withAlerts > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  } />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">Geräte</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-dark-400">Gesamt</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{data.devices.total}</span>
              </div>
              {data.devices.withAlerts > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} />
                  <span>{data.devices.withAlerts} mit Warnungen</span>
                </div>
              )}
              {data.devices.withAlerts === 0 && data.devices.total > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle size={14} />
                  <span>Alle Geräte OK</span>
                </div>
              )}
            </div>
          </button>
        )}

        {/* Time Report Card */}
        {contact.canViewTimeReport && portalSettings?.showTimeReport && data.timeReport && (
          <button
            onClick={() => onNavigate('time-report')}
            className="text-left bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-accent-primary dark:hover:border-accent-primary transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Clock size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">Stunden</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-dark-400">Diesen Monat</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {data.timeReport.hoursThisMonth.toFixed(1)} h
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <TrendingUp size={14} />
                <span>{data.timeReport.billableHours.toFixed(1)} h verrechenbar</span>
              </div>
            </div>
          </button>
        )}

        {/* Contract Card */}
        {contact.canViewContract && portalSettings?.showContractInfo && data.contract && (
          <button
            onClick={() => onNavigate('contract')}
            className="text-left bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-accent-primary dark:hover:border-accent-primary transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <FileText size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-medium text-gray-900 dark:text-white">Vertrag</span>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-dark-400 truncate">
                {data.contract.name}
              </p>
              {data.contract.totalHours > 0 && (
                <>
                  <div className="h-2 bg-gray-200 dark:bg-dark-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        hoursPercentage >= 90
                          ? 'bg-red-500'
                          : hoursPercentage >= 75
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${hoursPercentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {data.contract.usedHours.toFixed(1)} / {data.contract.totalHours} h verbraucht
                  </p>
                </>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Quick Actions */}
      {contact.canCreateTickets && (
        <Card className="p-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Schnellaktionen</h3>
          <button
            onClick={() => onNavigate('create-ticket')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-primary hover:bg-accent-dark text-white rounded-lg font-medium transition-colors"
          >
            <Ticket size={18} />
            Neues Ticket erstellen
          </button>
        </Card>
      )}
    </div>
  );
};

export default PortalDashboard;
