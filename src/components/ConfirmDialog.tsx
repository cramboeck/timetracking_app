import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { Button } from './ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Bestätigen',
  cancelText = 'Abbrechen',
  variant = 'warning'
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const iconConfig = {
    danger: {
      icon: <AlertCircle className="text-red-500" size={24} />,
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
    warning: {
      icon: <AlertTriangle className="text-yellow-500" size={24} />,
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    info: {
      icon: <Info className="text-accent-primary" size={24} />,
      bg: 'bg-accent-light dark:bg-accent-primary/10',
    },
  };

  const { icon, bg } = iconConfig[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 p-2 rounded-lg ${bg}`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {message}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                onClick={onClose}
                variant="secondary"
              >
                {cancelText}
              </Button>
              <Button
                onClick={handleConfirm}
                variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'primary'}
              >
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
