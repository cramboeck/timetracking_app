import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, RefreshCw, Wifi, WifiOff, ShieldAlert, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import CustomerAvatar from '../ui/CustomerAvatar';
import { SearchableSelect } from '../SearchableSelect';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/UIContext';
import {
  assetsApi, customersApi, ninjaApi, ASSET_STATUS_LABELS, ASSET_TYPE_LABELS,
  type Asset, type AssetStatus, type AssetType,
} from '../../services/api';
import { AssetTypeIcon, WarrantyLabel, fieldClasses, statusBadgeClass, warrantyDays } from './assetUi';
import { AssetDialog } from './AssetDialog';
import { AssetDetail } from './AssetDetail';

/**
 * Geräte (AS-1): EINE Liste für manuell gepflegte und NinjaOne-Geräte.
 * `customerId` gesetzt = eingebettet im CustomerHub (AS-2).
 */
interface AssetsViewProps {
  customerId?: string;
  embedded?: boolean;
}

const STATUS_FILTERS: { value: '' | AssetStatus | 'all'; label: string }[] = [
  { value: '', label: 'Alle außer ausgemustert' },
  { value: 'active', label: ASSET_STATUS_LABELS.active },
  { value: 'stock', label: ASSET_STATUS_LABELS.stock },
  { value: 'defective', label: ASSET_STATUS_LABELS.defective },
  { value: 'retired', label: ASSET_STATUS_LABELS.retired },
  { value: 'all', label: 'Alle' },
];

export const AssetsView = ({ customerId, embedded = false }: AssetsViewProps) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | AssetType>('');
  const [statusFilter, setStatusFilter] = useState<'' | AssetStatus | 'all'>('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveCustomer = customerId ?? customerFilter;
  const { data: assets = [], isLoading, isError } = useQuery({
    queryKey: ['assets', 'list', effectiveCustomer, typeFilter, statusFilter, debounced],
    queryFn: async () => (await assetsApi.list({
      customerId: effectiveCustomer || undefined,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      search: debounced || undefined,
    })).data ?? [],
    placeholderData: prev => prev,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: async () => (await customersApi.getAll()).data ?? [],
    enabled: !customerId,
    staleTime: 5 * 60_000,
  });
  const customerOptions = useMemo(() => [
    { value: 'none', label: 'Ohne Kunde (eigene Geräte)' },
    ...customers.map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
  ], [customers]);

  const { data: ninjaConfigured = false } = useQuery({
    queryKey: ['ninja', 'configured'],
    queryFn: async () => {
      try {
        const r = await ninjaApi.getConfig();
        return !!r.data;
      } catch {
        return false;
      }
    },
    enabled: isAdmin && !embedded,
    staleTime: 10 * 60_000,
  });

  const syncNinja = useMutation({
    mutationFn: async () => (await assetsApi.syncNinja()).data,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast(`NinjaOne abgeglichen: ${r.created} neu, ${r.linked} verknüpft, ${r.updated} aktualisiert`, 'success');
    },
    onError: () => showToast('Abgleich mit NinjaOne fehlgeschlagen', 'error'),
  });

  const warrantySoon = assets.filter(a => {
    const d = warrantyDays(a.warrantyUntil);
    return d !== null && d <= 60 && a.status !== 'retired';
  }).length;

  return (
    <div className={embedded ? 'space-y-4' : 'p-4 sm:p-6 space-y-4'}>
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded ? (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Geräte</h1>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              Alle Geräte deiner Kunden – manuell gepflegt oder automatisch aus NinjaOne.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-dark-400 pt-2">
            {assets.length} {assets.length === 1 ? 'Gerät' : 'Geräte'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {ninjaConfigured && (
            <Button variant="secondary" onClick={() => syncNinja.mutate()} disabled={syncNinja.isPending}
              icon={<RefreshCw size={16} className={syncNinja.isPending ? 'animate-spin' : ''} />}>
              <span className="hidden sm:inline">Mit NinjaOne abgleichen</span>
              <span className="sm:hidden">NinjaOne</span>
            </Button>
          )}
          <Button variant="primary" onClick={() => setCreating(true)} icon={<Plus size={16} />}>
            Gerät anlegen
          </Button>
        </div>
      </div>

      {warrantySoon > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <ShieldAlert size={16} className="flex-shrink-0" />
          {warrantySoon === 1 ? '1 Gerät hat' : `${warrantySoon} Geräte haben`} eine abgelaufene oder in den nächsten 60 Tagen auslaufende Garantie.
        </div>
      )}

      {/* Filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative col-span-2 lg:col-span-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${fieldClasses} pl-9`} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, Seriennr., Modell, Nutzer…" />
        </div>
        {!customerId && (
          <div className="col-span-2 lg:col-span-1">
            <SearchableSelect options={customerOptions} value={customerFilter} onChange={setCustomerFilter}
              placeholder="Alle Kunden" allowClear />
          </div>
        )}
        <select className={fieldClasses} value={typeFilter} onChange={e => setTypeFilter(e.target.value as '' | AssetType)}>
          <option value="">Alle Typen</option>
          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map(t => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
        </select>
        <select className={fieldClasses} value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | AssetStatus | 'all')}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Geräte konnten nicht geladen werden.</p>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-dark-border p-8 text-center">
          <p className="text-gray-900 dark:text-white font-medium">Noch keine Geräte{debounced || typeFilter || statusFilter || customerFilter ? ' für diese Filter' : ''}</p>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            Lege Drucker, Firewalls, NAS, Telefone oder PCs manuell an – mit NinjaOne erscheinen dessen Geräte automatisch.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: Tabelle */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-200 text-left text-xs text-gray-500 dark:text-dark-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Gerät</th>
                  {!customerId && <th className="px-3 py-2 font-medium">Kunde</th>}
                  <th className="px-3 py-2 font-medium">Seriennr. / Inventar</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Garantie</th>
                  <th className="px-3 py-2 font-medium text-right">Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {assets.map(a => <AssetRow key={a.id} asset={a} showCustomer={!customerId} onOpen={() => setOpenId(a.id)} />)}
              </tbody>
            </table>
          </div>
          {/* Mobile: Karten */}
          <div className="md:hidden space-y-2">
            {assets.map(a => <AssetCard key={a.id} asset={a} showCustomer={!customerId} onOpen={() => setOpenId(a.id)} />)}
          </div>
        </>
      )}

      <AssetDialog isOpen={creating} onClose={() => setCreating(false)} lockedCustomerId={customerId}
        onSaved={(a) => setOpenId(a.id)} />
      <AssetDetail assetId={openId} onClose={() => setOpenId(null)} canDelete={isAdmin} />
    </div>
  );
};

const NinjaDot = ({ asset }: { asset: Asset }) => asset.ninja ? (
  <span title={asset.ninja.offline ? 'NinjaOne: offline' : 'NinjaOne: online'}
    className={asset.ninja.offline ? 'text-gray-400 dark:text-dark-400' : 'text-green-600 dark:text-green-400'}>
    {asset.ninja.offline ? <WifiOff size={13} /> : <Wifi size={13} />}
  </span>
) : null;

const AssetRow = ({ asset: a, showCustomer, onOpen }: { asset: Asset; showCustomer: boolean; onOpen: () => void }) => (
  <tr onClick={onOpen} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-200/60">
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-gray-500 dark:text-dark-400 flex-shrink-0"><AssetTypeIcon type={a.assetType} /></span>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">{a.name} <NinjaDot asset={a} /></p>
          <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
            {[a.manufacturer, a.model].filter(Boolean).join(' ') || ASSET_TYPE_LABELS[a.assetType]}
            {a.assignedTo ? ` · ${a.assignedTo}` : ''}{a.location ? ` · ${a.location}` : ''}
          </p>
        </div>
      </div>
    </td>
    {showCustomer && (
      <td className="px-3 py-2.5">
        {a.customerName ? (
          <div className="flex items-center gap-2 min-w-0">
            <CustomerAvatar name={a.customerName} color={a.customerColor} logoUrl={a.customerLogoUrl} size="sm" />
            <span className="truncate text-gray-700 dark:text-dark-500">{a.customerName}</span>
          </div>
        ) : <span className="text-gray-400 dark:text-dark-400">Eigenes Gerät</span>}
      </td>
    )}
    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-dark-400">
      {a.serialNumber || '—'}{a.inventoryNumber ? <span className="block">Inv. {a.inventoryNumber}</span> : null}
    </td>
    <td className="px-3 py-2.5"><span className={statusBadgeClass(a.status)}>{ASSET_STATUS_LABELS[a.status]}</span></td>
    <td className="px-3 py-2.5 whitespace-nowrap"><WarrantyLabel warrantyUntil={a.warrantyUntil} /></td>
    <td className="px-3 py-2.5 text-right">
      {a.openTickets > 0
        ? <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"><TicketIcon size={13} />{a.openTickets}</span>
        : <span className="text-gray-400 dark:text-dark-400">—</span>}
    </td>
  </tr>
);

const AssetCard = ({ asset: a, showCustomer, onOpen }: { asset: Asset; showCustomer: boolean; onOpen: () => void }) => (
  <button type="button" onClick={onOpen}
    className="w-full text-left rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 p-3 active:bg-gray-50 dark:active:bg-dark-200">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-gray-500 dark:text-dark-400 flex-shrink-0"><AssetTypeIcon type={a.assetType} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">{a.name} <NinjaDot asset={a} /></p>
          <span className={statusBadgeClass(a.status)}>{ASSET_STATUS_LABELS[a.status]}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-dark-400 truncate mt-0.5">
          {showCustomer ? (a.customerName ?? 'Eigenes Gerät') + ' · ' : ''}
          {[a.manufacturer, a.model].filter(Boolean).join(' ') || ASSET_TYPE_LABELS[a.assetType]}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
          {a.serialNumber && <span className="font-mono text-gray-600 dark:text-dark-400">SN {a.serialNumber}</span>}
          {a.warrantyUntil && <span>Garantie <WarrantyLabel warrantyUntil={a.warrantyUntil} /></span>}
          {a.openTickets > 0 && (
            <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"><TicketIcon size={12} />{a.openTickets} offen</span>
          )}
        </div>
      </div>
    </div>
  </button>
);
