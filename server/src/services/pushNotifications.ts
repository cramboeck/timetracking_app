import webpush, { PushSubscription, SendResult } from 'web-push';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// Types
interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    ticketId?: string;
    type?: string;
  };
}

interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface NotificationPreferences {
  push_enabled: boolean;
  push_on_new_ticket: boolean;
  push_on_ticket_comment: boolean;
  push_on_ticket_assigned: boolean;
  push_on_status_change: boolean;
  push_on_sla_warning: boolean;
  email_enabled: boolean;
}

// Initialize VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

// Configure web-push if VAPID keys are provided
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('✅ Web Push configured with VAPID keys');
} else {
  console.warn('⚠️ VAPID keys not configured. Push notifications will not work.');
  console.log('Generate VAPID keys with: npx web-push generate-vapid-keys');
}

// Get VAPID public key for client subscription
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// Check if push notifications are configured
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

// Subscribe a device for push notifications
export async function subscribeDevice(
  userId: string,
  subscription: SubscriptionData,
  deviceName?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Check if subscription already exists
    const existing = await query(
      'SELECT id FROM push_subscriptions WHERE endpoint = $1',
      [subscription.endpoint]
    );

    if (existing.rows.length > 0) {
      // Update existing subscription
      await query(
        `UPDATE push_subscriptions
         SET user_id = $1, p256dh = $2, auth = $3, device_name = $4, last_used_at = NOW()
         WHERE endpoint = $5`,
        [userId, subscription.keys.p256dh, subscription.keys.auth, deviceName, subscription.endpoint]
      );
      return { success: true, id: existing.rows[0].id };
    }

    // Create new subscription
    const id = uuidv4();
    await query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, deviceName]
    );

    // Create default notification preferences if they don't exist
    await query(
      `INSERT INTO notification_preferences (id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [uuidv4(), userId]
    );

    return { success: true, id };
  } catch (error: any) {
    console.error('Failed to subscribe device:', error);
    return { success: false, error: error.message };
  }
}

// Unsubscribe a device
export async function unsubscribeDevice(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to unsubscribe device:', error);
    return { success: false, error: error.message };
  }
}

// Get user's subscriptions
export async function getUserSubscriptions(userId: string) {
  const result = await query(
    `SELECT id, endpoint, device_name, created_at, last_used_at
     FROM push_subscriptions WHERE user_id = $1
     ORDER BY last_used_at DESC NULLS LAST`,
    [userId]
  );
  return result.rows;
}

// Get user's notification preferences
export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  const result = await query(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// Update user's notification preferences
export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(preferences).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      return { success: true };
    }

    values.push(userId);
    await query(
      `UPDATE notification_preferences
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE user_id = $${paramCount}`,
      values
    );

    return { success: true };
  } catch (error: any) {
    console.error('Failed to update notification preferences:', error);
    return { success: false, error: error.message };
  }
}

// Send push notification to a single subscription
async function sendToSubscription(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<SendResult | null> {
  if (!isPushConfigured()) {
    console.warn('Push notifications not configured, skipping...');
    return null;
  }

  try {
    const result = await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );
    return result;
  } catch (error: any) {
    // If subscription is no longer valid, remove it
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log('Subscription expired, removing...');
      await unsubscribeDevice(subscription.endpoint);
    } else {
      console.error('Push notification error:', error);
    }
    return null;
  }
}

// Send push notification to a user
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  eventType?: keyof NotificationPreferences
): Promise<{ success: boolean; sent: number; failed: number }> {
  // Check user preferences if event type is provided
  if (eventType) {
    const prefs = await getNotificationPreferences(userId);
    if (prefs) {
      if (!prefs.push_enabled || !prefs[eventType]) {
        return { success: true, sent: 0, failed: 0 };
      }
    }
  }

  // Get all user subscriptions
  const result = await query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let sent = 0;
  let failed = 0;

  for (const row of result.rows) {
    const subscription: PushSubscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };

    const sendResult = await sendToSubscription(subscription, payload);
    if (sendResult) {
      sent++;
      // Update last_used_at
      await query(
        'UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1',
        [row.endpoint]
      );
    } else {
      failed++;
    }
  }

  return { success: true, sent, failed };
}

// Helper function to send ticket-related notifications
export async function sendTicketNotification(
  userId: string,
  ticket: { id: string; ticketNumber: string; title: string },
  eventType: 'push_on_new_ticket' | 'push_on_ticket_comment' | 'push_on_ticket_assigned' | 'push_on_status_change' | 'push_on_sla_warning',
  message: string
): Promise<void> {
  const payload: PushPayload = {
    title: `${ticket.ticketNumber}: ${ticket.title}`,
    body: message,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: `ticket-${ticket.id}`,
    data: {
      url: `/tickets/${ticket.id}`,
      ticketId: ticket.id,
      type: eventType.replace('push_on_', ''),
    },
  };

  await sendPushToUser(userId, payload, eventType);
}

// Generate VAPID keys helper (for initial setup)
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

// ============================================
// Portal Push Notifications (for customer contacts)
// ============================================

interface PortalPushPreferences {
  push_enabled: boolean;
  push_on_ticket_reply: boolean;
  push_on_status_change: boolean;
}

// Get portal contact's push preferences
async function getPortalPushPreferences(contactId: string): Promise<PortalPushPreferences | null> {
  const result = await query(
    'SELECT push_enabled, push_on_ticket_reply, push_on_status_change FROM customer_contacts WHERE id = $1',
    [contactId]
  );
  return result.rows[0] || null;
}

// Send push notification to a portal contact
export async function sendPushToPortalContact(
  contactId: string,
  payload: PushPayload,
  eventType?: 'push_on_ticket_reply' | 'push_on_status_change'
): Promise<{ success: boolean; sent: number; failed: number }> {
  if (!isPushConfigured()) {
    return { success: true, sent: 0, failed: 0 };
  }

  // Check preferences if event type is provided
  if (eventType) {
    const prefs = await getPortalPushPreferences(contactId);
    if (prefs) {
      if (!prefs.push_enabled || !prefs[eventType]) {
        return { success: true, sent: 0, failed: 0 };
      }
    }
  }

  // Get all contact subscriptions
  const result = await query(
    'SELECT endpoint, p256dh, auth FROM portal_push_subscriptions WHERE contact_id = $1',
    [contactId]
  );

  let sent = 0;
  let failed = 0;

  for (const row of result.rows) {
    const subscription: webpush.PushSubscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    };

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent++;
      // Update last_used_at
      await query(
        'UPDATE portal_push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1',
        [row.endpoint]
      );
    } catch (error: any) {
      // If subscription is no longer valid, remove it
      if (error.statusCode === 404 || error.statusCode === 410) {
        await query('DELETE FROM portal_push_subscriptions WHERE endpoint = $1', [row.endpoint]);
      }
      failed++;
    }
  }

  return { success: true, sent, failed };
}

// Helper function to send ticket notifications to portal contacts
export async function sendPortalTicketNotification(
  contactId: string,
  ticket: { id: string; ticketNumber: string; title: string },
  eventType: 'push_on_ticket_reply' | 'push_on_status_change',
  message: string
): Promise<void> {
  const payload: PushPayload = {
    title: `${ticket.ticketNumber}: ${ticket.title}`,
    body: message,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `portal-ticket-${ticket.id}`,
    data: {
      url: `/portal/tickets/${ticket.id}`,
      ticketId: ticket.id,
      type: eventType.replace('push_on_', ''),
    },
  };

  await sendPushToPortalContact(contactId, payload, eventType);
}
