import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, MessageSquare, Save, X, Clock, Download, Info } from 'lucide-react';
import { ticketsApi, CannedResponse, TicketTag } from '../services/api';
import { SlaPolicy } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#1f2937'
];

export const TicketSettings = () => {
  const [activeSection, setActiveSection] = useState<'tags' | 'responses' | 'sla'>('tags');

  // Tags State
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [editingTag, setEditingTag] = useState<TicketTag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [tagToDelete, setTagToDelete] = useState<TicketTag | null>(null);

  // Canned Responses State
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(true);
  const [editingResponse, setEditingResponse] = useState<CannedResponse | null>(null);
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [responseTitle, setResponseTitle] = useState('');
  const [responseContent, setResponseContent] = useState('');
  const [responseShortcut, setResponseShortcut] = useState('');
  const [responseCategory, setResponseCategory] = useState('');
  const [responseToDelete, setResponseToDelete] = useState<CannedResponse | null>(null);
  const [seedingResponses, setSeedingResponses] = useState(false);
  const [showVariableInfo, setShowVariableInfo] = useState(false);

  // SLA Policies State
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [loadingSla, setLoadingSla] = useState(true);
  const [editingSla, setEditingSla] = useState<SlaPolicy | null>(null);
  const [showSlaForm, setShowSlaForm] = useState(false);
  const [slaName, setSlaName] = useState('');
  const [slaDescription, setSlaDescription] = useState('');
  const [slaPriority, setSlaPriority] = useState<'low' | 'normal' | 'high' | 'critical' | 'all'>('all');
  const [slaFirstResponseMinutes, setSlaFirstResponseMinutes] = useState(60);
  const [slaResolutionMinutes, setSlaResolutionMinutes] = useState(480);
  const [slaBusinessHoursOnly, setSlaBusinessHoursOnly] = useState(false);
  const [slaIsDefault, setSlaIsDefault] = useState(false);
  const [slaToDelete, setSlaToDelete] = useState<SlaPolicy | null>(null);

  useEffect(() => {
    loadTags();
    loadResponses();
    loadSlaPolicies();
  }, []);

  const loadTags = async () => {
    try {
      setLoadingTags(true);
      const response = await ticketsApi.getTags();
      setTags(response.data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  const loadResponses = async () => {
    try {
      setLoadingResponses(true);
      const response = await ticketsApi.getCannedResponses();
      setResponses(response.data);
    } catch (err) {
      console.error('Failed to load canned responses:', err);
    } finally {
      setLoadingResponses(false);
    }
  };

  const loadSlaPolicies = async () => {
    try {
      setLoadingSla(true);
      const response = await ticketsApi.getSlaPolices();
      setSlaPolicies(response.data);
    } catch (err) {
      console.error('Failed to load SLA policies:', err);
    } finally {
      setLoadingSla(false);
    }
  };

  // Tag handlers
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const response = await ticketsApi.createTag({ name: newTagName.trim(), color: newTagColor });
      setTags(prev => [...prev, response.data]);
      setNewTagName('');
      setNewTagColor(TAG_COLORS[0]);
    } catch (err: any) {
      alert(err.message || 'Fehler beim Erstellen des Tags');
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !newTagName.trim()) return;
    try {
      const response = await ticketsApi.updateTag(editingTag.id, { name: newTagName.trim(), color: newTagColor });
      setTags(prev => prev.map(t => t.id === editingTag.id ? response.data : t));
      setEditingTag(null);
      setNewTagName('');
      setNewTagColor(TAG_COLORS[0]);
    } catch (err: any) {
      alert(err.message || 'Fehler beim Aktualisieren des Tags');
    }
  };

  const handleDeleteTag = async () => {
    if (!tagToDelete) return;
    try {
      await ticketsApi.deleteTag(tagToDelete.id);
      setTags(prev => prev.filter(t => t.id !== tagToDelete.id));
      setTagToDelete(null);
    } catch (err) {
      alert('Fehler beim Löschen des Tags');
    }
  };

  const startEditTag = (tag: TicketTag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
  };

  const cancelEditTag = () => {
    setEditingTag(null);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
  };

  // Canned Response handlers
  const handleSaveResponse = async () => {
    if (!responseTitle.trim() || !responseContent.trim()) {
      alert('Titel und Inhalt sind erforderlich');
      return;
    }
    try {
      if (editingResponse) {
        const response = await ticketsApi.updateCannedResponse(editingResponse.id, {
          title: responseTitle.trim(),
          content: responseContent.trim(),
          shortcut: responseShortcut.trim() || undefined,
          category: responseCategory.trim() || undefined,
        });
        setResponses(prev => prev.map(r => r.id === editingResponse.id ? response.data : r));
      } else {
        const response = await ticketsApi.createCannedResponse({
          title: responseTitle.trim(),
          content: responseContent.trim(),
          shortcut: responseShortcut.trim() || undefined,
          category: responseCategory.trim() || undefined,
        });
        setResponses(prev => [...prev, response.data]);
      }
      resetResponseForm();
    } catch (err: any) {
      alert(err.message || 'Fehler beim Speichern');
    }
  };

  const handleDeleteResponse = async () => {
    if (!responseToDelete) return;
    try {
      await ticketsApi.deleteCannedResponse(responseToDelete.id);
      setResponses(prev => prev.filter(r => r.id !== responseToDelete.id));
      setResponseToDelete(null);
    } catch (err) {
      alert('Fehler beim Löschen');
    }
  };

  const startEditResponse = (response: CannedResponse) => {
    setEditingResponse(response);
    setResponseTitle(response.title);
    setResponseContent(response.content);
    setResponseShortcut(response.shortcut || '');
    setResponseCategory(response.category || '');
    setShowResponseForm(true);
  };

  const resetResponseForm = () => {
    setEditingResponse(null);
    setResponseTitle('');
    setResponseContent('');
    setResponseShortcut('');
    setResponseCategory('');
    setShowResponseForm(false);
  };

  const handleSeedDefaultResponses = async () => {
    try {
      setSeedingResponses(true);
      const result = await ticketsApi.seedDefaultCannedResponses();
      if (result.seeded) {
        await loadResponses();
        alert(`${result.count} Standard-Vorlagen wurden erstellt!`);
      } else {
        alert(result.message);
      }
    } catch (err) {
      alert('Fehler beim Erstellen der Vorlagen');
    } finally {
      setSeedingResponses(false);
    }
  };

  // SLA handlers
  const handleSaveSla = async () => {
    if (!slaName.trim()) {
      alert('Name ist erforderlich');
      return;
    }
    try {
      if (editingSla) {
        const response = await ticketsApi.updateSlaPolicy(editingSla.id, {
          name: slaName.trim(),
          description: slaDescription.trim() || undefined,
          priority: slaPriority,
          firstResponseMinutes: slaFirstResponseMinutes,
          resolutionMinutes: slaResolutionMinutes,
          businessHoursOnly: slaBusinessHoursOnly,
          isDefault: slaIsDefault,
        });
        setSlaPolicies(prev => prev.map(p => p.id === editingSla.id ? response.data : p));
      } else {
        const response = await ticketsApi.createSlaPolicy({
          name: slaName.trim(),
          description: slaDescription.trim() || undefined,
          priority: slaPriority,
          firstResponseMinutes: slaFirstResponseMinutes,
          resolutionMinutes: slaResolutionMinutes,
          businessHoursOnly: slaBusinessHoursOnly,
          isDefault: slaIsDefault,
        });
        setSlaPolicies(prev => [...prev, response.data]);
      }
      resetSlaForm();
    } catch (err: any) {
      alert(err.message || 'Fehler beim Speichern');
    }
  };

  const handleDeleteSla = async () => {
    if (!slaToDelete) return;
    try {
      await ticketsApi.deleteSlaPolicy(slaToDelete.id);
      setSlaPolicies(prev => prev.filter(p => p.id !== slaToDelete.id));
      setSlaToDelete(null);
    } catch (err) {
      alert('Fehler beim Löschen');
    }
  };

  const startEditSla = (policy: SlaPolicy) => {
    setEditingSla(policy);
    setSlaName(policy.name);
    setSlaDescription(policy.description || '');
    setSlaPriority(policy.priority);
    setSlaFirstResponseMinutes(policy.firstResponseMinutes);
    setSlaResolutionMinutes(policy.resolutionMinutes);
    setSlaBusinessHoursOnly(policy.businessHoursOnly);
    setSlaIsDefault(policy.isDefault);
    setShowSlaForm(true);
  };

  const resetSlaForm = () => {
    setEditingSla(null);
    setSlaName('');
    setSlaDescription('');
    setSlaPriority('all');
    setSlaFirstResponseMinutes(60);
    setSlaResolutionMinutes(480);
    setSlaBusinessHoursOnly(false);
    setSlaIsDefault(false);
    setShowSlaForm(false);
  };

  const formatMinutesToTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} Std.`;
    return `${hours} Std. ${mins} Min.`;
  };

  const priorityLabels: Record<string, string> = {
    low: 'Niedrig',
    normal: 'Normal',
    high: 'Hoch',
    critical: 'Kritisch',
    all: 'Alle Prioritäten',
  };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveSection('tags')}
          className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'tags'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Tag size={18} />
          Tags
        </button>
        <button
          onClick={() => setActiveSection('responses')}
          className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'responses'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <MessageSquare size={18} />
          Textbausteine
        </button>
        <button
          onClick={() => setActiveSection('sla')}
          className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'sla'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          <Clock size={18} />
          SLA-Richtlinien
        </button>
      </div>

      {/* Tags Section */}
      {activeSection === 'tags' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tags helfen dir, Tickets zu kategorisieren und schneller zu finden.
          </p>

          {/* Create/Edit Tag Form */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (editingTag ? handleUpdateTag() : handleCreateTag())}
              placeholder="Tag Name..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  className={`w-6 h-6 rounded-full ${newTagColor === color ? 'ring-2 ring-offset-2 ring-accent-primary' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            {editingTag ? (
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateTag}
                  disabled={!newTagName.trim()}
                  className="flex items-center gap-1 px-3 py-2 btn-accent rounded-lg disabled:opacity-50"
                >
                  <Save size={16} />
                  Speichern
                </button>
                <button
                  onClick={cancelEditTag}
                  className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                className="flex items-center gap-1 px-3 py-2 btn-accent rounded-lg disabled:opacity-50"
              >
                <Plus size={16} />
                Erstellen
              </button>
            )}
          </div>

          {/* Tags List */}
          {loadingTags ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Noch keine Tags erstellt
            </div>
          ) : (
            <div className="grid gap-2">
              {tags.map(tag => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">{tag.name}</span>
                    {tag.ticket_count !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {tag.ticket_count} Tickets
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditTag(tag)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setTagToDelete(tag)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canned Responses Section */}
      {activeSection === 'responses' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Textbausteine für häufig verwendete Antworten in Ticket-Kommentaren.
            </p>
            {!showResponseForm && (
              <div className="flex items-center gap-2">
                {responses.length === 0 && (
                  <button
                    onClick={handleSeedDefaultResponses}
                    disabled={seedingResponses}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {seedingResponses ? 'Lädt...' : 'Standard-Vorlagen laden'}
                  </button>
                )}
                <button
                  onClick={() => setShowResponseForm(true)}
                  className="flex items-center gap-2 px-3 py-2 btn-accent rounded-lg"
                >
                  <Plus size={16} />
                  Neuer Textbaustein
                </button>
              </div>
            )}
          </div>

          {/* Variable Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <button
              onClick={() => setShowVariableInfo(!showVariableInfo)}
              className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium w-full"
            >
              <Info size={18} />
              Verfügbare Variablen
              <span className="ml-auto text-xs">{showVariableInfo ? '▲' : '▼'}</span>
            </button>
            {showVariableInfo && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{customer_name}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Name des Kunden</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{ticket_number}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Ticketnummer (z.B. TKT-000001)</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{ticket_title}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Titel des Tickets</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{status}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Aktueller Status</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{priority}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Priorität</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{current_date}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Heutiges Datum</div>
                <div className="font-mono text-blue-600 dark:text-blue-400">{'{{current_time}}'}</div>
                <div className="text-gray-600 dark:text-gray-400">Aktuelle Uhrzeit</div>
              </div>
            )}
          </div>

          {/* Create/Edit Response Form */}
          {showResponseForm && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Titel *
                  </label>
                  <input
                    type="text"
                    value={responseTitle}
                    onChange={(e) => setResponseTitle(e.target.value)}
                    placeholder="z.B. Begrüßung"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Kürzel (optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">/</span>
                    <input
                      type="text"
                      value={responseShortcut}
                      onChange={(e) => setResponseShortcut(e.target.value.replace(/\s/g, ''))}
                      placeholder="hi"
                      className="w-full pl-6 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Inhalt *
                </label>
                <textarea
                  value={responseContent}
                  onChange={(e) => setResponseContent(e.target.value)}
                  placeholder="Der Text, der eingefügt werden soll..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kategorie (optional)
                </label>
                <input
                  type="text"
                  value={responseCategory}
                  onChange={(e) => setResponseCategory(e.target.value)}
                  placeholder="z.B. Allgemein, Support, Abschluss"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetResponseForm}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveResponse}
                  disabled={!responseTitle.trim() || !responseContent.trim()}
                  className="flex items-center gap-2 px-4 py-2 btn-accent rounded-lg disabled:opacity-50"
                >
                  <Save size={16} />
                  {editingResponse ? 'Aktualisieren' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {/* Responses List */}
          {loadingResponses ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
            </div>
          ) : responses.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Noch keine Textbausteine erstellt
            </div>
          ) : (
            <div className="grid gap-3">
              {responses.map(response => (
                <div
                  key={response.id}
                  className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {response.title}
                        </span>
                        {response.shortcut && (
                          <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                            /{response.shortcut}
                          </span>
                        )}
                        {response.category && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                            {response.category}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap line-clamp-2">
                        {response.content}
                      </p>
                      <div className="mt-2 text-xs text-gray-400">
                        {response.usage_count} mal verwendet
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => startEditResponse(response)}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setResponseToDelete(response)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SLA Section */}
      {activeSection === 'sla' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              SLA-Richtlinien definieren die Reaktions- und Lösungszeiten für Tickets basierend auf ihrer Priorität.
            </p>
            {!showSlaForm && (
              <button
                onClick={() => setShowSlaForm(true)}
                className="flex items-center gap-2 px-3 py-2 btn-accent rounded-lg"
              >
                <Plus size={16} />
                Neue SLA-Richtlinie
              </button>
            )}
          </div>

          {/* Create/Edit SLA Form */}
          {showSlaForm && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={slaName}
                    onChange={(e) => setSlaName(e.target.value)}
                    placeholder="z.B. Standard-SLA"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Priorität
                  </label>
                  <select
                    value={slaPriority}
                    onChange={(e) => setSlaPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="all">Alle Prioritäten</option>
                    <option value="critical">Kritisch</option>
                    <option value="high">Hoch</option>
                    <option value="normal">Normal</option>
                    <option value="low">Niedrig</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Beschreibung (optional)
                </label>
                <input
                  type="text"
                  value={slaDescription}
                  onChange={(e) => setSlaDescription(e.target.value)}
                  placeholder="Kurze Beschreibung dieser SLA-Richtlinie"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Erste Antwort in (Minuten)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slaFirstResponseMinutes}
                    onChange={(e) => setSlaFirstResponseMinutes(parseInt(e.target.value) || 60)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    = {formatMinutesToTime(slaFirstResponseMinutes)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Lösung in (Minuten)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slaResolutionMinutes}
                    onChange={(e) => setSlaResolutionMinutes(parseInt(e.target.value) || 480)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    = {formatMinutesToTime(slaResolutionMinutes)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={slaIsDefault}
                    onChange={(e) => setSlaIsDefault(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Standard-Richtlinie</span>
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetSlaForm}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveSla}
                  disabled={!slaName.trim()}
                  className="flex items-center gap-2 px-4 py-2 btn-accent rounded-lg disabled:opacity-50"
                >
                  <Save size={16} />
                  {editingSla ? 'Aktualisieren' : 'Speichern'}
                </button>
              </div>
            </div>
          )}

          {/* SLA List */}
          {loadingSla ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
            </div>
          ) : slaPolicies.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Noch keine SLA-Richtlinien erstellt. SLA-Richtlinien helfen dir, Reaktionszeiten zu überwachen.
            </div>
          ) : (
            <div className="grid gap-3">
              {slaPolicies.map(policy => (
                <div
                  key={policy.id}
                  className={`p-4 bg-white dark:bg-gray-800 border rounded-lg ${
                    policy.isActive
                      ? 'border-gray-200 dark:border-gray-700'
                      : 'border-gray-200 dark:border-gray-700 opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {policy.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                          {priorityLabels[policy.priority]}
                        </span>
                        {policy.isDefault && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                            Standard
                          </span>
                        )}
                        {!policy.isActive && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                            Inaktiv
                          </span>
                        )}
                      </div>
                      {policy.description && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {policy.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Antwort: {formatMinutesToTime(policy.firstResponseMinutes)}</span>
                        <span>Lösung: {formatMinutesToTime(policy.resolutionMinutes)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => startEditSla(policy)}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setSlaToDelete(policy)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Tag Confirmation */}
      <ConfirmDialog
        isOpen={!!tagToDelete}
        onClose={() => setTagToDelete(null)}
        onConfirm={handleDeleteTag}
        title="Tag löschen"
        message={`Möchtest du den Tag "${tagToDelete?.name}" wirklich löschen? Er wird von allen Tickets entfernt.`}
        confirmText="Löschen"
        variant="danger"
      />

      {/* Delete Response Confirmation */}
      <ConfirmDialog
        isOpen={!!responseToDelete}
        onClose={() => setResponseToDelete(null)}
        onConfirm={handleDeleteResponse}
        title="Textbaustein löschen"
        message={`Möchtest du den Textbaustein "${responseToDelete?.title}" wirklich löschen?`}
        confirmText="Löschen"
        variant="danger"
      />

      {/* Delete SLA Confirmation */}
      <ConfirmDialog
        isOpen={!!slaToDelete}
        onClose={() => setSlaToDelete(null)}
        onConfirm={handleDeleteSla}
        title="SLA-Richtlinie löschen"
        message={`Möchtest du die SLA-Richtlinie "${slaToDelete?.name}" wirklich löschen?`}
        confirmText="Löschen"
        variant="danger"
      />
    </div>
  );
};
