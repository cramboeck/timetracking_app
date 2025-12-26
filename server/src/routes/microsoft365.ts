import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { attachOrganization, requireOrgRole } from '../middleware/organization';
import * as microsoft365Service from '../services/microsoft365ConfigService';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { invoiceProcessorService } from '../services/invoiceProcessorService';

interface OrganizationRequest extends AuthRequest {
  organization: {
    id: string;
    name: string;
    role: string;
  };
}

const router = Router();

// Apply auth and organization middleware to all routes
router.use(authenticateToken);
router.use(attachOrganization);

// GET /api/microsoft365/config - Get Microsoft 365 config
router.get('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const config = await microsoft365Service.getConfig(organizationId);

    if (!config) {
      return res.json({
        success: true,
        data: {
          configured: false,
          tenantId: '',
          clientId: '',
          hasClientSecret: false,
          mailFrom: '',
          supportMailbox: '',
          featuresEnabled: { email: false, inboxMonitoring: false, calendar: false },
        },
      });
    }

    // Don't return the actual client secret
    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        invoiceMailbox: config.invoiceMailbox || '',
        featuresEnabled: config.featuresEnabled,
        lastConnectionTest: config.lastConnectionTest,
        lastConnectionStatus: config.lastConnectionStatus,
      },
    });
  } catch (error) {
    console.error('Get Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /api/microsoft365/config - Save Microsoft 365 config
router.post('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { tenantId, clientId, clientSecret, mailFrom, supportMailbox, invoiceMailbox, featuresEnabled } = req.body;

    const config = await microsoft365Service.saveConfig(organizationId, {
      tenantId,
      clientId,
      clientSecret,
      mailFrom,
      supportMailbox,
      invoiceMailbox,
      featuresEnabled,
    });

    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        invoiceMailbox: config.invoiceMailbox || '',
        featuresEnabled: config.featuresEnabled,
      },
    });
  } catch (error) {
    console.error('Save Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/microsoft365/test - Test Microsoft 365 connection
router.post('/test', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    let { tenantId, clientId, clientSecret, mailFrom } = req.body;

    // If clientSecret is placeholder, get it from database
    if (clientSecret === '__USE_STORED__') {
      const storedConfig = await microsoft365Service.getConfig(organizationId);
      if (storedConfig?.clientSecret) {
        clientSecret = storedConfig.clientSecret;
        console.log('Using stored client secret from database');
      } else {
        return res.status(400).json({
          success: false,
          error: 'Kein Client Secret gespeichert. Bitte geben Sie ein neues Secret ein.',
        });
      }
    }

    // Debug logging
    console.log('=== Microsoft 365 Test Debug ===');
    console.log('Tenant ID:', tenantId);
    console.log('Client ID:', clientId);
    console.log('Client Secret Length:', clientSecret?.length);
    console.log('Client Secret First 4:', clientSecret?.substring(0, 4));
    console.log('Client Secret Last 4:', clientSecret?.substring(clientSecret.length - 4));
    console.log('================================');

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID, Client ID und Client Secret sind erforderlich',
      });
    }

    const result = await microsoft365Service.testConnection(
      tenantId,
      clientId,
      clientSecret,
      mailFrom
    );

    // Update test result in database
    await microsoft365Service.updateConnectionTestResult(
      organizationId,
      result.success,
      result.error
    );

    if (result.success) {
      res.json({
        success: true,
        data: result.userInfo,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Microsoft 365 connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

// DELETE /api/microsoft365/config - Remove Microsoft 365 config
router.delete('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    await microsoft365Service.deleteConfig(organizationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

// ========================================
// Mailbox Monitoring Endpoints
// ========================================

// POST /api/microsoft365/mailbox/test - Test mailbox access
router.post('/mailbox/test', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { mailbox, mailboxType } = req.body;

    const result = await mailboxMonitorService.testMailboxAccess(organizationId, mailbox, mailboxType || 'support');

    if (result.success) {
      res.json({
        success: true,
        data: result.mailboxInfo,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Mailbox test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Mailbox test failed',
    });
  }
});

// GET /api/microsoft365/mailbox/emails - Get unread emails
router.get('/mailbox/emails', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const maxResults = parseInt(req.query.maxResults as string) || 50;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const result = await mailboxMonitorService.getUnreadEmails(organizationId, {
      maxResults,
      mailboxType: mailboxType as 'support' | 'invoice',
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.emails,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Get emails error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get emails',
    });
  }
});

// GET /api/microsoft365/mailbox/emails/:id - Get specific email
router.get('/mailbox/emails/:id', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const email = await mailboxMonitorService.getEmail(organizationId, messageId, mailboxType as 'support' | 'invoice');

    if (email) {
      res.json({
        success: true,
        data: email,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }
  } catch (error: any) {
    console.error('Get email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get email',
    });
  }
});

// GET /api/microsoft365/mailbox/emails/:id/attachments - Get email attachments
router.get('/mailbox/emails/:id/attachments', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const attachments = await mailboxMonitorService.getAttachments(organizationId, messageId, mailboxType as 'support' | 'invoice');

    res.json({
      success: true,
      data: attachments,
    });
  } catch (error: any) {
    console.error('Get attachments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get attachments',
    });
  }
});

// POST /api/microsoft365/mailbox/emails/:id/read - Mark email as read
router.post('/mailbox/emails/:id/read', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const { mailboxType } = req.body;

    const success = await mailboxMonitorService.markAsRead(organizationId, messageId, mailboxType || 'support');

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte E-Mail nicht als gelesen markieren',
      });
    }
  } catch (error: any) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark email as read',
    });
  }
});

// POST /api/microsoft365/mailbox/emails/:id/reply - Reply to email
router.post('/mailbox/emails/:id/reply', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const { content, replyAll, mailboxType } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Antwort-Inhalt erforderlich',
      });
    }

    const success = await mailboxMonitorService.replyToEmail(
      organizationId,
      messageId,
      content,
      replyAll || false,
      mailboxType || 'support'
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte Antwort nicht senden',
      });
    }
  } catch (error: any) {
    console.error('Reply to email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send reply',
    });
  }
});

// ========================================
// Invoice Processing Endpoints
// ========================================

// POST /api/microsoft365/invoices/process - Process invoice mailbox
router.post('/invoices/process', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await invoiceProcessorService.processInvoiceMailbox(organizationId);

    res.json({
      success: result.success,
      data: {
        processedCount: result.processedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        results: result.results,
      },
    });
  } catch (error: any) {
    console.error('Process invoice mailbox error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process invoice mailbox',
    });
  }
});

// GET /api/microsoft365/invoices - Get processed invoices
router.get('/invoices', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await invoiceProcessorService.getProcessedInvoices(organizationId, {
      status,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.invoices,
      total: result.total,
    });
  } catch (error: any) {
    console.error('Get processed invoices error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get processed invoices',
    });
  }
});

// GET /api/microsoft365/invoices/:id/documents - Get documents for a processed invoice
router.get('/invoices/:id/documents', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const processedInvoiceId = req.params.id;

    const documents = await invoiceProcessorService.getInvoiceDocuments(processedInvoiceId);

    res.json({
      success: true,
      data: documents,
    });
  } catch (error: any) {
    console.error('Get invoice documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get invoice documents',
    });
  }
});

// POST /api/microsoft365/invoices/:id/retry - Retry processing a failed invoice
router.post('/invoices/:id/retry', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.retryProcessing(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte Verarbeitung nicht wiederholen',
      });
    }
  } catch (error: any) {
    console.error('Retry invoice processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retry invoice processing',
    });
  }
});

// POST /api/microsoft365/invoices/:id/approve - Approve a draft invoice
router.post('/invoices/:id/approve', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.approveDraft(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Entwurf konnte nicht bestätigt werden',
      });
    }
  } catch (error: any) {
    console.error('Approve draft error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve draft',
    });
  }
});

// DELETE /api/microsoft365/invoices/:id - Delete a draft invoice
router.delete('/invoices/:id', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.deleteDraft(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Entwurf konnte nicht gelöscht werden',
      });
    }
  } catch (error: any) {
    console.error('Delete draft error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete draft',
    });
  }
});

// DELETE /api/microsoft365/invoices/failed - Clear all failed invoice entries
router.delete('/invoices/failed', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const deletedCount = await invoiceProcessorService.clearFailedEntries(organizationId);

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error: any) {
    console.error('Clear failed entries error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear failed entries',
    });
  }
});

export default router;
