import { pool } from '../config/database';

export type AuditAction =
  // User actions
  | 'user.register'
  | 'user.login'
  | 'user.logout'
  | 'user.change_password'
  | 'user.update_profile'
  | 'user.update'
  | 'user.delete'
  | 'data.export'
  // Time entry actions
  | 'time_entry.create'
  | 'time_entry.update'
  | 'time_entry.delete'
  // Customer actions
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'customer_contact.create'
  | 'customer_contact.update'
  | 'customer_contact.delete'
  | 'customer_contact.send_invite'
  // Project actions
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  // Activity actions
  | 'activity.create'
  | 'activity.update'
  | 'activity.delete'
  // Ticket actions
  | 'ticket.create'
  | 'ticket.update'
  | 'ticket.delete'
  | 'ticket.close'
  | 'ticket.reopen'
  | 'ticket.merge'
  | 'ticket.assign'
  | 'ticket.status_change'
  | 'ticket.priority_change'
  // Ticket comment actions
  | 'ticket_comment.create'
  | 'ticket_comment.update'
  | 'ticket_comment.delete'
  // Ticket task actions
  | 'ticket_task.create'
  | 'ticket_task.update'
  | 'ticket_task.delete'
  | 'ticket_task.complete'
  | 'ticket_task.assign'
  // Ticket attachment actions
  | 'ticket_attachment.upload'
  | 'ticket_attachment.delete'
  // Ticket tag actions
  | 'ticket_tag.add'
  | 'ticket_tag.remove'
  // SLA actions
  | 'sla_policy.create'
  | 'sla_policy.update'
  | 'sla_policy.delete'
  | 'sla_policy.apply'
  // Lead actions
  | 'lead.create'
  | 'lead.update'
  | 'lead.delete'
  | 'lead.convert'
  | 'lead.activity_add'
  // Organization actions
  | 'organization.create'
  | 'organization.update'
  | 'organization.delete'
  | 'organization.member_add'
  | 'organization.member_remove'
  | 'organization.member_role_change'
  | 'organization.invitation_create'
  | 'organization.invitation_accept'
  | 'organization.invitation_cancel'
  | 'organization.leave'
  // Settings & system actions
  | 'settings.update'
  | 'ninjarmm.auto_sync'
  | 'ninjarmm.auto_sync_error'
  // MFA actions
  | 'mfa.device_trusted'
  | 'mfa.device_revoked'
  | 'mfa.all_devices_revoked';

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  details: string; // JSON string with event details
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

class AuditLogService {
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, details, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          entry.userId,
          entry.action,
          entry.details,
          entry.ipAddress || null,
          entry.userAgent || null,
          new Date().toISOString()
        ]
      );

      console.log(`📝 Audit log: ${entry.action} by user ${entry.userId}`);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async getUserLogs(userId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_logs
         WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get user logs:', error);
      return [];
    }
  }

  async getActionLogs(action: AuditAction, limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_logs
         WHERE action = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [action, limit]
      );

      return result.rows as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get action logs:', error);
      return [];
    }
  }

  async getRecentLogs(limit: number = 100): Promise<AuditLogEntry[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_logs
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows as AuditLogEntry[];
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      return [];
    }
  }

  // Clean up old logs (GDPR compliance - data minimization)
  async cleanupOldLogs(daysToKeep: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await pool.query(
        `DELETE FROM audit_logs
         WHERE timestamp < $1`,
        [cutoffDate.toISOString()]
      );

      const deletedCount = result.rowCount || 0;
      console.log(`🗑️ Cleaned up ${deletedCount} old audit logs`);

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }
  }

  // Export user audit logs (GDPR compliance)
  async exportUserLogs(userId: string): Promise<string> {
    const logs = await this.getUserLogs(userId, 10000); // Get all logs

    let csv = 'Timestamp,Action,Details,IP Address,User Agent\n';
    logs.forEach(log => {
      csv += `${log.timestamp},${log.action},"${log.details || ''}",${log.ipAddress || ''},${log.userAgent || ''}\n`;
    });

    return csv;
  }
}

export const auditLog = new AuditLogService();
