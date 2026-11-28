import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, requireOrgRole, OrganizationRequest } from '../middleware/organization';
import { validate } from '../middleware/validation';
import { logger } from '../utils/logger';
import { CallLogError, commitCalls, extractCalls, polishNote } from '../services/callLogService';

/**
 * Anrufliste → CRM-Interaktionen (/api/call-log).
 *  POST /extract  Screenshots lesen + zuordnen (schreibt nichts)
 *  POST /polish   Stichworte → Gesprächsnotiz (optional)
 *  POST /commit   freigegebene Anrufe anlegen (Interaktion + optional Zeit)
 * Alles für Mitglieder (Interaktionen und Zeiterfassung sind Mitglieder-Rechte).
 */
const router = Router();
router.use(authenticateToken, attachOrganization, requireOrgRole('member'));
const orgId = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.id;

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
});

const sendError = (res: Response, err: unknown, fallback: string) => {
  if (err instanceof CallLogError) return res.status(err.status).json({ success: false, error: err.message });
  logger.error(fallback, err);
  return res.status(500).json({ success: false, error: fallback });
};

router.post('/extract', (req, res, next) => {
  upload.array('files', 5)(req, res, err => {
    if (err) {
      const code = (err as { code?: string }).code;
      return res.status(400).json({
        success: false,
        error: code === 'LIMIT_FILE_SIZE' ? 'Bild zu groß (max. 10 MB)' : code === 'LIMIT_FILE_COUNT' ? 'Höchstens 5 Screenshots auf einmal' : 'Upload fehlgeschlagen',
      });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    const files = ((req as unknown as { files?: Express.Multer.File[] }).files) ?? [];
    if (files.length === 0) return res.status(400).json({ success: false, error: 'Bitte einen Screenshot (PNG/JPG) hochladen' });
    const todayRaw = typeof req.body?.today === 'string' ? req.body.today : '';
    const today = /^\d{4}-\d{2}-\d{2}$/.test(todayRaw) ? todayRaw : new Date().toISOString().slice(0, 10);
    const result = await extractCalls(orgId(req), files.map(f => ({ data: f.buffer, mime: f.mimetype })), today);
    res.json({ success: true, data: result });
  } catch (err) {
    sendError(res, err, 'Anrufliste konnte nicht gelesen werden');
  }
});

const polishSchema = z.object({
  notes: z.string().trim().min(1).max(4000),
  customerName: z.string().max(200).optional().nullable(),
  direction: z.string().max(40).optional().nullable(),
});
router.post('/polish', validate(polishSchema), async (req: AuthRequest, res: Response) => {
  try {
    const body = polishSchema.parse(req.body);
    res.json({ success: true, data: await polishNote(orgId(req), body) });
  } catch (err) {
    sendError(res, err, 'Notiz konnte nicht formuliert werden');
  }
});

const commitSchema = z.object({
  calls: z.array(z.object({
    key: z.string().min(8).max(64),
    customerId: z.string().min(1).max(100),
    contactId: z.string().max(100).optional().nullable(),
    direction: z.enum(['inbound', 'outbound', 'missed']),
    occurredAt: z.string().datetime({ offset: true }),
    subject: z.string().max(255).optional().nullable(),
    content: z.string().max(20000).optional().nullable(),
    durationMinutes: z.number().int().min(0).max(600).optional().nullable(),
    followUp: z.boolean().optional(),
    followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    ticketId: z.string().max(100).optional().nullable(),
    time: z.object({
      projectId: z.string().min(1).max(100),
      isBillable: z.boolean(),
      description: z.string().max(500).optional().nullable(),
    }).optional().nullable(),
  })).min(1).max(100),
});
router.post('/commit', validate(commitSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { calls } = commitSchema.parse(req.body);
    res.json({ success: true, data: await commitCalls(orgId(req), req.userId!, calls) });
  } catch (err) {
    sendError(res, err, 'Anrufe konnten nicht übernommen werden');
  }
});

export default router;
