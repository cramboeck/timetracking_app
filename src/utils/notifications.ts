// Browser Notification Utilities

export interface NotificationConfig {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

class NotificationService {
  private permission: NotificationPermission = 'default';

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported in this browser');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;

      // Store permission in localStorage
      localStorage.setItem('notification_permission', permission);

      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are supported and permitted
   */
  isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Check if user has granted permission
   */
  hasPermission(): boolean {
    return this.permission === 'granted';
  }

  /**
   * Show a notification
   */
  async show(config: NotificationConfig): Promise<void> {
    if (!this.hasPermission()) {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      // Try to use Service Worker notification first (better for PWA)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(config.title, {
          body: config.body,
          icon: config.icon || '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: config.tag,
          requireInteraction: config.requireInteraction || false,
        });
      } else {
        // Fallback to regular notification
        new Notification(config.title, {
          body: config.body,
          icon: config.icon || '/icon-192x192.png',
          tag: config.tag,
          requireInteraction: config.requireInteraction || false,
        });
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Check if month-end notification should be shown
   */
  shouldShowMonthEndNotification(): boolean {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay;

    // Show notification 3 days before month end
    return daysRemaining <= 3 && daysRemaining >= 0;
  }

  /**
   * Show month-end notification
   */
  async showMonthEndNotification(daysRemaining: number): Promise<void> {
    await this.show({
      title: '📅 Monatsende naht!',
      body: `Noch ${daysRemaining} Tag(e) bis zum Monatsende. Zeit für deine Reports!`,
      tag: 'month-end',
      requireInteraction: true,
    });
  }

  /**
   * Check if daily reminder should be shown (no entries today)
   */
  shouldShowDailyReminder(hasEntriesToday: boolean): boolean {
    const now = new Date();
    const hour = now.getHours();

    // Show reminder between 18:00 and 22:00 if no entries
    return !hasEntriesToday && hour >= 18 && hour <= 22;
  }

  /**
   * Show daily reminder notification
   */
  async showDailyReminder(): Promise<void> {
    await this.show({
      title: '⏰ Zeiterfassung vergessen?',
      body: 'Du hast heute noch keine Zeiten erfasst. Trage jetzt deine Stunden ein!',
      tag: 'daily-reminder',
    });
  }

  /**
   * Check if quality check notification should be shown
   */
  shouldShowQualityCheck(entriesWithoutDescription: number): boolean {
    return entriesWithoutDescription > 0;
  }

  /**
   * Show quality check notification
   */
  async showQualityCheckNotification(count: number): Promise<void> {
    await this.show({
      title: '✍️ Beschreibungen fehlen',
      body: `${count} Zeiteinträge haben keine Beschreibung. Vervollständige sie jetzt!`,
      tag: 'quality-check',
    });
  }

  /**
   * Check if weekly report notification should be shown (Friday)
   */
  shouldShowWeeklyReport(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
    const hour = now.getHours();

    // Show on Friday between 16:00 and 18:00
    return dayOfWeek === 5 && hour >= 16 && hour <= 18;
  }

  /**
   * Show weekly report notification
   */
  async showWeeklyReportNotification(totalHours: number): Promise<void> {
    await this.show({
      title: '📊 Wochenreport',
      body: `Du hast diese Woche ${totalHours.toFixed(1)} Stunden erfasst. Prüfe deine Einträge!`,
      tag: 'weekly-report',
      requireInteraction: true,
    });
  }

  /**
   * Get last notification time for a specific tag
   */
  getLastNotificationTime(tag: string): number {
    const key = `last_notification_${tag}`;
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) : 0;
  }

  /**
   * Set last notification time for a specific tag
   */
  setLastNotificationTime(tag: string): void {
    const key = `last_notification_${tag}`;
    localStorage.setItem(key, Date.now().toString());
  }

  /**
   * Check if enough time has passed since last notification (prevent spam)
   */
  canShowNotification(tag: string, minHoursBetween: number = 24): boolean {
    const lastTime = this.getLastNotificationTime(tag);
    const now = Date.now();
    const hoursPassed = (now - lastTime) / (1000 * 60 * 60);

    return hoursPassed >= minHoursBetween;
  }
}

export const notificationService = new NotificationService();
