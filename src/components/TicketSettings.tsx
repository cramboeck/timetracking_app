import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, MessageSquare, Save, X } from 'lucide-react';
import { ticketsApi, CannedResponse, TicketTag } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#1f2937'
];

export const TicketSettings = () => {
  const [activeSection, setActiveSection] = useState<'tags' | 'responses'>('tags');

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

  useEffect(() => {
    loadTags();
    loadResponses();
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Textbausteine für häufig verwendete Antworten in Ticket-Kommentaren.
            </p>
            {!showResponseForm && (
              <button
                onClick={() => setShowResponseForm(true)}
                className="flex items-center gap-2 px-3 py-2 btn-accent rounded-lg"
              >
                <Plus size={16} />
                Neuer Textbaustein
              </button>
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
    </div>
  );
};
