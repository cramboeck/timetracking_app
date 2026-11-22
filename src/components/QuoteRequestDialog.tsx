import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { SearchableSelect } from './SearchableSelect';
import { useToast } from '../contexts/UIContext';
import { customersApi, infinigateApi, PricelistItem } from '../services/api';

/**
 * Unverbindliche Angebotsanfrage bei Infinigate direkt aus der Preissuche
 * (FIN-3). Vorher endete der Bestell-Flow nach dem Preisfund — angefragt
 * wurde per Telefon/Mail. Das erzeugte Angebot erscheint danach unten in
 * „Angebote" und wird dort angenommen (= verbindliche Bestellung).
 */

const fieldClasses = 'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 text-sm';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1';

const fmtEur = (amount: number | null, currency = 'EUR'): string =>
  amount === null ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);

interface QuoteRequestDialogProps {
  item: PricelistItem | null;
  onClose: () => void;
}

export const QuoteRequestDialog = ({ item, onClose }: QuoteRequestDialogProps) => {
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('1');
  const [customerId, setCustomerId] = useState('');
  const [yourReference, setYourReference] = useState('');
  const [comment, setComment] = useState('');

  // Beim Öffnen für ein neues Produkt zurücksetzen
  useEffect(() => {
    if (!item) return;
    setQuantity('1');
    setCustomerId('');
    setYourReference('');
    setComment('');
  }, [item]);

  const customersQuery = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => (await customersApi.getAll()).data,
    enabled: !!item,
    staleTime: 5 * 60 * 1000,
  });
  const customerOptions = useMemo(
    () => (customersQuery.data ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(c => ({ value: c.id, label: c.name, sublabel: c.customerNumber ? `#${c.customerNumber}` : undefined })),
    [customersQuery.data]
  );

  const qty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= 100000;
  const estimatedTotal = item && item.price !== null && !item.priceOnRequest && qtyValid ? item.price * qty : null;

  const requestMutation = useMutation({
    mutationFn: () => {
      if (!item?.sku) throw new Error('Produkt ohne Artikelnummer kann nicht angefragt werden');
      const customerName = customerOptions.find(o => o.value === customerId)?.label;
      return infinigateApi.requestQuote({
        lines: [{
          itemNumber: item.sku,
          quantity: qty,
          itemDescription: item.description ?? undefined,
          manufacturerItemNumber: item.vendorSku ?? undefined,
        }],
        customerId: customerId || undefined,
        // Ohne eigene Referenz den Endkunden mitgeben — so ist das Angebot
        // später in der Liste zuordenbar
        yourReference: yourReference.trim() || customerName || undefined,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: () => {
      showToast('Anfrage gesendet — das Angebot erscheint unter „Angebote", sobald Infinigate es erstellt hat', 'success', 6000);
      queryClient.invalidateQueries({ queryKey: ['infinigate', 'quotes'] });
      onClose();
    },
    onError: (err: Error) => showToast(err.message || 'Anfrage fehlgeschlagen', 'error'),
  });

  if (!item) return null;

  return (
    <Modal isOpen={!!item} onClose={onClose} title="Angebot anfragen" maxWidth="lg">
      <div className="space-y-4">
        {/* Produkt */}
        <div className="rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border p-3.5">
          <p className="font-medium text-gray-900 dark:text-white">{item.description ?? '—'}</p>
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
            {item.sku ?? '—'}{item.manufacturer ? ` · ${item.manufacturer}` : ''}
          </p>
          <p className="text-sm mt-1.5 text-gray-700 dark:text-dark-500">
            EK netto: <span className="font-semibold text-gray-900 dark:text-white">
              {item.priceOnRequest ? 'auf Anfrage' : fmtEur(item.price, item.currency)}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClasses}>Menge *</label>
            <input
              type="number"
              min={1}
              max={100000}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={fieldClasses}
              autoFocus
            />
            {estimatedTotal !== null && (
              <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                ≈ {fmtEur(estimatedTotal, item.currency)} netto laut Preisliste
              </p>
            )}
          </div>
          <div>
            <label className={labelClasses}>Ihre Referenz</label>
            <input
              type="text"
              value={yourReference}
              onChange={(e) => setYourReference(e.target.value)}
              placeholder="z.B. Ticket-Nr. oder Projekt"
              maxLength={100}
              className={fieldClasses}
            />
          </div>
        </div>

        <div>
          <label className={labelClasses}>Endkunde (optional)</label>
          <SearchableSelect
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Kunde aus dem CRM wählen…"
            emptyMessage="Kein Kunde gefunden"
            allowClear
          />
          <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
            Name, Adresse und Kundennummer gehen als Endkunden-Angabe an Infinigate (z.B. für Lizenz-Registrierung).
          </p>
        </div>

        <div>
          <label className={labelClasses}>Kommentar an Infinigate</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="z.B. Laufzeit, Lieferwunsch, Projektpreis-Anfrage…"
            className={`${fieldClasses} resize-none`}
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            Die Anfrage ist <strong>unverbindlich</strong>. Infinigate erstellt daraus ein Angebot — erst dessen
            Annahme unter „Angebote" ist eine Bestellung.
          </span>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-dark-border">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            onClick={() => requestMutation.mutate()}
            disabled={!qtyValid || !item.sku || requestMutation.isPending}
            loading={requestMutation.isPending}
            icon={<Send size={16} />}
            fullWidth
          >
            Anfrage senden
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default QuoteRequestDialog;
