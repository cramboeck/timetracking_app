import { useMemo, useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  Plus, Search, RefreshCw, Wifi, WifiOff, ShieldAlert, Ticket as TicketIcon, ScanLine, ClipboardCheck,
  MoreHorizontal, Upload, Download, QrCode, Settings2, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import CustomerAvatar from '../ui/CustomerAvatar';
import { SearchableSelect } from '../SearchableSelect';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/UIContext';
import { Modal } from '../Modal';
import { devicePath, deviceIdFromPath } from '../AreaNavigation';
import {
  assetsApi, assetToolsApi, customersApi, ninjaApi, ASSET_STATUS_LABELS, ASSET_TYPE_LABELS,
  type Asset, type AssetStatus, type AssetType,
} from '../../services/api';
import { AssetTypeIcon, WarrantyLabel, fieldClasses, statusBadgeClass, warrantyDays } from './assetUi';
import { AssetDialog } from './AssetDialog';
import { AssetDetail } from './AssetDetail';
import { exportAssetsCsv } from './assetExport';

// Schwere Bausteine (jsPDF/QR, xlsx, Kamera-Erkennung) erst bei Bedarf laden
const LabelPrintDialog = lazy(() => import('./LabelPrintDialog').then(m => ({ default: m.LabelPrintDialog })));
const InventoryDialog = lazy(() => import('./InventoryDialog').then(m => ({ default: m.InventoryDialog })));
const AssetImportDialog = lazy(() => import('./AssetImportDialog').then(m => ({ default: m.AssetImportDialog })));
const CodeScanner = lazy(() => import('./CodeScanner').then(m => ({ default: m.CodeScanner })));

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
  const [localOpenId, setLocalOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelIds, setLabelIds] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<null | 'scan' | 'inventory' | 'import' | 'settings'>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Eigenständige Ansicht: geöffnetes Gerät steht in der URL (/support/devices/<id>)
  // — QR-Etiketten, Lesezeichen und Browser-Zurück funktionieren. Im CustomerHub lokal.
  const location = useLocation();
  const navigate = useNavigate();
  const openId = embedded ? localOpenId : deviceIdFromPath(location.pathname);
  const fromList = (location.state as { fromList?: boolean } | null)?.fromList === true;
  const setOpenId = useCallback((id: string | null) => {
    if (embedded) { setLocalOpenId(id); return; }
    if (id) navigate(devicePath(id), { state: { fromList: true } });
    else if (fromList) navigate(-1);
    else navigate('/support/devices');
  }, [embedded, navigate, fromList]);

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

  // Handscanner/Enter im Suchfeld: exakter Treffer (Asset-ID, Seriennr., QR-Link) öffnet direkt
  const openByCode = async (code: string): Promise<boolean> => {
    try {
      const r = await assetToolsApi.resolve(code.trim());
      setOpenId(r.data.id);
      return true;
    } catch {
      return false;
    }
  };

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = assets.length > 0 && assets.every(a => selected.has(a.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(assets.map(a => a.id)));

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
          <Button variant="secondary" onClick={() => setDialog('scan')} icon={<ScanLine size={16} />}>
            Scannen
          </Button>
          <Button variant="secondary" onClick={() => setDialog('inventory')} icon={<ClipboardCheck size={16} />}>
            <span className="hidden sm:inline">Inventur</span>
            <span className="sm:hidden sr-only">Inventur</span>
          </Button>
          <div className="relative">
            <Button variant="secondary" onClick={() => setMenuOpen(o => !o)} icon={<MoreHorizontal size={16} />} aria-label="Weitere Aktionen">
              <span className="sr-only">Mehr</span>
            </Button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-40 w-56 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 shadow-lg py-1 text-sm">
                  {[
                    { icon: <Upload size={15} />, label: 'Importieren (CSV/Excel)', onClick: () => setDialog('import') },
                    { icon: <Download size={15} />, label: 'Liste exportieren (CSV)', onClick: () => exportAssetsCsv(assets), disabled: assets.length === 0 },
                    { icon: <QrCode size={15} />, label: 'Etiketten für alle in der Liste', onClick: () => setLabelIds(assets.slice(0, 500).map(a => a.id)), disabled: assets.length === 0 },
                    ...(isAdmin ? [{ icon: <Settings2 size={15} />, label: 'Asset-ID-Präfix', onClick: () => setDialog('settings') }] : []),
                  ].map(item => (
                    <button key={item.label} type="button" disabled={'disabled' in item && item.disabled}
                      onClick={() => { setMenuOpen(false); item.onClick(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-700 dark:text-dark-500 hover:bg-gray-50 dark:hover:bg-dark-200 disabled:opacity-40">
                      <span className="text-gray-400">{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
            onKeyDown={async e => {
              if (e.key === 'Enter' && search.trim().length >= 3) {
                e.preventDefault();
                if (await openByCode(search)) setSearch('');
              }
            }}
            placeholder="Asset-ID, Name, Seriennr., Nutzer…" aria-label="Geräte durchsuchen" />
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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent-primary/10 px-3 py-2 text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{selected.size} ausgewählt</span>
          <Button size="sm" variant="primary" onClick={() => setLabelIds(Array.from(selected))} icon={<QrCode size={14} />}>
            Etiketten drucken
          </Button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white">
            <X size={14} /> Auswahl aufheben
          </button>
        </div>
      )}

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
                  <th className="pl-3 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Alle auswählen"
                      className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
                  </th>
                  <th className="px-3 py-2 font-medium">Gerät</th>
                  {!customerId && <th className="px-3 py-2 font-medium">Kunde</th>}
                  <th className="px-3 py-2 font-medium">Seriennr. / Inventar</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Garantie</th>
                  <th className="px-3 py-2 font-medium text-right">Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {assets.map(a => <AssetRow key={a.id} asset={a} showCustomer={!customerId} onOpen={() => setOpenId(a.id)}
                  selected={selected.has(a.id)} onToggle={() => toggle(a.id)} />)}
              </tbody>
            </table>
          </div>
          {/* Mobile: Karten */}
          <div className="md:hidden space-y-2">
            {assets.map(a => <AssetCard key={a.id} asset={a} showCustomer={!customerId} onOpen={() => setOpenId(a.id)}
              selected={selected.has(a.id)} onToggle={() => toggle(a.id)} />)}
          </div>
        </>
      )}

      <AssetDialog isOpen={creating} onClose={() => setCreating(false)} lockedCustomerId={customerId}
        onSaved={(a) => setOpenId(a.id)} />
      <AssetDetail assetId={openId} onClose={() => setOpenId(null)} canDelete={isAdmin} closeOnNavigate={embedded} />
      <Suspense fallback={null}>
        {labelIds && <LabelPrintDialog isOpen assetIds={labelIds} onClose={() => setLabelIds(null)} />}
        {dialog === 'inventory' && <InventoryDialog isOpen onClose={() => setDialog(null)} lockedCustomerId={customerId} />}
        {dialog === 'import' && <AssetImportDialog isOpen onClose={() => setDialog(null)} defaultCustomerId={customerId} />}
      </Suspense>
      {dialog === 'scan' && <ScanFindDialog onClose={() => setDialog(null)} onFound={(id) => { setDialog(null); setOpenId(id); }} />}
      {dialog === 'settings' && <PrefixDialog onClose={() => setDialog(null)} />}
    </div>
  );
};

const NinjaDot = ({ asset }: { asset: Asset }) => asset.ninja ? (
  <span title={asset.ninja.offline ? 'NinjaOne: offline' : 'NinjaOne: online'}
    className={asset.ninja.offline ? 'text-gray-400 dark:text-dark-400' : 'text-green-600 dark:text-green-400'}>
    {asset.ninja.offline ? <WifiOff size={13} /> : <Wifi size={13} />}
  </span>
) : null;

interface ItemProps { asset: Asset; showCustomer: boolean; onOpen: () => void; selected: boolean; onToggle: () => void }

const TagChip = ({ tag }: { tag: string | null }) => tag ? (
  <span className="font-mono text-[11px] font-semibold text-gray-500 dark:text-dark-400">{tag}</span>
) : null;

const AssetRow = ({ asset: a, showCustomer, onOpen, selected, onToggle }: ItemProps) => (
  <tr onClick={onOpen} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-200/60 ${selected ? 'bg-accent-primary/5' : ''}`}>
    <td className="pl-3 py-2.5" onClick={e => e.stopPropagation()}>
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`${a.name} auswählen`}
        className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
    </td>
    <td className="px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-gray-500 dark:text-dark-400 flex-shrink-0"><AssetTypeIcon type={a.assetType} /></span>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">{a.name} <NinjaDot asset={a} /></p>
          <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
            <TagChip tag={a.assetTag} />{a.assetTag ? ' · ' : ''}
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

const AssetCard = ({ asset: a, showCustomer, onOpen, selected, onToggle }: ItemProps) => (
  <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
    className={`w-full text-left rounded-xl border bg-white dark:bg-dark-100 p-3 active:bg-gray-50 dark:active:bg-dark-200 cursor-pointer ${selected ? 'border-accent-primary' : 'border-gray-200 dark:border-dark-border'}`}>
    <div className="flex items-start gap-3">
      <label className="-m-2 p-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`${a.name} auswählen`}
          className="rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary" />
      </label>
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
          <TagChip tag={a.assetTag} />
          {a.serialNumber && <span className="font-mono text-gray-600 dark:text-dark-400">SN {a.serialNumber}</span>}
          {a.warrantyUntil && <span>Garantie <WarrantyLabel warrantyUntil={a.warrantyUntil} /></span>}
          {a.openTickets > 0 && (
            <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"><TicketIcon size={12} />{a.openTickets} offen</span>
          )}
        </div>
      </div>
    </div>
  </div>
);

/** Etikett/Strichcode scannen → Gerät öffnen */
const ScanFindDialog = ({ onClose, onFound }: { onClose: () => void; onFound: (id: string) => void }) => {
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const handle = async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const r = await assetToolsApi.resolve(code);
      onFound(r.data.id);
    } catch {
      setError(`Kein Gerät zu „${code.length > 40 ? `${code.slice(0, 40)}…` : code}“ gefunden`);
    } finally {
      busy.current = false;
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="Gerät scannen" maxWidth="lg">
      <div className="space-y-3 text-left">
        <Suspense fallback={<div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-primary" /></div>}>
          <CodeScanner onCode={handle} />
        </Suspense>
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <p className="text-xs text-gray-500 dark:text-dark-400">QR-Code vom Etikett, Strichcode der Asset-ID oder die Seriennummer.</p>
      </div>
    </Modal>
  );
};

/** Admin: Präfix der Asset-IDs (IT-00001 …) */
const PrefixDialog = ({ onClose }: { onClose: () => void }) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['assets', 'settings'],
    queryFn: async () => (await assetToolsApi.getSettings()).data,
  });
  const [prefix, setPrefix] = useState<string | null>(null);
  const value = prefix ?? data?.prefix ?? '';
  const valid = /^[A-Za-z0-9]{1,8}$/.test(value);
  const save = useMutation({
    mutationFn: async () => (await assetToolsApi.updateSettings(value)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets', 'settings'] });
      showToast('Präfix gespeichert', 'success');
      onClose();
    },
    onError: () => showToast('Präfix konnte nicht gespeichert werden', 'error'),
  });
  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
      <Button variant="primary" onClick={() => save.mutate()} disabled={!valid || save.isPending || !data}>Speichern</Button>
    </div>
  );
  return (
    <Modal isOpen onClose={onClose} title="Asset-ID-Präfix" maxWidth="md" footer={footer}>
      <div className="space-y-3 text-left">
        <input className={`${fieldClasses} font-mono uppercase`} value={value} maxLength={8}
          onChange={e => setPrefix(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} aria-label="Präfix" />
        <p className="text-sm text-gray-600 dark:text-dark-400">
          Nächste Asset-ID: <span className="font-mono font-semibold text-gray-900 dark:text-white">
            {valid && data ? `${value.toUpperCase()}-${String(data.nextValue).padStart(5, '0')}` : '—'}
          </span>
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-400">
          Gilt nur für neue Geräte – vorhandene Asset-IDs (und gedruckte Etiketten) bleiben unverändert. Die laufende Nummer zählt weiter.
        </p>
      </div>
    </Modal>
  );
};
