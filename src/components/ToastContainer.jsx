import React from 'react';
import { useToastStore } from '../stores/useToastStore';

const toastStyles = {
  success: {
    bg: '#064e3b',
    border: '#059669',
    icon: 'fa-circle-check',
    color: '#a7f3d0',
  },
  error: {
    bg: '#7f1d1d',
    border: '#dc2626',
    icon: 'fa-circle-xmark',
    color: '#fecaca',
  },
  warning: {
    bg: '#78350f',
    border: '#d97706',
    icon: 'fa-triangle-exclamation',
    color: '#fde68a',
  },
  info: {
    bg: '#1e3a8a',
    border: '#2563eb',
    icon: 'fa-circle-info',
    color: '#bfdbfe',
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '380px',
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const style = toastStyles[t.type] || toastStyles.info;
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: style.bg,
              border: `1px solid ${style.border}`,
              color: '#f8fafc',
              fontSize: '0.9rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className={`fa-solid ${style.icon}`} style={{ color: style.color, fontSize: '1.1rem' }} />
              <span style={{ lineHeight: 1.4 }}>{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
              }}
              title="Fechar"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
export default ToastContainer;
