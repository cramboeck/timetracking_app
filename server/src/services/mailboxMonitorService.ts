/**
 * Mailbox Monitor Service
 *
 * Monitors a shared mailbox for incoming emails and can create tickets from them.
 * Uses Microsoft Graph API with application permissions.
 */

import crypto from 'crypto';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { getConfig, Microsoft365Config } from './microsoft365ConfigService';
import { query } from '../config/database';

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
   * Get emails from a mailbox
   * @param organizationId - Organization ID
   * @param options - Options for fetching emails
   * @param options.includeRead - If true, fetch all emails (not just unread)
   */
  async getUnreadEmails(
    organizationId: string,
    options: {
      maxResults?: number;
      folder?: string;
      mailboxType?: MailboxType;
      includeRead?: boolean;
    } = {}
  ): Promise<MailboxMonitorResult> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return { success: false, emails: [], error: 'Microsoft 365 nicht konfiguriert' };
    }

    const { client, config } = clientData;
    const { mailboxType = 'support', includeRead = false } = options;
    const mailbox = this.getMailboxByType(config, mailboxType);

    if (!mailbox) {
      const mailboxLabel = mailboxType === 'invoice' ? 'Rechnungs' : 'Support';
      return { success: false, emails: [], error: `Keine ${mailboxLabel}-Mailbox konfiguriert` };
    }

    const { maxResults = 50, folder = 'inbox' } = options;

    try {
      let apiRequest = client
        .api(`/users/${mailbox}/mailFolders/${folder}/messages`)
        .top(maxResults)
        .orderby('receivedDateTime desc')
        .select('id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,isRead,importance');

      // Only filter by unread if not including read emails
      if (!includeRead) {
        apiRequest = apiRequest.filter('isRead eq false');
      }

      const response = await apiRequest.get();

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

      const status = includeRead ? 'all' : 'unread';
      console.log(`📬 Found ${emails.length} ${status} emails in ${mailbox}`);
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
   * Get emails from a specific mailbox (e.g., user's personal mailbox)
   * @param organizationId - Organization ID
   * @param mailboxEmail - The email address of the mailbox to query
   * @param options - Options for fetching emails
   */
  async getEmailsFromMailbox(
    organizationId: string,
    mailboxEmail: string,
    options: {
      maxResults?: number;
      folder?: string;
      includeRead?: boolean;
    } = {}
  ): Promise<MailboxMonitorResult> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return { success: false, emails: [], error: 'Microsoft 365 nicht konfiguriert' };
    }

    const { client } = clientData;
    const { maxResults = 50, folder = 'inbox', includeRead = false } = options;

    try {
      let apiRequest = client
        .api(`/users/${mailboxEmail}/mailFolders/${folder}/messages`)
        .top(maxResults)
        .orderby('receivedDateTime desc')
        .select('id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,isRead,importance');

      // Only filter by unread if not including read emails
      if (!includeRead) {
        apiRequest = apiRequest.filter('isRead eq false');
      }

      const response = await apiRequest.get();

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

      return { success: true, emails };
    } catch (error: any) {
      console.error('Failed to get emails from mailbox:', error.message);
      return {
        success: false,
        emails: [],
        error: `Fehler beim Abrufen der E-Mails: ${error.message}`
      };
    }
  }

  /**
   * Get a specific email by ID from a mailbox
   */
  async getEmailFromMailbox(
    organizationId: string,
    mailboxEmail: string,
    messageId: string
  ): Promise<EmailMessage | null> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return null;
    }

    const { client } = clientData;

    try {
      const msg = await client
        .api(`/users/${mailboxEmail}/messages/${messageId}`)
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
      console.error('Failed to get email from mailbox:', error.message);
      return null;
    }
  }

  /**
   * Mark email as read in a specific mailbox
   */
  async markAsReadInMailbox(
    organizationId: string,
    mailboxEmail: string,
    messageId: string
  ): Promise<boolean> {
    const clientData = await this.createClient(organizationId);

    if (!clientData) {
      return false;
    }

    const { client } = clientData;

    try {
      await client
        .api(`/users/${mailboxEmail}/messages/${messageId}`)
        .patch({ isRead: true });

      return true;
    } catch (error: any) {
      console.error('Failed to mark email as read:', error.message);
      return false;
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
   * Note: For file attachments, we need to fetch each one individually to get contentBytes
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
      // First, get the list of attachments
      const response = await client
        .api(`/users/${mailbox}/messages/${messageId}/attachments`)
        .get();

      const attachments: EmailAttachment[] = [];

      // Then fetch each attachment individually to get contentBytes
      for (const att of response.value || []) {
        // Skip non-file attachments (like item attachments or reference attachments)
        if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') {
          console.log(`Skipping non-file attachment: ${att.name} (${att['@odata.type']})`);
          continue;
        }

        try {
          // Fetch the individual attachment with contentBytes
          const fullAttachment = await client
            .api(`/users/${mailbox}/messages/${messageId}/attachments/${att.id}`)
            .get();

          attachments.push({
            id: fullAttachment.id,
            name: fullAttachment.name,
            contentType: fullAttachment.contentType,
            size: fullAttachment.size,
            contentBytes: fullAttachment.contentBytes,
          });

          console.log(`Fetched attachment: ${fullAttachment.name} (${fullAttachment.size} bytes)`);
        } catch (attError: any) {
          console.error(`Failed to fetch attachment ${att.name}:`, attError.message);
        }
      }

      return attachments;
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
   * Mark an email as unread
   */
  async markAsUnread(
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
        .patch({ isRead: false });

      console.log(`📧 Marked email ${messageId} as unread`);
      return true;
    } catch (error: any) {
      console.error('Failed to mark email as unread:', error.message);
      return false;
    }
  }

  /**
   * Mark multiple emails as unread
   */
  async markMultipleAsUnread(
    organizationId: string,
    messageIds: string[],
    mailboxType: MailboxType = 'support'
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const messageId of messageIds) {
      const result = await this.markAsUnread(organizationId, messageId, mailboxType);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    console.log(`📧 Marked ${success}/${messageIds.length} emails as unread`);
    return { success, failed };
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
   * Reply to a ticket's email thread
   * Looks up the last inbound email for the ticket and replies to it
   */
  async replyToTicketEmail(
    organizationId: string,
    ticketId: string,
    replyContent: string,
    senderName: string = 'Support'
  ): Promise<boolean> {
    try {
      // Get the last inbound email for this ticket
      const result = await query(`
        SELECT message_id, subject
        FROM ticket_emails
        WHERE ticket_id = $1 AND organization_id = $2 AND direction = 'inbound'
        ORDER BY received_at DESC
        LIMIT 1
      `, [ticketId, organizationId]);

      if (result.rows.length === 0) {
        console.error(`No inbound email found for ticket ${ticketId}`);
        return false;
      }

      const lastEmail = result.rows[0];

      // Format the reply content as HTML with proper signature
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          ${replyContent.replace(/\n/g, '<br>')}
          <br><br>
          <p style="color: #666; font-size: 12px;">
            Mit freundlichen Grüßen,<br>
            <strong>${senderName}</strong>
          </p>
        </div>
      `;

      // Save the outbound email to ticket_emails
      const emailId = crypto.randomUUID();
      await query(`
        INSERT INTO ticket_emails (id, ticket_id, organization_id, message_id, direction, subject, body_preview, sender_email, sender_name, received_at)
        VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7, $8, NOW())
      `, [emailId, ticketId, organizationId, `reply-${emailId}`, lastEmail.subject, replyContent.substring(0, 250), 'support', senderName]);

      // Send the reply via Graph API
      return await this.replyToEmail(organizationId, lastEmail.message_id, htmlContent, false, 'support');
    } catch (error: any) {
      console.error('Failed to reply to ticket email:', error.message);
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

  /**
   * Get a specific email by ID with result wrapper
   */
  async getEmailById(
    organizationId: string,
    messageId: string,
    mailboxType: MailboxType = 'support'
  ): Promise<{ success: boolean; email?: EmailMessage; error?: string }> {
    try {
      const email = await this.getEmail(organizationId, messageId, mailboxType);

      if (email) {
        return { success: true, email };
      } else {
        return { success: false, error: 'E-Mail nicht gefunden' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Fehler beim Abrufen der E-Mail' };
    }
  }
}

export const mailboxMonitorService = new MailboxMonitorService();
export default mailboxMonitorService;
