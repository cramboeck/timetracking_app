/**
 * Assets API (AS-1/2/3) — Geräte unabhängig von NinjaOne.
 */
import { authFetch, authFetchMultipart, API_BASE_URL, getAuthToken } from './base';

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
  assetTag: string | null;
  lastSeenAt: string | null;
  lastSeenByName: string | null;
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

  get: async (id: string): Promise<{ success: boolean; data: AssetDetailData }> =>
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

// ---------------------------------------------------------------------------
// AS-4…7: Asset-ID, Etiketten, Scan/Inventur, Import, Anhänge, Verlauf
// ---------------------------------------------------------------------------

export interface AssetEvent {
  id: string;
  eventType: string;
  details: Record<string, unknown> | null;
  userName: string | null;
  createdAt: string;
}

export interface AssetAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AssetDetailData extends Asset {
  attachments: AssetAttachment[];
  history: AssetHistory & { events: AssetEvent[] };
}

export interface LabelData {
  id: string;
  assetTag: string;
  name: string;
  customerName: string | null;
  serialNumber: string | null;
  location: string | null;
  url: string;
}

export interface LabelCompany {
  name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface InventoryItem {
  id: string;
  assetTag: string | null;
  name: string;
  assetType: AssetType;
  location: string | null;
  assignedTo: string | null;
  serialNumber: string | null;
  customerName: string | null;
  seenAt: string | null;
}

export interface InventorySummary {
  id: string;
  title: string | null;
  customerName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  seenCount: number;
}

export interface InventoryDetail {
  id: string;
  customerId: string | null;
  customerName: string | null;
  title: string | null;
  startedAt: string | null;
  startedByName: string | null;
  completedAt: string | null;
  expected: InventoryItem[];
  unexpected: InventoryItem[];
}

export type ImportRow = Partial<Record<
  'name' | 'assetType' | 'customer' | 'manufacturer' | 'model' | 'serialNumber' | 'inventoryNumber'
  | 'status' | 'location' | 'assignedTo' | 'purchaseDate' | 'warrantyUntil' | 'supplier'
  | 'ipAddress' | 'osName' | 'notes', string>>;

export interface ImportResult {
  row: number;
  status: 'created' | 'ready' | 'skipped' | 'error';
  message?: string;
  name?: string;
  assetTag?: string;
}

export interface PublicLabelInfo {
  assetTag: string | null;
  support: LabelCompany;
  portalUrl: string;
  portalTicketUrl: string;
}

export const assetToolsApi = {
  getSettings: async (): Promise<{ success: boolean; data: { prefix: string; nextValue: number } }> =>
    authFetch('/assets/settings'),
  updateSettings: async (prefix: string): Promise<{ success: boolean; data: { prefix: string; nextValue: number } }> =>
    authFetch('/assets/settings', { method: 'PUT', body: JSON.stringify({ prefix }) }),

  /** Scan-Code (QR-Link, Asset-ID, Seriennummer) → Gerät. */
  resolve: async (code: string): Promise<{ success: boolean; data: Asset }> =>
    authFetch(`/assets/resolve?code=${encodeURIComponent(code)}`),
  byLabel: async (token: string): Promise<{ success: boolean; data: { id: string } }> =>
    authFetch(`/assets/by-label/${encodeURIComponent(token)}`),

  labels: async (ids: string[]): Promise<{ success: boolean; data: { labels: LabelData[]; company: LabelCompany } }> =>
    authFetch('/assets/labels', { method: 'POST', body: JSON.stringify({ ids }) }),

  inventories: async (): Promise<{ success: boolean; data: InventorySummary[] }> =>
    authFetch('/assets/inventories'),
  createInventory: async (customerId: string | null, title?: string): Promise<{ success: boolean; data: InventoryDetail }> =>
    authFetch('/assets/inventories', { method: 'POST', body: JSON.stringify({ customerId, title }) }),
  getInventory: async (id: string): Promise<{ success: boolean; data: InventoryDetail }> =>
    authFetch(`/assets/inventories/${encodeURIComponent(id)}`),
  markSeen: async (id: string, input: { code?: string; assetId?: string }): Promise<{ success: boolean; data: { asset: InventoryItem; alreadySeen: boolean; expected: boolean } }> =>
    authFetch(`/assets/inventories/${encodeURIComponent(id)}/seen`, { method: 'POST', body: JSON.stringify(input) }),
  completeInventory: async (id: string): Promise<{ success: boolean }> =>
    authFetch(`/assets/inventories/${encodeURIComponent(id)}/complete`, { method: 'POST' }),

  import: async (rows: ImportRow[], options: { dryRun?: boolean; defaultCustomerId?: string | null } = {}): Promise<{ success: boolean; data: { results: ImportResult[]; created: number } }> =>
    authFetch('/assets/import', { method: 'POST', body: JSON.stringify({ rows, ...options }) }),

  uploadAttachment: async (assetId: string, file: File): Promise<{ success: boolean; data: AssetAttachment }> => {
    const fd = new FormData();
    fd.append('file', file);
    return authFetchMultipart(`/assets/${encodeURIComponent(assetId)}/attachments`, fd);
  },
  /** Anhang als Blob (authentifiziert) — für Vorschau und Download. */
  attachmentBlob: async (assetId: string, attId: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE_URL}/assets/${encodeURIComponent(assetId)}/attachments/${encodeURIComponent(attId)}/download`, {
      headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
    });
    if (!res.ok) throw new Error('Anhang konnte nicht geladen werden');
    return res.blob();
  },
  deleteAttachment: async (assetId: string, attId: string): Promise<{ success: boolean }> =>
    authFetch(`/assets/${encodeURIComponent(assetId)}/attachments/${encodeURIComponent(attId)}`, { method: 'DELETE' }),

  /** Öffentlich, ohne Login — Landing-Seite hinter dem QR-Code. */
  publicLabel: async (token: string): Promise<PublicLabelInfo | null> => {
    const res = await fetch(`${API_BASE_URL}/public/asset-label/${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const body = await res.json() as { data: PublicLabelInfo };
    return body.data;
  },
};
