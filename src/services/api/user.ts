/**
 * User API
 * Handles user settings, teams, organizations, and features
 */

import { CompanyInfo, Team, TeamInvitation } from '../../types';
import { API_BASE_URL, authFetch, handleResponse } from './base';

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
    heartbeatIntervalMinutes?: 1 | 5 | 15;
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

// Organization types
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

// Organizations API
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
  createInvitation: async (orgId: string, email: string, role: 'admin' | 'member' | 'viewer' = 'member'): Promise<{ success: boolean; data: OrganizationInvitation; invitationLink: string; userAlreadyExists?: boolean; message?: string }> => {
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
  getInvitationInfo: async (code: string): Promise<{ success: boolean; data: { organizationName: string; logo: string | null; role: string; invitedBy: string; expiresAt: string; invitedEmail?: string; userAlreadyExists?: boolean } }> => {
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

// Feature types
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

// Features API
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
