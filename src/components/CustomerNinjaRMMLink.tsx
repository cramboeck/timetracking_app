import { useState, useEffect } from 'react';
import {
  Link2,
  Search,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Unlink,
  Server,
  Monitor,
} from 'lucide-react';
import { ninjaApi } from '../services/api';
import { Customer } from '../types';
import { Modal } from './Modal';

interface NinjaOrganization {
  id: string;
  ninjaId: number;
  name: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  deviceCount: number;
  syncedAt: string;
}

interface CustomerNinjaRMMLinkProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
  onLinked: () => void;
}

export const CustomerNinjaRMMLink = ({
  customer,
  isOpen,
  onClose,
  onLinked,
}: CustomerNinjaRMMLinkProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [organizations, setOrganizations] = useState<NinjaOrganization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadOrganizations();
      setSearchQuery('');
      setSelectedOrgId(null);
      setError(null);
    }
  }, [isOpen]);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ninjaApi.getOrganizations();
      setOrganizations(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der NinjaRMM-Organisationen');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedOrgId) return;

    try {
      setSaving(true);
      setError(null);
      await ninjaApi.linkOrganization(selectedOrgId, customer.id);
      onLinked();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verknüpfen');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!customer.ninjarmmOrganizationId) return;

    try {
      setSaving(true);
      setError(null);
      await ninjaApi.linkOrganization(customer.ninjarmmOrganizationId, null);
      onLinked();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Trennen der Verknüpfung');
    } finally {
      setSaving(false);
    }
  };

  // Filter organizations based on search
  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (org.description && org.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Find current linked organization
  const currentOrg = customer.ninjarmmOrganizationId
    ? organizations.find(org => org.id === customer.ninjarmmOrganizationId)
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${customer.name} mit NinjaRMM verknüpfen`}
    >
      <div className="space-y-4">
        {/* Current Status */}
        {customer.ninjarmmOrganizationId && (
          <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 text-purple-700">
              <Check size={18} />
              <div>
                <span className="text-sm font-medium">Mit NinjaRMM verknüpft</span>
                {currentOrg && (
                  <span className="text-xs text-purple-600 ml-2">
                    ({currentOrg.name})
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleUnlink}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Unlink size={14} />}
              Trennen
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertTriangle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Organisation suchen..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>

        {/* Organization List */}
        <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-purple-600" size={24} />
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? 'Keine Organisationen gefunden' : 'Keine NinjaRMM-Organisationen vorhanden'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredOrganizations.map((org) => {
                const isLinkedToOther = org.customerId && org.customerId !== customer.id;
                const isCurrentlyLinked = org.id === customer.ninjarmmOrganizationId;

                return (
                  <button
                    key={org.id}
                    onClick={() => !isLinkedToOther && setSelectedOrgId(org.id)}
                    disabled={isLinkedToOther}
                    className={`w-full p-3 text-left transition-colors ${
                      isLinkedToOther
                        ? 'opacity-50 cursor-not-allowed bg-gray-50'
                        : selectedOrgId === org.id
                        ? 'bg-purple-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                          selectedOrgId === org.id
                            ? 'border-purple-600 bg-purple-600'
                            : isCurrentlyLinked
                            ? 'border-green-600 bg-green-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {(selectedOrgId === org.id || isCurrentlyLinked) && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Server size={16} className="text-purple-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 truncate">
                            {org.name}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 bg-gray-100 px-2 py-0.5 rounded">
                            <Monitor size={12} />
                            {org.deviceCount}
                          </span>
                        </div>
                        {org.description && (
                          <p className="text-sm text-gray-500 truncate mt-0.5">
                            {org.description}
                          </p>
                        )}
                        {isLinkedToOther && org.customerName && (
                          <p className="text-xs text-orange-600 mt-1">
                            Bereits verknüpft mit: {org.customerName}
                          </p>
                        )}
                        {isCurrentlyLinked && (
                          <p className="text-xs text-green-600 mt-1">
                            Aktuell verknüpft
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedOrgId || saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Link2 size={18} />
            )}
            Verknüpfen
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CustomerNinjaRMMLink;
