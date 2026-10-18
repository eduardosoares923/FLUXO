import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/versions';
import { toast } from '../stores/useToastStore';

function DocSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

export function TermsGate() {
  const { session, logout, refreshSession } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!session) return null;

  const needsConsent =
    session.termsVersion !== TERMS_VERSION ||
    session.privacyVersion !== PRIVACY_VERSION;

  if (!needsConsent) return null;

  const handleAccept = async () => {
    if (!accepted || submitting) return;
    const fbUser = auth.currentUser;
    if (!fbUser) {
      toast.error('Sua sessão expirou. Entre novamente.');
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await fbUser.getIdToken();
      const response = await fetch('/api/accept-terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          acceptedTerms: true,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(
          data?.error || 'Não foi possível registrar o aceite dos termos.'
        );
        return;
      }

      await refreshSession();
      toast.success('Termos aceitos com sucesso.');
    } catch {
      toast.error('Erro de conexão ao registrar o aceite dos termos.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/65 backdrop-blur-xs" />
        <Dialog.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100vw-24px)] max-w-[440px] max-h-[92vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-card border border-border p-6 sm:p-7 text-ink shadow-2xl focus:outline-none space-y-5"
        >
          <div className="w-11 h-11 rounded-full bg-priSoft text-priInk flex items-center justify-center">
            <DocSvg className="w-5 h-5" />
          </div>

          <div className="space-y-1.5">
            <Dialog.Title className="font-display text-2xl font-bold text-ink tracking-tight">
              Atualizamos nossos termos
            </Dialog.Title>
            <Dialog.Description className="text-xs sm:text-sm text-muted leading-relaxed">
              Para continuar usando o Wynd, leia e aceite a versão{' '}
              {TERMS_VERSION} dos nossos Termos de Uso e da Política de
              Privacidade.
            </Dialog.Description>
          </div>

          <div className="space-y-2.5">
            <Link
              to="/termos"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-[18px] bg-bg border border-border px-4 py-3.5 flex items-center justify-between gap-3 hover:border-pri transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <DocSvg className="w-4 h-4 text-priInk shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-xs sm:text-sm text-ink">
                    Termos de uso
                  </div>
                  <div className="text-[11px] text-muted">
                    Versão {TERMS_VERSION}
                  </div>
                </div>
              </div>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 text-muted shrink-0"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>

            <Link
              to="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-[18px] bg-bg border border-border px-4 py-3.5 flex items-center justify-between gap-3 hover:border-pri transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <DocSvg className="w-4 h-4 text-priInk shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-xs sm:text-sm text-ink">
                    Política de privacidade
                  </div>
                  <div className="text-[11px] text-muted">
                    Versão {PRIVACY_VERSION}
                  </div>
                </div>
              </div>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 text-muted shrink-0"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="sr-only peer"
            />
            <span
              className={`w-5 h-5 rounded-md border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                accepted
                  ? 'bg-pri border-pri text-white'
                  : 'bg-card border-border text-transparent'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span className="text-xs text-ink/90 leading-relaxed">
              Li e concordo com os{' '}
              <Link
                to="/termos"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-priInk hover:underline"
              >
                Termos de Uso
              </Link>{' '}
              e com a{' '}
              <Link
                to="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-priInk hover:underline"
              >
                Política de Privacidade
              </Link>{' '}
              do Wynd, e declaro ter 18 anos ou mais.
            </span>
          </label>

          <button
            type="button"
            disabled={!accepted || submitting}
            onClick={handleAccept}
            className="w-full min-h-[48px] rounded-pill bg-fab text-fabIcon font-bold text-sm hover:opacity-95 transition-all disabled:opacity-40"
          >
            {submitting ? 'Salvando...' : 'Continuar'}
          </button>

          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={() => logout()}
              className="font-bold text-muted hover:text-ink transition-colors"
            >
              Sair da conta
            </button>
            <Link
              to="/excluir-conta"
              className="font-bold text-priInk hover:underline"
            >
              Quero excluir minha conta
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
