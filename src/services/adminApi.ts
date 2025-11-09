const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Helper to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Helper for authenticated admin requests
const adminFetch = async (url: string, options: RequestInit = {}) => {
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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const adminApi = {
  // Dashboard Stats
  getStats: async () => {
    return adminFetch('/admin/stats');
  },

  // Users Management
  getUsers: async (page: number = 1, limit: number = 50, search: string = '') => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(search && { search })
    });
    return adminFetch(`/admin/users?${params}`);
  },

  getUserDetails: async (userId: string) => {
    return adminFetch(`/admin/users/${userId}`);
  },

  updateUserRole: async (userId: string, role: 'user' | 'admin') => {
    return adminFetch(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  },

  deleteUser: async (userId: string) => {
    return adminFetch(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  },

  // Audit Logs
  getAuditLogs: async (page: number = 1, limit: number = 100, filters: { userId?: string; action?: string } = {}) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.action && { action: filters.action })
    });
    return adminFetch(`/admin/audit-logs?${params}`);
  },

  // Analytics
  getAnalytics: async () => {
    return adminFetch('/admin/analytics');
  }
};
