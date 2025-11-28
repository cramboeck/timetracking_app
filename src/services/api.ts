import { TimeEntry, Project, Customer, Activity, CompanyInfo, Team, TeamInvitation, Ticket, TicketComment, CustomerContact, TicketStatus, TicketPriority, SlaPolicy } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Export helper to get API base URL for file URLs
export const getApiBaseUrl = () => API_BASE_URL;

// Helper to get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Helper to handle API errors
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Helper to make authenticated requests
const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token found');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  return handleResponse(response);
};

// Auth API
export const authApi = {
  register: async (data: {
    username: string;
    email: string;
    password: string;
    accountType: 'personal' | 'business' | 'team';
    organizationName?: string;
    inviteCode?: string;
  }) => {
    console.log('🌐 [API] Calling POST /auth/register with:', data);
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    console.log('🌐 [API] Register response status:', response.status);
    const result = await handleResponse(response);
    console.log('🌐 [API] Register result:', result);

    // Store token - backend returns { data: { token, user } }
    const token = result?.data?.token || result?.token;
    console.log('🌐 [API] Extracted token:', token ? '✅ Found' : '❌ Not found', { result });

    if (token) {
      localStorage.setItem('auth_token', token);
      console.log('✅ [API] Token stored in localStorage');
    } else {
      console.error('❌ [API] No token in response!', result);
    }
    return result;
  },

  login: async (username: string, password: string) => {
    console.log('🌐 [API] Calling POST /auth/login');
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    console.log('🌐 [API] Login response status:', response.status);
    const result = await handleResponse(response);
    console.log('🌐 [API] Login result:', result);

    // Store token - backend returns { data: { token, user } }
    const token = result?.data?.token || result?.token;
    console.log('🌐 [API] Extracted token:', token ? '✅ Found' : '❌ Not found');

    if (token) {
      localStorage.setItem('auth_token', token);
      console.log('✅ [API] Token stored in localStorage');
    } else {
      console.error('❌ [API] No token in response!', result);
    }
    return result;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    console.log('🌐 [API] Calling POST /auth/change-password');
    return authFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  updateProfile: async (data: { username?: string; email?: string }) => {
    console.log('🌐 [API] Calling PATCH /auth/profile');
    return authFetch('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
  },
};

// User API
export const userApi = {
  getMe: async () => {
    return authFetch('/user/me');
  },

  updateSettings: async (settings: {
    accentColor?: string;
    grayTone?: string;
    timeRoundingInterval?: number;
    organizationName?: string;
  }) => {
    return authFetch('/user/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  getCompany: async (): Promise<CompanyInfo | null> => {
    return authFetch('/company-info');
  },

  updateCompany: async (company: {
    name: string;
    address: string;
    city: string;
    zipCode: string;
    country: string;
    email: string;
    phone?: string;
    website?: string;
    taxId?: string;
    logo?: string;
  }): Promise<CompanyInfo> => {
    return authFetch('/company-info', {
      method: 'POST',
      body: JSON.stringify(company),
    });
  },

  deleteCompany: async (): Promise<{ success: boolean }> => {
    return authFetch('/company-info', {
      method: 'DELETE',
    });
  },

  exportData: async () => {
    return authFetch('/user/export', {
      method: 'POST',
    });
  },

  deleteAccount: async () => {
    return authFetch('/user/account', {
      method: 'DELETE',
    });
  },
};

// Time Entries API
export const entriesApi = {
  getAll: async (): Promise<{ success: boolean; data: TimeEntry[] }> => {
    return authFetch('/entries');
  },

  getById: async (id: string): Promise<{ success: boolean; data: TimeEntry }> => {
    return authFetch(`/entries/${id}`);
  },

  create: async (entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt'>): Promise<{ success: boolean; data: TimeEntry }> => {
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

// Password Reset API
export const passwordResetApi = {
  requestReset: async (email: string): Promise<{ success: boolean; message: string; devToken?: string }> => {
    console.log('🔑 [API] Requesting password reset for:', email);
    const response = await fetch(`${API_BASE_URL}/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await handleResponse(response);
    console.log('🔑 [API] Password reset request result:', result);
    return result;
  },

  verifyToken: async (token: string): Promise<{ valid: boolean; error?: string }> => {
    console.log('🔑 [API] Verifying reset token');
    const response = await fetch(`${API_BASE_URL}/password-reset/verify/${token}`);
    return handleResponse(response);
  },

  resetPassword: async (token: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    console.log('🔑 [API] Resetting password with token');
    const response = await fetch(`${API_BASE_URL}/password-reset/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const result = await handleResponse(response);
    console.log('🔑 [API] Password reset result:', result);
    return result;
  },
};

// Teams API
export const teamsApi = {
  getMyTeam: async (): Promise<Team & { members: Array<{ id: string; username: string; email: string; role: string }> } | null> => {
    return authFetch('/teams/my-team');
  },

  createTeam: async (name: string): Promise<Team> => {
    return authFetch('/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  updateTeam: async (teamId: string, name: string): Promise<Team> => {
    return authFetch(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  leaveTeam: async (): Promise<{ success: boolean }> => {
    return authFetch('/teams/leave', {
      method: 'DELETE',
    });
  },

  createInvitation: async (teamId: string, role: 'admin' | 'member', expiresInHours: number = 168): Promise<TeamInvitation> => {
    return authFetch(`/teams/${teamId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ role, expiresInHours }),
    });
  },

  getInvitations: async (teamId: string): Promise<TeamInvitation[]> => {
    return authFetch(`/teams/${teamId}/invitations`);
  },

  deleteInvitation: async (invitationId: string): Promise<{ success: boolean }> => {
    return authFetch(`/teams/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },

  joinTeam: async (invitationCode: string): Promise<Team> => {
    return authFetch(`/teams/join/${invitationCode}`, {
      method: 'POST',
    });
  },
};

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
  }>): Promise<{ success: boolean; data: Ticket }> => {
    return authFetch(`/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/tickets/${id}`, {
      method: 'DELETE',
    });
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
  }): Promise<{ success: boolean; data: CustomerContact }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteContact: async (customerId: string, contactId: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}`, {
      method: 'DELETE',
    });
  },

  sendContactInvite: async (customerId: string, contactId: string): Promise<{ success: boolean }> => {
    return authFetch(`/customers/${customerId}/contacts/${contactId}/send-invite`, {
      method: 'POST',
    });
  },

  // Canned Responses (Textbausteine)
  getCannedResponses: async (category?: string): Promise<{ success: boolean; data: CannedResponse[] }> => {
    const params = category ? `?category=${category}` : '';
    return authFetch(`/tickets/canned-responses/list${params}`);
  },

  createCannedResponse: async (data: {
    title: string;
    content: string;
    shortcut?: string;
    category?: string;
  }): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch('/tickets/canned-responses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCannedResponse: async (id: string, data: {
    title?: string;
    content?: string;
    shortcut?: string;
    category?: string;
  }): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch(`/tickets/canned-responses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteCannedResponse: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/canned-responses/${id}`, {
      method: 'DELETE',
    });
  },

  useCannedResponse: async (id: string): Promise<{ success: boolean; data: CannedResponse }> => {
    return authFetch(`/tickets/canned-responses/${id}/use`, {
      method: 'POST',
    });
  },

  seedDefaultCannedResponses: async (): Promise<{ success: boolean; message: string; seeded: boolean; count?: number }> => {
    return authFetch('/tickets/canned-responses/seed-defaults', {
      method: 'POST',
    });
  },

  // Tags
  getTags: async (): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch('/tickets/tags/list');
  },

  createTag: async (data: { name: string; color?: string }): Promise<{ success: boolean; data: TicketTag }> => {
    return authFetch('/tickets/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTag: async (id: string, data: { name?: string; color?: string }): Promise<{ success: boolean; data: TicketTag }> => {
    return authFetch(`/tickets/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteTag: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/tags/${id}`, {
      method: 'DELETE',
    });
  },

  getTicketTags: async (ticketId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags`);
  },

  addTagToTicket: async (ticketId: string, tagId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags/${tagId}`, {
      method: 'POST',
    });
  },

  removeTagFromTicket: async (ticketId: string, tagId: string): Promise<{ success: boolean; data: TicketTag[] }> => {
    return authFetch(`/tickets/${ticketId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  },

  // Activities (Timeline)
  getActivities: async (ticketId: string, limit?: number, offset?: number): Promise<{ success: boolean; data: TicketActivity[] }> => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return authFetch(`/tickets/${ticketId}/activities${query}`);
  },

  // Search
  search: async (query: string, filters?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    customerId?: string;
    limit?: number;
  }): Promise<{ success: boolean; data: Ticket[] }> => {
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

  createSlaPolicy: async (policy: {
    name: string;
    description?: string;
    priority: 'low' | 'normal' | 'high' | 'critical' | 'all';
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly?: boolean;
    isDefault?: boolean;
  }): Promise<{ success: boolean; data: SlaPolicy }> => {
    return authFetch('/tickets/sla/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
  },

  updateSlaPolicy: async (id: string, updates: {
    name?: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical' | 'all';
    firstResponseMinutes?: number;
    resolutionMinutes?: number;
    businessHoursOnly?: boolean;
    isActive?: boolean;
    isDefault?: boolean;
  }): Promise<{ success: boolean; data: SlaPolicy }> => {
    return authFetch(`/tickets/sla/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  deleteSlaPolicy: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/sla/policies/${id}`, {
      method: 'DELETE',
    });
  },

  applySlaToTicket: async (ticketId: string): Promise<{ success: boolean; data: Ticket }> => {
    return authFetch(`/tickets/sla/apply/${ticketId}`, {
      method: 'POST',
    });
  },

  // Attachments
  getAttachments: async (ticketId: string): Promise<{ success: boolean; data: TicketAttachment[] }> => {
    return authFetch(`/tickets/${ticketId}/attachments`);
  },

  uploadAttachments: async (ticketId: string, formData: FormData): Promise<{ success: boolean; data: TicketAttachment[] }> => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    if (!response.ok) {
      throw new Error('Failed to upload attachments');
    }
    return response.json();
  },

  deleteAttachment: async (ticketId: string, attachmentId: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/${ticketId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
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

// Knowledge Base API (for admin)
export const knowledgeBaseApi = {
  // Categories
  getCategories: async (): Promise<{ success: boolean; data: KbCategory[] }> => {
    return authFetch('/knowledge-base/categories');
  },

  createCategory: async (data: {
    name: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
    isPublic?: boolean;
  }): Promise<{ success: boolean; data: KbCategory }> => {
    return authFetch('/knowledge-base/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory: async (id: string, data: Partial<KbCategory>): Promise<{ success: boolean; data: KbCategory }> => {
    return authFetch(`/knowledge-base/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteCategory: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/knowledge-base/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // Articles
  getArticles: async (filters?: { categoryId?: string; published?: boolean }): Promise<{ success: boolean; data: KbArticle[] }> => {
    const params = new URLSearchParams();
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.published !== undefined) params.append('published', String(filters.published));
    return authFetch(`/knowledge-base/articles?${params.toString()}`);
  },

  getArticle: async (id: string): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch(`/knowledge-base/articles/${id}`);
  },

  createArticle: async (data: {
    categoryId?: string;
    title: string;
    content: string;
    excerpt?: string;
    isPublished?: boolean;
    isFeatured?: boolean;
  }): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch('/knowledge-base/articles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateArticle: async (id: string, data: Partial<KbArticle>): Promise<{ success: boolean; data: KbArticle }> => {
    return authFetch(`/knowledge-base/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteArticle: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/knowledge-base/articles/${id}`, {
      method: 'DELETE',
    });
  },
};

// Public Knowledge Base API (for portal)
export const publicKbApi = {
  getKnowledgeBase: async (userId: string): Promise<{
    success: boolean;
    data: {
      categories: KbCategory[];
      featuredArticles: KbArticle[];
      recentArticles: KbArticle[];
    };
  }> => {
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

  getSettings: async (userId: string): Promise<{
    success: boolean;
    data: PortalSettings;
  }> => {
    const response = await fetch(`${API_BASE_URL}/knowledge-base/public/${userId}/settings`);
    return handleResponse(response);
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

// Portal Settings API (for admin)
export const portalSettingsApi = {
  getSettings: async (): Promise<{ success: boolean; data: PortalSettings }> => {
    return authFetch('/knowledge-base/portal-settings');
  },

  updateSettings: async (data: Partial<PortalSettings>): Promise<{ success: boolean; data: PortalSettings }> => {
    return authFetch('/knowledge-base/portal-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// Canned Response type
export interface CannedResponse {
  id: string;
  user_id: string;
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// Ticket Tag type
export interface TicketTag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  ticket_count?: number;
}

// Ticket Dashboard Data type
export interface TicketDashboardData {
  overview: {
    total: number;
    open: number;
    in_progress: number;
    waiting: number;
    resolved: number;
    closed: number;
    active_total: number;
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  sla: {
    responseCompliance: number;
    resolutionCompliance: number;
    responseBreached: number;
    resolutionBreached: number;
    responseOverdue: number;
    resolutionOverdue: number;
  };
  urgentTickets: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    priority: string;
    status: string;
    customerName: string;
    responseMinutesRemaining: number | null;
    resolutionMinutesRemaining: number | null;
  }>;
  recentActivity: Array<{
    id: string;
    ticketId: string;
    action: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    ticketNumber: string;
    ticketTitle: string;
    actorName: string;
  }>;
  trends: {
    ticketsThisWeek: number;
    ticketsLastWeek: number;
    resolvedThisWeek: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
  };
  topCustomers: Array<{
    id: string;
    name: string;
    color: string;
    ticketCount: number;
  }>;
}

// Ticket Activity type (for timeline)
export interface TicketActivity {
  id: string;
  ticketId: string;
  userId: string | null;
  customerContactId: string | null;
  actionType: 'created' | 'status_changed' | 'priority_changed' | 'assigned' | 'unassigned' |
    'comment_added' | 'internal_comment_added' | 'attachment_added' |
    'tag_added' | 'tag_removed' | 'title_changed' | 'description_changed' |
    'resolved' | 'closed' | 'reopened' | 'archived' | 'rating_added' | 'time_logged';
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  userName: string | null;
  contactName: string | null;
}

// Ticket Attachment type
export interface TicketAttachment {
  id: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedByName: string;
  uploadedByType: 'user' | 'customer';
  createdAt: string;
}

// Customer Portal API (for customer contacts to use)
const getPortalAuthToken = (): string | null => {
  return localStorage.getItem('portal_auth_token');
};

const portalAuthFetch = async (url: string, options: RequestInit = {}) => {
  const token = getPortalAuthToken();
  if (!token) {
    throw new Error('No portal authentication token found');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  return handleResponse(response);
};

export interface PortalContact {
  id: string;
  customerId: string;
  customerName: string;
  userId: string; // Service provider's user ID (for KB access)
  name: string;
  email: string;
  canCreateTickets: boolean;
  canViewAllTickets: boolean;
}

export interface PortalTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  customerName: string;
  projectName?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  comments?: PortalComment[];
  satisfactionRating?: number;
  satisfactionFeedback?: string;
}

export interface PortalAttachment {
  id: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedByName: string;
  createdAt: string;
}

export interface PortalComment {
  id: string;
  content: string;
  authorName: string;
  isFromCustomer: boolean;
  createdAt: string;
}

export const customerPortalApi = {
  login: async (email: string, password: string): Promise<{ success: boolean; token: string; contact: PortalContact }> => {
    const response = await fetch(`${API_BASE_URL}/customer-portal/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await handleResponse(response);

    if (result.token) {
      localStorage.setItem('portal_auth_token', result.token);
    }
    return result;
  },

  logout: () => {
    localStorage.removeItem('portal_auth_token');
  },

  getMe: async (): Promise<PortalContact> => {
    return portalAuthFetch('/customer-portal/me');
  },

  getTickets: async (status?: string): Promise<PortalTicket[]> => {
    const params = status ? `?status=${status}` : '';
    return portalAuthFetch(`/customer-portal/tickets${params}`);
  },

  getTicket: async (id: string): Promise<PortalTicket> => {
    return portalAuthFetch(`/customer-portal/tickets/${id}`);
  },

  createTicket: async (ticket: {
    title: string;
    description?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  }): Promise<PortalTicket> => {
    return portalAuthFetch('/customer-portal/tickets', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });
  },

  addComment: async (ticketId: string, content: string): Promise<PortalComment> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  setPassword: async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE_URL}/customer-portal/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    return handleResponse(response);
  },

  // Ticket actions
  closeTicket: async (ticketId: string): Promise<PortalTicket> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/close`, {
      method: 'POST',
    });
  },

  reopenTicket: async (ticketId: string): Promise<PortalTicket> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/reopen`, {
      method: 'POST',
    });
  },

  // File attachments
  getAttachments: async (ticketId: string): Promise<PortalAttachment[]> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/attachments`);
  },

  uploadAttachments: async (ticketId: string, formData: FormData): Promise<PortalAttachment[]> => {
    const token = getPortalAuthToken();
    if (!token) {
      throw new Error('No portal authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}/customer-portal/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
    });

    return handleResponse(response);
  },

  deleteAttachment: async (ticketId: string, attachmentId: string): Promise<{ success: boolean }> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  },

  // Satisfaction rating
  rateTicket: async (ticketId: string, rating: number, feedback?: string): Promise<PortalTicket> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  // Change password
  changePassword: async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    return portalAuthFetch('/customer-portal/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

// Push Notifications API
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPreferences {
  push_enabled: boolean;
  push_on_new_ticket: boolean;
  push_on_ticket_comment: boolean;
  push_on_ticket_assigned: boolean;
  push_on_status_change: boolean;
  push_on_sla_warning: boolean;
  email_enabled: boolean;
}

export interface DeviceSubscription {
  id: string;
  endpoint: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export const pushApi = {
  // Get VAPID public key for subscription
  getVapidPublicKey: async (): Promise<{ success: boolean; publicKey: string; configured: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
    return handleResponse(response);
  },

  // Subscribe device for push notifications
  subscribe: async (subscription: PushSubscription, deviceName?: string): Promise<{ success: boolean; subscriptionId?: string }> => {
    return authFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, deviceName }),
    });
  },

  // Unsubscribe device
  unsubscribe: async (endpoint: string): Promise<{ success: boolean }> => {
    return authFetch('/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  },

  // Get user's subscriptions
  getSubscriptions: async (): Promise<{ success: boolean; data: DeviceSubscription[] }> => {
    return authFetch('/push/subscriptions');
  },

  // Delete a specific subscription
  deleteSubscription: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/push/subscriptions/${id}`, {
      method: 'DELETE',
    });
  },

  // Get notification preferences
  getPreferences: async (): Promise<{ success: boolean; data: NotificationPreferences }> => {
    return authFetch('/push/preferences');
  },

  // Update notification preferences
  updatePreferences: async (preferences: Partial<NotificationPreferences>): Promise<{ success: boolean }> => {
    return authFetch('/push/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },

  // Send test notification
  sendTest: async (): Promise<{ success: boolean; sent: number; failed: number }> => {
    return authFetch('/push/test', {
      method: 'POST',
    });
  },
};

// sevDesk API Types
export interface SevdeskConfig {
  id: string;
  userId: string;
  hasToken: boolean;
  defaultHourlyRate: number;
  paymentTermsDays: number;
  taxRate: number;
  autoSyncCustomers: boolean;
  createAsFinal: boolean;
  lastSyncAt: string | null;
}

export interface SevdeskCustomer {
  id: string;
  customerNumber: string;
  name: string;
  email?: string;
}

export interface SevdeskInvoice {
  id: string;
  invoiceNumber: string;
  contact: {
    id: string;
    name: string;
  };
  invoiceDate: string;
  deliveryDate: string | null;
  status: number;
  statusName: string;
  header: string;
  headText: string | null;
  footText: string | null;
  sumNet: number;
  sumGross: number;
  sumTax: number;
  currency: string;
  positions: Array<{
    id: string;
    name: string;
    text: string | null;
    quantity: number;
    price: number;
    sumNet: number;
  }>;
}

export interface SevdeskQuote {
  id: string;
  quoteNumber: string;
  contact: {
    id: string;
    name: string;
  };
  quoteDate: string;
  status: number;
  statusName: string;
  header: string;
  headText: string | null;
  footText: string | null;
  sumNet: number;
  sumGross: number;
  currency: string;
  positions: Array<{
    id: string;
    name: string;
    text: string | null;
    quantity: number;
    price: number;
    sumNet: number;
  }>;
}

export interface DocumentSearchResult {
  id: string;
  sevdeskId: string;
  documentType: 'invoice' | 'quote';
  documentNumber: string;
  contactName: string;
  documentDate: string;
  status: number;
  statusName: string;
  header: string;
  sumGross: number;
  currency: string;
  positions: Array<{ name: string; text: string | null; quantity: number; price: number; sumNet: number }>;
  rank: number;
}

export interface BillingSummaryItem {
  customerId: string;
  customerName: string;
  hourlyRate: number | null;
  sevdeskCustomerId: string | null;
  totalSeconds: number;
  totalHours: number;
  totalAmount: number | null;
  entries: Array<{
    id: string;
    duration: number;
    description: string;
    ticketNumber?: string;
    ticketTitle?: string;
    projectName?: string;
    startTime: string;
  }>;
}

export interface InvoiceExport {
  id: string;
  customerName: string;
  sevdeskInvoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

// sevDesk API
export const sevdeskApi = {
  // Check if billing feature is enabled
  getFeatureStatus: async (): Promise<{ success: boolean; data: { billingEnabled: boolean; ninjaRmmEnabled: boolean } }> => {
    return authFetch('/sevdesk/feature-status');
  },

  // Get configuration
  getConfig: async (): Promise<{ success: boolean; data: SevdeskConfig | null }> => {
    return authFetch('/sevdesk/config');
  },

  // Save configuration
  saveConfig: async (config: Partial<Omit<SevdeskConfig, 'id' | 'userId' | 'hasToken'>> & { apiToken?: string }): Promise<{ success: boolean; data: SevdeskConfig }> => {
    return authFetch('/sevdesk/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  // Test API connection
  testConnection: async (apiToken: string): Promise<{ success: boolean; companyName?: string; error?: string }> => {
    return authFetch('/sevdesk/test-connection', {
      method: 'POST',
      body: JSON.stringify({ apiToken }),
    });
  },

  // Get sevDesk customers
  getCustomers: async (): Promise<{ success: boolean; data: SevdeskCustomer[] }> => {
    return authFetch('/sevdesk/customers');
  },

  // Link customer to sevDesk
  linkCustomer: async (customerId: string, sevdeskCustomerId: string): Promise<{ success: boolean }> => {
    return authFetch('/sevdesk/link-customer', {
      method: 'POST',
      body: JSON.stringify({ customerId, sevdeskCustomerId }),
    });
  },

  // Get billing summary
  getBillingSummary: async (startDate: string, endDate: string): Promise<{ success: boolean; data: BillingSummaryItem[] }> => {
    return authFetch(`/sevdesk/billing-summary?startDate=${startDate}&endDate=${endDate}`);
  },

  // Create invoice in sevDesk
  createInvoice: async (customerId: string, entryIds: string[], periodStart: string, periodEnd: string): Promise<{
    success: boolean;
    data: {
      exportId: string;
      invoiceId: string;
      invoiceNumber: string;
      totalHours: number;
      totalAmount: number;
    };
  }> => {
    return authFetch('/sevdesk/create-invoice', {
      method: 'POST',
      body: JSON.stringify({ customerId, entryIds, periodStart, periodEnd }),
    });
  },

  // Record export without sevDesk
  recordExport: async (customerId: string, entryIds: string[], periodStart: string, periodEnd: string, totalHours: number, totalAmount: number): Promise<{ success: boolean; data: { exportId: string } }> => {
    return authFetch('/sevdesk/record-export', {
      method: 'POST',
      body: JSON.stringify({ customerId, entryIds, periodStart, periodEnd, totalHours, totalAmount }),
    });
  },

  // Get invoice export history
  getInvoiceExports: async (limit?: number): Promise<{ success: boolean; data: InvoiceExport[] }> => {
    return authFetch(`/sevdesk/invoice-exports${limit ? `?limit=${limit}` : ''}`);
  },

  // Get invoices from sevDesk
  getInvoices: async (options?: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; data: SevdeskInvoice[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.contactId) params.append('contactId', options.contactId);
    if (options?.status) params.append('status', options.status.toString());
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    const queryString = params.toString();
    return authFetch(`/sevdesk/invoices${queryString ? `?${queryString}` : ''}`);
  },

  // Get single invoice with positions
  getInvoice: async (id: string): Promise<{ success: boolean; data: SevdeskInvoice }> => {
    return authFetch(`/sevdesk/invoices/${id}`);
  },

  // Get quotes from sevDesk
  getQuotes: async (options?: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
  }): Promise<{ success: boolean; data: SevdeskQuote[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.contactId) params.append('contactId', options.contactId);
    if (options?.status) params.append('status', options.status.toString());
    const queryString = params.toString();
    return authFetch(`/sevdesk/quotes${queryString ? `?${queryString}` : ''}`);
  },

  // Get single quote with positions
  getQuote: async (id: string): Promise<{ success: boolean; data: SevdeskQuote }> => {
    return authFetch(`/sevdesk/quotes/${id}`);
  },

  // Document Sync & Search
  getSyncStatus: async (): Promise<{ success: boolean; data: { lastSync: string | null; invoiceCount: number; quoteCount: number } }> => {
    return authFetch('/sevdesk/sync/status');
  },

  syncAll: async (): Promise<{ success: boolean; data: { invoices: { synced: number; errors: number }; quotes: { synced: number; errors: number }; totalSynced: number; totalErrors: number } }> => {
    return authFetch('/sevdesk/sync', { method: 'POST' });
  },

  syncInvoices: async (): Promise<{ success: boolean; data: { synced: number; errors: number; type: string } }> => {
    return authFetch('/sevdesk/sync/invoices', { method: 'POST' });
  },

  syncQuotes: async (): Promise<{ success: boolean; data: { synced: number; errors: number; type: string } }> => {
    return authFetch('/sevdesk/sync/quotes', { method: 'POST' });
  },

  searchDocuments: async (query: string, options?: { type?: 'invoice' | 'quote'; limit?: number; offset?: number }): Promise<{ success: boolean; data: DocumentSearchResult[] }> => {
    const params = new URLSearchParams({ q: query });
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    return authFetch(`/sevdesk/search?${params.toString()}`);
  },
};

export default {
  auth: authApi,
  user: userApi,
  entries: entriesApi,
  projects: projectsApi,
  customers: customersApi,
  activities: activitiesApi,
  passwordReset: passwordResetApi,
  teams: teamsApi,
  tickets: ticketsApi,
  customerPortal: customerPortalApi,
};
