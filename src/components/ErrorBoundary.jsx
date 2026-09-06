import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary ${this.props.name || 'Geral'}] Erro capturado:`, error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error,
            resetErrorBoundary: this.handleReset,
          });
        }
        return this.props.fallback;
      }

      return (
        <div
          className="error-boundary-container"
          style={{
            padding: '2rem',
            maxWidth: '600px',
            margin: '2rem auto',
            textAlign: 'center',
            background: '#1e293b',
            borderRadius: '12px',
            border: '1px solid #334155',
            color: '#f8fafc',
          }}
        >
          <div style={{ fontSize: '3rem', color: '#ef4444', marginBottom: '1rem' }}>
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            {this.props.title || 'Algo deu errado nesta seção'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Ocorreu uma falha inesperada ao processar este módulo. As demais áreas do sistema continuam funcionando normalmente.
          </p>
          {this.state.error && (
            <div
              style={{
                background: '#0f172a',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#f87171',
                textAlign: 'left',
                marginBottom: '1.5rem',
                overflowX: 'auto',
                maxHeight: '120px',
                fontFamily: 'monospace',
              }}
            >
              {this.state.error.toString()}
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-primary"
              style={{
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 500,
              }}
            >
              <i className="fa-solid fa-rotate-right" style={{ marginRight: '6px' }} /> Tentar novamente
            </button>
            <a
              href="/"
              className="btn btn-secondary"
              style={{
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
                background: '#334155',
                color: '#f8fafc',
                textDecoration: 'none',
                borderRadius: '6px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <i className="fa-solid fa-house" style={{ marginRight: '6px' }} /> Ir para o Início
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
