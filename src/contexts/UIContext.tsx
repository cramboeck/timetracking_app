import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Toast, ToastType } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
};

type UIContextValue = {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const UIContext = createContext<UIContextValue | null>(null);

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
  duration: number;
  // bump to force re-mount and restart timer if the same message is shown again
  key: number;
};

type ConfirmState = ConfirmOptions & {
  isOpen: boolean;
  resolve: ((result: boolean) => void) | null;
};

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'success',
    duration: 3000,
    key: 0,
  });

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
  });

  const toastKeyRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3000) => {
    toastKeyRef.current += 1;
    setToast({ visible: true, message, type, duration, key: toastKeyRef.current });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setConfirmState({ ...options, isOpen: true, resolve });
    });
  }, []);

  const handleConfirmClose = useCallback(() => {
    setConfirmState(prev => {
      prev.resolve?.(false);
      return { ...prev, isOpen: false, resolve: null };
    });
  }, []);

  const handleConfirmConfirm = useCallback(() => {
    setConfirmState(prev => {
      prev.resolve?.(true);
      return { ...prev, isOpen: false, resolve: null };
    });
  }, []);

  return (
    <UIContext.Provider value={{ showToast, confirm }}>
      {children}
      <Toast
        key={toast.key}
        message={toast.message}
        type={toast.type}
        duration={toast.duration}
        visible={toast.visible}
        onClose={hideToast}
      />
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={handleConfirmClose}
        onConfirm={handleConfirmConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
      />
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextValue => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
};

export const useToast = () => {
  const { showToast } = useUI();
  return showToast;
};

export const useConfirm = () => {
  const { confirm } = useUI();
  return confirm;
};
