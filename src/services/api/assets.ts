/**
 * Assets API (AS-1/2/3) — Geräte unabhängig von NinjaOne.
 */
import { authFetch } from './base';

export type AssetType =
  | 'workstation' | 'laptop' | 'server' | 'printer' | 'network' | 'firewall'
  | 'storage' | 'phone' | 'mobile' | 'monitor' | 'other';
export type AssetStatus = 'active' | 'stock' | 'defective' | 'retired';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  workstation: 'Arbeitsplatz-PC',
  laptop: 'Laptop',
  server: 'Server',
  printer: 'Drucker',
  network: 'Netzwerk (Switch/AP/Router)',
  firewall: 'Firewall',
  storage: 'NAS / Storage',
  phone: 'Telefon',
  mobile: 'Smartphone / Tablet',
  monitor: 'Monitor',
  other: 'Sonstiges',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Im Einsatz',
  stock: 'Lager',
  defective: 'Defekt',
  retired: 'Ausgemustert',
};

export interface Asset {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  assetType: AssetType;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  status: AssetStatus;
  location: string | null;
  assignedTo: string | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  supplier: string | null;
  ipAddress: string | null;
  osName: string | null;
  notes: string | null;
  ninjaDeviceRef: string | null;
  sourceLineItemId: string | null;
  createdAt: string;
  updatedAt: string;
  ninja: { offline: boolean; lastContact: string | null; nodeClass: string | null } | null;
  openTickets: number;
}

export interface AssetHistory {
  tickets: { id: string; ticketNumber: string; title: string; status: string; priority: string; createdAt: string }[];
  maintenance: { id: string; title: string; scheduledStart: string | null; status: string }[];
}

export type AssetInput = Partial<{
  customerId: string | null;
  assetType: AssetType;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  status: AssetStatus;
  location: string | null;
  assignedTo: string | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  supplier: string | null;
  ipAddress: string | null;
  osName: string | null;
  notes: string | null;
}>;

export interface AssetListFilters {
  customerId?: string;
  status?: AssetStatus | 'all';
  type?: AssetType;
  search?: string;
  warrantyWithinDays?: number;
}

const qs = (f: AssetListFilters & { all?: boolean }) => {
  const p = new URLSearchParams();
  if (f.customerId) p.set('customerId', f.customerId);
  if (f.status) p.set('status', f.status);
  if (f.type) p.set('type', f.type);
  if (f.search) p.set('search', f.search);
  if (f.warrantyWithinDays) p.set('warrantyWithinDays', String(f.warrantyWithinDays));
  if (f.all) p.set('all', 'true');
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const assetsApi = {
  /** Komplette (gefilterte) Liste, max. 2000 — für Ansichten + Auswahllisten. */
  list: async (filters: AssetListFilters = {}): Promise<{ success: boolean; data: Asset[] }> =>
    authFetch(`/assets${qs({ ...filters, all: true })}`),

  get: async (id: string): Promise<{ success: boolean; data: Asset & { history: AssetHistory } }> =>
    authFetch(`/assets/${encodeURIComponent(id)}`),

  create: async (input: AssetInput & { name: string }): Promise<{ success: boolean; data: Asset }> =>
    authFetch('/assets', { method: 'POST', body: JSON.stringify(input) }),

  update: async (id: string, input: AssetInput): Promise<{ success: boolean; data: Asset }> =>
    authFetch(`/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),

  remove: async (id: string): Promise<{ success: boolean }> =>
    authFetch(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Hardware-Kauf aus dem Rechnungseingang als Gerät übernehmen (AS-3). */
  createFromLineItem: async (lineItemId: string, input: AssetInput & { name: string }): Promise<{ success: boolean; data: Asset }> =>
    authFetch(`/assets/from-line-item/${encodeURIComponent(lineItemId)}`, { method: 'POST', body: JSON.stringify(input) }),

  syncNinja: async (): Promise<{ success: boolean; data: { created: number; linked: number; updated: number } }> =>
    authFetch('/assets/sync-ninja', { method: 'POST' }),
};
