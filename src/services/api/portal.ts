/**
 * Portal API
 * Handles portal settings, customer portal, and push notifications
 */

import { API_BASE_URL, authFetch, handleResponse } from './base';
import { TrustedDevice } from './auth';

// Portal License Data (for MSP/reseller customers)
export interface PortalLicenseProduct {
  description: string;
  productSku: string | null;
  contractId: string | null;
  contractName: string | null;
  totalQuantity: number;
  totalAmount: number;
  lineCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  vendors: string[];
  isIncluded: boolean;
}

export interface PortalLicenseData {
  products: PortalLicenseProduct[];
  monthlyBreakdown: Array<{
    month: string;
    totalAmount: number;
    itemCount: number;
  }>;
  summary: {
    uniqueProducts: number;
    billedAmount: number;
    includedAmount: number;
    totalAmount: number;
  };
}

// Portal Settings (canonical interface - single source of truth)
export interface PortalSettings {
  id: string;
  userId: string;
  // Branding
  brandName: string;
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  welcomeMessage: string | null;
  footerText: string | null;
  customCss: string | null;
  // Features
  enableTickets: boolean;
  enableKnowledgeBase: boolean;
  enableChat: boolean;
  requireEmailVerification: boolean;
  allowSelfRegistration: boolean;
  // Knowledge Base specific
  showKnowledgeBase?: boolean;
  requireLoginForKb?: boolean;
  // Time & Contract transparency (Sprint C)
  showTimeReport: boolean;
  showContractInfo: boolean;
  // External links
  teamviewerLink?: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

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

// Portal Contact types
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
  userId: string;
  name: string;
  email: string;
  canCreateTickets: boolean;
  canViewAllTickets: boolean;
  canViewDevices: boolean;
  canViewInvoices: boolean;
  canViewQuotes: boolean;
  canViewTimeReport: boolean;
  canViewContract: boolean;
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
  assignedToName?: string | null;
  slaStatus?: 'ok' | 'warning' | 'breached';
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

// Customer Portal API
export const customerPortalApi = {
  login: async (email: string, password: string): Promise<{
    success: boolean;
    token?: string;
    contact?: PortalContact;
    mfaRequired?: boolean;
    mfaToken?: string;
  }> => {
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
    const response = await fetch(`${API_BASE_URL}/customer-portal/invitation/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    return handleResponse(response);
  },

  verifyInvitation: async (token: string): Promise<{
    valid: boolean;
    email?: string;
    name?: string;
    customerName?: string;
    error?: string;
    expired?: boolean;
    already_activated?: boolean;
  }> => {
    const response = await fetch(`${API_BASE_URL}/customer-portal/invitation/verify/${token}`);
    return handleResponse(response);
  },

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

  rateTicket: async (ticketId: string, rating: number, feedback?: string): Promise<PortalTicket> => {
    return portalAuthFetch(`/customer-portal/tickets/${ticketId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    return portalAuthFetch('/customer-portal/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getDevices: async (): Promise<{ data: PortalDevice[] }> => {
    return portalAuthFetch('/customer-portal/devices');
  },

  getDeviceAlerts: async (deviceId: string): Promise<{ data: PortalDeviceAlert[] }> => {
    return portalAuthFetch(`/customer-portal/devices/${deviceId}/alerts`);
  },

  getInvoices: async (): Promise<{ data: PortalInvoice[] }> => {
    return portalAuthFetch('/customer-portal/invoices');
  },

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

  // Time Report (Sprint D)
  getTimeReportMonths: async (): Promise<{ success: boolean; data: { year: number; month: number; label: string }[] }> => {
    return portalAuthFetch('/customer-portal/time-report/months');
  },

  getTimeReport: async (month: string): Promise<{ success: boolean; data: {
    month: string;
    totalHours: number;
    billableHours: number;
    byProject: {
      projectId: string;
      projectName: string;
      hours: number;
      billableHours: number;
      entries: number;
    }[];
    detailedEntries?: {
      id: string;
      date: string;
      hours: number;
      projectName: string;
      activityName: string | null;
      description: string | null;
      isBillable: boolean;
    }[];
    entryCount: number;
  } }> => {
    return portalAuthFetch(`/customer-portal/time-report?month=${month}`);
  },

  // Contract Info (Sprint D)
  getContract: async (): Promise<{ success: boolean; data: {
    id: string;
    name: string;
    startDate: string;
    endDate: string | null;
    monthlyHours: number | null;
    usedHoursThisMonth: number;
    slaResponseMinutes: number | null;
    status: string;
    contactPerson: string | null;
    notes: string | null;
  } | null }> => {
    return portalAuthFetch('/customer-portal/contract');
  },

  getLicenses: async (): Promise<{ success: boolean; data: PortalLicenseData }> => {
    return portalAuthFetch('/customer-portal/licenses');
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
  getVapidPublicKey: async (): Promise<{ success: boolean; publicKey: string; configured: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
    return handleResponse(response);
  },

  subscribe: async (subscription: PushSubscription, deviceName?: string): Promise<{ success: boolean; subscriptionId?: string }> => {
    return authFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, deviceName }),
    });
  },

  unsubscribe: async (endpoint: string): Promise<{ success: boolean }> => {
    return authFetch('/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
  },

  getSubscriptions: async (): Promise<{ success: boolean; data: DeviceSubscription[] }> => {
    return authFetch('/push/subscriptions');
  },

  deleteSubscription: async (id: string): Promise<{ success: boolean }> => {
    return authFetch(`/push/subscriptions/${id}`, {
      method: 'DELETE',
    });
  },

  getPreferences: async (): Promise<{ success: boolean; data: NotificationPreferences }> => {
    return authFetch('/push/preferences');
  },

  updatePreferences: async (preferences: Partial<NotificationPreferences>): Promise<{ success: boolean }> => {
    return authFetch('/push/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },

  sendTest: async (): Promise<{ success: boolean; sent: number; failed: number }> => {
    return authFetch('/push/test', {
      method: 'POST',
    });
  },
};
