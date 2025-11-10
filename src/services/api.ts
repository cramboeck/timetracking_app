import { TimeEntry, Project, Customer, Activity } from '../types';

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

  getCompany: async () => {
    return authFetch('/user/company');
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
  }) => {
    return authFetch('/user/company', {
      method: 'POST',
      body: JSON.stringify(company),
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

export default {
  auth: authApi,
  user: userApi,
  entries: entriesApi,
  projects: projectsApi,
  customers: customersApi,
  activities: activitiesApi,
  passwordReset: passwordResetApi,
};
