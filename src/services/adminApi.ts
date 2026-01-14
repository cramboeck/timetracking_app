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
  },

  // Feature Management
  getFeatures: async (page: number = 1, limit: number = 50, search: string = '') => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(search && { search })
    });
    return adminFetch(`/admin/features?${params}`);
  },

  updateUserFeature: async (userId: string, packageName: string, enabled: boolean, expiresAt?: string) => {
    return adminFetch(`/admin/features/${userId}/${packageName}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled, expiresAt })
    });
  },

  bulkUpdateFeatures: async (userIds: string[], packageName: string, enabled: boolean, expiresAt?: string) => {
    return adminFetch('/admin/features/bulk', {
      method: 'POST',
      body: JSON.stringify({ userIds, packageName, enabled, expiresAt })
    });
  },

  // Backup Management
  getBackups: async () => {
    return adminFetch('/admin/backups');
  },

  createBackup: async (compress: boolean = true) => {
    return adminFetch('/admin/backups', {
      method: 'POST',
      body: JSON.stringify({ compress })
    });
  },

  restoreBackup: async (filename: string) => {
    return adminFetch(`/admin/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESTORE' })
    });
  },

  deleteBackup: async (filename: string) => {
    return adminFetch(`/admin/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
  },

  cleanupBackups: async (olderThanDays: number = 30) => {
    return adminFetch('/admin/backups', {
      method: 'DELETE',
      body: JSON.stringify({ olderThanDays })
    });
  },

  // System Status
  getSystemStatus: async () => {
    return adminFetch('/admin/system/status');
  },

  // Database Statistics
  getDatabaseStats: async () => {
    return adminFetch('/admin/database/stats');
  },

  runVacuum: async (table?: string) => {
    return adminFetch('/admin/database/vacuum', {
      method: 'POST',
      body: JSON.stringify({ table })
    });
  },

  // Security / Sessions
  getSecurityData: async () => {
    return adminFetch('/admin/security/sessions');
  },

  invalidateUserSessions: async (userId: string) => {
    return adminFetch(`/admin/security/sessions/${userId}`, {
      method: 'DELETE'
    });
  },

  // System Logs
  getSystemLogs: async (lines: number = 100, type: string = 'app') => {
    const params = new URLSearchParams({ lines: lines.toString(), type });
    return adminFetch(`/admin/system/logs?${params}`);
  },

  // System Notifications
  getNotifications: async () => {
    return adminFetch('/admin/notifications');
  },

  createNotification: async (title: string, message: string, type: string = 'info', expiresAt?: string) => {
    return adminFetch('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ title, message, type, expiresAt })
    });
  },

  deleteNotification: async (id: string) => {
    return adminFetch(`/admin/notifications/${id}`, {
      method: 'DELETE'
    });
  },

  toggleNotification: async (id: string) => {
    return adminFetch(`/admin/notifications/${id}/toggle`, {
      method: 'PUT'
    });
  },

  // Email Dashboard
  getEmailStats: async () => {
    return adminFetch('/admin/email/stats');
  },

  getEmailLogs: async (page: number = 1, limit: number = 50, filters: { status?: string; type?: string; search?: string } = {}) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      ...(filters.search && { search: filters.search })
    });
    return adminFetch(`/admin/email/logs?${params}`);
  },

  getEmailConfig: async () => {
    return adminFetch('/admin/email/config');
  },

  sendTestEmail: async (to?: string) => {
    return adminFetch('/admin/email/test', {
      method: 'POST',
      body: JSON.stringify({ to })
    });
  },

  getEmailTypes: async () => {
    return adminFetch('/admin/email/types');
  }
};
