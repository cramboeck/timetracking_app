import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart, Search, Loader2, Package, FileQuestion,
  CheckCircle2, XCircle, ExternalLink, AlertTriangle, Building2
} from 'lucide-react';
import { infinigateApi, PricelistItem, InfinigateQuote } from '../services/api';
import { Button } from './ui/Button';
import { useConfirm, useToast } from '../contexts/UIContext';

/**
 * Bestellungen — Distributor-Modul (Phase 2b).
 * Fasst die Beschaffung über Distributoren zusammen: Infinigate ist per API
 * angebunden (EK-Preissuche + Angebote annehmen/ablehnen), ADN hat eine
 * Cloud-Marketplace-API (Anbindung vorgemerkt), Elovade bietet aktuell nur
 * das Partnerportal ohne API.
 */

const fmtEur = (amount: number | null, currency = 'EUR'): string =>
  amount === null
    ? '—'
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);

const fmtDate = (value: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-DE');
};

const QUOTE_STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400',
};

export const OrdersHub = () => {
  const showToast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const configQuery = useQuery({
    queryKey: ['infinigate', 'config'],
    queryFn: async () => (await infinigateApi.getConfig()).data,
    staleTime: 5 * 60 * 1000,
  });
  const infinigateConfigured = configQuery.data?.configured === true;

  const pricelistQuery = useQuery({
    queryKey: ['infinigate', 'pricelist', activeSearch],
    queryFn: async () => (await infinigateApi.searchPricelist(activeSearch)).data,
    enabled: infinigateConfigured && activeSearch.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const quotesQuery = useQuery({
    queryKey: ['infinigate', 'quotes'],
    queryFn: async () => (await infinigateApi.getQuotes()).data,
    enabled: infinigateConfigured,
    staleTime: 60 * 1000,
  });

  const acceptMutation = useMutation({
    mutationFn: (quote: InfinigateQuote) =>
      infinigateApi.acceptQuote(quote.documentNumber!, quote.documentRevision ?? 0),
    onSuccess: (_res, quote) => {
      showToast(`Angebot ${quote.documentNumber} angenommen — Bestellung ausgelöst`, 'success');
      queryClient.invalidateQueries({ queryKey: ['infinigate', 'quotes'] });
    },
    onError: (err: any) => showToast(err.message || 'Annehmen fehlgeschlagen', 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (quote: InfinigateQuote) =>
      infinigateApi.rejectQuote(quote.documentNumber!, quote.documentRevision ?? 0),
    onSuccess: (_res, quote) => {
      showToast(`Angebot ${quote.documentNumber} abgelehnt`, 'info');
      queryClient.invalidateQueries({ queryKey: ['infinigate', 'quotes'] });
    },
    onError: (err: any) => showToast(err.message || 'Ablehnen fehlgeschlagen', 'error'),
  });

  const handleAccept = async (quote: InfinigateQuote) => {
    if (!quote.documentNumber) return;
    const ok = await confirm({
      title: 'Angebot verbindlich annehmen?',
      message: `Mit der Annahme von ${quote.documentNumber}${quote.totalNetPrice !== null ? ` (${fmtEur(quote.totalNetPrice, quote.currency)} netto)` : ''} löst du eine verbindliche Bestellung bei Infinigate aus.`,
      variant: 'danger',
      confirmText: 'Verbindlich bestellen',
    });
    if (!ok) return;
    acceptMutation.mutate(quote);
  };

  const handleReject = async (quote: InfinigateQuote) => {
    if (!quote.documentNumber) return;
    const ok = await confirm({
      title: 'Angebot ablehnen?',
      message: `Das Angebot ${quote.documentNumber} wird bei Infinigate als abgelehnt markiert.`,
      variant: 'warning',
      confirmText: 'Ablehnen',
    });
    if (!ok) return;
    rejectMutation.mutate(quote);
  };

  const items = pricelistQuery.data?.items ?? [];
  const quotes = quotesQuery.data ?? [];
  const busyQuote = acceptMutation.isPending || rejectMutation.isPending;

  const renderPriceRow = (item: PricelistItem, idx: number) => (
    <tr key={`${item.sku}-${idx}`} className="border-t border-gray-100 dark:border-dark-border">
      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-dark-500 whitespace-nowrap">{item.sku ?? '—'}</td>
      <td className="px-4 py-2.5 text-gray-900 dark:text-white">
        {item.description ?? '—'}
        {item.endUserType && <span className="ml-2 text-xs text-gray-400">{item.endUserType}</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-500 dark:text-dark-400 whitespace-nowrap">{item.manufacturer ?? '—'}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap tabular-nums">{fmtEur(item.price, item.currency)}</td>
      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-dark-400 whitespace-nowrap tabular-nums">{item.stock ?? '—'}</td>
    </tr>
  );

  const renderPriceCard = (item: PricelistItem, idx: number) => (
    <div key={`${item.sku}-m-${idx}`} className="p-3 border-t border-gray-100 dark:border-dark-border">
      <p className="font-medium text-gray-900 dark:text-white">{item.description ?? '—'}</p>
      <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
        {item.sku ?? '—'}{item.manufacturer ? ` · ${item.manufacturer}` : ''}
      </p>
      <p className="text-sm mt-1 font-semibold text-gray-900 dark:text-white">
        {fmtEur(item.price, item.currency)}
        {item.stock !== null && <span className="ml-2 font-normal text-xs text-gray-500 dark:text-dark-400">Bestand: {item.stock}</span>}
      </p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShoppingCart className="text-accent-primary" />
          Bestellungen
        </h1>
        <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
          Beschaffung über Distributoren: Preise suchen, Angebote verwalten
        </p>
      </div>

      {/* Distributor-Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={16} /> Infinigate</span>
            {infinigateConfigured ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">API verbunden</span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">nicht konfiguriert</span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1.5">
            Preisliste, Angebote, Rechnungs-Sync{!infinigateConfigured && ' — Zugangsdaten unter Einstellungen → Infinigate'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={16} /> ADN</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">API verfügbar</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1.5">
            Cloud-Marketplace-API — Anbindung vorgemerkt (Zugang via{' '}
            <a href="https://wissen.adn.de/adn-cloud-marketplace" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline">wissen.adn.de<ExternalLink size={10} className="inline ml-0.5" /></a>)
          </p>
        </div>
        <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={16} /> Elovade</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400">keine API</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1.5">
            Bestellung nur über das{' '}
            <a href="https://partnerportal.ebertlang.com/" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline">Partnerportal<ExternalLink size={10} className="inline ml-0.5" /></a>
          </p>
        </div>
      </div>

      {!infinigateConfigured && !configQuery.isLoading && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Infinigate ist nicht konfiguriert — Preissuche und Angebote brauchen die API-Zugangsdaten (Einstellungen → Infinigate).</span>
        </div>
      )}

      {/* EK-Preissuche (Infinigate) */}
      <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={18} className="text-accent-primary" />
            Preissuche (Infinigate)
          </h3>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setActiveSearch(searchInput.trim()); }}
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Produkt, SKU oder Hersteller — z.B. 365 Total Protection"
              disabled={!infinigateConfigured}
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
            />
            <Button
              type="submit"
              disabled={!infinigateConfigured || searchInput.trim().length < 2}
              icon={pricelistQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            >
              Suchen
            </Button>
          </form>
        </div>

        {pricelistQuery.isError && (
          <p className="p-4 text-sm text-red-600 dark:text-red-400">{(pricelistQuery.error as any)?.message || 'Suche fehlgeschlagen'}</p>
        )}
        {activeSearch && pricelistQuery.isSuccess && items.length === 0 && (
          <p className="p-4 text-sm text-gray-500 dark:text-dark-400">Keine Treffer für „{activeSearch}".</p>
        )}
        {items.length > 0 && (
          <>
            {/* Desktop-Tabelle */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-dark-400 uppercase">
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Bezeichnung</th>
                    <th className="px-4 py-2 font-medium">Hersteller</th>
                    <th className="px-4 py-2 font-medium text-right">EK netto</th>
                    <th className="px-4 py-2 font-medium text-right">Bestand</th>
                  </tr>
                </thead>
                <tbody>{items.map(renderPriceRow)}</tbody>
              </table>
            </div>
            {/* Mobile-Karten */}
            <div className="md:hidden">{items.map(renderPriceCard)}</div>
            {pricelistQuery.data?.count !== null && pricelistQuery.data!.count! > items.length && (
              <p className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100 dark:border-dark-border">
                {items.length} von {pricelistQuery.data!.count} Treffern — Suchbegriff verfeinern für mehr Präzision
              </p>
            )}
          </>
        )}
      </div>

      {/* Angebote (Infinigate) */}
      <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-dark-border">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileQuestion size={18} className="text-accent-primary" />
            Angebote (Infinigate)
          </h3>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
            Vom Distributor erstellte Angebote — Annehmen löst eine <strong>verbindliche Bestellung</strong> aus
          </p>
        </div>
        {quotesQuery.isLoading && infinigateConfigured && (
          <p className="p-4 text-sm text-gray-500 dark:text-dark-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Lade Angebote…</p>
        )}
        {quotesQuery.isError && (
          <p className="p-4 text-sm text-red-600 dark:text-red-400">{(quotesQuery.error as any)?.message || 'Angebote konnten nicht geladen werden'}</p>
        )}
        {quotesQuery.isSuccess && quotes.length === 0 && (
          <p className="p-4 text-sm text-gray-500 dark:text-dark-400">Aktuell keine Angebote vorhanden.</p>
        )}
        {quotes.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {quotes.map((quote, idx) => {
              const statusKey = (quote.status || '').toLowerCase();
              const isOpen = !['accepted', 'rejected', 'expired', 'ordered', 'closed'].includes(statusKey);
              return (
                <div key={`${quote.documentNumber}-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                      {quote.documentNumber ?? '—'}
                      {quote.status && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QUOTE_STATUS_STYLES[statusKey] || 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400'}`}>
                          {quote.status}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                      {quote.buyerReference && <>{quote.buyerReference} · </>}
                      {quote.manufacturer && <>{quote.manufacturer} · </>}
                      Erstellt {fmtDate(quote.createdAt)}
                      {quote.validUntil && <> · gültig bis {fmtDate(quote.validUntil)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-gray-900 dark:text-white whitespace-nowrap tabular-nums mr-1">
                      {fmtEur(quote.totalNetPrice, quote.currency)}
                    </span>
                    {isOpen && quote.documentNumber && (
                      <>
                        <Button size="sm" disabled={busyQuote} icon={<CheckCircle2 size={14} />} onClick={() => handleAccept(quote)}>
                          Annehmen
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busyQuote} icon={<XCircle size={14} />} onClick={() => handleReject(quote)}>
                          Ablehnen
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersHub;
