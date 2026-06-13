import { useState, useEffect } from 'react';
import { FileText, Clock, Calendar, CheckCircle, AlertCircle, User } from 'lucide-react';
import { customerPortalApi } from '../../services/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface ContractData {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  monthlyHours: number | null;
  usedHoursThisMonth: number;
  slaResponseMinutes: number | null;
  status: string;
  contactPerson: string | null;
  notes: string | null;
}

export const PortalContract = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractData | null>(null);

  useEffect(() => {
    loadContract();
  }, []);

  const loadContract = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerPortalApi.getContract();
      if (response.success) {
        setContract(response.data);
      } else {
        setError('Konnte Vertragsinformationen nicht laden');
      }
    } catch (err) {
      console.error('Failed to load contract:', err);
      setError('Konnte Vertragsinformationen nicht laden');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)} h`;
  };

  const formatSlaTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} Minuten`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} Stunde${hours !== 1 ? 'n' : ''}`;
    }
    return `${hours}h ${remainingMinutes}min`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle size={14} />
            Aktiv
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            <Clock size={14} />
            Ausstehend
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <AlertCircle size={14} />
            Abgelaufen
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-400">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary mx-auto" />
        <p className="mt-2 text-gray-500 dark:text-dark-400">Lade Vertragsinformationen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">{error}</p>
        <Button variant="secondary" size="sm" onClick={loadContract} className="mt-2">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-6 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-dark-400 mb-4" />
        <p className="text-gray-500 dark:text-dark-400">
          Kein aktiver Vertrag vorhanden
        </p>
      </div>
    );
  }

  const hoursPercentage = contract.monthlyHours
    ? Math.min((contract.usedHoursThisMonth / contract.monthlyHours) * 100, 100)
    : 0;
  const hoursRemaining = contract.monthlyHours
    ? Math.max(contract.monthlyHours - contract.usedHoursThisMonth, 0)
    : null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="text-accent-primary" size={24} />
            Vertragsinformationen
          </h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Ihr aktueller Service-Vertrag
          </p>
        </div>
        {getStatusBadge(contract.status)}
      </div>

      {/* Contract Overview */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {contract.name}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Laufzeit */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded-lg">
              <Calendar size={18} className="text-accent-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-400">Laufzeit</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatDate(contract.startDate)}
                {contract.endDate
                  ? ` - ${formatDate(contract.endDate)}`
                  : ' - unbefristet'
                }
              </p>
            </div>
          </div>

          {/* SLA */}
          {contract.slaResponseMinutes && (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Clock size={18} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-dark-400">SLA-Reaktionszeit</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatSlaTime(contract.slaResponseMinutes)}
                </p>
              </div>
            </div>
          )}

          {/* Contact Person */}
          {contract.contactPerson && (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <User size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-dark-400">Ansprechpartner</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {contract.contactPerson}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Hours Contingent */}
      {contract.monthlyHours && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Stundenkontingent (aktueller Monat)
          </h3>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-dark-400">
                {formatHours(contract.usedHoursThisMonth)} von {formatHours(contract.monthlyHours)} verbraucht
              </span>
              <span className={`font-medium ${
                hoursPercentage >= 90
                  ? 'text-red-600 dark:text-red-400'
                  : hoursPercentage >= 75
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-green-600 dark:text-green-400'
              }`}>
                {hoursPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="h-4 bg-gray-200 dark:bg-dark-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  hoursPercentage >= 90
                    ? 'bg-red-500'
                    : hoursPercentage >= 75
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${hoursPercentage}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-dark-400">Verbraucht</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatHours(contract.usedHoursThisMonth)}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-dark-400">Verbleibend</p>
              <p className={`text-2xl font-bold ${
                hoursRemaining && hoursRemaining < contract.monthlyHours * 0.1
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {hoursRemaining !== null ? formatHours(hoursRemaining) : '-'}
              </p>
            </div>
          </div>

          {/* Warning if low */}
          {hoursPercentage >= 90 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">
                Ihr Stundenkontingent ist fast aufgebraucht. Bitte kontaktieren Sie uns, wenn Sie zusätzliche Stunden benötigen.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Notes */}
      {contract.notes && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Hinweise
          </h3>
          <p className="text-gray-600 dark:text-dark-400 whitespace-pre-wrap">
            {contract.notes}
          </p>
        </Card>
      )}
    </div>
  );
};
