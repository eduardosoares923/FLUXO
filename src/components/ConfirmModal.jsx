import React from 'react';

export function ConfirmModal({
  isOpen,
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '420px',
          padding: '1.75rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isDestructive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            color: isDestructive ? '#ef4444' : '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.3rem',
            margin: '0 auto 1rem auto',
          }}
        >
          <i className={`fa-solid ${isDestructive ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
        </div>

        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#f8fafc' }}>{title}</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {message}
        </p>

        <div className="modal-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            style={{ padding: '0.5rem 1.25rem' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1.25rem',
              background: isDestructive ? '#dc2626' : '#2563eb',
              borderColor: isDestructive ? '#dc2626' : '#2563eb',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
export default ConfirmModal;
