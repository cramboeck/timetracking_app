import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  Building2,
  Calendar,
  Euro,
  Timer,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
} from 'lucide-react';
import { contractsApi, Contract, ContractSummary } from '../services/api';
import { customersApi } from '../services/api';
import { Button, IconButton } from './ui';
import { Customer } from '../types';

interface ContractsListProps {
  onSelectContract: (contract: Contract) => void;
  onCreateContract: () => void;
}

const ContractsList: React.FC<ContractsListProps> = ({ onSelectContract, onCreateContract }) => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ contractId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    loadData();
  }, [searchTerm, statusFilter, typeFilter, customerFilter]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [contractsRes, summaryRes] = await Promise.all([
        contractsApi.getContracts({
          search: searchTerm || undefined,
          status: statusFilter || undefined,
          contractType: typeFilter || undefined,
          customerId: customerFilter || undefined,
        }),
        contractsApi.getSummary(),
      ]);

      if (contractsRes.success) {
        setContracts(contractsRes.data);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const handleDeleteContract = async (id: string) => {
    if (!confirm('Möchten Sie diesen Vertrag wirklich löschen?')) return;

    try {
      const res = await contractsApi.deleteContract(id);
      if (res.success) {
        loadData();
      }
    } catch (err: any) {
      setError(err.message);
    }
    setContextMenu(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30';
      case 'expiring':
        return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30';
      case 'expired':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';
      case 'draft':
        return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-800';
      case 'paused':
        return 'text-accent-primary bg-accent-light dark:text-accent-primary dark:bg-accent-primary/30';
      case 'cancelled':
      case 'terminated':
        return 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'expiring':
        return <AlertTriangle className="w-4 h-4" />;
      case 'expired':
        return <XCircle className="w-4 h-4" />;
      case 'draft':
        return <Clock className="w-4 h-4" />;
      case 'paused':
        return <Pause className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Entwurf',
      active: 'Aktiv',
      paused: 'Pausiert',
      expiring: 'Läuft aus',
      expired: 'Abgelaufen',
      cancelled: 'Gekündigt',
      terminated: 'Beendet',
    };
    return labels[status] || status;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      service: 'Servicevertrag',
      support: 'Supportvertrag',
      maintenance: 'Wartungsvertrag',
      project: 'Projektvertrag',
      subscription: 'Abo',
      framework: 'Rahmenvertrag',
      other: 'Sonstige',
    };
    return labels[type] || type;
  };

  const formatCurrency = (amount: number | null, currency: string = 'EUR') => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('de-DE');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-primary/10">
              <FileText className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Verträge</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Verwalten Sie Ihre Service- und Wartungsverträge
              </p>
            </div>
          </div>
          <Button
            onClick={onCreateContract}
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
          >
            Neuer Vertrag
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">Gesamt</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {summary.totalContracts}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30">
              <div className="text-xs text-green-600 dark:text-green-400">Aktiv</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {summary.activeContracts}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
              <div className="text-xs text-amber-600 dark:text-amber-400">Läuft aus</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                {summary.expiringContracts}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-accent-primary/10">
              <div className="text-xs text-accent-primary">Monatsumsatz</div>
              <div className="text-lg font-bold text-accent-primary">
                {formatCurrency(summary.totalMonthlyRevenue)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Verträge suchen..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">Alle Status</option>
              <option value="draft">Entwurf</option>
              <option value="active">Aktiv</option>
              <option value="paused">Pausiert</option>
              <option value="expiring">Läuft aus</option>
              <option value="expired">Abgelaufen</option>
              <option value="cancelled">Gekündigt</option>
              <option value="terminated">Beendet</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">Alle Typen</option>
              <option value="service">Servicevertrag</option>
              <option value="support">Supportvertrag</option>
              <option value="maintenance">Wartungsvertrag</option>
              <option value="project">Projektvertrag</option>
              <option value="subscription">Abo</option>
              <option value="framework">Rahmenvertrag</option>
              <option value="other">Sonstige</option>
            </select>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">Alle Kunden</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Contracts List */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button
              onClick={loadData}
              variant="ghost"
              className="mt-4"
            >
              Erneut versuchen
            </Button>
          </div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Keine Verträge gefunden
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {searchTerm || statusFilter || typeFilter || customerFilter
                ? 'Versuchen Sie andere Filteroptionen'
                : 'Erstellen Sie Ihren ersten Vertrag'}
            </p>
            {!searchTerm && !statusFilter && !typeFilter && !customerFilter && (
              <Button
                onClick={onCreateContract}
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
              >
                Vertrag erstellen
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-accent-primary/50 transition-colors cursor-pointer"
                onClick={() => onSelectContract(contract)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                          {contract.contractNumber}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                            contract.status
                          )}`}
                        >
                          {getStatusIcon(contract.status)}
                          {getStatusLabel(contract.status)}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        {contract.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                          <Building2 className="w-4 h-4" />
                          <span>{contract.customerName || 'Kein Kunde'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {formatDate(contract.startDate)}
                            {contract.endDate ? ` - ${formatDate(contract.endDate)}` : ''}
                            {contract.isIndefinite && ' (unbefristet)'}
                          </span>
                        </div>
                        {contract.basePrice && (
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                            <Euro className="w-4 h-4" />
                            <span>{formatCurrency(contract.basePrice)}</span>
                          </div>
                        )}
                        {contract.includedHoursMonthly && (
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                            <Timer className="w-4 h-4" />
                            <span>{contract.includedHoursMonthly}h/Monat</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {getTypeLabel(contract.contractType)}
                      </span>
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({
                            contractId: contract.id,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                        icon={<MoreHorizontal className="w-5 h-5" />}
                        variant="default"
                        size="sm"
                      />
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 150),
              left: Math.min(contextMenu.x, window.innerWidth - 180),
            }}
          >
            <Button
              onClick={() => {
                const contract = contracts.find((c) => c.id === contextMenu.contractId);
                if (contract) onSelectContract(contract);
                setContextMenu(null);
              }}
              variant="ghost"
              size="sm"
              icon={<Eye className="w-4 h-4" />}
              className="w-full justify-start"
            >
              Anzeigen
            </Button>
            <Button
              onClick={() => {
                const contract = contracts.find((c) => c.id === contextMenu.contractId);
                if (contract) onSelectContract(contract);
                setContextMenu(null);
              }}
              variant="ghost"
              size="sm"
              icon={<Edit className="w-4 h-4" />}
              className="w-full justify-start"
            >
              Bearbeiten
            </Button>
            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
            <Button
              onClick={() => handleDeleteContract(contextMenu.contractId)}
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-4 h-4" />}
              className="w-full justify-start"
            >
              Löschen
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContractsList;
