import { db } from '../config/database';

export type AuditAction =
  | 'user.register'
  | 'user.login'
  | 'user.logout'
  | 'user.update'
  | 'user.delete'
  | 'data.export'
  | 'time_entry.create'
  | 'time_entry.update'
  | 'time_entry.delete'
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'activity.create'
  | 'activity.update'
  | 'activity.delete'
  | 'settings.update';

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resource: string; // e.g., 'user:123', 'project:456'
  details?: string; // JSON string with additional details
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

class AuditLogService {
  constructor() {
    this.initializeTable();
  }

  private initializeTable() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create index for faster queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    `);

    console.log('✅ Audit log table initialized');
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, resource, details, ip_address, user_agent, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        crypto.randomUUID(),
        entry.userId,
        entry.action,
        entry.resource,
        entry.details || null,
        entry.ipAddress || null,
        entry.userAgent || null,
        new Date().toISOString()
      );

      console.log(`📝 Audit log: ${entry.action} by user ${entry.userId}`);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  getUserLogs(userId: string, limit: number = 100): AuditLogEntry[] {
    try {
      const stmt = db.prepare(`
        SELECT * FROM audit_logs
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(userId, limit) as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get user logs:', error);
      return [];
    }
  }

  getActionLogs(action: AuditAction, limit: number = 100): AuditLogEntry[] {
    try {
      const stmt = db.prepare(`
        SELECT * FROM audit_logs
        WHERE action = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(action, limit) as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get action logs:', error);
      return [];
    }
  }

  getRecentLogs(limit: number = 100): AuditLogEntry[] {
    try {
      const stmt = db.prepare(`
        SELECT * FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      return stmt.all(limit) as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      return [];
    }
  }

  // Clean up old logs (GDPR compliance - data minimization)
  cleanupOldLogs(daysToKeep: number = 365): number {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const stmt = db.prepare(`
        DELETE FROM audit_logs
        WHERE timestamp < ?
      `);

      const result = stmt.run(cutoffDate.toISOString());
      console.log(`🗑️ Cleaned up ${result.changes} old audit logs`);

      return result.changes;
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }
  }

  // Export user audit logs (GDPR compliance)
  exportUserLogs(userId: string): string {
    const logs = this.getUserLogs(userId, 10000); // Get all logs

    let csv = 'Timestamp,Action,Resource,IP Address,User Agent,Details\n';
    logs.forEach(log => {
      csv += `${log.timestamp},${log.action},${log.resource},${log.ipAddress || ''},${log.userAgent || ''},"${log.details || ''}"\n`;
    });

    return csv;
  }
}

export const auditLog = new AuditLogService();
