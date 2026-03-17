import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { organizationsApi, Organization, OrganizationMember, OrganizationInvitation } from '../services/api';
import { useAuth } from './AuthContext';

interface TeamContextValue {
  // Organization State
  currentOrganization: Organization | null;
  organizationMembers: OrganizationMember[];
  organizationInvitations: OrganizationInvitation[];

  // Invitation Form State
  newInvitationEmail: string;
  newInvitationRole: 'admin' | 'member' | 'viewer';
  invitationLink: string | null;
  inviteLoading: boolean;
  inviteError: string | null;

  // Computed permissions
  userRole: string | undefined;
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;

  // Actions
  setNewInvitationEmail: (email: string) => void;
  setNewInvitationRole: (role: 'admin' | 'member' | 'viewer') => void;
  loadTeamData: () => Promise<void>;
  createInvitation: () => Promise<void>;
  copyInvitationLink: (link: string) => void;
  deleteInvitation: (invitationId: string) => Promise<void>;
  updateMemberRole: (memberId: string, newRole: 'admin' | 'member' | 'viewer') => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export const useTeam = () => {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
};

interface TeamProviderProps {
  children: ReactNode;
}

export const TeamProvider = ({ children }: TeamProviderProps) => {
  const { currentUser } = useAuth();

  // Organization State
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMember[]>([]);
  const [organizationInvitations, setOrganizationInvitations] = useState<OrganizationInvitation[]>([]);

  // Invitation Form State
  const [newInvitationEmail, setNewInvitationEmail] = useState('');
  const [newInvitationRole, setNewInvitationRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Computed permissions
  const userRole = currentOrganization?.user_role;
  const canEdit = userRole !== 'viewer';
  const canDelete = userRole === 'owner' || userRole === 'admin';
  const canInvite = userRole === 'owner' || userRole === 'admin';

  // Load organization on mount
  useEffect(() => {
    if (currentUser) {
      const loadOrganization = async () => {
        try {
          const orgResponse = await organizationsApi.getCurrent();
          if (orgResponse.success && orgResponse.data) {
            setCurrentOrganization(orgResponse.data);
          }
        } catch (error) {
          console.error('Error loading organization data:', error);
        }
      };
      loadOrganization();
    }
  }, [currentUser]);

  // Load team data (members and invitations)
  const loadTeamData = useCallback(async () => {
    if (!currentOrganization) return;

    try {
      // Load members
      const membersResponse = await organizationsApi.getMembers(currentOrganization.id);
      if (membersResponse.success) {
        setOrganizationMembers(membersResponse.data);
      }

      // Load invitations (for owners/admins)
      if (userRole === 'owner' || userRole === 'admin') {
        const invitationsResponse = await organizationsApi.getInvitations(currentOrganization.id);
        if (invitationsResponse.success) {
          setOrganizationInvitations(invitationsResponse.data);
        }
      }
    } catch (error) {
      console.error('Error loading team data:', error);
    }
  }, [currentOrganization, userRole]);

  // Create invitation
  const createInvitation = useCallback(async () => {
    if (!currentOrganization || !newInvitationEmail.trim()) {
      setInviteError('Bitte gib eine E-Mail-Adresse ein');
      return;
    }

    setInviteLoading(true);
    setInviteError(null);
    setInvitationLink(null);

    try {
      const response = await organizationsApi.createInvitation(
        currentOrganization.id,
        newInvitationEmail.trim(),
        newInvitationRole
      );
      if (response.success) {
        setOrganizationInvitations(prev => [...prev, response.data]);
        const baseUrl = window.location.origin;
        setInvitationLink(`${baseUrl}${response.invitationLink}`);
        setNewInvitationEmail('');
      }
    } catch (error: any) {
      console.error('Error creating invitation:', error);
      setInviteError(error.message || 'Fehler beim Erstellen der Einladung');
    } finally {
      setInviteLoading(false);
    }
  }, [currentOrganization, newInvitationEmail, newInvitationRole]);

  // Copy invitation link
  const copyInvitationLink = useCallback((link: string) => {
    navigator.clipboard.writeText(link);
    alert('Einladungslink kopiert!');
  }, []);

  // Delete invitation
  const deleteInvitation = useCallback(async (invitationId: string) => {
    if (!currentOrganization) return;

    try {
      await organizationsApi.cancelInvitation(currentOrganization.id, invitationId);
      setOrganizationInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    } catch (error) {
      console.error('Error deleting invitation:', error);
      alert('Fehler beim Löschen der Einladung');
    }
  }, [currentOrganization]);

  // Update member role
  const updateMemberRole = useCallback(async (memberId: string, newRole: 'admin' | 'member' | 'viewer') => {
    if (!currentOrganization) return;

    try {
      const response = await organizationsApi.updateMemberRole(currentOrganization.id, memberId, newRole);
      if (response.success) {
        setOrganizationMembers(prev => prev.map(m =>
          m.id === memberId ? { ...m, role: newRole } : m
        ));
      }
    } catch (error) {
      console.error('Error updating member role:', error);
      alert('Fehler beim Andern der Rolle');
    }
  }, [currentOrganization]);

  // Remove member
  const removeMember = useCallback(async (memberId: string) => {
    if (!currentOrganization) return;

    if (!confirm('Mochtest du dieses Mitglied wirklich entfernen?')) return;

    try {
      await organizationsApi.removeMember(currentOrganization.id, memberId);
      setOrganizationMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Fehler beim Entfernen des Mitglieds');
    }
  }, [currentOrganization]);

  const value: TeamContextValue = {
    currentOrganization,
    organizationMembers,
    organizationInvitations,
    newInvitationEmail,
    newInvitationRole,
    invitationLink,
    inviteLoading,
    inviteError,
    userRole,
    canEdit,
    canDelete,
    canInvite,
    setNewInvitationEmail,
    setNewInvitationRole,
    loadTeamData,
    createInvitation,
    copyInvitationLink,
    deleteInvitation,
    updateMemberRole,
    removeMember,
  };

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
};
