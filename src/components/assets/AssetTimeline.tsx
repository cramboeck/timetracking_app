import type { AssetEvent } from '../../services/api';
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, type AssetStatus, type AssetType } from '../../services/api';

/** Änderungsverlauf eines Geräts (AS-7): wer hat wann was geändert. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name', assetType: 'Typ', customerId: 'Kunde', manufacturer: 'Hersteller', model: 'Modell',
  serialNumber: 'Seriennummer', inventoryNumber: 'Inventarnummer', status: 'Status', location: 'Standort',
  assignedTo: 'Nutzer', purchaseDate: 'Kaufdatum', warrantyUntil: 'Garantie bis', supplier: 'Lieferant',
  ipAddress: 'IP-Adresse', osName: 'Betriebssystem', notes: 'Notizen',
};

const show = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  const s = String(v);
  if (field === 'status') return ASSET_STATUS_LABELS[s as AssetStatus] ?? s;
  if (field === 'assetType') return ASSET_TYPE_LABELS[s as AssetType] ?? s;
  if (field === 'notes') return s.length > 40 ? `${s.slice(0, 40)}…` : s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
};

const describe = (e: AssetEvent): { title: string; lines: string[] } => {
  const d = e.details ?? {};
  switch (e.eventType) {
    case 'created':
      return { title: d.source === 'ninjaone' ? 'Aus NinjaOne übernommen' : 'Angelegt', lines: [] };
    case 'from_purchase':
      return { title: 'Aus Hardware-Kauf übernommen', lines: d.description ? [String(d.description)] : [] };
    case 'imported': return { title: 'Importiert', lines: [] };
    case 'ninja_linked': return { title: 'Mit NinjaOne verknüpft (Seriennummer)', lines: [] };
    case 'label_printed': return { title: 'Etikett gedruckt', lines: [] };
    case 'inventory_seen': return { title: 'Bei Inventur erfasst', lines: [] };
    case 'attachment_added': return { title: 'Anhang hinzugefügt', lines: d.name ? [String(d.name)] : [] };
    case 'attachment_removed': return { title: 'Anhang entfernt', lines: d.name ? [String(d.name)] : [] };
    case 'deleted': return { title: 'Gelöscht', lines: [] };
    case 'updated': {
      const changes = (d.changes ?? {}) as Record<string, [unknown, unknown]>;
      const lines = Object.entries(changes).map(([f, [a, b]]) =>
        f === 'notes' ? 'Notizen geändert' : f === 'customerId' ? 'Kunde geändert' : `${FIELD_LABELS[f] ?? f}: ${show(f, a)} → ${show(f, b)}`);
      return { title: 'Geändert', lines };
    }
    default: return { title: e.eventType, lines: [] };
  }
};

export const AssetTimeline = ({ events }: { events: AssetEvent[] }) => {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-dark-400">Noch keine Einträge.</p>;
  }
  return (
    <ol className="relative border-l border-gray-200 dark:border-dark-border ml-1.5 space-y-3">
      {events.map(e => {
        const { title, lines } = describe(e);
        return (
          <li key={e.id} className="pl-4 relative">
            <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-dark-400" />
            <p className="text-sm text-gray-900 dark:text-white">{title}</p>
            {lines.map((l, i) => <p key={i} className="text-xs text-gray-600 dark:text-dark-400 break-words">{l}</p>)}
            <p className="text-xs text-gray-400 dark:text-dark-400">
              {new Date(e.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
              {e.userName ? ` · ${e.userName}` : e.eventType === 'created' || e.eventType === 'ninja_linked' ? ' · automatisch' : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
};
