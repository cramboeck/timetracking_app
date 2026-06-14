import { Building2, Clock, Play, User, Mail, Globe, AlertCircle, Smartphone } from 'lucide-react';
import { Button } from '../ui/Button';
import { SlaStatus } from '../SlaStatus';
import { Ticket, Customer, TimeEntry, formatDuration } from './types';
import { TicketSource } from '../../types';

interface TicketMetadataProps {
  ticket: Ticket;
  customers: Customer[];
  timeEntries: TimeEntry[];
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
  onStartTimer,
}: TicketMetadataProps) => {
  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unbekannt';
  };

  const totalTime = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const source = ticket.source || 'manual';
  const SourceIcon = sourceConfig[source]?.icon || Globe;

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
