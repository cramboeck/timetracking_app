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
  AlertTriangle,
  Activity,
  Server,
  Cpu,
  Bell,
  Plus,
  Lock,
  UserX,
  Terminal,
  Zap,
  Mail,
  Send,
  XCircle,
  X
} from 'lucide-react';
import { Button, IconButton } from './ui/Button';
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

interface SystemStatus {
  timestamp: string;
  database: { status: string; latency: number; error?: string };
  docker: { containers: Array<{ name: string; status: string; image: string }>; error?: string };
  disk: { total: string; used: string; percentage: number; error?: string };
  memory: { total: string; used: string; percentage: number; error?: string };
  uptime: number;
}

interface DatabaseStats {
  databaseSize: string;
  tables: Array<{ table_name: string; total_size: string; size_bytes: number; row_count: number }>;
  connections: { total: number; active: number; idle: number };
  indexes: Array<{ table_name: string; index_name: string; scans: number; size: string }>;
  cacheHitRatio: string;
}

interface SecurityData {
  sessions: Array<{ id: string; user_id: string; username: string; email: string; created_at: string }>;
  loginStats: {
    attempts: Record<string, number>;
    failedByIp: Array<{ ip_address: string; attempts: number; last_attempt: string }>;
  };
}

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface EmailStats {
  today: { total: number; sent: number; failed: number };
  week: { total: number; sent: number; failed: number };
  month: { total: number; sent: number; failed: number };
  byProvider: Array<{ provider: string; total: number; sent: number; failed: number }>;
  byType: Array<{ type: string; total: number; sent: number; failed: number }>;
  avgProcessingTime: number;
  trend: Array<{ date: string; total: number; sent: number; failed: number }>;
  recentFailures: Array<{ id: string; email_type: string; recipient_email: string; error_message: string; created_at: string }>;
}

interface EmailLog {
  id: string;
  email_type: string;
  subject: string;
  recipient_email: string;
  recipient_name: string | null;
  sender_email: string;
  provider: string;
  status: string;
  error_message: string | null;
  processing_time_ms: number | null;
  created_at: string;
  username: string | null;
}

interface EmailConfig {
  provider: string;
  status: string;
  error?: string;
  details?: any;
  config: {
    emailProvider: string;
    smtpConfigured: boolean;
    graphConfigured: boolean;
    testMode: boolean;
    fromAddress: string;
  };
}

type AdminTab = 'dashboard' | 'users' | 'features' | 'audit' | 'backup' | 'system' | 'database' | 'security' | 'logs' | 'notifications' | 'email';

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

  // System status state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);

  // Database stats state
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [databaseStatsLoading, setDatabaseStatsLoading] = useState(false);
  const [vacuumRunning, setVacuumRunning] = useState(false);

  // Security state
  const [securityData, setSecurityData] = useState<SecurityData | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logType, setLogType] = useState<string>('app');

  // Notifications state
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [newNotification, setNewNotification] = useState({ title: '', message: '', type: 'info' });
  const [showNotificationForm, setShowNotificationForm] = useState(false);

  // Email Dashboard state
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailLogsPage, setEmailLogsPage] = useState(1);
  const [emailLogsTotalPages, setEmailLogsTotalPages] = useState(1);
  const [emailLogsSearch, setEmailLogsSearch] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<string>('');
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // Load system status
  useEffect(() => {
    if (activeTab !== 'system' || !isAdmin) return;
    loadSystemStatus();
  }, [activeTab, isAdmin]);

  const loadSystemStatus = async () => {
    try {
      setSystemStatusLoading(true);
      const response = await adminApi.getSystemStatus();
      setSystemStatus(response);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden des Systemstatus');
    } finally {
      setSystemStatusLoading(false);
    }
  };

  // Load database stats
  useEffect(() => {
    if (activeTab !== 'database' || !isAdmin) return;
    loadDatabaseStats();
  }, [activeTab, isAdmin]);

  const loadDatabaseStats = async () => {
    try {
      setDatabaseStatsLoading(true);
      const response = await adminApi.getDatabaseStats();
      setDatabaseStats(response);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Datenbankstatistiken');
    } finally {
      setDatabaseStatsLoading(false);
    }
  };

  const handleVacuum = async () => {
    if (!confirm('VACUUM ANALYZE ausführen? Dies kann einige Zeit dauern.')) return;
    try {
      setVacuumRunning(true);
      await adminApi.runVacuum();
      await loadDatabaseStats();
    } catch (err: any) {
      setError(err.message || 'VACUUM fehlgeschlagen');
    } finally {
      setVacuumRunning(false);
    }
  };

  // Load security data
  useEffect(() => {
    if (activeTab !== 'security' || !isAdmin) return;
    loadSecurityData();
  }, [activeTab, isAdmin]);

  const loadSecurityData = async () => {
    try {
      setSecurityLoading(true);
      const response = await adminApi.getSecurityData();
      setSecurityData(response);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Sicherheitsdaten');
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleInvalidateSessions = async (userId: string, username: string) => {
    if (!confirm(`Alle Sessions von "${username}" invalidieren?`)) return;
    try {
      await adminApi.invalidateUserSessions(userId);
      await loadSecurityData();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Invalidieren der Sessions');
    }
  };

  // Load logs
  useEffect(() => {
    if (activeTab !== 'logs' || !isAdmin) return;
    loadLogs();
  }, [activeTab, logType, isAdmin]);

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const response = await adminApi.getSystemLogs(100, logType);
      setLogs(response.logs || []);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Logs');
    } finally {
      setLogsLoading(false);
    }
  };

  // Load notifications
  useEffect(() => {
    if (activeTab !== 'notifications' || !isAdmin) return;
    loadNotifications();
  }, [activeTab, isAdmin]);

  const loadNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const response = await adminApi.getNotifications();
      setNotifications(response.notifications || []);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Benachrichtigungen');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleCreateNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      setError('Titel und Nachricht sind erforderlich');
      return;
    }
    try {
      await adminApi.createNotification(newNotification.title, newNotification.message, newNotification.type);
      setNewNotification({ title: '', message: '', type: 'info' });
      setShowNotificationForm(false);
      await loadNotifications();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Benachrichtigung');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!confirm('Benachrichtigung wirklich löschen?')) return;
    try {
      await adminApi.deleteNotification(id);
      await loadNotifications();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Löschen');
    }
  };

  const handleToggleNotification = async (id: string) => {
    try {
      await adminApi.toggleNotification(id);
      await loadNotifications();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Umschalten');
    }
  };

  // Load email dashboard data
  useEffect(() => {
    if (activeTab !== 'email' || !isAdmin) return;
    loadEmailData();
  }, [activeTab, isAdmin]);

  // Load email logs when page/filter changes
  useEffect(() => {
    if (activeTab !== 'email' || !isAdmin) return;
    loadEmailLogs();
  }, [emailLogsPage, emailStatusFilter, emailLogsSearch, activeTab, isAdmin]);

  const loadEmailData = async () => {
    try {
      setEmailLoading(true);
      const [statsRes, configRes] = await Promise.all([
        adminApi.getEmailStats(),
        adminApi.getEmailConfig()
      ]);
      setEmailStats(statsRes);
      setEmailConfig(configRes);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Email-Daten');
    } finally {
      setEmailLoading(false);
    }
  };

  const loadEmailLogs = async () => {
    try {
      const response = await adminApi.getEmailLogs(emailLogsPage, 20, {
        status: emailStatusFilter || undefined,
        search: emailLogsSearch || undefined
      });
      setEmailLogs(response.logs || []);
      setEmailLogsTotalPages(response.pagination?.pages || 1);
    } catch (err: any) {
      console.error('Error loading email logs:', err);
    }
  };

  const handleSendTestEmail = async () => {
    try {
      setTestEmailSending(true);
      setTestEmailResult(null);
      const response = await adminApi.sendTestEmail(testEmailAddress || undefined);
      setTestEmailResult({ success: true, message: response.message });
      setTestEmailAddress('');
      // Reload data to show the new test email in logs
      await loadEmailData();
      await loadEmailLogs();
    } catch (err: any) {
      setTestEmailResult({ success: false, message: err.message || 'Fehler beim Senden' });
    } finally {
      setTestEmailSending(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
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
          <IconButton
            icon={<X size={18} />}
            onClick={() => setError(null)}
            variant="danger"
            size="sm"
            tooltip="Fehler schließen"
            className="ml-auto"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <div className="flex gap-1 px-4 min-w-max">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <BarChart3 size={18} />
            <span className="hidden sm:inline">Dashboard</span>
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
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <HardDrive size={18} />
            <span className="hidden sm:inline">Backup</span>
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'system'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Activity size={18} />
            <span className="hidden sm:inline">System</span>
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Database size={18} />
            <span className="hidden sm:inline">Datenbank</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Lock size={18} />
            <span className="hidden sm:inline">Sicherheit</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Terminal size={18} />
            <span className="hidden sm:inline">Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Bell size={18} />
            <span className="hidden sm:inline">Meldungen</span>
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'email'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Mail size={18} />
            <span className="hidden sm:inline">E-Mail</span>
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
                            <IconButton
                              icon={<Trash2 size={18} />}
                              onClick={() => handleDeleteUser(user.id, user.username)}
                              disabled={user.id === currentUser?.id}
                              variant="danger"
                              tooltip="Benutzer löschen"
                            />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                    disabled={usersPage === 1}
                    icon={<ChevronLeft size={16} />}
                  >
                    Zurück
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {usersPage} von {usersTotalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                    disabled={usersPage === usersTotalPages}
                    icon={<ChevronRight size={16} />}
                    iconPosition="right"
                  >
                    Weiter
                  </Button>
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
                              <IconButton
                                icon={hasPackage(user, pkg.name) ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                onClick={() => handleFeatureToggle(user.id, pkg.name, hasPackage(user, pkg.name))}
                                variant={hasPackage(user, pkg.name) ? 'success' : 'default'}
                                tooltip={hasPackage(user, pkg.name) ? 'Deaktivieren' : 'Aktivieren'}
                              />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFeaturesPage(p => Math.max(1, p - 1))}
                    disabled={featuresPage === 1}
                    icon={<ChevronLeft size={16} />}
                  >
                    Zurück
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {featuresPage} von {featuresTotalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFeaturesPage(p => Math.min(featuresTotalPages, p + 1))}
                    disabled={featuresPage === featuresTotalPages}
                    icon={<ChevronRight size={16} />}
                    iconPosition="right"
                  >
                    Weiter
                  </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                    disabled={auditPage === 1}
                    icon={<ChevronLeft size={16} />}
                  >
                    Zurück
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Seite {auditPage} von {auditTotalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage === auditTotalPages}
                    icon={<ChevronRight size={16} />}
                    iconPosition="right"
                  >
                    Weiter
                  </Button>
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadBackups}
                  disabled={backupsLoading}
                  loading={backupsLoading}
                  icon={<RefreshCw size={16} />}
                >
                  Aktualisieren
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateBackup}
                  disabled={backupCreating}
                  loading={backupCreating}
                  icon={<Archive size={16} />}
                >
                  {backupCreating ? 'Erstelle...' : 'Neues Backup'}
                </Button>
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
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleRestoreBackup(backup.filename)}
                                    disabled={backupRestoring === backup.filename}
                                    loading={backupRestoring === backup.filename}
                                  >
                                    Ja
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setRestoreConfirmOpen(null)}
                                  >
                                    Nein
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <IconButton
                                    icon={<Upload size={18} />}
                                    onClick={() => setRestoreConfirmOpen(backup.filename)}
                                    variant="warning"
                                    tooltip="Backup wiederherstellen"
                                  />
                                  <IconButton
                                    icon={<Trash2 size={18} />}
                                    onClick={() => handleDeleteBackup(backup.filename)}
                                    variant="danger"
                                    tooltip="Backup löschen"
                                  />
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

        {/* System Status Tab */}
        {activeTab === 'system' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">System-Status</h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadSystemStatus}
                disabled={systemStatusLoading}
                loading={systemStatusLoading}
                icon={<RefreshCw size={16} />}
              >
                Aktualisieren
              </Button>
            </div>

            {systemStatusLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-600" size={32} />
              </div>
            ) : systemStatus ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Database Status */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${systemStatus.database.status === 'connected' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                      <Database className={systemStatus.database.status === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} size={20} />
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">Datenbank</p>
                      <p className={`text-sm ${systemStatus.database.status === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {systemStatus.database.status === 'connected' ? 'Verbunden' : 'Fehler'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Latenz: {systemStatus.database.latency}ms
                  </p>
                </div>

                {/* Memory Usage */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Cpu className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">Arbeitsspeicher</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {systemStatus.memory.used} / {systemStatus.memory.total}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${systemStatus.memory.percentage > 90 ? 'bg-red-500' : systemStatus.memory.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${systemStatus.memory.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{systemStatus.memory.percentage}% belegt</p>
                </div>

                {/* Disk Usage */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <HardDrive className="text-purple-600 dark:text-purple-400" size={20} />
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">Festplatte</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {systemStatus.disk.used} / {systemStatus.disk.total}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${systemStatus.disk.percentage > 90 ? 'bg-red-500' : systemStatus.disk.percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${systemStatus.disk.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{systemStatus.disk.percentage}% belegt</p>
                </div>

                {/* Uptime */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <Clock className="text-orange-600 dark:text-orange-400" size={20} />
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">Server Uptime</p>
                      <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                        {formatUptime(systemStatus.uptime)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Docker Containers */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 md:col-span-2">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                      <Server className="text-cyan-600 dark:text-cyan-400" size={20} />
                    </div>
                    <p className="font-medium dark:text-white">Docker Container</p>
                  </div>
                  {systemStatus.docker.error ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{systemStatus.docker.error}</p>
                  ) : systemStatus.docker.containers.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Keine Container gefunden</p>
                  ) : (
                    <div className="space-y-2">
                      {systemStatus.docker.containers.map((container, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${container.status.includes('Up') ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm font-medium dark:text-white">{container.name}</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{container.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Keine Daten verfügbar</p>
            )}
          </div>
        )}

        {/* Database Stats Tab */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">Datenbank-Statistiken</h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadDatabaseStats}
                  disabled={databaseStatsLoading}
                  loading={databaseStatsLoading}
                  icon={<RefreshCw size={16} />}
                >
                  Aktualisieren
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleVacuum}
                  disabled={vacuumRunning}
                  loading={vacuumRunning}
                  icon={<Zap size={16} />}
                >
                  VACUUM
                </Button>
              </div>
            </div>

            {databaseStatsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-600" size={32} />
              </div>
            ) : databaseStats ? (
              <div className="space-y-4">
                {/* Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Datenbankgröße</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{databaseStats.databaseSize}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Verbindungen</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {databaseStats.connections.active} <span className="text-sm font-normal text-gray-500">aktiv</span> / {databaseStats.connections.total} <span className="text-sm font-normal text-gray-500">gesamt</span>
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cache Hit Ratio</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{databaseStats.cacheHitRatio}%</p>
                  </div>
                </div>

                {/* Tables */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium dark:text-white">Tabellen</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tabelle</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Zeilen</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Größe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {databaseStats.tables.map((table) => (
                          <tr key={table.table_name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-2 text-sm font-mono dark:text-white">{table.table_name}</td>
                            <td className="px-4 py-2 text-sm text-right text-gray-600 dark:text-gray-400">{table.row_count.toLocaleString()}</td>
                            <td className="px-4 py-2 text-sm text-right text-gray-600 dark:text-gray-400">{table.total_size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Keine Daten verfügbar</p>
            )}
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">Sicherheit & Sessions</h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadSecurityData}
                disabled={securityLoading}
                loading={securityLoading}
                icon={<RefreshCw size={16} />}
              >
                Aktualisieren
              </Button>
            </div>

            {securityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-600" size={32} />
              </div>
            ) : securityData ? (
              <div className="space-y-4">
                {/* Login Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Erfolgreiche Logins (24h)</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {securityData.loginStats.attempts['login.success'] || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Fehlgeschlagene Logins (24h)</p>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {securityData.loginStats.attempts['login.failed'] || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <Lock className="text-orange-600 dark:text-orange-400" size={24} />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">MFA-Fehler (24h)</p>
                        <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                          {securityData.loginStats.attempts['login.mfa_failed'] || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Failed by IP */}
                {securityData.loginStats.failedByIp.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="font-medium dark:text-white">Fehlgeschlagene Logins nach IP (24h)</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">IP-Adresse</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Versuche</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Letzter Versuch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {securityData.loginStats.failedByIp.map((item) => (
                            <tr key={item.ip_address} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-2 text-sm font-mono dark:text-white">{item.ip_address}</td>
                              <td className="px-4 py-2 text-sm text-right text-red-600 dark:text-red-400 font-bold">{item.attempts}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-600 dark:text-gray-400">{formatDate(item.last_attempt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Active Sessions */}
                {securityData.sessions.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="font-medium dark:text-white">Aktive Sessions</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Benutzer</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Erstellt</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {securityData.sessions.map((session) => (
                            <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-2">
                                <p className="text-sm font-medium dark:text-white">{session.username}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{session.email}</p>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{formatDate(session.created_at)}</td>
                              <td className="px-4 py-2 text-right">
                                <IconButton
                                  icon={<UserX size={18} />}
                                  onClick={() => handleInvalidateSessions(session.user_id, session.username)}
                                  variant="danger"
                                  tooltip="Sessions invalidieren"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Keine Daten verfügbar</p>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-semibold dark:text-white">System-Logs</h2>
              <div className="flex gap-2">
                <select
                  value={logType}
                  onChange={(e) => setLogType(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="app">Application</option>
                  <option value="error">Error</option>
                  <option value="access">Access</option>
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadLogs}
                  disabled={logsLoading}
                  loading={logsLoading}
                  icon={<RefreshCw size={16} />}
                >
                  Aktualisieren
                </Button>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : (
                <div className="p-4 max-h-[600px] overflow-auto font-mono text-xs text-green-400">
                  {logs.length === 0 ? (
                    <p className="text-gray-500">Keine Logs verfügbar</p>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="py-0.5 hover:bg-gray-800">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">System-Benachrichtigungen</h2>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNotificationForm(!showNotificationForm)}
                icon={<Plus size={16} />}
              >
                Neue Meldung
              </Button>
            </div>

            {/* Create Form */}
            {showNotificationForm && (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
                <input
                  type="text"
                  placeholder="Titel"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                />
                <textarea
                  placeholder="Nachricht"
                  value={newNotification.message}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                />
                <div className="flex gap-2">
                  <select
                    value={newNotification.type}
                    onChange={(e) => setNewNotification(prev => ({ ...prev, type: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warnung</option>
                    <option value="error">Fehler</option>
                    <option value="success">Erfolg</option>
                  </select>
                  <Button
                    variant="primary"
                    onClick={handleCreateNotification}
                  >
                    Erstellen
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowNotificationForm(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            {/* Notifications List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={32} />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <Bell size={48} className="mb-3 opacity-50" />
                  <p>Keine Benachrichtigungen</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {notifications.map((notification) => (
                    <div key={notification.id} className={`p-4 ${!notification.is_active ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              notification.type === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              notification.type === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                              notification.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {notification.type}
                            </span>
                            <h3 className="font-medium dark:text-white">{notification.title}</h3>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{notification.message}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">{formatDate(notification.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <IconButton
                            icon={notification.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            onClick={() => handleToggleNotification(notification.id)}
                            variant={notification.is_active ? 'success' : 'default'}
                            tooltip={notification.is_active ? 'Deaktivieren' : 'Aktivieren'}
                          />
                          <IconButton
                            icon={<Trash2 size={18} />}
                            onClick={() => handleDeleteNotification(notification.id)}
                            variant="danger"
                            tooltip="Löschen"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Dashboard Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            {emailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-600" size={32} />
              </div>
            ) : (
              <>
                {/* Email Configuration Status */}
                {emailConfig && (
                  <div className={`p-4 rounded-xl border ${
                    emailConfig.status === 'connected'
                      ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {emailConfig.status === 'connected' ? (
                          <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
                        ) : (
                          <XCircle className="text-red-600 dark:text-red-400" size={24} />
                        )}
                        <div>
                          <p className="font-medium dark:text-white">
                            Provider: {emailConfig.provider}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {emailConfig.config.fromAddress}
                            {emailConfig.config.testMode && (
                              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded text-xs">
                                TEST MODE
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <IconButton
                        icon={<RefreshCw size={18} />}
                        onClick={loadEmailData}
                        variant="default"
                        tooltip="Aktualisieren"
                      />
                    </div>
                    {emailConfig.error && (
                      <p className="mt-2 text-sm text-red-600 dark:text-red-400">{emailConfig.error}</p>
                    )}
                  </div>
                )}

                {/* Test Email Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold dark:text-white mb-4">Test-Email senden</h3>
                  <div className="flex gap-3">
                    <input
                      type="email"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                      placeholder="Email-Adresse (leer = eigene Email)"
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                    />
                    <Button
                      variant="primary"
                      onClick={handleSendTestEmail}
                      disabled={testEmailSending}
                      loading={testEmailSending}
                      icon={<Send size={18} />}
                    >
                      Senden
                    </Button>
                  </div>
                  {testEmailResult && (
                    <div className={`mt-3 p-3 rounded-lg ${
                      testEmailResult.success
                        ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {testEmailResult.message}
                    </div>
                  )}
                </div>

                {/* Stats Cards */}
                {emailStats && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                          <Mail className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Heute</span>
                      </div>
                      <p className="text-2xl font-bold dark:text-white">{emailStats.today.total}</p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-green-600">{emailStats.today.sent} gesendet</span>
                        {emailStats.today.failed > 0 && (
                          <span className="text-red-600">{emailStats.today.failed} fehlgeschlagen</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                          <Mail className="text-green-600 dark:text-green-400" size={20} />
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Diese Woche</span>
                      </div>
                      <p className="text-2xl font-bold dark:text-white">{emailStats.week.total}</p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-green-600">{emailStats.week.sent} gesendet</span>
                        {emailStats.week.failed > 0 && (
                          <span className="text-red-600">{emailStats.week.failed} fehlgeschlagen</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                          <Mail className="text-purple-600 dark:text-purple-400" size={20} />
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Dieser Monat</span>
                      </div>
                      <p className="text-2xl font-bold dark:text-white">{emailStats.month.total}</p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span className="text-green-600">{emailStats.month.sent} gesendet</span>
                        {emailStats.month.failed > 0 && (
                          <span className="text-red-600">{emailStats.month.failed} fehlgeschlagen</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Provider & Type Stats */}
                {emailStats && (emailStats.byProvider.length > 0 || emailStats.byType.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {emailStats.byProvider.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold dark:text-white mb-4">Nach Provider</h3>
                        <div className="space-y-3">
                          {emailStats.byProvider.map((p) => (
                            <div key={p.provider} className="flex items-center justify-between">
                              <span className="text-gray-600 dark:text-gray-400 capitalize">{p.provider}</span>
                              <div className="flex gap-4 text-sm">
                                <span className="text-green-600">{p.sent} OK</span>
                                <span className="text-red-600">{p.failed} Fehler</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {emailStats.byType.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold dark:text-white mb-4">Nach Typ</h3>
                        <div className="space-y-3">
                          {emailStats.byType.slice(0, 5).map((t) => (
                            <div key={t.type} className="flex items-center justify-between">
                              <span className="text-gray-600 dark:text-gray-400">{t.type}</span>
                              <div className="flex gap-4 text-sm">
                                <span className="text-green-600">{t.sent} OK</span>
                                <span className="text-red-600">{t.failed} Fehler</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Failures */}
                {emailStats && emailStats.recentFailures.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-red-200 dark:border-red-800">
                    <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                      <AlertCircle className="text-red-600" size={20} />
                      Letzte Fehler
                    </h3>
                    <div className="space-y-3">
                      {emailStats.recentFailures.map((f) => (
                        <div key={f.id} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="flex justify-between">
                            <span className="font-medium text-red-800 dark:text-red-400">{f.email_type}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(f.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{f.recipient_email}</p>
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{f.error_message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Logs */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                          type="text"
                          value={emailLogsSearch}
                          onChange={(e) => {
                            setEmailLogsSearch(e.target.value);
                            setEmailLogsPage(1);
                          }}
                          placeholder="Suchen..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <select
                        value={emailStatusFilter}
                        onChange={(e) => {
                          setEmailStatusFilter(e.target.value);
                          setEmailLogsPage(1);
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">Alle Status</option>
                        <option value="sent">Gesendet</option>
                        <option value="failed">Fehlgeschlagen</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Zeitpunkt</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Typ</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Empfänger</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Provider</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {emailLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                              Keine E-Mails gefunden
                            </td>
                          </tr>
                        ) : (
                          emailLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {formatDate(log.created_at)}
                              </td>
                              <td className="px-4 py-3 text-sm dark:text-white">
                                {log.email_type}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {log.recipient_email}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">
                                {log.provider}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  log.status === 'sent'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {log.status === 'sent' ? 'Gesendet' : 'Fehler'}
                                </span>
                                {log.error_message && (
                                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs truncate" title={log.error_message}>
                                    {log.error_message}
                                  </p>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {emailLogsTotalPages > 1 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEmailLogsPage(p => Math.max(1, p - 1))}
                        disabled={emailLogsPage === 1}
                        icon={<ChevronLeft size={16} />}
                      >
                        Zurück
                      </Button>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Seite {emailLogsPage} von {emailLogsTotalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEmailLogsPage(p => Math.min(emailLogsTotalPages, p + 1))}
                        disabled={emailLogsPage === emailLogsTotalPages}
                        icon={<ChevronRight size={16} />}
                        iconPosition="right"
                      >
                        Weiter
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
