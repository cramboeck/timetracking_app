import { useState, useEffect } from 'react';
import { X, Save, FileText } from 'lucide-react';
import { Customer, Project, TicketPriority } from '../types';
import { ticketsApi, TicketTemplate } from '../services/api';
import { Button, IconButton } from './ui';

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

  // Template state
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Load templates when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await ticketsApi.getTemplates({ activeOnly: true });
      setTemplates(response.data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    // Apply template values
    if (template.titleTemplate) setTitle(template.titleTemplate);
    if (template.descriptionTemplate) setDescription(template.descriptionTemplate);
    if (template.defaultPriority) setPriority(template.defaultPriority);
    if (template.defaultCustomerId) {
      setCustomerId(template.defaultCustomerId);
      if (template.defaultProjectId) {
        setProjectId(template.defaultProjectId);
      }
    }

    // Track template usage
    try {
      await ticketsApi.useTemplate(templateId);
    } catch (err) {
      // Non-critical, just log
      console.error('Failed to track template usage:', err);
    }
  };

  // Filter projects based on selected customer
  const filteredProjects = customerId
    ? projects.filter(p => p.customerId === customerId && p.isActive)
    : [];

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || 'Allgemein';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, TicketTemplate[]>);

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
      setSelectedTemplateId('');
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
      <div className="relative bg-white dark:bg-dark-100 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Neues Ticket</h2>
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            size="md"
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Template Selector */}
            {templates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  <span className="flex items-center gap-2">
                    <FileText size={16} />
                    Vorlage (optional)
                  </span>
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  disabled={loadingTemplates}
                >
                  <option value="">
                    {loadingTemplates ? 'Lade Vorlagen...' : 'Vorlage wählen...'}
                  </option>
                  {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                    <optgroup key={category} label={category}>
                      {categoryTemplates.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Kunde *
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setProjectId(''); // Reset project when customer changes
                }}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Projekt (optional)
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!customerId || filteredProjects.length === 0}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Titel *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Kurze Beschreibung des Problems"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                        : 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 hover:bg-gray-200 dark:hover:bg-dark-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Beschreibung
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Detaillierte Beschreibung des Problems oder der Anfrage..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                fullWidth
                onClick={onClose}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                icon={<Save size={20} />}
                loading={submitting}
                disabled={!customerId || !title.trim()}
              >
                {submitting ? 'Erstelle...' : 'Erstellen'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
