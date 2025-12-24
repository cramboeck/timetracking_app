import { useState, useEffect } from 'react';
import {
  Download,
  Link2,
  Check,
  X,
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

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const response = await sevdeskApi.getImportPreview();
      if (response.success) {
        setCustomers(response.data.customers);
        setCounts(response.data.counts);

        // Initialize actions: skip for linked, import for new, skip for name_match (user must decide)
        const initialActions = new Map<string, ImportAction>();
        for (const c of response.data.customers) {
          if (c.matchStatus === 'linked') {
            initialActions.set(c.sevdeskId, { sevdeskId: c.sevdeskId, action: 'skip' });
          } else if (c.matchStatus === 'new') {
            initialActions.set(c.sevdeskId, {
              sevdeskId: c.sevdeskId,
              action: 'import',
              color: COLORS[Math.floor(Math.random() * COLORS.length)],
            });
          } else {
            // name_match - default to link
            initialActions.set(c.sevdeskId, {
              sevdeskId: c.sevdeskId,
              action: 'link',
              linkToCustomerId: c.localCustomerId,
            });
          }
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

  const renderCustomerRow = (customer: ImportCustomer) => {
    const action = actions.get(customer.sevdeskId);
    const isLinked = customer.matchStatus === 'linked';

    return (
      <div
        key={customer.sevdeskId}
        className={`p-3 border-b border-gray-100 dark:border-gray-700 ${
          isLinked ? 'bg-gray-50 dark:bg-gray-800/50' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-4">
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
            </div>
            {customer.email && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{customer.email}</p>
            )}
            {customer.address && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{customer.address}</p>
            )}
            {customer.matchStatus === 'name_match' && customer.localCustomerName && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Mögliche Übereinstimmung: {customer.localCustomerName}
              </p>
            )}
            {customer.matchStatus === 'linked' && customer.localCustomerName && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Verknüpft mit: {customer.localCustomerName}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          {!isLinked && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAction(customer.sevdeskId, {
                  sevdeskId: customer.sevdeskId,
                  action: 'import',
                  color: COLORS[Math.floor(Math.random() * COLORS.length)],
                })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  action?.action === 'import'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                }`}
                title="Als neuen Kunden importieren"
              >
                <UserPlus size={14} />
              </button>

              {customer.matchStatus === 'name_match' && customer.localCustomerId && (
                <button
                  onClick={() => setAction(customer.sevdeskId, {
                    sevdeskId: customer.sevdeskId,
                    action: 'link',
                    linkToCustomerId: customer.localCustomerId,
                  })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    action?.action === 'link'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-green-100 dark:hover:bg-green-900/30'
                  }`}
                  title="Mit bestehendem Kunden verknüpfen"
                >
                  <Link2 size={14} />
                </button>
              )}

              <button
                onClick={() => setAction(customer.sevdeskId, {
                  sevdeskId: customer.sevdeskId,
                  action: 'skip',
                })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  action?.action === 'skip'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                title="Überspringen"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {isLinked && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check size={16} />
              <span className="text-xs">Verknüpft</span>
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
                <span className="text-blue-600 dark:text-blue-400">
                  <strong>{counts.new}</strong> neu
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  <strong>{counts.name_match}</strong> Übereinstimmung
                </span>
                <span className="text-green-600 dark:text-green-400">
                  <strong>{counts.linked}</strong> verknüpft
                </span>
              </div>
              <button
                onClick={loadPreview}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Neu laden"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 px-1">
              <span className="flex items-center gap-1">
                <UserPlus size={12} className="text-blue-600" /> Importieren
              </span>
              <span className="flex items-center gap-1">
                <Link2 size={12} className="text-green-600" /> Verknüpfen
              </span>
              <span className="flex items-center gap-1">
                <X size={12} className="text-gray-600" /> Überspringen
              </span>
            </div>

            {/* Scrollable Content */}
            <div className="max-h-96 overflow-y-auto">
              {renderSection(
                'new',
                'Neue Kontakte',
                <UserPlus size={18} />,
                'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
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
                  Auswahl: <strong className="text-blue-600">{toImport}</strong> importieren,{' '}
                  <strong className="text-green-600">{toLink}</strong> verknüpfen,{' '}
                  <strong className="text-gray-500">{toSkip}</strong> überspringen
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {result ? 'Schließen' : 'Abbrechen'}
          </button>
          {!result && (
            <button
              onClick={handleExecuteImport}
              disabled={importing || loading || (toImport === 0 && toLink === 0)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {importing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Download size={18} />
              )}
              Import starten
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SevdeskCustomerImport;
