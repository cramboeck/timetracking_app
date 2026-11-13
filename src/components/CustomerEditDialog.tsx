import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building, User as UserIcon, Globe } from 'lucide-react';
import { Customer, Project } from '../types';
import { contractsApi, sevdeskApi, ninjaApi } from '../services/api';
import { Modal } from './Modal';
import { Button } from './ui/Button';

/**
 * Kunden-Dialog (CRM-4, Flow-Review 11/2026) — aus Settings.tsx extrahiert,
 * damit Kunden auch direkt im CustomerHub bearbeitet werden können.
 * Statt acht gleichrangiger Themenblöcke: drei Tabs mit Hierarchie
 * (Stammdaten täglich, Abrechnung & Export gelegentlich, Erweitert einmalig).
 * Der Freitext-„Ansprechpartner" ist raus — Kontakte leben in customer_contacts.
 */

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
];

const inputClasses = 'w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-200 border border-gray-200 dark:border-dark-border text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-dark-400 transition-all duration-150 hover:border-gray-300 dark:hover:border-dark-400/40 focus:outline-none focus:bg-white dark:focus:bg-dark-100 focus:border-accent-primary focus:ring-4 focus:ring-accent-primary/15 text-sm';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1';
const helpClasses = 'text-xs text-gray-500 dark:text-dark-400 mt-1';

type DialogTab = 'master' | 'billing' | 'advanced';

export interface CustomerEditDialogProps {
  isOpen: boolean;
  /** null = neuen Kunden anlegen */
  customer: Customer | null;
  projects: Project[];
  onClose: () => void;
  /** Liefert nur die Dialog-Felder; Anlage-Metadaten (id/userId/createdAt) ergänzt der Aufrufer */
  onSave: (data: Partial<Customer> & { name: string; color: string }) => void;
  pendingDomain?: string | null;
}

export const CustomerEditDialog = ({
  isOpen, customer, projects, onClose, onSave, pendingDomain,
}: CustomerEditDialogProps) => {
  const [tab, setTab] = useState<DialogTab>('master');

  // Stammdaten
  const [name, setName] = useState('');
  const [customerType, setCustomerType] = useState<'company' | 'individual'>('company');
  const [customerNumber, setCustomerNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  // Abrechnung & Export
  const [hourlyRate, setHourlyRate] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('14');
  const [timeRoundingInterval, setTimeRoundingInterval] = useState('15');
  const [reportTitle, setReportTitle] = useState('');
  const [defaultProjectId, setDefaultProjectId] = useState('');
  const [defaultContractId, setDefaultContractId] = useState('');
  const [sevdeskPositionTemplate, setSevdeskPositionTemplate] = useState('');

  // Erweitert
  const [ninjarmmOrgId, setNinjarmmOrgId] = useState('');
  const [importAliases, setImportAliases] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Abrechnungs-Paket aktiv? (Lizenz-Gate, keine Berechtigung)
  const billingQuery = useQuery({
    queryKey: ['sevdesk', 'feature-status'],
    queryFn: () => sevdeskApi.getFeatureStatus(),
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen,
  });
  const billingEnabled = billingQuery.data?.data?.billingEnabled === true;

  // Gesyncte NinjaRMM-Organisationen → Dropdown mit Namen statt roher ID
  // (403/Fehler ohne Support-Paket → Freitext-Fallback)
  const ninjaOrgsQuery = useQuery({
    queryKey: ['ninja', 'organizations'],
    queryFn: () => ninjaApi.getOrganizations(),
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: isOpen,
  });
  const ninjaOrgs = ninjaOrgsQuery.data?.data ?? [];

  // Verträge des Kunden fürs Standard-Vertrag-Dropdown
  const contractsQuery = useQuery({
    queryKey: ['crm', 'customer-contracts', customer?.id],
    queryFn: () => contractsApi.getContracts({ customerId: customer!.id }),
    enabled: isOpen && !!customer,
    staleTime: 60 * 1000,
  });
  const customerContracts = (contractsQuery.data?.data ?? []) as Array<{
    id: string; contractNumber: string; name: string;
  }>;

  // Felder beim Öffnen aus dem Kunden befüllen
  useEffect(() => {
    if (!isOpen) return;
    setTab('master');
    setName(customer?.name ?? '');
    setCustomerType(customer?.customerType ?? 'company');
    setCustomerNumber(customer?.customerNumber ?? '');
    // String-Cast: transformRow castet rein numerische Werte (PLZ,
    // Telefonnummern ohne +) zu Number — .trim() würde sonst crashen
    const asStr = (v: unknown) => (v == null ? '' : String(v));
    setEmail(asStr(customer?.email));
    setPhone(asStr(customer?.phone));
    setWebsite(asStr(customer?.website));
    setAddressStreet(asStr(customer?.addressStreet));
    setAddressZip(asStr(customer?.addressZip));
    setAddressCity(asStr(customer?.addressCity));
    setColor(customer?.color ?? COLORS[0]);
    setHourlyRate(customer?.hourlyRate?.toString() ?? '');
    setPaymentTermsDays(customer?.paymentTermsDays?.toString() ?? '14');
    setTimeRoundingInterval(customer?.timeRoundingInterval?.toString() ?? '15');
    setReportTitle(customer?.reportTitle ?? '');
    setDefaultProjectId(customer?.defaultProjectId ?? '');
    setDefaultContractId(customer?.defaultContractId ?? '');
    setSevdeskPositionTemplate(customer?.sevdeskPositionTemplate ?? '');
    setNinjarmmOrgId(customer?.ninjarmmOrganizationId ?? '');
    setImportAliases(customer?.importAliases?.join(', ') ?? '');
    setDisplayName(customer?.displayName ?? '');
  }, [isOpen, customer]);

  const hasStructuredAddress = !!(addressStreet.trim() || addressZip.trim() || addressCity.trim());
  const legacyAddress = customer?.address?.trim();

  const handleSave = () => {
    if (!name.trim()) return;
    const aliases = importAliases.trim()
      ? importAliases.split(',').map(a => a.trim()).filter(a => a.length > 0)
      : undefined;

    onSave({
      name: name.trim(),
      color,
      customerType,
      customerNumber: customerNumber.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      addressStreet: addressStreet.trim() || undefined,
      addressZip: addressZip.trim() || undefined,
      addressCity: addressCity.trim() || undefined,
      reportTitle: reportTitle.trim() || undefined,
      hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate) : undefined,
      paymentTermsDays: paymentTermsDays.trim() ? parseInt(paymentTermsDays) : 14,
      timeRoundingInterval: timeRoundingInterval.trim() ? parseInt(timeRoundingInterval) : 15,
      ninjarmmOrganizationId: ninjarmmOrgId.trim() || undefined,
      displayName: displayName.trim() || undefined,
      importAliases: aliases,
      defaultProjectId: defaultProjectId || undefined,
      ...(customer ? {
        defaultContractId: defaultContractId || undefined,
        sevdeskPositionTemplate: sevdeskPositionTemplate.trim() || undefined,
      } : {}),
    });
    onClose();
  };

  const tabs: Array<{ id: DialogTab; label: string }> = [
    { id: 'master', label: 'Stammdaten' },
    { id: 'billing', label: 'Abrechnung & Export' },
    { id: 'advanced', label: 'Erweitert' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {pendingDomain && !customer && (
          <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-4">
            <div className="flex gap-3">
              <Globe className="w-5 h-5 text-accent-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-accent-dark dark:text-accent-primary">
                  Domain @{pendingDomain} zuordnen
                </p>
                <p className="text-sm text-accent-primary mt-1">
                  Nach dem Anlegen des Kunden kannst du die Domain über das <Globe className="w-3.5 h-3.5 inline" />-Symbol in der Kundenliste zuordnen.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab-Leiste */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-dark-200 rounded-xl overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white dark:bg-dark-100 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ============ Tab: Stammdaten ============ */}
        {tab === 'master' && (
          <div className="space-y-4">
            <div>
              <label className={labelClasses}>Kundenname *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Musterfirma GmbH"
                className={inputClasses}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>Kundentyp</label>
                <div className="flex gap-2">
                  {([['company', 'Firma', Building], ['individual', 'Privatperson', UserIcon]] as const).map(([value, label, Icon]) => (
                    <label key={value} className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-3 py-2.5 rounded-lg border transition-colors ${
                      customerType === value
                        ? 'border-accent-primary bg-accent-light dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary'
                        : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-dark-500'
                    }`}>
                      <input
                        type="radio"
                        name="customerType"
                        checked={customerType === value}
                        onChange={() => setCustomerType(value)}
                        className="sr-only"
                      />
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClasses}>Kundennummer</label>
                <input
                  type="text"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="z.B. K-12345"
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kontakt@musterfirma.de"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Telefon</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+49 8531 123456"
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className={labelClasses}>Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.musterfirma.de"
                className={inputClasses}
              />
            </div>

            <div>
              <label className={labelClasses}>Straße & Hausnummer</label>
              <input
                type="text"
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="Musterstraße 123"
                className={inputClasses}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
              <div>
                <label className={labelClasses}>PLZ</label>
                <input
                  type="text"
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                  placeholder="94127"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Ort</label>
                <input
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  placeholder="Neuburg am Inn"
                  className={inputClasses}
                />
              </div>
            </div>
            {legacyAddress && !hasStructuredAddress && (
              <p className={helpClasses}>
                Bisherige Freitext-Adresse: „{legacyAddress}" — bitte in die Felder oben übernehmen,
                dann stimmt auch die GPS-Kundenzuordnung zuverlässiger.
              </p>
            )}

            <div>
              <label className={labelClasses}>Farbe</label>
              <div className="grid grid-cols-5 gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-full h-8 rounded-lg transition-all ${
                      color === c ? 'ring-2 ring-gray-900 dark:ring-white ring-offset-2 scale-105' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <p className={helpClasses}>
              Ansprechpartner pflegst du im CustomerHub unter „Kontakte" — dort landen sie auch im Kundenportal.
            </p>
          </div>
        )}

        {/* ============ Tab: Abrechnung & Export ============ */}
        {tab === 'billing' && (
          <div className="space-y-4">
            {billingEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClasses}>Stundensatz (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="95.00"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Zahlungsziel (Tage)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={paymentTermsDays}
                      onChange={(e) => setPaymentTermsDays(e.target.value)}
                      placeholder="14"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClasses}>Zeitaufrundung</label>
                  <select
                    value={timeRoundingInterval}
                    onChange={(e) => setTimeRoundingInterval(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="1">1 Min. (keine Rundung)</option>
                    <option value="5">5 Minuten</option>
                    <option value="6">6 Min. (0,1h)</option>
                    <option value="10">10 Minuten</option>
                    <option value="15">15 Min. (0,25h)</option>
                    <option value="30">30 Min. (0,5h)</option>
                    <option value="60">60 Min. (1h)</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className={labelClasses}>Report-Titel (PDF)</label>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="z.B. Stundenzettel, Tätigkeitsnachweis"
                className={inputClasses}
              />
              <p className={helpClasses}>Standard: „Stundenbericht"</p>
            </div>

            {customer && (
              <div>
                <label className={labelClasses}>Standard-Projekt</label>
                <select
                  value={defaultProjectId}
                  onChange={(e) => setDefaultProjectId(e.target.value)}
                  className={inputClasses}
                >
                  <option value="">— Kein Standard-Projekt —</option>
                  {projects
                    .filter(p => p.customerId === customer.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                  }
                </select>
                <p className={helpClasses}>Fallback-Projekt für Import ohne Projektzuordnung</p>
              </div>
            )}

            {customer && billingEnabled && (
              <>
                <div>
                  <label className={labelClasses}>Standard-Vertrag (Rechnungs-Zusatztext)</label>
                  <select
                    value={defaultContractId}
                    onChange={(e) => setDefaultContractId(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">— Kein Vertrag —</option>
                    {customerContracts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.contractNumber} · {c.name}
                      </option>
                    ))}
                  </select>
                  <p className={helpClasses}>
                    Quelle für die Platzhalter <code>{'{contractNumber}'}</code> und <code>{'{contractTitle}'}</code>.
                  </p>
                </div>

                <div>
                  <label className={labelClasses}>Zusatztext pro Rechnungsposition (sevdesk)</label>
                  <textarea
                    value={sevdeskPositionTemplate}
                    onChange={(e) => setSevdeskPositionTemplate(e.target.value)}
                    rows={5}
                    placeholder={'Abrechnung erfolgt nach tatsächlichem Aufwand gemäß Vertrag\nNr. {contractNumber}\n\nsiehe {reportFilename}'}
                    className={`${inputClasses} font-mono`}
                  />
                  <div className={`${helpClasses} space-y-1`}>
                    <p>Wird unter jeder Position auf der Rechnung in sevdesk ergänzt.</p>
                    <p>
                      Platzhalter:{' '}
                      <code>{'{contractNumber}'}</code>, <code>{'{contractTitle}'}</code>,{' '}
                      <code>{'{customerName}'}</code>, <code>{'{projectName}'}</code>,{' '}
                      <code>{'{periodLabel}'}</code>, <code>{'{periodMonth}'}</code>,{' '}
                      <code>{'{periodYear}'}</code>, <code>{'{reportFilename}'}</code>
                    </p>
                    <p>Unbekannte Platzhalter bleiben als Text erhalten — Tippfehler werden sofort sichtbar.</p>
                  </div>
                </div>
              </>
            )}

            {!billingEnabled && !customer && (
              <p className={helpClasses}>
                Weitere Abrechnungs-Optionen erscheinen hier, sobald das Business-Paket aktiv ist bzw. der Kunde angelegt wurde.
              </p>
            )}
          </div>
        )}

        {/* ============ Tab: Erweitert ============ */}
        {tab === 'advanced' && (
          <div className="space-y-4">
            <div>
              <label className={labelClasses}>NinjaRMM-Organisation</label>
              {ninjaOrgs.length > 0 ? (
                <select
                  value={ninjarmmOrgId}
                  onChange={(e) => setNinjarmmOrgId(e.target.value)}
                  className={inputClasses}
                >
                  <option value="">— Nicht verknüpft —</option>
                  {ninjaOrgs.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}{org.deviceCount ? ` (${org.deviceCount} Geräte)` : ''}
                    </option>
                  ))}
                  {/* Gespeicherte ID, die (noch) nicht in der Sync-Liste steht */}
                  {ninjarmmOrgId && !ninjaOrgs.some(o => o.id === ninjarmmOrgId) && (
                    <option value={ninjarmmOrgId}>{ninjarmmOrgId} (nicht mehr im Sync)</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={ninjarmmOrgId}
                  onChange={(e) => setNinjarmmOrgId(e.target.value)}
                  placeholder="NinjaRMM nicht verbunden — ID manuell eintragen"
                  className={inputClasses}
                />
              )}
              <p className={helpClasses}>
                Verknüpft Geräte, Alerts und Tickets dieser NinjaRMM-Organisation mit dem Kunden.
              </p>
            </div>

            <div>
              <label className={labelClasses}>Import-Aliase</label>
              <input
                type="text"
                value={importAliases}
                onChange={(e) => setImportAliases(e.target.value)}
                placeholder="z.B. IHE, IHE GmbH, IHE Planung"
                className={inputClasses}
              />
              <p className={helpClasses}>Komma-getrennte Namen für CSV-Import und Beleg-Matching</p>
            </div>

            <div>
              <label className={labelClasses}>Anzeigename (für PDF)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z.B. IHE (statt langer Firmenname)"
                className={inputClasses}
              />
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()} fullWidth>
            Speichern
          </Button>
        </div>
      </div>
    </Modal>
  );
};
