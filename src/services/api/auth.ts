/**
 * Authentication API
 * Handles user authentication, MFA, and password reset
 */

import { API_BASE_URL, authFetch, handleResponse } from './base';

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
