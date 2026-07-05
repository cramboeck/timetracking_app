import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Edit2, Archive, RotateCcw, Trash2, Merge, Tag, Plus, X, ChevronDown, Loader2 } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
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
  saving: boolean;
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
  onQuickStatusChange: (status: TicketStatus) => void;
  onQuickPriorityChange: (priority: TicketPriority) => void;
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
  saving,
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
  onQuickStatusChange,
  onQuickPriorityChange,
}: TicketHeaderProps) => {
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setShowPriorityDropdown(false);
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
    <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-dark-border">
      <div className="flex items-center gap-4 mb-4">
        <IconButton
          onClick={onBack}
          icon={<ArrowLeft size={24} />}
          size="lg"
          tooltip="Zuruck"
        />
        <div className="flex-1">
          <span className="text-sm font-mono text-gray-500 dark:text-dark-400">
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
            className="w-full px-4 py-2 text-xl font-bold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => onEditStatusChange(e.target.value as TicketStatus)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
              >
                {Object.entries(statusConfig).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Prioritat</label>
              <select
                value={editPriority}
                onChange={(e) => onEditPriorityChange(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
              >
                {Object.entries(priorityConfig).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={onSaveEdit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Speichern...
                </>
              ) : (
                'Speichern'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onCancelEdit}
              disabled={saving}
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
            {/* Quick Status Change Dropdown */}
            <div className="relative" ref={statusDropdownRef}>
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                disabled={ticket.status === 'archived'}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-opacity ${statusConfig[ticket.status].color} ${ticket.status !== 'archived' ? 'hover:opacity-80 cursor-pointer' : 'cursor-not-allowed'}`}
              >
                {statusConfig[ticket.status].label}
                {ticket.status !== 'archived' && <ChevronDown size={12} />}
              </button>
              {showStatusDropdown && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-dark-100 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border z-50">
                  {Object.entries(statusConfig)
                    .filter(([key]) => key !== 'archived')
                    .map(([key, { label, color }]) => (
                      <button
                        key={key}
                        onClick={() => {
                          onQuickStatusChange(key as TicketStatus);
                          setShowStatusDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-dark-200 first:rounded-t-lg last:rounded-b-lg ${ticket.status === key ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${color.split(' ')[0]}`} />
                        {label}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Quick Priority Change Dropdown */}
            <div className="relative" ref={priorityDropdownRef}>
              <button
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                disabled={ticket.status === 'archived'}
                className={`inline-flex items-center gap-1 text-sm font-medium transition-opacity ${priorityConfig[ticket.priority].color} ${ticket.status !== 'archived' ? 'hover:opacity-80 cursor-pointer' : 'cursor-not-allowed'}`}
              >
                {priorityConfig[ticket.priority].label}
                {ticket.status !== 'archived' && <ChevronDown size={12} />}
              </button>
              {showPriorityDropdown && (
                <div className="absolute left-0 top-full mt-1 w-32 bg-white dark:bg-dark-100 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border z-50">
                  {Object.entries(priorityConfig).map(([key, { label, color }]) => (
                    <button
                      key={key}
                      onClick={() => {
                        onQuickPriorityChange(key as TicketPriority);
                        setShowPriorityDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-dark-200 first:rounded-t-lg last:rounded-b-lg ${ticket.priority === key ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      <span className={`${color}`}>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-500 hover:bg-gray-200 dark:hover:bg-dark-300"
              >
                <Plus size={12} />
                Tag
              </button>
              {showTagDropdown && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-dark-100 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border z-50">
                  <div className="p-2 border-b border-gray-200 dark:border-dark-border">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateTag()}
                        placeholder="Neuer Tag..."
                        className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
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
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-dark-200 rounded"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      ))}
                    {allTags.filter(tag => !ticketTags.find(t => t.id === tag.id)).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-dark-400">
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
