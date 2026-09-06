/**
 * Canned Responses + Ticket-Templates (CRUD, use, seed)
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest } from '../../middleware/organization';
import { logger } from '../../utils/logger';
import {
  cannedResponseSchema,
  ticketTemplateSchema,
  updateTicketTemplateSchema,
  CANNED_RESPONSE_COLUMNS,
  TICKET_TEMPLATE_COLUMNS,
  transformTemplate,
} from './shared';

const router = express.Router();

router.get('/canned-responses/list', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { category } = req.query;

    let queryText = `
      SELECT ${CANNED_RESPONSE_COLUMNS} FROM canned_responses
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (category) {
      queryText += ' AND category = $2';
      params.push(category);
    }

    queryText += ' ORDER BY usage_count DESC, title ASC';

    const result = await query(queryText, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching canned responses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch canned responses' });
  }
});

// POST /api/tickets/canned-responses - Create canned response
router.post('/canned-responses', authenticateToken, attachOrganization, validate(cannedResponseSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { title, content, shortcut, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO canned_responses (id, user_id, organization_id, title, content, shortcut, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, userId, organizationId, title, content, shortcut || null, category || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to create canned response' });
  }
});

// PUT /api/tickets/canned-responses/:id - Update canned response
router.put('/canned-responses/:id', authenticateToken, attachOrganization, validate(cannedResponseSchema.partial()), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { title, content, shortcut, category } = req.body;

    const result = await query(`
      UPDATE canned_responses
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          shortcut = $3,
          category = $4,
          updated_at = NOW()
      WHERE id = $5 AND organization_id = $6
      RETURNING *
    `, [title, content, shortcut || null, category || null, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to update canned response' });
  }
});

// DELETE /api/tickets/canned-responses/:id - Delete canned response
router.delete('/canned-responses/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM canned_responses WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, message: 'Canned response deleted' });
  } catch (error) {
    logger.error('Error deleting canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to delete canned response' });
  }
});

// POST /api/tickets/canned-responses/:id/use - Increment usage count
router.post('/canned-responses/:id/use', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(`
      UPDATE canned_responses
      SET usage_count = usage_count + 1
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating canned response usage:', error);
    res.status(500).json({ success: false, error: 'Failed to update usage count' });
  }
});

// POST /api/tickets/canned-responses/seed-defaults - Create default canned responses
router.post('/canned-responses/seed-defaults', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Check if organization already has canned responses
    const existing = await query('SELECT COUNT(*) as count FROM canned_responses WHERE organization_id = $1', [organizationId]);
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ success: true, message: 'Vorlagen bereits vorhanden', seeded: false });
    }

    const defaultResponses = [
      // Begrüßung & Eingangsbestätigung
      {
        title: 'Ticket-Eingangsbestätigung',
        content: `Guten Tag,

vielen Dank für Ihre Anfrage ({{ticket_number}}).

Wir haben Ihr Anliegen erhalten und werden uns schnellstmöglich darum kümmern. Sie erhalten eine Benachrichtigung, sobald es Neuigkeiten gibt.

Bei dringenden Fragen können Sie uns jederzeit kontaktieren.

Mit freundlichen Grüßen`,
        shortcut: 'ack',
        category: 'Begrüßung'
      },
      {
        title: 'Persönliche Begrüßung',
        content: `Hallo,

vielen Dank für Ihre Nachricht zu "{{ticket_title}}".

Ich schaue mir das Thema an und melde mich zeitnah bei Ihnen.

Viele Grüße`,
        shortcut: 'hi',
        category: 'Begrüßung'
      },

      // Status-Updates
      {
        title: 'Bearbeitung gestartet',
        content: `Guten Tag,

ich habe mit der Bearbeitung Ihres Anliegens begonnen.

Aktueller Status: {{status}}
Priorität: {{priority}}

Ich halte Sie auf dem Laufenden.

Mit freundlichen Grüßen`,
        shortcut: 'start',
        category: 'Status'
      },
      {
        title: 'Rückfrage an Kunden',
        content: `Guten Tag,

für die weitere Bearbeitung benötige ich noch folgende Informationen:

- [Ihre Frage hier]

Sobald ich die Informationen habe, kann ich fortfahren.

Mit freundlichen Grüßen`,
        shortcut: 'ask',
        category: 'Status'
      },
      {
        title: 'Warten auf Rückmeldung',
        content: `Guten Tag,

ich warte noch auf Ihre Rückmeldung zu meiner letzten Anfrage.

Falls Sie keine weiteren Informationen benötigen oder das Problem gelöst ist, können Sie das Ticket gerne schließen.

Mit freundlichen Grüßen`,
        shortcut: 'wait',
        category: 'Status'
      },

      // Lösungen
      {
        title: 'Problem gelöst',
        content: `Guten Tag,

das Problem wurde behoben. Hier ist eine kurze Zusammenfassung:

**Ursache:**
[Beschreibung der Ursache]

**Lösung:**
[Beschreibung der Lösung]

Bitte testen Sie, ob alles wie gewünscht funktioniert. Falls noch Fragen bestehen, können Sie einfach auf diese Nachricht antworten.

Mit freundlichen Grüßen`,
        shortcut: 'solved',
        category: 'Lösung'
      },
      {
        title: 'Workaround bereitgestellt',
        content: `Guten Tag,

ich habe einen Workaround für Ihr Problem gefunden:

**Vorgehensweise:**
1. [Schritt 1]
2. [Schritt 2]
3. [Schritt 3]

Dies ist eine temporäre Lösung. Ich arbeite an einer dauerhaften Behebung und halte Sie auf dem Laufenden.

Mit freundlichen Grüßen`,
        shortcut: 'workaround',
        category: 'Lösung'
      },

      // Abschluss
      {
        title: 'Ticket abschließen',
        content: `Guten Tag,

da ich keine Rückmeldung erhalten habe, schließe ich dieses Ticket.

Falls das Problem weiterhin besteht oder neue Fragen auftauchen, können Sie jederzeit ein neues Ticket erstellen oder auf diese Nachricht antworten.

Mit freundlichen Grüßen`,
        shortcut: 'close',
        category: 'Abschluss'
      },
      {
        title: 'Feedback-Bitte',
        content: `Guten Tag,

Ihr Anliegen wurde bearbeitet. Ich hoffe, ich konnte Ihnen weiterhelfen.

Falls Sie mit der Lösung zufrieden sind, würde ich mich über eine kurze Rückmeldung freuen.

Vielen Dank für Ihr Vertrauen!

Mit freundlichen Grüßen`,
        shortcut: 'feedback',
        category: 'Abschluss'
      },

      // Technisch
      {
        title: 'Remote-Zugang benötigt',
        content: `Guten Tag,

zur Analyse des Problems benötige ich einen Remote-Zugang zu Ihrem System.

Bitte teilen Sie mir mit, wann ich mich verbinden kann und senden Sie mir die Zugangsdaten über einen sicheren Kanal.

Mit freundlichen Grüßen`,
        shortcut: 'remote',
        category: 'Technisch'
      },
      {
        title: 'Neustart empfohlen',
        content: `Guten Tag,

bitte versuchen Sie folgende Schritte:

1. Speichern Sie alle offenen Arbeiten
2. Starten Sie das betroffene Programm/System neu
3. Testen Sie, ob das Problem weiterhin besteht

Falls das Problem nach dem Neustart weiterhin auftritt, melden Sie sich bitte erneut.

Mit freundlichen Grüßen`,
        shortcut: 'restart',
        category: 'Technisch'
      },
      {
        title: 'Log-Dateien anfordern',
        content: `Guten Tag,

für die Fehleranalyse benötige ich die Log-Dateien des Systems.

Bitte senden Sie mir folgende Dateien:
- [Log-Datei 1]
- [Log-Datei 2]

Alternativ können Sie die Dateien als Anhang zu diesem Ticket hochladen.

Mit freundlichen Grüßen`,
        shortcut: 'logs',
        category: 'Technisch'
      }
    ];

    // Insert all default responses
    for (const response of defaultResponses) {
      const id = crypto.randomUUID();
      await query(`
        INSERT INTO canned_responses (id, user_id, organization_id, title, content, shortcut, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, userId, organizationId, response.title, response.content, response.shortcut, response.category]);
    }

    res.json({ success: true, message: `${defaultResponses.length} Standard-Vorlagen erstellt`, seeded: true, count: defaultResponses.length });
  } catch (error) {
    logger.error('Error seeding canned responses:', error);
    res.status(500).json({ success: false, error: 'Failed to seed canned responses' });
  }
});

// ============================================================================
// TICKET TEMPLATES ROUTES
// ============================================================================


// GET /api/tickets/templates/:id - Get single template
router.get('/templates/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      `SELECT ${TICKET_TEMPLATE_COLUMNS} FROM ticket_templates WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error fetching ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket template' });
  }
});

// POST /api/tickets/templates - Create template
router.post('/templates', authenticateToken, attachOrganization, validate(ticketTemplateSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      name, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId, defaultProjectId, category, isActive
    } = req.body;

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO ticket_templates (
        id, organization_id, name, title_template, description_template,
        default_priority, default_customer_id, default_project_id, category, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [
      id, organizationId, name, titleTemplate || null, descriptionTemplate || null,
      defaultPriority || null, defaultCustomerId || null, defaultProjectId || null,
      category || null, isActive !== false
    ]);

    res.status(201).json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error creating ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to create ticket template' });
  }
});

// PUT /api/tickets/templates/:id - Update template
router.put('/templates/:id', authenticateToken, attachOrganization, validate(updateTicketTemplateSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const {
      name, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId, defaultProjectId, category, isActive
    } = req.body;

    const result = await query(`
      UPDATE ticket_templates
      SET name = COALESCE($1, name),
          title_template = COALESCE($2, title_template),
          description_template = COALESCE($3, description_template),
          default_priority = COALESCE($4, default_priority),
          default_customer_id = $5,
          default_project_id = $6,
          category = $7,
          is_active = COALESCE($8, is_active),
          updated_at = NOW()
      WHERE id = $9 AND organization_id = $10
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [
      name || null, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId || null, defaultProjectId || null, category || null,
      isActive, id, organizationId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to update ticket template' });
  }
});

// DELETE /api/tickets/templates/:id - Delete template
router.delete('/templates/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM ticket_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    logger.error('Error deleting ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete ticket template' });
  }
});

// POST /api/tickets/templates/:id/use - Increment usage count
router.post('/templates/:id/use', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(`
      UPDATE ticket_templates
      SET usage_count = usage_count + 1
      WHERE id = $1 AND organization_id = $2
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating template usage:', error);
    res.status(500).json({ success: false, error: 'Failed to update usage count' });
  }
});

// ============================================================================
// TICKET TAGS ROUTES
// ============================================================================

// GET /api/tickets/tags/list - Get all tags for organization

export default router;
