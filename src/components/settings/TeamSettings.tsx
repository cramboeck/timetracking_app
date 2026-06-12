import { useEffect } from 'react';
import { Building, Users2, UserPlus, Shield, Copy, Trash2, Plus } from 'lucide-react';
import { useTeam } from '../../contexts/TeamContext';
import { useAuth } from '../../contexts/AuthContext';

export const TeamSettings = () => {
  const { currentUser } = useAuth();
  const {
    currentOrganization,
    organizationMembers,
    organizationInvitations,
    newInvitationEmail,
    newInvitationRole,
    invitationLink,
    inviteLoading,
    inviteError,
    setNewInvitationEmail,
    setNewInvitationRole,
    loadTeamData,
    createInvitation,
    copyInvitationLink,
    deleteInvitation,
    updateMemberRole,
    removeMember,
  } = useTeam();

  // Load team data when component mounts
  useEffect(() => {
    if (currentOrganization) {
      loadTeamData();
    }
  }, [currentOrganization, loadTeamData]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Organization Header */}
      {currentOrganization && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Building size={24} className="text-accent-primary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{currentOrganization.name}</h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Deine Organisation - {organizationMembers.length} Mitglied(er)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users2 size={24} className="text-accent-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Team-Mitglieder</h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              {organizationMembers.length} Mitglied(er) im Team
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {organizationMembers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400">
              <Users2 size={48} className="mx-auto mb-4 opacity-50" />
              <p>Keine Team-Mitglieder</p>
            </div>
          ) : (
            organizationMembers.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-primary flex items-center justify-center text-white font-semibold">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {member.display_name || member.username}
                      </span>
                      {member.user_id === currentUser?.id && (
                        <span className="text-xs px-2 py-0.5 bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary rounded">Du</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-dark-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Role Badge */}
                  <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                    member.role === 'owner'
                      ? 'bg-accent-lighter dark:bg-accent-primary/20 text-accent-primary dark:text-accent-primary'
                      : member.role === 'admin'
                      ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary'
                      : member.role === 'viewer'
                      ? 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  }`}>
                    <Shield size={12} />
                    {member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : member.role === 'viewer' ? 'Viewer' : 'Mitglied'}
                  </span>

                  {/* Actions for admins/owners (can't modify owner or self) */}
                  {(currentOrganization?.user_role === 'owner' || currentOrganization?.user_role === 'admin') &&
                   member.role !== 'owner' &&
                   member.user_id !== currentUser?.id && (
                    <div className="flex gap-1">
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value as 'admin' | 'member' | 'viewer')}
                        className="text-xs px-2 py-1 border border-gray-300 dark:border-dark-200 rounded bg-white dark:bg-dark-100 text-gray-700 dark:text-dark-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Mitglied</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => removeMember(member.id)}
                        className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Mitglied entfernen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Team Invitations (only for owners/admins) */}
      {(currentOrganization?.user_role === 'owner' || currentOrganization?.user_role === 'admin') && (
        <div className="bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <UserPlus size={24} className="text-accent-primary" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Team-Einladungen</h2>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  Lade neue Mitglieder zu deinem Team ein
                </p>
              </div>
            </div>
          </div>

          {/* Create New Invitation */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-50 rounded-lg">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Neue Einladung erstellen</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={newInvitationEmail}
                onChange={(e) => setNewInvitationEmail(e.target.value)}
                placeholder="E-Mail-Adresse"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <select
                value={newInvitationRole}
                onChange={(e) => setNewInvitationRole(e.target.value as 'admin' | 'member' | 'viewer')}
                className="px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value="member">Mitglied</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer (nur lesen)</option>
              </select>
              <button
                onClick={createInvitation}
                disabled={inviteLoading || !newInvitationEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50"
              >
                <Plus size={18} />
                {inviteLoading ? 'Erstelle...' : 'Einladung erstellen'}
              </button>
            </div>

            {inviteError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{inviteError}</p>
            )}

            {invitationLink && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                  Einladung erstellt! Teile diesen Link:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white dark:bg-dark-100 border border-gray-300 dark:border-dark-200 rounded text-sm font-mono text-gray-900 dark:text-white overflow-x-auto">
                    {invitationLink}
                  </code>
                  <button
                    onClick={() => copyInvitationLink(invitationLink)}
                    className="p-2 text-accent-primary hover:bg-accent-light dark:hover:bg-accent-lighter/10 rounded-lg transition-colors"
                    title="Link kopieren"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Invitations */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">
              Aktive Einladungen ({organizationInvitations.length})
            </h3>
            {organizationInvitations.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">
                Keine aktiven Einladungen
              </p>
            ) : (
              organizationInvitations.map(invitation => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {invitation.email}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        invitation.role === 'admin'
                          ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary'
                          : invitation.role === 'viewer'
                          ? 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      }`}>
                        {invitation.role === 'admin' ? 'Admin' : invitation.role === 'viewer' ? 'Viewer' : 'Mitglied'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-400">
                      Gultig bis {new Date(invitation.expires_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyInvitationLink(`${window.location.origin}/join/${invitation.invitation_code}`)}
                      className="p-2 text-accent-primary hover:bg-accent-light dark:hover:bg-accent-lighter/10 rounded-lg transition-colors"
                      title="Link kopieren"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      onClick={() => deleteInvitation(invitation.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Einladung löschen"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
