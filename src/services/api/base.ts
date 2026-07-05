/**
 * API Base Utilities
 * Contains shared utilities for all API modules
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Export helper to get API base URL for file URLs
export const getApiBaseUrl = () => API_BASE_URL;

// Helper to get auth token from localStorage
export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Helper to handle API errors
export const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// ─── Refresh-token flow ────────────────────────────────────────────────────
// When an authenticated request comes back 401, we transparently try once
// to exchange the stored refresh token for a fresh access token and replay
// the original request. Concurrent 401s share a single in-flight refresh
// (single-flight pattern) so we never call /auth/refresh more than once at
// the same time.

// Dispatched on `window` when the session is definitively dead (the server
// rejected our refresh token). The AuthProvider listens for it and flips the
// UI to the login screen immediately, instead of waiting for the next user
// action to surface the failure.
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

let pendingRefresh: Promise<string | null> | null = null;

// The session can no longer be recovered: drop the credentials and let the
// app know. Only call this for a real server-side rejection — never on a
// network error, where the token may still be valid once connectivity returns.
const notifySessionExpired = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
};

// Cross-tab mutex around the refresh call. All tabs share one refresh token
// in localStorage, and rotation makes concurrent refreshes a logout hazard:
// the server treats a badly raced token chain as theft and revokes every
// session (the "wake from sleep with several tabs open" scenario). Web Locks
// serialize the refresh across tabs; browsers without the API fall back to
// the per-tab single-flight, which the server's lost-response retry absorbs.
const withRefreshLock = <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('ramboflow-token-refresh', fn) as Promise<T>;
  }
  return fn();
};

export const tryRefreshAccessToken = async (
  // The access token that just got a 401, if known. Lets us detect that
  // another tab already refreshed while we waited for the cross-tab lock.
  staleAccessToken?: string | null
): Promise<string | null> => {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = withRefreshLock(async () => {
    // Another tab may have rotated the tokens while we held back — if the
    // stored access token differs from the one that failed, just use it.
    const currentAccess = localStorage.getItem('auth_token');
    if (staleAccessToken && currentAccess && currentAccess !== staleAccessToken) {
      return currentAccess;
    }
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      notifySessionExpired();
      return null;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        // Only a definitive rejection of the refresh token ends the session.
        // Transient failures (429 rate limit, 5xx, proxy errors — typical
        // right after the machine wakes from sleep) keep the tokens so a
        // later attempt can still succeed.
        if (response.status === 401 || response.status === 403) {
          notifySessionExpired();
        }
        return null;
      }
      const result = await response.json();
      const newAccess = result?.token as string | undefined;
      const newRefresh = result?.refreshToken as string | undefined;
      if (newAccess) localStorage.setItem('auth_token', newAccess);
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh);
      return newAccess ?? null;
    } catch {
      // Network error — keep the tokens; a later attempt may still succeed.
      return null;
    }
  });
  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
};

// Helper to make authenticated requests
export const authFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token found');
  }

  const buildHeaders = (accessToken: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    ...options.headers,
  });

  let response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: buildHeaders(token),
  });

  // Access token expired — try a single transparent refresh + replay.
  if (response.status === 401) {
    const fresh = await tryRefreshAccessToken(token);
    if (fresh) {
      response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: buildHeaders(fresh),
      });
    }
  }

  return handleResponse(response);
};

// Helper for multipart form data (file uploads)
export const authFetchMultipart = async (url: string, formData: FormData): Promise<any> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token found');
  }

  const buildHeaders = (accessToken: string) => ({
    'Authorization': `Bearer ${accessToken}`,
    // Don't set Content-Type - browser will set it with boundary for FormData
  });

  let response = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: formData,
  });

  if (response.status === 401) {
    const fresh = await tryRefreshAccessToken(token);
    if (fresh) {
      response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers: buildHeaders(fresh),
        body: formData,
      });
    }
  }

  return handleResponse(response);
};
