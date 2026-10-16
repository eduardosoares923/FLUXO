import React from 'react';
import { useToastStore, ToastItem } from '../../stores/useToastStore';

function ToastIcon({ type }: { type: ToastItem['type'] }) {
  if (type === 'success') {
    return (
      <div className="w-10 h-10 rounded-full bg-priSoft text-priInk flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
    );
  }
  if (type === 'error' || type === 'warning') {
    return (
      <div className="w-10 h-10 rounded-full bg-spendSoft text-spendText flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-neutral text-ink flex items-center justify-center shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    </div>
  );
}

export function Toast() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-[380px] z-[99999] flex flex-col gap-2.5 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-[24px] bg-card border border-border text-ink shadow-xl transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">
            <ToastIcon type={t.type} />
            <div className="min-w-0">
              {t.title && (
                <div className="font-bold text-sm text-ink leading-tight">
                  {t.title}
                </div>
              )}
              <div className="text-xs text-muted leading-snug break-words">
                {t.message}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  removeToast(t.id);
                }}
                className="px-3 min-h-[36px] rounded-pill bg-priSoft text-priInk text-xs font-bold hover:opacity-90 transition-opacity"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Fechar aviso"
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => removeToast(t.id)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-neutral transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Toast;
