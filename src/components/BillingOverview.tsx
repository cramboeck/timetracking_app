import { useMemo } from 'react';
import { Clock, Receipt, CheckCircle2, Users, CalendarClock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { StatWidget } from './ui/StatWidget';
import { Card } from './ui/Card';
import { sevdeskApi } from '../services/api';

export interface BillingSummaryData {
  customerId: string;
  totalHours: number;
  roundedHours?: number;
  totalAmount: number;
  isBilled: boolean;
}

interface BillingOverviewProps {
  billingSummary: BillingSummaryData[];
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

const formatHours = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')} h`;
};

/**
 * KPI-Zeile der Abrechnung. FIN-2 (22.11.): Die frühere „Top offene
 * Abrechnungen"-Liste ist raus — sie zeigte dieselben Kunden mit denselben
 * Buttons wie die Hauptliste direkt darunter (bei wenigen Kunden 1:1).
 */
export const BillingOverview = ({ billingSummary }: BillingOverviewProps) => {
  const stats = useMemo(() => {
    const unbilled = billingSummary.filter(b => !b.isBilled);
    const billed = billingSummary.filter(b => b.isBilled);
    return {
      unbilledCount: unbilled.length,
      unbilledHours: Math.round(unbilled.reduce((s, b) => s + (b.roundedHours || b.totalHours), 0) * 10) / 10,
      unbilledAmount: unbilled.reduce((s, b) => s + b.totalAmount, 0),
      billedAmount: billed.reduce((s, b) => s + b.totalAmount, 0),
    };
  }, [billingSummary]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatWidget
        label="Offene Stunden"
        value={formatHours(stats.unbilledHours)}
        icon={Clock}
        color={stats.unbilledCount > 0 ? 'orange' : 'gray'}
      />
      <StatWidget
        label="Offener Betrag"
        value={formatCurrency(stats.unbilledAmount)}
        icon={Receipt}
        color={stats.unbilledAmount > 0 ? 'blue' : 'gray'}
      />
      <StatWidget
        label="Kunden offen"
        value={stats.unbilledCount}
        icon={Users}
        color={stats.unbilledCount > 0 ? 'purple' : 'green'}
      />
      <StatWidget
        label="Bereits abgerechnet"
        value={formatCurrency(stats.billedAmount)}
        icon={CheckCircle2}
        color="green"
      />
    </div>
  );
};

/**
 * Ablaufende Lizenzen/Abos (≤60 Tage, jüngste Laufzeit pro Kunde+Produkt aus
 * Distributoren-Belegen). Rendert nur bei Treffern.
 */
export const LicenseExpiryCard = () => {
  const licenseExpiryQuery = useQuery({
    queryKey: ['licenseExpiry'],
    queryFn: async () => (await sevdeskApi.getLicenseExpiry(60)).data,
    staleTime: 5 * 60 * 1000,
  });
  const expiringLicenses = licenseExpiryQuery.data ?? [];
  if (expiringLicenses.length === 0) return null;

  return (
    <Card className="rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarClock size={18} className="text-amber-500" />
          Ablaufende Lizenzen ({expiringLicenses.length})
        </h3>
        <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
          Jüngste bekannte Laufzeit pro Kunde und Produkt — Verlängerungen aus neuen Belegen entfernen den Eintrag automatisch
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-dark-border">
        {expiringLicenses.map((lic, idx) => {
          const expired = lic.daysLeft < 0;
          const urgent = lic.daysLeft <= 14;
          const badgeClass = expired || urgent
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : lic.daysLeft <= 30
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400';
          return (
            <div key={`${lic.customerId}-${idx}`} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {lic.description}
                  {lic.productSku && <span className="ml-2 text-xs font-mono text-gray-400">{lic.productSku}</span>}
                </p>
                <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                  {lic.customerName}
                  {lic.quantity !== null && <> • {lic.quantity}×</>}
                  {lic.serialNumber && <> • SN {lic.serialNumber}</>}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${badgeClass}`}>
                  {expired
                    ? `abgelaufen am ${new Date(lic.endDate).toLocaleDateString('de-DE')}`
                    : `${lic.daysLeft} Tag${lic.daysLeft === 1 ? '' : 'e'} — ${new Date(lic.endDate).toLocaleDateString('de-DE')}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
