#!/usr/bin/env node
/**
 * RamboFlow MCP-Server — Phase 1 (read-only).
 *
 * Dünner Wrapper über die RamboFlow-REST-API: alle Aufrufe laufen mit einem
 * API-Token (Einstellungen → API-Zugriff) durch die normalen Routen — damit
 * greifen Berechtigungen (Paket S) und das Audit-Log unverändert.
 *
 * Konfiguration über Umgebungsvariablen:
 *   RAMBOFLOW_API_URL   z.B. https://app.ramboeck.it/api (Pflicht)
 *   RAMBOFLOW_API_TOKEN rbf_… (Pflicht — niemals ins Repo!)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.RAMBOFLOW_API_URL?.replace(/\/$/, '');
const API_TOKEN = process.env.RAMBOFLOW_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.error('RAMBOFLOW_API_URL und RAMBOFLOW_API_TOKEN müssen gesetzt sein.');
  process.exit(1);
}

async function api(path: string): Promise<any> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || message;
    } catch { /* Rohtext behalten */ }
    throw new Error(`${message} (${path})`);
  }
  return JSON.parse(text);
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const fmtH = (h: number) => `${h.toFixed(2).replace('.', ',')} h`;

/** Default-Zeitraum: aktueller Monat (lokale Zeit) */
function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

const server = new McpServer({ name: 'ramboflow', version: '1.0.0' });

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD')
  .optional();

server.tool(
  'abrechnung_uebersicht',
  'Offene und abgerechnete Zeiten pro Kunde (Stunden, Beträge). Standard: aktueller Monat.',
  { startDate: dateParam, endDate: dateParam },
  async ({ startDate, endDate }) => {
    const range = currentMonthRange();
    const start = startDate ?? range.start;
    const end = endDate ?? range.end;
    const res = await api(`/sevdesk/billing-summary?startDate=${start}&endDate=${end}`);
    const items: any[] = res.data ?? [];
    if (items.length === 0) return text(`Keine abrechenbaren Zeiten im Zeitraum ${start} bis ${end}.`);

    const lines = items.map(i =>
      `- ${i.customerName}: ${fmtH(i.roundedHours)} (${i.entries?.length ?? 0} Einträge)` +
      (i.totalAmount != null ? ` → ${fmtEur(i.totalAmount)}` : '') +
      ` [${i.isBilled ? 'abgerechnet' : 'OFFEN'}]` +
      (i.sevdeskCustomerId ? '' : ' ⚠️ nicht mit sevDesk verknüpft')
    );
    const open = items.filter(i => !i.isBilled);
    const openSum = open.reduce((s, i) => s + (i.totalAmount ?? 0), 0);
    return text(
      `Abrechnungsübersicht ${start} bis ${end}:\n${lines.join('\n')}\n\n` +
      `Offen gesamt: ${fmtEur(openSum)} (${open.length} Kunde(n))`
    );
  }
);

server.tool(
  'zeiten_liste',
  'Eigene Zeiteinträge auflisten (Datum, Projekt, Beschreibung, Dauer). Standard: aktueller Monat.',
  { startDate: dateParam, endDate: dateParam, searchText: z.string().max(200).optional() },
  async ({ startDate, endDate, searchText }) => {
    const range = currentMonthRange();
    const params = new URLSearchParams({
      page: '1',
      limit: '100',
      startDate: startDate ?? range.start,
      endDate: endDate ?? range.end,
    });
    if (searchText) params.set('searchText', searchText);
    // GET /entries liefert nur projectId — Namen einmal auflösen
    const [entriesRes, projectsRes] = await Promise.all([
      api(`/entries?${params.toString()}`),
      api('/projects'),
    ]);
    const entries: any[] = entriesRes.data ?? entriesRes.entries ?? [];
    const projectNames = new Map<string, string>(
      (projectsRes.data ?? projectsRes.projects ?? []).map((p: any) => [p.id, p.name])
    );
    if (entries.length === 0) return text('Keine Zeiteinträge im Zeitraum gefunden.');

    const totalSeconds = entries.reduce((s, e) => s + (e.duration ?? 0), 0);
    const lines = entries.slice(0, 50).map(e => {
      const date = e.startTime ? new Date(e.startTime).toLocaleDateString('de-DE') : '?';
      const hours = fmtH((e.duration ?? 0) / 3600);
      const project = projectNames.get(e.projectId) ?? e.internalCategory ?? 'Ohne Projekt';
      return `- ${date} · ${project} · ${hours}${e.description ? ` — ${e.description}` : ''}`;
    });
    const more = entries.length > 50 ? `\n… und ${entries.length - 50} weitere` : '';
    return text(`${entries.length} Einträge, gesamt ${fmtH(totalSeconds / 3600)}:\n${lines.join('\n')}${more}`);
  }
);

server.tool(
  'tickets_liste',
  'Support-Tickets auflisten/filtern. status: open|in_progress|waiting|resolved|closed; assignedTo: "me" für eigene.',
  {
    status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
    searchText: z.string().max(200).optional(),
    assignedTo: z.string().max(100).optional(),
  },
  async ({ status, searchText, assignedTo }) => {
    const params = new URLSearchParams({ page: '1', limit: '25' });
    if (status) params.set('status', status);
    if (searchText) params.set('searchText', searchText);
    if (assignedTo) params.set('assignedTo', assignedTo);
    const res = await api(`/tickets?${params.toString()}`);
    const tickets: any[] = res.data ?? res.tickets ?? [];
    if (tickets.length === 0) return text('Keine Tickets gefunden.');

    const lines = tickets.map(t =>
      `- ${t.ticketNumber} [${t.status}/${t.priority}] ${t.title}` +
      (t.customerName ? ` · ${t.customerName}` : ' · intern') +
      (t.assigneeName ? ` · Bearbeiter: ${t.assigneeName}` : ' · unzugewiesen')
    );
    return text(`${tickets.length} Ticket(s):\n${lines.join('\n')}`);
  }
);

server.tool(
  'ticket_details',
  'Details zu einem Ticket inkl. der letzten Kommentare. ticketNumber z.B. "TKT-000123".',
  { ticketNumber: z.string().regex(/^TKT-\d{6}$/, 'Format: TKT-000123') },
  async ({ ticketNumber }) => {
    const search = await api(`/tickets?page=1&limit=5&searchText=${encodeURIComponent(ticketNumber)}`);
    const hit = (search.data ?? search.tickets ?? []).find((t: any) => t.ticketNumber === ticketNumber);
    if (!hit) return text(`Ticket ${ticketNumber} nicht gefunden.`);

    const res = await api(`/tickets/${hit.id}`);
    const t = res.data ?? res;
    const comments: any[] = t.comments ?? [];
    const lastComments = comments.slice(-3).map((c: any) => {
      const when = c.createdAt ? new Date(c.createdAt).toLocaleString('de-DE') : '?';
      return `  · ${when} ${c.authorName ?? '?'}${c.isInternal ? ' (intern)' : ''}: ${String(c.content ?? '').slice(0, 200)}`;
    });
    return text(
      `${t.ticketNumber} — ${t.title}\n` +
      `Status: ${t.status} · Priorität: ${t.priority}` +
      (t.customerName ? ` · Kunde: ${t.customerName}` : ' · intern') +
      (t.assigneeName ? ` · Bearbeiter: ${t.assigneeName}` : '') + '\n' +
      (t.description ? `\n${String(t.description).slice(0, 600)}\n` : '') +
      (lastComments.length ? `\nLetzte Kommentare:\n${lastComments.join('\n')}` : '\nKeine Kommentare.')
    );
  }
);

server.tool(
  'kunden_liste',
  'Kunden suchen/auflisten (Name, Kundennummer, E-Mail).',
  { search: z.string().max(200).optional() },
  async ({ search }) => {
    const res = await api('/customers');
    let customers: any[] = res.data ?? res.customers ?? [];
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(c =>
        c.name?.toLowerCase().includes(q) || c.customerNumber?.toLowerCase().includes(q)
      );
    }
    if (customers.length === 0) return text('Keine Kunden gefunden.');
    const lines = customers.slice(0, 40).map(c =>
      `- ${c.name}${c.customerNumber ? ` (${c.customerNumber})` : ''}${c.email ? ` · ${c.email}` : ''}`
    );
    const more = customers.length > 40 ? `\n… und ${customers.length - 40} weitere` : '';
    return text(`${customers.length} Kunde(n):\n${lines.join('\n')}${more}`);
  }
);

server.tool(
  'lizenz_ablauf',
  'Ablaufende Lizenzen/Abos (jüngste Laufzeit pro Kunde+Produkt). days: Fenster in Tagen (Default 60).',
  { days: z.number().int().min(1).max(365).optional() },
  async ({ days }) => {
    const res = await api(`/sevdesk/license-expiry?days=${days ?? 60}`);
    const items: any[] = res.data ?? [];
    if (items.length === 0) return text('Keine ablaufenden Lizenzen im Zeitfenster.');
    const lines = items.map(l => {
      const end = new Date(l.endDate).toLocaleDateString('de-DE');
      const status = l.daysLeft < 0 ? `ABGELAUFEN am ${end}` : `läuft ab am ${end} (${l.daysLeft} Tage)`;
      return `- ${l.customerName}: ${l.description}${l.serialNumber ? ` (SN ${l.serialNumber})` : ''} — ${status}`;
    });
    return text(`${items.length} ablaufende Lizenz(en)/Abo(s):\n${lines.join('\n')}`);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`RamboFlow MCP-Server verbunden (${API_URL})`);
