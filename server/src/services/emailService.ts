import nodemailer, { Transporter } from 'nodemailer';
import { pool } from '../config/database';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface NotificationData {
  userName: string;
  userEmail: string;
  [key: string]: any;
}

class EmailService {
  private transporter: Transporter | null = null;
  private testMode: boolean;
  private testRecipient: string;

  constructor() {
    this.testMode = process.env.EMAIL_TEST_MODE === 'true';
    this.testRecipient = process.env.EMAIL_TEST_RECIPIENT || '';

    if (!this.testMode) {
      this.initializeTransporter();
    }
  }

  private initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      console.log('✅ Email transporter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // In test mode, override recipient
      if (this.testMode) {
        console.log(`📧 TEST MODE: Email would be sent to ${options.to}`);
        console.log(`📧 TEST MODE: Redirecting to ${this.testRecipient}`);
        options.to = this.testRecipient;

        // Add test mode indicator to subject
        options.subject = `[TEST] ${options.subject}`;

        // Add original recipient info to email body
        options.html = `
          <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin-bottom: 20px; border-radius: 4px;">
            <strong>🧪 TEST MODE</strong><br>
            Original recipient would have been: <strong>${options.to}</strong>
          </div>
          ${options.html}
        `;
      }

      if (!this.transporter && !this.testMode) {
        console.error('❌ Email transporter not initialized');
        return false;
      }

      // In test mode with no SMTP configured, just log
      if (this.testMode && !this.transporter) {
        console.log('📧 TEST MODE (No SMTP): Email simulation');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('HTML:', options.html);
        console.log('Text:', options.text);
        return true;
      }

      const info = await this.transporter!.sendMail({
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log('✅ Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  async sendWelcomeEmail(data: NotificationData): Promise<boolean> {
    const html = this.generateWelcomeEmailHTML(data);
    const text = this.generateWelcomeEmailText(data);

    const success = await this.sendEmail({
      to: data.userEmail,
      subject: 'Willkommen bei TimeTrack! 🎉',
      html,
      text,
    });

    // Log notification
    await this.logNotification(data.userId, 'welcome', success);

    return success;
  }

  async sendMonthEndReminderEmail(data: NotificationData & { daysRemaining: number }): Promise<boolean> {
    const html = this.generateMonthEndReminderHTML(data);
    const text = this.generateMonthEndReminderText(data);

    const success = await this.sendEmail({
      to: data.userEmail,
      subject: `📅 Monatsende naht! Noch ${data.daysRemaining} Tag(e)`,
      html,
      text,
    });

    await this.logNotification(data.userId, 'month_end', success);
    return success;
  }

  async sendDailyReminderEmail(data: NotificationData): Promise<boolean> {
    const html = this.generateDailyReminderHTML(data);
    const text = this.generateDailyReminderText(data);

    const success = await this.sendEmail({
      to: data.userEmail,
      subject: '⏰ Zeiterfassung vergessen?',
      html,
      text,
    });

    await this.logNotification(data.userId, 'daily_reminder', success);
    return success;
  }

  async sendQualityCheckEmail(data: NotificationData & { missingCount: number }): Promise<boolean> {
    const html = this.generateQualityCheckHTML(data);
    const text = this.generateQualityCheckText(data);

    const success = await this.sendEmail({
      to: data.userEmail,
      subject: '✍️ Beschreibungen fehlen',
      html,
      text,
    });

    await this.logNotification(data.userId, 'quality_check', success);
    return success;
  }

  async sendWeeklyReportEmail(data: NotificationData & { totalHours: number; entries: any[] }): Promise<boolean> {
    const html = this.generateWeeklyReportHTML(data);
    const text = this.generateWeeklyReportText(data);

    const success = await this.sendEmail({
      to: data.userEmail,
      subject: '📊 Dein Wochenreport ist da!',
      html,
      text,
    });

    await this.logNotification(data.userId, 'weekly_report', success);
    return success;
  }

  // HTML Email Templates
  private generateWelcomeEmailHTML(data: NotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Willkommen bei TimeTrack</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🎉 Willkommen bei TimeTrack!</h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #1f2937; margin-top: 0;">Hallo ${data.userName}!</h2>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        Schön, dass du bei TimeTrack dabei bist! Wir freuen uns, dich bei deiner professionellen Zeiterfassung zu unterstützen.
                      </p>

                      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 30px 0;">
                        <h3 style="color: #1e40af; margin-top: 0;">Deine nächsten Schritte:</h3>
                        <ul style="color: #4b5563; line-height: 1.8; margin-bottom: 0;">
                          <li><strong>Kunden anlegen:</strong> Erstelle deine Kunden in den Einstellungen</li>
                          <li><strong>Projekte erstellen:</strong> Lege Projekte mit Stundensätzen an</li>
                          <li><strong>Zeit erfassen:</strong> Starte deine erste Zeiterfassung</li>
                          <li><strong>Reports generieren:</strong> Erstelle professionelle PDF-Reports</li>
                        </ul>
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                          Jetzt loslegen →
                        </a>
                      </div>

                      <p style="color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        Bei Fragen stehen wir dir gerne zur Verfügung. Viel Erfolg mit TimeTrack!
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        TimeTrack - Professionelle Zeiterfassung<br>
                        © ${new Date().getFullYear()} Alle Rechte vorbehalten
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateWelcomeEmailText(data: NotificationData): string {
    return `
Willkommen bei TimeTrack!

Hallo ${data.userName}!

Schön, dass du bei TimeTrack dabei bist! Wir freuen uns, dich bei deiner professionellen Zeiterfassung zu unterstützen.

Deine nächsten Schritte:
- Kunden anlegen: Erstelle deine Kunden in den Einstellungen
- Projekte erstellen: Lege Projekte mit Stundensätzen an
- Zeit erfassen: Starte deine erste Zeiterfassung
- Reports generieren: Erstelle professionelle PDF-Reports

Jetzt loslegen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}

Bei Fragen stehen wir dir gerne zur Verfügung. Viel Erfolg mit TimeTrack!

--
TimeTrack - Professionelle Zeiterfassung
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  private generateMonthEndReminderHTML(data: NotificationData & { daysRemaining: number }): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Monatsende naht</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📅 Monatsende naht!</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 18px; margin-top: 0;">Hallo ${data.userName},</p>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        Noch <strong style="color: #d97706;">${data.daysRemaining} Tag(e)</strong> bis zum Monatsende!
                        Zeit, deine Reports zu erstellen und Zeiten zu prüfen.
                      </p>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" style="display: inline-block; background-color: #f59e0b; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold;">
                          Zum Dashboard →
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateMonthEndReminderText(data: NotificationData & { daysRemaining: number }): string {
    return `Monatsende naht!

Hallo ${data.userName},

Noch ${data.daysRemaining} Tag(e) bis zum Monatsende! Zeit, deine Reports zu erstellen und Zeiten zu prüfen.

Zum Dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard
    `;
  }

  private generateDailyReminderHTML(data: NotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Zeiterfassung vergessen?</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Zeiterfassung vergessen?</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 18px; margin-top: 0;">Hallo ${data.userName},</p>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        Du hast heute noch keine Zeiten erfasst. Vergiss nicht, deine Arbeitsstunden einzutragen!
                      </p>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="display: inline-block; background-color: #8b5cf6; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold;">
                          Zeiten eintragen →
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateDailyReminderText(data: NotificationData): string {
    return `Zeiterfassung vergessen?

Hallo ${data.userName},

Du hast heute noch keine Zeiten erfasst. Vergiss nicht, deine Arbeitsstunden einzutragen!

Zeiten eintragen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}
    `;
  }

  private generateQualityCheckHTML(data: NotificationData & { missingCount: number }): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Beschreibungen fehlen</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✍️ Beschreibungen fehlen</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 18px; margin-top: 0;">Hallo ${data.userName},</p>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        <strong style="color: #dc2626;">${data.missingCount} Zeiteinträge</strong> haben keine Beschreibung.
                        Vervollständige sie jetzt für bessere Reports!
                      </p>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/list" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold;">
                          Einträge prüfen →
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateQualityCheckText(data: NotificationData & { missingCount: number }): string {
    return `Beschreibungen fehlen

Hallo ${data.userName},

${data.missingCount} Zeiteinträge haben keine Beschreibung. Vervollständige sie jetzt für bessere Reports!

Einträge prüfen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/list
    `;
  }

  private generateWeeklyReportHTML(data: NotificationData & { totalHours: number; entries: any[] }): string {
    const entriesHTML = data.entries.slice(0, 10).map(entry => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          ${new Date(entry.start_time).toLocaleDateString('de-DE')}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-size: 14px;">
          ${entry.project_name || 'Unbekannt'}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #4b5563; font-size: 14px; text-align: right;">
          ${(entry.duration / 3600).toFixed(2)}h
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Dein Wochenreport</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📊 Dein Wochenreport</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 18px; margin-top: 0;">Hallo ${data.userName},</p>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        Diese Woche hast du <strong style="color: #059669;">${data.totalHours.toFixed(1)} Stunden</strong> erfasst. Hier ist deine Zusammenfassung:
                      </p>

                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                        <tr style="background-color: #f9fafb;">
                          <th style="padding: 12px 8px; text-align: left; color: #6b7280; font-size: 14px; font-weight: 600;">Datum</th>
                          <th style="padding: 12px 8px; text-align: left; color: #6b7280; font-size: 14px; font-weight: 600;">Projekt</th>
                          <th style="padding: 12px 8px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 600;">Stunden</th>
                        </tr>
                        ${entriesHTML}
                      </table>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold;">
                          Vollständigen Report ansehen →
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateWeeklyReportText(data: NotificationData & { totalHours: number; entries: any[] }): string {
    const entriesText = data.entries.slice(0, 10).map(entry =>
      `${new Date(entry.start_time).toLocaleDateString('de-DE')} - ${entry.project_name || 'Unbekannt'}: ${(entry.duration / 3600).toFixed(2)}h`
    ).join('\n');

    return `Dein Wochenreport

Hallo ${data.userName},

Diese Woche hast du ${data.totalHours.toFixed(1)} Stunden erfasst. Hier ist deine Zusammenfassung:

${entriesText}

Vollständigen Report ansehen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard
    `;
  }

  // Helper methods
  private async logNotification(userId: string, type: string, success: boolean): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO email_notifications (id, user_id, notification_type, sent_at, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          userId,
          type,
          new Date().toISOString(),
          success ? 'sent' : 'failed',
          success ? null : 'Failed to send email'
        ]
      );
    } catch (error) {
      console.error('Failed to log email notification:', error);
    }
  }

  async canSendNotification(userId: string, type: string, minHoursBetween: number = 24): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT sent_at FROM email_notifications
         WHERE user_id = $1 AND notification_type = $2
         ORDER BY sent_at DESC
         LIMIT 1`,
        [userId, type]
      );

      if (result.rows.length === 0) {
        return true;
      }

      const lastNotification = result.rows[0];
      const lastSent = new Date(lastNotification.sent_at).getTime();
      const now = Date.now();
      const hoursPassed = (now - lastSent) / (1000 * 60 * 60);

      return hoursPassed >= minHoursBetween;
    } catch (error) {
      console.error('Error checking notification eligibility:', error);
      return true; // Allow sending if check fails
    }
  }

  async sendReportApprovalRequest(data: {
    to: string;
    recipientName: string;
    senderName: string;
    reportData: any;
    approvalUrl: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, recipientName, senderName, reportData, approvalUrl, expiresAt } = data;

    const html = this.generateReportApprovalRequestHTML(recipientName, senderName, reportData, approvalUrl, expiresAt);
    const text = this.generateReportApprovalRequestText(recipientName, senderName, reportData, approvalUrl, expiresAt);

    return await this.sendEmail({
      to,
      subject: `📊 Freigabe-Anfrage von ${senderName} - RamboFlow`,
      html,
      text
    });
  }

  async sendReportApprovalNotification(data: {
    to: string;
    senderName: string;
    recipientName: string;
    status: 'approved' | 'rejected';
    comment?: string;
    reportData: any;
  }): Promise<boolean> {
    const { to, senderName, recipientName, status, comment, reportData } = data;

    const html = this.generateReportApprovalNotificationHTML(senderName, recipientName, status, comment, reportData);
    const text = this.generateReportApprovalNotificationText(senderName, recipientName, status, comment, reportData);

    const subject = status === 'approved'
      ? `✅ Report freigegeben von ${recipientName} - RamboFlow`
      : `❌ Report abgelehnt von ${recipientName} - RamboFlow`;

    return await this.sendEmail({
      to,
      subject,
      html,
      text
    });
  }

  private generateReportApprovalRequestHTML(
    recipientName: string,
    senderName: string,
    reportData: any,
    approvalUrl: string,
    expiresAt: Date
  ): string {
    const totalHours = reportData.totalHours?.toFixed(2) || '0';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Freigabe-Anfrage</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 32px;">📊 Freigabe-Anfrage</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #1f2937; margin-top: 0;">Hallo ${recipientName}!</h2>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        <strong>${senderName}</strong> hat dir einen Zeiterfassungs-Report zur Freigabe geschickt.
                      </p>

                      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                        <h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">Report-Details</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Zeitraum:</td>
                            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${dateRange}</td>
                          </tr>
                          ${reportData.customerName ? `
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Kunde:</td>
                              <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${reportData.customerName}</td>
                            </tr>
                          ` : ''}
                          ${reportData.projectName ? `
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Projekt:</td>
                              <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${reportData.projectName}</td>
                            </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Gesamtstunden:</td>
                            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${totalHours}h</td>
                          </tr>
                          ${reportData.totalAmount ? `
                            <tr>
                              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Gesamtbetrag:</td>
                              <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${reportData.totalAmount.toFixed(2)}€</td>
                            </tr>
                          ` : ''}
                        </table>
                      </div>

                      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                        <p style="color: #92400e; margin: 0; font-size: 14px;">
                          ⚠️ <strong>Dieser Link läuft ab am:</strong><br>
                          ${expiresAt.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr
                        </p>
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${approvalUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                          Report prüfen und freigeben →
                        </a>
                      </div>

                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                          Falls der Button nicht funktioniert, kopiere diesen Link:
                        </p>
                        <p style="color: #3b82f6; font-size: 12px; word-break: break-all; margin: 0;">
                          ${approvalUrl}
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - Professionelle Zeiterfassung<br>
                        © ${new Date().getFullYear()} Alle Rechte vorbehalten
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateReportApprovalRequestText(
    recipientName: string,
    senderName: string,
    reportData: any,
    approvalUrl: string,
    expiresAt: Date
  ): string {
    const totalHours = reportData.totalHours?.toFixed(2) || '0';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    return `
Freigabe-Anfrage von ${senderName}

Hallo ${recipientName}!

${senderName} hat dir einen Zeiterfassungs-Report zur Freigabe geschickt.

Report-Details:
- Zeitraum: ${dateRange}
${reportData.customerName ? `- Kunde: ${reportData.customerName}` : ''}
${reportData.projectName ? `- Projekt: ${reportData.projectName}` : ''}
- Gesamtstunden: ${totalHours}h
${reportData.totalAmount ? `- Gesamtbetrag: ${reportData.totalAmount.toFixed(2)}€` : ''}

⚠️ Dieser Link läuft ab am: ${expiresAt.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr

Report prüfen und freigeben:
${approvalUrl}

--
RamboFlow - Professionelle Zeiterfassung
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  private generateReportApprovalNotificationHTML(
    senderName: string,
    recipientName: string,
    status: 'approved' | 'rejected',
    comment: string | undefined,
    reportData: any
  ): string {
    const isApproved = status === 'approved';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const statusIcon = isApproved ? '✅' : '❌';
    const statusText = isApproved ? 'freigegeben' : 'abgelehnt';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Report ${statusText}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%); padding: 40px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 32px;">${statusIcon} Report ${statusText}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #1f2937; margin-top: 0;">Hallo ${senderName}!</h2>
                      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                        <strong>${recipientName}</strong> hat deinen Report <strong>${statusText}</strong>.
                      </p>

                      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                        <h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">Report-Details</h3>
                        <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
                          <strong>Zeitraum:</strong> ${dateRange}
                        </p>
                        ${reportData.customerName ? `
                          <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
                            <strong>Kunde:</strong> ${reportData.customerName}
                          </p>
                        ` : ''}
                      </div>

                      ${comment ? `
                        <div style="background-color: #f9fafb; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px 0;">
                          <h4 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">Kommentar:</h4>
                          <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.5;">
                            ${comment}
                          </p>
                        </div>
                      ` : ''}

                      ${isApproved ? `
                        <p style="color: #10b981; font-size: 16px; font-weight: 600; margin: 25px 0;">
                          ✅ Du kannst jetzt mit der Rechnungserstellung fortfahren!
                        </p>
                      ` : `
                        <p style="color: #ef4444; font-size: 16px; font-weight: 600; margin: 25px 0;">
                          ℹ️ Bitte überarbeite den Report entsprechend dem Feedback.
                        </p>
                      `}
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - Professionelle Zeiterfassung<br>
                        © ${new Date().getFullYear()} Alle Rechte vorbehalten
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private generateReportApprovalNotificationText(
    senderName: string,
    recipientName: string,
    status: 'approved' | 'rejected',
    comment: string | undefined,
    reportData: any
  ): string {
    const isApproved = status === 'approved';
    const statusIcon = isApproved ? '✅' : '❌';
    const statusText = isApproved ? 'freigegeben' : 'abgelehnt';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    return `
${statusIcon} Report ${statusText}

Hallo ${senderName}!

${recipientName} hat deinen Report ${statusText}.

Report-Details:
- Zeitraum: ${dateRange}
${reportData.customerName ? `- Kunde: ${reportData.customerName}` : ''}

${comment ? `Kommentar:\n${comment}\n` : ''}

${isApproved
      ? '✅ Du kannst jetzt mit der Rechnungserstellung fortfahren!'
      : 'ℹ️ Bitte überarbeite den Report entsprechend dem Feedback.'
    }

--
RamboFlow - Professionelle Zeiterfassung
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }
}

export const emailService = new EmailService();
