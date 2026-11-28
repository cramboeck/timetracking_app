import { describe, it, expect } from 'vitest';
import { guessAssetType, lineNeedsSerials } from '../src/utils/assetTypeGuess';

describe('guessAssetType', () => {
  it.each([
    ['Lenovo ThinkPad T14 Gen 5', 'laptop'],
    ['HP EliteBook 840 G10', 'laptop'],
    ['Dell OptiPlex 7010 Micro', 'workstation'],
    ['Dell P2425H Monitor 24"', 'monitor'],
    ['Fortinet FortiGate 40F', 'firewall'],
    ['Synology DiskStation DS923+', 'storage'],
    ['Ubiquiti UniFi Switch 24 PoE', 'network'],
    ['Kyocera ECOSYS M2540dn', 'printer'],
    ['Apple iPhone 16 128GB', 'mobile'],
    ['Yealink T54W Tischtelefon', 'phone'],
    ['HPE ProLiant DL380 Gen11', 'server'],
    ['USB-C Kabel 2m', 'other'],
  ])('%s → %s', (d, t) => expect(guessAssetType(d)).toBe(t));
});

describe('lineNeedsSerials', () => {
  it('Hardware immer, Lizenz nie', () => {
    expect(lineNeedsSerials('hardware', 'USB-Kabel')).toBe(true);
    expect(lineNeedsSerials('license', 'Microsoft 365 Business Premium')).toBe(false);
    expect(lineNeedsSerials('service', 'Einrichtung ThinkPad')).toBe(false);
  });
  it('ohne Klassifizierung nach Bezeichnung', () => {
    expect(lineNeedsSerials(null, 'Lenovo ThinkPad E14')).toBe(true);
    expect(lineNeedsSerials(null, 'Versandkosten')).toBe(false);
  });
});
