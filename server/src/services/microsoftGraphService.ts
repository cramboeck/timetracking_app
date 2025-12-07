/**
 * Microsoft Graph API Service
 *
 * Handles Microsoft 365 integration for:
 * - Sending emails via Graph API
 * - Reading mailboxes (future: support inbox monitoring)
 * - Managing email subscriptions (future: webhooks for new emails)
 *
 * Required Azure App Registration permissions:
 * - Mail.Send (Application) - Send emails as any user
 * - Mail.Read (Application) - Read mailboxes (for future inbox monitoring)
 * - Mail.ReadWrite (Application) - Mark emails as read (for future inbox monitoring)
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

interface GraphEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
}

interface GraphMailMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  body: {
    contentType: string;
    content: string;
  };
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
}

class MicrosoftGraphService {
  private client: Client | null = null;
  private credential: ClientSecretCredential | null = null;
  private initialized: boolean = false;
  private mailFrom: string = '';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.mailFrom = process.env.GRAPH_MAIL_FROM || '';

    if (!tenantId || !clientId || !clientSecret) {
      console.log('ℹ️ Microsoft Graph API not configured (missing AZURE_* environment variables)');
      return;
    }

    try {
      // Create credential using Client Credentials Flow (application permissions)
      this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      // Create authentication provider
      const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      // Initialize Graph client
      this.client = Client.initWithMiddleware({
        authProvider,
      });

      this.initialized = true;
      console.log('✅ Microsoft Graph API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Microsoft Graph API:', error);
    }
  }

  /**
   * Check if Graph API is available
   */
  isAvailable(): boolean {
    return this.initialized && this.client !== null && this.mailFrom !== '';
  }

  /**
   * Get the configured sender email address
   */
  getSenderEmail(): string {
    return this.mailFrom;
  }

  /**
   * Send an email via Microsoft Graph API
   */
  async sendEmail(options: GraphEmailOptions): Promise<boolean> {
    if (!this.client || !this.mailFrom) {
      throw new Error('Microsoft Graph API not initialized or GRAPH_MAIL_FROM not set');
    }

    try {
      // Build recipients array
      const toRecipients = (Array.isArray(options.to) ? options.to : [options.to]).map(email => ({
        emailAddress: { address: email },
      }));

      // Build CC recipients if provided
      const ccRecipients = options.cc
        ? (Array.isArray(options.cc) ? options.cc : [options.cc]).map(email => ({
            emailAddress: { address: email },
          }))
        : undefined;

      // Build BCC recipients if provided
      const bccRecipients = options.bcc
        ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map(email => ({
            emailAddress: { address: email },
          }))
        : undefined;

      // Build attachments if provided
      const attachments = options.attachments?.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes: typeof att.content === 'string'
          ? att.content
          : att.content.toString('base64'),
      }));

      // Build the message object
      const message: any = {
        subject: options.subject,
        body: {
          contentType: 'HTML',
          content: options.html,
        },
        toRecipients,
      };

      if (ccRecipients && ccRecipients.length > 0) {
        message.ccRecipients = ccRecipients;
      }

      if (bccRecipients && bccRecipients.length > 0) {
        message.bccRecipients = bccRecipients;
      }

      if (options.replyTo) {
        message.replyTo = [{ emailAddress: { address: options.replyTo } }];
      }

      if (attachments && attachments.length > 0) {
        message.attachments = attachments;
      }

      // Send the email
      await this.client
        .api(`/users/${this.mailFrom}/sendMail`)
        .post({
          message,
          saveToSentItems: true,
        });

      console.log(`📧 Email sent via Graph API to: ${options.to}`);
      return true;
    } catch (error: any) {
      console.error('❌ Graph API email send failed:', error.message);
      throw error;
    }
  }

  /**
   * Test the Graph API connection by getting user info
   */
  async testConnection(): Promise<{ success: boolean; error?: string; userInfo?: any }> {
    if (!this.client || !this.mailFrom) {
      return {
        success: false,
        error: 'Microsoft Graph API not initialized or GRAPH_MAIL_FROM not set'
      };
    }

    try {
      // Try to get the mailbox user info
      const user = await this.client
        .api(`/users/${this.mailFrom}`)
        .select('displayName,mail,userPrincipalName')
        .get();

      return {
        success: true,
        userInfo: {
          displayName: user.displayName,
          email: user.mail || user.userPrincipalName,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  // ========================================
  // Future: Mailbox Reading Methods
  // ========================================

  /**
   * Get unread emails from a mailbox (for future inbox monitoring)
   * Requires Mail.Read application permission
   */
  async getUnreadEmails(
    mailbox: string,
    options: { maxResults?: number; folder?: string } = {}
  ): Promise<GraphMailMessage[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    const { maxResults = 50, folder = 'inbox' } = options;

    try {
      const response = await this.client
        .api(`/users/${mailbox}/mailFolders/${folder}/messages`)
        .filter('isRead eq false')
        .top(maxResults)
        .orderby('receivedDateTime desc')
        .select('id,subject,from,toRecipients,body,receivedDateTime,hasAttachments,isRead')
        .get();

      return response.value || [];
    } catch (error: any) {
      console.error('❌ Failed to get unread emails:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific email by ID (for future inbox monitoring)
   */
  async getEmail(mailbox: string, messageId: string): Promise<GraphMailMessage | null> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    try {
      const message = await this.client
        .api(`/users/${mailbox}/messages/${messageId}`)
        .select('id,subject,from,toRecipients,body,receivedDateTime,hasAttachments,isRead')
        .get();

      return message;
    } catch (error: any) {
      console.error('❌ Failed to get email:', error.message);
      return null;
    }
  }

  /**
   * Mark an email as read (for future inbox monitoring)
   * Requires Mail.ReadWrite application permission
   */
  async markAsRead(mailbox: string, messageId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    try {
      await this.client
        .api(`/users/${mailbox}/messages/${messageId}`)
        .patch({ isRead: true });

      return true;
    } catch (error: any) {
      console.error('❌ Failed to mark email as read:', error.message);
      return false;
    }
  }

  /**
   * Get email attachments (for future inbox monitoring)
   */
  async getAttachments(mailbox: string, messageId: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    try {
      const response = await this.client
        .api(`/users/${mailbox}/messages/${messageId}/attachments`)
        .get();

      return response.value || [];
    } catch (error: any) {
      console.error('❌ Failed to get attachments:', error.message);
      return [];
    }
  }

  /**
   * Move email to a folder (for future inbox monitoring)
   */
  async moveToFolder(mailbox: string, messageId: string, folderId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    try {
      await this.client
        .api(`/users/${mailbox}/messages/${messageId}/move`)
        .post({ destinationId: folderId });

      return true;
    } catch (error: any) {
      console.error('❌ Failed to move email:', error.message);
      return false;
    }
  }

  /**
   * Get mail folders (for future inbox monitoring)
   */
  async getMailFolders(mailbox: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph API not initialized');
    }

    try {
      const response = await this.client
        .api(`/users/${mailbox}/mailFolders`)
        .get();

      return response.value || [];
    } catch (error: any) {
      console.error('❌ Failed to get mail folders:', error.message);
      return [];
    }
  }
}

// Export singleton instance
export const microsoftGraphService = new MicrosoftGraphService();
export default microsoftGraphService;
