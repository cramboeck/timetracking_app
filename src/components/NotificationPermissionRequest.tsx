import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { notificationService } from '../utils/notifications';

interface NotificationPermissionRequestProps {
  onClose: () => void;
}

export const NotificationPermissionRequest = ({ onClose }: NotificationPermissionRequestProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we should show the permission request
    const shouldShow = () => {
      // Don't show if notifications are not supported
      if (!notificationService.isSupported()) {
        return false;
      }

      // Don't show if user already granted or denied permission
      if (notificationService.hasPermission() || Notification.permission === 'denied') {
        return false;
      }

      // Check if we've already asked (and user closed without deciding)
      const hasAsked = localStorage.getItem('notification_permission_asked');
      if (hasAsked) {
        const askedTime = parseInt(hasAsked, 10);
        const daysSinceAsked = (Date.now() - askedTime) / (1000 * 60 * 60 * 24);
        // Ask again after 7 days
        if (daysSinceAsked < 7) {
          return false;
        }
      }

      return true;
    };

    if (shouldShow()) {
      setIsVisible(true);
    }
  }, []);

  const handleEnable = async () => {
    const granted = await notificationService.requestPermission();

    if (granted) {
      // Show a test notification
      await notificationService.show({
        title: '🎉 Benachrichtigungen aktiviert!',
        body: 'Du wirst jetzt über wichtige Ereignisse informiert.',
        tag: 'welcome',
      });
    }

    localStorage.setItem('notification_permission_asked', Date.now().toString());
    setIsVisible(false);
    onClose();
  };

  const handleLater = () => {
    localStorage.setItem('notification_permission_asked', Date.now().toString());
    setIsVisible(false);
    onClose();
  };

  const handleNever = () => {
    localStorage.setItem('notification_permission_asked', Date.now().toString());
    localStorage.setItem('notification_permission_never', 'true');
    setIsVisible(false);
    onClose();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-accent-primary to-accent-primary/80 p-6 text-white relative">
          <button
            onClick={handleNever}
            className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
              <Bell size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Benachrichtigungen</h2>
              <p className="text-white/90 text-sm mt-1">Verpasse nichts Wichtiges!</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 dark:text-dark-300 mb-4">
            Aktiviere Benachrichtigungen, um rechtzeitig an wichtige Ereignisse erinnert zu werden:
          </p>

          <ul className="space-y-3 mb-6">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent-light dark:bg-accent-lighter/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-accent-primary text-sm">📅</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Monatsende</p>
                <p className="text-sm text-gray-600 dark:text-dark-400">
                  3 Tage vor Monatsende für deine Reports
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent-light dark:bg-accent-lighter/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-accent-primary text-sm">⏰</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Tägliche Erinnerung</p>
                <p className="text-sm text-gray-600 dark:text-dark-400">
                  Falls du vergessen hast, Zeiten einzutragen
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent-light dark:bg-accent-lighter/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-accent-primary text-sm">✍️</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Qualitätsprüfung</p>
                <p className="text-sm text-gray-600 dark:text-dark-400">
                  Bei fehlenden Beschreibungen
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent-light dark:bg-accent-lighter/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-accent-primary text-sm">📊</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Wochenreport</p>
                <p className="text-sm text-gray-600 dark:text-dark-400">
                  Jeden Freitag eine Zusammenfassung
                </p>
              </div>
            </li>
          </ul>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleEnable}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 btn-accent font-semibold"
            >
              <Bell size={20} />
              Benachrichtigungen aktivieren
            </button>
            <button
              onClick={handleLater}
              className="w-full px-6 py-3 text-gray-700 dark:text-dark-300 bg-gray-100 dark:bg-dark-200 hover:bg-gray-200 dark:hover:bg-dark-300 rounded-lg font-medium transition-colors"
            >
              Später entscheiden
            </button>
            <button
              onClick={handleNever}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-300 transition-colors"
            >
              Nicht mehr anzeigen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
