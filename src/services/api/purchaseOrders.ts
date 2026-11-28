/**
 * WE-1 Bestellvorgänge: Bestell-Postfach → Vorgänge, Zuordnung zu Ticket/Kunde/Eigenbedarf.
 */
import { authFetch, authFetchMultipart } from './base';

export type PurchaseOrderStatus = 'expected' | 'ordered' | 'shipped' | 'received' | 'cancelled';
export type PurchaseOrderFilter = 'open' | 'unassigned' | 'received' | 'all';

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  expected: 'Vorbereitet',
  ordered: 'Bestellt',
  shipped: 'Versendet',
  received: 'Geliefert',
  cancelled: 'Storniert',
};

export interface PurchaseOrderTracking { carrier: string | null; number: string; url: string | null }

export interface PurchaseOrderLine {
  id: string;
  position: number | null;
  description: string;
  articleNumber: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  itemType: string | null;
  receivedQuantity: number;
  needsSerials: boolean;
  suggestedAssetType: string;
}

export interface PurchaseOrder {
  id: string;
  status: PurchaseOrderStatus;
  supplierName: string | null;
  supplierEmail: string | null;
  orderNumber: string | null;
  orderDate: string | null;
  reference: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  ticketTitle: string | null;
  customerId: string | null;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  isInternal: boolean;
  assignmentSource: string | null;
  unassigned: boolean;
  deliveryAddress: string | null;
  netAmount: number | null;
  grossAmount: number | null;
  currency: string;
  tracking: PurchaseOrderTracking[];
  notes: string | null;
  source: string;
  lineCount: number;
  messageCount: number;
  /** WE-3: verknüpfte Lieferantenrechnungen */
  invoiceCount: number;
  billingClearedAt: string | null;
  receivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lines: PurchaseOrderLine[];
}

export interface PrepareOrderResult { id: string; reference: string; created: boolean }

export interface ProcessOrderMailboxResult { success: boolean; processed: number; error?: string }

export interface ReceiveLineInput { lineId: string; quantity: number; serials?: string[]; assetType?: string }
export interface GoodsReceiptResult {
  status: PurchaseOrderStatus;
  complete: boolean;
  created: Array<{ id: string; assetTag: string | null; name: string; serialNumber: string; lineId: string }>;
  existing: Array<{ id: string; assetTag: string | null; name: string; serialNumber: string }>;
  received: Array<{ lineId: string; quantity: number }>;
}

/** WE-3 Abrechnungs-Sicherung */
export type BillingCheckState = 'no_invoice' | 'not_extracted' | 'pending';
export interface BillingCheckItem {
  orderId: string;
  orderNumber: string | null;
  supplierName: string | null;
  customerId: string;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  receivedAt: string | null;
  orderNet: number | null;
  state: BillingCheckState;
  invoiceCount: number;
  invoiceNet: number | null;
  pendingCount: number;
  pendingAmount: number;
  amountMismatch: boolean;
}

export interface OrderDocumentResult {
  orderId: string;
  created: boolean;
  linesAdded: number;
  linesKept: boolean;
  usedImages: boolean;
  recognized: { supplierName: string | null; orderNumber: string | null; reference: string | null; netAmount: number | null; lineCount: number };
  assignedTo: 'ticket' | 'customer' | 'internal' | null;
  order: PurchaseOrder;
}

export interface ReprocessStatus {
  running: boolean;
  total: number;
  processed: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: { orders: number; ignored: number } | null;
}
export interface IgnoredOrderMail {
  id: string;
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  receivedAt: string | null;
  reason: 'marketing' | 'not_order' | 'no_order_number' | 'cancellation' | string | null;
  aiType: string | null;
  canPromote: boolean;
}

export type AssignTarget = { ticketId: string } | { customerId: string } | { internal: true };

export const purchaseOrdersApi = {
  list: async (filter: PurchaseOrderFilter, search?: string): Promise<{
    success: boolean; data: PurchaseOrder[]; counts: { open: number; unassigned: number };
  }> => {
    const p = new URLSearchParams({ filter });
    if (search && search.trim()) p.set('search', search.trim());
    return authFetch(`/purchase-orders?${p.toString()}`);
  },
  byTicket: async (ticketId: string): Promise<{ success: boolean; data: PurchaseOrder[] }> =>
    authFetch(`/purchase-orders/by-ticket/${encodeURIComponent(ticketId)}`),
  prepare: async (ticketId: string): Promise<{ success: boolean; data: PrepareOrderResult }> =>
    authFetch('/purchase-orders/prepare', { method: 'POST', body: JSON.stringify({ ticketId }) }),
  processMailbox: async (): Promise<{ success: boolean; data: ProcessOrderMailboxResult }> =>
    authFetch('/purchase-orders/process', { method: 'POST', body: JSON.stringify({}) }),
  assign: async (id: string, target: AssignTarget): Promise<{ success: boolean; data: PurchaseOrder }> =>
    authFetch(`/purchase-orders/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify(target) }),
  /** Beleg (PDF/Foto) auslesen → neuer Vorgang oder bestehenden ergänzen */
  uploadDocument: async (file: File, orderId?: string): Promise<{ success: boolean; data: OrderDocumentResult }> => {
    const fd = new FormData();
    fd.append('file', file);
    return authFetchMultipart(`/purchase-orders/document${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`, fd);
  },
  /** Alle Vorgänge zurücksetzen und das Postfach der letzten `days` Tage neu einlesen (Hintergrund) */
  reset: async (days = 30): Promise<{ success: boolean; data: { deleted: number; resetPrepared: number; keptManual: number; status: ReprocessStatus } }> =>
    authFetch('/purchase-orders/reset', { method: 'POST', body: JSON.stringify({ days, reprocess: true }) }),
  reprocessStatus: async (): Promise<{ success: boolean; data: ReprocessStatus }> =>
    authFetch('/purchase-orders/reprocess-status'),
  ignored: async (): Promise<{ success: boolean; data: IgnoredOrderMail[] }> =>
    authFetch('/purchase-orders/ignored'),
  promote: async (id: string): Promise<{ success: boolean; data: { orderId: string | null } }> =>
    authFetch(`/purchase-orders/ignored/${encodeURIComponent(id)}/promote`, { method: 'POST', body: JSON.stringify({}) }),
  billingCheck: async (): Promise<{ success: boolean; data: BillingCheckItem[] }> =>
    authFetch('/purchase-orders/billing-check'),
  clearBilling: async (id: string, cleared: boolean, note?: string): Promise<{ success: boolean }> =>
    authFetch(`/purchase-orders/${encodeURIComponent(id)}/billing-clear`, { method: 'POST', body: JSON.stringify(note ? { cleared, note } : { cleared }) }),
  /** WE-2 Wareneingang: Mengen buchen, Seriennummern → Geräte */
  receive: async (id: string, input: {
    lines: ReceiveLineInput[];
    /** freie Artikel, die nicht als Position am Vorgang stehen */
    extraLines?: Array<{ description: string; quantity: number; serials?: string[]; assetType?: string }>;
    complete?: boolean;
  }): Promise<{ success: boolean; data: GoodsReceiptResult }> =>
    authFetch(`/purchase-orders/${encodeURIComponent(id)}/receive`, { method: 'POST', body: JSON.stringify(input) }),
  update: async (id: string, input: { status?: PurchaseOrderStatus; notes?: string | null }): Promise<{ success: boolean; data: PurchaseOrder }> =>
    authFetch(`/purchase-orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
};

/** Öffentliche Sendungsverfolgung der gängigen Paketdienste, wenn die Mail keinen Link enthielt. */
const TRACKING_URLS: Record<string, (n: string) => string> = {
  DHL: n => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${n}`,
  UPS: n => `https://www.ups.com/track?tracknum=${n}`,
  DPD: n => `https://tracking.dpd.de/status/de_DE/parcel/${n}`,
  GLS: n => `https://gls-group.com/DE/de/paketverfolgung?match=${n}`,
};
export const trackingUrl = (t: PurchaseOrderTracking): string | null => {
  if (t.url && /^https:\/\//i.test(t.url)) return t.url;
  const build = t.carrier ? TRACKING_URLS[t.carrier.toUpperCase()] : undefined;
  return build ? build(encodeURIComponent(t.number)) : null;
};
