import { Building2, Clock, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { SlaStatus } from '../SlaStatus';
import { Ticket, Customer, TimeEntry, formatDuration } from './types';

interface TicketMetadataProps {
  ticket: Ticket;
  customers: Customer[];
  timeEntries: TimeEntry[];
  onStartTimer: (ticket: Ticket) => void;
}

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

  return (
    <>
      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
          <Building2 className="text-gray-400" size={20} />
          <div>
            <div className="text-xs text-gray-500 dark:text-dark-400">Kunde</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {getCustomerName(ticket.customerId)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg">
          <Clock className="text-gray-400" size={20} />
          <div>
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
        Timer fur dieses Ticket starten
      </Button>
    </>
  );
};
