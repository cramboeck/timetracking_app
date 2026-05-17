import { useState, useEffect } from 'react';
import {
  Download,
  Link2,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Users,
  UserPlus,
  UserCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { sevdeskApi } from '../services/api';
import { Modal } from './Modal';
import { Button, IconButton } from './ui';

interface ImportCustomer {
  sevdeskId: string;
  sevdeskCustomerNumber: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  matchStatus: 'new' | 'linked' | 'name_match';
  localCustomerId?: string;
  localCustomerName?: string;
}

interface ImportAction {
  sevdeskId: string;
  action: 'import' | 'link' | 'skip';
  linkToCustomerId?: string;
  color?: string;
}

interface SevdeskCustomerImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export const SevdeskCustomerImport = ({
  isOpen,
  onClose,
  onImportComplete,
}: SevdeskCustomerImportProps) => {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<ImportCustomer[]>([]);
  const [counts, setCounts] = useState({ new: 0, name_match: 0, linked: 0, total: 0 });
  const [actions, setActions] = useState<Map<string, ImportAction>>(new Map());
  const [expandedSections, setExpandedSections] = useState({
    new: true,
    name_match: true,
    linked: false,
  });
  const [showAll, setShowAll] = useState(true); // Default to showing all customers
  const [result, setResult] = useState<{
    imported: number;
    linked: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPreview();
    }
  }, [isOpen]);

  const loadPreview = async (fetchAll?: boolean) => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await sevdeskApi.getImportPreview(fetchAll ?? showAll);
      if (response.success) {
        setCustomers(response.data.customers);
        setCounts(response.data.counts);

        // Initialize actions: all set to skip by default, user selects what to import
        const initialActions = new Map<string, ImportAction>();
        for (const c of response.data.customers) {
          initialActions.set(c.sevdeskId, { sevdeskId: c.sevdeskId, action: 'skip' });
        }
        setActions(initialActions);
      } else {
        setError('Fehler beim Laden der Vorschau');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  const setAction = (sevdeskId: string, action: ImportAction) => {
    setActions(prev => new Map(prev).set(sevdeskId, action));
  };

  const handleExecuteImport = async () => {
    try {
      setImporting(true);
      setError(null);

      const imports = Array.from(actions.values()).filter(a => a.action !== 'skip');

      if (imports.length === 0) {
        setError('Keine Kunden zum Importieren ausgewählt');
        return;
      }

      const response = await sevdeskApi.executeImport(imports);

      if (response.success) {
        setResult(response.data);
        if (response.data.imported > 0 || response.data.linked > 0) {
          onImportComplete();
        }
      } else {
        setError('Fehler beim Import');
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Import');
    } finally {
      setImporting(false);
    }
  };

  const toggleSection = (section: 'new' | 'name_match' | 'linked') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle selection for a customer
  const toggleSelection = (customer: ImportCustomer) => {
    const currentAction = actions.get(customer.sevdeskId);
    if (currentAction?.action === 'skip') {
      // Select for import (or link if name_match)
      if (customer.matchStatus === 'name_match' && customer.localCustomerId) {
        setAction(customer.sevdeskId, {
          sevdeskId: customer.sevdeskId,
          action: 'link',
          linkToCustomerId: customer.localCustomerId,
        });
      } else {
        setAction(customer.sevdeskId, {
          sevdeskId: customer.sevdeskId,
          action: 'import',
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    } else {
      // Deselect
      setAction(customer.sevdeskId, { sevdeskId: customer.sevdeskId, action: 'skip' });
    }
  };

  // Select all non-linked customers
  const selectAll = () => {
    const newActions = new Map(actions);
    for (const c of customers) {
      if (c.matchStatus !== 'linked') {
        if (c.matchStatus === 'name_match' && c.localCustomerId) {
          newActions.set(c.sevdeskId, {
            sevdeskId: c.sevdeskId,
            action: 'link',
            linkToCustomerId: c.localCustomerId,
          });
        } else {
          newActions.set(c.sevdeskId, {
            sevdeskId: c.sevdeskId,
            action: 'import',
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
          });
        }
      }
    }
    setActions(newActions);
  };

  // Deselect all
  const deselectAll = () => {
    const newActions = new Map<string, ImportAction>();
    for (const c of customers) {
      newActions.set(c.sevdeskId, { sevdeskId: c.sevdeskId, action: 'skip' });
    }
    setActions(newActions);
  };

  const renderCustomerRow = (customer: ImportCustomer) => {
    const action = actions.get(customer.sevdeskId);
    const isLinked = customer.matchStatus === 'linked';
    const isSelected = action?.action !== 'skip';

    return (
      <div
        key={customer.sevdeskId}
        className={`p-3 border-b border-gray-100 dark:border-gray-700 ${
          isLinked ? 'bg-gray-50 dark:bg-gray-800/50' : ''
        } ${isSelected && !isLinked ? 'bg-accent-light dark:bg-accent-primary/20' : ''}`}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {!isLinked ? (
            <label className="flex items-center mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelection(customer)}
                className="w-4 h-4 text-accent-primary rounded border-gray-300 dark:border-gray-600 focus:ring-accent-primary dark:bg-gray-700"
              />
            </label>
          ) : (
            <div className="w-4 h-4 mt-1 flex items-center justify-center">
              <Check size={14} className="text-green-600 dark:text-green-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900 dark:text-white truncate">
                {customer.name}
              </span>
              {customer.sevdeskCustomerNumber && (
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                  #{customer.sevdeskCustomerNumber}
                </span>
              )}
              {customer.matchStatus === 'name_match' && (
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                  Ähnlich
                </span>
              )}
            </div>
            {customer.email && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{customer.email}</p>
            )}
            {customer.address && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{customer.address}</p>
            )}
            {customer.matchStatus === 'name_match' && customer.localCustomerName && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                → Wird verknüpft mit: {customer.localCustomerName}
              </p>
            )}
            {customer.matchStatus === 'linked' && customer.localCustomerName && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Bereits verknüpft mit: {customer.localCustomerName}
              </p>
            )}
          </div>

          {/* Status indicator */}
          {isSelected && !isLinked && (
            <div className="flex items-center gap-1 text-xs">
              {action?.action === 'link' ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Link2 size={12} /> Verknüpfen
                </span>
              ) : (
                <span className="flex items-center gap-1 text-accent-primary dark:text-accent-primary">
                  <UserPlus size={12} /> Importieren
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (
    status: 'new' | 'name_match' | 'linked',
    title: string,
    icon: React.ReactNode,
    colorClass: string
  ) => {
    const sectionCustomers = customers.filter(c => c.matchStatus === status);
    if (sectionCustomers.length === 0) return null;

    const isExpanded = expandedSections[status];

    return (
      <div className="mb-4">
        <button
          onClick={() => toggleSection(status)}
          className={`w-full flex items-center justify-between p-3 rounded-t-lg ${colorClass}`}
        >
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
            <span className="text-sm opacity-75">({sectionCustomers.length})</span>
          </div>
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {isExpanded && (
          <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg overflow-hidden">
            {sectionCustomers.map(renderCustomerRow)}
          </div>
        )}
      </div>
    );
  };

  // Count selected actions
  const toImport = Array.from(actions.values()).filter(a => a.action === 'import').length;
  const toLink = Array.from(actions.values()).filter(a => a.action === 'link').length;
  const toSkip = Array.from(actions.values()).filter(a => a.action === 'skip').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kunden aus sevDesk importieren"
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
            <AlertTriangle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Result Message */}
        {result && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
              <Check size={18} />
              <span className="font-medium">Import abgeschlossen</span>
            </div>
            <ul className="text-sm text-green-600 dark:text-green-400 space-y-1 ml-6">
              {result.imported > 0 && <li>{result.imported} Kunde(n) importiert</li>}
              {result.linked > 0 && <li>{result.linked} Kunde(n) verknüpft</li>}
              {result.skipped > 0 && <li>{result.skipped} übersprungen</li>}
            </ul>
            {result.errors.length > 0 && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                <p className="font-medium">Fehler:</p>
                <ul className="list-disc ml-4">
                  {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="animate-spin text-accent-primary" size={32} />
          </div>
        )}

        {/* Customer Sections */}
        {!loading && !result && (
          <>
            {/* Summary */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  <strong>{counts.total}</strong> Kontakte in sevDesk
                </span>
                <span className="text-accent-primary dark:text-accent-primary">
                  <strong>{counts.new}</strong> neu
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  <strong>{counts.name_match}</strong> Übereinstimmung
                </span>
                <span className="text-green-600 dark:text-green-400">
                  <strong>{counts.linked}</strong> verknüpft
                </span>
              </div>
              <IconButton
                onClick={() => loadPreview()}
                icon={<RefreshCw size={16} />}
                size="sm"
                tooltip="Neu laden"
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  onClick={selectAll}
                  variant="primary"
                  size="sm"
                >
                  Alle auswählen
                </Button>
                <Button
                  onClick={deselectAll}
                  variant="secondary"
                  size="sm"
                >
                  Alle abwählen
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <UserPlus size={12} className="text-accent-primary" /> Importieren
                </span>
                <span className="flex items-center gap-1">
                  <Link2 size={12} className="text-green-600" /> Verknüpfen
                </span>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="max-h-96 overflow-y-auto">
              {renderSection(
                'new',
                'Neue Kontakte',
                <UserPlus size={18} />,
                'bg-accent-light dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
              )}

              {renderSection(
                'name_match',
                'Mögliche Übereinstimmungen',
                <Users size={18} />,
                'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              )}

              {renderSection(
                'linked',
                'Bereits verknüpft',
                <UserCheck size={18} />,
                'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              )}

              {customers.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine Kontakte in sevDesk gefunden
                </div>
              )}
            </div>

            {/* Action Summary */}
            {customers.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Auswahl: <strong className="text-accent-primary">{toImport}</strong> importieren,{' '}
                  <strong className="text-green-600">{toLink}</strong> verknüpfen,{' '}
                  <strong className="text-gray-500">{toSkip}</strong> überspringen
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={onClose}
            variant="secondary"
          >
            {result ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!result && (
            <Button
              onClick={handleExecuteImport}
              disabled={importing || loading || (toImport === 0 && toLink === 0)}
              variant="primary"
              loading={importing}
              icon={!importing ? <Download size={18} /> : undefined}
            >
              Import starten
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SevdeskCustomerImport;
