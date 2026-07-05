import { Building2, Clock, Play, User, Mail, Globe, AlertCircle, Smartphone, FileCheck, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { SlaStatus } from '../SlaStatus';
import { Ticket, Customer, TimeEntry, formatDuration } from './types';
import { TicketSource } from '../../types';
import { Contract } from '../../services/api';

interface TicketMetadataProps {
  ticket: Ticket;
  customers: Customer[];
  timeEntries: TimeEntry[];
  activeContract?: Contract;
  onStartTimer: (ticket: Ticket) => void;
}

const sourceConfig: Record<TicketSource, { label: string; icon: typeof Mail; color: string }> = {
  manual: { label: 'Manuell', icon: Globe, color: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400' },
  email: { label: 'E-Mail', icon: Mail, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  ninja_alert: { label: 'NinjaRMM', icon: AlertCircle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  portal: { label: 'Kundenportal', icon: Smartphone, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

export const TicketMetadata = ({
  ticket,
  customers,
  timeEntries,
  activeContract,
  onStartTimer,
}: TicketMetadataProps) => {
  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unbekannt';
  };

  const totalTime = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const source = ticket.source || 'manual';
  const SourceIcon = sourceConfig[source]?.icon || Globe;

  // Contract hours info
  const includedHours = activeContract?.includedHoursMonthly ?? 0;
  const hourlyRate = activeContract?.hourlyRate ?? 0;
  const overageRate = activeContract?.overageRate ?? 0;

  return (
    <div className="bg-white dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-border p-4 space-y-4">
      {/* Source Badge */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sourceConfig[source]?.color || sourceConfig.manual.color}`}>
          <SourceIcon size={12} />
          {sourceConfig[source]?.label || 'Manuell'}
        </span>
      </div>

      {/* Info Grid */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-dark-200 rounded-lg flex items-center justify-center">
            <Building2 className="text-gray-500 dark:text-dark-400" size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500 dark:text-dark-400">Kunde</div>
            <div className="font-medium text-gray-900 dark:text-white truncate">
              {getCustomerName(ticket.customerId)}
            </div>
          </div>
        </div>

        {ticket.assigneeName && (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-dark-200 rounded-lg flex items-center justify-center">
              <User className="text-gray-500 dark:text-dark-400" size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500 dark:text-dark-400">Zugewiesen an</div>
              <div className="font-medium text-gray-900 dark:text-white truncate">
                {ticket.assigneeName}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-dark-200 rounded-lg flex items-center justify-center">
            <Clock className="text-gray-500 dark:text-dark-400" size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-500 dark:text-dark-400">Erfasste Zeit</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {formatDuration(totalTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Contract Info */}
      {activeContract && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <FileCheck className="text-green-600 dark:text-green-400" size={16} />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Wartungsvertrag aktiv
            </span>
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 mb-2">
            {activeContract.name}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {includedHours > 0 && (
              <div className="bg-green-100 dark:bg-green-800/30 rounded p-1.5">
                <div className="text-green-500 dark:text-green-500">Inkl. Stunden</div>
                <div className="font-medium text-green-700 dark:text-green-300">{includedHours}h/Monat</div>
              </div>
            )}
            {hourlyRate > 0 && (
              <div className="bg-green-100 dark:bg-green-800/30 rounded p-1.5">
                <div className="text-green-500 dark:text-green-500">Stundensatz</div>
                <div className="font-medium text-green-700 dark:text-green-300">{hourlyRate}€/h</div>
              </div>
            )}
            {activeContract.slaResponseHours && (
              <div className="bg-green-100 dark:bg-green-800/30 rounded p-1.5">
                <div className="text-green-500 dark:text-green-500">SLA Reaktion</div>
                <div className="font-medium text-green-700 dark:text-green-300">{activeContract.slaResponseHours}h</div>
              </div>
            )}
            {overageRate > 0 && overageRate !== hourlyRate && (
              <div className="bg-green-100 dark:bg-green-800/30 rounded p-1.5">
                <div className="text-green-500 dark:text-green-500">Mehrarbeit</div>
                <div className="font-medium text-green-700 dark:text-green-300">{overageRate}€/h</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Contract Warning */}
      {!activeContract && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-yellow-600 dark:text-yellow-400" size={16} />
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              Kein aktiver Wartungsvertrag
            </span>
          </div>
        </div>
      )}

      {/* SLA Status */}
      <SlaStatus
        firstResponseDueAt={ticket.firstResponseDueAt}
        resolutionDueAt={ticket.resolutionDueAt}
        firstResponseAt={ticket.firstResponseAt}
        slaFirstResponseBreached={ticket.slaFirstResponseBreached}
        slaResolutionBreached={ticket.slaResolutionBreached}
        status={ticket.status}
      />

      {/* Start Timer Button */}
      <Button
        onClick={() => onStartTimer(ticket)}
        variant="success"
        size="lg"
        fullWidth
        icon={<Play size={20} />}
      >
        Timer starten
      </Button>
    </div>
  );
};
