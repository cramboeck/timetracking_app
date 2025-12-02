import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { customerPortalApi, PortalTicket } from '../../services/api';
import { MarkdownEditor } from '../MarkdownEditor';

interface PortalCreateTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticket: PortalTicket) => void;
}

const priorityOptions = [
  { value: 'low', label: 'Niedrig', description: 'Nicht dringend' },
  { value: 'normal', label: 'Normal', description: 'Normale Bearbeitung' },
  { value: 'high', label: 'Hoch', description: 'Schnelle Bearbeitung erwünscht' },
  { value: 'critical', label: 'Kritisch', description: 'System/Prozess blockiert' },
];

export const PortalCreateTicket = ({ isOpen, onClose, onCreated }: PortalCreateTicketProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Bitte geben Sie einen Betreff ein');
      return;
    }

    try {
      setLoading(true);
      const ticket = await customerPortalApi.createTicket({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      });
      onCreated(ticket);
      // Reset form
      setTitle('');
      setDescription('');
      setPriority('normal');
      onClose();
    } catch (err) {
      console.error('Failed to create ticket:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Tickets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Neues Ticket erstellen
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Betreff <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kurze Beschreibung des Problems"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={200}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Priorität
            </label>
            <div className="grid grid-cols-2 gap-3">
              {priorityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value as typeof priority)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    priority === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className={`font-medium ${
                    priority === opt.value ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                  }`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Beschreibung
            </label>
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder="Beschreiben Sie Ihr Anliegen so detailliert wie möglich..."
              rows={5}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? 'Erstellen...' : 'Ticket erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
};
