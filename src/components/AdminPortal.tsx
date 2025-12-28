import { useState, useEffect } from 'react';
import {
  Users,
  BarChart3,
  Shield,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Package,
  ToggleLeft,
  ToggleRight,
  HardDrive,
  Upload,
  RefreshCw,
  Archive,
  FileArchive,
  AlertTriangle
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../contexts/AuthContext';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalEntries: number;
  totalProjects: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  lastLoginAt: string | null;
  entriesCount: number;
}

interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

interface FeaturePackage {
  packageName: string;
  enabled: boolean;
  enabledAt: string | null;
  expiresAt: string | null;
}

interface FeatureUser {
  id: string;
  username: string;
  email: string;
  account_type: string;
  created_at: string;
  packages: FeaturePackage[];
}

interface PackageDefinition {
  name: string;
  label: string;
  description: string;
  features: string[];
}

interface BackupFile {
  filename: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
  compressed: boolean;
}

type AdminTab = 'dashboard' | 'users' | 'features' | 'audit' | 'backup';

export default function AdminPortal() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dashboard state
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  // Features state
  const [featureUsers, setFeatureUsers] = useState<FeatureUser[]>([]);
  const [packageDefinitions, setPackageDefinitions] = useState<PackageDefinition[]>([]);
  const [featuresPage, setFeaturesPage] = useState(1);
  const [featuresTotalPages, setFeaturesTotalPages] = useState(1);
  const [featuresSearch, setFeaturesSearch] = useState('');
  const [featuresLoading, setFeaturesLoading] = useState(false);

  // Backup state
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupDir, setBackupDir] = useState<string>('');
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupRestoring, setBackupRestoring] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = currentUser?.role === 'admin';

  // Load dashboard stats
  useEffect(() => {
    if (!isAdmin) return;

    const loadStats = async () => {
      try {
        setLoading(true);
        const response = await adminApi.getStats();
        // Backend returns stats directly, not wrapped in data
        setStats({
          totalUsers: response.totalUsers,
          activeUsers: response.activeUsers,
          totalEntries: response.totalEntries,
          totalProjects: response.totalProjects || 0
        });
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden der Statistiken');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [isAdmin]);

  // Load users when tab changes or search/page changes
  useEffect(() => {
    if (activeTab !== 'users' || !isAdmin) return;

    const loadUsers = async () => {
      try {
        setUsersLoading(true);
        const response = await adminApi.getUsers(usersPage, 20, usersSearch);
        // Backend returns users directly with pagination object
        const usersList = response.users || [];
        setUsers(usersList.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role || 'user',
          createdAt: u.created_at,
          lastLoginAt: u.last_login,
          entriesCount: u.entry_count || 0
        })));
        setUsersTotalPages(response.pagination?.pages || 1);
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden der Benutzer');
      } finally {
        setUsersLoading(false);
      }
    };

    const debounce = setTimeout(loadUsers, usersSearch ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [activeTab, usersPage, usersSearch, isAdmin]);

  // Load audit logs when tab changes
  useEffect(() => {
    if (activeTab !== 'audit' || !isAdmin) return;

    const loadAuditLogs = async () => {
      try {
        setAuditLoading(true);
        const response = await adminApi.getAuditLogs(auditPage, 50);
        // Backend returns logs directly with pagination object
        const logsList = response.logs || [];
        setAuditLogs(logsList.map((l: any) => ({
          id: l.id,
          userId: l.user_id,
          username: l.username || 'Unbekannt',
          action: l.action,
          details: l.details,
          ipAddress: l.ip_address || l.ipAddress || '-',
          createdAt: l.timestamp || l.created_at
        })));
        setAuditTotalPages(response.pagination?.pages || 1);
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden der Audit-Logs');
      } finally {
        setAuditLoading(false);
      }
    };

    loadAuditLogs();
  }, [activeTab, auditPage, isAdmin]);

  // Load features when tab changes or search/page changes
  useEffect(() => {
    if (activeTab !== 'features' || !isAdmin) return;

    const loadFeatures = async () => {
      try {
        setFeaturesLoading(true);
        const response = await adminApi.getFeatures(featuresPage, 20, featuresSearch);
        setFeatureUsers(response.users || []);
        setPackageDefinitions(response.packages || []);
        setFeaturesTotalPages(response.pagination?.pages || 1);
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden der Features');
      } finally {
        setFeaturesLoading(false);
      }
    };

    const debounce = setTimeout(loadFeatures, featuresSearch ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [activeTab, featuresPage, featuresSearch, isAdmin]);

  // Load backups when tab changes
  useEffect(() => {
    if (activeTab !== 'backup' || !isAdmin) return;
    loadBackups();
  }, [activeTab, isAdmin]);

  const loadBackups = async () => {
    try {
      setBackupsLoading(true);
      const response = await adminApi.getBackups();
      setBackups(response.backups || []);
      setBackupDir(response.backupDir || '');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupCreating(true);
      await adminApi.createBackup(true);
      await loadBackups();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen des Backups');
    } finally {
      setBackupCreating(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    try {
      setBackupRestoring(filename);
      await adminApi.restoreBackup(filename);
      setRestoreConfirmOpen(null);
      alert('Datenbank wurde wiederhergestellt. Bitte Seite neu laden.');
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Fehler bei der Wiederherstellung');
    } finally {
      setBackupRestoring(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Backup "${filename}" wirklich löschen?`)) return;
    try {
      await adminApi.deleteBackup(filename);
      await loadBackups();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Löschen des Backups');
    }
  };

  // Handle feature toggle
  const handleFeatureToggle = async (userId: string, packageName: string, currentlyEnabled: boolean) => {
    try {
      await adminApi.updateUserFeature(userId, packageName, !currentlyEnabled);
      // Refresh the list
      const response = await adminApi.getFeatures(featuresPage, 20, featuresSearch);
      setFeatureUsers(response.users || []);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern des Features');
    }
  };

  // Check if user has package enabled
  const hasPackage = (user: FeatureUser, packageName: string): boolean => {
    const pkg = user.packages?.find(p => p.packageName === packageName);
    return pkg?.enabled || false;
  };

  // Handle role change
  const handleRoleChange = async (userId: string, newRole: 'user' | 'admin') => {
    try {
      await adminApi.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern der Rolle');
    }
  };

  // Handle user delete
  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Benutzer "${username}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    try {
      await adminApi.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      setError(err.message || 'Fehler beim Löschen des Benutzers');
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nie';
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Not admin - show access denied
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Shield size={64} className="text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          Zugriff verweigert
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Du hast keine Berechtigung für den Admin-Bereich.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="text-purple-600" size={28} />
          <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Admin Portal</h1>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 px-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'dashboard'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <BarChart3 size={18} />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Users size={18} />
            Benutzer
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'features'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Package size={18} />
            Features
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Clock size={18} />
            Audit-Log
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'backup'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <HardDrive size={18} />
            Backup
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-600" size={32} />
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Users className="text-blue-600 dark:text-blue-400" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Benutzer gesamt</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalUsers}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Aktive Benutzer</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.activeUsers}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <Clock className="text-purple-600 dark:text-purple-400" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Zeiteinträge</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalEntries.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <Database className="text-orange-600 dark:text-orange-400" size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Projekte</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalProjects}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Benutzer suchen..."
                value={usersSearch}
                onChange={(e) => {
                  setUsersSearch(e.target.value);
                  setUsersPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Benutzer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rolle</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Einträge</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Letzter Login</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Erstellt</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {users.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">{user.username}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value as 'user' | 'admin')}
                              disabled={user.id === currentUser?.id}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                user.role === 'admin'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              } ${user.id === currentUser?.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {user.entriesCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(user.lastLoginAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteUser(user.id, user.username)}
                              disabled={user.id === currentUser?.id}
                              className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Benutzer löschen"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {usersTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                    disabled={usersPage === 1}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                    Zurück
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {usersPage} von {usersTotalPages}
                  </span>
                  <button
                    onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                    disabled={usersPage === usersTotalPages}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    Weiter
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Features Tab */}
        {activeTab === 'features' && (
          <div className="space-y-4">
            {/* Package Legend */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Verfügbare Pakete:</h3>
              <div className="flex flex-wrap gap-4">
                {packageDefinitions.map(pkg => (
                  <div key={pkg.name} className="flex items-start gap-2">
                    <div className={`w-3 h-3 rounded-full mt-1 ${
                      pkg.name === 'support' ? 'bg-blue-500' : 'bg-green-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">{pkg.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pkg.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Benutzer suchen..."
                value={featuresSearch}
                onChange={(e) => {
                  setFeaturesSearch(e.target.value);
                  setFeaturesPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Features Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {featuresLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Benutzer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account-Typ</th>
                        {packageDefinitions.map(pkg => (
                          <th key={pkg.name} className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {pkg.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {featureUsers.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white">{user.username}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              user.account_type === 'business'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : user.account_type === 'team'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {user.account_type}
                            </span>
                          </td>
                          {packageDefinitions.map(pkg => (
                            <td key={pkg.name} className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleFeatureToggle(user.id, pkg.name, hasPackage(user, pkg.name))}
                                className={`p-1 rounded transition-colors ${
                                  hasPackage(user, pkg.name)
                                    ? 'text-green-600 hover:text-green-800 dark:text-green-400'
                                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500'
                                }`}
                                title={hasPackage(user, pkg.name) ? 'Deaktivieren' : 'Aktivieren'}
                              >
                                {hasPackage(user, pkg.name) ? (
                                  <ToggleRight size={24} />
                                ) : (
                                  <ToggleLeft size={24} />
                                )}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {featuresTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setFeaturesPage(p => Math.max(1, p - 1))}
                    disabled={featuresPage === 1}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                    Zurück
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {featuresPage} von {featuresTotalPages}
                  </span>
                  <button
                    onClick={() => setFeaturesPage(p => Math.min(featuresTotalPages, p + 1))}
                    disabled={featuresPage === featuresTotalPages}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    Weiter
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {auditLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zeit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Benutzer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktion</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white">
                            {log.username}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                            {log.details}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500 font-mono">
                            {log.ipAddress}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {auditTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                    disabled={auditPage === 1}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                    Zurück
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {auditPage} von {auditTotalPages}
                  </span>
                  <button
                    onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage === auditTotalPages}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    Weiter
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backup Tab */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            {/* Header with actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold dark:text-white">Datenbank-Backups</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Verzeichnis: {backupDir}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadBackups}
                  disabled={backupsLoading}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <RefreshCw size={16} className={backupsLoading ? 'animate-spin' : ''} />
                  Aktualisieren
                </button>
                <button
                  onClick={handleCreateBackup}
                  disabled={backupCreating}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {backupCreating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Archive size={16} />
                  )}
                  {backupCreating ? 'Erstelle...' : 'Neues Backup'}
                </button>
              </div>
            </div>

            {/* Backup List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {backupsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : backups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <FileArchive size={48} className="mb-3 opacity-50" />
                  <p>Keine Backups vorhanden</p>
                  <p className="text-sm">Erstelle ein neues Backup um zu beginnen</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dateiname</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Größe</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Erstellt</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Komprimiert</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {backups.map(backup => (
                        <tr key={backup.filename} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileArchive size={18} className="text-gray-400" />
                              <span className="text-sm font-medium text-gray-800 dark:text-white font-mono">
                                {backup.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {backup.size}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(backup.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            {backup.compressed ? (
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
                                Ja (.gz)
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded">
                                Nein
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {restoreConfirmOpen === backup.filename ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-red-600 dark:text-red-400">Wirklich wiederherstellen?</span>
                                  <button
                                    onClick={() => handleRestoreBackup(backup.filename)}
                                    disabled={backupRestoring === backup.filename}
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {backupRestoring === backup.filename ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      'Ja'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setRestoreConfirmOpen(null)}
                                    className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-300"
                                  >
                                    Nein
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setRestoreConfirmOpen(backup.filename)}
                                    className="p-1.5 text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
                                    title="Backup wiederherstellen"
                                  >
                                    <Upload size={18} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBackup(backup.filename)}
                                    className="p-1.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                    title="Backup löschen"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 dark:text-yellow-300">Hinweis zur Wiederherstellung</p>
                  <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                    Die Wiederherstellung eines Backups überschreibt die aktuelle Datenbank vollständig.
                    Nach der Wiederherstellung wird ein Seiten-Reload durchgeführt.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
