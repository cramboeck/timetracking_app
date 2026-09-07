import { query } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Geocoding für die GPS-Kunden-Zuordnung (A6 Phase 2).
 *
 * Nutzt Nominatim (OpenStreetMap) — kostenlos, aber mit Nutzungsregeln:
 * max. 1 Request/Sekunde und aussagekräftiger User-Agent. Geocoding ist
 * IMMER best effort: schlägt es fehl, bleibt der Kunde ohne Koordinaten
 * und wird beim täglichen Nachzügler-Job erneut versucht.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'RamboFlow/1.0 (Zeiterfassung; app.ramboeck.it)';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const q = address.trim();
  if (!q) return null;

  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      limit: '1',
      countrycodes: 'de,at,ch', // DACH — vermeidet Treffer auf anderen Kontinenten
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.error(`Geocoding HTTP ${response.status} für "${q.slice(0, 60)}"`);
      return null;
    }
    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(results) || results.length === 0) return null;

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (err: any) {
    logger.error(`Geocoding fehlgeschlagen für "${q.slice(0, 60)}": ${err.message}`);
    return null;
  }
}

/**
 * Kunden-Koordinaten aktualisieren (fire-and-forget beim Speichern der
 * Adresse). geocoded_at wird auch bei erfolglosem Versuch gesetzt, damit
 * der Nachzügler-Job dieselbe kaputte Adresse nicht täglich neu probiert —
 * eine Adressänderung setzt die Spalten zurück und triggert den nächsten
 * Versuch.
 */
export async function geocodeCustomer(customerId: string, address: string): Promise<void> {
  const point = await geocodeAddress(address);
  await query(
    `UPDATE customers SET latitude = $2, longitude = $3, geocoded_at = NOW() WHERE id = $1`,
    [customerId, point?.lat ?? null, point?.lng ?? null]
  );
  if (point) {
    logger.info(`📍 Kunde ${customerId} geocodiert: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
  }
}

/** Haversine-Distanz in Metern */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Match-Regeln: naechster Kunde im Umkreis. Bei sehr ungenauem GPS-Fix
// (Indoor, Funkzellen-Ortung) wird gar nicht gematcht — lieber kein
// Kundenname als ein falscher.
const MATCH_RADIUS_METERS = 300;
const MAX_ACCURACY_METERS = 500;

/**
 * Findet den naechstgelegenen Kunden der Organisation mit Koordinaten
 * innerhalb des Match-Radius. null = kein (verlaesslicher) Treffer.
 */
export async function matchCustomerByPosition(
  organizationId: string,
  position: GeoPoint,
  accuracy?: number | null
): Promise<string | null> {
  if (accuracy != null && accuracy > MAX_ACCURACY_METERS) return null;

  const result = await query(
    `SELECT id, latitude, longitude FROM customers
     WHERE organization_id = $1 AND deleted_at IS NULL
       AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [organizationId]
  );

  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const row of result.rows) {
    const dist = distanceMeters(position, { lat: Number(row.latitude), lng: Number(row.longitude) });
    if (dist < bestDist) {
      bestDist = dist;
      bestId = row.id;
    }
  }
  return bestDist <= MATCH_RADIUS_METERS ? bestId : null;
}

/**
 * Täglicher Nachzügler-Job: geocodiert Kunden mit Adresse, aber ohne
 * bisherigen Geocoding-Versuch (Bestandskunden vor Phase 2, Importe).
 * Nominatim-Rate-Limit: 1.1s Abstand zwischen Requests.
 */
export async function geocodePendingCustomers(limit = 50): Promise<{ processed: number; found: number }> {
  const pending = await query(
    `SELECT id, address FROM customers
     WHERE deleted_at IS NULL
       AND address IS NOT NULL AND address <> ''
       AND geocoded_at IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  let found = 0;
  for (const row of pending.rows) {
    const point = await geocodeAddress(row.address);
    await query(
      `UPDATE customers SET latitude = $2, longitude = $3, geocoded_at = NOW() WHERE id = $1`,
      [row.id, point?.lat ?? null, point?.lng ?? null]
    );
    if (point) found++;
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Nominatim-Policy
  }

  if (pending.rows.length > 0) {
    logger.info(`📍 Geocoding-Nachzügler: ${pending.rows.length} Kunden verarbeitet, ${found} mit Koordinaten`);
  }
  return { processed: pending.rows.length, found };
}
