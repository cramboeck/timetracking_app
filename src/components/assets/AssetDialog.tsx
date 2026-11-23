import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../SearchableSelect';
import { ModernDatePicker } from '../ModernDatePicker';
import { useToast } from '../../contexts/UIContext';
import {
  assetsApi, customersApi, ASSET_STATUS_LABELS, ASSET_TYPE_LABELS,
  type Asset, type AssetInput, type AssetStatus, type AssetType,
} from '../../services/api';
import { fieldClasses, labelClasses } from './assetUi';

/**
 * Gerät anlegen/bearbeiten (AS-1). `prefill` belegt ein neues Gerät vor —
 * z.B. aus dem CustomerHub (Kunde) oder aus einem Hardware-Kauf (AS-3).
 */
interface AssetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  asset?: Asset | null;
  prefill?: AssetInput & { sourceLineItemId?: string };
  /** Kunde fest vorgegeben (CustomerHub) → keine Kundenauswahl */
  lockedCustomerId?: string;
  onSaved?: (asset: Asset) => void;
}

const EMPTY = {
  name: '', assetType: 'workstation' as AssetType, status: 'active' as AssetStatus, customerId: '',
  manufacturer: '', model: '', serialNumber: '', inventoryNumber: '', location: '', assignedTo: '',
  purchaseDate: '', warrantyUntil: '', supplier: '', ipAddress: '', osName: '', notes: '',
};
type FormState = typeof EMPTY;

export const AssetDialog = ({ isOpen, onClose, asset, prefill, lockedCustomerId, onSaved }: AssetDialogProps) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const src = asset ?? prefill ?? {};
    const next: FormState = { ...EMPTY };
    (Object.keys(EMPTY) as (keyof FormState)[]).forEach(k => {
      const v = (src as Record<string, unknown>)[k];
      if (v !== null && v !== undefined) (next as Record<string, string>)[k] = String(v);
    });
    if (lockedCustomerId) next.customerId = lockedCustomerId;
    setForm(next);
    setShowMore(!!(next.purchaseDate || next.supplier || next.ipAddress || next.osName || next.notes));
  }, [isOpen, asset, prefill, lockedCustomerId]);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: async () => (await customersApi.getAll()).data ?? [],
    enabled: isOpen && !lockedCustomerId,
    staleTime: 5 * 60_000,
  });
  const customerOptions = useMemo(
    () => customers.map(c => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [customers]
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload: AssetInput & { name: string } = {
        name: form.name.trim(),
        assetType: form.assetType,
        status: form.status,
        customerId: form.customerId || null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serialNumber: form.serialNumber || null,
        inventoryNumber: form.inventoryNumber || null,
        location: form.location || null,
        assignedTo: form.assignedTo || null,
        purchaseDate: form.purchaseDate || null,
        warrantyUntil: form.warrantyUntil || null,
        supplier: form.supplier || null,
        ipAddress: form.ipAddress || null,
        osName: form.osName || null,
        notes: form.notes || null,
      };
      if (asset) return (await assetsApi.update(asset.id, payload)).data;
      if (prefill?.sourceLineItemId) {
        return (await assetsApi.createFromLineItem(prefill.sourceLineItemId, payload)).data;
      }
      return (await assetsApi.create(payload)).data;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast(asset ? 'Gerät gespeichert' : 'Gerät angelegt', 'success');
      onSaved?.(saved);
      onClose();
    },
    onError: (e: Error) => showToast(e.message || 'Gerät konnte nicht gespeichert werden', 'error'),
  });

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
      <Button variant="primary" onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
        {save.isPending ? 'Speichert…' : asset ? 'Speichern' : 'Anlegen'}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={asset ? 'Gerät bearbeiten' : 'Gerät anlegen'} maxWidth="2xl" footer={footer}>
      <div className="space-y-4 text-left">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClasses}>Name *</label>
            <input className={fieldClasses} value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="z.B. Empfangs-PC, Kyocera 2. OG, Firewall Zentrale" autoFocus />
          </div>
          <div>
            <label className={labelClasses}>Typ</label>
            <select className={fieldClasses} value={form.assetType} onChange={e => set('assetType', e.target.value as AssetType)}>
              {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map(t => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Status</label>
            <select className={fieldClasses} value={form.status} onChange={e => set('status', e.target.value as AssetStatus)}>
              {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map(s => <option key={s} value={s}>{ASSET_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {!lockedCustomerId && (
            <div className="sm:col-span-2">
              <label className={labelClasses}>Kunde</label>
              <SearchableSelect options={customerOptions} value={form.customerId} onChange={v => set('customerId', v)}
                placeholder="Kunde wählen (leer = eigenes Gerät)" allowClear />
            </div>
          )}
          <div>
            <label className={labelClasses}>Hersteller</label>
            <input className={fieldClasses} value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          </div>
          <div>
            <label className={labelClasses}>Modell</label>
            <input className={fieldClasses} value={form.model} onChange={e => set('model', e.target.value)} />
          </div>
          <div>
            <label className={labelClasses}>Seriennummer</label>
            <input className={fieldClasses} value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelClasses}>Inventarnummer</label>
            <input className={fieldClasses} value={form.inventoryNumber} onChange={e => set('inventoryNumber', e.target.value)} />
          </div>
          <div>
            <label className={labelClasses}>Standort</label>
            <input className={fieldClasses} value={form.location} onChange={e => set('location', e.target.value)} placeholder="z.B. Büro 2. OG" />
          </div>
          <div>
            <label className={labelClasses}>Nutzer</label>
            <input className={fieldClasses} value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="z.B. Frau Huber" />
          </div>
          <div>
            <label className={labelClasses}>Garantie bis</label>
            <ModernDatePicker value={form.warrantyUntil} onChange={v => set('warrantyUntil', v)} compact allowFuture clearable placeholder="Kein Datum" />
          </div>
        </div>

        {!showMore ? (
          <button type="button" onClick={() => setShowMore(true)} className="text-sm text-accent-primary hover:underline">
            + Kauf, Netzwerk & Notizen
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-100 dark:border-dark-border">
            <div className="pt-3">
              <label className={labelClasses}>Kaufdatum</label>
              <ModernDatePicker value={form.purchaseDate} onChange={v => set('purchaseDate', v)} compact clearable placeholder="Kein Datum" />
            </div>
            <div className="pt-3">
              <label className={labelClasses}>Lieferant</label>
              <input className={fieldClasses} value={form.supplier} onChange={e => set('supplier', e.target.value)} />
            </div>
            <div>
              <label className={labelClasses}>IP-Adresse</label>
              <input className={fieldClasses} value={form.ipAddress} onChange={e => set('ipAddress', e.target.value)} />
            </div>
            <div>
              <label className={labelClasses}>Betriebssystem / Firmware</label>
              <input className={fieldClasses} value={form.osName} onChange={e => set('osName', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClasses}>Notizen</label>
              <textarea className={fieldClasses} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="z.B. Zugangsdaten liegen im Passwortsafe, Wartungsvertrag bis …" />
            </div>
          </div>
        )}
        {!asset && prefill?.sourceLineItemId && (
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Aus einem Hardware-Kauf übernommen. Der Einkaufspreis bleibt in der Rechnung und wird nicht am Gerät gespeichert.
          </p>
        )}
        {asset?.ninjaDeviceRef && (
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Mit NinjaOne verknüpft: Hersteller, Modell, Seriennummer, IP und Betriebssystem werden beim Abgleich aktualisiert.
          </p>
        )}
      </div>
    </Modal>
  );
};
