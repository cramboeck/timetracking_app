import { Ticket, TicketComment, TicketStatus, TicketPriority, TicketResolutionType, TicketTask, Customer, Project, TimeEntry } from '../../types';
import { TicketTag, CannedResponse, TicketActivity, TicketAttachment, TicketEmail, AISuggestion } from '../../services/api';

// Status configuration
export const statusConfig: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

// Priority configuration
export const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

// Resolution type labels
export const resolutionTypeConfig: Record<TicketResolutionType, { label: string; description: string }> = {
  solved: { label: 'Gelöst', description: 'Problem wurde behoben' },
  not_reproducible: { label: 'Nicht reproduzierbar', description: 'Problem konnte nicht nachgestellt werden' },
  duplicate: { label: 'Duplikat', description: 'Bereits in einem anderen Ticket behandelt' },
  wont_fix: { label: 'Wird nicht behoben', description: 'Absichtlich nicht behoben' },
  resolved_itself: { label: 'Hat sich erledigt', description: 'Problem hat sich von selbst gelöst' },
  workaround: { label: 'Workaround', description: 'Umgehungslösung bereitgestellt' },
};

// Shared props interface for sub-components
export interface TicketContextProps {
  ticket: Ticket;
  customers: Customer[];
  projects: Project[];
}

// Format helpers
export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')} Std`;
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatEmailDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Re-export types for convenience
export type {
  Ticket,
  TicketComment,
  TicketStatus,
  TicketPriority,
  TicketResolutionType,
  TicketTask,
  Customer,
  Project,
  TimeEntry,
  TicketTag,
  CannedResponse,
  TicketActivity,
  TicketAttachment,
  TicketEmail,
  AISuggestion,
};
