import { useEffect, useState } from 'react';
import { Check, X, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
  visible: boolean;
  action?: ToastAction;
}

const toastConfig = {
  success: {
    icon: Check,
    bgColor: 'bg-green-500',
    textColor: 'text-white',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-500',
    textColor: 'text-white',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-orange-500',
    textColor: 'text-white',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-500',
    textColor: 'text-white',
  },
};

export const Toast = ({
  message,
  type = 'success',
  duration = 3000,
  onClose,
  visible,
  action,
}: ToastProps) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(onClose, 300); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose]);

  if (!visible && !isAnimating) return null;

  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={`
        fixed bottom-24 left-1/2 -translate-x-1/2 z-[100]
        flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg
        ${config.bgColor} ${config.textColor}
        transition-all duration-300 ease-out
        ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="font-medium">{message}</span>
      {action && (
        <button
          onClick={() => {
            action.onClick();
            setIsAnimating(false);
            setTimeout(onClose, 300);
          }}
          className="ml-1 px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-semibold text-sm whitespace-nowrap transition-colors"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => {
          setIsAnimating(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};

// Hook for easy toast management
export const useToast = () => {
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: ToastType;
  }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  return { toast, showToast, hideToast };
};
