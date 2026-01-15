import nodemailer, { Transporter } from 'nodemailer';
import { pool } from '../config/database';
import { microsoftGraphService } from './microsoftGraphService';
import crypto from 'crypto';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface EmailLogOptions {
  emailType: string;
  subject: string;
  recipientEmail: string;
  recipientName?: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

interface NotificationData {
  userName: string;
  userEmail: string;
  [key: string]: any;
}

type EmailProvider = 'smtp' | 'graph' | 'auto';

class EmailService {
  private transporter: Transporter | null = null;
  private testMode: boolean;
  private testRecipient: string;
  private provider: EmailProvider;

  constructor() {
    this.testMode = process.env.EMAIL_TEST_MODE === 'true';
    this.testRecipient = process.env.EMAIL_TEST_RECIPIENT || '';
    this.provider = (process.env.EMAIL_PROVIDER as EmailProvider) || 'auto';

    if (!this.testMode) {
      this.initializeTransporter();
    }

    // Log which provider will be used
    if (this.provider === 'graph' && microsoftGraphService.isAvailable()) {
      console.log('📧 Email provider: Microsoft Graph API');
    } else if (this.provider === 'auto' && microsoftGraphService.isAvailable()) {
      console.log('📧 Email provider: Microsoft Graph API (auto-detected)');
    } else if (this.transporter) {
      console.log('📧 Email provider: SMTP');
    }
  }

  private initializeTransporter() {
    // Only initialize SMTP if not using Graph API exclusively
    if (this.provider === 'graph' && microsoftGraphService.isAvailable()) {
      console.log('ℹ️ Skipping SMTP initialization (using Graph API)');
      return;
    }

    try {
      const host = process.env.EMAIL_HOST;
      const user = process.env.EMAIL_USER;
      const pass = process.env.EMAIL_PASSWORD;

      // Only initialize if SMTP credentials are provided
      if (host && user && pass) {
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(process.env.EMAIL_PORT || '587'),
          secure: process.env.EMAIL_SECURE === 'true',
          auth: { user, pass },
        });
        console.log('✅ SMTP email transporter initialized');
      } else {
        console.log('ℹ️ SMTP not configured (missing EMAIL_HOST/USER/PASSWORD)');
      }
    } catch (error) {
      console.error('❌ Failed to initialize SMTP transporter:', error);
    }
  }

  /**
   * Get the active email provider
   */
  getActiveProvider(): string {
    if (this.provider === 'graph' && microsoftGraphService.isAvailable()) {
      return 'graph';
    }
    if (this.provider === 'auto' && microsoftGraphService.isAvailable()) {
      return 'graph';
    }
    if (this.transporter) {
      return 'smtp';
    }
    return 'none';
  }

  /**
   * Test the email configuration
   */
  async testConnection(): Promise<{ success: boolean; provider: string; error?: string; details?: any }> {
    const activeProvider = this.getActiveProvider();

    if (activeProvider === 'graph') {
      const result = await microsoftGraphService.testConnection();
      return {
        success: result.success,
        provider: 'Microsoft Graph API',
        error: result.error,
        details: result.userInfo,
      };
    }

    if (activeProvider === 'smtp' && this.transporter) {
      try {
        await this.transporter.verify();
        return {
          success: true,
          provider: 'SMTP',
          details: { host: process.env.EMAIL_HOST },
        };
      } catch (error: any) {
        return {
          success: false,
          provider: 'SMTP',
          error: error.message,
        };
      }
    }

    return {
      success: false,
      provider: 'none',
      error: 'No email provider configured',
    };
  }

  async sendEmail(options: EmailOptions, logOptions?: EmailLogOptions): Promise<boolean> {
    const originalTo = options.to;
    const startTime = Date.now();
    let usedProvider: 'smtp' | 'graph' | 'test' = 'smtp';
    let messageId: string | undefined;
    let errorMessage: string | undefined;
    let errorCode: string | undefined;

    try {
      // In test mode, override recipient
      if (this.testMode) {
        console.log(`📧 TEST MODE: Email would be sent to ${options.to}`);
        console.log(`📧 TEST MODE: Redirecting to ${this.testRecipient}`);
        options.to = this.testRecipient;
        usedProvider = 'test';

        // Add test mode indicator to subject
        options.subject = `[TEST] ${options.subject}`;

        // Add original recipient info to email body
        options.html = `
          <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin-bottom: 20px; border-radius: 4px;">
            <strong>🧪 TEST MODE</strong><br>
            Original recipient would have been: <strong>${originalTo}</strong>
          </div>
          ${options.html}
        `;
      }

      // Determine which provider to use
      const useGraph = (this.provider === 'graph' || this.provider === 'auto') &&
                       microsoftGraphService.isAvailable();

      // Try Graph API first if configured
      if (useGraph) {
        try {
          usedProvider = 'graph';
          await microsoftGraphService.sendEmail({
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            attachments: options.attachments,
          });
          console.log('✅ Email sent via Graph API to:', options.to);

          // Log success
          if (logOptions) {
            await this.logEmailDetailed({
              ...logOptions,
              provider: usedProvider,
              status: 'sent',
              processingTimeMs: Date.now() - startTime,
            });
          }
          return true;
        } catch (graphError: any) {
          console.error('❌ Graph API email failed:', graphError.message);
          errorMessage = graphError.message;
          errorCode = graphError.code;

          // Fallback to SMTP if available and provider is 'auto'
          if (this.provider === 'auto' && this.transporter) {
            console.log('⚠️ Falling back to SMTP...');
          } else {
            // Log failure
            if (logOptions) {
              await this.logEmailDetailed({
                ...logOptions,
                provider: usedProvider,
                status: 'failed',
                errorMessage,
                errorCode,
                processingTimeMs: Date.now() - startTime,
              });
            }
            throw graphError;
          }
        }
      }

      // Use SMTP
      if (!this.transporter && !this.testMode) {
        console.error('❌ No email provider available');
        errorMessage = 'No email provider available';
        if (logOptions) {
          await this.logEmailDetailed({
            ...logOptions,
            provider: 'smtp',
            status: 'failed',
            errorMessage,
            processingTimeMs: Date.now() - startTime,
          });
        }
        return false;
      }

      // In test mode with no provider configured, just log
      if (this.testMode && !this.transporter && !useGraph) {
        console.log('📧 TEST MODE (No Provider): Email simulation');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        if (logOptions) {
          await this.logEmailDetailed({
            ...logOptions,
            provider: 'test',
            status: 'sent',
            processingTimeMs: Date.now() - startTime,
          });
        }
        return true;
      }

      if (this.transporter) {
        usedProvider = 'smtp';
        const mailOptions: any = {
          from: process.env.EMAIL_FROM,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        };

        // Add attachments if present
        if (options.attachments && options.attachments.length > 0) {
          mailOptions.attachments = options.attachments.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          }));
        }

        const info = await this.transporter.sendMail(mailOptions);
        messageId = info.messageId;
        console.log('✅ Email sent via SMTP:', messageId);

        // Log success
        if (logOptions) {
          await this.logEmailDetailed({
            ...logOptions,
            provider: usedProvider,
            status: 'sent',
            providerMessageId: messageId,
            processingTimeMs: Date.now() - startTime,
          });
        }
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('❌ Failed to send email:', error);
      errorMessage = error.message || 'Unknown error';
      errorCode = error.code;

      // Log failure
      if (logOptions) {
        await this.logEmailDetailed({
          ...logOptions,
          provider: usedProvider,
          status: 'failed',
          errorMessage,
          errorCode,
          processingTimeMs: Date.now() - startTime,
        });
      }
      return false;
    }
  }

  /**
   * Log detailed email information to email_logs table
   */
  private async logEmailDetailed(options: {
    emailType: string;
    subject: string;
    recipientEmail: string;
    recipientName?: string;
    userId?: string;
    organizationId?: string;
    provider: 'smtp' | 'graph' | 'test';
    status: 'pending' | 'sent' | 'failed' | 'bounced';
    providerMessageId?: string;
    errorMessage?: string;
    errorCode?: string;
    processingTimeMs?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const senderEmail = options.provider === 'graph'
        ? microsoftGraphService.getSenderEmail()
        : process.env.EMAIL_FROM || '';

      await pool.query(
        `INSERT INTO email_logs (
          id, organization_id, user_id, email_type, subject, recipient_email, recipient_name,
          sender_email, provider, provider_message_id, status, error_message, error_code,
          processing_time_ms, metadata, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          crypto.randomUUID(),
          options.organizationId || null,
          options.userId || null,
          options.emailType,
          options.subject,
          options.recipientEmail,
          options.recipientName || null,
          senderEmail,
          options.provider,
          options.providerMessageId || null,
          options.status,
          options.errorMessage || null,
          options.errorCode || null,
          options.processingTimeMs || null,
          JSON.stringify(options.metadata || {}),
          options.status === 'sent' ? new Date().toISOString() : null,
        ]
      );
    } catch (error) {
      console.error('Failed to log email details:', error);
    }
  }

  async sendWelcomeEmail(data: NotificationData): Promise<boolean> {
    const html = this.generateWelcomeEmailHTML(data);
    const text = this.generateWelcomeEmailText(data);
    const subject = 'Willkommen bei RamboFlow';

    const success = await this.sendEmail({
      to: data.userEmail,
      subject,
      html,
      text,
    }, {
      emailType: 'welcome',
      subject,
      recipientEmail: data.userEmail,
      recipientName: data.userName,
      userId: data.userId,
    });

    // Log notification (legacy)
    await this.logNotification(data.userId, 'welcome', success);

    return success;
  }

  async sendMonthEndReminderEmail(data: NotificationData & { daysRemaining: number }): Promise<boolean> {
    const html = this.generateMonthEndReminderHTML(data);
    const text = this.generateMonthEndReminderText(data);
    const subject = `Erinnerung: Noch ${data.daysRemaining} Tag(e) bis Monatsende`;

    const success = await this.sendEmail({
      to: data.userEmail,
      subject,
      html,
      text,
    }, {
      emailType: 'month_end_reminder',
      subject,
      recipientEmail: data.userEmail,
      recipientName: data.userName,
      userId: data.userId,
    });

    await this.logNotification(data.userId, 'month_end', success);
    return success;
  }

  async sendDailyReminderEmail(data: NotificationData): Promise<boolean> {
    const html = this.generateDailyReminderHTML(data);
    const text = this.generateDailyReminderText(data);
    const subject = 'Erinnerung: Zeiterfassung ausstehend';

    const success = await this.sendEmail({
      to: data.userEmail,
      subject,
      html,
      text,
    }, {
      emailType: 'daily_reminder',
      subject,
      recipientEmail: data.userEmail,
      recipientName: data.userName,
      userId: data.userId,
    });

    await this.logNotification(data.userId, 'daily_reminder', success);
    return success;
  }

  async sendQualityCheckEmail(data: NotificationData & { missingCount: number }): Promise<boolean> {
    const html = this.generateQualityCheckHTML(data);
    const text = this.generateQualityCheckText(data);
    const subject = `${data.missingCount} Zeiteinträge ohne Beschreibung`;

    const success = await this.sendEmail({
      to: data.userEmail,
      subject,
      html,
      text,
    }, {
      emailType: 'quality_check',
      subject,
      recipientEmail: data.userEmail,
      recipientName: data.userName,
      userId: data.userId,
      metadata: { missingCount: data.missingCount },
    });

    await this.logNotification(data.userId, 'quality_check', success);
    return success;
  }

  async sendWeeklyReportEmail(data: NotificationData & { totalHours: number; entries: any[] }): Promise<boolean> {
    const html = this.generateWeeklyReportHTML(data);
    const text = this.generateWeeklyReportText(data);
    const subject = 'Ihr Wochenreport ist verfügbar';

    const success = await this.sendEmail({
      to: data.userEmail,
      subject,
      html,
      text,
    }, {
      emailType: 'weekly_report',
      subject,
      recipientEmail: data.userEmail,
      recipientName: data.userName,
      userId: data.userId,
      metadata: { totalHours: data.totalHours, entriesCount: data.entries.length },
    });

    await this.logNotification(data.userId, 'weekly_report', success);
    return success;
  }

  // ===========================================
  // Base Email Template
  // ===========================================
  private generateEmailWrapper(title: string, content: string, ctaButton?: { text: string; url: string }): string {
    const ctaHtml = ctaButton ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${ctaButton.url}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          ${ctaButton.text}
        </a>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #7c3aed; padding: 32px 40px;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">RamboFlow</h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      ${content}
                      ${ctaHtml}
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 24px 40px; border-top: 1px solid #e5e7eb;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5;">
                              <strong>ramboeck.IT</strong><br>
                              IT-Dienstleistungen & Consulting
                            </p>
                            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                              Diese E-Mail wurde automatisch von RamboFlow generiert.<br>
                              Bei Fragen wenden Sie sich an <a href="mailto:support@ramboeck-it.com" style="color: #7c3aed; text-decoration: none;">support@ramboeck-it.com</a>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Legal Footer -->
                <table width="600" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 20px 0; text-align: center;">
                      <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                        © ${new Date().getFullYear()} ramboeck.IT - Alle Rechte vorbehalten
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

  // HTML Email Templates
  private generateWelcomeEmailHTML(data: NotificationData): string {
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${data.userName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        schön, dass Sie dabei sind! Mit RamboFlow haben Sie ab sofort Ihre Arbeitszeiten im Griff –
        übersichtlich, einfach und professionell.
      </p>

      <div style="background-color: #f5f3ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #5b21b6; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">So starten Sie durch:</h3>
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #7c3aed;">1.</strong> Legen Sie Ihre Kunden und Projekte an
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #7c3aed;">2.</strong> Erfassen Sie Ihre Arbeitszeiten mit einem Klick
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #7c3aed;">3.</strong> Erstellen Sie professionelle Reports für Ihre Kunden
            </td>
          </tr>
        </table>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
        Bei Fragen sind wir jederzeit für Sie da. Wir wünschen Ihnen viel Erfolg!
      </p>
    `;

    return this.generateEmailWrapper('Willkommen bei RamboFlow', content, {
      text: 'Jetzt einloggen',
      url: process.env.FRONTEND_URL || 'http://localhost:5173'
    });
  }

  private generateWelcomeEmailText(data: NotificationData): string {
    return `
Willkommen bei RamboFlow!

Hallo ${data.userName},

schön, dass Sie dabei sind! Mit RamboFlow haben Sie ab sofort Ihre Arbeitszeiten im Griff – übersichtlich, einfach und professionell.

So starten Sie durch:
1. Legen Sie Ihre Kunden und Projekte an
2. Erfassen Sie Ihre Arbeitszeiten mit einem Klick
3. Erstellen Sie professionelle Reports für Ihre Kunden

Jetzt einloggen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}

Bei Fragen sind wir jederzeit für Sie da. Wir wünschen Ihnen viel Erfolg!

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateMonthEndReminderHTML(data: NotificationData & { daysRemaining: number }): string {
    const dayText = data.daysRemaining === 1 ? 'Tag' : 'Tage';
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${data.userName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        der Monat neigt sich dem Ende zu – noch <strong style="color: #7c3aed;">${data.daysRemaining} ${dayText}</strong> bis zum Monatsabschluss.
      </p>

      <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #92400e; font-size: 15px; line-height: 1.6; margin: 0;">
          <strong>Kurze Erinnerung:</strong> Prüfen Sie jetzt Ihre erfassten Zeiten und erstellen Sie bei Bedarf
          Ihre Monatsreports, damit Sie pünktlich abrechnen können.
        </p>
      </div>
    `;

    return this.generateEmailWrapper('Monatsende-Erinnerung', content, {
      text: 'Zeiten prüfen',
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`
    });
  }

  private generateMonthEndReminderText(data: NotificationData & { daysRemaining: number }): string {
    const dayText = data.daysRemaining === 1 ? 'Tag' : 'Tage';
    return `
Monatsende-Erinnerung

Hallo ${data.userName},

der Monat neigt sich dem Ende zu – noch ${data.daysRemaining} ${dayText} bis zum Monatsabschluss.

Kurze Erinnerung: Prüfen Sie jetzt Ihre erfassten Zeiten und erstellen Sie bei Bedarf Ihre Monatsreports, damit Sie pünktlich abrechnen können.

Zeiten prüfen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateDailyReminderHTML(data: NotificationData): string {
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${data.userName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        für heute haben wir noch keine Zeiteinträge von Ihnen gesehen. Damit am Ende des Monats
        alles stimmt, tragen Sie Ihre Arbeitszeiten am besten gleich ein – es dauert nur einen Moment.
      </p>

      <div style="background-color: #f5f3ff; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #5b21b6; font-size: 15px; line-height: 1.6; margin: 0;">
          <strong>Tipp:</strong> Regelmäßiges Erfassen spart Zeit bei der Monatsabrechnung und sorgt für lückenlose Dokumentation.
        </p>
      </div>
    `;

    return this.generateEmailWrapper('Zeiterfassung ausstehend', content, {
      text: 'Zeiten eintragen',
      url: process.env.FRONTEND_URL || 'http://localhost:5173'
    });
  }

  private generateDailyReminderText(data: NotificationData): string {
    return `
Zeiterfassung ausstehend

Hallo ${data.userName},

für heute haben wir noch keine Zeiteinträge von Ihnen gesehen. Damit am Ende des Monats alles stimmt, tragen Sie Ihre Arbeitszeiten am besten gleich ein – es dauert nur einen Moment.

Tipp: Regelmäßiges Erfassen spart Zeit bei der Monatsabrechnung und sorgt für lückenlose Dokumentation.

Zeiten eintragen: ${process.env.FRONTEND_URL || 'http://localhost:5173'}

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateQualityCheckHTML(data: NotificationData & { missingCount: number }): string {
    const eintraegeText = data.missingCount === 1 ? 'Zeiteintrag' : 'Zeiteinträge';
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${data.userName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        bei <strong style="color: #7c3aed;">${data.missingCount} ${eintraegeText}</strong> fehlt noch eine Beschreibung.
        Für aussagekräftige Reports und eine transparente Abrechnung lohnt es sich, diese kurz zu ergänzen.
      </p>

      <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #92400e; font-size: 15px; line-height: 1.6; margin: 0;">
          <strong>Warum Beschreibungen wichtig sind:</strong> Sie helfen Ihnen und Ihren Kunden nachzuvollziehen,
          welche Arbeiten durchgeführt wurden – auch Monate später noch.
        </p>
      </div>
    `;

    return this.generateEmailWrapper('Beschreibungen vervollständigen', content, {
      text: 'Einträge bearbeiten',
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/list`
    });
  }

  private generateQualityCheckText(data: NotificationData & { missingCount: number }): string {
    const eintraegeText = data.missingCount === 1 ? 'Zeiteintrag' : 'Zeiteinträge';
    return `
Beschreibungen vervollständigen

Hallo ${data.userName},

bei ${data.missingCount} ${eintraegeText} fehlt noch eine Beschreibung. Für aussagekräftige Reports und eine transparente Abrechnung lohnt es sich, diese kurz zu ergänzen.

Warum Beschreibungen wichtig sind: Sie helfen Ihnen und Ihren Kunden nachzuvollziehen, welche Arbeiten durchgeführt wurden – auch Monate später noch.

Einträge bearbeiten: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/list

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateWeeklyReportHTML(data: NotificationData & { totalHours: number; entries: any[] }): string {
    const entriesHTML = data.entries.slice(0, 10).map(entry => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          ${new Date(entry.start_time).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
        </td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-size: 14px;">
          ${entry.project_name || 'Ohne Projekt'}
        </td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; color: #7c3aed; font-size: 14px; text-align: right; font-weight: 600;">
          ${(entry.duration / 3600).toFixed(1)}h
        </td>
      </tr>
    `).join('');

    const moreEntriesNote = data.entries.length > 10
      ? `<p style="color: #9ca3af; font-size: 13px; margin: 16px 0 0 0; text-align: center;">
          ... und ${data.entries.length - 10} weitere Einträge
        </p>`
      : '';

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${data.userName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        hier ist Ihre Wochenübersicht: Sie haben diese Woche <strong style="color: #7c3aed;">${data.totalHours.toFixed(1)} Stunden</strong> erfasst.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <tr style="background-color: #f9fafb;">
          <th style="padding: 12px 8px; text-align: left; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Datum</th>
          <th style="padding: 12px 8px; text-align: left; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Projekt</th>
          <th style="padding: 12px 8px; text-align: right; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Zeit</th>
        </tr>
        ${entriesHTML}
      </table>
      ${moreEntriesNote}
    `;

    return this.generateEmailWrapper('Ihr Wochenreport', content, {
      text: 'Zum Dashboard',
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`
    });
  }

  private generateWeeklyReportText(data: NotificationData & { totalHours: number; entries: any[] }): string {
    const entriesText = data.entries.slice(0, 10).map(entry =>
      `${new Date(entry.start_time).toLocaleDateString('de-DE')} - ${entry.project_name || 'Ohne Projekt'}: ${(entry.duration / 3600).toFixed(1)}h`
    ).join('\n');

    return `
Ihr Wochenreport

Hallo ${data.userName},

hier ist Ihre Wochenübersicht: Sie haben diese Woche ${data.totalHours.toFixed(1)} Stunden erfasst.

${entriesText}
${data.entries.length > 10 ? `\n... und ${data.entries.length - 10} weitere Einträge` : ''}

Zum Dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard

--
RamboFlow von ramboeck.IT
    `.trim();
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
      subject: `Freigabe-Anfrage: Zeiterfassungs-Report von ${senderName}`,
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
      ? `Report freigegeben von ${recipientName}`
      : `Report abgelehnt von ${recipientName}`;

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

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${recipientName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        <strong>${senderName}</strong> bittet Sie, den folgenden Zeiterfassungs-Report zu prüfen und freizugeben.
      </p>

      <div style="background-color: #f5f3ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #5b21b6; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Report-Details</h3>
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
            <td style="padding: 8px 0; color: #7c3aed; font-weight: 600; text-align: right;">${totalHours}h</td>
          </tr>
          ${reportData.totalAmount ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Gesamtbetrag:</td>
              <td style="padding: 8px 0; color: #7c3aed; font-weight: 600; text-align: right;">${reportData.totalAmount.toFixed(2)} €</td>
            </tr>
          ` : ''}
        </table>
      </div>

      <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.5;">
          <strong>Bitte beachten:</strong> Dieser Freigabe-Link ist gültig bis<br>
          ${expiresAt.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr
        </p>
      </div>

      <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0 0; text-align: center;">
        Falls der Button nicht funktioniert:<br>
        <a href="${approvalUrl}" style="color: #7c3aed; word-break: break-all;">${approvalUrl}</a>
      </p>
    `;

    return this.generateEmailWrapper('Freigabe-Anfrage', content, {
      text: 'Report prüfen und freigeben',
      url: approvalUrl
    });
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
Freigabe-Anfrage

Hallo ${recipientName},

${senderName} bittet Sie, den folgenden Zeiterfassungs-Report zu prüfen und freizugeben.

Report-Details:
- Zeitraum: ${dateRange}
${reportData.customerName ? `- Kunde: ${reportData.customerName}` : ''}
${reportData.projectName ? `- Projekt: ${reportData.projectName}` : ''}
- Gesamtstunden: ${totalHours}h
${reportData.totalAmount ? `- Gesamtbetrag: ${reportData.totalAmount.toFixed(2)} €` : ''}

Bitte beachten: Dieser Link ist gültig bis ${expiresAt.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} Uhr

Report prüfen und freigeben:
${approvalUrl}

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateReportApprovalNotificationHTML(
    senderName: string,
    recipientName: string,
    status: 'approved' | 'rejected',
    comment: string | undefined,
    reportData: any
  ): string {
    const isApproved = status === 'approved';
    const statusText = isApproved ? 'freigegeben' : 'abgelehnt';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    const statusBox = isApproved
      ? `<div style="background-color: #d1fae5; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="color: #065f46; font-size: 16px; font-weight: 600; margin: 0;">
            Ihr Report wurde freigegeben. Sie können jetzt mit der Rechnungserstellung fortfahren.
          </p>
        </div>`
      : `<div style="background-color: #fee2e2; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <p style="color: #991b1b; font-size: 16px; font-weight: 600; margin: 0;">
            Bitte überarbeiten Sie den Report entsprechend dem Feedback.
          </p>
        </div>`;

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${senderName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        <strong>${recipientName}</strong> hat Ihren Report <strong style="color: ${isApproved ? '#059669' : '#dc2626'}">${statusText}</strong>.
      </p>

      <div style="background-color: #f5f3ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #5b21b6; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Report-Details</h3>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
          <strong>Zeitraum:</strong> ${dateRange}
        </p>
        ${reportData.customerName ? `
          <p style="color: #6b7280; font-size: 14px; margin: 0;">
            <strong>Kunde:</strong> ${reportData.customerName}
          </p>
        ` : ''}
      </div>

      ${comment ? `
        <div style="background-color: #f9fafb; border-left: 4px solid #7c3aed; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <h4 style="color: #1f2937; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Kommentar:</h4>
          <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">
            ${comment}
          </p>
        </div>
      ` : ''}

      ${statusBox}
    `;

    return this.generateEmailWrapper(`Report ${statusText}`, content);
  }

  private generateReportApprovalNotificationText(
    senderName: string,
    recipientName: string,
    status: 'approved' | 'rejected',
    comment: string | undefined,
    reportData: any
  ): string {
    const statusText = status === 'approved' ? 'freigegeben' : 'abgelehnt';
    const dateRange = `${new Date(reportData.startDate).toLocaleDateString('de-DE')} - ${new Date(reportData.endDate).toLocaleDateString('de-DE')}`;

    return `
Report ${statusText}

Hallo ${senderName},

${recipientName} hat Ihren Report ${statusText}.

Report-Details:
- Zeitraum: ${dateRange}
${reportData.customerName ? `- Kunde: ${reportData.customerName}` : ''}

${comment ? `Kommentar:\n${comment}\n` : ''}

${status === 'approved'
  ? 'Ihr Report wurde freigegeben. Sie können jetzt mit der Rechnungserstellung fortfahren.'
  : 'Bitte überarbeiten Sie den Report entsprechend dem Feedback.'}

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  // ============================================================================
  // TICKET NOTIFICATION EMAILS
  // ============================================================================

  async sendTicketReplyNotification(data: {
    to: string;
    customerName: string;
    ticketNumber: string;
    ticketTitle: string;
    replyContent: string;
    replierName: string;
    portalUrl: string;
  }): Promise<boolean> {
    const { to, customerName, ticketNumber, ticketTitle, replyContent, replierName, portalUrl } = data;

    const html = this.generateTicketReplyHTML(customerName, ticketNumber, ticketTitle, replyContent, replierName, portalUrl);
    const text = this.generateTicketReplyText(customerName, ticketNumber, ticketTitle, replyContent, replierName, portalUrl);

    return await this.sendEmail({
      to,
      subject: `Neue Antwort zu Ticket #${ticketNumber}: ${ticketTitle}`,
      html,
      text
    });
  }

  async sendTicketStatusChangeNotification(data: {
    to: string;
    customerName: string;
    ticketNumber: string;
    ticketTitle: string;
    oldStatus: string;
    newStatus: string;
    portalUrl: string;
  }): Promise<boolean> {
    const { to, customerName, ticketNumber, ticketTitle, oldStatus, newStatus, portalUrl } = data;

    const html = this.generateTicketStatusChangeHTML(customerName, ticketNumber, ticketTitle, oldStatus, newStatus, portalUrl);
    const text = this.generateTicketStatusChangeText(customerName, ticketNumber, ticketTitle, oldStatus, newStatus, portalUrl);

    return await this.sendEmail({
      to,
      subject: `Ticket #${ticketNumber} Status: ${this.getStatusLabel(newStatus)}`,
      html,
      text
    });
  }

  async sendTicketCreatedNotification(data: {
    to: string;
    customerName: string;
    ticketNumber: string;
    ticketTitle: string;
    ticketDescription: string;
    portalUrl: string;
  }): Promise<boolean> {
    const { to, customerName, ticketNumber, ticketTitle, ticketDescription, portalUrl } = data;

    const html = this.generateTicketCreatedHTML(customerName, ticketNumber, ticketTitle, ticketDescription, portalUrl);
    const text = this.generateTicketCreatedText(customerName, ticketNumber, ticketTitle, ticketDescription, portalUrl);

    return await this.sendEmail({
      to,
      subject: `Ticket #${ticketNumber} erstellt: ${ticketTitle}`,
      html,
      text
    });
  }

  // Send notification to admin/service provider when customer creates a ticket
  async sendNewTicketAdminNotification(data: {
    to: string;
    customerName: string;
    contactName: string;
    ticketNumber: string;
    ticketTitle: string;
    ticketDescription: string;
    priority: string;
    adminUrl: string;
  }): Promise<boolean> {
    const { to, customerName, contactName, ticketNumber, ticketTitle, ticketDescription, priority, adminUrl } = data;

    const priorityLabels: Record<string, string> = {
      low: 'Niedrig',
      normal: 'Normal',
      high: 'Hoch',
      critical: 'Kritisch',
    };
    const priorityLabel = priorityLabels[priority] || priority;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Neues Ticket erstellt</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎫 Neues Ticket von Kunde</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Ein neues Ticket wurde erstellt:</p>

                      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <p style="margin: 0 0 10px 0;"><strong>Ticket:</strong> #${ticketNumber}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Kunde:</strong> ${customerName}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Erstellt von:</strong> ${contactName}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Priorität:</strong> ${priorityLabel}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Betreff:</strong> ${ticketTitle}</p>
                        ${ticketDescription ? `<p style="margin: 0;"><strong>Beschreibung:</strong><br>${ticketDescription.substring(0, 500)}${ticketDescription.length > 500 ? '...' : ''}</p>` : ''}
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${adminUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold;">
                          Ticket öffnen
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        Diese E-Mail wurde automatisch generiert.
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

    const text = `Neues Ticket von Kunde\n\nTicket: #${ticketNumber}\nKunde: ${customerName}\nErstellt von: ${contactName}\nPriorität: ${priorityLabel}\nBetreff: ${ticketTitle}\n${ticketDescription ? `\nBeschreibung: ${ticketDescription.substring(0, 500)}` : ''}\n\nTicket öffnen: ${adminUrl}`;

    return await this.sendEmail({
      to,
      subject: `Neues Ticket #${ticketNumber} von ${customerName}: ${ticketTitle}`,
      html,
      text
    });
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      open: 'Offen',
      in_progress: 'In Bearbeitung',
      waiting: 'Wartend',
      resolved: 'Gelöst',
      closed: 'Geschlossen',
      archived: 'Archiviert',
    };
    return labels[status] || status;
  }

  private generateTicketReplyHTML(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    replyContent: string,
    replierName: string,
    portalUrl: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Neue Antwort zu Ihrem Ticket</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">💬 Neue Antwort zu Ihrem Ticket</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Hallo ${customerName},</p>
                      <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                        es gibt eine neue Antwort zu Ihrem Ticket:
                      </p>

                      <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0 0 5px 0;">
                          <strong>Ticket #${ticketNumber}</strong>
                        </p>
                        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
                          ${ticketTitle}
                        </p>
                      </div>

                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0 0 10px 0;">
                          <strong>${replierName}</strong> schrieb:
                        </p>
                        <p style="color: #1f2937; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">
${replyContent}
                        </p>
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${portalUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                          Im Portal antworten →
                        </a>
                      </div>

                      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        Sie können direkt auf diese E-Mail antworten oder das Kundenportal nutzen.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow Support<br>
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

  private generateTicketReplyText(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    replyContent: string,
    replierName: string,
    portalUrl: string
  ): string {
    return `
Neue Antwort zu Ihrem Ticket

Hallo ${customerName},

es gibt eine neue Antwort zu Ihrem Ticket:

Ticket #${ticketNumber}: ${ticketTitle}

${replierName} schrieb:
---
${replyContent}
---

Im Portal antworten: ${portalUrl}

Sie können direkt auf diese E-Mail antworten oder das Kundenportal nutzen.

--
RamboFlow Support
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  private generateTicketStatusChangeHTML(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    oldStatus: string,
    newStatus: string,
    portalUrl: string
  ): string {
    const statusColors: Record<string, string> = {
      open: '#3b82f6',
      in_progress: '#f59e0b',
      waiting: '#8b5cf6',
      resolved: '#10b981',
      closed: '#6b7280',
      archived: '#9ca3af',
    };

    const newStatusColor = statusColors[newStatus] || '#6b7280';
    const statusIcon = newStatus === 'resolved' ? '✅' : newStatus === 'closed' ? '🔒' : '🔄';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ticket Status aktualisiert</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, ${newStatusColor} 0%, ${newStatusColor}dd 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${statusIcon} Ticket Status aktualisiert</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Hallo ${customerName},</p>
                      <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                        der Status Ihres Tickets wurde aktualisiert:
                      </p>

                      <div style="background-color: #f3f4f6; border-left: 4px solid ${newStatusColor}; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0 0 5px 0;">
                          <strong>Ticket #${ticketNumber}</strong>
                        </p>
                        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
                          ${ticketTitle}
                        </p>
                      </div>

                      <div style="text-align: center; margin: 25px 0;">
                        <span style="display: inline-block; padding: 8px 16px; background-color: #f3f4f6; color: #6b7280; border-radius: 6px; font-size: 14px;">
                          ${this.getStatusLabel(oldStatus)}
                        </span>
                        <span style="display: inline-block; margin: 0 15px; color: #9ca3af; font-size: 20px;">→</span>
                        <span style="display: inline-block; padding: 8px 16px; background-color: ${newStatusColor}20; color: ${newStatusColor}; border-radius: 6px; font-size: 14px; font-weight: 600;">
                          ${this.getStatusLabel(newStatus)}
                        </span>
                      </div>

                      ${newStatus === 'resolved' ? `
                        <div style="background-color: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
                          <p style="color: #065f46; margin: 0; font-size: 14px;">
                            ✅ Ihr Ticket wurde als gelöst markiert. Falls Sie weitere Fragen haben, können Sie jederzeit antworten.
                          </p>
                        </div>
                      ` : ''}

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${portalUrl}" style="display: inline-block; background-color: ${newStatusColor}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                          Ticket im Portal ansehen →
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow Support<br>
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

  private generateTicketStatusChangeText(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    oldStatus: string,
    newStatus: string,
    portalUrl: string
  ): string {
    return `
Ticket Status aktualisiert

Hallo ${customerName},

der Status Ihres Tickets wurde aktualisiert:

Ticket #${ticketNumber}: ${ticketTitle}

Status: ${this.getStatusLabel(oldStatus)} → ${this.getStatusLabel(newStatus)}

${newStatus === 'resolved' ? 'Ihr Ticket wurde als gelöst markiert. Falls Sie weitere Fragen haben, können Sie jederzeit antworten.\n' : ''}
Ticket im Portal ansehen: ${portalUrl}

--
RamboFlow Support
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  private generateTicketCreatedHTML(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    ticketDescription: string,
    portalUrl: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ticket erstellt</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎫 Ticket erfolgreich erstellt</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Hallo ${customerName},</p>
                      <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                        vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und werden uns schnellstmöglich darum kümmern.
                      </p>

                      <div style="background-color: #f3f4f6; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0 0 5px 0;">
                          <strong>Ticket #${ticketNumber}</strong>
                        </p>
                        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0 0 10px 0;">
                          ${ticketTitle}
                        </p>
                        <p style="color: #4b5563; font-size: 14px; margin: 0; white-space: pre-wrap; line-height: 1.5;">
${ticketDescription.substring(0, 300)}${ticketDescription.length > 300 ? '...' : ''}
                        </p>
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${portalUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                          Ticket im Portal verfolgen →
                        </a>
                      </div>

                      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        Sie erhalten eine Benachrichtigung, sobald wir Ihnen antworten.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow Support<br>
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

  private generateTicketCreatedText(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    ticketDescription: string,
    portalUrl: string
  ): string {
    return `
Ticket erfolgreich erstellt

Hallo ${customerName},

vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und werden uns schnellstmöglich darum kümmern.

Ticket #${ticketNumber}: ${ticketTitle}

${ticketDescription.substring(0, 300)}${ticketDescription.length > 300 ? '...' : ''}

Ticket im Portal verfolgen: ${portalUrl}

Sie erhalten eine Benachrichtigung, sobald wir Ihnen antworten.

--
RamboFlow Support
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  // ============================================================================
  // MAINTENANCE NOTIFICATION EMAILS
  // ============================================================================

  private getMaintenanceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      patch: 'Patch/Update',
      reboot: 'Neustart',
      security_update: 'Sicherheitsupdate',
      firmware: 'Firmware-Update',
      general: 'Allgemeine Wartung'
    };
    return labels[type] || type;
  }

  private getMaintenanceTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      patch: '🔧',
      reboot: '🔄',
      security_update: '🔒',
      firmware: '💾',
      general: '🛠️'
    };
    return icons[type] || '🛠️';
  }

  async sendMaintenanceNotification(data: {
    to: string;
    customerName: string;
    senderName: string;
    announcement: {
      title: string;
      description?: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
      approvalDeadline?: Date;
    };
    approvalUrl: string;
    requireApproval: boolean;
  }): Promise<boolean> {
    const { to, customerName, senderName, announcement, approvalUrl, requireApproval } = data;

    const html = this.generateMaintenanceNotificationHTML(customerName, senderName, announcement, approvalUrl, requireApproval);
    const text = this.generateMaintenanceNotificationText(customerName, senderName, announcement, approvalUrl, requireApproval);

    const icon = this.getMaintenanceTypeIcon(announcement.maintenanceType);

    return await this.sendEmail({
      to,
      subject: `${icon} Wartungsankündigung: ${announcement.title}`,
      html,
      text
    });
  }

  async sendMaintenanceReminder(data: {
    to: string;
    customerName: string;
    announcement: {
      title: string;
      scheduledStart: Date;
      approvalDeadline?: Date;
    };
    approvalUrl: string;
  }): Promise<boolean> {
    const { to, customerName, announcement, approvalUrl } = data;

    const html = this.generateMaintenanceReminderHTML(customerName, announcement, approvalUrl);
    const text = this.generateMaintenanceReminderText(customerName, announcement, approvalUrl);

    return await this.sendEmail({
      to,
      subject: `⏰ Erinnerung: Freigabe erforderlich - ${announcement.title}`,
      html,
      text
    });
  }

  async sendMaintenanceApprovalNotification(data: {
    to: string;
    customerName: string;
    announcementTitle: string;
    action: 'approved' | 'rejected';
    reason?: string;
    approverName?: string;
  }): Promise<boolean> {
    const { to, customerName, announcementTitle, action, reason, approverName } = data;

    const html = this.generateMaintenanceApprovalNotificationHTML(customerName, announcementTitle, action, reason, approverName);
    const text = this.generateMaintenanceApprovalNotificationText(customerName, announcementTitle, action, reason, approverName);

    const icon = action === 'approved' ? '✅' : '❌';
    const statusText = action === 'approved' ? 'genehmigt' : 'abgelehnt';

    return await this.sendEmail({
      to,
      subject: `${icon} Wartung ${statusText}: ${announcementTitle} (${customerName})`,
      html,
      text
    });
  }

  async sendMaintenanceCompletionNotification(data: {
    to: string;
    customerName: string;
    senderName: string;
    announcement: {
      title: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
    };
    completionNotes?: string;
  }): Promise<boolean> {
    const { to, customerName, senderName, announcement, completionNotes } = data;

    const html = this.generateMaintenanceCompletionHTML(customerName, senderName, announcement, completionNotes);
    const text = this.generateMaintenanceCompletionText(customerName, senderName, announcement, completionNotes);

    const icon = this.getMaintenanceTypeIcon(announcement.maintenanceType);

    return await this.sendEmail({
      to,
      subject: `✅ Wartung abgeschlossen: ${announcement.title}`,
      html,
      text
    });
  }

  private generateMaintenanceCompletionHTML(
    customerName: string,
    senderName: string,
    announcement: {
      title: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
    },
    completionNotes?: string
  ): string {
    const typeLabel = this.getMaintenanceTypeLabel(announcement.maintenanceType);
    const logoUrl = `${process.env.FRONTEND_URL}/logo-ramboeckit.png`;

    const formatDateTime = (date: Date) => {
      return date.toLocaleString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Wartung abgeschlossen</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
                      <img src="${logoUrl}" alt="Ramboeck IT" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✅ Wartung erfolgreich abgeschlossen</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Sehr geehrte/r ${customerName},</p>
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                        wir freuen uns Ihnen mitteilen zu können, dass die angekündigten Wartungsarbeiten erfolgreich abgeschlossen wurden.
                      </p>

                      <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                        <h2 style="color: #065f46; margin: 0 0 15px 0; font-size: 20px;">${announcement.title}</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; color: #047857; font-size: 14px; vertical-align: top; width: 140px;"><strong>Typ:</strong></td>
                            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${typeLabel}</td>
                          </tr>
                          ${announcement.affectedSystems ? `
                            <tr>
                              <td style="padding: 8px 0; color: #047857; font-size: 14px; vertical-align: top;"><strong>Betroffene Systeme:</strong></td>
                              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${announcement.affectedSystems}</td>
                            </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 8px 0; color: #047857; font-size: 14px; vertical-align: top;"><strong>Durchgeführt:</strong></td>
                            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${formatDateTime(announcement.scheduledStart)}</td>
                          </tr>
                        </table>
                      </div>

                      ${completionNotes ? `
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                          <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">Anmerkungen</h3>
                          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${completionNotes}</p>
                        </div>
                      ` : ''}

                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                        Alle Systeme sollten nun wieder uneingeschränkt verfügbar sein. Sollten Sie wider Erwarten Probleme feststellen, kontaktieren Sie uns bitte umgehend.
                      </p>

                      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        Vielen Dank für Ihr Vertrauen.<br>
                        Mit freundlichen Grüßen,<br>
                        <strong>${senderName}</strong>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - IT-Service-Management<br>
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

  private generateMaintenanceCompletionText(
    customerName: string,
    senderName: string,
    announcement: {
      title: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
    },
    completionNotes?: string
  ): string {
    const typeLabel = this.getMaintenanceTypeLabel(announcement.maintenanceType);
    const formatDateTime = (date: Date) => date.toLocaleString('de-DE');

    return `
WARTUNG ERFOLGREICH ABGESCHLOSSEN
================================

Sehr geehrte/r ${customerName},

wir freuen uns Ihnen mitteilen zu können, dass die angekündigten Wartungsarbeiten erfolgreich abgeschlossen wurden.

DETAILS:
- Titel: ${announcement.title}
- Typ: ${typeLabel}
${announcement.affectedSystems ? `- Betroffene Systeme: ${announcement.affectedSystems}` : ''}
- Durchgeführt: ${formatDateTime(announcement.scheduledStart)}

${completionNotes ? `ANMERKUNGEN:\n${completionNotes}\n` : ''}
Alle Systeme sollten nun wieder uneingeschränkt verfügbar sein. Sollten Sie wider Erwarten Probleme feststellen, kontaktieren Sie uns bitte umgehend.

Vielen Dank für Ihr Vertrauen.
Mit freundlichen Grüßen,
${senderName}
    `.trim();
  }

  private generateMaintenanceNotificationHTML(
    customerName: string,
    senderName: string,
    announcement: {
      title: string;
      description?: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
      approvalDeadline?: Date;
    },
    approvalUrl: string,
    requireApproval: boolean
  ): string {
    const typeLabel = this.getMaintenanceTypeLabel(announcement.maintenanceType);
    const typeIcon = this.getMaintenanceTypeIcon(announcement.maintenanceType);

    const formatDateTime = (date: Date) => {
      return date.toLocaleString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const logoUrl = `${process.env.FRONTEND_URL}/logo-ramboeckit.png`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Wartungsankündigung</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
                      <img src="${logoUrl}" alt="Ramboeck IT" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${typeIcon} Wartungsankündigung</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Sehr geehrte/r ${customerName},</p>
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                        wir möchten Sie über eine geplante Wartung informieren:
                      </p>

                      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                        <h2 style="color: #92400e; margin: 0 0 15px 0; font-size: 20px;">${announcement.title}</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; color: #78350f; font-size: 14px; vertical-align: top; width: 140px;"><strong>Typ:</strong></td>
                            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${typeLabel}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #78350f; font-size: 14px; vertical-align: top;"><strong>Beginn:</strong></td>
                            <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600;">${formatDateTime(announcement.scheduledStart)}</td>
                          </tr>
                          ${announcement.scheduledEnd ? `
                            <tr>
                              <td style="padding: 8px 0; color: #78350f; font-size: 14px; vertical-align: top;"><strong>Ende:</strong></td>
                              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${formatDateTime(announcement.scheduledEnd)}</td>
                            </tr>
                          ` : ''}
                          ${announcement.affectedSystems ? `
                            <tr>
                              <td style="padding: 8px 0; color: #78350f; font-size: 14px; vertical-align: top;"><strong>Betroffene Systeme:</strong></td>
                              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${announcement.affectedSystems}</td>
                            </tr>
                          ` : ''}
                        </table>
                      </div>

                      ${announcement.description ? `
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                          <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">Beschreibung</h3>
                          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${announcement.description}</p>
                        </div>
                      ` : ''}

                      ${requireApproval ? `
                        <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                          <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 16px;">Ihre Freigabe ist erforderlich</h3>
                          <p style="color: #1e40af; font-size: 14px; line-height: 1.5; margin: 0;">
                            Bitte bestätigen Sie, dass die Wartung wie geplant durchgeführt werden kann.
                            ${announcement.approvalDeadline ? `<br><strong>Frist: ${formatDateTime(announcement.approvalDeadline)}</strong>` : ''}
                          </p>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${approvalUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; margin-right: 10px;">
                            ✓ Wartung genehmigen
                          </a>
                        </div>

                        <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 10px;">
                          Oder besuchen Sie: <a href="${approvalUrl}" style="color: #3b82f6;">${approvalUrl}</a>
                        </p>
                      ` : `
                        <div style="background-color: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
                          <p style="color: #065f46; margin: 0; font-size: 14px;">
                            ℹ️ Dies ist eine reine Information. Es ist keine Freigabe erforderlich.
                          </p>
                        </div>
                      `}

                      <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        Bei Fragen stehen wir Ihnen gerne zur Verfügung.<br>
                        Mit freundlichen Grüßen,<br>
                        <strong>${senderName}</strong>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - IT-Service-Management<br>
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

  private generateMaintenanceNotificationText(
    customerName: string,
    senderName: string,
    announcement: {
      title: string;
      description?: string;
      maintenanceType: string;
      affectedSystems?: string;
      scheduledStart: Date;
      scheduledEnd?: Date;
      approvalDeadline?: Date;
    },
    approvalUrl: string,
    requireApproval: boolean
  ): string {
    const typeLabel = this.getMaintenanceTypeLabel(announcement.maintenanceType);
    const formatDateTime = (date: Date) => date.toLocaleString('de-DE');

    return `
Wartungsankündigung

Sehr geehrte/r ${customerName},

wir möchten Sie über eine geplante Wartung informieren:

${announcement.title}
---
Typ: ${typeLabel}
Beginn: ${formatDateTime(announcement.scheduledStart)}
${announcement.scheduledEnd ? `Ende: ${formatDateTime(announcement.scheduledEnd)}` : ''}
${announcement.affectedSystems ? `Betroffene Systeme: ${announcement.affectedSystems}` : ''}

${announcement.description || ''}

${requireApproval ? `
Ihre Freigabe ist erforderlich!
${announcement.approvalDeadline ? `Frist: ${formatDateTime(announcement.approvalDeadline)}` : ''}

Wartung genehmigen oder ablehnen: ${approvalUrl}
` : 'Dies ist eine reine Information. Es ist keine Freigabe erforderlich.'}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen,
${senderName}

--
RamboFlow - IT-Service-Management
© ${new Date().getFullYear()} Alle Rechte vorbehalten
    `;
  }

  private generateMaintenanceReminderHTML(
    customerName: string,
    announcement: {
      title: string;
      scheduledStart: Date;
      approvalDeadline?: Date;
    },
    approvalUrl: string
  ): string {
    const formatDateTime = (date: Date) => {
      return date.toLocaleString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const logoUrl = `${process.env.FRONTEND_URL}/logo-ramboeckit.png`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Erinnerung: Wartungsfreigabe</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center;">
                      <img src="${logoUrl}" alt="Ramboeck IT" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">⏰ Erinnerung: Freigabe erforderlich</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Sehr geehrte/r ${customerName},</p>
                      <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                        wir haben noch keine Rückmeldung zu folgender Wartung erhalten:
                      </p>

                      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                        <h2 style="color: #991b1b; margin: 0 0 10px 0; font-size: 18px;">${announcement.title}</h2>
                        <p style="color: #7f1d1d; margin: 5px 0; font-size: 14px;">
                          <strong>Geplant für:</strong> ${formatDateTime(announcement.scheduledStart)}
                        </p>
                        ${announcement.approvalDeadline ? `
                          <p style="color: #7f1d1d; margin: 5px 0; font-size: 14px;">
                            <strong>Frist:</strong> ${formatDateTime(announcement.approvalDeadline)}
                          </p>
                        ` : ''}
                      </div>

                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${approvalUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                          Jetzt Freigabe erteilen →
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - IT-Service-Management
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

  private generateMaintenanceReminderText(
    customerName: string,
    announcement: {
      title: string;
      scheduledStart: Date;
      approvalDeadline?: Date;
    },
    approvalUrl: string
  ): string {
    const formatDateTime = (date: Date) => date.toLocaleString('de-DE');

    return `
Erinnerung: Freigabe erforderlich

Sehr geehrte/r ${customerName},

wir haben noch keine Rückmeldung zu folgender Wartung erhalten:

${announcement.title}
Geplant für: ${formatDateTime(announcement.scheduledStart)}
${announcement.approvalDeadline ? `Frist: ${formatDateTime(announcement.approvalDeadline)}` : ''}

Jetzt Freigabe erteilen: ${approvalUrl}

--
RamboFlow - IT-Service-Management
    `;
  }

  private generateMaintenanceApprovalNotificationHTML(
    customerName: string,
    announcementTitle: string,
    action: 'approved' | 'rejected',
    reason?: string,
    approverName?: string
  ): string {
    const isApproved = action === 'approved';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const statusIcon = isApproved ? '✅' : '❌';
    const statusText = isApproved ? 'genehmigt' : 'abgelehnt';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Wartung ${statusText}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${statusIcon} Wartung ${statusText}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <p style="color: #1f2937; font-size: 16px; margin-top: 0;">
                        <strong>${customerName}</strong> hat die Wartung <strong>${statusText}</strong>.
                      </p>

                      <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">${announcementTitle}</h3>
                        ${approverName ? `<p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Genehmigt von: ${approverName}</p>` : ''}
                      </div>

                      ${reason ? `
                        <div style="background-color: ${isApproved ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px 0;">
                          <h4 style="color: #1f2937; margin: 0 0 8px 0; font-size: 14px;">Kommentar:</h4>
                          <p style="color: #4b5563; margin: 0; font-size: 14px;">${reason}</p>
                        </div>
                      ` : ''}

                      ${isApproved ? `
                        <p style="color: #10b981; font-size: 15px; font-weight: 600; margin: 25px 0; text-align: center;">
                          Die Wartung kann wie geplant durchgeführt werden.
                        </p>
                      ` : `
                        <p style="color: #ef4444; font-size: 15px; font-weight: 600; margin: 25px 0; text-align: center;">
                          Bitte kontaktieren Sie den Kunden für weitere Abstimmung.
                        </p>
                      `}
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        RamboFlow - IT-Service-Management
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

  private generateMaintenanceApprovalNotificationText(
    customerName: string,
    announcementTitle: string,
    action: 'approved' | 'rejected',
    reason?: string,
    approverName?: string
  ): string {
    const statusIcon = action === 'approved' ? '✅' : '❌';
    const statusText = action === 'approved' ? 'genehmigt' : 'abgelehnt';

    return `
${statusIcon} Wartung ${statusText}

${customerName} hat die Wartung ${statusText}.

Wartung: ${announcementTitle}
${approverName ? `Genehmigt von: ${approverName}` : ''}

${reason ? `Kommentar: ${reason}` : ''}

${action === 'approved'
  ? 'Die Wartung kann wie geplant durchgeführt werden.'
  : 'Bitte kontaktieren Sie den Kunden für weitere Abstimmung.'}

--
RamboFlow - IT-Service-Management
    `;
  }
}

export const emailService = new EmailService();
