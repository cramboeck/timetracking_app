import { PoolClient } from 'pg';
import * as m001 from './001-core-tables';
import * as m002 from './002-portal-push';
import * as m003 from './003-org-multitenancy';
import * as m004 from './004-crm';
import * as m005 from './005-task-hub';
import * as m006 from './006-contracts';
import * as m007 from './007-sevdesk-billing';
import * as m008 from './008-clockodo-m365';
import * as m009 from './009-social-media';
import * as m010 from './010-invoice-inbox';
import * as m011 from './011-worktime-hr';
import * as m012 from './012-schema-sweep';
import * as m013 from './013-invoice-ssot';
import * as m014 from './014-ticket-email-misc';
import * as m015 from './015-legacy-cleanups';
import * as m016 from './016-line-items-vuln';

export interface Migration {
  name: string;
  run: (client: PoolClient) => Promise<void>;
}

/**
 * Geordnete Migrationsliste — die Reihenfolge entspricht exakt dem frueheren
 * monolithischen initializeDatabase()-Body. Neue Migrationen werden als neue
 * nummerierte Datei ANS ENDE angehaengt (niemals bestehende umsortieren).
 */
export const MIGRATIONS: Migration[] = [
  { name: '001-core-tables', run: m001.run },
  { name: '002-portal-push', run: m002.run },
  { name: '003-org-multitenancy', run: m003.run },
  { name: '004-crm', run: m004.run },
  { name: '005-task-hub', run: m005.run },
  { name: '006-contracts', run: m006.run },
  { name: '007-sevdesk-billing', run: m007.run },
  { name: '008-clockodo-m365', run: m008.run },
  { name: '009-social-media', run: m009.run },
  { name: '010-invoice-inbox', run: m010.run },
  { name: '011-worktime-hr', run: m011.run },
  { name: '012-schema-sweep', run: m012.run },
  { name: '013-invoice-ssot', run: m013.run },
  { name: '014-ticket-email-misc', run: m014.run },
  { name: '015-legacy-cleanups', run: m015.run },
  { name: '016-line-items-vuln', run: m016.run },
];
