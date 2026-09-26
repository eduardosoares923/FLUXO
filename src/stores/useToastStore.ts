import { create } from 'zustand';

interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' | 'warning'; action?: { label: string; onClick: () => void }; }
interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], duration?: number, action?: Toast['action']) => string;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 3500, action) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, type, action }] }));
    if (duration > 0) setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), duration);
    return id;
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string, dur?: number) => useToastStore.getState().addToast(msg, 'success', dur),
  error: (msg: string, dur?: number) => useToastStore.getState().addToast(msg, 'error', dur),
  info: (msg: string, dur?: number) => useToastStore.getState().addToast(msg, 'info', dur),
  warning: (msg: string, dur?: number) => useToastStore.getState().addToast(msg, 'warning', dur),
  action: (msg: string, actionLabel: string, onAction: () => void, dur = 5000) =>
    useToastStore.getState().addToast(msg, 'info', dur, { label: actionLabel, onClick: onAction }),
};

