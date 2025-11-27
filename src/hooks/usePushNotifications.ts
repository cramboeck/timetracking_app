import { useState, useEffect, useCallback } from 'react';
import { pushApi, NotificationPreferences, DeviceSubscription } from '../services/api';

interface PushNotificationState {
  isSupported: boolean;
  isConfigured: boolean;
  permission: NotificationPermission | 'loading';
  isSubscribed: boolean;
  subscriptions: DeviceSubscription[];
  preferences: NotificationPreferences | null;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isConfigured: false,
    permission: 'loading',
    isSubscribed: false,
    subscriptions: [],
    preferences: null,
    loading: true,
    error: null,
  });

  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Check if push notifications are supported
  const checkSupport = useCallback(async () => {
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    const permission = isSupported ? Notification.permission : 'denied';

    setState((prev) => ({
      ...prev,
      isSupported,
      permission,
    }));

    return isSupported;
  }, []);

  // Load VAPID key and subscriptions
  const loadData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Get VAPID public key
      const vapidResponse = await pushApi.getVapidPublicKey();
      setVapidPublicKey(vapidResponse.publicKey);
      setState((prev) => ({ ...prev, isConfigured: vapidResponse.configured }));

      // Get user subscriptions
      const subsResponse = await pushApi.getSubscriptions();
      const currentSub = await getCurrentSubscription();
      const isSubscribed = currentSub !== null && subsResponse.data.some(
        (s) => s.endpoint === currentSub?.endpoint
      );

      // Get notification preferences
      const prefsResponse = await pushApi.getPreferences();

      setState((prev) => ({
        ...prev,
        subscriptions: subsResponse.data,
        preferences: prefsResponse.data,
        isSubscribed,
        loading: false,
      }));
    } catch (error: any) {
      console.error('Failed to load push notification data:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to load notification settings',
      }));
    }
  }, []);

  // Get current subscription from service worker
  const getCurrentSubscription = async (): Promise<PushSubscriptionJSON | null> => {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      return subscription?.toJSON() || null;
    } catch {
      return null;
    }
  };

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request permission:', error);
      return false;
    }
  }, [state.isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported || !vapidPublicKey) {
      setState((prev) => ({ ...prev, error: 'Push notifications not supported or not configured' }));
      return false;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Request permission if needed
      if (Notification.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: 'Notification permission denied',
          }));
          return false;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys) {
        throw new Error('Invalid subscription');
      }

      // Get device name
      const deviceName = getDeviceName();

      // Send subscription to server
      await pushApi.subscribe(
        {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh!,
            auth: subJson.keys.auth!,
          },
        },
        deviceName
      );

      // Reload subscriptions
      await loadData();

      return true;
    } catch (error: any) {
      console.error('Failed to subscribe:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to subscribe to notifications',
      }));
      return false;
    }
  }, [state.isSupported, vapidPublicKey, requestPermission, loadData]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from browser
        await subscription.unsubscribe();

        // Remove from server
        await pushApi.unsubscribe(subscription.endpoint);
      }

      // Reload subscriptions
      await loadData();

      return true;
    } catch (error: any) {
      console.error('Failed to unsubscribe:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to unsubscribe',
      }));
      return false;
    }
  }, [loadData]);

  // Delete a specific subscription
  const deleteSubscription = useCallback(async (id: string): Promise<boolean> => {
    try {
      await pushApi.deleteSubscription(id);
      await loadData();
      return true;
    } catch (error: any) {
      console.error('Failed to delete subscription:', error);
      setState((prev) => ({
        ...prev,
        error: error.message || 'Failed to delete subscription',
      }));
      return false;
    }
  }, [loadData]);

  // Update notification preferences
  const updatePreferences = useCallback(async (
    updates: Partial<NotificationPreferences>
  ): Promise<boolean> => {
    try {
      await pushApi.updatePreferences(updates);
      setState((prev) => ({
        ...prev,
        preferences: prev.preferences ? { ...prev.preferences, ...updates } : null,
      }));
      return true;
    } catch (error: any) {
      console.error('Failed to update preferences:', error);
      setState((prev) => ({
        ...prev,
        error: error.message || 'Failed to update preferences',
      }));
      return false;
    }
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<{ sent: number; failed: number }> => {
    try {
      const result = await pushApi.sendTest();
      return { sent: result.sent, failed: result.failed };
    } catch (error: any) {
      console.error('Failed to send test notification:', error);
      throw error;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const supported = await checkSupport();
      if (supported) {
        await loadData();
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    init();
  }, [checkSupport, loadData]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    deleteSubscription,
    updatePreferences,
    sendTestNotification,
    requestPermission,
    reload: loadData,
  };
}

// Helper: Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Helper: Get device name
function getDeviceName(): string {
  const ua = navigator.userAgent;

  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) return 'Android Phone';
    return 'Android Tablet';
  }
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';

  return 'Unknown Device';
}

export default usePushNotifications;
