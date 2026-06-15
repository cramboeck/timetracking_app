import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle,
  RefreshCw, Monitor, ExternalLink, Ticket, Filter, ChevronDown,
  CheckCircle, XCircle, Eye, EyeOff
} from 'lucide-react';
import { ninjaApi, NinjaVulnerability, VulnerabilitySummary } from '../services/api';
import { Button } from './ui';
import { useToast } from '../contexts/UIContext';

interface VulnerabilitiesDashboardProps {
  onNavigateToTicket?: (ticketId: string) => void;
}

const severityConfig: Record<string, { label: string; color: string; bgColor: string; icon: typeof Shield }> = {
  CRITICAL: { label: 'Kritisch', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: ShieldX },
  HIGH: { label: 'Hoch', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30', icon: ShieldAlert },
  MEDIUM: { label: 'Mittel', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', icon: AlertTriangle },
  LOW: { label: 'Niedrig', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30', icon: Shield },
  NONE: { label: 'Info', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/30', icon: Shield },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'text-red-600 dark:text-red-400' },
  patched: { label: 'Gepatcht', color: 'text-green-600 dark:text-green-400' },
  ignored: { label: 'Ignoriert', color: 'text-gray-500 dark:text-gray-400' },
  false_positive: { label: 'False Positive', color: 'text-purple-600 dark:text-purple-400' },
};

export const VulnerabilitiesDashboard = ({ onNavigateToTicket }: VulnerabilitiesDashboardProps) => {
  const queryClient = useQueryClient();
  const showToast = useToast();

  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Queries
  const summaryQuery = useQuery({
    queryKey: ['vulnerabilities', 'summary'],
    queryFn: async () => {
      const res = await ninjaApi.getVulnerabilitySummary();
      if (!res.success) throw new Error('Failed to load summary');
      return res.data;
    },
  });

  const vulnerabilitiesQuery = useQuery({
    queryKey: ['vulnerabilities', 'list', { severity: severityFilter, status: statusFilter }],
    queryFn: async () => {
      const res = await ninjaApi.getVulnerabilities({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      });
      if (!res.success) throw new Error('Failed to load vulnerabilities');
      return res.data;
    },
  });

  // Mutations
  const syncMutation = useMutation({
    mutationFn: () => ninjaApi.syncVulnerabilities(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] });
      showToast(`${data.data.synced} Geräte synchronisiert, ${data.data.newVulnerabilities} neue Schwachstellen`, 'success');
    },
    onError: () => {
      showToast('Fehler beim Synchronisieren', 'error');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'patched' | 'ignored' | 'false_positive' }) =>
      ninjaApi.updateVulnerabilityStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] });
      showToast('Status aktualisiert', 'success');
    },
    onError: () => {
      showToast('Fehler beim Aktualisieren', 'error');
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (id: string) => ninjaApi.createTicketFromVulnerability(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] });
      showToast('Ticket erstellt', 'success');
      if (onNavigateToTicket && data.data?.ticketId) {
        onNavigateToTicket(data.data.ticketId);
      }
    },
    onError: () => {
      showToast('Fehler beim Erstellen des Tickets', 'error');
    },
  });

  const summary = summaryQuery.data;
  const vulnerabilities = vulnerabilitiesQuery.data || [];
  const isLoading = summaryQuery.isLoading || vulnerabilitiesQuery.isLoading;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="text-orange-500" />
            Schwachstellen
          </h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Sicherheitslücken aus NinjaRMM
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          variant="secondary"
          icon={<RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />}
        >
          Synchronisieren
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <SummaryCard
            label="Gesamt"
            value={summary.total}
            icon={Shield}
            color="text-gray-600 dark:text-gray-400"
            bgColor="bg-gray-100 dark:bg-gray-800/50"
          />
          <SummaryCard
            label="Kritisch"
            value={summary.critical}
            icon={ShieldX}
            color="text-red-600 dark:text-red-400"
            bgColor="bg-red-100 dark:bg-red-900/30"
            onClick={() => {
              setSeverityFilter('CRITICAL');
              setStatusFilter('');
            }}
          />
          <SummaryCard
            label="Hoch"
            value={summary.high}
            icon={ShieldAlert}
            color="text-orange-600 dark:text-orange-400"
            bgColor="bg-orange-100 dark:bg-orange-900/30"
            onClick={() => {
              setSeverityFilter('HIGH');
              setStatusFilter('');
            }}
          />
          <SummaryCard
            label="Mittel"
            value={summary.medium}
            icon={AlertTriangle}
            color="text-yellow-600 dark:text-yellow-400"
            bgColor="bg-yellow-100 dark:bg-yellow-900/30"
            onClick={() => {
              setSeverityFilter('MEDIUM');
              setStatusFilter('');
            }}
          />
          <SummaryCard
            label="Offen"
            value={summary.open}
            icon={ShieldAlert}
            color="text-red-600 dark:text-red-400"
            bgColor="bg-red-50 dark:bg-red-900/20"
            onClick={() => {
              setStatusFilter('open');
              setSeverityFilter('');
            }}
          />
          <SummaryCard
            label="Geräte betroffen"
            value={summary.affectedDevices}
            icon={Monitor}
            color="text-blue-600 dark:text-blue-400"
            bgColor="bg-blue-100 dark:bg-blue-900/30"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-400 hover:bg-gray-50 dark:hover:bg-dark-200"
        >
          <Filter size={16} />
          Filter
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {(severityFilter || statusFilter) && (
          <button
            onClick={() => {
              setSeverityFilter('');
              setStatusFilter('');
            }}
            className="text-sm text-accent-primary hover:underline"
          >
            Filter zurücksetzen
          </button>
        )}

        <span className="text-sm text-gray-500 dark:text-dark-400 ml-auto">
          {vulnerabilities.length} Schwachstellen
        </span>
      </div>

      {showFilters && (
        <div className="flex gap-4 p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
              Schweregrad
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            >
              <option value="">Alle</option>
              <option value="CRITICAL">Kritisch</option>
              <option value="HIGH">Hoch</option>
              <option value="MEDIUM">Mittel</option>
              <option value="LOW">Niedrig</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            >
              <option value="">Alle</option>
              <option value="open">Offen</option>
              <option value="patched">Gepatcht</option>
              <option value="ignored">Ignoriert</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>
        </div>
      )}

      {/* Vulnerabilities List */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw size={24} className="animate-spin mx-auto text-accent-primary mb-2" />
            <span className="text-gray-500 dark:text-dark-400">Lade Schwachstellen...</span>
          </div>
        ) : vulnerabilities.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck size={48} className="mx-auto text-green-500 mb-3" />
            <p className="text-lg font-medium text-gray-900 dark:text-white">Keine Schwachstellen gefunden</p>
            <p className="text-gray-500 dark:text-dark-400 mt-1">
              {statusFilter || severityFilter ? 'Versuche andere Filter' : 'Alle Geräte sind sicher'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {vulnerabilities.map((vuln) => (
              <VulnerabilityRow
                key={vuln.id}
                vulnerability={vuln}
                isExpanded={expandedVuln === vuln.id}
                onToggle={() => setExpandedVuln(expandedVuln === vuln.id ? null : vuln.id)}
                onUpdateStatus={(status) => updateStatusMutation.mutate({ id: vuln.id, status })}
                onCreateTicket={() => createTicketMutation.mutate(vuln.id)}
                onNavigateToTicket={onNavigateToTicket}
                isUpdating={updateStatusMutation.isPending}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: number;
  icon: typeof Shield;
  color: string;
  bgColor: string;
  onClick?: () => void;
}

const SummaryCard = ({ label, value, icon: Icon, color, bgColor, onClick }: SummaryCardProps) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`${bgColor} rounded-lg p-4 text-left transition-all ${onClick ? 'hover:scale-105 cursor-pointer' : ''}`}
  >
    <div className="flex items-center gap-2 mb-1">
      <Icon size={16} className={color} />
      <span className={`text-sm ${color}`}>{label}</span>
    </div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </button>
);

interface VulnerabilityRowProps {
  vulnerability: NinjaVulnerability;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateStatus: (status: 'open' | 'patched' | 'ignored' | 'false_positive') => void;
  onCreateTicket: () => void;
  onNavigateToTicket?: (ticketId: string) => void;
  isUpdating: boolean;
  formatDate: (date: string | null) => string;
}

const VulnerabilityRow = ({
  vulnerability,
  isExpanded,
  onToggle,
  onUpdateStatus,
  onCreateTicket,
  onNavigateToTicket,
  isUpdating,
  formatDate,
}: VulnerabilityRowProps) => {
  const severity = severityConfig[vulnerability.severity] || severityConfig.NONE;
  const status = statusConfig[vulnerability.status] || statusConfig.open;
  const SeverityIcon = severity.icon;

  return (
    <div>
      <div
        onClick={onToggle}
        className="px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
      >
        {/* Severity Icon */}
        <div className={`p-2 rounded-lg ${severity.bgColor}`}>
          <SeverityIcon size={20} className={severity.color} />
        </div>

        {/* CVE Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium text-gray-900 dark:text-white">
              {vulnerability.cveId}
            </span>
            {vulnerability.cvssScore && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${severity.bgColor} ${severity.color}`}>
                CVSS {vulnerability.cvssScore}
              </span>
            )}
            <span className={`text-xs ${status.color}`}>
              {status.label}
            </span>
          </div>
          <div className="text-sm text-gray-500 dark:text-dark-400 truncate mt-0.5">
            {vulnerability.softwareName || 'Unbekannte Software'}
            {vulnerability.softwareVersion && ` v${vulnerability.softwareVersion}`}
          </div>
        </div>

        {/* Device */}
        <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400">
          <Monitor size={14} />
          <span className="truncate max-w-[150px]">{vulnerability.deviceName || 'Unbekannt'}</span>
        </div>

        {/* Date */}
        <div className="hidden lg:block text-sm text-gray-500 dark:text-dark-400">
          {formatDate(vulnerability.firstSeenAt)}
        </div>

        {/* Ticket Badge */}
        {vulnerability.ticketId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTicket?.(vulnerability.ticketId!);
            }}
            className="flex items-center gap-1 text-xs bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary px-2 py-1 rounded hover:bg-accent-primary/20"
          >
            <Ticket size={12} />
            Ticket
          </button>
        )}

        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {isExpanded && (
        <div className="px-4 py-4 bg-gray-50 dark:bg-dark-200/30 border-t border-gray-100 dark:border-dark-border">
          {/* Description */}
          {vulnerability.cveDescription && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-dark-400 mb-1">Beschreibung</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {vulnerability.cveDescription}
              </p>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Schweregrad</span>
              <div className={`font-medium ${severity.color}`}>{severity.label}</div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">CVSS Score</span>
              <div className="font-medium text-gray-900 dark:text-white">
                {vulnerability.cvssScore || '-'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Gerät</span>
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {vulnerability.deviceName || 'Unbekannt'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Organisation</span>
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {vulnerability.organizationName || '-'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Software</span>
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {vulnerability.softwareName || '-'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Version</span>
              <div className="font-medium text-gray-900 dark:text-white">
                {vulnerability.softwareVersion || '-'}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Erstmals gesehen</span>
              <div className="font-medium text-gray-900 dark:text-white">
                {formatDate(vulnerability.firstSeenAt)}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-dark-400">Veröffentlicht</span>
              <div className="font-medium text-gray-900 dark:text-white">
                {formatDate(vulnerability.cvePublishedDate)}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200 dark:border-dark-border">
            {vulnerability.status === 'open' && (
              <>
                <Button
                  onClick={() => onUpdateStatus('patched')}
                  disabled={isUpdating}
                  size="sm"
                  variant="success"
                  icon={<CheckCircle size={14} />}
                >
                  Als gepatcht markieren
                </Button>
                <Button
                  onClick={() => onUpdateStatus('ignored')}
                  disabled={isUpdating}
                  size="sm"
                  variant="ghost"
                  icon={<EyeOff size={14} />}
                >
                  Ignorieren
                </Button>
                <Button
                  onClick={() => onUpdateStatus('false_positive')}
                  disabled={isUpdating}
                  size="sm"
                  variant="ghost"
                  icon={<XCircle size={14} />}
                >
                  False Positive
                </Button>
              </>
            )}

            {vulnerability.status !== 'open' && (
              <Button
                onClick={() => onUpdateStatus('open')}
                disabled={isUpdating}
                size="sm"
                variant="ghost"
                icon={<Eye size={14} />}
              >
                Wieder öffnen
              </Button>
            )}

            {!vulnerability.ticketId && vulnerability.status === 'open' && (
              <Button
                onClick={onCreateTicket}
                disabled={isUpdating}
                size="sm"
                variant="secondary"
                icon={<Ticket size={14} />}
              >
                Ticket erstellen
              </Button>
            )}

            <a
              href={`https://nvd.nist.gov/vuln/detail/${vulnerability.cveId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-sm text-accent-primary hover:underline"
            >
              NVD Details
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default VulnerabilitiesDashboard;
