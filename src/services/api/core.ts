/**
 * Core API
 * Handles customers, projects, activities, time entries, and tasks
 */

import {
  TimeEntry,
  Project,
  Customer,
  Activity,
  Task,
  TaskWithDetails,
  TaskChecklistItem,
  TaskComment,
  TaskDashboardData,
  TaskFilters,
  TaskStatus,
  TaskPriority,
  RecurrencePattern,
} from '../../types';
import { authFetch } from './base';

// Pagination metadata returned by the backend
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface EntryFilters {
  page?: number;
  limit?: number;
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  projectId?: string;
  customerId?: string; // filters via projects.customer_id
  searchText?: string; // case-insensitive ILIKE on description
}

// Team entries filters (admin/manager only)
export interface TeamEntryFilters {
  userId?: string;
  startDate?: string;
  endDate?: string;
  entryScope?: 'customer_project' | 'internal' | 'absence';
  page?: number;
  limit?: number;
}

export interface TeamMember {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  role: string;
}

export interface TeamEntryStats {
  totalDuration: number;
  projectDuration: number;
  internalDuration: number;
  absenceDuration: number;
  billableDuration: number;
  entryCount: number;
}

export interface TeamEntriesResponse {
  success: boolean;
  data: {
    entries: (TimeEntry & {
      userUsername?: string;
      userDisplayName?: string;
      projectName?: string;
      customerName?: string;
      activityName?: string;
    })[];
    members: TeamMember[];
    stats: TeamEntryStats;
  };
  pagination: PaginationMeta;
}

// Time Entries API
export const entriesApi = {
  // Legacy: fetch ALL entries without pagination (used by Dashboard, Calendar, etc.)
  // Internally passes ?all=true to the backend for backward compatibility.
  getAll: async (): Promise<{ success: boolean; data: TimeEntry[] }> => {
    return authFetch('/entries?all=true');
  },

  // Paginated fetch – use this for list views to avoid loading thousands of rows
  getPaginated: async (filters: EntryFilters = {}): Promise<{
    success: boolean;
    data: TimeEntry[];
    pagination: PaginationMeta;
  }> => {
    const params = new URLSearchParams();
    if (filters.page)       params.set('page',       String(filters.page));
    if (filters.limit)      params.set('limit',      String(filters.limit));
    if (filters.startDate)  params.set('startDate',  filters.startDate);
    if (filters.endDate)    params.set('endDate',    filters.endDate);
    if (filters.projectId)  params.set('projectId',  filters.projectId);
    if (filters.customerId) params.set('customerId', filters.customerId);
    if (filters.searchText) params.set('searchText', filters.searchText);
    const qs = params.toString();
    return authFetch(`/entries${qs ? `?${qs}` : ''}`);
  },

  // Distinct (year, month) pairs in which the current organization has entries.
  // Used to populate filter dropdowns independently of the paginated page.
  getTimeframes: async (): Promise<{
    success: boolean;
    data: { year: number; month: number }[];
  }> => {
    return authFetch('/entries/timeframes');
  },

  getById: async (id: string): Promise<{ success: boolean; data: TimeEntry }> => {
    return authFetch(`/entries/${id}`);
  },

  create: async (
    entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt'> & { clientId?: string }
  ): Promise<{
    success: boolean;
    data: TimeEntry;
    autoStoppedTimer?: { id: string; duration: number };
  }> => {
    return authFetch('/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },

  update: async (id: string, updates: Partial<Omit<TimeEntry, 'id' | 'userId' | 'createdAt'>>): Promise<{ success: boolean; data: TimeEntry }> => {
    return authFetch(`/entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/entries/${id}`, {
      method: 'DELETE',
    });
  },

  bulkUpdate: async (entryIds: string[], updates: { projectId?: string; description?: string; isBillable?: boolean; activityId?: string }): Promise<{ success: boolean; data: { updatedCount: number } }> => {
    return authFetch('/entries/bulk-update', {
      method: 'PUT',
      body: JSON.stringify({ entryIds, updates }),
    });
  },

  // Team entries (admin/manager only)
  getTeam: async (filters: TeamEntryFilters = {}): Promise<TeamEntriesResponse> => {
    const params = new URLSearchParams();
    if (filters.userId)     params.set('userId',     filters.userId);
    if (filters.startDate)  params.set('startDate',  filters.startDate);
    if (filters.endDate)    params.set('endDate',    filters.endDate);
    if (filters.entryScope) params.set('entryScope', filters.entryScope);
    if (filters.page)       params.set('page',       String(filters.page));
    if (filters.limit)      params.set('limit',      String(filters.limit));
    const qs = params.toString();
    return authFetch(`/entries/team${qs ? `?${qs}` : ''}`);
  },

  exportTeamCSV: async (filters: TeamEntryFilters = {}): Promise<Blob> => {
    const params = new URLSearchParams();
    if (filters.userId)     params.set('userId',     filters.userId);
    if (filters.startDate)  params.set('startDate',  filters.startDate);
    if (filters.endDate)    params.set('endDate',    filters.endDate);
    if (filters.entryScope) params.set('entryScope', filters.entryScope);
    const qs = params.toString();

    const response = await fetch(`${(await import('./base')).getApiBaseUrl()}/entries/team/export${qs ? `?${qs}` : ''}`, {
      headers: {
        'Authorization': `Bearer ${(await import('./base')).getAuthToken()}`,
      },
    });
    if (!response.ok) {
      throw new Error('Export failed');
    }
    return response.blob();
  },
};

// Projects API
export const projectsApi = {
  getAll: async (): Promise<{ success: boolean; data: Project[] }> => {
    return authFetch('/projects');
  },

  create: async (project: Omit<Project, 'id' | 'userId' | 'createdAt'>): Promise<{ success: boolean; data: Project }> => {
    return authFetch('/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  },

  update: async (id: string, updates: Partial<Omit<Project, 'id' | 'userId' | 'createdAt'>>): Promise<{ success: boolean; data: Project }> => {
    return authFetch(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/projects/${id}`, {
      method: 'DELETE',
    });
  },
};

// Customers API
export const customersApi = {
  getAll: async (): Promise<{ success: boolean; data: Customer[] }> => {
    return authFetch('/customers');
  },

  create: async (customer: Omit<Customer, 'id' | 'userId' | 'createdAt'>): Promise<{ success: boolean; data: Customer }> => {
    return authFetch('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },

  update: async (id: string, updates: Partial<Omit<Customer, 'id' | 'userId' | 'createdAt'>>): Promise<{ success: boolean; data: Customer }> => {
    return authFetch(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/customers/${id}`, {
      method: 'DELETE',
    });
  },

  // Vendor Hub methods
  getVendors: async (): Promise<{ success: boolean; data: Customer[] }> => {
    return authFetch('/customers/vendors/list');
  },

  getVendorHub: async (id: string): Promise<{
    success: boolean;
    data: {
      customer: Customer;
      invoices: Array<{
        id: string;
        emailId: string;
        emailSubject: string;
        senderEmail: string;
        senderName: string;
        receivedAt: string;
        attachmentCount: number;
        status: string;
        errorMessage: string | null;
        processedAt: string;
      }>;
      documents: Array<{
        id: string;
        processedInvoiceId: string;
        filename: string;
        originalFilename: string;
        mimeType: string;
        size: number;
        createdAt: string;
      }>;
      stats: {
        totalInvoices: number;
        draftInvoices: number;
        processedInvoices: number;
        failedInvoices: number;
        totalDocuments: number;
      };
    };
  }> => {
    return authFetch(`/customers/${id}/hub`);
  },

  getVendorEmails: async (id: string, maxResults = 50): Promise<{
    success: boolean;
    data: {
      emails: Array<{
        id: string;
        subject: string;
        from: { name: string; email: string };
        receivedDateTime: string;
        bodyPreview: string;
        hasAttachments: boolean;
        mailboxType: 'support' | 'invoice';
      }>;
      vendorDomain: string;
      totalFound: number;
    };
  }> => {
    return authFetch(`/customers/${id}/emails?maxResults=${maxResults}`);
  },

  // Email Domain methods for automatic ticket assignment
  getEmailDomains: async (customerId: string): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      customerId: string;
      organizationId: string;
      domain: string;
      isPrimary: boolean;
      notes?: string;
      createdAt: string;
      createdByName?: string;
    }>;
  }> => {
    return authFetch(`/customers/${customerId}/email-domains`);
  },

  addEmailDomain: async (customerId: string, data: {
    domain: string;
    isPrimary?: boolean;
    notes?: string;
  }): Promise<{
    success: boolean;
    data: {
      id: string;
      customerId: string;
      domain: string;
      isPrimary: boolean;
      notes?: string;
    };
  }> => {
    return authFetch(`/customers/${customerId}/email-domains`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteEmailDomain: async (customerId: string, domainId: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/email-domains/${domainId}`, {
      method: 'DELETE',
    });
  },

  getAllEmailDomains: async (): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      customerId: string;
      customerName: string;
      customerNumber?: string;
      domain: string;
      isPrimary: boolean;
      notes?: string;
      createdAt: string;
      createdByName?: string;
    }>;
  }> => {
    return authFetch('/customers/email-domains/all');
  },

  lookupEmailDomain: async (email: string): Promise<{
    success: boolean;
    found: boolean;
    matchType?: string;
    searchedDomain?: string;
    data?: {
      id: string;
      name: string;
      customerNumber?: string;
      domain: string;
    };
    message?: string;
  }> => {
    return authFetch(`/customers/email-domains/lookup?email=${encodeURIComponent(email)}`);
  },

  // Migration: auto-create contacts and domain mappings
  migrateContacts: async (): Promise<{
    success: boolean;
    message: string;
    stats: {
      contactsFromEmail: number;
      contactsFromTickets: number;
      domainsFromWebsite: number;
      domainsFromEmail: number;
      skippedExisting: number;
      errors: string[];
    };
  }> => {
    return authFetch('/customers/migrate-contacts', {
      method: 'POST',
    });
  },
};

// Activities API
export const activitiesApi = {
  getAll: async (): Promise<{ success: boolean; data: Activity[] }> => {
    return authFetch('/activities');
  },

  create: async (activity: Omit<Activity, 'id' | 'userId' | 'createdAt'>): Promise<{ success: boolean; data: Activity }> => {
    return authFetch('/activities', {
      method: 'POST',
      body: JSON.stringify(activity),
    });
  },

  update: async (id: string, updates: Partial<Omit<Activity, 'id' | 'userId' | 'createdAt'>>): Promise<{ success: boolean; data: Activity }> => {
    return authFetch(`/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/activities/${id}`, {
      method: 'DELETE',
    });
  },
};

// Task input types
export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  ticketId?: string | null;
  projectId?: string | null;
  customerId?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  reminderAt?: string | null;
  estimatedMinutes?: number | null;
  isRecurring?: boolean;
  recurrencePattern?: RecurrencePattern | null;
  recurrenceInterval?: number;
  recurrenceDays?: string[] | null;
  recurrenceEndDate?: string | null;
  category?: string | null;
  tags?: string[] | null;
  color?: string | null;
  checklistItems?: { title: string; completed?: boolean }[];
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  sortOrder?: number;
}

export interface SimilarTasksResponse {
  suggestedMinutes: number | null;
  similarTasks: Array<{
    id: string;
    title: string;
    category: string | null;
    estimatedMinutes: number | null;
    actualMinutes: number | null;
    trackedMinutes: number | null;
  }>;
  basedOnCount: number;
}

// Tasks API
export const tasksApi = {
  // Get all tasks with filters
  getAll: async (filters?: TaskFilters): Promise<{ success: boolean; data: Task[] }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.ticketId) params.append('ticketId', filters.ticketId);
    if (filters?.view) params.append('view', filters.view);
    if (filters?.includeCompleted) params.append('includeCompleted', 'true');
    const queryString = params.toString();
    return authFetch(`/tasks${queryString ? `?${queryString}` : ''}`);
  },

  // Get task dashboard data
  getDashboard: async (): Promise<{ success: boolean; data: TaskDashboardData }> => {
    return authFetch('/tasks/dashboard');
  },

  // Get similar tasks for time estimation
  getSimilarTasks: async (title: string, category?: string): Promise<{ success: boolean; data: SimilarTasksResponse }> => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    const queryString = params.toString();
    return authFetch(`/tasks/similar/${encodeURIComponent(title)}${queryString ? `?${queryString}` : ''}`);
  },

  // Get single task with details
  get: async (id: string): Promise<{ success: boolean; data: TaskWithDetails }> => {
    return authFetch(`/tasks/${id}`);
  },

  // Create new task
  create: async (data: CreateTaskInput): Promise<{ success: boolean; data: Task }> => {
    return authFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update task
  update: async (id: string, data: UpdateTaskInput): Promise<{ success: boolean; data: Task }> => {
    return authFetch(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete task
  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  // Checklist items
  addChecklistItem: async (taskId: string, title: string): Promise<{ success: boolean; data: TaskChecklistItem }> => {
    return authFetch(`/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  updateChecklistItem: async (taskId: string, itemId: string, data: { title?: string; completed?: boolean }): Promise<{ success: boolean; data: TaskChecklistItem }> => {
    return authFetch(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteChecklistItem: async (taskId: string, itemId: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'DELETE',
    });
  },

  // Comments
  addComment: async (taskId: string, comment: string): Promise<{ success: boolean; data: TaskComment }> => {
    return authFetch(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  // Timer operations
  startTimer: async (taskId: string): Promise<{ success: boolean; data: any }> => {
    return authFetch(`/tasks/${taskId}/start-timer`, {
      method: 'POST',
    });
  },

  stopTimer: async (taskId: string): Promise<{ success: boolean; data: any }> => {
    return authFetch(`/tasks/${taskId}/stop-timer`, {
      method: 'POST',
    });
  },
};
