import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ERROR_MESSAGES = {
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-email': 'Formato de login inválido.',
  'auth/invalid-credential': 'Identificador ou senha incorretos.',
};

function BackgroundBlobs() {
  return (
    <div className="bg-blobs" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Preencha os campos de login e senha.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err) {
      console.error('Erro de login:', err);
      setError(ERROR_MESSAGES[err.code] || 'Identificador ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <BackgroundBlobs />
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>FLUXO</h1>
        <p className="login-subtitle">Entre com usuário, e-mail ou CPF</p>

        <label htmlFor="email">Usuário / E-mail / CPF</label>
        <input
          id="email"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
        />

        <label htmlFor="password">Senha</label>
        <div className="password-field">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
            <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
