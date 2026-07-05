import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Trash2,
  Timer,
  Plus,
  AlertTriangle,
  Settings,
  History,
  Package,
} from 'lucide-react';
import { contractsApi, Contract, ContractPosition, ContractHourlyTracking, customersApi } from '../services/api';
import { Customer } from '../types';
import { Button, IconButton } from './ui';
import { useConfirm } from '../contexts/UIContext';

interface ContractDetailProps {
  contractId: string | null; // null = create new
  onBack: () => void;
  onSaved: () => void;
}

const ContractDetail: React.FC<ContractDetailProps> = ({ contractId, onBack, onSaved }) => {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [positions, setPositions] = useState<ContractPosition[]>([]);
  const [hourlyTracking, setHourlyTracking] = useState<ContractHourlyTracking[]>([]);

  const [activeTab, setActiveTab] = useState<'details' | 'positions' | 'hours' | 'history'>('details');
  const [showAddPosition, setShowAddPosition] = useState(false);

  // Form data
  const [formData, setFormData] = useState<Partial<Contract>>({
    name: '',
    description: '',
    contractType: 'service',
    status: 'draft',
    startDate: new Date().toISOString().split('T')[0],
    endDate: null,
    isIndefinite: false,
    noticePeriodDays: 30,
    autoRenew: false,
    renewalPeriodMonths: 12,
    billingCycle: 'monthly',
    basePrice: null,
    currency: 'EUR',
    includedHoursMonthly: null,
    hourlyRate: null,
    overageRate: null,
    slaResponseHours: null,
    slaResolutionHours: null,
    supportHours: '',
    internalNotes: '',
  });

  // Position form
  const [positionForm, setPositionForm] = useState<Partial<ContractPosition>>({
    name: '',
    description: '',
    quantity: 1,
    unit: 'Stück',
    unitPrice: 0,
    positionType: 'service',
    isRecurring: true,
    billingCycle: 'monthly',
  });

  useEffect(() => {
    loadCustomers();
    if (contractId) {
      loadContract();
    } else {
      loadNextNumber();
      setLoading(false);
    }
  }, [contractId]);

  const loadCustomers = async () => {
    try {
      const res = await customersApi.getAll();
      if (res.success) {
        setCustomers(res.data);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadNextNumber = async () => {
    try {
      const res = await contractsApi.getNextContractNumber();
      if (res.success) {
        setFormData((prev) => ({ ...prev, contractNumber: res.data }));
      }
    } catch (err) {
      console.error('Failed to get next contract number:', err);
    }
  };

  const loadContract = async () => {
    if (!contractId) return;

    try {
      setLoading(true);
      const [contractRes, positionsRes, trackingRes] = await Promise.all([
        contractsApi.getContract(contractId),
        contractsApi.getPositions(contractId),
        contractsApi.getHourlyTracking(contractId),
      ]);

      if (contractRes.success) {
        const c = contractRes.data;
        setFormData({
          ...c,
          startDate: c.startDate ? c.startDate.split('T')[0] : '',
          endDate: c.endDate ? c.endDate.split('T')[0] : null,
        });
      }
      if (positionsRes.success) {
        setPositions(positionsRes.data);
      }
      if (trackingRes.success) {
        setHourlyTracking(trackingRes.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.customerId || !formData.name || !formData.startDate) {
      setError('Bitte füllen Sie alle Pflichtfelder aus (Kunde, Name, Startdatum)');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (contractId) {
        await contractsApi.updateContract(contractId, formData);
      } else {
        await contractsApi.createContract(formData);
      }

      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contractId) return;
    const ok = await confirm({
      title: 'Vertrag löschen?',
      message: 'Möchten Sie diesen Vertrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await contractsApi.deleteContract(contractId);
      onBack();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddPosition = async () => {
    if (!contractId || !positionForm.name) return;

    try {
      const res = await contractsApi.createPosition(contractId, positionForm);
      if (res.success) {
        setPositions([...positions, res.data]);
        setShowAddPosition(false);
        setPositionForm({
          name: '',
          description: '',
          quantity: 1,
          unit: 'Stück',
          unitPrice: 0,
          positionType: 'service',
          isRecurring: true,
          billingCycle: 'monthly',
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (!contractId) return;
    const ok = await confirm({
      title: 'Position löschen?',
      message: 'Position löschen?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await contractsApi.deletePosition(contractId, positionId);
      setPositions(positions.filter((p) => p.id !== positionId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: formData.currency || 'EUR' }).format(amount);
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center`}>
        <div className={`animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary-600`} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-dark-50`}>
      {/* Header */}
      <div className={`bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconButton
              onClick={onBack}
              icon={<ArrowLeft className="w-5 h-5" />}
              size="lg"
            />
            <div>
              <h1 className={`text-xl font-bold text-gray-900 dark:text-white`}>
                {contractId ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}
              </h1>
              {formData.contractNumber && (
                <p className={`text-sm text-gray-500 dark:text-dark-400`}>
                  {formData.contractNumber}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {contractId && (
              <Button
                onClick={handleDelete}
                variant="ghost"
                icon={<Trash2 className="w-4 h-4" />}
                className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                <span className="hidden sm:inline">Löschen</span>
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              variant="primary"
              loading={saving}
              icon={<Save className="w-4 h-4" />}
            >
              {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        {contractId && (
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {[
              { id: 'details', label: 'Details', icon: Settings },
              { id: 'positions', label: 'Positionen', icon: Package },
              { id: 'hours', label: 'Stunden', icon: Timer },
              { id: 'history', label: 'Verlauf', icon: History },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.id
                    ? `bg-accent-primary-100 dark:bg-accent-primary-900/30 text-accent-primary-700 dark:text-accent-primary-300`
                    : `text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200`
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4">
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
                Grunddaten
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Kunde *
                  </label>
                  <select
                    value={formData.customerId || ''}
                    onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  >
                    <option value="">Kunde auswählen...</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Vertragsnummer
                  </label>
                  <input
                    type="text"
                    value={formData.contractNumber || ''}
                    onChange={(e) => setFormData({ ...formData, contractNumber: e.target.value })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Vertragsname *
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="z.B. Wartungsvertrag Server 2024"
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Vertragstyp
                  </label>
                  <select
                    value={formData.contractType || 'service'}
                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value as any })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  >
                    <option value="service">Servicevertrag</option>
                    <option value="support">Supportvertrag</option>
                    <option value="maintenance">Wartungsvertrag</option>
                    <option value="project">Projektvertrag</option>
                    <option value="subscription">Abo/Lizenz</option>
                    <option value="framework">Rahmenvertrag</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Status
                  </label>
                  <select
                    value={formData.status || 'draft'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  >
                    <option value="draft">Entwurf</option>
                    <option value="active">Aktiv</option>
                    <option value="paused">Pausiert</option>
                    <option value="expiring">Läuft aus</option>
                    <option value="expired">Abgelaufen</option>
                    <option value="cancelled">Gekündigt</option>
                    <option value="terminated">Beendet</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Beschreibung
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
              </div>
            </div>

            {/* Contract Period */}
            <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
                Laufzeit
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Startdatum *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Enddatum
                  </label>
                  <input
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                    disabled={formData.isIndefinite}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500 disabled:opacity-50`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isIndefinite"
                    checked={formData.isIndefinite || false}
                    onChange={(e) => setFormData({ ...formData, isIndefinite: e.target.checked, endDate: null })}
                    className={`w-4 h-4 rounded border-gray-300 text-accent-primary-600 focus:ring-accent-primary-500`}
                  />
                  <label htmlFor="isIndefinite" className={`text-sm text-gray-700 dark:text-dark-500`}>
                    Unbefristeter Vertrag
                  </label>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Kündigungsfrist (Tage)
                  </label>
                  <input
                    type="number"
                    value={formData.noticePeriodDays || 30}
                    onChange={(e) => setFormData({ ...formData, noticePeriodDays: parseInt(e.target.value) })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoRenew"
                    checked={formData.autoRenew || false}
                    onChange={(e) => setFormData({ ...formData, autoRenew: e.target.checked })}
                    className={`w-4 h-4 rounded border-gray-300 text-accent-primary-600 focus:ring-accent-primary-500`}
                  />
                  <label htmlFor="autoRenew" className={`text-sm text-gray-700 dark:text-dark-500`}>
                    Automatische Verlängerung
                  </label>
                </div>
                {formData.autoRenew && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                      Verlängerung um (Monate)
                    </label>
                    <input
                      type="number"
                      value={formData.renewalPeriodMonths || 12}
                      onChange={(e) => setFormData({ ...formData, renewalPeriodMonths: parseInt(e.target.value) })}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Pricing */}
            <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
                Preisgestaltung
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Abrechnungszyklus
                  </label>
                  <select
                    value={formData.billingCycle || 'monthly'}
                    onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value as any })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  >
                    <option value="monthly">Monatlich</option>
                    <option value="quarterly">Quartalsweise</option>
                    <option value="semi_annual">Halbjährlich</option>
                    <option value="annual">Jährlich</option>
                    <option value="one_time">Einmalig</option>
                    <option value="per_call">Nach Aufwand</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Grundpreis (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.basePrice || ''}
                    onChange={(e) => setFormData({ ...formData, basePrice: e.target.value ? parseFloat(e.target.value) : null })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Inkludierte Stunden/Monat
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.includedHoursMonthly || ''}
                    onChange={(e) => setFormData({ ...formData, includedHoursMonthly: e.target.value ? parseFloat(e.target.value) : null })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Stundensatz (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.hourlyRate || ''}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value ? parseFloat(e.target.value) : null })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Überstunden-Satz (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.overageRate || ''}
                    onChange={(e) => setFormData({ ...formData, overageRate: e.target.value ? parseFloat(e.target.value) : null })}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
              </div>
            </div>

            {/* SLA */}
            <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
                SLA & Support
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Reaktionszeit (Stunden)
                  </label>
                  <input
                    type="number"
                    value={formData.slaResponseHours || ''}
                    onChange={(e) => setFormData({ ...formData, slaResponseHours: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="z.B. 4"
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Lösungszeit (Stunden)
                  </label>
                  <input
                    type="number"
                    value={formData.slaResolutionHours || ''}
                    onChange={(e) => setFormData({ ...formData, slaResolutionHours: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="z.B. 24"
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1`}>
                    Supportzeiten
                  </label>
                  <input
                    type="text"
                    value={formData.supportHours || ''}
                    onChange={(e) => setFormData({ ...formData, supportHours: e.target.value })}
                    placeholder="z.B. Mo-Fr 08:00-18:00"
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
                  />
                </div>
              </div>
            </div>

            {/* Internal Notes */}
            <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
                Interne Notizen
              </h2>
              <textarea
                value={formData.internalNotes || ''}
                onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                rows={4}
                placeholder="Interne Anmerkungen zum Vertrag..."
                className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-500`}
              />
            </div>
          </div>
        )}

        {activeTab === 'positions' && contractId && (
          <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold text-gray-900 dark:text-white`}>
                Vertragspositionen
              </h2>
              <Button
                onClick={() => setShowAddPosition(!showAddPosition)}
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
              >
                Position hinzufügen
              </Button>
            </div>

            {showAddPosition && (
              <div className={`mb-4 p-4 border border-accent-primary-200 dark:border-accent-primary-800 rounded-lg bg-accent-primary-50/50 dark:bg-accent-primary-900/20`}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    value={positionForm.name || ''}
                    onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })}
                    placeholder="Positionsname *"
                    className={`px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={positionForm.quantity || 1}
                    onChange={(e) => setPositionForm({ ...positionForm, quantity: parseFloat(e.target.value) })}
                    placeholder="Menge"
                    className={`px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={positionForm.unitPrice || ''}
                    onChange={(e) => setPositionForm({ ...positionForm, unitPrice: parseFloat(e.target.value) })}
                    placeholder="Einzelpreis (€)"
                    className={`px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 text-gray-900 dark:text-white`}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setShowAddPosition(false)}
                    variant="secondary"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleAddPosition}
                    disabled={!positionForm.name}
                    variant="primary"
                  >
                    Hinzufügen
                  </Button>
                </div>
              </div>
            )}

            {positions.length === 0 ? (
              <div className="text-center py-8">
                <Package className={`w-12 h-12 mx-auto text-gray-400 mb-3`} />
                <p className={`text-gray-500 dark:text-dark-400`}>
                  Noch keine Positionen vorhanden
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className={`flex items-center justify-between p-3 border border-gray-200 dark:border-dark-border rounded-lg`}
                  >
                    <div className="flex-1">
                      <div className={`font-medium text-gray-900 dark:text-white`}>
                        {position.positionNumber}. {position.name}
                      </div>
                      <div className={`text-sm text-gray-500 dark:text-dark-400`}>
                        {position.quantity} x {formatCurrency(position.unitPrice)} = {formatCurrency(position.totalPrice)}
                        {position.isRecurring && ' / Monat'}
                      </div>
                    </div>
                    <IconButton
                      onClick={() => handleDeletePosition(position.id)}
                      icon={<Trash2 className="w-4 h-4" />}
                      variant="danger"
                      size="lg"
                    />
                  </div>
                ))}
                <div className={`flex justify-between pt-3 mt-3 border-t border-gray-200 dark:border-dark-border`}>
                  <span className={`font-medium text-gray-700 dark:text-dark-500`}>Gesamt:</span>
                  <span className={`font-bold text-gray-900 dark:text-white`}>
                    {formatCurrency(positions.reduce((sum, p) => sum + (p.totalPrice || 0), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hours' && contractId && (
          <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
            <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
              Stundenverbrauch
            </h2>

            {formData.includedHoursMonthly ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className={`p-4 rounded-lg bg-gray-50 dark:bg-dark-200`}>
                    <div className={`text-xs text-gray-500 dark:text-dark-400`}>Inkludiert/Monat</div>
                    <div className={`text-2xl font-bold text-gray-900 dark:text-white`}>
                      {formData.includedHoursMonthly}h
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-accent-light dark:bg-accent-primary/30">
                    <div className="text-xs text-accent-primary dark:text-accent-primary">Diesen Monat</div>
                    <div className="text-2xl font-bold text-accent-dark dark:text-accent-primary">
                      {hourlyTracking[0]?.usedHours || 0}h
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/30">
                    <div className="text-xs text-green-600 dark:text-green-400">Verfügbar</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {Math.max(0, (formData.includedHoursMonthly || 0) - (hourlyTracking[0]?.usedHours || 0))}h
                    </div>
                  </div>
                  {(hourlyTracking[0]?.overageHours || 0) > 0 && (
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                      <div className="text-xs text-amber-600 dark:text-amber-400">Überstunden</div>
                      <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {hourlyTracking[0]?.overageHours}h
                      </div>
                    </div>
                  )}
                </div>

                {hourlyTracking.length > 0 ? (
                  <div className="space-y-2">
                    {hourlyTracking.map((tracking) => (
                      <div
                        key={tracking.id}
                        className={`flex items-center justify-between p-3 border border-gray-200 dark:border-dark-border rounded-lg`}
                      >
                        <div>
                          <div className={`font-medium text-gray-900 dark:text-white`}>
                            {new Date(tracking.year, tracking.month - 1).toLocaleDateString('de-DE', {
                              month: 'long',
                              year: 'numeric',
                            })}
                          </div>
                          <div className={`text-sm text-gray-500 dark:text-dark-400`}>
                            {tracking.usedHours}h von {tracking.includedHours}h verwendet
                          </div>
                        </div>
                        <div className="text-right">
                          {tracking.overageHours > 0 && (
                            <div className="text-amber-600 dark:text-amber-400 font-medium">
                              +{tracking.overageHours}h Überstunden
                            </div>
                          )}
                          {tracking.overageAmount > 0 && (
                            <div className={`text-sm text-gray-500 dark:text-dark-400`}>
                              {formatCurrency(tracking.overageAmount)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-center text-gray-500 dark:text-dark-400 py-8`}>
                    Noch keine Stundenerfassung vorhanden
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Timer className={`w-12 h-12 mx-auto text-gray-400 mb-3`} />
                <p className={`text-gray-500 dark:text-dark-400`}>
                  Dieser Vertrag hat kein Stundenkontingent konfiguriert
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && contractId && (
          <div className={`bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-border p-4`}>
            <h2 className={`text-lg font-semibold text-gray-900 dark:text-white mb-4`}>
              Aktivitätsverlauf
            </h2>
            <p className={`text-center text-gray-500 dark:text-dark-400 py-8`}>
              Verlauf wird in Kürze verfügbar sein
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractDetail;
