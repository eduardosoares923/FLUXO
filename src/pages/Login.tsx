import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-email': 'Formato de login inválido.',
  'auth/invalid-credential': 'Identificador ou senha incorretos.',
  'auth/account-pending': 'Conta aguardando aprovação',
  'auth/account-blocked': 'Esta conta está bloqueada. Procure o administrador.',
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
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Estados do Login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados do Cadastro ("Criar nova conta")
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [usageType, setUsageType] = useState<'individual' | 'family'>('individual');
  const [inviteCode, setInviteCode] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot invisível contra robôs

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Preencha os campos de login e senha.');
      return;
    }
    setError('');
    setSuccessMsg('');
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

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (signupName.trim().length < 2) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (signupPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (usageType === 'family' && inviteCode.trim().length < 4) {
      setError('Informe o código de convite fornecido pelo responsável.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName.trim(),
          email: signupEmail.trim().toLowerCase(),
          password: signupPassword,
          usageType,
          inviteCode: usageType === 'family' ? inviteCode.trim() : '',
          website,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Serviço de cadastro indisponível no momento. Tente novamente em instantes.');
      }

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Não foi possível enviar o cadastro.');
        return;
      }

      // Não faz login automático: limpa os campos, volta para a tela de login e mostra o aviso
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      setInviteCode('');
      setWebsite('');
      setMode('login');
      setSuccessMsg('Cadastro enviado, aguarde a aprovação do administrador');
    } catch (err: any) {
      console.error('Erro no cadastro:', err);
      setError(err.message || 'Erro ao enviar cadastro.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      <BackgroundBlobs />

      {mode === 'login' ? (
        <form
          className="w-full max-w-[420px] bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col animate-in fade-in zoom-in-95 duration-500"
          onSubmit={handleLoginSubmit}
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl font-black tracking-tighter text-[#f2f0ea] mb-2 drop-shadow-md">Wynd</h1>
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

          {successMsg && (
            <div className="mt-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium text-center animate-in slide-in-from-top-2">
              <i className="fa-solid fa-circle-check mr-2" />
              {successMsg}
            </div>
          )}

          {error && (
            <div className={`mt-6 p-3 rounded-lg border text-sm font-medium text-center animate-in slide-in-from-top-2 ${error === 'Conta aguardando aprovação' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <i className={`fa-solid ${error === 'Conta aguardando aprovação' ? 'fa-clock' : 'fa-triangle-exclamation'} mr-2`} />
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
            ) : 'Entrar no Wynd'}
          </button>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setError('');
                setSuccessMsg('');
                setMode('signup');
              }}
              className="text-xs font-medium text-[#8fa39a] hover:text-[#e3b04b] transition-colors"
            >
              Criar nova conta
            </button>
          </div>
        </form>
      ) : (
        <form
          className="w-full max-w-[440px] bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col animate-in fade-in zoom-in-95 duration-500"
          onSubmit={handleSignupSubmit}
        >
          <div className="text-center mb-7">
            <h1 className="text-3xl font-black tracking-tighter text-[#f2f0ea] mb-1.5 drop-shadow-md">Criar nova conta</h1>
            <p className="text-[#8fa39a] text-sm">Preencha seus dados para solicitar acesso ao Wynd</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.75rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">Tipo de uso</span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/30 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setUsageType('individual')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${usageType === 'individual' ? 'bg-[#e3b04b] text-[#1c1206] shadow' : 'text-[#8fa39a] hover:text-white'}`}
                >
                  Uso individual
                </button>
                <button
                  type="button"
                  onClick={() => setUsageType('family')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${usageType === 'family' ? 'bg-[#e3b04b] text-[#1c1206] shadow' : 'text-[#8fa39a] hover:text-white'}`}
                >
                  Entrar em uma família
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-name" className="text-[0.8rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">Nome</label>
              <input
                id="signup-name"
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                autoComplete="name"
                placeholder="Ex: Maria Silva"
                className="w-full p-3.5 rounded-xl border border-white/[0.08] bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-all placeholder:text-white/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-email" className="text-[0.8rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">E-mail</label>
              <input
                id="signup-email"
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                autoComplete="email"
                placeholder="voce@exemplo.com"
                className="w-full p-3.5 rounded-xl border border-white/[0.08] bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-all placeholder:text-white/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-password" className="text-[0.8rem] font-bold text-[#8fa39a] uppercase tracking-wider ml-1">Senha</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo de 6 caracteres"
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

            {usageType === 'family' && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <label htmlFor="signup-invite" className="text-[0.8rem] font-bold text-[#e3b04b] uppercase tracking-wider ml-1">Código de convite da família</label>
                <input
                  id="signup-invite"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Ex: A1B2C3D4"
                  className="w-full p-3.5 rounded-xl border border-[#e3b04b]/30 bg-black/20 text-[#f2f0ea] focus:border-[#e3b04b] focus:bg-black/40 outline-none transition-all placeholder:text-white/20 uppercase tracking-wider font-mono"
                />
                <span className="text-[11px] text-[#8fa39a] ml-1">
                  Peça o código de convite de 8 caracteres ao administrador da família.
                </span>
              </div>
            )}

            {/* Honeypot invisível para barrar robôs */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor="signup-website">Website</label>
              <input
                id="signup-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="mt-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium text-center animate-in slide-in-from-top-2">
              <i className="fa-solid fa-triangle-exclamation mr-2" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full py-4 rounded-xl bg-gradient-to-r from-[#e3b04b] to-[#f5d78a] text-[#1c1206] font-extrabold text-[1.05rem] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_rgba(227,176,75,0.3)]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch fa-spin" /> Enviando...
              </span>
            ) : 'Solicitar Cadastro'}
          </button>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setError('');
                setMode('login');
              }}
              className="text-xs font-medium text-[#8fa39a] hover:text-white transition-colors"
            >
              Já tem uma conta? Voltar para o login
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
