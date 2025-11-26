import { TimeEntry, Project, Customer, Activity, CompanyInfo, Team, TeamInvitation, Ticket, TicketComment, CustomerContact, TicketStatus, TicketPriority } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
};

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
