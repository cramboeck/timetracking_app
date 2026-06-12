import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { IOSSwitch } from '../IOSSwitch';
import { PushNotificationSettings } from '../PushNotificationSettings';
import { notificationService } from '../../utils/notifications';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

export const NotificationSettings = () => {
  // Notification Settings State (synced with localStorage)
  const [notifMonthEnd, setNotifMonthEnd] = useState(() =>
    localStorage.getItem('notification_month_end') !== 'false'
  );
  const [notifMissingEntries, setNotifMissingEntries] = useState(() =>
    localStorage.getItem('notification_missing_entries') !== 'false'
  );
  const [notifQualityCheck, setNotifQualityCheck] = useState(() =>
    localStorage.getItem('notification_quality_check') !== 'false'
  );
  const [notifWeeklyReport, setNotifWeeklyReport] = useState(() =>
    localStorage.getItem('notification_weekly_report') !== 'false'
  );

  // Check notification permission
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleToggleNotification = (
    key: string,
    value: boolean,
    setter: (v: boolean) => void
  ) => {
    setter(value);
    localStorage.setItem(key, value.toString());
  };

  const requestNotificationPermission = async () => {
    const permission = await notificationService.requestPermission();
    setNotificationPermission(permission ? 'granted' : 'denied');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Push Notification Permission */}
      {notificationPermission !== 'granted' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-800/30 rounded-xl">
              <BellOff size={24} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                Push-Benachrichtigungen deaktiviert
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                Aktiviere Push-Benachrichtigungen um keine wichtigen Erinnerungen zu verpassen.
              </p>
              <Button
                onClick={requestNotificationPermission}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
              >
                Benachrichtigungen aktivieren
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Push Notification Settings */}
      <PushNotificationSettings />

      {/* In-App Notifications */}
      <Card className="rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-accent-light dark:bg-accent-primary/20 rounded-xl">
            <Bell size={24} className="text-accent-primary dark:text-accent-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Benachrichtigungs-Einstellungen
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Wähle, welche Benachrichtigungen du erhalten möchtest
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <IOSSwitch
            label="Monatsende-Erinnerung"
            description="Erinnere mich am letzten Arbeitstag des Monats an die Zeiterfassung"
            checked={notifMonthEnd}
            onChange={(v) => handleToggleNotification('notification_month_end', v, setNotifMonthEnd)}
          />

          <IOSSwitch
            label="Fehlende Einträge"
            description="Benachrichtige mich bei Tagen ohne Zeiteinträge"
            checked={notifMissingEntries}
            onChange={(v) => handleToggleNotification('notification_missing_entries', v, setNotifMissingEntries)}
          />

          <IOSSwitch
            label="Qualitätsprüfung"
            description="Warne bei unvollständigen Beschreibungen oder ungewöhnlichen Zeiten"
            checked={notifQualityCheck}
            onChange={(v) => handleToggleNotification('notification_quality_check', v, setNotifQualityCheck)}
          />

          <IOSSwitch
            label="Wöchentlicher Bericht"
            description="Sende mir jeden Montag eine Zusammenfassung der Vorwoche"
            checked={notifWeeklyReport}
            onChange={(v) => handleToggleNotification('notification_weekly_report', v, setNotifWeeklyReport)}
          />
        </div>
      </Card>
    </div>
  );
};
