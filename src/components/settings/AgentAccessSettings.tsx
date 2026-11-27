import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound, Copy, Check, Plus, ShieldCheck, History, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConfirm, useToast } from '../../contexts/UIContext';
import {
  apiTokensApi, API_TOKEN_SCOPE_INFO,
  type ApiTokenInfo, type ApiTokenScope,
} from '../../services/api';
import { API_BASE_URL } from '../../services/api/base';

/**
 * Einstellungen → KI-Agent & API-Zugänge (Phase A Agenten-Sicherheit).
 * Ein Zugang hat nie mehr Rechte als sein User — zusätzlich begrenzt auf
 * die gewählten Stufen, die freigegebenen Endpunkte und ein Ablaufdatum.
 */
interface Props {
  orgRole?: 'owner' | 'admin' | 'member' | 'viewer' | string;
}

const field = 'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white text-sm focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15';
const card = 'bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-5';

const EXPIRY_OPTIONS = [30, 90, 180, 365];
const WRITE_SCOPES: ApiTokenScope[] = ['propose', 'time:write', 'tickets:write'];

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE') : '—';
const fmtDateTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  : 'noch nie';

const daysLeft = (iso: string | null) => iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 hover:bg-gray-200 dark:hover:bg-dark-300">
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} {copied ? 'Kopiert' : label}
    </button>
  );
};

const StatusBadge = ({ t }: { t: ApiTokenInfo }) => {
  const d = daysLeft(t.expiresAt);
  if (t.revoked) return <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400">widerrufen</span>;
  if (t.expired) return <span className="text-xs rounded-full px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">abgelaufen</span>;
  if (d !== null && d <= 7) return <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">läuft in {d} {d === 1 ? 'Tag' : 'Tagen'} ab</span>;
  return <span className="text-xs rounded-full px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">aktiv</span>;
};

const RequestLog = ({ tokenId }: { tokenId: string }) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ['api-tokens', 'requests', tokenId],
    queryFn: async () => (await apiTokensApi.requests(tokenId)).data ?? [],
  });
  if (isLoading) return <p className="text-xs text-gray-500 dark:text-dark-400 py-2">Lädt…</p>;
  if (data.length === 0) return <p className="text-xs text-gray-500 dark:text-dark-400 py-2">Noch keine Anfragen.</p>;
  return (
    <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border rounded-lg border border-gray-200 dark:border-dark-border text-xs">
      {data.map((r, i) => (
        <li key={i} className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="w-24 flex-shrink-0 text-gray-500 dark:text-dark-400">{fmtDateTime(r.createdAt)}</span>
          <span className="w-11 flex-shrink-0 font-mono text-gray-700 dark:text-dark-500">{r.method}</span>
          <span className="flex-1 min-w-0 truncate font-mono text-gray-900 dark:text-white" title={r.path}>{r.path}</span>
          <span className={`font-mono ${r.status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{r.status}</span>
        </li>
      ))}
    </ul>
  );
};

const TokenCard = ({ t, showOwner, onRevoke }: { t: ApiTokenInfo; showOwner: boolean; onRevoke: (t: ApiTokenInfo) => void }) => {
  const [showLog, setShowLog] = useState(false);
  const active = !t.revoked && !t.expired;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-white">
            <KeyRound size={15} className="text-gray-400" /> {t.name} <StatusBadge t={t} />
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
            <span className="font-mono">{t.tokenPrefix}…</span>
            {showOwner && t.userName ? ` · ${t.userName}` : ''}
            {` · gültig bis ${fmtDate(t.expiresAt)}`}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {t.scopes.map(s => (
              <span key={s} className={`text-xs rounded-md px-1.5 py-0.5 ${s === 'read' || s === 'propose' ? 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500' : 'bg-accent-primary/10 text-accent-primary'}`}>
                {API_TOKEN_SCOPE_INFO[s]?.label ?? s}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1.5">
            Zuletzt benutzt: {fmtDateTime(t.lastUsedAt)}{t.lastUsedIp ? ` von ${t.lastUsedIp}` : ''} · {t.requestsLast30d} Anfragen in 30 Tagen
          </p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setShowLog(v => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200">
            <History size={14} /> Protokoll
          </button>
          {active && (
            <button type="button" onClick={() => onRevoke(t)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Ban size={14} /> Widerrufen
            </button>
          )}
        </div>
      </div>
      {showLog && <RequestLog tokenId={t.id} />}
    </li>
  );
};

export const AgentAccessSettings = ({ orgRole }: Props) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const isViewer = orgRole === 'viewer';

  const [view, setView] = useState<'mine' | 'org'>('mine');
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiTokenScope[]>(orgRole === 'viewer' ? ['read'] : ['read', 'propose']);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['api-tokens', view],
    queryFn: async () => (await apiTokensApi.list(view)).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => (await apiTokensApi.create({ name: name.trim(), scopes, expiresInDays })).data,
    onSuccess: (d) => {
      setCreated({ token: d.token, name: d.name });
      setName('');
      setScopes(isViewer ? ['read'] : ['read', 'propose']);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: (e: Error) => showToast(e.message || 'Zugang konnte nicht angelegt werden', 'error'),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => apiTokensApi.revoke(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api-tokens'] }); showToast('Zugang widerrufen', 'success'); },
    onError: () => showToast('Zugang konnte nicht widerrufen werden', 'error'),
  });

  const handleRevoke = async (t: ApiTokenInfo) => {
    const ok = await confirm({
      title: 'Zugang widerrufen?',
      message: `„${t.name}“${t.userName && view === 'org' ? ` von ${t.userName}` : ''} funktioniert danach sofort nicht mehr. Claude bzw. der MCP-Server bekommt nur noch „Zugriff verweigert“.`,
      confirmText: 'Widerrufen',
      variant: 'danger',
    });
    if (ok) revoke.mutate(t.id);
  };

  const toggleScope = (s: ApiTokenScope) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const configSnippet = created ? JSON.stringify({
    mcpServers: {
      ramboflow: {
        command: 'node',
        args: ['C:\\github_repos\\timetracking_app\\mcp\\dist\\index.js'],
        env: {
          RAMBOFLOW_API_URL: /^https?:\/\//.test(API_BASE_URL) ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`,
          RAMBOFLOW_API_TOKEN: created.token,
          TZ: 'Europe/Berlin',
        },
      },
    },
  }, null, 2) : '';

  const active = tokens.filter(t => !t.revoked && !t.expired);
  const inactive = tokens.filter(t => t.revoked || t.expired);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-xl bg-accent-primary/10 text-accent-primary flex-shrink-0"><Bot size={26} /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">KI-Agent & API-Zugänge</h2>
            <p className="text-sm text-gray-600 dark:text-dark-400 mt-1">
              Zugänge für Claude (MCP-Server) und andere Integrationen. Ein Zugang hat <strong>nie mehr Rechte als du</strong> –
              zusätzlich nur die gewählten Stufen, nur bis zum Ablaufdatum und nie Löschen, Admin-Funktionen oder neue Zugänge.
            </p>
          </div>
        </div>
      </div>

      {created && (
        <div className={`${card} border-amber-300 dark:border-amber-900/60`}>
          <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <AlertTriangle size={18} className="text-amber-500" /> Zugang „{created.name}“ angelegt – jetzt kopieren
          </p>
          <p className="text-sm text-gray-600 dark:text-dark-400 mt-1">
            Der Schlüssel wird <strong>nur dieses eine Mal</strong> angezeigt. Nicht in Chats, Tickets oder E-Mails einfügen.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-gray-100 dark:bg-dark-200 px-3 py-2 text-xs font-mono text-gray-900 dark:text-white">{created.token}</code>
            <CopyButton value={created.token} label="Schlüssel kopieren" />
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-accent-primary">Fertiger Eintrag für Claude Desktop</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-100 dark:bg-dark-200 p-3 text-xs text-gray-900 dark:text-white">{configSnippet}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyButton value={configSnippet} label="Eintrag kopieren" />
              <span className="text-xs text-gray-500 dark:text-dark-400">Pfad zu <code>mcp\dist\index.js</code> ggf. anpassen.</span>
            </div>
          </details>
          <div className="mt-3 text-right">
            <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>Gespeichert, ausblenden</Button>
          </div>
        </div>
      )}

      <div className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Plus size={17} /> Neuer Zugang</h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Bezeichnung</label>
            <input className={field} value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="z.B. Claude Desktop – Büro-PC" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Gültig für</label>
            <select className={field} value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map(d => <option key={d} value={d}>{d} Tage</option>)}
            </select>
          </div>
        </div>
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Was darf der Agent?</legend>
          {(Object.keys(API_TOKEN_SCOPE_INFO) as ApiTokenScope[]).map(s => {
            const disabled = s === 'read' || (isViewer && WRITE_SCOPES.includes(s));
            return (
              <label key={s} className={`flex items-start gap-2.5 text-sm ${disabled && s !== 'read' ? 'opacity-50' : 'cursor-pointer'}`}>
                <input type="checkbox" className="mt-0.5 rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary"
                  checked={scopes.includes(s)} disabled={disabled} onChange={() => toggleScope(s)} />
                <span>
                  <span className="text-gray-900 dark:text-white">{API_TOKEN_SCOPE_INFO[s].label}</span>
                  <span className="block text-xs text-gray-500 dark:text-dark-400">{API_TOKEN_SCOPE_INFO[s].hint}{s === 'read' ? ' (immer dabei)' : ''}</span>
                </span>
              </label>
            );
          })}
          {isViewer && <p className="text-xs text-gray-500 dark:text-dark-400">Mit der Rolle „Betrachter“ sind nur lesende Zugänge möglich.</p>}
        </fieldset>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} icon={<KeyRound size={16} />}>
            Zugang anlegen
          </Button>
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck size={17} /> Zugänge</h3>
          {isOrgAdmin && (
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-dark-200 p-0.5 text-sm">
              {(['mine', 'org'] as const).map(v => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={`px-3 py-1 rounded-md ${view === v ? 'bg-white dark:bg-dark-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-dark-400'}`}>
                  {v === 'mine' ? 'Meine' : 'Ganze Organisation'}
                </button>
              ))}
            </div>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-3">Lädt…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-3">Noch keine Zugänge.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-dark-border">
              {active.map(t => <TokenCard key={t.id} t={t} showOwner={view === 'org'} onRevoke={handleRevoke} />)}
            </ul>
            {inactive.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-500 dark:text-dark-400">Widerrufene und abgelaufene ({inactive.length})</summary>
                <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                  {inactive.map(t => <TokenCard key={t.id} t={t} showOwner={view === 'org'} onRevoke={handleRevoke} />)}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
};
