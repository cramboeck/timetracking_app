import express from 'express';
import s01 from './01-core';
import s02 from './02-bulk';
import s03 from './03-comments-attachments';
import s04 from './04-canned-templates';
import s05 from './05-tags';
import s06 from './06-activities-search';
import s07 from './07-sla';
import s08 from './08-tasks';

// Fuer externe Konsumenten (microsoft365.ts, entries.ts) weiterhin exportiert
export { generateTicketNumber, logTicketActivity, calculateSlaDeadlines } from './shared';

/**
 * ⚠️ Die Mount-Reihenfolge ist heilig: Sie entspricht exakt der frueheren
 * Registrierungsreihenfolge im Monolithen. /templates muss vor /:id kommen,
 * DELETE /bulk vor DELETE /:id usw. — Umsortieren erzeugt tote Routen
 * (siehe Route-Shadowing-Sweep b895df0).
 */
const router = express.Router();
router.use(s01);
router.use(s02);
router.use(s03);
router.use(s04);
router.use(s05);
router.use(s06);
router.use(s07);
router.use(s08);

export default router;
