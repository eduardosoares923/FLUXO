import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'Usuário não encontrado.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-email': 'Formato de e-mail inválido.',
  'auth/invalid-credential': 'Identificador ou senha incorretos.',
  'auth/account-pending': 'Conta aguardando aprovação',
  'auth/account-blocked': 'Esta conta está bloqueada pelo administrador.',
};

function EyeSvg({ show }: { show: boolean }) {
  if (show) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function CloseSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6L18 18" />
    </svg>
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

  // Estados de Esqueci a senha
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Estados do Cadastro ("Criar nova conta")
  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [usageType, setUsageType] = useState<'individual' | 'family'>('individual');
  const [inviteCode, setInviteCode] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot invisível

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
      setError('Informe o código de convite fornecido.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signupName.trim(),
          username: signupUsername.trim() || signupEmail.trim().split('@')[0],
          email: signupEmail.trim().toLowerCase(),
          password: signupPassword,
          usageType,
          inviteCode: usageType === 'family' ? inviteCode.trim() : '',
          website,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Serviço indisponível no momento. Tente novamente em instantes.');
      }

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Não foi possível enviar o cadastro.');
        return;
      }

      // Sem login automático
      setSignupName('');
      setSignupUsername('');
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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError('Informe um e-mail válido.');
      return;
    }
    setForgotError('');
    setForgotMsg('');
    setForgotLoading(true);
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim().toLowerCase());
      setForgotMsg('E-mail de recuperação enviado com sucesso. Verifique sua caixa de entrada.');
    } catch (err: any) {
      setForgotError(ERROR_MESSAGES[err.code] || 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-bg text-ink">
      {/* Painel Esquerdo Hero (Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 min-h-screen relative overflow-hidden bg-gradient-to-br from-[#1F5A41] to-[#2F7A57] dark:from-[#123A33] dark:to-[#1F5A4C] p-12 lg:p-16 flex-col justify-between text-white select-none">
        {/* Marca d'água W ao fundo */}
        <span
          aria-hidden="true"
          className="font-display font-bold text-[34rem] leading-none text-white/[0.04] absolute -right-16 -top-12 pointer-events-none select-none"
        >
          W
        </span>

        {/* Topo do painel: W wynd em dourado */}
        <div className="flex items-center gap-2.5 z-10">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 font-display text-2xl font-bold bg-gradient-to-br from-wordA to-wordB bg-clip-text text-transparent">
            W
          </span>
          <span className="font-display text-2xl font-bold tracking-tight bg-gradient-to-r from-wordA to-wordB bg-clip-text text-transparent">
            wynd
          </span>
        </div>

        {/* Centro: Frase e descrição */}
        <div className="max-w-[480px] z-10 py-12">
          <h1 className="font-display text-[46px] lg:text-[54px] font-bold leading-[1.08] tracking-tight text-white mb-6">
            Seu dinheiro, no seu ritmo.
          </h1>
          <p className="text-white/80 text-base lg:text-lg leading-relaxed">
            O mesmo Wynd no app e no site, com a mesma conta.
            <br />
            Contas, cartões, fixas e metas num lugar só.
          </p>
        </div>

        {/* Rodapé: Pílulas com destaques */}
        <div className="flex flex-wrap items-center gap-2.5 z-10">
          <span className="px-4 py-2 rounded-pill bg-white/10 text-white text-xs font-semibold backdrop-blur-sm">
            Contas e cartões
          </span>
          <span className="px-4 py-2 rounded-pill bg-white/10 text-white text-xs font-semibold backdrop-blur-sm">
            Fixas e assinaturas
          </span>
          <span className="px-4 py-2 rounded-pill bg-white/10 text-white text-xs font-semibold backdrop-blur-sm">
            Metas e relatórios
          </span>
        </div>
      </div>

      {/* Painel Direito (Formulário) */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-bg relative overflow-y-auto">
        <div className="w-full max-w-[420px] mx-auto py-8 animate-in fade-in duration-300">
          {/* Marca no topo exclusivo celular */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-border font-display text-2xl font-bold bg-gradient-to-br from-wordA to-wordB bg-clip-text text-transparent">
              W
            </span>
            <span className="font-display text-2xl font-bold tracking-tight bg-gradient-to-r from-wordA to-wordB bg-clip-text text-transparent">
              wynd
            </span>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="flex flex-col">
              <h2 className="font-display text-[32px] font-bold text-ink mb-1 tracking-tight">
                Entrar
              </h2>
              <p className="text-muted text-sm mb-6">
                Use seu usuário, e-mail ou CPF.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-identifier" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Usuário ou e-mail
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                    placeholder="marcos"
                    className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-password" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full min-h-[48px] pl-4 pr-12 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      onContextMenu={(e) => e.preventDefault()}
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <EyeSvg show={showPassword} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(true);
                      setForgotError('');
                      setForgotMsg('');
                      setForgotEmail(identifier.includes('@') ? identifier : '');
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className="text-xs font-semibold text-ink hover:underline"
                  >
                    Esqueci a senha
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs font-medium text-spendText mt-3 leading-relaxed animate-in fade-in">
                  {error}
                </p>
              )}

              {successMsg && (
                <p className="text-xs font-medium text-pri mt-3 leading-relaxed animate-in fade-in">
                  {successMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full min-h-[50px] mt-6 rounded-[18px] bg-pri hover:opacity-95 active:scale-[0.99] text-white dark:text-[#0A1110] font-bold text-base shadow-sm transition-all flex items-center justify-center disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="mt-8 text-center text-sm text-muted">
                <span>Ainda não tem conta? </span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessMsg('');
                    setMode('signup');
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="font-bold text-ink hover:underline"
                >
                  Criar conta
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignupSubmit} className="flex flex-col">
              <h2 className="font-display text-[32px] font-bold text-ink mb-1 tracking-tight">
                Criar conta
              </h2>
              <p className="text-muted text-sm mb-6">
                Sua conta é liberada depois que o administrador aprovar.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signup-name" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Nome
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    autoComplete="name"
                    placeholder="Marcos Junior"
                    className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signup-username" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Usuário
                  </label>
                  <input
                    id="signup-username"
                    type="text"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="marcos"
                    className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signup-email" className="text-xs font-bold text-muted uppercase tracking-wider">
                    E-mail
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="marcos@email.com"
                    className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="signup-password" className="text-xs font-bold text-muted uppercase tracking-wider">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showSignupPassword ? 'text' : 'password'}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="w-full min-h-[48px] pl-4 pr-12 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      onContextMenu={(e) => e.preventDefault()}
                      aria-label={showSignupPassword ? 'Ocultar senha' : 'Exibir senha'}
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <EyeSvg show={showSignupPassword} />
                    </button>
                  </div>
                </div>

                {/* Escolha "Só eu" ou "Com outra pessoa" (cartões de rádio próprios) */}
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider">
                    Como você vai usar
                  </span>
                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setUsageType('individual')}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`flex items-start gap-3.5 p-3.5 rounded-[18px] border text-left transition-all ${
                        usageType === 'individual'
                          ? 'border-pri bg-priSoft/20 ring-1 ring-pri text-ink'
                          : 'border-border bg-card text-muted hover:border-muted/60'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                          usageType === 'individual' ? 'border-pri' : 'border-border'
                        }`}
                      >
                        {usageType === 'individual' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-pri" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-ink leading-tight">
                          Só eu
                        </div>
                        <div className="text-xs text-muted mt-0.5 leading-snug">
                          Seus dados ficam só com você.
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUsageType('family')}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`flex items-start gap-3.5 p-3.5 rounded-[18px] border text-left transition-all ${
                        usageType === 'family'
                          ? 'border-pri bg-priSoft/20 ring-1 ring-pri text-ink'
                          : 'border-border bg-card text-muted hover:border-muted/60'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                          usageType === 'family' ? 'border-pri' : 'border-border'
                        }`}
                      >
                        {usageType === 'family' && (
                          <span className="w-2.5 h-2.5 rounded-full bg-pri" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-ink leading-tight">
                          Com outra pessoa
                        </div>
                        <div className="text-xs text-muted mt-0.5 leading-snug">
                          Entre com o código de convite que você recebeu.
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Código de convite só quando "Com outra pessoa" */}
                {usageType === 'family' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    <label htmlFor="signup-invite" className="text-xs font-bold text-muted uppercase tracking-wider">
                      Código de convite
                    </label>
                    <input
                      id="signup-invite"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="K7M2QX9A"
                      className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors uppercase tracking-wider font-mono text-sm"
                    />
                  </div>
                )}

                {/* Honeypot invisível contra robôs */}
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
                <p className="text-xs font-medium text-spendText mt-3 leading-relaxed animate-in fade-in">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full min-h-[50px] mt-6 rounded-[18px] bg-pri hover:opacity-95 active:scale-[0.99] text-white dark:text-[#0A1110] font-bold text-base shadow-sm transition-all flex items-center justify-center disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Criar conta'}
              </button>

              <div className="mt-8 text-center text-sm text-muted">
                <span>Já tem conta? </span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('login');
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="font-bold text-ink hover:underline"
                >
                  Entrar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modal Esqueci a senha (Radix Dialog) */}
      <Dialog.Root open={forgotOpen} onOpenChange={setForgotOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-[440px] mx-auto z-50 rounded-[28px] bg-card border border-border p-6 shadow-2xl focus:outline-none text-ink"
          >
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="font-display text-xl font-bold text-ink">
                Recuperar senha
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="w-9 h-9 rounded-full bg-neutral text-ink flex items-center justify-center hover:bg-neutral/80 transition-colors"
                >
                  <CloseSvg />
                </button>
              </Dialog.Close>
            </div>

            <p className="text-xs text-muted mb-4 leading-relaxed">
              Informe seu e-mail cadastrado para receber as instruções de recuperação de senha.
            </p>

            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="forgot-email" className="text-xs font-bold text-muted uppercase tracking-wider">
                  E-mail
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full min-h-[48px] px-4 rounded-[18px] border border-border bg-card text-ink placeholder:text-muted/50 focus:border-pri focus:outline-none transition-colors text-sm"
                />
              </div>

              {forgotError && (
                <p className="text-xs font-medium text-spendText leading-relaxed">
                  {forgotError}
                </p>
              )}

              {forgotMsg && (
                <p className="text-xs font-medium text-pri leading-relaxed">
                  {forgotMsg}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  onContextMenu={(e) => e.preventDefault()}
                  className="px-4 min-h-[44px] rounded-pill bg-neutral text-ink text-xs font-bold hover:bg-neutral/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  onContextMenu={(e) => e.preventDefault()}
                  className="px-5 min-h-[44px] rounded-pill bg-pri text-white dark:text-[#0A1110] text-xs font-bold hover:opacity-95 transition-all disabled:opacity-50"
                >
                  {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
