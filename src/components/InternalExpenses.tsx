import { useQuery } from '@tanstack/react-query';
import { Loader2, ShoppingCart } from 'lucide-react';
import { sevdeskApi } from '../services/api';

/**
 * Berichte → Intern: Auswertung der als „Interne Ausgabe" markierten
 * Rechnungspositionen (Eigenbedarf: eigene Lizenzen, Hardware, Büromaterial).
 * Datenquelle: invoice_line_items mit rebilling_status = 'internal'.
 */

const TYPE_LABELS: Record<string, string> = {
  license: 'Lizenz',
  subscription: 'Abo',
  hardware: 'Hardware',
  service: 'Dienstleistung',
  other: 'Sonstiges',
};

const fmtEUR = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const InternalExpenses = () => {
  const query = useQuery({
    queryKey: ['lineItems', 'internal'],
    queryFn: async () => (await sevdeskApi.getInternalExpenses(12)).data,
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-accent-primary" size={22} />
      </div>
    );
  }

  const monthly = query.data?.monthly ?? [];
  const items = query.data?.items ?? [];
  const maxMonth = Math.max(1, ...monthly.map(m => m.totalAmount));
  const total = monthly.reduce((sum, m) => sum + m.totalAmount, 0);

  return (
    <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm mt-6">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingCart size={18} className="text-accent-primary" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Interne Ausgaben</h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">
        Als „Interne Ausgabe" markierte Belegpositionen der letzten 12 Monate
        {total > 0 && <> — gesamt <span className="font-semibold">{fmtEUR(total)}</span></>}
      </p>

      {monthly.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-dark-400 py-4 text-center bg-gray-50 dark:bg-dark-50 rounded-xl">
          Noch keine Positionen als „Interne Ausgabe" markiert. Markieren kannst du sie im
          Rechnungseingang über den Status der Belegpositionen.
        </p>
      ) : (
        <>
          {/* Monats-Balken */}
          <div className="space-y-1.5 mb-6">
            {monthly.slice(0, 12).map(m => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="w-16 text-xs text-gray-500 dark:text-dark-400 shrink-0">
                  {new Date(m.month).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}
                </span>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-dark-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-accent-primary/70 rounded"
                    style={{ width: `${Math.max(2, (m.totalAmount / maxMonth) * 100)}%` }}
                  />
                </div>
                <span className="w-24 text-right text-xs tabular-nums text-gray-700 dark:text-dark-500 shrink-0">
                  {fmtEUR(m.totalAmount)}
                </span>
              </div>
            ))}
          </div>

          {/* Positionen */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-dark-border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-50 text-left text-xs text-gray-500 dark:text-dark-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Position</th>
                  <th className="px-3 py-2 font-medium">Typ</th>
                  <th className="px-3 py-2 font-medium">Lieferant</th>
                  <th className="px-3 py-2 font-medium text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {items.slice(0, 50).map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-dark-400">
                      {item.receivedAt ? new Date(item.receivedAt).toLocaleDateString('de-DE') : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{item.description}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-dark-400">
                      {item.itemType ? TYPE_LABELS[item.itemType] || item.itemType : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-dark-400">{item.vendor || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                      {fmtEUR(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
