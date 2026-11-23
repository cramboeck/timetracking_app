import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, ChevronRight, Wifi, WifiOff, Unlink, Plus, ExternalLink } from 'lucide-react';
import { assetsApi, ASSET_TYPE_LABELS, type Asset } from '../../services/api';
import { SearchableSelect } from '../SearchableSelect';
import { AssetTypeIcon, WarrantyLabel } from '../assets/assetUi';
import { AssetDialog } from '../assets/AssetDialog';
import { AssetDetail } from '../assets/AssetDetail';

/**
 * Gerät am Ticket (AS-2): wählt aus der Geräteverwaltung (manuell gepflegt
 * ODER aus NinjaOne). Vorher nur NinjaOne-Geräte — Kunden ohne NinjaOne
 * konnten gar kein Gerät verknüpfen.
 */
interface TicketDeviceLinkProps {
  customerId?: string | null;
  linkedAssetId: string | null;
  /** Alt-Verknüpfung (tickets.device_id = NinjaOne-Cache-ID) */
  linkedDeviceId?: string;
  onAssetChange: (assetId: string | null) => Promise<void>;
}

export const TicketDeviceLink = ({ customerId, linkedAssetId, linkedDeviceId, onAssetChange }: TicketDeviceLinkProps) => {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const hasLink = !!(linkedAssetId || linkedDeviceId);
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets', 'list', customerId ?? 'none', 'ticket-picker'],
    queryFn: async () => (await assetsApi.list({ customerId: customerId || 'none' })).data ?? [],
    enabled: expanded || hasLink,
    staleTime: 60_000,
  });

  // Alt-Tickets tragen nur device_id → über die NinjaOne-Referenz auflösen
  const linked: Asset | undefined = useMemo(
    () => assets.find(a => a.id === linkedAssetId) ?? (linkedDeviceId ? assets.find(a => a.ninjaDeviceRef === linkedDeviceId) : undefined),
    [assets, linkedAssetId, linkedDeviceId]
  );

  // Bereits verknüpftes Gerät steht als Karte darüber — Auswahl = „anderes Gerät"
  const options = useMemo(() => assets.filter(a => a.id !== linked?.id).map(a => ({
    value: a.id,
    label: a.name,
    sublabel: [ASSET_TYPE_LABELS[a.assetType], a.model, a.serialNumber ? `SN ${a.serialNumber}` : null, a.assignedTo].filter(Boolean).join(' · '),
  })), [assets, linked]);

  const change = async (assetId: string | null) => {
    setSaving(true);
    try {
      await onAssetChange(assetId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Monitor size={16} className="text-gray-500 dark:text-dark-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">Gerät</span>
          {linked && (
            <span className="text-sm text-gray-500 dark:text-dark-400 truncate">· {linked.name}</span>
          )}
        </div>
        <ChevronRight size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-dark-border px-4 py-3 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary" />
            </div>
          ) : (
            <>
              {linked ? (
                <div className="bg-gray-50 dark:bg-dark-100 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="p-2 bg-white dark:bg-dark-200 rounded-lg text-gray-600 dark:text-dark-400">
                      <AssetTypeIcon type={linked.assetType} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 dark:text-white truncate">{linked.name}</span>
                        {linked.ninja && (linked.ninja.offline
                          ? <WifiOff size={13} className="text-gray-400" />
                          : <Wifi size={13} className="text-green-500" />)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-dark-400 space-y-0.5 mt-0.5">
                        <div>{[linked.manufacturer, linked.model].filter(Boolean).join(' ') || ASSET_TYPE_LABELS[linked.assetType]}</div>
                        {linked.serialNumber && <div className="font-mono">SN {linked.serialNumber}</div>}
                        {linked.assignedTo && <div>Nutzer: {linked.assignedTo}</div>}
                        {linked.warrantyUntil && <div>Garantie: <WarrantyLabel warrantyUntil={linked.warrantyUntil} /></div>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <button type="button" onClick={() => setDetailId(linked.id)} className="inline-flex items-center gap-1 text-accent-primary hover:underline">
                      <ExternalLink size={12} /> Gerät öffnen
                    </button>
                    <button type="button" onClick={() => change(null)} disabled={saving}
                      className="inline-flex items-center gap-1 text-gray-500 dark:text-dark-400 hover:text-red-600">
                      <Unlink size={12} /> Verknüpfung lösen
                    </button>
                  </div>
                </div>
              ) : hasLink ? (
                <p className="text-xs text-gray-500 dark:text-dark-400">Das verknüpfte Gerät ist nicht mehr in der Geräteverwaltung.</p>
              ) : null}

              {options.length > 0 ? (
                <SearchableSelect
                  options={options}
                  value=""
                  onChange={(v) => change(v || null)}
                  placeholder={linked ? 'Anderes Gerät wählen…' : customerId ? 'Gerät des Kunden wählen…' : 'Eigenes Gerät wählen…'}
                  disabled={saving}
                />
              ) : (
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  {linked ? 'Keine weiteren Geräte erfasst.' : customerId ? 'Für diesen Kunden sind noch keine Geräte erfasst.' : 'Noch keine eigenen Geräte erfasst.'}
                </p>
              )}
              <button type="button" onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline">
                <Plus size={12} /> Neues Gerät anlegen und verknüpfen
              </button>
            </>
          )}
        </div>
      )}

      <AssetDialog
        isOpen={creating}
        onClose={() => setCreating(false)}
        lockedCustomerId={customerId || undefined}
        onSaved={(a) => { void change(a.id); }}
      />
      <AssetDetail assetId={detailId} onClose={() => setDetailId(null)} canDelete={false} />
    </div>
  );
};
