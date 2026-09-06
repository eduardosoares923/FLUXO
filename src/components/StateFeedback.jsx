import React from 'react';

export function PageLoading({ message = 'Carregando dados...' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '260px',
        padding: '2.5rem',
        color: '#94a3b8',
        gap: '1rem',
      }}
    >
      <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#3b82f6' }} />
      <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{message}</span>
    </div>
  );
}

export function PageError({
  title = 'Falha ao sincronizar dados',
  error,
  onRetry,
}) {
  const errorMessage = error?.message || (typeof error === 'string' ? error : 'Não foi possível carregar os registros.');

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '550px',
        margin: '2rem auto',
        textAlign: 'center',
        background: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #ef444455',
        color: '#f8fafc',
      }}
    >
      <div style={{ fontSize: '2.5rem', color: '#ef4444', marginBottom: '0.75rem' }}>
        <i className="fa-solid fa-cloud-bolt" />
      </div>
      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {errorMessage}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-primary"
          style={{
            padding: '0.5rem 1.2rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <i className="fa-solid fa-rotate-right" style={{ marginRight: '6px' }} /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon = 'fa-inbox',
  title = 'Nenhum registro encontrado',
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#94a3b8',
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        border: '1px dashed #334155',
        margin: '1.5rem 0',
      }}
    >
      <div style={{ fontSize: '2.5rem', color: '#64748b', marginBottom: '0.75rem' }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <h4 style={{ fontSize: '1.1rem', color: '#f1f5f9', marginBottom: '0.25rem', fontWeight: 600 }}>
        {title}
      </h4>
      {description && (
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', maxWidth: '400px', marginBottom: '1.25rem' }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn btn-primary"
          style={{
            marginTop: description ? '0' : '1rem',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          <i className="fa-solid fa-plus" style={{ marginRight: '6px' }} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
