import { create } from 'zustand';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (
    message: string,
    type?: ToastItem['type'],
    duration?: number,
    action?: ToastItem['action'],
    title?: string
  ) => string;
  removeToast: (id: string) => void;
}

const DEFAULT_TITLES: Record<ToastItem['type'], string> = {
  success: 'Pronto',
  error: 'Atenção',
  warning: 'Aviso',
  info: 'Informação',
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 4000, action, title) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const resolvedTitle = title || DEFAULT_TITLES[type];
    set((state) => ({
      toasts: [...state.toasts, { id, title: resolvedTitle, message, type, action }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string, dur = 4000) =>
    useToastStore.getState().addToast(msg, 'success', dur),
  error: (msg: string, dur = 4000) =>
    useToastStore.getState().addToast(msg, 'error', dur),
  info: (msg: string, dur = 4000) =>
    useToastStore.getState().addToast(msg, 'info', dur),
  warning: (msg: string, dur = 4000) =>
    useToastStore.getState().addToast(msg, 'warning', dur),
  action: (msg: string, actionLabel: string, onAction: () => void, dur = 4000) =>
    useToastStore
      .getState()
      .addToast(msg, 'info', dur, { label: actionLabel, onClick: onAction }),
};
