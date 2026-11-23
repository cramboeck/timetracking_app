import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Pencil, Trash2, Ticket as TicketIcon, Wrench, Wifi, WifiOff, Package, RefreshCw } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { useConfirm, useToast } from '../../contexts/UIContext';
import { ticketPath } from '../AreaNavigation';
import { assetsApi, ninjaApi, ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, type Asset } from '../../services/api';
import { AssetTypeIcon, WarrantyLabel, fmtDate, statusBadgeClass } from './assetUi';
import { AssetDialog } from './AssetDialog';

/**
 * Geräte-Detail (AS-1/3): Stammdaten, NinjaOne-Live-Status (falls verknüpft),
 * Verlauf aus Tickets + Wartungen.
 */
interface AssetDetailProps {
  assetId: string | null;
  onClose: () => void;
  canDelete: boolean;
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-gray-500 dark:text-dark-400">{label}</dt>
    <dd className="text-sm text-gray-900 dark:text-white mt-0.5 break-words">{value || <span className="text-gray-400 dark:text-dark-400">—</span>}</dd>
  </div>
);

const TICKET_STATUS: Record<string, string> = {
  open: 'Offen', in_progress: 'In Bearbeitung', waiting: 'Wartend', resolved: 'Gelöst', closed: 'Geschlossen', archived: 'Archiviert',
};

export const AssetDetail = ({ assetId, onClose, canDelete }: AssetDetailProps) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: asset, isLoading } = useQuery({
    queryKey: ['assets', 'detail', assetId],
    queryFn: async () => (await assetsApi.get(assetId!)).data,
    enabled: !!assetId,
  });

  const ninjaRef = asset?.ninjaDeviceRef ?? null;
  const { data: patches } = useQuery({
    queryKey: ['assets', 'ninja-patches', ninjaRef],
    queryFn: async () => (await ninjaApi.getDeviceOSPatches(ninjaRef!)).data,
    enabled: !!ninjaRef,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { data: software } = useQuery({
    queryKey: ['assets', 'ninja-software', ninjaRef],
    queryFn: async () => (await ninjaApi.getDeviceSoftware(ninjaRef!)).data,
    enabled: !!ninjaRef,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refreshNinja = useMutation({
    mutationFn: async () => {
      await Promise.all([ninjaApi.refreshDeviceOSPatches(ninjaRef!), ninjaApi.refreshDeviceSoftware(ninjaRef!)]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', 'ninja-patches', ninjaRef] });
      queryClient.invalidateQueries({ queryKey: ['assets', 'ninja-software', ninjaRef] });
    },
    onError: () => showToast('NinjaOne-Daten konnten nicht aktualisiert werden', 'error'),
  });

  const remove = useMutation({
    mutationFn: async (a: Asset) => assetsApi.remove(a.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast('Gerät gelöscht', 'success');
      onClose();
    },
    onError: () => showToast('Gerät konnte nicht gelöscht werden', 'error'),
  });

  const handleDelete = async () => {
    if (!asset) return;
    const ok = await confirm({
      title: 'Gerät löschen?',
      message: asset.ninjaDeviceRef
        ? 'Dieses Gerät kommt aus NinjaOne und würde beim nächsten Abgleich wieder erscheinen. Für ausrangierte Geräte besser den Status „Ausgemustert“ setzen.'
        : `„${asset.name}“ wird gelöscht. Verknüpfte Tickets bleiben erhalten.`,
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (ok) remove.mutate(asset);
  };

  const footer = asset ? (
    <div className="flex flex-wrap justify-between gap-2">
      <div>
        {canDelete && (
          <Button variant="ghost" onClick={handleDelete} icon={<Trash2 size={16} />} className="text-red-600 dark:text-red-400">
            Löschen
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose}>Schließen</Button>
        <Button variant="primary" onClick={() => setEditing(true)} icon={<Pencil size={16} />}>Bearbeiten</Button>
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <Modal isOpen={!!assetId && !editing} onClose={onClose} title={asset?.name ?? 'Gerät'} maxWidth="3xl" footer={footer}>
        {isLoading || !asset ? (
          <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>
        ) : (
          <div className="space-y-5 text-left">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                <AssetTypeIcon type={asset.assetType} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  {ASSET_TYPE_LABELS[asset.assetType]}{asset.customerName ? ` · ${asset.customerName}` : ' · Eigenes Gerät'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className={statusBadgeClass(asset.status)}>{ASSET_STATUS_LABELS[asset.status]}</span>
                  {asset.ninja && (
                    <span className={`inline-flex items-center gap-1 text-xs ${asset.ninja.offline ? 'text-gray-500 dark:text-dark-400' : 'text-green-600 dark:text-green-400'}`}>
                      {asset.ninja.offline ? <WifiOff size={12} /> : <Wifi size={12} />}
                      NinjaOne: {asset.ninja.offline ? 'offline' : 'online'}
                      {asset.ninja.lastContact && ` · zuletzt ${new Date(asset.ninja.lastContact).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
                    </span>
                  )}
                  {asset.sourceLineItemId && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-dark-400">
                      <Package size={12} /> aus Hardware-Kauf
                    </span>
                  )}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <Field label="Hersteller" value={asset.manufacturer} />
              <Field label="Modell" value={asset.model} />
              <Field label="Seriennummer" value={asset.serialNumber && <span className="font-mono">{asset.serialNumber}</span>} />
              <Field label="Inventarnummer" value={asset.inventoryNumber} />
              <Field label="Standort" value={asset.location} />
              <Field label="Nutzer" value={asset.assignedTo} />
              <Field label="Kaufdatum" value={asset.purchaseDate && fmtDate(asset.purchaseDate)} />
              <Field label="Garantie bis" value={asset.warrantyUntil && <WarrantyLabel warrantyUntil={asset.warrantyUntil} />} />
              <Field label="Lieferant" value={asset.supplier} />
              <Field label="IP-Adresse" value={asset.ipAddress && <span className="font-mono">{asset.ipAddress}</span>} />
              <Field label="Betriebssystem" value={asset.osName} />
            </dl>
            {asset.notes && (
              <div className="rounded-xl bg-gray-50 dark:bg-dark-200 p-3 text-sm text-gray-700 dark:text-dark-500 whitespace-pre-wrap">{asset.notes}</div>
            )}

            {ninjaRef && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">NinjaOne</p>
                  <Button variant="ghost" size="sm" onClick={() => refreshNinja.mutate()} disabled={refreshNinja.isPending}
                    icon={<RefreshCw size={14} className={refreshNinja.isPending ? 'animate-spin' : ''} />}>
                    Aktualisieren
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-400">Ausstehende Patches</p>
                    <p className={`font-semibold ${patches && patches.pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                      {patches ? patches.pendingCount : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-dark-400">Installierte Software</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{software ? software.software.length : '—'}</p>
                  </div>
                </div>
                {patches && patches.pending.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-dark-400">
                    {patches.pending.slice(0, 5).map(p => <li key={p.id} className="truncate">• {p.kbNumber ? `${p.kbNumber} – ` : ''}{p.name}</li>)}
                    {patches.pending.length > 5 && <li>… und {patches.pending.length - 5} weitere</li>}
                  </ul>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Verlauf</p>
              {asset.history.tickets.length === 0 && asset.history.maintenance.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-dark-400">Noch keine Tickets oder Wartungen zu diesem Gerät.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border">
                  {asset.history.tickets.map(t => (
                    <li key={t.id}>
                      <button type="button" onClick={() => { onClose(); navigate(ticketPath(t.id)); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-dark-200">
                        <TicketIcon size={15} className="text-gray-400 flex-shrink-0" />
                        <span className="font-mono text-xs text-gray-500 dark:text-dark-400">{t.ticketNumber}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-white">{t.title}</span>
                        <span className="text-xs text-gray-500 dark:text-dark-400 whitespace-nowrap">{TICKET_STATUS[t.status] ?? t.status}</span>
                      </button>
                    </li>
                  ))}
                  {asset.history.maintenance.map(m => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <Wrench size={15} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-white">{m.title}</span>
                      <span className="text-xs text-gray-500 dark:text-dark-400 whitespace-nowrap">{fmtDate(m.scheduledStart)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
      <AssetDialog isOpen={editing} onClose={() => setEditing(false)} asset={asset ?? null} />
    </>
  );
};
