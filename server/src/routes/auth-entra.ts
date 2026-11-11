/**
 * Entra-ID-Anmeldung (Microsoft SSO) — OPTIONAL per Env-Konfiguration.
 *
 * Aktiv nur, wenn ENTRA_TENANT_ID + ENTRA_CLIENT_ID + ENTRA_CLIENT_SECRET
 * gesetzt sind; ohne Konfiguration meldet /status enabled=false und das
 * Frontend zeigt keinen Button. Der klassische Passwort-Login bleibt
 * unverändert bestehen (Break-Glass + Testphase — SSO wird erst nach
 * erfolgreichem Test verpflichtend gemacht, falls überhaupt).
 *
 * Flow (OAuth2 Authorization Code + PKCE, Confidential Client):
 *   1. GET  /login     → 302 zu login.microsoftonline.com (state + PKCE)
 *   2. GET  /callback  → Code gegen Token tauschen, id_token-Claims prüfen,
 *                        User per E-Mail auf BESTEHENDEN App-User mappen
 *                        (kein Auto-Anlegen!), App-JWT + Refresh ausstellen
 *   3. Redirect zum Frontend mit EINMAL-Code (60 s TTL) — nie Tokens in der
 *      URL (nginx-Logs/History)
 *   4. POST /exchange  → Einmal-Code gegen {token, refreshToken, user}
 *
 * Conditional Access greift in Schritt 1/2 beim Entra-Login; die App-Session
 * danach läuft wie gehabt über eigene JWTs (8h) + Refresh-Rotation.
 */
import { Router, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';
import { refreshTokenService } from '../services/refreshTokenService';
import { auditLog } from '../services/auditLog';
import { logger } from '../utils/logger';

const router = Router();

const ACCESS_TOKEN_TTL = '8h';

function entraConfig() {
  const tenantId = process.env.ENTRA_TENANT_ID || '';
  const clientId = process.env.ENTRA_CLIENT_ID || '';
  const clientSecret = process.env.ENTRA_CLIENT_SECRET || '';
  const backendUrl = (process.env.BACKEND_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const redirectUri = process.env.ENTRA_REDIRECT_URI || `${backendUrl}/api/auth/entra/callback`;
  const frontendUrl = (process.env.FRONTEND_URL || backendUrl).replace(/\/$/, '');
  return {
    enabled: Boolean(tenantId && clientId && clientSecret && backendUrl),
    tenantId, clientId, clientSecret, redirectUri, frontendUrl,
  };
}

// In-Memory-Stores reichen: Single-Container-Deployment, Einträge leben
// nur Sekunden bis Minuten. Nach Container-Neustart muss der Login-Klick
// schlicht wiederholt werden.
interface PendingAuth { codeVerifier: string; createdAt: number }
interface PendingExchange {
  token: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: { id: string; username: string; email: string; accountType: string };
  createdAt: number;
}
const pendingAuth = new Map<string, PendingAuth>();       // key = state
const pendingExchange = new Map<string, PendingExchange>(); // key = Einmal-Code
const AUTH_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuth) if (now - v.createdAt > AUTH_TTL_MS) pendingAuth.delete(k);
  for (const [k, v] of pendingExchange) if (now - v.createdAt > EXCHANGE_TTL_MS) pendingExchange.delete(k);
}, 60 * 1000).unref();

const b64url = (buf: Buffer) => buf.toString('base64url');

// GET /api/auth/entra/status — public: zeigt dem Login-Screen, ob der Button
// gerendert werden soll. Verrät nichts Internes.
router.get('/status', (_req, res) => {
  res.json({ success: true, enabled: entraConfig().enabled });
});

// GET /api/auth/entra/login — startet den Authorization-Code-Flow
router.get('/login', (req: AuthRequest, res: Response) => {
  const cfg = entraConfig();
  if (!cfg.enabled) return res.status(404).json({ error: 'Entra-Login ist nicht konfiguriert' });

  const state = b64url(crypto.randomBytes(32));
  const codeVerifier = b64url(crypto.randomBytes(48));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  pendingAuth.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize?${params}`);
});

// GET /api/auth/entra/callback — Microsoft leitet hierher zurück
router.get('/callback', async (req: AuthRequest, res: Response) => {
  const cfg = entraConfig();
  const fail = (reason: string) => res.redirect(`${cfg.frontendUrl}/?entra_error=${encodeURIComponent(reason)}`);
  if (!cfg.enabled) return res.status(404).json({ error: 'Entra-Login ist nicht konfiguriert' });

  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
      logger.warn(`[ENTRA] Callback mit Fehler: ${error}`);
      return fail(error === 'access_denied' ? 'abgebrochen' : 'provider');
    }
    if (!code || !state) return fail('ungueltig');

    // state: Einmal-Verwendung (CSRF-Schutz), danach sofort löschen
    const pending = pendingAuth.get(state);
    pendingAuth.delete(state);
    if (!pending || Date.now() - pending.createdAt > AUTH_TTL_MS) return fail('abgelaufen');

    // Code gegen Tokens tauschen (Confidential Client + PKCE)
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
          code_verifier: pending.codeVerifier,
          scope: 'openid profile email',
        }),
      }
    );
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => '');
      logger.error(`[ENTRA] Token-Exchange fehlgeschlagen (${tokenRes.status}): ${body.slice(0, 300)}`);
      return fail('token');
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return fail('token');

    // id_token kam direkt vom Token-Endpoint über TLS mit Client-Auth —
    // Claims trotzdem hart prüfen (aud/tid/exp), bevor wir mappen.
    const claims = jwt.decode(tokens.id_token) as Record<string, unknown> | null;
    const aud = claims?.aud as string | undefined;
    const tid = claims?.tid as string | undefined;
    const exp = claims?.exp as number | undefined;
    if (!claims || aud !== cfg.clientId || tid !== cfg.tenantId || !exp || exp * 1000 < Date.now()) {
      logger.error('[ENTRA] id_token-Claims ungültig (aud/tid/exp)');
      return fail('token');
    }

    const email = ((claims.email || claims.preferred_username) as string | undefined)?.toLowerCase().trim();
    if (!email || !email.includes('@')) return fail('keine_email');

    // Mapping NUR auf bestehende App-User — SSO legt keine Konten an
    const userResult = await pool.query(
      `SELECT id, username, email, account_type FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    if (userResult.rows.length === 0) {
      logger.warn(`[ENTRA] Login ohne passenden App-User: ${email}`);
      return fail('kein_konto');
    }
    const user = userResult.rows[0];

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_TTL });
    const refresh = await refreshTokenService.create(user.id, {
      userAgent: req.headers['user-agent'] as string | undefined,
      ipAddress: req.ip || undefined,
    });

    auditLog.log({
      userId: user.id,
      action: 'user.entra_login',
      details: JSON.stringify({ email, tid }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    logger.info(`[ENTRA] ✅ SSO-Login: ${user.username} (${email})`);

    // Einmal-Code statt Tokens in der URL
    const exchangeCode = b64url(crypto.randomBytes(32));
    pendingExchange.set(exchangeCode, {
      token,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      user: { id: user.id, username: user.username, email: user.email, accountType: user.account_type },
      createdAt: Date.now(),
    });
    return res.redirect(`${cfg.frontendUrl}/?entra_code=${exchangeCode}`);
  } catch (err: any) {
    logger.error(`[ENTRA] Callback-Fehler: ${err.message}`);
    return fail('server');
  }
});

// POST /api/auth/entra/exchange — Einmal-Code gegen App-Tokens
const exchangeSchema = z.object({ code: z.string().min(16).max(128) });
router.post('/exchange', authLimiter, validate(exchangeSchema), (req: AuthRequest, res: Response) => {
  const { code } = req.body as { code: string };
  const entry = pendingExchange.get(code);
  pendingExchange.delete(code); // Einmal-Verwendung
  if (!entry || Date.now() - entry.createdAt > EXCHANGE_TTL_MS) {
    return res.status(401).json({ success: false, error: 'Code ungültig oder abgelaufen' });
  }
  res.json({
    success: true,
    token: entry.token,
    refreshToken: entry.refreshToken,
    refreshTokenExpiresAt: entry.refreshTokenExpiresAt,
    user: entry.user,
  });
});

export default router;
