/**
 * Server-Sent Events (SSE) for Real-Time Updates
 *
 * Provides a persistent connection for pushing real-time updates to clients.
 * Replaces polling-based approaches for NinjaRMM alerts, tickets, etc.
 *
 * Usage:
 *   const eventSource = new EventSource('/api/sse/events?token=JWT_TOKEN');
 *   eventSource.addEventListener('ninja_alert', (e) => { ... });
 *   eventSource.addEventListener('ticket_update', (e) => { ... });
 */

import express, { Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = express.Router();

// ============================================
// Types
// ============================================

interface SSEClient {
  id: string;
  res: Response;
  userId: string;
  organizationId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export type SSEEventType =
  | 'ninja_alert'
  | 'ticket_update'
  | 'ticket_created'
  | 'email_received'
  | 'contract_warning'
  | 'heartbeat';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  organizationId?: string;
  userId?: string;
}

// ============================================
// Client Management
// ============================================

const clients = new Map<string, SSEClient>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Client timeout (no heartbeat response for 2 minutes = disconnect)
const CLIENT_TIMEOUT = 120000;

// Send heartbeat to all clients
setInterval(() => {
  const now = new Date();
  clients.forEach((client, id) => {
    // Check if client is stale
    if (now.getTime() - client.lastHeartbeat.getTime() > CLIENT_TIMEOUT) {
      logger.info(`[SSE] Client ${id} timed out, removing`);
      clients.delete(id);
      return;
    }

    // Send heartbeat
    try {
      client.res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: now.toISOString() })}\n\n`);
      client.lastHeartbeat = now;
    } catch (err) {
      logger.error(`[SSE] Error sending heartbeat to ${id}:`, err);
      clients.delete(id);
    }
  });
}, HEARTBEAT_INTERVAL);

/**
 * Emit an event to relevant clients
 */
export function emitSSEEvent(event: SSEEvent): void {
  const { type, data, organizationId, userId } = event;
  const payload = JSON.stringify({ ...data, timestamp: new Date().toISOString() });

  clients.forEach((client, id) => {
    // Filter by organization if specified
    if (organizationId && client.organizationId !== organizationId) {
      return;
    }

    // Filter by user if specified
    if (userId && client.userId !== userId) {
      return;
    }

    try {
      client.res.write(`event: ${type}\ndata: ${payload}\n\n`);
    } catch (err) {
      logger.error(`[SSE] Error emitting ${type} to ${id}:`, err);
      clients.delete(id);
    }
  });

  logger.debug(`[SSE] Emitted ${type} to ${clients.size} clients`);
}

/**
 * Get connected client count (for monitoring)
 */
export function getSSEClientCount(): number {
  return clients.size;
}

/**
 * Get connected clients info (for admin dashboard)
 */
export function getSSEClientsInfo(): Array<{
  id: string;
  userId: string;
  organizationId: string;
  connectedAt: string;
  lastHeartbeat: string;
}> {
  return Array.from(clients.values()).map((c) => ({
    id: c.id,
    userId: c.userId,
    organizationId: c.organizationId,
    connectedAt: c.connectedAt.toISOString(),
    lastHeartbeat: c.lastHeartbeat.toISOString(),
  }));
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/sse/events
 * Main SSE endpoint - clients connect here for real-time updates
 *
 * Query params:
 *   - token: JWT access token (required, since EventSource can't set headers)
 */
router.get('/events', async (req, res) => {
  const { token } = req.query;

  // Validate token
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ success: false, error: 'Token required' });
  }

  let userId: string;
  let organizationId: string;

  try {
    // Kein Fallback-Secret: ohne konfiguriertes JWT_SECRET fail-closed
    // (ein bekannter Default wäre von jedem forgebar)
    if (!process.env.JWT_SECRET) {
      logger.error('[SSE] JWT_SECRET not configured');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId?: string;
      type?: string;
      mfaPending?: boolean;
      exp?: number;
    };
    // Nur reine App-Session-Tokens (kein Portal-/mfaPending-Token)
    if (decoded.type || decoded.mfaPending || !decoded.userId) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    userId = decoded.userId;

    // Get user's organization
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'No organization found' });
    }

    organizationId = orgResult.rows[0].organization_id;
  } catch (err) {
    logger.warn('[SSE] Invalid token:', err);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers
  res.flushHeaders();

  // Generate client ID
  const clientId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Register client
  const client: SSEClient = {
    id: clientId,
    res,
    userId,
    organizationId,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
  };
  clients.set(clientId, client);

  logger.info(`[SSE] Client ${clientId} connected (total: ${clients.size})`);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    clients.delete(clientId);
    logger.info(`[SSE] Client ${clientId} disconnected (total: ${clients.size})`);
  });

  // Keep connection alive (handled by heartbeat interval)
});

/**
 * GET /api/sse/status
 * Get SSE service status (for monitoring/admin).
 * Admin-only: die Client-Liste enthält userId/organizationId aller
 * verbundenen Nutzer — ohne Auth war das eine öffentliche User-Enumeration.
 */
router.get('/status', authenticate, requireAdmin, (req, res) => {
  res.json({
    success: true,
    data: {
      connectedClients: clients.size,
      clients: getSSEClientsInfo(),
    },
  });
});

export default router;
