import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 3500) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
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
  success: (msg, duration) => useToastStore.getState().addToast(msg, 'success', duration),
  error: (msg, duration) => useToastStore.getState().addToast(msg, 'error', duration),
  info: (msg, duration) => useToastStore.getState().addToast(msg, 'info', duration),
  warning: (msg, duration) => useToastStore.getState().addToast(msg, 'warning', duration),
};
