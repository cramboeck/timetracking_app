import { Mail, Upload, Link2 } from 'lucide-react';

export type ReceiptSource = 'email' | 'manual' | 'sevdesk_import';

interface SourceBadgeProps {
  source: ReceiptSource | string | null | undefined;
  size?: 'sm' | 'xs';
}

// Kleines Badge, das die Herkunft eines Belegs anzeigt: E-Mail-Inbox,
// Manual-Upload oder sevDesk-Sync. Wird auf jeder Beleg-Card in der
// Inbox, in der globalen Suche und im Finanzen-Belege-Tab gerendert,
// damit User auf einen Blick sehen wo der Beleg herkam.
export const SourceBadge = ({ source, size = 'xs' }: SourceBadgeProps) => {
  const meta = (() => {
    switch (source) {
      case 'manual':
        return { label: 'Manual', icon: Upload, color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary' };
      case 'sevdesk_import':
        return { label: 'sevDesk', icon: Link2, color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
      case 'email':
      default:
        return { label: 'E-Mail', icon: Mail, color: 'bg-gray-100 text-gray-700 dark:bg-dark-200 dark:text-dark-400' };
    }
  })();
  const Icon = meta.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${padding} ${meta.color}`}>
      <Icon size={size === 'sm' ? 12 : 10} />
      {meta.label}
    </span>
  );
};
