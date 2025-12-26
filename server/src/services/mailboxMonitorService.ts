/**
 * Mailbox Monitor Service
 *
 * Monitors a shared mailbox for incoming emails and can create tickets from them.
 * Uses Microsoft Graph API with application permissions.
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { getConfig, Microsoft365Config } from './microsoft365ConfigService';

export interface EmailMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from: {
    name: string;
    email: string;
  };
  toRecipients: Array<{
    name: string;
    email: string;
  }>;
  ccRecipients: Array<{
    name: string;
    email: string;
  }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
}

export interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // Base64 encoded
}

export interface MailboxMonitorResult {
  success: boolean;
  emails: EmailMessage[];
  error?: string;
}

export type MailboxType = 'support' | 'invoice';

class MailboxMonitorService {
  /**
   * Create a Graph client for the given organization
   */
  private async createClient(organizationId: string): Promise<{ client: Client; config: Microsoft365Config } | null> {
    const config = await getConfig(organizationId);

    if (!config || !config.tenantId || !config.clientId || !config.clientSecret) {
      console.error('Microsoft 365 not configured for organization:', organizationId);
      return null;
    }

    try {
      const credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret
      );

      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      const client = Client.initWithMiddleware({ authProvider });

      return { client, config };
    } catch (error) {
      console.error('Failed to create Graph client:', error);
      return null;
    }
  }

  /**
   * Get the appropriate mailbox based on type
   */
  private getMailboxByType(config: Microsoft365Config, mailboxType: MailboxType = 'support'): string | null {
    if (mailboxType === 'invoice') {
      return config.invoiceMailbox || null;
    }
    return config.supportMailbox || config.mailFrom || null;
  }

  /**
   * Get unread emails from a mailbox
   */
  async getUnreadEmails(
    organizationId: string,
    options: {
      maxResults?: number;
      folder?: string;
      mailboxType?: MailboxType;
    } = {}
  ): Promise<MailboxMonitorResult> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return { success: false, emails: [], error: 'Microsoft 365 nicht konfiguriert' };
    }

    const { client, config } = clientData;
    const { mailboxType = 'support' } = options;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      const mailboxLabel = mailboxType === 'invoice' ? 'Rechnungs' : 'Support';
      return { success: false, emails: [], error: `Keine ${mailboxLabel}-Mailbox konfiguriert` };
    }

    const { maxResults = 50, folder = 'inbox' } = options;

    try {
      const response = await client
        .api(`/users/${mailbox}/mailFolders/${folder}/messages`)
        .filter('isRead eq false')
        .top(maxResults)
        .orderby('receivedDateTime desc')
        .select('id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,isRead,importance')
        .get();

      const emails: EmailMessage[] = (response.value || []).map((msg: any) => ({
        id: msg.id,
        conversationId: msg.conversationId,
        subject: msg.subject || '(Kein Betreff)',
        bodyPreview: msg.bodyPreview || '',
        body: {
          contentType: msg.body?.contentType?.toLowerCase() || 'text',
          content: msg.body?.content || '',
        },
        from: {
          name: msg.from?.emailAddress?.name || '',
          email: msg.from?.emailAddress?.address || '',
        },
        toRecipients: (msg.toRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name || '',
          email: r.emailAddress?.address || '',
        })),
        ccRecipients: (msg.ccRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name || '',
          email: r.emailAddress?.address || '',
        })),
        receivedDateTime: msg.receivedDateTime,
        hasAttachments: msg.hasAttachments || false,
        isRead: msg.isRead || false,
        importance: msg.importance || 'normal',
      }));

      console.log(`📬 Found ${emails.length} unread emails in ${mailbox}`);
      return { success: true, emails };
    } catch (error: any) {
      console.error('Failed to get unread emails:', error.message);
      return {
        success: false,
        emails: [],
        error: `Fehler beim Abrufen der E-Mails: ${error.message}`
      };
    }
  }

  /**
   * Get a specific email by ID
   */
  async getEmail(
    organizationId: string,
    messageId: string,
    mailboxType: MailboxType = 'support'
  ): Promise<EmailMessage | null> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return null;
    }

    const { client, config } = clientData;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      return null;
    }

    try {
      const msg = await client
        .api(`/users/${mailbox}/messages/${messageId}`)
        .select('id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,isRead,importance')
        .get();

      return {
        id: msg.id,
        conversationId: msg.conversationId,
        subject: msg.subject || '(Kein Betreff)',
        bodyPreview: msg.bodyPreview || '',
        body: {
          contentType: msg.body?.contentType?.toLowerCase() || 'text',
          content: msg.body?.content || '',
        },
        from: {
          name: msg.from?.emailAddress?.name || '',
          email: msg.from?.emailAddress?.address || '',
        },
        toRecipients: (msg.toRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name || '',
          email: r.emailAddress?.address || '',
        })),
        ccRecipients: (msg.ccRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name || '',
          email: r.emailAddress?.address || '',
        })),
        receivedDateTime: msg.receivedDateTime,
        hasAttachments: msg.hasAttachments || false,
        isRead: msg.isRead || false,
        importance: msg.importance || 'normal',
      };
    } catch (error: any) {
      console.error('Failed to get email:', error.message);
      return null;
    }
  }

  /**
   * Get attachments for an email
   */
  async getAttachments(
    organizationId: string,
    messageId: string,
    mailboxType: MailboxType = 'support'
  ): Promise<EmailAttachment[]> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return [];
    }

    const { client, config } = clientData;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      return [];
    }

    try {
      const response = await client
        .api(`/users/${mailbox}/messages/${messageId}/attachments`)
        .get();

      return (response.value || []).map((att: any) => ({
        id: att.id,
        name: att.name,
        contentType: att.contentType,
        size: att.size,
        contentBytes: att.contentBytes,
      }));
    } catch (error: any) {
      console.error('Failed to get attachments:', error.message);
      return [];
    }
  }

  /**
   * Mark an email as read
   */
  async markAsRead(
    organizationId: string,
    messageId: string,
    mailboxType: MailboxType = 'support'
  ): Promise<boolean> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return false;
    }

    const { client, config } = clientData;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      return false;
    }

    try {
      await client
        .api(`/users/${mailbox}/messages/${messageId}`)
        .patch({ isRead: true });

      return true;
    } catch (error: any) {
      console.error('Failed to mark email as read:', error.message);
      return false;
    }
  }

  /**
   * Move an email to a folder
   */
  async moveToFolder(
    organizationId: string,
    messageId: string,
    folderName: string,
    mailboxType: MailboxType = 'support'
  ): Promise<boolean> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return false;
    }

    const { client, config } = clientData;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      return false;
    }

    try {
      // First get the folder ID
      const folders = await client
        .api(`/users/${mailbox}/mailFolders`)
        .filter(`displayName eq '${folderName}'`)
        .get();

      if (!folders.value || folders.value.length === 0) {
        console.error(`Folder '${folderName}' not found`);
        return false;
      }

      const folderId = folders.value[0].id;

      // Move the message
      await client
        .api(`/users/${mailbox}/messages/${messageId}/move`)
        .post({ destinationId: folderId });

      return true;
    } catch (error: any) {
      console.error('Failed to move email:', error.message);
      return false;
    }
  }

  /**
   * Reply to an email
   */
  async replyToEmail(
    organizationId: string,
    messageId: string,
    replyContent: string,
    replyAll: boolean = false,
    mailboxType: MailboxType = 'support'
  ): Promise<boolean> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return false;
    }

    const { client, config } = clientData;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      return false;
    }

    try {
      const endpoint = replyAll
        ? `/users/${mailbox}/messages/${messageId}/replyAll`
        : `/users/${mailbox}/messages/${messageId}/reply`;

      await client.api(endpoint).post({
        message: {
          body: {
            contentType: 'HTML',
            content: replyContent,
          },
        },
      });

      console.log(`📧 Reply sent for message ${messageId}`);
      return true;
    } catch (error: any) {
      console.error('Failed to reply to email:', error.message);
      return false;
    }
  }

  /**
   * Test mailbox access
   */
  async testMailboxAccess(
    organizationId: string,
    mailbox?: string,
    mailboxType: MailboxType = 'support'
  ): Promise<{ success: boolean; error?: string; mailboxInfo?: { email: string; unreadCount: number } }> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return { success: false, error: 'Microsoft 365 nicht konfiguriert' };
    }

    const { client, config } = clientData;
    // If specific mailbox is provided, use it. Otherwise use configured mailbox based on type
    const targetMailbox = mailbox || this.getMailboxByType(config, mailboxType);

    if (!targetMailbox) {
      const mailboxLabel = mailboxType === 'invoice' ? 'Rechnungs' : 'Support';
      return { success: false, error: `Keine ${mailboxLabel}-Mailbox konfiguriert` };
    }

    try {
      // Try to get inbox folder to verify access
      const inbox = await client
        .api(`/users/${targetMailbox}/mailFolders/inbox`)
        .select('displayName,unreadItemCount,totalItemCount')
        .get();

      return {
        success: true,
        mailboxInfo: {
          email: targetMailbox,
          unreadCount: inbox.unreadItemCount || 0,
        },
      };
    } catch (error: any) {
      let errorMessage = error.message;

      if (error.statusCode === 403) {
        errorMessage = `Keine Berechtigung fuer Postfach "${targetMailbox}". Mail.Read Berechtigung pruefen.`;
      } else if (error.statusCode === 404) {
        errorMessage = `Postfach "${targetMailbox}" nicht gefunden.`;
      }

      return { success: false, error: errorMessage };
    }
  }
}

export const mailboxMonitorService = new MailboxMonitorService();
export default mailboxMonitorService;
