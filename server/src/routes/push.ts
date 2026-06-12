import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  getVapidPublicKey,
  isPushConfigured,
  subscribeDevice,
  unsubscribeDevice,
  getUserSubscriptions,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendPushToUser,
  generateVapidKeys,
} from '../services/pushNotifications';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = express.Router();

// Zod schemas
const subscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: subscriptionKeysSchema,
    expirationTime: z.number().optional().nullable(),
  }),
  deviceName: z.string().max(200).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

const preferencesSchema = z.object({
  ticketCreated: z.boolean().optional(),
  ticketUpdated: z.boolean().optional(),
  ticketCommented: z.boolean().optional(),
  alertTriggered: z.boolean().optional(),
  timerReminder: z.boolean().optional(),
});

// GET /api/push/vapid-public-key - Get VAPID public key for client subscription
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const publicKey = getVapidPublicKey();
  const configured = isPushConfigured();

  res.json({
    success: true,
    publicKey,
    configured,
  });
});

// POST /api/push/subscribe - Subscribe a device for push notifications
router.post('/subscribe', authenticateToken, validate(subscribeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { subscription, deviceName } = req.body;
    const userId = req.user!.id;
    // Validation handled by Zod

    const result = await subscribeDevice(userId, subscription, deviceName);

    if (result.success) {
      res.json({
        success: true,
        message: 'Device subscribed successfully',
        subscriptionId: result.id,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to subscribe device',
      });
    }
  } catch (error: any) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to subscribe device',
    });
  }
});

// POST /api/push/unsubscribe - Unsubscribe a device
router.post('/unsubscribe', authenticateToken, validate(unsubscribeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body;
    // Validation handled by Zod

    const result = await unsubscribeDevice(endpoint);

    if (result.success) {
      res.json({
        success: true,
        message: 'Device unsubscribed successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to unsubscribe device',
      });
    }
  } catch (error: any) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unsubscribe device',
    });
  }
});

// GET /api/push/subscriptions - Get user's subscriptions
router.get('/subscriptions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscriptions = await getUserSubscriptions(userId);

    res.json({
      success: true,
      data: subscriptions,
    });
  } catch (error: any) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get subscriptions',
    });
  }
});

// DELETE /api/push/subscriptions/:id - Delete a specific subscription
router.delete('/subscriptions/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify subscription belongs to user
    const subscriptions = await getUserSubscriptions(userId);
    const sub = subscriptions.find((s: any) => s.id === id);

    if (!sub) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
    }

    await unsubscribeDevice(sub.endpoint);

    res.json({
      success: true,
      message: 'Subscription deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete subscription',
    });
  }
});

// GET /api/push/preferences - Get notification preferences
router.get('/preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = await getNotificationPreferences(userId);

    // Default preferences if none exist
    const defaultPreferences = {
      // Push notification settings
      push_enabled: true,
      push_on_new_ticket: true,
      push_on_ticket_assigned: true,
      push_on_ticket_comment: true,
      push_on_status_change: true,
      push_on_sla_warning: true,
      push_on_mention: true,
      // Email notification settings
      email_enabled: true,
      email_on_new_ticket: true,
      email_on_ticket_assigned: true,
      email_on_ticket_comment: true,
      email_on_status_change: false,
      email_on_sla_warning: true,
      email_on_mention: true,
      email_daily_digest: false,
      // Quiet hours
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
    };

    res.json({
      success: true,
      data: preferences || defaultPreferences,
    });
  } catch (error: any) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get preferences',
    });
  }
});

// PUT /api/push/preferences - Update notification preferences
router.put('/preferences', authenticateToken, validate(preferencesSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = req.body;

    const result = await updateNotificationPreferences(userId, preferences);

    if (result.success) {
      res.json({
        success: true,
        message: 'Preferences updated successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to update preferences',
      });
    }
  } catch (error: any) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update preferences',
    });
  }
});

// POST /api/push/test - Send a test notification
router.post('/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await sendPushToUser(userId, {
      title: 'Test Benachrichtigung',
      body: 'Push-Benachrichtigungen funktionieren einwandfrei!',
      icon: '/icons/icon-192x192.png',
      data: {
        type: 'test',
        url: '/tickets',
      },
    });

    res.json({
      success: true,
      message: `Test notification sent to ${result.sent} device(s)`,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send test notification',
    });
  }
});

// GET /api/push/generate-vapid - Generate new VAPID keys (admin only)
router.get('/generate-vapid', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Only allow admins to generate keys
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const keys = generateVapidKeys();

    res.json({
      success: true,
      message: 'Add these keys to your .env file:',
      keys: {
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
      },
    });
  } catch (error: any) {
    console.error('Generate VAPID keys error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate VAPID keys',
    });
  }
});

export default router;
