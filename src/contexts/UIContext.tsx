import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Toast, ToastType, ToastAction } from '../components/Toast';
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
  // Undo-Pattern für Alltagsaktionen: Aktion sofort ausführen, Toast mit
  // „Rückgängig" statt vorherigem Bestätigungsdialog
  showUndoToast: (message: string, onUndo: () => void, duration?: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const UIContext = createContext<UIContextValue | null>(null);

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction;
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
    setToast({ visible: true, message, type, duration, action: undefined, key: toastKeyRef.current });
  }, []);

  const showUndoToast = useCallback((message: string, onUndo: () => void, duration = 6000) => {
    toastKeyRef.current += 1;
    setToast({
      visible: true,
      message,
      type: 'info',
      duration,
      action: { label: 'Rückgängig', onClick: onUndo },
      key: toastKeyRef.current,
    });
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
    <UIContext.Provider value={{ showToast, showUndoToast, confirm }}>
      {children}
      <Toast
        key={toast.key}
        message={toast.message}
        type={toast.type}
        duration={toast.duration}
        visible={toast.visible}
        action={toast.action}
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

export const useUndoToast = () => {
  const { showUndoToast } = useUI();
  return showUndoToast;
};

export const useConfirm = () => {
  const { confirm } = useUI();
  return confirm;
};
