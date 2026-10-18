import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SUPPORT_EMAIL } from '../config/app';
import { TERMS_MARKDOWN } from '../legal/terms';
import { PRIVACY_MARKDOWN } from '../legal/privacy';
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/versions';
import { LegalMarkdown, extractLegalSections } from '../components/LegalMarkdown';

function LegalShell({
  activeTab,
  children,
}: {
  activeTab: 'termos' | 'privacidade' | 'excluir';
  children: React.ReactNode;
}) {
  const { session } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      {/* Top Navbar */}
      <header className="w-full border-b border-border bg-bg/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            to={session ? '/' : '/login'}
            className="flex items-baseline gap-[8px] select-none"
          >
            <span className="font-display text-[24px] font-bold leading-none bg-gradient-to-br from-wordA to-wordB bg-clip-text text-transparent">
              W
            </span>
            <span className="font-display text-xl font-bold leading-none tracking-tight bg-gradient-to-r from-wordA to-wordB bg-clip-text text-transparent">
              wynd
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            {session ? (
              <Link
                to="/"
                className="px-4 min-h-[38px] rounded-pill bg-fab text-fabIcon text-xs font-bold inline-flex items-center justify-center hover:opacity-95 transition-opacity"
              >
                Voltar ao app
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 min-h-[38px] rounded-pill bg-card border border-border text-ink text-xs font-bold inline-flex items-center justify-center hover:bg-neutral transition-colors"
                >
                  Entrar
                </Link>
                <Link
                  to="/login?mode=signup"
                  className="px-4 min-h-[38px] rounded-pill bg-fab text-fabIcon text-xs font-bold inline-flex items-center justify-center hover:opacity-95 transition-opacity"
                >
                  Criar conta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Segmented Nav */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1.5 rounded-pill bg-seg border border-border/60 mb-7">
          <Link
            to="/termos"
            className={`px-4 min-h-[36px] rounded-pill text-xs font-bold inline-flex items-center justify-center transition-all ${
              activeTab === 'termos'
                ? 'bg-segOn text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Termos de uso
          </Link>
          <Link
            to="/privacidade"
            className={`px-4 min-h-[36px] rounded-pill text-xs font-bold inline-flex items-center justify-center transition-all ${
              activeTab === 'privacidade'
                ? 'bg-segOn text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Política de privacidade
          </Link>
          <Link
            to="/excluir-conta"
            className={`px-4 min-h-[36px] rounded-pill text-xs font-bold inline-flex items-center justify-center transition-all ${
              activeTab === 'excluir'
                ? 'bg-segOn text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            Excluir conta
          </Link>
        </div>

        {children}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border mt-12">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-3">
            <span className="font-bold text-ink">Wynd</span>
            <span>Feito em Gravataí, RS</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/termos" className="hover:text-ink transition-colors">
              Termos de uso
            </Link>
            <Link to="/privacidade" className="hover:text-ink transition-colors">
              Política de privacidade
            </Link>
            <Link to="/excluir-conta" className="hover:text-ink transition-colors">
              Excluir conta
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-bold text-priInk hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function TermsPage() {
  const sections = useMemo(() => extractLegalSections(TERMS_MARKDOWN), []);
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.id || 'secao-1'
  );

  const handleSelectSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <LegalShell activeTab="termos">
      <div className="mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Termos de uso
          </h1>
          <span className="px-3 py-1 rounded-pill bg-priSoft text-priInk text-xs font-bold">
            Versão {TERMS_VERSION}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-muted mt-2">
          Em vigor desde{' '}
          <span className="px-2 py-0.5 rounded-md bg-priSoft text-priInk font-bold text-xs">
            data
          </span>
          . Última atualização em{' '}
          <span className="px-2 py-0.5 rounded-md bg-priSoft text-priInk font-bold text-xs">
            data
          </span>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {sections.length > 0 && (
          <aside className="lg:col-span-4 xl:col-span-3 rounded-[24px] bg-card border border-border p-4 shadow-xs lg:sticky lg:top-24">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted px-2.5 mb-2">
              Nesta página
            </div>
            <nav className="space-y-1">
              {sections.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSelectSection(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-[14px] text-xs flex items-start gap-2.5 transition-colors ${
                      isActive
                        ? 'bg-priSoft text-priInk font-bold'
                        : 'text-ink/80 hover:bg-neutral font-medium'
                    }`}
                  >
                    <span className="font-bold shrink-0 w-4">{sec.number}</span>
                    <span className="leading-snug">{sec.title}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <div
          className={`${
            sections.length > 0 ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'
          } rounded-[24px] bg-card border border-border p-6 sm:p-8 shadow-xs`}
        >
          <LegalMarkdown markdown={TERMS_MARKDOWN} />
        </div>
      </div>
    </LegalShell>
  );
}

export function PrivacyPage() {
  const sections = useMemo(() => extractLegalSections(PRIVACY_MARKDOWN), []);
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.id || 'secao-1'
  );

  const handleSelectSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <LegalShell activeTab="privacidade">
      <div className="mb-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Política de privacidade
          </h1>
          <span className="px-3 py-1 rounded-pill bg-priSoft text-priInk text-xs font-bold">
            Versão {PRIVACY_VERSION}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-muted mt-2">
          Em vigor desde{' '}
          <span className="px-2 py-0.5 rounded-md bg-priSoft text-priInk font-bold text-xs">
            data
          </span>
          . Dúvidas ou pedidos:{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-ink hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {sections.length > 0 && (
          <aside className="lg:col-span-4 xl:col-span-3 rounded-[24px] bg-card border border-border p-4 shadow-xs lg:sticky lg:top-24">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted px-2.5 mb-2">
              Nesta página
            </div>
            <nav className="space-y-1">
              {sections.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSelectSection(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-[14px] text-xs flex items-start gap-2.5 transition-colors ${
                      isActive
                        ? 'bg-priSoft text-priInk font-bold'
                        : 'text-ink/80 hover:bg-neutral font-medium'
                    }`}
                  >
                    <span className="font-bold shrink-0 w-4">{sec.number}</span>
                    <span className="leading-snug">{sec.title}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <div
          className={`${
            sections.length > 0 ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'
          } rounded-[24px] bg-card border border-border p-6 sm:p-8 shadow-xs`}
        >
          <LegalMarkdown markdown={PRIVACY_MARKDOWN} />
        </div>
      </div>
    </LegalShell>
  );
}

export function DeleteAccountPublicPage() {
  const location = useLocation();
  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent('Solicitação de Exclusão de Conta');
    const body = encodeURIComponent(
      'Olá equipe Wynd,\n\nSolicito a exclusão completa da minha conta e dos meus dados vinculados a este e-mail.\n'
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }, []);

  void location;

  return (
    <LegalShell activeTab="excluir">
      <div className="max-w-[820px] space-y-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Exclusão de Conta e Dados
          </h1>
          <p className="text-sm sm:text-base text-muted mt-2 leading-relaxed max-w-[640px]">
            Você pode apagar sua conta do Wynd e todos os seus dados financeiros
            quando quiser, de graça, sem precisar do app instalado.
          </p>
        </div>

        {/* Warning Banner */}
        <div className="rounded-[18px] bg-spendSoft text-spendText px-4 py-3.5 text-xs sm:text-sm font-bold flex items-center gap-2.5">
          <span aria-hidden="true" className="text-base leading-none font-bold">
            !
          </span>
          <span>
            A exclusão é definitiva e não tem como desfazer. Exporte seus dados
            antes, em Configurações.
          </span>
        </div>

        {/* Two Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Option 1 */}
          <div className="rounded-[24px] bg-card border border-border p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">
                  Opção 1: pelo site ou pelo app
                </h2>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  É imediato e gratuito. Você precisa entrar na conta.
                </p>
              </div>

              <ol className="space-y-3 text-xs sm:text-sm text-ink">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-priSoft text-priInk font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>Entre na sua conta.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-priSoft text-priInk font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Abra <strong>Configurações</strong> e vá em{' '}
                    <strong>Excluir minha conta</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-priSoft text-priInk font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Toque em <strong>Excluir minha conta</strong> e confirme
                    digitando EXCLUIR.
                  </span>
                </li>
              </ol>
            </div>

            <div>
              <Link
                to="/login?redirect=/settings"
                className="px-5 min-h-[46px] rounded-pill bg-fab text-fabIcon font-bold text-xs sm:text-sm inline-flex items-center justify-center hover:opacity-95 transition-opacity"
              >
                Fazer login e ir para Exclusão de Conta
              </Link>
            </div>
          </div>

          {/* Option 2 */}
          <div className="rounded-[24px] bg-card border border-border p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">
                  Opção 2: por e-mail
                </h2>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Se não consegue entrar, escreva do e-mail cadastrado no Wynd.
                  Fazemos a exclusão completa em até 15 dias.
                </p>
              </div>

              <a
                href={mailtoHref}
                className="rounded-[18px] bg-bg border border-border p-4 flex items-center gap-3.5 hover:border-pri transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-priSoft text-priInk flex items-center justify-center shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-ink truncate">
                    {SUPPORT_EMAIL}
                  </div>
                  <div className="text-xs text-muted truncate">
                    Assunto: Solicitação de Exclusão de Conta
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* O que acontece com os seus dados */}
        <div className="rounded-[24px] bg-card border border-border p-6 shadow-xs space-y-4">
          <h2 className="font-display text-lg font-bold text-ink">
            O que acontece com os seus dados
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-priInk">
                Apagado na hora, sem volta
              </div>
              <ul className="space-y-2 text-ink/90">
                <li className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-pri mt-1.5 shrink-0" />
                  <span>Nome, e-mail e nome de usuário</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-pri mt-1.5 shrink-0" />
                  <span>Contas, cartões, lançamentos, fixas e metas</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-pri mt-1.5 shrink-0" />
                  <span>Vínculos com grupos familiares</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-bold text-muted">
                Guardado só por exigência da lei
              </div>
              <ul className="space-y-2 text-ink/90">
                <li className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-muted mt-1.5 shrink-0" />
                  <span>
                    IP, data e hora de acesso, por 6 meses (Marco Civil da
                    Internet)
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-muted mt-1.5 shrink-0" />
                  <span>
                    Data e versão do aceite dos Termos, isolados, para comprovar
                    conformidade
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </LegalShell>
  );
}
