import {
  Monitor, Laptop, Server, Printer, Network, Shield, HardDrive, Phone, Smartphone, MonitorSmartphone, Box,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AssetStatus, AssetType } from '../../services/api';

/** Gemeinsame Bausteine der Geräte-Ansichten (AS-1/2/3). */

export const fieldClasses =
  'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 text-sm';
export const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1';

export const AssetTypeIcon = ({ type, size = 18 }: { type: AssetType; size?: number }) => {
  const icons: Record<AssetType, ReactNode> = {
    workstation: <Monitor size={size} />,
    laptop: <Laptop size={size} />,
    server: <Server size={size} />,
    printer: <Printer size={size} />,
    network: <Network size={size} />,
    firewall: <Shield size={size} />,
    storage: <HardDrive size={size} />,
    phone: <Phone size={size} />,
    mobile: <Smartphone size={size} />,
    monitor: <MonitorSmartphone size={size} />,
    other: <Box size={size} />,
  };
  return <>{icons[type] ?? <Box size={size} />}</>;
};

const STATUS_STYLES: Record<AssetStatus, string> = {
  active: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  stock: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  defective: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  retired: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400',
};

export const statusBadgeClass = (s: AssetStatus) =>
  `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[s] ?? STATUS_STYLES.retired}`;

/** Tage bis zum Garantieende (negativ = abgelaufen), null ohne Datum. */
export const warrantyDays = (warrantyUntil: string | null): number | null => {
  if (!warrantyUntil) return null;
  const [y, m, d] = warrantyUntil.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
};

export const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export const WarrantyLabel = ({ warrantyUntil }: { warrantyUntil: string | null }) => {
  const days = warrantyDays(warrantyUntil);
  if (days === null) return <span className="text-gray-400 dark:text-dark-400">—</span>;
  const cls = days < 0
    ? 'text-red-600 dark:text-red-400'
    : days <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-dark-500';
  const hint = days < 0 ? 'abgelaufen' : days <= 60 ? `noch ${days} Tg.` : '';
  return (
    <span className={cls}>
      {fmtDate(warrantyUntil)}{hint && <span className="text-xs ml-1">({hint})</span>}
    </span>
  );
};
