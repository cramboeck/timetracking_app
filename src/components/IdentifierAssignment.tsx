import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, ChevronDown, ChevronUp, Globe, Coffee, Check, Loader2 } from 'lucide-react';
import { sevdeskApi, customersApi, LineItemIdentifier } from '../services/api';
import { Button } from './ui/Button';
import { useToast } from '../contexts/UIContext';

/**
 * Sammel-Zuordnung offener Endkunden-Identifier aus Distributor-Belegen
 * (z.B. Infinigate: Domains wie "firma.de" oder Kürzel wie "IHE").
 * Eine Zeile pro Identifier — Kunde wählen und zuordnen legt automatisch
 * einen Alias an (und bei Domains die primary_domain), damit künftige
 * Syncs von selbst matchen. "Intern" markiert Eigenbedarf.
 */
export const IdentifierAssignment = ({ onAssigned }: { onAssigned?: () => void }) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const identifiersQuery = useQuery({
    queryKey: ['lineItemIdentifiers'],
    queryFn: async () => (await sevdeskApi.getLineItemIdentifiers()).data,
    staleTime: 60 * 1000,
  });

  const customersQuery = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => (await customersApi.getAll()).data,
    staleTime: 5 * 60 * 1000,
  });

  const sortedCustomers = useMemo(
    () => [...(customersQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [customersQuery.data]
  );

  const assignMutation = useMutation({
    mutationFn: (input: { identifier: string; customerId?: string; markInternal?: boolean }) =>
      sevdeskApi.assignIdentifier(input),
    onSuccess: (res, vars) => {
      const d = res.data;
      showToast(
        d.internal
          ? `${d.updated} Positionen als intern markiert`
          : `${d.updated} Positionen → ${d.customerName}` +
            (d.aliasSaved ? ' · Alias gespeichert' : '') +
            (d.domainSet ? ' · Domain am Kunden hinterlegt' : ''),
        'success'
      );
      setSelections(prev => {
        const next = { ...prev };
        delete next[vars.identifier];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['lineItemIdentifiers'] });
      queryClient.invalidateQueries({ queryKey: ['licenseExpiry'] });
      onAssigned?.();
    },
    onError: (err: any) => showToast(err.message || 'Zuordnung fehlgeschlagen', 'error'),
  });

  const identifiers = identifiersQuery.data ?? [];
  if (identifiersQuery.isLoading || identifiers.length === 0) return null;

  const pendingIdentifier = assignMutation.isPending ? assignMutation.variables?.identifier : null;

  const renderRow = (item: LineItemIdentifier) => {
    const isDomain = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(item.identifier);
    const busy = pendingIdentifier === item.identifier;
    const selected = selections[item.identifier] || '';
    return (
      <div
        key={item.identifier}
        className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
            <span className="truncate">{item.identifier}</span>
            {isDomain && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Globe size={11} />
                Domain
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-dark-400 truncate">
            {item.itemCount} Positionen in {item.invoiceCount} Belegen
            {item.sampleDescription ? ` · z.B. ${item.sampleDescription}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          <select
            value={selected}
            onChange={e => setSelections(prev => ({ ...prev, [item.identifier]: e.target.value }))}
            disabled={busy}
            className="flex-1 min-w-0 basis-full sm:basis-auto sm:flex-none sm:w-56 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
          >
            <option value="">Kunde wählen…</option>
            {sortedCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!selected || busy}
            icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            onClick={() => assignMutation.mutate({ identifier: item.identifier, customerId: selected })}
          >
            Zuordnen
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            icon={<Coffee size={14} />}
            title="Eigenbedarf — Positionen als intern markieren (keine Weiterberechnung)"
            onClick={() => assignMutation.mutate({ identifier: item.identifier, markInternal: true })}
          >
            Intern
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-dark-50 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-dark-100/50 transition-colors"
      >
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-accent-primary" />
            Endkunden-Zuordnung ({identifiers.length})
          </h3>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
            Offene Identifier aus Distributor-Belegen — einmal zuordnen, künftige Importe matchen automatisch (Alias + Domain)
          </p>
        </div>
        {collapsed ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-100 dark:divide-dark-border border-t border-gray-100 dark:border-dark-border">
          {identifiers.map(renderRow)}
        </div>
      )}
    </div>
  );
};
