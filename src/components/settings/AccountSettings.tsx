import { useState } from 'react';
import {
  Edit2, Key, Shield, Trash2, Download, UserIcon,
  Clock, Users, Activity as ActivityIcon
} from 'lucide-react';
import { TimeEntry, Project, Customer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { MFASettings } from '../MFASettings';
import { Modal } from '../Modal';
import { gdprService } from '../../utils/gdpr';
import { authApi, userApi } from '../../services/api';

interface AccountSettingsProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
}

export const AccountSettings = ({
  entries,
  projects,
  customers,
}: AccountSettingsProps) => {
  const { currentUser, logout } = useAuth();

  // Modal states
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [gdprExporting, setGdprExporting] = useState(false);
  const [gdprDeleting, setGdprDeleting] = useState(false);

  // Edit profile state
  const [editDisplayName, setEditDisplayName] = useState(currentUser?.displayName || '');
  const [editEmail, setEditEmail] = useState(currentUser?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleOpenEditProfile = () => {
    setEditDisplayName(currentUser?.displayName || '');
    setEditEmail(currentUser?.email || '');
    setProfileError(null);
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true);
      setProfileError(null);

      await userApi.updateProfile({
        displayName: editDisplayName,
        email: editEmail,
      });

      setEditProfileOpen(false);
      window.location.reload();
    } catch (err: any) {
      setProfileError(err.message || 'Fehler beim Speichern');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleOpenChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setChangePasswordOpen(true);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('Die Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Das Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    try {
      setPasswordSaving(true);
      setPasswordError(null);

      await authApi.changePassword({
        currentPassword,
        newPassword,
      });

      setChangePasswordOpen(false);
    } catch (err: any) {
      setPasswordError(err.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      setGdprExporting(true);
      await gdprService.exportUserData();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setGdprExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Sind Sie sicher, dass Sie Ihren Account löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    try {
      setGdprDeleting(true);
      await gdprService.deleteUserData();
      logout();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setGdprDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500 rounded-lg">
              <ActivityIcon size={20} className="text-white" />
            </div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Zeiteinträge</p>
          </div>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
            {entries.length}
          </p>
          <p className="text-xs text-accent-dark dark:text-blue-300 mt-1">Gesamt erfasst</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl border border-green-200 dark:border-green-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500 rounded-lg">
              <Clock size={20} className="text-white" />
            </div>
            <p className="text-sm font-medium text-green-900 dark:text-green-200">Projekte</p>
          </div>
          <p className="text-3xl font-bold text-green-900 dark:text-green-100">
            {projects.length}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">Aktive Projekte</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl border border-purple-200 dark:border-purple-800 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Users size={20} className="text-white" />
            </div>
            <p className="text-sm font-medium text-purple-900 dark:text-purple-200">Kunden</p>
          </div>
          <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
            {customers.length}
          </p>
          <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Registrierte Kunden</p>
        </div>
      </div>

      {/* Account Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-accent-light dark:bg-blue-900/20 rounded-xl">
            <UserIcon size={24} className="text-accent-primary dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Mein Account</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Persönliche Informationen und Einstellungen</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Account-Typ</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {currentUser?.accountType === 'personal' && '🚀 Freelancer'}
                {currentUser?.accountType === 'freelancer' && '🚀 Freelancer'}
                {currentUser?.accountType === 'business' && '🏢 Unternehmen'}
                {currentUser?.accountType === 'team' && '👥 Team'}
              </p>
            </div>
            {currentUser?.organizationName && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  {currentUser?.accountType === 'business' ? 'Firmenname' : 'Team-Name'}
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser.organizationName}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Benutzername</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser?.username}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">E-Mail</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser?.email}</p>
            </div>
          </div>

          {currentUser?.displayName && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Anzeigename</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{currentUser.displayName}</p>
            </div>
          )}

          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-accent-primary dark:text-blue-400 uppercase tracking-wider mb-1">Mitglied seit</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {currentUser?.createdAt && new Date(currentUser.createdAt).toLocaleDateString('de-DE', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-5 border-t border-gray-200 dark:border-gray-600">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleOpenEditProfile}
                className="flex items-center gap-2 px-5 py-2.5 bg-accent-primary hover:bg-accent-primary text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
              >
                <Edit2 size={18} />
                Profil bearbeiten
              </button>
              <button
                onClick={handleOpenChangePassword}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
              >
                <Key size={18} />
                Passwort ändern
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <MFASettings />

      {/* GDPR / Data Protection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-md">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-accent-light dark:bg-blue-900/20 rounded-xl">
            <Shield size={24} className="text-accent-primary dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Datenschutz (DSGVO)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Deine Daten verwalten</p>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleExportData}
            disabled={gdprExporting}
            className="w-full flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-left"
          >
            <Download size={20} className="text-accent-primary dark:text-blue-400" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {gdprExporting ? 'Exportiere...' : 'Daten exportieren'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Alle deine Daten als JSON herunterladen
              </p>
            </div>
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={gdprDeleting}
            className="w-full flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left"
          >
            <Trash2 size={20} className="text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">
                {gdprDeleting ? 'Lösche...' : 'Account löschen'}
              </p>
              <p className="text-sm text-red-600 dark:text-red-500">
                Alle Daten unwiderruflich löschen
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Profil bearbeiten"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Anzeigename
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              E-Mail
            </label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          {profileError && (
            <p className="text-sm text-red-600 dark:text-red-400">{profileError}</p>
          )}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setEditProfileOpen(false)}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="flex-1 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary disabled:opacity-50"
            >
              {profileSaving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        title="Passwort ändern"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Neues Passwort
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
            />
          </div>
          {passwordError && (
            <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
          )}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setChangePasswordOpen(false)}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              onClick={handleChangePassword}
              disabled={passwordSaving}
              className="flex-1 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary disabled:opacity-50"
            >
              {passwordSaving ? 'Ändern...' : 'Ändern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
