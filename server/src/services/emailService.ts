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
        <a href="${ctaButton.url}" style="display: inline-block; background-color: #F27024; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
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
                    <td style="background-color: #F27024; padding: 32px 40px;">
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
                              Bei Fragen wenden Sie sich an <a href="mailto:support@ramboeck-it.com" style="color: #F27024; text-decoration: none;">support@ramboeck-it.com</a>
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

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #36313E; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">So starten Sie durch:</h3>
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">1.</strong> Legen Sie Ihre Kunden und Projekte an
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">2.</strong> Erfassen Sie Ihre Arbeitszeiten mit einem Klick
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">3.</strong> Erstellen Sie professionelle Reports für Ihre Kunden
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
        der Monat neigt sich dem Ende zu – noch <strong style="color: #F27024;">${data.daysRemaining} ${dayText}</strong> bis zum Monatsabschluss.
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

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #36313E; font-size: 15px; line-height: 1.6; margin: 0;">
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
        bei <strong style="color: #F27024;">${data.missingCount} ${eintraegeText}</strong> fehlt noch eine Beschreibung.
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
        <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; color: #F27024; font-size: 14px; text-align: right; font-weight: 600;">
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
        hier ist Ihre Wochenübersicht: Sie haben diese Woche <strong style="color: #F27024;">${data.totalHours.toFixed(1)} Stunden</strong> erfasst.
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

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #36313E; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Report-Details</h3>
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
            <td style="padding: 8px 0; color: #F27024; font-weight: 600; text-align: right;">${totalHours}h</td>
          </tr>
          ${reportData.totalAmount ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Gesamtbetrag:</td>
              <td style="padding: 8px 0; color: #F27024; font-weight: 600; text-align: right;">${reportData.totalAmount.toFixed(2)} €</td>
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
        <a href="${approvalUrl}" style="color: #F27024; word-break: break-all;">${approvalUrl}</a>
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

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #36313E; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Report-Details</h3>
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
        <div style="background-color: #f9fafb; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
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
    const priorityColors: Record<string, string> = {
      low: '#10b981',
      normal: '#F27024',
      high: '#f59e0b',
      critical: '#ef4444',
    };
    const priorityLabel = priorityLabels[priority] || priority;
    const priorityColor = priorityColors[priority] || '#F27024';

    const content = `
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Ein neuer Support-Fall wurde von einem Kunden eingereicht.
      </p>

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Ticket:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">#${ticketNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Kunde:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Erstellt von:</td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${contactName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Priorität:</td>
            <td style="padding: 8px 0;">
              <span style="display: inline-block; padding: 4px 12px; background-color: ${priorityColor}20; color: ${priorityColor}; border-radius: 4px; font-size: 13px; font-weight: 600;">
                ${priorityLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Betreff:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">${ticketTitle}</td>
          </tr>
        </table>
        ${ticketDescription ? `
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0;">Beschreibung:</p>
            <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6; white-space: pre-wrap;">${ticketDescription.substring(0, 500)}${ticketDescription.length > 500 ? '...' : ''}</p>
          </div>
        ` : ''}
      </div>
    `;

    const html = this.generateEmailWrapper('Neues Support-Ticket', content, {
      text: 'Ticket bearbeiten',
      url: adminUrl
    });

    const text = `
Neues Support-Ticket

Ein neuer Support-Fall wurde von einem Kunden eingereicht.

Ticket: #${ticketNumber}
Kunde: ${customerName}
Erstellt von: ${contactName}
Priorität: ${priorityLabel}
Betreff: ${ticketTitle}
${ticketDescription ? `\nBeschreibung:\n${ticketDescription.substring(0, 500)}${ticketDescription.length > 500 ? '...' : ''}` : ''}

Ticket bearbeiten: ${adminUrl}

--
RamboFlow von ramboeck.IT
    `.trim();

    return await this.sendEmail({
      to,
      subject: `Neues Ticket #${ticketNumber} von ${customerName}: ${ticketTitle}`,
      html,
      text
    });
  }

  // ============================================================================
  // ASSIGNEE (BEARBEITER) NOTIFICATION EMAILS
  // ============================================================================

  /**
   * Send notification to user when they are assigned to a ticket
   */
  async sendTicketAssignedNotification(data: {
    to: string;
    assigneeName: string;
    assignedByName: string;
    ticketNumber: string;
    ticketTitle: string;
    ticketDescription: string;
    customerName: string;
    priority: string;
    ticketUrl: string;
  }): Promise<boolean> {
    const { to, assigneeName, assignedByName, ticketNumber, ticketTitle, ticketDescription, customerName, priority, ticketUrl } = data;

    const priorityLabels: Record<string, string> = {
      low: 'Niedrig',
      normal: 'Normal',
      high: 'Hoch',
      critical: 'Kritisch',
    };
    const priorityColors: Record<string, string> = {
      low: '#10b981',
      normal: '#F27024',
      high: '#f59e0b',
      critical: '#ef4444',
    };
    const priorityLabel = priorityLabels[priority] || priority;
    const priorityColor = priorityColors[priority] || '#F27024';

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${assigneeName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        <strong>${assignedByName}</strong> hat Ihnen ein Ticket zugewiesen.
      </p>

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Ticket:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">#${ticketNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Kunde:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Priorität:</td>
            <td style="padding: 8px 0;">
              <span style="display: inline-block; padding: 4px 12px; background-color: ${priorityColor}20; color: ${priorityColor}; border-radius: 4px; font-size: 13px; font-weight: 600;">
                ${priorityLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Betreff:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 14px;">${ticketTitle}</td>
          </tr>
        </table>
        ${ticketDescription ? `
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0;">Beschreibung:</p>
            <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6; white-space: pre-wrap;">${ticketDescription.substring(0, 500)}${ticketDescription.length > 500 ? '...' : ''}</p>
          </div>
        ` : ''}
      </div>
    `;

    const html = this.generateEmailWrapper('Ticket zugewiesen', content, {
      text: 'Ticket öffnen',
      url: ticketUrl
    });

    const text = `
Ticket zugewiesen

Hallo ${assigneeName},

${assignedByName} hat Ihnen ein Ticket zugewiesen.

Ticket: #${ticketNumber}
Kunde: ${customerName}
Priorität: ${priorityLabel}
Betreff: ${ticketTitle}
${ticketDescription ? `\nBeschreibung:\n${ticketDescription.substring(0, 500)}${ticketDescription.length > 500 ? '...' : ''}` : ''}

Ticket öffnen: ${ticketUrl}

--
RamboFlow von ramboeck.IT
    `.trim();

    return await this.sendEmail({
      to,
      subject: `Ticket #${ticketNumber} zugewiesen: ${ticketTitle}`,
      html,
      text
    });
  }

  /**
   * Send notification to assignee when a new comment is added to their ticket
   */
  async sendTicketCommentNotificationToAssignee(data: {
    to: string;
    assigneeName: string;
    commenterName: string;
    ticketNumber: string;
    ticketTitle: string;
    commentContent: string;
    customerName: string;
    isFromCustomer: boolean;
    ticketUrl: string;
  }): Promise<boolean> {
    const { to, assigneeName, commenterName, ticketNumber, ticketTitle, commentContent, customerName, isFromCustomer, ticketUrl } = data;

    const sourceLabel = isFromCustomer ? 'Kundenkommentar' : 'Interner Kommentar';
    const sourceColor = isFromCustomer ? '#F27024' : '#6366f1';

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${assigneeName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Es gibt einen neuen Kommentar zu Ihrem zugewiesenen Ticket.
      </p>

      <div style="background-color: #FEF7F4; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Ticket #${ticketNumber}</strong> • ${customerName}
        </p>
        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
          ${ticketTitle}
        </p>
      </div>

      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <span style="display: inline-block; padding: 4px 10px; background-color: ${sourceColor}20; color: ${sourceColor}; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 8px;">
            ${sourceLabel}
          </span>
          <span style="color: #F27024; font-size: 14px; font-weight: 600;">
            ${commenterName}
          </span>
        </div>
        <p style="color: #1f2937; font-size: 15px; line-height: 1.7; margin: 0; white-space: pre-wrap;">
${commentContent.substring(0, 1000)}${commentContent.length > 1000 ? '...' : ''}
        </p>
      </div>
    `;

    const html = this.generateEmailWrapper('Neuer Kommentar zu Ihrem Ticket', content, {
      text: 'Ticket öffnen',
      url: ticketUrl
    });

    const text = `
Neuer Kommentar zu Ihrem Ticket

Hallo ${assigneeName},

Es gibt einen neuen Kommentar zu Ihrem zugewiesenen Ticket.

Ticket #${ticketNumber}: ${ticketTitle}
Kunde: ${customerName}

${sourceLabel} von ${commenterName}:
---
${commentContent.substring(0, 1000)}${commentContent.length > 1000 ? '...' : ''}
---

Ticket öffnen: ${ticketUrl}

--
RamboFlow von ramboeck.IT
    `.trim();

    return await this.sendEmail({
      to,
      subject: `${isFromCustomer ? 'Kundenkommentar' : 'Kommentar'} zu Ticket #${ticketNumber}: ${ticketTitle}`,
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
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Sie haben eine neue Antwort zu Ihrem Ticket erhalten.
      </p>

      <div style="background-color: #FEF7F4; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Ticket #${ticketNumber}</strong>
        </p>
        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
          ${ticketTitle}
        </p>
      </div>

      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #F27024; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">
          ${replierName} schrieb:
        </p>
        <p style="color: #1f2937; font-size: 15px; line-height: 1.7; margin: 0; white-space: pre-wrap;">
${replyContent}
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
        Sie können direkt auf diese E-Mail antworten oder das Kundenportal nutzen.
      </p>
    `;

    return this.generateEmailWrapper('Neue Antwort zu Ihrem Ticket', content, {
      text: 'Im Portal antworten',
      url: portalUrl
    });
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

Sie haben eine neue Antwort zu Ihrem Ticket erhalten.

Ticket #${ticketNumber}: ${ticketTitle}

${replierName} schrieb:
---
${replyContent}
---

Im Portal antworten: ${portalUrl}

Sie können direkt auf diese E-Mail antworten oder das Kundenportal nutzen.

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateTicketStatusChangeHTML(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    oldStatus: string,
    newStatus: string,
    portalUrl: string
  ): string {
    const resolvedNote = newStatus === 'resolved'
      ? `<div style="background-color: #d1fae5; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
          <p style="color: #065f46; font-size: 15px; margin: 0;">
            Ihr Ticket wurde als gelöst markiert. Falls Sie weitere Fragen haben, können Sie jederzeit antworten.
          </p>
        </div>`
      : '';

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        der Status Ihres Tickets wurde aktualisiert.
      </p>

      <div style="background-color: #FEF7F4; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Ticket #${ticketNumber}</strong>
        </p>
        <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0;">
          ${ticketTitle}
        </p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; padding: 10px 20px; background-color: #f3f4f6; color: #6b7280; border-radius: 6px; font-size: 14px;">
          ${this.getStatusLabel(oldStatus)}
        </span>
        <span style="display: inline-block; margin: 0 12px; color: #9ca3af; font-size: 18px;">→</span>
        <span style="display: inline-block; padding: 10px 20px; background-color: #FEF7F4; color: #F27024; border-radius: 6px; font-size: 14px; font-weight: 600;">
          ${this.getStatusLabel(newStatus)}
        </span>
      </div>

      ${resolvedNote}
    `;

    return this.generateEmailWrapper('Ticket-Status aktualisiert', content, {
      text: 'Ticket im Portal ansehen',
      url: portalUrl
    });
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
Ticket-Status aktualisiert

Hallo ${customerName},

der Status Ihres Tickets wurde aktualisiert.

Ticket #${ticketNumber}: ${ticketTitle}

Status: ${this.getStatusLabel(oldStatus)} → ${this.getStatusLabel(newStatus)}

${newStatus === 'resolved' ? 'Ihr Ticket wurde als gelöst markiert. Falls Sie weitere Fragen haben, können Sie jederzeit antworten.\n' : ''}
Ticket im Portal ansehen: ${portalUrl}

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateTicketCreatedHTML(
    customerName: string,
    ticketNumber: string,
    ticketTitle: string,
    ticketDescription: string,
    portalUrl: string
  ): string {
    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und kümmern uns schnellstmöglich darum.
      </p>

      <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #065f46; font-size: 13px; margin: 0 0 4px 0;">
          <strong>Ticket #${ticketNumber}</strong>
        </p>
        <p style="color: #065f46; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
          ${ticketTitle}
        </p>
        <p style="color: #047857; font-size: 14px; margin: 0; white-space: pre-wrap; line-height: 1.6;">
${ticketDescription.substring(0, 300)}${ticketDescription.length > 300 ? '...' : ''}
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
        Sie erhalten eine Benachrichtigung, sobald wir Ihnen antworten.
      </p>
    `;

    return this.generateEmailWrapper('Ticket erfolgreich erstellt', content, {
      text: 'Ticket im Portal verfolgen',
      url: portalUrl
    });
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

vielen Dank für Ihre Anfrage. Wir haben Ihr Ticket erhalten und kümmern uns schnellstmöglich darum.

Ticket #${ticketNumber}: ${ticketTitle}

${ticketDescription.substring(0, 300)}${ticketDescription.length > 300 ? '...' : ''}

Ticket im Portal verfolgen: ${portalUrl}

Sie erhalten eine Benachrichtigung, sobald wir Ihnen antworten.

--
RamboFlow von ramboeck.IT
    `.trim();
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

    const typeLabel = this.getMaintenanceTypeLabel(announcement.maintenanceType);

    return await this.sendEmail({
      to,
      subject: `Wartungsankündigung: ${announcement.title} (${typeLabel})`,
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
      subject: `Erinnerung: Freigabe erforderlich für ${announcement.title}`,
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

    const statusText = action === 'approved' ? 'genehmigt' : 'abgelehnt';

    return await this.sendEmail({
      to,
      subject: `Wartung ${statusText}: ${announcementTitle} (${customerName})`,
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

    return await this.sendEmail({
      to,
      subject: `Wartung abgeschlossen: ${announcement.title}`,
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

    const formatDateTime = (date: Date) => {
      return date.toLocaleString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Sehr geehrte/r ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        wir freuen uns Ihnen mitteilen zu können, dass die angekündigten Wartungsarbeiten erfolgreich abgeschlossen wurden.
      </p>

      <div style="background-color: #d1fae5; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #065f46; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">${announcement.title}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #047857; font-size: 14px; width: 140px;"><strong>Typ:</strong></td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${typeLabel}</td>
          </tr>
          ${announcement.affectedSystems ? `
            <tr>
              <td style="padding: 8px 0; color: #047857; font-size: 14px; vertical-align: top;"><strong>Systeme:</strong></td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${announcement.affectedSystems}</td>
            </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #047857; font-size: 14px;"><strong>Durchgeführt:</strong></td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${formatDateTime(announcement.scheduledStart)}</td>
          </tr>
        </table>
      </div>

      ${completionNotes ? `
        <div style="background-color: #f9fafb; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <h4 style="color: #1f2937; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Anmerkungen:</h4>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${completionNotes}</p>
        </div>
      ` : ''}

      <p style="color: #4b5563; font-size: 15px; line-height: 1.7; margin: 24px 0;">
        Alle Systeme sollten nun wieder uneingeschränkt verfügbar sein. Sollten Sie wider Erwarten Probleme feststellen, kontaktieren Sie uns bitte umgehend.
      </p>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; line-height: 1.6;">
        Vielen Dank für Ihr Vertrauen.<br>
        Mit freundlichen Grüßen,<br>
        <strong>${senderName}</strong>
      </p>
    `;

    return this.generateEmailWrapper('Wartung erfolgreich abgeschlossen', content);
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
Wartung erfolgreich abgeschlossen

Sehr geehrte/r ${customerName},

wir freuen uns Ihnen mitteilen zu können, dass die angekündigten Wartungsarbeiten erfolgreich abgeschlossen wurden.

Details:
- Titel: ${announcement.title}
- Typ: ${typeLabel}
${announcement.affectedSystems ? `- Betroffene Systeme: ${announcement.affectedSystems}` : ''}
- Durchgeführt: ${formatDateTime(announcement.scheduledStart)}

${completionNotes ? `Anmerkungen:\n${completionNotes}\n` : ''}
Alle Systeme sollten nun wieder uneingeschränkt verfügbar sein. Sollten Sie wider Erwarten Probleme feststellen, kontaktieren Sie uns bitte umgehend.

Vielen Dank für Ihr Vertrauen.
Mit freundlichen Grüßen,
${senderName}

--
RamboFlow von ramboeck.IT
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

    const formatDateTime = (date: Date) => {
      return date.toLocaleString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const approvalSection = requireApproval ? `
      <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="color: #92400e; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Ihre Freigabe ist erforderlich</h3>
        <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">
          Bitte bestätigen Sie, dass die Wartung wie geplant durchgeführt werden kann.
          ${announcement.approvalDeadline ? `<br><strong>Frist: ${formatDateTime(announcement.approvalDeadline)}</strong>` : ''}
        </p>
      </div>
    ` : `
      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
        <p style="color: #36313E; margin: 0; font-size: 14px;">
          Dies ist eine reine Information. Es ist keine Freigabe erforderlich.
        </p>
      </div>
    `;

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Sehr geehrte/r ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        wir möchten Sie über eine geplante Wartung informieren:
      </p>

      <div style="background-color: #FEF7F4; border-left: 4px solid #F27024; padding: 24px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #36313E; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">${announcement.title}</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 140px;"><strong>Typ:</strong></td>
            <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${typeLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Beginn:</strong></td>
            <td style="padding: 8px 0; color: #F27024; font-size: 14px; font-weight: 600;">${formatDateTime(announcement.scheduledStart)}</td>
          </tr>
          ${announcement.scheduledEnd ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Ende:</strong></td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${formatDateTime(announcement.scheduledEnd)}</td>
            </tr>
          ` : ''}
          ${announcement.affectedSystems ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;"><strong>Systeme:</strong></td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 14px;">${announcement.affectedSystems}</td>
            </tr>
          ` : ''}
        </table>
      </div>

      ${announcement.description ? `
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <h4 style="color: #1f2937; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Beschreibung:</h4>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${announcement.description}</p>
        </div>
      ` : ''}

      ${approvalSection}

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; line-height: 1.6;">
        Bei Fragen stehen wir Ihnen gerne zur Verfügung.<br>
        Mit freundlichen Grüßen,<br>
        <strong>${senderName}</strong>
      </p>
    `;

    if (requireApproval) {
      return this.generateEmailWrapper('Wartungsankündigung', content, {
        text: 'Wartung genehmigen',
        url: approvalUrl
      });
    }
    return this.generateEmailWrapper('Wartungsankündigung', content);
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

Wartung genehmigen: ${approvalUrl}
` : 'Dies ist eine reine Information. Es ist keine Freigabe erforderlich.'}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen,
${senderName}

--
RamboFlow von ramboeck.IT
    `.trim();
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
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Sehr geehrte/r ${customerName},</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        wir haben noch keine Rückmeldung zu folgender Wartung erhalten und möchten Sie freundlich daran erinnern:
      </p>

      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 24px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #92400e; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${announcement.title}</h3>
        <p style="color: #92400e; margin: 0 0 8px 0; font-size: 14px;">
          <strong>Geplant für:</strong> ${formatDateTime(announcement.scheduledStart)}
        </p>
        ${announcement.approvalDeadline ? `
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            <strong>Freigabefrist:</strong> ${formatDateTime(announcement.approvalDeadline)}
          </p>
        ` : ''}
      </div>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
        Bitte erteilen Sie Ihre Freigabe, damit wir die Wartung wie geplant durchführen können.
      </p>
    `;

    return this.generateEmailWrapper('Erinnerung: Freigabe erforderlich', content, {
      text: 'Jetzt Freigabe erteilen',
      url: approvalUrl
    });
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
${announcement.approvalDeadline ? `Freigabefrist: ${formatDateTime(announcement.approvalDeadline)}` : ''}

Bitte erteilen Sie Ihre Freigabe, damit wir die Wartung wie geplant durchführen können.

Jetzt Freigabe erteilen: ${approvalUrl}

--
RamboFlow von ramboeck.IT
    `.trim();
  }

  private generateMaintenanceApprovalNotificationHTML(
    customerName: string,
    announcementTitle: string,
    action: 'approved' | 'rejected',
    reason?: string,
    approverName?: string
  ): string {
    const isApproved = action === 'approved';
    const statusText = isApproved ? 'genehmigt' : 'abgelehnt';

    const statusBox = isApproved
      ? `<div style="background-color: #d1fae5; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
          <p style="color: #065f46; font-size: 15px; font-weight: 600; margin: 0;">
            Die Wartung kann wie geplant durchgeführt werden.
          </p>
        </div>`
      : `<div style="background-color: #fee2e2; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
          <p style="color: #991b1b; font-size: 15px; font-weight: 600; margin: 0;">
            Bitte kontaktieren Sie den Kunden für weitere Abstimmung.
          </p>
        </div>`;

    const content = `
      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        <strong>${customerName}</strong> hat die folgende Wartung <strong style="color: ${isApproved ? '#059669' : '#dc2626'}">${statusText}</strong>:
      </p>

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <h3 style="color: #36313E; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">${announcementTitle}</h3>
        ${approverName ? `<p style="color: #6b7280; margin: 0; font-size: 14px;">Freigegeben von: ${approverName}</p>` : ''}
      </div>

      ${reason ? `
        <div style="background-color: #f9fafb; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
          <h4 style="color: #1f2937; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Kommentar:</h4>
          <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">${reason}</p>
        </div>
      ` : ''}

      ${statusBox}
    `;

    return this.generateEmailWrapper(`Wartung ${statusText}`, content);
  }

  private generateMaintenanceApprovalNotificationText(
    customerName: string,
    announcementTitle: string,
    action: 'approved' | 'rejected',
    reason?: string,
    approverName?: string
  ): string {
    const statusText = action === 'approved' ? 'genehmigt' : 'abgelehnt';

    return `
Wartung ${statusText}

${customerName} hat die Wartung ${statusText}.

Wartung: ${announcementTitle}
${approverName ? `Freigegeben von: ${approverName}` : ''}

${reason ? `Kommentar: ${reason}` : ''}

${action === 'approved'
  ? 'Die Wartung kann wie geplant durchgeführt werden.'
  : 'Bitte kontaktieren Sie den Kunden für weitere Abstimmung.'}

--
RamboFlow von ramboeck.IT
    `.trim();
  }
  // ===========================================
  // Portal Invitation Email
  // ===========================================

  /**
   * Send portal invitation email to a customer contact
   */
  async sendPortalInvitationEmail(data: {
    to: string;
    contactName: string;
    customerName: string;
    invitationToken: string;
    expiresAt: Date;
    senderName?: string;
    organizationId?: string;
  }): Promise<boolean> {
    const { to, contactName, customerName, invitationToken, expiresAt, senderName, organizationId } = data;

    const portalUrl = process.env.PORTAL_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationUrl = `${portalUrl}/portal/activate?token=${invitationToken}`;

    const html = this.generatePortalInvitationHTML(contactName, customerName, activationUrl, expiresAt, senderName);
    const text = this.generatePortalInvitationText(contactName, customerName, activationUrl, expiresAt, senderName);
    const subject = 'Einladung zum Kunden-Portal - RamboFlow';

    const success = await this.sendEmail({
      to,
      subject,
      html,
      text,
    }, {
      emailType: 'portal_invitation',
      subject,
      recipientEmail: to,
      recipientName: contactName,
      organizationId,
      metadata: { customerName, invitationToken },
    });

    console.log(`📧 Portal invitation email ${success ? 'sent' : 'failed'} to: ${to}`);

    return success;
  }

  /**
   * Resend portal invitation email
   */
  async resendPortalInvitationEmail(data: {
    to: string;
    contactName: string;
    customerName: string;
    invitationToken: string;
    expiresAt: Date;
    senderName?: string;
    organizationId?: string;
  }): Promise<boolean> {
    const { to, contactName, customerName, invitationToken, expiresAt, senderName, organizationId } = data;

    const portalUrl = process.env.PORTAL_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationUrl = `${portalUrl}/portal/activate?token=${invitationToken}`;

    const html = this.generatePortalInvitationHTML(contactName, customerName, activationUrl, expiresAt, senderName, true);
    const text = this.generatePortalInvitationText(contactName, customerName, activationUrl, expiresAt, senderName, true);
    const subject = 'Erneute Einladung zum Kunden-Portal - RamboFlow';

    const success = await this.sendEmail({
      to,
      subject,
      html,
      text,
    }, {
      emailType: 'portal_invitation_resend',
      subject,
      recipientEmail: to,
      recipientName: contactName,
      organizationId,
      metadata: { customerName, invitationToken },
    });

    console.log(`📧 Portal invitation resend email ${success ? 'sent' : 'failed'} to: ${to}`);

    return success;
  }

  private generatePortalInvitationHTML(
    contactName: string,
    customerName: string,
    activationUrl: string,
    expiresAt: Date,
    senderName?: string,
    isResend: boolean = false
  ): string {
    const greeting = contactName ? `Hallo ${contactName}` : 'Hallo';
    const expiresFormatted = expiresAt.toLocaleString('de-DE', {
      dateStyle: 'long',
      timeStyle: 'short'
    });

    const content = `
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">${greeting},</h2>

      ${isResend ? `
        <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Hinweis:</strong> Dies ist eine erneute Einladung. Ihre vorherige Einladung wurde aktualisiert.
          </p>
        </div>
      ` : ''}

      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        ${senderName ? `<strong>${senderName}</strong> hat` : 'Sie wurden'}
        Sie zum Self-Service-Portal von <strong>${customerName}</strong> eingeladen.
      </p>

      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Mit dem Kunden-Portal haben Sie Zugriff auf:
      </p>

      <div style="background-color: #FEF7F4; border-radius: 8px; padding: 24px; margin: 24px 0;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">&#10003;</strong> Support-Tickets erstellen und verfolgen
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">&#10003;</strong> Projektstatus einsehen
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">&#10003;</strong> Rechnungen und Angebote abrufen
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
              <strong style="color: #F27024;">&#10003;</strong> Direkte Kommunikation mit dem Support-Team
            </td>
          </tr>
        </table>
      </div>

      <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="color: #92400e; font-size: 15px; line-height: 1.6; margin: 0;">
          <strong>Wichtig:</strong> Dieser Einladungslink ist <strong>7 Tage</strong> gültig!<br>
          Gültig bis: ${expiresFormatted} Uhr
        </p>
      </div>

      <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 24px 0;">
        Klicken Sie auf den Button unten, um Ihr Passwort festzulegen und Ihren Zugang zu aktivieren:
      </p>

      <div style="background-color: #f9fafb; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
          Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
        </p>
        <p style="color: #F27024; font-size: 12px; word-break: break-all; margin: 0;">
          <a href="${activationUrl}" style="color: #F27024; text-decoration: none;">${activationUrl}</a>
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
        <strong>Diese Einladung nicht erwartet?</strong><br>
        Falls Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.
        Es wird kein Konto erstellt, solange Sie den Link nicht aktivieren.
      </p>
    `;

    return this.generateEmailWrapper('Einladung zum Kunden-Portal', content, {
      text: 'Zugang aktivieren',
      url: activationUrl
    });
  }

  private generatePortalInvitationText(
    contactName: string,
    customerName: string,
    activationUrl: string,
    expiresAt: Date,
    senderName?: string,
    isResend: boolean = false
  ): string {
    const greeting = contactName ? `Hallo ${contactName}` : 'Hallo';
    const expiresFormatted = expiresAt.toLocaleString('de-DE', {
      dateStyle: 'long',
      timeStyle: 'short'
    });

    const resendNote = isResend
      ? '\nHinweis: Dies ist eine erneute Einladung. Ihre vorherige Einladung wurde aktualisiert.\n'
      : '';

    return `
Einladung zum Kunden-Portal
${resendNote}
${greeting},

${senderName ? `${senderName} hat` : 'Sie wurden'} Sie zum Self-Service-Portal von ${customerName} eingeladen.

Mit dem Kunden-Portal haben Sie Zugriff auf:
- Support-Tickets erstellen und verfolgen
- Projektstatus einsehen
- Rechnungen und Angebote abrufen
- Direkte Kommunikation mit dem Support-Team

WICHTIG: Dieser Einladungslink ist 7 Tage gueltig!
Gueltig bis: ${expiresFormatted} Uhr

Klicken Sie auf den folgenden Link, um Ihr Passwort festzulegen und Ihren Zugang zu aktivieren:

${activationUrl}

Diese Einladung nicht erwartet?
Falls Sie diese E-Mail nicht angefordert haben, koennen Sie sie ignorieren.
Es wird kein Konto erstellt, solange Sie den Link nicht aktivieren.

--
RamboFlow von ramboeck.IT
    `.trim();
  }
}

export const emailService = new EmailService();
