import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { emailService } from './emailService';

// Security log file for Fail2Ban
const SECURITY_LOG_PATH = process.env.SECURITY_LOG_PATH || path.join(__dirname, '../../logs/security.log');

// Thresholds
const FAILED_LOGIN_ALERT_THRESHOLD = 5; // Alert after 5 failed attempts
const FAILED_LOGIN_WINDOW_MINUTES = 15; // Within 15 minutes

interface FailedLoginAttempt {
  ip: string;
  username: string;
  timestamp: Date;
  userAgent?: string;
}

interface SecurityAlert {
  type: 'brute_force' | 'suspicious_login' | 'account_lockout';
  ip: string;
  username?: string;
  details: string;
  timestamp: Date;
}

class SecurityService {
  private failedAttempts: Map<string, FailedLoginAttempt[]> = new Map();
  private alertedIPs: Map<string, Date> = new Map(); // Track when we last alerted for an IP

  constructor() {
    // Ensure log directory exists
    const logDir = path.dirname(SECURITY_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Clean up old failed attempts every 5 minutes
    setInterval(() => this.cleanupOldAttempts(), 5 * 60 * 1000);
  }

  /**
   * Log a failed login attempt (for Fail2Ban)
   * Format: [TIMESTAMP] AUTH_FAILED ip=IP user=USERNAME
   */
  logFailedLogin(ip: string, username: string, userAgent?: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] AUTH_FAILED ip=${ip} user=${username}\n`;

    // Write to security log file (for Fail2Ban)
    fs.appendFileSync(SECURITY_LOG_PATH, logLine);

    // Track in memory for alerting
    this.trackFailedAttempt({ ip, username, timestamp: new Date(), userAgent });

    console.log(`🔒 Security: Failed login attempt from ${ip} for user "${username}"`);
  }

  /**
   * Log a successful login
   */
  logSuccessfulLogin(ip: string, username: string, userId: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] AUTH_SUCCESS ip=${ip} user=${username}\n`;

    fs.appendFileSync(SECURITY_LOG_PATH, logLine);

    // Clear failed attempts for this IP after successful login
    this.failedAttempts.delete(ip);

    console.log(`✅ Security: Successful login from ${ip} for user "${username}"`);
  }

  /**
   * Track failed attempt and trigger alerts if threshold reached
   */
  private async trackFailedAttempt(attempt: FailedLoginAttempt): Promise<void> {
    const { ip } = attempt;

    // Get or create attempt list for this IP
    if (!this.failedAttempts.has(ip)) {
      this.failedAttempts.set(ip, []);
    }

    const attempts = this.failedAttempts.get(ip)!;
    attempts.push(attempt);

    // Check if we should alert
    const recentAttempts = this.getRecentAttempts(ip);

    if (recentAttempts.length >= FAILED_LOGIN_ALERT_THRESHOLD) {
      await this.triggerBruteForceAlert(ip, recentAttempts);
    }
  }

  /**
   * Get attempts within the alert window
   */
  private getRecentAttempts(ip: string): FailedLoginAttempt[] {
    const attempts = this.failedAttempts.get(ip) || [];
    const windowStart = new Date(Date.now() - FAILED_LOGIN_WINDOW_MINUTES * 60 * 1000);

    return attempts.filter(a => a.timestamp >= windowStart);
  }

  /**
   * Trigger brute force alert
   */
  private async triggerBruteForceAlert(ip: string, attempts: FailedLoginAttempt[]): Promise<void> {
    // Don't alert more than once per hour for the same IP
    const lastAlert = this.alertedIPs.get(ip);
    if (lastAlert && Date.now() - lastAlert.getTime() < 60 * 60 * 1000) {
      return;
    }

    this.alertedIPs.set(ip, new Date());

    const alert: SecurityAlert = {
      type: 'brute_force',
      ip,
      details: `${attempts.length} failed login attempts in ${FAILED_LOGIN_WINDOW_MINUTES} minutes`,
      timestamp: new Date()
    };

    // Log to console
    console.warn(`🚨 SECURITY ALERT: Potential brute force attack from ${ip}`);
    console.warn(`   Attempts: ${attempts.length} in last ${FAILED_LOGIN_WINDOW_MINUTES} minutes`);
    console.warn(`   Targeted users: ${[...new Set(attempts.map(a => a.username))].join(', ')}`);

    // Store alert in database
    await this.storeSecurityAlert(alert);

    // Send email alert to admin
    await this.sendSecurityAlertEmail(alert, attempts);
  }

  /**
   * Store security alert in database
   */
  private async storeSecurityAlert(alert: SecurityAlert): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO security_alerts (id, alert_type, ip_address, username, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          alert.type,
          alert.ip,
          alert.username || null,
          alert.details,
          alert.timestamp.toISOString()
        ]
      );
    } catch (error) {
      console.error('Failed to store security alert:', error);
    }
  }

  /**
   * Send email alert to admin
   */
  private async sendSecurityAlertEmail(alert: SecurityAlert, attempts: FailedLoginAttempt[]): Promise<void> {
    try {
      // Get admin email from environment or database
      const adminEmail = process.env.SECURITY_ALERT_EMAIL || process.env.ADMIN_EMAIL;

      if (!adminEmail) {
        console.warn('No admin email configured for security alerts');
        return;
      }

      const targetedUsers = [...new Set(attempts.map(a => a.username))];
      const userAgents = [...new Set(attempts.filter(a => a.userAgent).map(a => a.userAgent))];

      const subject = `🚨 Sicherheitswarnung: Möglicher Brute-Force-Angriff erkannt`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .alert-box { background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .alert-title { color: #dc2626; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            .details { background: #f3f4f6; border-radius: 4px; padding: 15px; margin: 15px 0; }
            .detail-row { margin: 8px 0; }
            .label { font-weight: bold; color: #4b5563; }
            .value { color: #1f2937; }
            .warning { color: #dc2626; font-weight: bold; }
            .timestamp { color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="alert-box">
            <div class="alert-title">⚠️ Sicherheitswarnung: Brute-Force-Angriff erkannt</div>
            <p>Es wurden mehrere fehlgeschlagene Anmeldeversuche von derselben IP-Adresse erkannt.</p>
          </div>

          <div class="details">
            <div class="detail-row">
              <span class="label">IP-Adresse:</span>
              <span class="value warning">${alert.ip}</span>
            </div>
            <div class="detail-row">
              <span class="label">Anzahl Versuche:</span>
              <span class="value">${attempts.length} in ${FAILED_LOGIN_WINDOW_MINUTES} Minuten</span>
            </div>
            <div class="detail-row">
              <span class="label">Betroffene Benutzer:</span>
              <span class="value">${targetedUsers.join(', ')}</span>
            </div>
            ${userAgents.length > 0 ? `
            <div class="detail-row">
              <span class="label">User-Agents:</span>
              <span class="value" style="font-size: 11px;">${userAgents.slice(0, 3).join('<br>')}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="label">Zeitpunkt:</span>
              <span class="value">${alert.timestamp.toLocaleString('de-DE', { timeZone: 'Europe/Vienna' })}</span>
            </div>
          </div>

          <h3>Empfohlene Maßnahmen:</h3>
          <ul>
            <li>Überprüfen Sie, ob die IP-Adresse bekannt ist</li>
            <li>Bei Bedarf: IP-Adresse in Fail2Ban manuell sperren: <code>sudo fail2ban-client set timetracking banip ${alert.ip}</code></li>
            <li>Betroffene Benutzer über den Vorfall informieren</li>
            <li>Passwortänderung empfehlen, falls ein Account kompromittiert sein könnte</li>
          </ul>

          <p class="timestamp">Diese E-Mail wurde automatisch generiert am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Vienna' })}</p>
        </body>
        </html>
      `;

      const textContent = `
SICHERHEITSWARNUNG: Brute-Force-Angriff erkannt

Es wurden mehrere fehlgeschlagene Anmeldeversuche von derselben IP-Adresse erkannt.

Details:
- IP-Adresse: ${alert.ip}
- Anzahl Versuche: ${attempts.length} in ${FAILED_LOGIN_WINDOW_MINUTES} Minuten
- Betroffene Benutzer: ${targetedUsers.join(', ')}
- Zeitpunkt: ${alert.timestamp.toLocaleString('de-DE', { timeZone: 'Europe/Vienna' })}

Empfohlene Maßnahmen:
1. Überprüfen Sie, ob die IP-Adresse bekannt ist
2. Bei Bedarf: IP-Adresse in Fail2Ban manuell sperren
3. Betroffene Benutzer über den Vorfall informieren
4. Passwortänderung empfehlen

Diese E-Mail wurde automatisch generiert.
      `;

      await emailService.sendEmail({
        to: adminEmail,
        subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`📧 Security alert email sent to ${adminEmail}`);
    } catch (error) {
      console.error('Failed to send security alert email:', error);
    }
  }

  /**
   * Clean up old failed attempts from memory
   */
  private cleanupOldAttempts(): void {
    const windowStart = new Date(Date.now() - FAILED_LOGIN_WINDOW_MINUTES * 60 * 1000);

    for (const [ip, attempts] of this.failedAttempts.entries()) {
      const recentAttempts = attempts.filter(a => a.timestamp >= windowStart);

      if (recentAttempts.length === 0) {
        this.failedAttempts.delete(ip);
      } else {
        this.failedAttempts.set(ip, recentAttempts);
      }
    }

    // Clean up old alert tracking (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [ip, timestamp] of this.alertedIPs.entries()) {
      if (timestamp < oneHourAgo) {
        this.alertedIPs.delete(ip);
      }
    }
  }

  /**
   * Get recent security alerts
   */
  async getRecentAlerts(limit: number = 50): Promise<SecurityAlert[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM security_alerts ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get security alerts:', error);
      return [];
    }
  }

  /**
   * Get failed login stats for an IP
   */
  getIPStats(ip: string): { recentAttempts: number; lastAttempt?: Date } {
    const attempts = this.getRecentAttempts(ip);
    return {
      recentAttempts: attempts.length,
      lastAttempt: attempts.length > 0 ? attempts[attempts.length - 1].timestamp : undefined
    };
  }
}

export const securityService = new SecurityService();
