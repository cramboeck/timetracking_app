import { useState } from 'react';
import { X, AlertTriangle, HelpCircle, Monitor, UserPlus, Settings, MoreHorizontal, ChevronRight, ArrowLeft, Laptop, Headphones, Printer, Keyboard, UserMinus, UserCog, Server, Shield, Database } from 'lucide-react';
import { customerPortalApi, PortalTicket } from '../../services/api';
import { MarkdownEditor } from '../MarkdownEditor';

interface PortalCreateTicketProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (ticket: PortalTicket) => void;
}

// Ticket categories with icons and templates
const ticketCategories = [
  {
    id: 'support',
    label: 'Support-Anfrage',
    description: 'Hilfe bei technischen Problemen',
    icon: HelpCircle,
    color: 'blue',
    templates: [
      { id: 'general', label: 'Allgemeine Anfrage', titlePrefix: '', descriptionTemplate: '' },
      { id: 'software', label: 'Software-Problem', titlePrefix: '[Software] ', descriptionTemplate: '**Betroffene Software:** \n\n**Fehlerbeschreibung:**\n\n**Fehlermeldung (falls vorhanden):**\n\n**Schritte zum Reproduzieren:**\n1. \n2. \n3. ' },
      { id: 'network', label: 'Netzwerk/Internet', titlePrefix: '[Netzwerk] ', descriptionTemplate: '**Problem:** \n\n**Betroffene Dienste:**\n\n**Seit wann besteht das Problem:**' },
      { id: 'email', label: 'E-Mail Problem', titlePrefix: '[E-Mail] ', descriptionTemplate: '**E-Mail-Adresse:** \n\n**Problem:**\n\n**Fehlermeldung:**' },
    ]
  },
  {
    id: 'hardware',
    label: 'Hardware-Anfrage',
    description: 'Neue Geräte oder Reparaturen',
    icon: Monitor,
    color: 'green',
    templates: [
      { id: 'new-device', label: 'Neues Gerät', titlePrefix: '[Hardware-Anfrage] ', descriptionTemplate: '**Gewünschtes Gerät:** \n- [ ] Laptop\n- [ ] Desktop-PC\n- [ ] Monitor\n- [ ] Anderes: \n\n**Verwendungszweck:**\n\n**Besondere Anforderungen:**\n\n**Gewünschter Liefertermin:**', icon: Laptop },
      { id: 'accessory', label: 'Zubehör', titlePrefix: '[Zubehör] ', descriptionTemplate: '**Gewünschtes Zubehör:**\n- [ ] Tastatur\n- [ ] Maus\n- [ ] Headset\n- [ ] Webcam\n- [ ] Docking Station\n- [ ] Anderes: \n\n**Für Benutzer:**\n\n**Begründung:**', icon: Keyboard },
      { id: 'repair', label: 'Reparatur/Defekt', titlePrefix: '[Defekt] ', descriptionTemplate: '**Betroffenes Gerät:**\n\n**Seriennummer (falls bekannt):**\n\n**Beschreibung des Defekts:**\n\n**Seit wann besteht das Problem:**', icon: Settings },
      { id: 'printer', label: 'Drucker', titlePrefix: '[Drucker] ', descriptionTemplate: '**Drucker-Name/Standort:**\n\n**Problem:**\n- [ ] Papierstau\n- [ ] Druckqualität\n- [ ] Verbindung\n- [ ] Neuer Drucker benötigt\n- [ ] Anderes\n\n**Details:**', icon: Printer },
    ]
  },
  {
    id: 'user',
    label: 'Benutzer-Verwaltung',
    description: 'Accounts, Zugänge, Berechtigungen',
    icon: UserPlus,
    color: 'purple',
    templates: [
      { id: 'new-user', label: 'Neuer Benutzer', titlePrefix: '[Neuer Benutzer] ', descriptionTemplate: '**Name des neuen Mitarbeiters:**\n\n**Abteilung:**\n\n**Position/Rolle:**\n\n**Startdatum:**\n\n**Benötigte Zugänge:**\n- [ ] E-Mail\n- [ ] VPN\n- [ ] Dateien/Netzlaufwerke\n- [ ] Branchensoftware: \n- [ ] Sonstiges: \n\n**Vorlage von bestehendem Benutzer (optional):**', icon: UserPlus },
      { id: 'modify-user', label: 'Benutzer ändern', titlePrefix: '[Benutzeränderung] ', descriptionTemplate: '**Betroffener Benutzer:**\n\n**Gewünschte Änderung:**\n- [ ] Neue Berechtigungen\n- [ ] Berechtigungen entfernen\n- [ ] Abteilungswechsel\n- [ ] Namensänderung\n- [ ] Passwort-Reset\n- [ ] Sonstiges\n\n**Details:**', icon: UserCog },
      { id: 'deactivate-user', label: 'Benutzer deaktivieren', titlePrefix: '[Deaktivierung] ', descriptionTemplate: '**Zu deaktivierender Benutzer:**\n\n**Grund:**\n- [ ] Kündigung\n- [ ] Abteilungswechsel\n- [ ] Temporär\n\n**Deaktivierungsdatum:**\n\n**E-Mail-Weiterleitung an:**\n\n**Datensicherung erforderlich:** [ ] Ja [ ] Nein', icon: UserMinus },
    ]
  },
  {
    id: 'change',
    label: 'Change Request',
    description: 'Geplante Systemänderungen',
    icon: Settings,
    color: 'orange',
    templates: [
      { id: 'system-change', label: 'Systemänderung', titlePrefix: '[Change] ', descriptionTemplate: '**Betroffenes System:**\n\n**Beschreibung der Änderung:**\n\n**Begründung/Nutzen:**\n\n**Auswirkungen auf andere Systeme:**\n\n**Gewünschter Zeitraum für Umsetzung:**\n\n**Rollback-Plan falls nötig:**', icon: Server },
      { id: 'security', label: 'Sicherheit', titlePrefix: '[Sicherheit] ', descriptionTemplate: '**Art der Anfrage:**\n- [ ] Firewall-Regel\n- [ ] VPN-Zugang\n- [ ] Zertifikat\n- [ ] Berechtigungen\n- [ ] Sonstiges\n\n**Details:**\n\n**Begründung:**', icon: Shield },
      { id: 'backup', label: 'Backup/Wiederherstellung', titlePrefix: '[Backup] ', descriptionTemplate: '**Art der Anfrage:**\n- [ ] Daten wiederherstellen\n- [ ] Backup-Konfiguration ändern\n- [ ] Neuer Backup-Job\n\n**Betroffene Daten/System:**\n\n**Zeitraum (bei Wiederherstellung):**\n\n**Details:**', icon: Database },
    ]
  },
  {
    id: 'other',
    label: 'Sonstiges',
    description: 'Andere Anfragen',
    icon: MoreHorizontal,
    color: 'gray',
    templates: [
      { id: 'other', label: 'Freie Anfrage', titlePrefix: '', descriptionTemplate: '' },
    ]
  },
];

const priorityOptions = [
  { value: 'low', label: 'Niedrig', description: 'Nicht dringend', color: 'text-gray-600' },
  { value: 'normal', label: 'Normal', description: 'Normale Bearbeitung', color: 'text-blue-600' },
  { value: 'high', label: 'Hoch', description: 'Schnelle Bearbeitung', color: 'text-orange-600' },
  { value: 'critical', label: 'Kritisch', description: 'System blockiert', color: 'text-red-600' },
];

const colorClasses: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-600' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400', icon: 'text-green-600' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-600' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', icon: 'text-orange-600' },
  gray: { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-400', icon: 'text-gray-600' },
};

type Step = 'category' | 'template' | 'form';

export const PortalCreateTicket = ({ isOpen, onClose, onCreated }: PortalCreateTicketProps) => {
  const [step, setStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState<typeof ticketCategories[0] | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof ticketCategories[0]['templates'][0] | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setStep('category');
    setSelectedCategory(null);
    setSelectedTemplate(null);
    setTitle('');
    setDescription('');
    setPriority('normal');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCategorySelect = (category: typeof ticketCategories[0]) => {
    setSelectedCategory(category);
    if (category.templates.length === 1) {
      // Skip template selection if only one template
      handleTemplateSelect(category.templates[0]);
    } else {
      setStep('template');
    }
  };

  const handleTemplateSelect = (template: typeof ticketCategories[0]['templates'][0]) => {
    setSelectedTemplate(template);
    setTitle(template.titlePrefix);
    setDescription(template.descriptionTemplate);
    setStep('form');
  };

  const handleBack = () => {
    if (step === 'form') {
      if (selectedCategory && selectedCategory.templates.length > 1) {
        setStep('template');
      } else {
        setStep('category');
        setSelectedCategory(null);
      }
      setSelectedTemplate(null);
      setTitle('');
      setDescription('');
    } else if (step === 'template') {
      setStep('category');
      setSelectedCategory(null);
    }
  };

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
      resetForm();
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
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {step !== 'category' && (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                {step === 'category' && 'Neues Ticket erstellen'}
                {step === 'template' && selectedCategory?.label}
                {step === 'form' && (selectedTemplate?.label || 'Ticket erstellen')}
              </h2>
              {step === 'category' && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Wählen Sie eine Kategorie
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Category Selection */}
          {step === 'category' && (
            <div className="p-4 sm:p-6 grid gap-3 sm:grid-cols-2">
              {ticketCategories.map((category) => {
                const colors = colorClasses[category.color];
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${colors.bg} ${colors.border} hover:scale-[1.02]`}
                  >
                    <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border}`}>
                      <Icon size={24} className={colors.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold ${colors.text}`}>{category.label}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
                    </div>
                    <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Template Selection */}
          {step === 'template' && selectedCategory && (
            <div className="p-4 sm:p-6 space-y-3">
              {selectedCategory.templates.map((template) => {
                const colors = colorClasses[selectedCategory.color];
                const Icon = (template as any).icon || selectedCategory.icon;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${colors.bg} ${colors.border} hover:scale-[1.01]`}
                  >
                    <div className={`p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                      <Icon size={20} className={colors.icon} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-medium ${colors.text}`}>{template.label}</h3>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 3: Form */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  <AlertTriangle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {/* Category Badge */}
              {selectedCategory && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Kategorie:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClasses[selectedCategory.color].bg} ${colorClasses[selectedCategory.color].text}`}>
                    {selectedCategory.label}
                  </span>
                  {selectedTemplate && selectedCategory.templates.length > 1 && (
                    <>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-700 dark:text-gray-300">{selectedTemplate.label}</span>
                    </>
                  )}
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
                  placeholder="Kurze Beschreibung des Anliegens"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={200}
                  autoFocus
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Priorität
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {priorityOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value as typeof priority)}
                      className={`p-2 sm:p-3 rounded-lg border text-center transition-colors ${
                        priority === opt.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className={`font-medium text-sm ${
                        priority === opt.value ? 'text-blue-600 dark:text-blue-400' : opt.color
                      }`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
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
                  rows={8}
                />
                {selectedTemplate?.descriptionTemplate && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Tipp: Füllen Sie die Vorlage aus oder ersetzen Sie den Text durch Ihre Beschreibung
                  </p>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !title.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Erstellen...' : 'Ticket erstellen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
