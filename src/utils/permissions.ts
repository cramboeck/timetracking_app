import { User, TeamRole } from '../types';
import { storage } from './storage';

/**
 * Permissions utility for team-based access control
 */

export const permissions = {
  /**
   * Check if current user can view another user's data
   */
  canViewUser: (currentUser: User, targetUserId: string): boolean => {
    // Users can always view their own data
    if (currentUser.id === targetUserId) {
      return true;
    }

    // Non-team users can only view their own data
    if (!currentUser.teamId) {
      return false;
    }

    // Get target user
    const targetUser = storage.getUsers().find(u => u.id === targetUserId);
    if (!targetUser) {
      return false;
    }

    // Check if target user is in the same team
    if (currentUser.teamId !== targetUser.teamId) {
      return false;
    }

    // Owner and Admin can view all team members
    if (currentUser.teamRole === 'owner' || currentUser.teamRole === 'admin') {
      return true;
    }

    // Regular members can only view their own data
    return false;
  },

  /**
   * Check if current user can edit another user's data
   */
  canEditUser: (currentUser: User, targetUserId: string): boolean => {
    // Users can always edit their own data
    if (currentUser.id === targetUserId) {
      return true;
    }

    // Only team owners can edit other users
    if (currentUser.teamRole === 'owner' && currentUser.teamId) {
      const targetUser = storage.getUsers().find(u => u.id === targetUserId);
      return targetUser?.teamId === currentUser.teamId;
    }

    return false;
  },

  /**
   * Check if current user can manage team (add/remove members, change roles)
   */
  canManageTeam: (currentUser: User): boolean => {
    return currentUser.teamRole === 'owner' || currentUser.teamRole === 'admin';
  },

  /**
   * Get all users that current user can view
   */
  getViewableUsers: (currentUser: User): User[] => {
    const allUsers = storage.getUsers();

    // Personal/Business accounts can only see themselves
    if (!currentUser.teamId) {
      return [currentUser];
    }

    // Team owners and admins can see all team members
    if (currentUser.teamRole === 'owner' || currentUser.teamRole === 'admin') {
      return allUsers.filter(u => u.teamId === currentUser.teamId);
    }

    // Regular team members can only see themselves
    return [currentUser];
  },

  /**
   * Get role display name
   */
  getRoleDisplayName: (role?: TeamRole): string => {
    if (!role) return '';

    const roleNames: Record<TeamRole, string> = {
      owner: 'Team-Owner',
      admin: 'Administrator',
      member: 'Mitglied'
    };

    return roleNames[role];
  },

  /**
   * Get role icon
   */
  getRoleIcon: (role?: TeamRole): string => {
    if (!role) return '';

    const roleIcons: Record<TeamRole, string> = {
      owner: '👑',
      admin: '⭐',
      member: '👤'
    };

    return roleIcons[role];
  }
};
