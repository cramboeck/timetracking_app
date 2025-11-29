import { useState } from 'react';
import { ArrowLeft, User, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { customerPortalApi, PortalContact } from '../../services/api';

interface PortalProfileProps {
  contact: PortalContact;
  onBack: () => void;
}

export const PortalProfile = ({ contact, onBack }: PortalProfileProps) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein');
      return;
    }

    try {
      setLoading(true);
      await customerPortalApi.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Profil & Einstellungen
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verwalten Sie Ihre Kontodaten
            </p>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <User size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {contact.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">{contact.email}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {contact.customerName}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Tickets erstellen
            </p>
            <p className="font-medium text-gray-900 dark:text-white">
              {contact.canCreateTickets ? 'Ja' : 'Nein'}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Alle Tickets sehen
            </p>
            <p className="font-medium text-gray-900 dark:text-white">
              {contact.canViewAllTickets ? 'Ja' : 'Nur eigene'}
            </p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Lock size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Passwort ändern
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aktualisieren Sie Ihr Passwort regelmäßig
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
            <Check className="text-green-600 dark:text-green-400" size={20} />
            <p className="text-green-700 dark:text-green-300">
              Passwort wurde erfolgreich geändert!
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Aktuelles Passwort
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="Ihr aktuelles Passwort"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Neues Passwort
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="Mindestens 8 Zeichen"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Neues Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Passwort wiederholen"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium transition-colors"
          >
            {loading ? 'Wird geändert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  );
};
