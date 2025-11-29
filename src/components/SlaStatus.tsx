import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface SlaStatusProps {
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  firstResponseAt?: string;
  slaFirstResponseBreached?: boolean;
  slaResolutionBreached?: boolean;
  status: string;
  compact?: boolean;
}

export const SlaStatus = ({
  firstResponseDueAt,
  resolutionDueAt,
  firstResponseAt,
  slaFirstResponseBreached,
  slaResolutionBreached,
  status,
  compact = false,
}: SlaStatusProps) => {
  // No SLA assigned
  if (!firstResponseDueAt && !resolutionDueAt) {
    return null;
  }

  const now = new Date();
  const isResolved = ['resolved', 'closed', 'archived'].includes(status);

  // Calculate time remaining for first response
  const firstResponseDue = firstResponseDueAt ? new Date(firstResponseDueAt) : null;
  const firstResponseDone = !!firstResponseAt;
  const firstResponseRemaining = firstResponseDue ? firstResponseDue.getTime() - now.getTime() : 0;
  const firstResponseBreached = slaFirstResponseBreached || (firstResponseDue && !firstResponseDone && firstResponseRemaining < 0);

  // Calculate time remaining for resolution
  const resolutionDue = resolutionDueAt ? new Date(resolutionDueAt) : null;
  const resolutionRemaining = resolutionDue ? resolutionDue.getTime() - now.getTime() : 0;
  const resolutionBreached = slaResolutionBreached || (resolutionDue && !isResolved && resolutionRemaining < 0);

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    const absMs = Math.abs(ms);
    const minutes = Math.floor(absMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  // Get urgency level (for color coding)
  const getUrgencyLevel = (remaining: number, breached: boolean): 'breached' | 'critical' | 'warning' | 'ok' => {
    if (breached) return 'breached';
    const hoursRemaining = remaining / (1000 * 60 * 60);
    if (hoursRemaining < 1) return 'critical';
    if (hoursRemaining < 4) return 'warning';
    return 'ok';
  };

  const colorClasses = {
    breached: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    critical: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30',
    warning: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
    ok: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  };

  // Compact version for list view
  if (compact) {
    // Show the most urgent SLA
    let urgency: 'breached' | 'critical' | 'warning' | 'ok' = 'ok';
    let timeStr = '';
    let label = '';

    if (!firstResponseDone && firstResponseDue && !isResolved) {
      urgency = getUrgencyLevel(firstResponseRemaining, !!firstResponseBreached);
      timeStr = formatTimeRemaining(firstResponseRemaining);
      label = firstResponseBreached ? 'Antwort' : '';
    } else if (!isResolved && resolutionDue) {
      urgency = getUrgencyLevel(resolutionRemaining, !!resolutionBreached);
      timeStr = formatTimeRemaining(resolutionRemaining);
      label = resolutionBreached ? 'Lsg.' : '';
    } else if (isResolved) {
      // Show completed status
      if (slaFirstResponseBreached || slaResolutionBreached) {
        urgency = 'breached';
        label = 'SLA verfehlt';
      } else {
        urgency = 'ok';
        label = 'SLA erfüllt';
      }
    }

    if (!timeStr && !label) return null;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorClasses[urgency]}`}>
        {urgency === 'breached' ? (
          <AlertTriangle size={12} />
        ) : urgency === 'ok' && isResolved ? (
          <CheckCircle size={12} />
        ) : (
          <Clock size={12} />
        )}
        {label && <span>{label}</span>}
        {timeStr && (
          <span>{firstResponseBreached || resolutionBreached ? `+${timeStr}` : timeStr}</span>
        )}
      </span>
    );
  }

  // Full version for detail view
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
        <Clock size={16} />
        SLA-Status
      </h4>

      {/* First Response SLA */}
      {firstResponseDue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Erste Antwort:</span>
          {firstResponseDone ? (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              slaFirstResponseBreached ? colorClasses.breached : colorClasses.ok
            }`}>
              {slaFirstResponseBreached ? (
                <>
                  <AlertTriangle size={12} />
                  Verfehlt
                </>
              ) : (
                <>
                  <CheckCircle size={12} />
                  Erledigt
                </>
              )}
            </span>
          ) : isResolved ? (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              slaFirstResponseBreached ? colorClasses.breached : colorClasses.ok
            }`}>
              {slaFirstResponseBreached ? (
                <>
                  <AlertTriangle size={12} />
                  Verfehlt
                </>
              ) : (
                <>
                  <CheckCircle size={12} />
                  OK
                </>
              )}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              colorClasses[getUrgencyLevel(firstResponseRemaining, !!firstResponseBreached)]
            }`}>
              {firstResponseBreached ? (
                <>
                  <AlertTriangle size={12} />
                  +{formatTimeRemaining(firstResponseRemaining)} überfällig
                </>
              ) : (
                <>
                  <Clock size={12} />
                  {formatTimeRemaining(firstResponseRemaining)} verbleibend
                </>
              )}
            </span>
          )}
        </div>
      )}

      {/* Resolution SLA */}
      {resolutionDue && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Lösung:</span>
          {isResolved ? (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              slaResolutionBreached ? colorClasses.breached : colorClasses.ok
            }`}>
              {slaResolutionBreached ? (
                <>
                  <AlertTriangle size={12} />
                  Verfehlt
                </>
              ) : (
                <>
                  <CheckCircle size={12} />
                  Erledigt
                </>
              )}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              colorClasses[getUrgencyLevel(resolutionRemaining, !!resolutionBreached)]
            }`}>
              {resolutionBreached ? (
                <>
                  <AlertTriangle size={12} />
                  +{formatTimeRemaining(resolutionRemaining)} überfällig
                </>
              ) : (
                <>
                  <Clock size={12} />
                  {formatTimeRemaining(resolutionRemaining)} verbleibend
                </>
              )}
            </span>
          )}
        </div>
      )}

      {/* Due dates */}
      <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        {firstResponseDue && (
          <div>Antwort fällig: {firstResponseDue.toLocaleString('de-DE')}</div>
        )}
        {resolutionDue && (
          <div>Lösung fällig: {resolutionDue.toLocaleString('de-DE')}</div>
        )}
      </div>
    </div>
  );
};
