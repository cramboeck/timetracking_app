import { useState, useEffect } from 'react';
import {
  Link2,
  Search,
  Loader2,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  Unlink,
} from 'lucide-react';
import { sevdeskApi } from '../services/api';
import { Customer } from '../types';
import { Modal } from './Modal';

interface SevdeskCustomer {
  id: string;
  customerNumber: string;
  name: string;
  email?: string;
  phone?: string;
}

interface CustomerSevdeskLinkProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
  onLinked: () => void;
}

export const CustomerSevdeskLink = ({
  customer,
  isOpen,
  onClose,
  onLinked,
}: CustomerSevdeskLinkProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sevdeskCustomers, setSevdeskCustomers] = useState<SevdeskCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSevdeskCustomers();
      setSearchQuery('');
      setSelectedCustomerId(null);
      setError(null);
    }
  }, [isOpen]);

  const loadSevdeskCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await sevdeskApi.getCustomers();
      setSevdeskCustomers(response.data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der sevDesk-Kontakte');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedCustomerId) return;

    try {
      setSaving(true);
      setError(null);
      await sevdeskApi.linkCustomer(customer.id, selectedCustomerId);
      onLinked();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verknüpfen');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    try {
      setSaving(true);
      setError(null);
      await sevdeskApi.linkCustomer(customer.id, '');
      onLinked();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Trennen der Verknüpfung');
    } finally {
      setSaving(false);
    }
  };

  // Filter customers based on search
  const filteredCustomers = sevdeskCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.customerNumber && c.customerNumber.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${customer.name} mit sevDesk verknüpfen`}
    >
      <div className="space-y-4">
        {/* Current Status */}
        {customer.sevdeskCustomerId && (
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Check size={18} />
              <span className="text-sm">Mit sevDesk verknüpft</span>
            </div>
            <button
              onClick={handleUnlink}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Unlink size={14} />}
              Trennen
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
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
            placeholder="sevDesk-Kontakt suchen..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
        </div>

        {/* Customer List */}
        <div className="max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-accent-primary" size={24} />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {searchQuery ? 'Keine Kontakte gefunden' : 'Keine sevDesk-Kontakte vorhanden'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCustomers.map((sevdeskCustomer) => (
                <button
                  key={sevdeskCustomer.id}
                  onClick={() => setSelectedCustomerId(sevdeskCustomer.id)}
                  className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    selectedCustomerId === sevdeskCustomer.id
                      ? 'bg-accent-light/30 dark:bg-accent-lighter/10'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedCustomerId === sevdeskCustomer.id
                          ? 'border-accent-primary bg-accent-primary'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {selectedCustomerId === sevdeskCustomer.id && (
                        <Check size={12} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white truncate">
                          {sevdeskCustomer.name}
                        </span>
                        {sevdeskCustomer.customerNumber && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            #{sevdeskCustomer.customerNumber}
                          </span>
                        )}
                      </div>
                      {sevdeskCustomer.email && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {sevdeskCustomer.email}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedCustomerId || saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 disabled:opacity-50 transition-colors"
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

export default CustomerSevdeskLink;
