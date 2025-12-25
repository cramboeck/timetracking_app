/**
 * Tickets API
 * Handles tickets, knowledge base, tags, SLA, and related features
 */

import {
  Ticket,
  TicketComment,
  TicketStatus,
  TicketPriority,
  TicketResolutionType,
  TicketTask,
  TicketTaskWithInfo,
  SlaPolicy,
  CustomerContact,
  TimeEntry,
} from '../../types';
import { API_BASE_URL, authFetch, handleResponse } from './base';

// Ticket Dashboard type
export interface TicketDashboardData {
  stats: {
    open_count: number;
    in_progress_count: number;
    waiting_count: number;
    resolved_count: number;
    closed_count: number;
    critical_count: number;
    high_priority_count: number;
    total_count: number;
  };
  recentTickets: Ticket[];
  overdue: Ticket[];
  slaAtRisk: Ticket[];
}

// Canned Response type
export interface CannedResponse {
  id: string;
  userId: string;
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// Ticket Tag type
export interface TicketTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
}

// Ticket Activity type
export interface TicketActivity {
  id: string;
  ticketId: string;
  userId: string;
  userName: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  details?: any;
  createdAt: string;
}

// Ticket Attachment type
export interface TicketAttachment {
  id: string;
  ticketId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName?: string;
  url: string;
  createdAt: string;
}

// Tickets API
export const ticketsApi = {
  getAll: async (filters?: { status?: TicketStatus; customerId?: string; priority?: TicketPriority }): Promise<{ success: boolean; data: Ticket[] }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.priority) params.append('priority', filters.priority);
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/tickets${query}`);
  },

  getStats: async (): Promise<{ success: boolean; data: {
    open_count: number;
    in_progress_count: number;
    waiting_count: number;
    resolved_count: number;
    closed_count: number;
    critical_count: number;
    high_priority_count: number;
    total_count: number;
  }}> => {
    return authFetch('/tickets/stats');
  },

  getDashboard: async (): Promise<{ success: boolean; data: TicketDashboardData }> => {
    return authFetch('/tickets/dashboard');
  },

  getById: async (id: string): Promise<{ success: boolean; data: Ticket & { comments: TicketComment[]; timeEntries: TimeEntry[] } }> => {
    return authFetch(`/tickets/${id}`);
  },

  create: async (ticket: {
    customerId: string;
    projectId?: string;
    title: string;
    description?: string;
    priority?: TicketPriority;
  }): Promise<{ success: boolean; data: Ticket }> => {
    return authFetch('/tickets', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });
  },

  update: async (id: string, updates: Partial<{
    customerId: string;
    projectId: string | null;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    assignedToUserId: string | null;
    solution: string;
    resolutionType: TicketResolutionType;
  }>): Promise<{ success: boolean; data: Ticket; requiresSolution?: boolean }> => {
    return authFetch(`/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/tickets/${id}`, { method: 'DELETE' });
  },

  addComment: async (ticketId: string, content: string, isInternal?: boolean): Promise<{ success: boolean; data: TicketComment }> => {
    return authFetch(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, isInternal }),
    });
  },

  merge: async (targetTicketId: string, sourceTicketIds: string[]): Promise<{ success: boolean; message: string; data: Ticket; mergedCount: number }> => {
    return authFetch(`/tickets/${targetTicketId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ sourceTicketIds }),
    });
  },

  // Customer Contacts
  getContacts: async (customerId: string): Promise<{ success: boolean; data: CustomerContact[] }> => {
    return authFetch(`/customers/${customerId}/contacts`);
  },

  createContact: async (customerId: string, contact: {
    name: string;
    email: string;
    isPrimary?: boolean;
    canCreateTickets?: boolean;
    canViewAllTickets?: boolean;
    canViewDevices?: boolean;
    canViewInvoices?: boolean;
    canViewQuotes?: boolean;
    notifyTicketCreated?: boolean;
    notifyTicketStatusChanged?: boolean;
    notifyTicketReply?: boolean;
  }): Promise<{ success: boolean; data: CustomerContact }> => {
    return authFetch(`/customers/${customerId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(contact),
    });
  },

  updateContact: async (customerId: string, contactId: string, updates: {
    name?: string;
    email?: string;
    isPrimary?: boolean;
    canCreateTickets?: boolean;
    canViewAllTickets?: boolean;
    canViewDevices?: boolean;
    canViewInvoices?: boolean;
    canViewQuotes?: boolean;
    notifyTicketCreated?: boolean;
    notifyTicketStatusChanged?: boolean;
    notifyTicketReply?: boolean;
  }): Promise<{ success: boolean; data: CustomerContact }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteContact: async (customerId: string, contactId: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE' });
  },

  sendContactInvite: async (customerId: string, contactId: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}/send-invite`, { method: 'POST' });
  },

  setContactPassword: async (customerId: string, contactId: string, password: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}/set-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  // Canned Responses
  getCannedResponses: async (category?: string): Promise<{ success: boolean; data: CannedResponse[] }> => {
    const params = category ? `?category=${category}` : '';
    return authFetch(`/tickets/canned-responses/list${params}`);
  },

  createCannedResponse: async (data: { title: string; content: string; shortcut?: string; category?: string }): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch('/tickets/canned-responses', { method: 'POST', body: JSON.stringify(data) });
  },

  updateCannedResponse: async (id: string, data: { title?: string; content?: string; shortcut?: string; category?: string }): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch(`/tickets/canned-responses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteCannedResponse: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/canned-responses/${id}`, { method: 'DELETE' });
  },

  useCannedResponse: async (id: string): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch(`/tickets/canned-responses/${id}/use`, { method: 'POST' });
  },

  seedDefaultCannedResponses: async (): Promise<{ success: boolean; message: string; seeded: boolean; count?: number }> => {
    return authFetch('/tickets/canned-responses/seed-defaults', { method: 'POST' });
  },

  // Tags
  getTags: async (): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch('/tickets/tags/list');
  },

  createTag: async (data: { name: string; color?: string }): Promise<{ success: boolean; data: TicketTag }> => {
    return authFetch('/tickets/tags', { method: 'POST', body: JSON.stringify(data) });
  },

  updateTag: async (id: string, data: { name?: string; color?: string }): Promise<{ success: boolean; data: TicketTag }> => {
    return authFetch(`/tickets/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteTag: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/tags/${id}`, { method: 'DELETE' });
  },

  getTicketTags: async (ticketId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags`);
  },

  addTagToTicket: async (ticketId: string, tagId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags/${tagId}`, { method: 'POST' });
  },

  removeTagFromTicket: async (ticketId: string, tagId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags/${tagId}`, { method: 'DELETE' });
  },

  // Activities
  getActivities: async (ticketId: string, limit?: number, offset?: number): Promise<{ success: boolean; data: TicketActivity[] }> => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/tickets/${ticketId}/activities${query}`);
  },

  // Search
  search: async (query: string, filters?: { status?: TicketStatus; priority?: TicketPriority; customerId?: string; limit?: number }): Promise<{ success: boolean; data: Ticket[] }> => {
    const params = new URLSearchParams();
    params.append('q', query);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.customerId) params.append('customerId', filters.customerId);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    return authFetch(`/tickets/search/query?${params.toString()}`);
  },

  // SLA Policies
  getSlaPolices: async (): Promise<{ success: boolean; data: SlaPolicy[] }> => {
    return authFetch('/tickets/sla/policies');
  },

  createSlaPolicy: async (policy: { name: string; description?: string; priority: 'low' | 'normal' | 'high' | 'critical' | 'all'; firstResponseMinutes: number; resolutionMinutes: number; businessHoursOnly?: boolean; isDefault?: boolean }): Promise<{ success: boolean; data: SlaPolicy }> => {
    return authFetch('/tickets/sla/policies', { method: 'POST', body: JSON.stringify(policy) });
  },

  updateSlaPolicy: async (id: string, updates: { name?: string; description?: string; priority?: 'low' | 'normal' | 'high' | 'critical' | 'all'; firstResponseMinutes?: number; resolutionMinutes?: number; businessHoursOnly?: boolean; isActive?: boolean; isDefault?: boolean }): Promise<{ success: boolean; data: SlaPolicy }> => {
    return authFetch(`/tickets/sla/policies/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  deleteSlaPolicy: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/sla/policies/${id}`, { method: 'DELETE' });
  },

  applySlaToTicket: async (ticketId: string): Promise<{ success: boolean; data: Ticket }> => {
    return authFetch(`/tickets/sla/apply/${ticketId}`, { method: 'POST' });
  },

  // Attachments
  getAttachments: async (ticketId: string): Promise<{ success: boolean; data: TicketAttachment[] }> => {
    return authFetch(`/tickets/${ticketId}/attachments`);
  },

  uploadAttachments: async (ticketId: string, formData: FormData): Promise<{ success: boolean; data: TicketAttachment[] }> => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload attachments');
    return response.json();
  },

  deleteAttachment: async (ticketId: string, attachmentId: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/${ticketId}/attachments/${attachmentId}`, { method: 'DELETE' });
  },

  // Tasks
  getTasks: async (ticketId: string): Promise<{ success: boolean; data: TicketTask[] }> => {
    return authFetch(`/tickets/${ticketId}/tasks`);
  },

  createTask: async (ticketId: string, data: { title: string; visibleToCustomer?: boolean; assignedTo?: string | null; dueDate?: string | null; description?: string | null }): Promise<{ success: boolean; data: TicketTask }> => {
    return authFetch(`/tickets/${ticketId}/tasks`, { method: 'POST', body: JSON.stringify(data) });
  },

  updateTask: async (ticketId: string, taskId: string, updates: { title?: string; completed?: boolean; visibleToCustomer?: boolean; assignedTo?: string | null; dueDate?: string | null; description?: string | null }): Promise<{ success: boolean; data: TicketTask }> => {
    return authFetch(`/tickets/${ticketId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  reorderTasks: async (ticketId: string, taskIds: string[]): Promise<{ success: boolean; data: TicketTask[] }> => {
    return authFetch(`/tickets/${ticketId}/tasks/reorder`, { method: 'PUT', body: JSON.stringify({ taskIds }) });
  },

  deleteTask: async (ticketId: string, taskId: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/${ticketId}/tasks/${taskId}`, { method: 'DELETE' });
  },

  getAllTasks: async (filters?: { status?: 'open' | 'completed' | 'all'; customerId?: string }): Promise<{ success: boolean; data: TicketTaskWithInfo[] }> => {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.customerId) params.append('customerId', filters.customerId);
    const queryString = params.toString();
    return authFetch(`/tickets/tasks/all${queryString ? `?${queryString}` : ''}`);
  },
};

// Knowledge Base types
export interface KbCategory {
  id: string;
  userId: string;
  name: string;
  description?: string;
  icon: string;
  sortOrder: number;
  isPublic: boolean;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticle {
  id: string;
  userId: string;
  categoryId?: string;
  categoryName?: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  isPublished: boolean;
  isFeatured: boolean;
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// Knowledge Base API (admin)
export const knowledgeBaseApi = {
  getCategories: async (): Promise<{ success: boolean; data: KbCategory[] }> => {
    return authFetch('/knowledge-base/categories');
  },

  createCategory: async (data: { name: string; description?: string; icon?: string; sortOrder?: number; isPublic?: boolean }): Promise<{ success: boolean; data: KbCategory }> => {
    return authFetch('/knowledge-base/categories', { method: 'POST', body: JSON.stringify(data) });
  },

  updateCategory: async (id: string, data: Partial<KbCategory>): Promise<{ success: boolean; data: KbCategory }> => {
    return authFetch(`/knowledge-base/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteCategory: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/knowledge-base/categories/${id}`, { method: 'DELETE' });
  },

  getArticles: async (filters?: { categoryId?: string; published?: boolean }): Promise<{ success: boolean; data: KbArticle[] }> => {
    const params = new URLSearchParams();
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.published !== undefined) params.append('published', String(filters.published));
    return authFetch(`/knowledge-base/articles?${params.toString()}`);
  },

  getArticle: async (id: string): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch(`/knowledge-base/articles/${id}`);
  },

  createArticle: async (data: { categoryId?: string; title: string; content: string; excerpt?: string; isPublished?: boolean; isFeatured?: boolean }): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch('/knowledge-base/articles', { method: 'POST', body: JSON.stringify(data) });
  },

  updateArticle: async (id: string, data: Partial<KbArticle>): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch(`/knowledge-base/articles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  deleteArticle: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/knowledge-base/articles/${id}`, { method: 'DELETE' });
  },
};

// Portal Settings type
export interface PortalSettings {
  id?: string;
  userId?: string;
  companyName: string | null;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  showKnowledgeBase: boolean;
  requireLoginForKb?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Public Knowledge Base API (portal)
export const publicKbApi = {
  getKnowledgeBase: async (userId: string): Promise<{ success: boolean; data: { categories: KbCategory[]; featuredArticles: KbArticle[]; recentArticles: KbArticle[] } }> => {
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}`);
    return handleResponse(response);
  },

  getArticles: async (userId: string, filters?: { categoryId?: string; search?: string }): Promise<{ success: boolean; data: KbArticle[] }> => {
    const params = new URLSearchParams();
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.search) params.append('search', filters.search);
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}/articles?${params.toString()}`);
    return handleResponse(response);
  },

  getArticle: async (userId: string, slug: string): Promise<{ success: boolean; data: KbArticle }> => {
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}/articles/${slug}`);
    return handleResponse(response);
  },

  sendFeedback: async (userId: string, slug: string, helpful: boolean): Promise<{ success: boolean; data: { helpfulYes: number; helpfulNo: number } }> => {
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}/articles/${slug}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ helpful }),
    });
    return handleResponse(response);
  },

  getSettings: async (userId: string): Promise<{ success: boolean; data: PortalSettings }> => {
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}/settings`);
    return handleResponse(response);
  },
};
