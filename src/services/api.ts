import { TimeEntry, Project, Customer, Activity, CompanyInfo, Team, TeamInvitation, Ticket, TicketComment, CustomerContact, TicketStatus, TicketPriority, TicketResolutionType, TicketTask, TicketTaskWithInfo, SlaPolicy, Task, TaskWithDetails, TaskChecklistItem, TaskComment, TaskDashboardData, TaskFilters, TaskStatus, TaskPriority, RecurrencePattern } from '../types';

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

    // Include device token if available (for trusted devices)
    const deviceToken = localStorage.getItem('device_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (deviceToken) {
      headers['X-Device-Token'] = deviceToken;
    }

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers,
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

  // MFA verification during login
  verifyMfa: async (mfaToken: string, code: string, trustDevice: boolean = false) => {
    console.log('🌐 [API] Calling POST /mfa/verify');
    const response = await fetch(`${API_BASE_URL}/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken, code, trustDevice }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'An error occurred' }));
      // Create error with additional rate limit info
      const error: any = new Error(errorData.error || 'MFA verification failed');
      error.attemptsLeft = errorData.attemptsLeft;
      error.retryAfter = errorData.retryAfter;
      throw error;
    }

    const result = await response.json();

    if (result.token) {
      localStorage.setItem('auth_token', result.token);
      console.log('✅ [API] MFA verified, token stored');
    }

    // Store device token if returned
    if (result.deviceToken) {
      localStorage.setItem('device_token', result.deviceToken);
      console.log('✅ [API] Device token stored');
    }

    return result;
  },
};

// Trusted Device type
export interface TrustedDevice {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

// MFA API
export const mfaApi = {
  getStatus: async (): Promise<{ enabled: boolean }> => {
    return authFetch('/mfa/status');
  },

  setup: async (): Promise<{
    secret: string;
    qrCode: string;
    recoveryCodes: string[];
    manualEntryKey: string;
  }> => {
    return authFetch('/mfa/setup', { method: 'POST' });
  },

  verifySetup: async (code: string): Promise<{ success: boolean; message: string }> => {
    return authFetch('/mfa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  disable: async (password: string, code: string): Promise<{ success: boolean; message: string }> => {
    return authFetch('/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  },

  getRecoveryCodesCount: async (): Promise<{ remaining: number }> => {
    return authFetch('/mfa/recovery-codes');
  },

  regenerateRecoveryCodes: async (password: string, code: string): Promise<{
    success: boolean;
    recoveryCodes: string[];
  }> => {
    return authFetch('/mfa/regenerate-recovery-codes', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  },

  // Trusted devices
  getTrustedDevices: async (): Promise<{ devices: TrustedDevice[] }> => {
    return authFetch('/mfa/trusted-devices');
  },

  removeTrustedDevice: async (deviceId: string): Promise<{ success: boolean }> => {
    return authFetch(`/mfa/trusted-devices/${deviceId}`, { method: 'DELETE' });
  },

  removeAllTrustedDevices: async (): Promise<{ success: boolean; count: number }> => {
    return authFetch('/mfa/trusted-devices', { method: 'DELETE' });
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
    darkMode?: boolean;
    timeRoundingInterval?: number;
    timeFormat?: string;
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

  // User preferences (stored in database)
  getPreferences: async (): Promise<{ success: boolean; data: Record<string, unknown> }> => {
    return authFetch('/user/preferences');
  },

  updatePreferences: async (preferences: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }> => {
    return authFetch('/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences),
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
    solution: string;
    resolutionType: TicketResolutionType;
  }>): Promise<{ success: boolean; data: Ticket; requiresSolution?: boolean }> => {
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

  // Tasks
  getTasks: async (ticketId: string): Promise<{ success: boolean; data: TicketTask[] }> => {
    return authFetch(`/tickets/${ticketId}/tasks`);
  },

  createTask: async (ticketId: string, data: {
    title: string;
    visibleToCustomer?: boolean;
    assignedTo?: string | null;
    dueDate?: string | null;
    description?: string | null;
  }): Promise<{ success: boolean; data: TicketTask }> => {
    return authFetch(`/tickets/${ticketId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateTask: async (ticketId: string, taskId: string, updates: {
    title?: string;
    completed?: boolean;
    visibleToCustomer?: boolean;
    assignedTo?: string | null;
    dueDate?: string | null;
    description?: string | null;
  }): Promise<{ success: boolean; data: TicketTask }> => {
    return authFetch(`/tickets/${ticketId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  reorderTasks: async (ticketId: string, taskIds: string[]): Promise<{ success: boolean; data: TicketTask[] }> => {
    return authFetch(`/tickets/${ticketId}/tasks/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ taskIds }),
    });
  },

  deleteTask: async (ticketId: string, taskId: string): Promise<{ success: boolean }> => {
    return authFetch(`/tickets/${ticketId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  // Get all tasks across all tickets (for task overview)
  getAllTasks: async (filters?: { status?: 'open' | 'completed' | 'all'; customerId?: string }): Promise<{ success: boolean; data: TicketTaskWithInfo[] }> => {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters?.customerId) {
      params.append('customerId', filters.customerId);
    }
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
  canViewDevices: boolean;
  canViewInvoices: boolean;
  canViewQuotes: boolean;
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

export interface PortalDevice {
  id: string;
  ninjaId: number;
  displayName: string;
  systemName: string;
  deviceType: string;
  osName: string;
  osVersion: string;
  osBuild?: string;
  osArchitecture?: string;
  lastBoot?: string;
  lastContact: string;
  lastLoggedInUser: string;
  publicIp: string;
  privateIp: string;
  offline: boolean;
  notes: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  processorName?: string;
  processorCores?: number;
  memoryGb?: number;
  openAlerts: number;
}

export interface PortalDeviceAlert {
  id: string;
  severity: string;
  priority: string;
  message: string;
  sourceType: string;
  sourceName: string;
  activityTime: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;
  status: string;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  deliveryDate?: string;
  status: number;
  header?: string;
  totalNet: number;
  totalGross: number;
  taxRate: number;
  currency: string;
  payDate?: string;
  dunningLevel?: number;
}

export interface PortalQuote {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: number;
  header?: string;
  totalNet: number;
  totalGross: number;
  taxRate: number;
  currency: string;
  validUntil?: string;
}

export const customerPortalApi = {
  login: async (email: string, password: string): Promise<{
    success: boolean;
    token?: string;
    contact?: PortalContact;
    mfaRequired?: boolean;
    mfaToken?: string;
  }> => {
    // Include device token if available (for trusted devices)
    const deviceToken = localStorage.getItem('portal_device_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (deviceToken) {
      headers['X-Device-Token'] = deviceToken;
    }

    const response = await fetch(`${API_BASE_URL}/customer-portal/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    const result = await handleResponse(response);

    if (result.token && !result.mfaRequired) {
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

  // Devices (NinjaRMM)
  getDevices: async (): Promise<{ data: PortalDevice[] }> => {
    return portalAuthFetch('/customer-portal/devices');
  },

  // Device Alerts (NinjaRMM)
  getDeviceAlerts: async (deviceId: string): Promise<{ data: PortalDeviceAlert[] }> => {
    return portalAuthFetch(`/customer-portal/devices/${deviceId}/alerts`);
  },

  // Invoices (sevDesk)
  getInvoices: async (): Promise<{ data: PortalInvoice[] }> => {
    return portalAuthFetch('/customer-portal/invoices');
  },

  // Quotes (sevDesk)
  getQuotes: async (): Promise<{ data: PortalQuote[] }> => {
    return portalAuthFetch('/customer-portal/quotes');
  },

  // MFA
  verifyMfa: async (mfaToken: string, code: string, trustDevice: boolean = false): Promise<{
    success: boolean;
    token: string;
    contact: PortalContact;
    deviceToken?: string;
  }> => {
    // Include device token if available (for trusted devices)
    const deviceToken = localStorage.getItem('portal_device_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (deviceToken) {
      headers['X-Device-Token'] = deviceToken;
    }

    const response = await fetch(`${API_BASE_URL}/customer-portal/mfa/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mfaToken, code, trustDevice }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'An error occurred' }));
      const error: any = new Error(errorData.error || 'MFA verification failed');
      error.attemptsLeft = errorData.attemptsLeft;
      error.retryAfter = errorData.retryAfter;
      throw error;
    }

    const result = await response.json();

    if (result.token) {
      localStorage.setItem('portal_auth_token', result.token);
    }

    if (result.deviceToken) {
      localStorage.setItem('portal_device_token', result.deviceToken);
    }

    return result;
  },

  getMfaStatus: async (): Promise<{ enabled: boolean; hasRecoveryCodes: boolean }> => {
    return portalAuthFetch('/customer-portal/mfa/status');
  },

  setupMfa: async (): Promise<{
    secret: string;
    qrCode: string;
    recoveryCodes: string[];
    manualEntryKey: string;
  }> => {
    return portalAuthFetch('/customer-portal/mfa/setup', { method: 'POST' });
  },

  verifyMfaSetup: async (code: string): Promise<{ success: boolean; message: string }> => {
    return portalAuthFetch('/customer-portal/mfa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  disableMfa: async (password: string, code: string): Promise<{ success: boolean; message: string }> => {
    return portalAuthFetch('/customer-portal/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  },

  getRecoveryCodesCount: async (): Promise<{ remaining: number }> => {
    return portalAuthFetch('/customer-portal/mfa/recovery-codes');
  },

  regenerateRecoveryCodes: async (password: string, code: string): Promise<{
    success: boolean;
    recoveryCodes: string[];
  }> => {
    return portalAuthFetch('/customer-portal/mfa/regenerate-recovery-codes', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
  },

  getTrustedDevices: async (): Promise<{ devices: TrustedDevice[] }> => {
    return portalAuthFetch('/customer-portal/mfa/trusted-devices');
  },

  removeTrustedDevice: async (deviceId: string): Promise<{ success: boolean }> => {
    return portalAuthFetch(`/customer-portal/mfa/trusted-devices/${deviceId}`, { method: 'DELETE' });
  },

  removeAllTrustedDevices: async (): Promise<{ success: boolean; count: number }> => {
    return portalAuthFetch('/customer-portal/mfa/trusted-devices', { method: 'DELETE' });
  },

  // Notification Preferences
  getNotificationPreferences: async (): Promise<{
    notifyTicketCreated: boolean;
    notifyTicketStatusChanged: boolean;
    notifyTicketReply: boolean;
  }> => {
    return portalAuthFetch('/customer-portal/notification-preferences');
  },

  updateNotificationPreferences: async (prefs: {
    notifyTicketCreated?: boolean;
    notifyTicketStatusChanged?: boolean;
    notifyTicketReply?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    return portalAuthFetch('/customer-portal/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  },

  // Push notification methods for portal
  push: {
    getVapidPublicKey: async (): Promise<{ success: boolean; publicKey: string; configured: boolean }> => {
      const response = await fetch(`${API_BASE_URL}/customer-portal/push/vapid-public-key`);
      return handleResponse(response);
    },

    subscribe: async (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, deviceName?: string): Promise<{ success: boolean; id?: string }> => {
      return portalAuthFetch('/customer-portal/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription, deviceName }),
      });
    },

    unsubscribe: async (endpoint: string): Promise<{ success: boolean }> => {
      return portalAuthFetch('/customer-portal/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
      });
    },

    getSubscriptions: async (): Promise<{ success: boolean; data: Array<{ id: string; endpoint: string; device_name: string | null; created_at: string; last_used_at: string | null }> }> => {
      return portalAuthFetch('/customer-portal/push/subscriptions');
    },

    deleteSubscription: async (id: string): Promise<{ success: boolean }> => {
      return portalAuthFetch(`/customer-portal/push/subscriptions/${id}`, {
        method: 'DELETE',
      });
    },

    getPreferences: async (): Promise<{ success: boolean; data: { push_enabled: boolean; push_on_ticket_reply: boolean; push_on_status_change: boolean } }> => {
      return portalAuthFetch('/customer-portal/push/preferences');
    },

    updatePreferences: async (prefs: { push_enabled?: boolean; push_on_ticket_reply?: boolean; push_on_status_change?: boolean }): Promise<{ success: boolean }> => {
      return portalAuthFetch('/customer-portal/push/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
    },

    sendTest: async (): Promise<{ success: boolean; sent: number; failed: number }> => {
      return portalAuthFetch('/customer-portal/push/test', {
        method: 'POST',
      });
    },
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
  contactId: string | null;
  contactName: string;
  documentDate: string;
  status: number;
  statusName: string;
  header: string;
  sumNet: number;
  sumGross: number;
  sumTax: number | null;
  currency: string;
  positions: Array<{ name: string; text: string | null; quantity: number; price: number; sumNet: number }>;
  rank: number;
}

export interface PositionSearchResult {
  id: string;
  name: string;
  text: string | null;
  quantity: number;
  price: number;
  sumNet: number;
  sourceDocumentId: string;
  sourceDocumentNumber: string;
  sourceDocumentType: 'invoice' | 'quote';
  sourceContactName: string;
  sourceDocumentDate: string;
}

export interface CreateQuoteInput {
  contactId: string;
  quoteDate?: string;
  header: string;
  headText?: string;
  footText?: string;
  positions: Array<{
    name: string;
    text?: string;
    quantity: number;
    price: number;
    taxRate?: number;
  }>;
  status?: number;
}

export interface BillingSummaryItem {
  customerId: string;
  customerName: string;
  hourlyRate: number | null;
  sevdeskCustomerId: string | null;
  totalSeconds: number;
  totalHours: number;
  totalAmount: number | null;
  isBilled?: boolean;
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
  customerId: string;
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

  // Delete export (undo billing)
  deleteExport: async (exportId: string): Promise<{ success: boolean }> => {
    return authFetch(`/sevdesk/invoice-exports/${exportId}`, {
      method: 'DELETE',
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

  // Position search for quote creation
  searchPositions: async (query: string, options?: { type?: 'invoice' | 'quote'; limit?: number }): Promise<{ success: boolean; data: PositionSearchResult[] }> => {
    const params = new URLSearchParams({ q: query });
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', options.limit.toString());
    return authFetch(`/sevdesk/positions/search?${params.toString()}`);
  },

  getPositionSuggestions: async (prefix: string, limit?: number): Promise<{ success: boolean; data: string[] }> => {
    const params = new URLSearchParams({ prefix });
    if (limit) params.append('limit', limit.toString());
    return authFetch(`/sevdesk/positions/suggestions?${params.toString()}`);
  },

  // Quote creation
  createQuote: async (data: CreateQuoteInput): Promise<{ success: boolean; data: { quoteId: string; quoteNumber: string } }> => {
    return authFetch('/sevdesk/quotes/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// NinjaRMM API
// ============================================

export interface NinjaRMMConfig {
  instanceUrl: string;
  clientId: string | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  isConnected: boolean;
  tokenExpiresAt: string | null;
  autoSyncDevices: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: string | null;
}

export interface NinjaSyncStatus {
  lastSync: string | null;
  organizationCount: number;
  deviceCount: number;
  alertCount: number;
  unresolvedAlertCount: number;
}

export interface NinjaOrganization {
  id: string;
  ninjaId: number;
  name: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  deviceCount: number;
  syncedAt: string;
}

export interface NinjaDevice {
  id: string;
  ninjaId: number;
  organizationName: string;
  customerName: string | null;
  systemName: string;
  displayName: string | null;
  nodeClass: string;
  offline: boolean;
  lastContact: string | null;
  publicIp: string | null;
  osName: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  osArchitecture?: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  lastLoggedInUser: string | null;
  processorName?: string | null;
  processorCores?: number | null;
  memoryGb?: number | null;
  syncedAt: string;
}

export interface NinjaAlert {
  id: string;
  ninjaUid: string;
  deviceName: string | null;
  organizationName: string | null;
  customerName: string | null;
  severity: string;
  priority: string;
  message: string;
  sourceType: string | null;
  sourceName: string | null;
  activityTime: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  ticketId: string | null;
}

export const ninjaApi = {
  // Get configuration
  getConfig: async (): Promise<{ success: boolean; data: NinjaRMMConfig | null }> => {
    return authFetch('/ninjarmm/config');
  },

  // Save configuration
  saveConfig: async (config: {
    clientId?: string;
    clientSecret?: string;
    instanceUrl?: string;
    autoSyncDevices?: boolean;
    syncIntervalMinutes?: number;
  }): Promise<{ success: boolean; data: NinjaRMMConfig }> => {
    return authFetch('/ninjarmm/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  // Get OAuth2 authorization URL
  getAuthUrl: async (): Promise<{ success: boolean; data: { authUrl: string; redirectUri: string } }> => {
    return authFetch('/ninjarmm/auth-url');
  },

  // Disconnect from NinjaRMM
  disconnect: async (): Promise<{ success: boolean }> => {
    return authFetch('/ninjarmm/disconnect', { method: 'POST' });
  },

  // Test connection
  testConnection: async (): Promise<{ success: boolean; data?: { organizationCount: number; deviceCount: number }; error?: string }> => {
    return authFetch('/ninjarmm/test');
  },

  // Sync all data
  syncAll: async (): Promise<{ success: boolean; data: { organizations: { synced: number; errors: number }; devices: { synced: number; errors: number }; alerts: { synced: number; errors: number } } }> => {
    return authFetch('/ninjarmm/sync', { method: 'POST' });
  },

  // Get sync status
  getSyncStatus: async (): Promise<{ success: boolean; data: NinjaSyncStatus }> => {
    return authFetch('/ninjarmm/sync-status');
  },

  // Get organizations
  getOrganizations: async (): Promise<{ success: boolean; data: NinjaOrganization[] }> => {
    return authFetch('/ninjarmm/organizations');
  },

  // Link organization to customer
  linkOrganization: async (organizationId: string, customerId: string | null): Promise<{ success: boolean }> => {
    return authFetch(`/ninjarmm/organizations/${organizationId}/link`, {
      method: 'PUT',
      body: JSON.stringify({ customerId }),
    });
  },

  // Get devices
  getDevices: async (options?: {
    organizationId?: string;
    customerId?: string;
    nodeClass?: string;
    offline?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; data: NinjaDevice[] }> => {
    const params = new URLSearchParams();
    if (options?.organizationId) params.append('organizationId', options.organizationId);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.nodeClass) params.append('nodeClass', options.nodeClass);
    if (options?.offline !== undefined) params.append('offline', options.offline.toString());
    if (options?.search) params.append('search', options.search);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const queryString = params.toString();
    return authFetch(`/ninjarmm/devices${queryString ? `?${queryString}` : ''}`);
  },

  // Get device details
  getDeviceDetails: async (deviceId: string): Promise<{ success: boolean; data: any }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/details`);
  },

  // Refresh device details (fetch from NinjaRMM and save locally)
  refreshDeviceDetails: async (deviceId: string): Promise<{ success: boolean; data: NinjaDevice }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/refresh`, {
      method: 'POST',
    });
  },

  // Get alerts
  getAlerts: async (options?: {
    deviceId?: string;
    customerId?: string;
    severity?: string;
    resolved?: boolean;
    ticketId?: string;
    limit?: number;
  }): Promise<{ success: boolean; data: NinjaAlert[] }> => {
    const params = new URLSearchParams();
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.severity) params.append('severity', options.severity);
    if (options?.resolved !== undefined) params.append('resolved', options.resolved.toString());
    if (options?.ticketId) params.append('ticketId', options.ticketId);
    if (options?.limit) params.append('limit', options.limit.toString());
    const queryString = params.toString();
    return authFetch(`/ninjarmm/alerts${queryString ? `?${queryString}` : ''}`);
  },

  // Resolve alert
  resolveAlert: async (alertId: string, ticketId?: string, resetInNinja?: boolean): Promise<{ success: boolean }> => {
    return authFetch(`/ninjarmm/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ ticketId, resetInNinja }),
    });
  },

  // Create ticket from alert
  createTicketFromAlert: async (alertId: string): Promise<{ success: boolean; data: { ticketId: string } }> => {
    return authFetch(`/ninjarmm/alerts/${alertId}/create-ticket`, { method: 'POST' });
  },

  // ============================================
  // Webhook Configuration
  // ============================================

  // Get webhook configuration
  getWebhookConfig: async (): Promise<{
    success: boolean;
    data: {
      webhookUrl: string;
      webhookEnabled: boolean;
      webhookSecret: string | null;
      hasSecret: boolean;
      autoCreateTickets: boolean;
      minSeverity: string;
      autoResolveTickets: boolean;
    };
  }> => {
    return authFetch('/ninjarmm/webhook-config');
  },

  // Update webhook configuration
  updateWebhookConfig: async (config: {
    webhookEnabled?: boolean;
    webhookSecret?: string;
    autoCreateTickets?: boolean;
    minSeverity?: string;
    autoResolveTickets?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    return authFetch('/ninjarmm/webhook-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  // Generate new webhook secret
  generateWebhookSecret: async (): Promise<{
    success: boolean;
    data: { secret: string; webhookUrl: string };
    message: string;
  }> => {
    return authFetch('/ninjarmm/webhook-config/generate-secret', { method: 'POST' });
  },

  // Get webhook events log
  getWebhookEvents: async (options?: {
    limit?: number;
    status?: string;
  }): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      event_type: string;
      ninja_alert_id: string;
      ninja_device_id: string;
      severity: string;
      status: string;
      error_message: string | null;
      alert_id: string | null;
      ticket_id: string | null;
      processing_time_ms: number;
      created_at: string;
    }>;
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.status) params.append('status', options.status);
    const queryString = params.toString();
    return authFetch(`/ninjarmm/webhook-events${queryString ? `?${queryString}` : ''}`);
  },

  // Get raw payload for a webhook event
  getWebhookEventPayload: async (eventId: string): Promise<{
    success: boolean;
    data: {
      id: string;
      eventType: string;
      payload: any;
      createdAt: string;
    };
  }> => {
    return authFetch(`/ninjarmm/webhook-events/${eventId}/payload`);
  },

  // Backfill device names for existing webhook events
  backfillWebhookDeviceNames: async (): Promise<{
    success: boolean;
    data: {
      processedCount: number;
      updatedCount: number;
    };
    message: string;
  }> => {
    return authFetch('/ninjarmm/webhook-events/backfill-device-names', {
      method: 'POST',
    });
  },

  // ============================================
  // Alert Exclusions
  // ============================================

  // Get all exclusions
  getExclusions: async (): Promise<{
    success: boolean;
    data: NinjaAlertExclusion[];
  }> => {
    return authFetch('/ninjarmm/exclusions');
  },

  // Create new exclusion
  createExclusion: async (data: {
    name: string;
    description?: string;
    matchType: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
    matchField: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchValue: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; data: { id: string }; message: string }> => {
    return authFetch('/ninjarmm/exclusions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update exclusion
  updateExclusion: async (id: string, data: {
    name?: string;
    description?: string;
    matchType?: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
    matchField?: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchValue?: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/ninjarmm/exclusions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete exclusion
  deleteExclusion: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/ninjarmm/exclusions/${id}`, {
      method: 'DELETE',
    });
  },

  // Create exclusion from webhook event
  createExclusionFromEvent: async (eventId: string, options?: {
    matchField?: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchType?: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  }): Promise<{
    success: boolean;
    data: { id: string; name: string; matchValue: string };
    message: string;
  }> => {
    return authFetch(`/ninjarmm/exclusions/from-event/${eventId}`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },
};

// Alert Exclusion type
export interface NinjaAlertExclusion {
  id: string;
  name: string;
  description: string | null;
  matchType: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  matchField: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
  matchValue: string;
  isActive: boolean;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Feature Packages API
export interface UserFeatures {
  core: boolean;
  timeTracking: boolean;
  support: boolean;
  business: boolean;
  tickets: boolean;
  devices: boolean;
  alerts: boolean;
  billing: boolean;
  dashboardAdvanced: boolean;
  packages: Array<{
    name: string;
    enabled: boolean;
    enabledAt: string;
    expiresAt: string | null;
  }>;
}

export interface AvailablePackage {
  name: string;
  label: string;
  description: string;
  features: string[];
  enabled: boolean;
}

export const featuresApi = {
  // Get current user's features
  getFeatures: async (): Promise<{ success: boolean; data: UserFeatures }> => {
    return authFetch('/features');
  },

  // Get available packages
  getAvailable: async (): Promise<{ success: boolean; data: AvailablePackage[] }> => {
    return authFetch('/features/available');
  },

  // Enable a package
  enablePackage: async (packageName: string, expiresAt?: string): Promise<{ success: boolean }> => {
    return authFetch(`/features/${packageName}/enable`, {
      method: 'POST',
      body: JSON.stringify({ expiresAt }),
    });
  },

  // Disable a package
  disablePackage: async (packageName: string): Promise<{ success: boolean }> => {
    return authFetch(`/features/${packageName}/disable`, {
      method: 'POST',
    });
  },
};

// Maintenance Announcements API
export type MaintenanceType = 'patch' | 'reboot' | 'security_update' | 'firmware' | 'general';
export type MaintenanceStatus = 'draft' | 'scheduled' | 'sent' | 'in_progress' | 'completed' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'no_response';

export interface MaintenanceAnnouncement {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  maintenance_type: MaintenanceType;
  affected_systems: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: MaintenanceStatus;
  require_approval: boolean;
  approval_deadline: string | null;
  auto_proceed_on_no_response: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  customer_count?: number;
  approved_count?: number;
  rejected_count?: number;
  pending_count?: number;
}

export interface MaintenanceAnnouncementCustomer {
  id: string;
  announcement_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  approval_token: string;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notification_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface MaintenanceAnnouncementDevice {
  id: string;
  announcement_id: string;
  device_id: string;
  system_name: string;
  display_name: string | null;
  node_class: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface MaintenanceActivityLog {
  id: string;
  announcement_id: string;
  action: string;
  actor_type: 'admin' | 'customer' | 'system';
  actor_id: string | null;
  actor_name: string | null;
  details: any;
  created_at: string;
  announcement_title?: string;
}

export interface MaintenanceTemplate {
  id: string;
  user_id: string;
  name: string;
  title: string;
  description: string | null;
  maintenance_type: MaintenanceType;
  affected_systems: string | null;
  estimated_duration_minutes: number | null;
  require_approval: boolean;
  auto_proceed_on_no_response: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceDashboard {
  upcoming: MaintenanceAnnouncement[];
  pendingApprovals: number;
  recentActivity: MaintenanceActivityLog[];
  statistics: {
    completed_count: number;
    scheduled_count: number;
    in_progress_count: number;
  };
}

export interface MaintenanceApprovalDetails {
  customerName: string;
  companyName: string;
  title: string;
  description: string | null;
  maintenanceType: MaintenanceType;
  affectedSystems: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  approvalDeadline: string | null;
  requireApproval: boolean;
  status: ApprovalStatus;
  alreadyResponded?: boolean;
  respondedAt?: string;
  rejectionReason?: string | null;
}

export const maintenanceApi = {
  // Get dashboard data
  getDashboard: async (): Promise<MaintenanceDashboard> => {
    return authFetch('/maintenance/dashboard');
  },

  // List announcements
  getAnnouncements: async (options?: {
    status?: MaintenanceStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ announcements: MaintenanceAnnouncement[] }> => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const queryString = params.toString();
    return authFetch(`/maintenance/announcements${queryString ? `?${queryString}` : ''}`);
  },

  // Get single announcement with details
  getAnnouncement: async (id: string): Promise<{
    announcement: MaintenanceAnnouncement;
    customers: MaintenanceAnnouncementCustomer[];
    devices: MaintenanceAnnouncementDevice[];
    activityLog: MaintenanceActivityLog[];
  }> => {
    return authFetch(`/maintenance/announcements/${id}`);
  },

  // Create announcement
  createAnnouncement: async (data: {
    title: string;
    description?: string;
    maintenanceType: MaintenanceType;
    affectedSystems?: string;
    scheduledStart: string;
    scheduledEnd?: string;
    requireApproval?: boolean;
    approvalDeadline?: string;
    autoProceedOnNoResponse?: boolean;
    notes?: string;
    customerIds?: string[];
    deviceIds?: string[];
  }): Promise<{ success: boolean; announcementId: string; message: string }> => {
    return authFetch('/maintenance/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update announcement
  updateAnnouncement: async (id: string, data: Partial<{
    title: string;
    description: string;
    maintenanceType: MaintenanceType;
    affectedSystems: string;
    scheduledStart: string;
    scheduledEnd: string;
    requireApproval: boolean;
    approvalDeadline: string;
    autoProceedOnNoResponse: boolean;
    notes: string;
    customerIds: string[];
    deviceIds: string[];
  }>): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete announcement
  deleteAnnouncement: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  // Send notifications to customers
  sendNotifications: async (id: string, customerIds: string[]): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    message: string;
  }> => {
    return authFetch(`/maintenance/announcements/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ customerIds }),
    });
  },

  // Send reminders to pending customers
  sendReminders: async (id: string): Promise<{
    success: boolean;
    sentCount: number;
    message: string;
  }> => {
    return authFetch(`/maintenance/announcements/${id}/remind`, {
      method: 'POST',
    });
  },

  // Update announcement status
  updateStatus: async (id: string, status: MaintenanceStatus): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/announcements/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  // Get templates
  getTemplates: async (): Promise<{ templates: MaintenanceTemplate[] }> => {
    return authFetch('/maintenance/templates');
  },

  // Create template
  createTemplate: async (data: {
    name: string;
    title: string;
    description?: string;
    maintenanceType: MaintenanceType;
    affectedSystems?: string;
    estimatedDurationMinutes?: number;
    requireApproval?: boolean;
    autoProceedOnNoResponse?: boolean;
  }): Promise<{ success: boolean; templateId: string; message: string }> => {
    return authFetch('/maintenance/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Delete template
  deleteTemplate: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/maintenance/templates/${id}`, {
      method: 'DELETE',
    });
  },

  // PUBLIC: Get approval details (no auth required)
  getApprovalDetails: async (token: string): Promise<MaintenanceApprovalDetails> => {
    const response = await fetch(`${API_BASE_URL}/maintenance/approve/${token}`);
    return handleResponse(response);
  },

  // PUBLIC: Submit approval/rejection (no auth required)
  submitApproval: async (token: string, data: {
    action: 'approve' | 'reject';
    reason?: string;
    approverName?: string;
  }): Promise<{ success: boolean; message: string; status: ApprovalStatus }> => {
    const response = await fetch(`${API_BASE_URL}/maintenance/approve/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

// ============================================
// Organizations API (Multi-Tenant)
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  settings: Record<string, any>;
  logo: string | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
  user_role?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  username: string;
  email: string;
  display_name: string | null;
  last_login: string | null;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitation_code: string;
  invited_by: string;
  invited_by_name?: string;
  expires_at: string;
  created_at: string;
}

export const organizationsApi = {
  // Get user's organizations
  getAll: async (): Promise<{ success: boolean; data: Organization[] }> => {
    return authFetch('/organizations');
  },

  // Get current/active organization
  getCurrent: async (): Promise<{ success: boolean; data: Organization }> => {
    return authFetch('/organizations/current');
  },

  // Get organization by ID
  getById: async (id: string): Promise<{ success: boolean; data: Organization & { userRole: string } }> => {
    return authFetch(`/organizations/${id}`);
  },

  // Create organization
  create: async (data: { name: string; settings?: Record<string, any> }): Promise<{ success: boolean; data: Organization }> => {
    return authFetch('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update organization
  update: async (id: string, data: { name?: string; settings?: Record<string, any>; logo?: string }): Promise<{ success: boolean; data: Organization }> => {
    return authFetch(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get members
  getMembers: async (orgId: string): Promise<{ success: boolean; data: OrganizationMember[] }> => {
    return authFetch(`/organizations/${orgId}/members`);
  },

  // Update member role
  updateMemberRole: async (orgId: string, memberId: string, role: 'admin' | 'member' | 'viewer'): Promise<{ success: boolean; data: OrganizationMember }> => {
    return authFetch(`/organizations/${orgId}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },

  // Remove member
  removeMember: async (orgId: string, memberId: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  // Get invitations
  getInvitations: async (orgId: string): Promise<{ success: boolean; data: OrganizationInvitation[] }> => {
    return authFetch(`/organizations/${orgId}/invitations`);
  },

  // Create invitation
  createInvitation: async (orgId: string, email: string, role: 'admin' | 'member' | 'viewer' = 'member'): Promise<{ success: boolean; data: OrganizationInvitation; invitationLink: string }> => {
    return authFetch(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  // Cancel invitation
  cancelInvitation: async (orgId: string, invitationId: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/organizations/${orgId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },

  // Get invitation info (public - no auth needed)
  getInvitationInfo: async (code: string): Promise<{ success: boolean; data: { organizationName: string; logo: string | null; role: string; invitedBy: string; expiresAt: string } }> => {
    const response = await fetch(`${API_BASE_URL}/organizations/invitation/${code}`);
    return handleResponse(response);
  },

  // Accept invitation (join organization)
  acceptInvitation: async (code: string): Promise<{ success: boolean; message: string; organizationId: string }> => {
    return authFetch(`/organizations/join/${code}`, {
      method: 'POST',
    });
  },

  // Leave organization
  leave: async (orgId: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/organizations/${orgId}/leave`, {
      method: 'POST',
    });
  },
};

// ============================================
// Unified Task Hub API (Standalone Tasks)
// ============================================

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
  features: featuresApi,
  organizations: organizationsApi,
  tasks: tasksApi,
};
