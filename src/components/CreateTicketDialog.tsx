import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Customer, Project, TicketPriority } from '../types';
import { ticketsApi } from '../services/api';

interface CreateTicketDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  customers: Customer[];
  projects: Project[];
}

const priorityOptions: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch' },
];

export const CreateTicketDialog = ({ isOpen, onClose, onCreated, customers, projects }: CreateTicketDialogProps) => {
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter projects based on selected customer
  const filteredProjects = customerId
    ? projects.filter(p => p.customerId === customerId && p.isActive)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerId || !title.trim()) {
      setError('Bitte wähle einen Kunden und gib einen Titel ein.');
      return;
    }

    try {
      setSubmitting(true);
      await ticketsApi.create({
        customerId,
        projectId: projectId || undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
      });

      // Reset form and close
      setCustomerId('');
      setProjectId('');
      setTitle('');
      setDescription('');
      setPriority('normal');
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create ticket:', err);
      setError('Fehler beim Erstellen des Tickets. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Neues Ticket</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Kunde *
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setProjectId(''); // Reset project when customer changes
                }}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value="">Kunde wählen...</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Project (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Projekt (optional)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!customerId || filteredProjects.length === 0}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
              >
                <option value="">
                  {!customerId
                    ? 'Zuerst Kunde wählen'
                    : filteredProjects.length === 0
                      ? 'Keine Projekte für diesen Kunden'
                      : 'Projekt wählen...'}
                </option>
                {filteredProjects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Titel *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Kurze Beschreibung des Problems"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Priorität
              </label>
              <div className="grid grid-cols-4 gap-2">
                {priorityOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriority(option.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      priority === option.value
                        ? option.value === 'critical'
                          ? 'bg-red-500 text-white'
                          : option.value === 'high'
                            ? 'bg-orange-500 text-white'
                            : option.value === 'low'
                              ? 'bg-gray-400 text-white'
                              : 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Beschreibung
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Detaillierte Beschreibung des Problems oder der Anfrage..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={submitting || !customerId || !title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 btn-accent rounded-lg disabled:opacity-50"
              >
                <Save size={20} />
                {submitting ? 'Erstelle...' : 'Erstellen'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
