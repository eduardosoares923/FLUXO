import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-email': 'Formato de login inválido.',
  'auth/invalid-credential': 'Identificador ou senha incorretos.',
};

function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#e3b04b]/20 blur-[120px] mix-blend-screen animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute top-[40%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[#10b981]/10 blur-[100px] mix-blend-screen animate-[pulse_10s_ease-in-out_infinite_1s]" />
      <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-[#6366f1]/10 blur-[120px] mix-blend-screen animate-[pulse_12s_ease-in-out_infinite_2s]" />
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Preencha os campos de login e senha.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err: any) {
      console.error('Erro de login:', err);
      setError(ERROR_MESSAGES[err.code] || 'Identificador ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      <BackgroundBlobs />
      
      <form 
        className="w-full max-w-[420px] bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col animate-in fade-in zoom-in-95 duration-500" 
        onSubmit={handleSubmit}
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tighter text-[#f2f0ea] mb-2 drop-shadow-md">FLUXO</h1>
          <p className="text-[#8fa39a] text-[0.95rem]">Entre com usuário, e-mail ou CPF</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[0.8rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">Identificador</label>
            <input
              id="email"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="Ex: eduardo.silva"
              className="w-full p-3.5 rounded-xl border border-white/[0.08] bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-all placeholder:text-white/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[0.8rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">Senha</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full p-3.5 pr-12 rounded-xl border border-white/[0.08] bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-all placeholder:text-white/20"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword((v) => !v)} 
                tabIndex={-1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8fa39a] hover:text-[#e3b04b] transition-colors"
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium text-center animate-in slide-in-from-top-2">
            <i className="fa-solid fa-triangle-exclamation mr-2" />
            {error}
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading}
          className="mt-8 w-full py-4 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-extrabold text-[1.05rem] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_rgba(227,176,75,0.3)]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fa-solid fa-circle-notch fa-spin" /> Autenticando...
            </span>
          ) : 'Entrar no Fluxo'}
        </button>
      </form>
    </div>
  );
}
