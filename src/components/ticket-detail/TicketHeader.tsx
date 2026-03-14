import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Edit2, Archive, RotateCcw, Trash2, Merge, Tag, Plus, X } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { MarkdownEditor } from '../MarkdownEditor';
import {
  Ticket,
  TicketStatus,
  TicketPriority,
  TicketTag,
  statusConfig,
  priorityConfig,
} from './types';

interface TicketHeaderProps {
  ticket: Ticket;
  ticketTags: TicketTag[];
  allTags: TicketTag[];
  userRole: string | null;
  isEditing: boolean;
  editTitle: string;
  editDescription: string;
  editStatus: TicketStatus;
  editPriority: TicketPriority;
  archiving: boolean;
  onBack: () => void;
  onToggleEdit: () => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditStatusChange: (value: TicketStatus) => void;
  onEditPriorityChange: (value: TicketPriority) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRestore: () => void;
  onShowArchiveConfirm: () => void;
  onShowDeleteConfirm: () => void;
  onShowMergeDialog: () => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateTag: (name: string) => void;
}

export const TicketHeader = ({
  ticket,
  ticketTags,
  allTags,
  userRole,
  isEditing,
  editTitle,
  editDescription,
  editStatus,
  editPriority,
  archiving,
  onBack,
  onToggleEdit,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditStatusChange,
  onEditPriorityChange,
  onSaveEdit,
  onCancelEdit,
  onRestore,
  onShowArchiveConfirm,
  onShowDeleteConfirm,
  onShowMergeDialog,
  onAddTag,
  onRemoveTag,
  onCreateTag,
}: TicketHeaderProps) => {
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim());
    setNewTagName('');
  };

  return (
    <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4 mb-4">
        <IconButton
          onClick={onBack}
          icon={<ArrowLeft size={24} />}
          size="lg"
          tooltip="Zuruck"
        />
        <div className="flex-1">
          <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
            {ticket.ticketNumber}
          </span>
        </div>
        {ticket.status !== 'archived' && (
          <IconButton
            onClick={onToggleEdit}
            icon={<Edit2 size={20} />}
            size="lg"
            tooltip="Bearbeiten"
          />
        )}
        {ticket.status === 'archived' ? (
          <IconButton
            onClick={onRestore}
            disabled={archiving}
            icon={<RotateCcw size={20} />}
            variant="success"
            size="lg"
            tooltip="Wiederherstellen"
          />
        ) : (
          <>
            {/* Merge button - only for admins/owners */}
            {(userRole === 'admin' || userRole === 'owner') && (
              <IconButton
                onClick={onShowMergeDialog}
                icon={<Merge size={20} />}
                size="lg"
                tooltip="Tickets zusammenfuhren"
              />
            )}
            <IconButton
              onClick={onShowArchiveConfirm}
              icon={<Archive size={20} />}
              size="lg"
              tooltip="Archivieren"
            />
          </>
        )}
        <IconButton
          onClick={onShowDeleteConfirm}
          icon={<Trash2 size={20} />}
          variant="danger"
          size="lg"
          tooltip="Loschen"
        />
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            className="w-full px-4 py-2 text-xl font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as TicketStatus)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(statusConfig).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioritat</label>
              <select
                value={editPriority}
                onChange={(e) => onEditPriorityChange(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(priorityConfig).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSaveEdit}>
              Speichern
            </Button>
            <Button
              variant="outline"
              onClick={onCancelEdit}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {ticket.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig[ticket.status].color}`}>
              {statusConfig[ticket.status].label}
            </span>
            <span className={`text-sm font-medium ${priorityConfig[ticket.priority].color}`}>
              {priorityConfig[ticket.priority].label}
            </span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {ticketTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                <Tag size={10} />
                {tag.name}
                <button
                  onClick={() => onRemoveTag(tag.id)}
                  className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <Plus size={12} />
                Tag
              </button>
              {showTagDropdown && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                  <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateTag()}
                        placeholder="Neuer Tag..."
                        className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <IconButton
                        onClick={handleCreateTag}
                        disabled={!newTagName.trim()}
                        icon={<Plus size={14} />}
                        variant="primary"
                        size="sm"
                      />
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-1">
                    {allTags
                      .filter(tag => !ticketTags.find(t => t.id === tag.id))
                      .map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            onAddTag(tag.id);
                            setShowTagDropdown(false);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      ))}
                    {allTags.filter(tag => !ticketTags.find(t => t.id === tag.id)).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {allTags.length === 0 ? 'Keine Tags vorhanden' : 'Alle Tags zugewiesen'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
