import React, { Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../context/AuthContext';
import { RouteLoading } from './RouteLoading';
import { GlobalSearch } from './GlobalSearch';
import { MonthPicker, NotificationsBell, Tooltip } from './ui';
import { APP_DOWNLOAD_URL, isAppDownloadAvailable } from '../config/app';
import { useUIStore } from '../stores/useUIStore';
import { User } from '../types';

type IconKey =
  | 'painel'
  | 'transacoes'
  | 'cartoes'
  | 'contas'
  | 'fixas'
  | 'metas'
  | 'relatorios'
  | 'ferramentas'
  | 'usuarios'
  | 'configuracoes'
  | 'ajuda'
  | 'mais'
  | 'plus'
  | 'search'
  | 'logout'
  | 'phone'
  | 'close'
  | 'chevronRight';

function NavSvgIcon({ name, className = 'w-5 h-5' }: { name: IconKey; className?: string }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'painel':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7.5" height="9" rx="2" />
          <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
          <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" />
          <rect x="3" y="15" width="7.5" height="6" rx="2" />
        </svg>
      );
    case 'transacoes':
      return (
        <svg {...props}>
          <path d="M7 10L12 5L17 10" />
          <path d="M12 5V19" />
          <path d="M17 14L12 19L7 14" opacity="0.65" />
        </svg>
      );
    case 'cartoes':
      return (
        <svg {...props}>
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="M2.5 9.5H21.5" />
          <path d="M6.5 14.5H10.5" />
        </svg>
      );
    case 'contas':
      return (
        <svg {...props}>
          <path d="M3.5 7.5C3.5 5.84315 4.84315 4.5 6.5 4.5H18.5C19.6046 4.5 20.5 5.39543 20.5 6.5V17.5C20.5 18.6046 19.6046 19.5 18.5 19.5H6.5C4.84315 19.5 3.5 18.1569 3.5 16.5V7.5Z" />
          <path d="M16 12H20.5" />
          <circle cx="16" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'fixas':
      return (
        <svg {...props}>
          <path d="M17 3.5L20.5 7L17 10.5" />
          <path d="M3.5 11.5V9.5C3.5 7.84315 4.84315 6.5 6.5 6.5H20.5" />
          <path d="M7 20.5L3.5 17L7 13.5" />
          <path d="M20.5 12.5V14.5C20.5 16.1569 19.1569 17.5 17.5 17.5H3.5" />
        </svg>
      );
    case 'metas':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'relatorios':
      return (
        <svg {...props}>
          <path d="M4 19.5H20" />
          <path d="M7 16V11" />
          <path d="M12 16V7" />
          <path d="M17 16V9" />
        </svg>
      );
    case 'ferramentas':
      return (
        <svg {...props}>
          <path d="M12 3.5V14.5" />
          <path d="M7.5 10L12 14.5L16.5 10" />
          <path d="M4.5 17.5V18.5C4.5 19.6046 5.39543 20.5 6.5 20.5H17.5C18.6046 20.5 19.5 19.6046 19.5 18.5V17.5" />
        </svg>
      );
    case 'usuarios':
      return (
        <svg {...props}>
          <circle cx="9" cy="8.5" r="3.2" />
          <path d="M3.5 19C3.5 15.9624 5.96243 13.5 9 13.5C12.0376 13.5 14.5 15.9624 14.5 19" />
          <circle cx="16.5" cy="9.5" r="2.3" />
          <path d="M16.5 14C18.7091 14 20.5 15.7909 20.5 18" />
        </svg>
      );
    case 'configuracoes':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L19.79 16.88A2 2 0 1 1 16.96 19.71L16.9 19.65A1.65 1.65 0 0 0 15.08 19.32A1.65 1.65 0 0 0 14 20.85V21A2 2 0 1 1 10 21V20.91A1.65 1.65 0 0 0 8.92 19.38A1.65 1.65 0 0 0 7.1 19.71L7.04 19.77A2 2 0 1 1 4.21 16.94L4.27 16.88A1.65 1.65 0 0 0 4.6 15.06A1.65 1.65 0 0 0 3.07 14H3A2 2 0 1 1 3 10H3.09A1.65 1.65 0 0 0 4.62 8.92A1.65 1.65 0 0 0 4.29 7.1L4.23 7.04A2 2 0 1 1 7.06 4.21L7.12 4.27A1.65 1.65 0 0 0 8.94 4.6H9A1.65 1.65 0 0 0 10 3.09V3A2 2 0 1 1 14 3V3.09A1.65 1.65 0 0 0 15.08 4.62A1.65 1.65 0 0 0 16.9 4.29L16.96 4.23A2 2 0 1 1 19.79 7.06L19.73 7.12A1.65 1.65 0 0 0 19.4 8.94V9A1.65 1.65 0 0 0 20.91 10H21A2 2 0 1 1 21 14H20.91A1.65 1.65 0 0 0 19.4 15Z" />
        </svg>
      );
    case 'ajuda':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.2C9.8 7.9 11 7.2 12.3 7.4C13.5 7.6 14.5 8.6 14.3 9.9C14.1 11.2 12.2 11.6 12 13" />
          <circle cx="12" cy="16.5" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'mais':
      return (
        <svg {...props}>
          <circle cx="5.5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18.5" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5V19" />
          <path d="M5 12H19" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16L20.5 20.5" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M15 17L20 12L15 7" />
          <path d="M20 12H9" />
          <path d="M11 19H6C4.89543 19 4 18.1046 4 17V7C4 5.89543 4.89543 5 6 5H11" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...props}>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M10.5 18H13.5" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="M18 6L6 18" />
          <path d="M6 6L18 18" />
        </svg>
      );
    case 'chevronRight':
      return (
        <svg {...props}>
          <path d="M9 6L15 12L9 18" />
        </svg>
      );
  }
}

interface MenuItem {
  to: string;
  label: string;
  icon: IconKey;
  module: string | null;
  adminOnly?: boolean;
}

const SIDEBAR_ITEMS: MenuItem[] = [
  { to: '/', label: 'Painel', icon: 'painel', module: null },
  { to: '/transactions', label: 'Transações', icon: 'transacoes', module: 'transactions' },
  { to: '/cards', label: 'Cartões', icon: 'cartoes', module: 'cards' },
  { to: '/accounts', label: 'Contas', icon: 'contas', module: 'accounts' },
  { to: '/subscriptions', label: 'Fixas', icon: 'fixas', module: 'subscriptions' },
  { to: '/goals', label: 'Metas', icon: 'metas', module: 'reports' },
  { to: '/reports', label: 'Relatórios', icon: 'relatorios', module: 'reports' },
  { to: '/tools', label: 'Ferramentas', icon: 'ferramentas', module: 'transactions' },
  { to: '/users', label: 'Usuários', icon: 'usuarios', module: 'manage_users', adminOnly: true },
  { to: '/settings', label: 'Configurações', icon: 'configuracoes', module: 'config_system' },
  { to: '/help', label: 'Ajuda', icon: 'ajuda', module: null },
];

const MOBILE_MORE_ITEMS: MenuItem[] = [
  { to: '/accounts', label: 'Contas', icon: 'contas', module: 'accounts' },
  { to: '/subscriptions', label: 'Fixas', icon: 'fixas', module: 'subscriptions' },
  { to: '/goals', label: 'Metas', icon: 'metas', module: 'reports' },
  { to: '/reports', label: 'Relatórios', icon: 'relatorios', module: 'reports' },
  { to: '/tools', label: 'Ferramentas', icon: 'ferramentas', module: 'transactions' },
  { to: '/import', label: 'Importar', icon: 'ferramentas', module: 'transactions' },
  { to: '/users', label: 'Usuários', icon: 'usuarios', module: 'manage_users', adminOnly: true },
  { to: '/settings', label: 'Configurações', icon: 'configuracoes', module: 'config_system' },
  { to: '/help', label: 'Ajuda', icon: 'ajuda', module: null },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Painel',
  '/transactions': 'Transações',
  '/cards': 'Cartões',
  '/accounts': 'Contas',
  '/subscriptions': 'Fixas',
  '/goals': 'Metas',
  '/reports': 'Relatórios',
  '/tools': 'Ferramentas',
  '/import': 'Importar',
  '/users': 'Usuários',
  '/settings': 'Configurações',
  '/help': 'Ajuda',
};

const ROUTES_WITH_MONTH = new Set(['/', '/transactions', '/cards', '/subscriptions', '/reports', '/goals']);

export function ProtectedRoute() {
  const { session, loading } = useAuth() as { session: User | null; loading: boolean };
  if (loading) return <RouteLoading />;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth() as { session: User | null; loading: boolean };
  if (loading) return <RouteLoading />;
  return session ? <Navigate to="/" replace /> : <Outlet />;
}

export function Layout() {
  const { session, logout, hasPermission } = useAuth() as {
    session: User;
    logout: () => void;
    hasPermission: (m: string) => boolean;
  };
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const selectedPeriod = useUIStore((s) => s.selectedPeriod);
  const setSelectedPeriod = useUIStore((s) => s.setSelectedPeriod);

  const isAdmin = Boolean(session?.superAdmin || session?.role === 'admin');
  const appLinkVisible = isAppDownloadAvailable();

  const canSeeItem = (item: MenuItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.module && !hasPermission(item.module)) return false;
    return true;
  };

  const visibleSidebarItems = SIDEBAR_ITEMS.filter(canSeeItem);
  const visibleMobileMore = MOBILE_MORE_ITEMS.filter(canSeeItem);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Painel';
  const showMonthPicker = ROUTES_WITH_MONTH.has(location.pathname);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-bg text-ink overflow-hidden">
      {/* Barra lateral Desktop (248px, fundo nav, texto branco) */}
      <aside
        onContextMenu={(e) => e.preventDefault()}
        className="hidden md:flex flex-col w-[248px] shrink-0 bg-nav text-white z-20 select-none"
      >
        {/* Marca W wynd no topo em degradê dourado (wordA -> wordB) */}
        <div className="px-6 pt-6 pb-4 flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] font-display text-xl font-bold bg-gradient-to-br from-wordA to-wordB bg-clip-text text-transparent">
            W
          </span>
          <span className="font-display text-2xl font-bold tracking-tight bg-gradient-to-r from-wordA to-wordB bg-clip-text text-transparent">
            wynd
          </span>
        </div>

        {/* Navegação principal */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
          {visibleSidebarItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onContextMenu={(e) => e.preventDefault()}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3.5 min-h-[44px] rounded-[16px] text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-navActBg text-white'
                    : 'text-navMuted hover:bg-white/[0.05] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-navActIcon' : 'text-navMuted group-hover:text-white'}>
                    <NavSvgIcon name={item.icon} className="w-5 h-5 shrink-0" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Rodapé da barra lateral: Cartão Android + Usuário logado */}
        <div className="p-3.5 flex flex-col gap-3 border-t border-white/10">
          {appLinkVisible && (
            <div className="rounded-[20px] p-3.5 bg-gradient-to-br from-heroStart to-heroEnd text-heroInk shadow-sm">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <NavSvgIcon name="phone" className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-tight text-white">Wynd no Android</div>
                  <div className="text-[11px] text-heroMuted leading-tight mt-0.5">Suas contas no bolso</div>
                </div>
              </div>
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener"
                onContextMenu={(e) => e.preventDefault()}
                className="w-full min-h-[38px] rounded-[12px] bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center justify-center transition-colors"
              >
                Baixar o app
              </a>
            </div>
          )}

          <div className="flex items-center gap-2.5 px-1.5 py-1">
            <div className="w-10 h-10 rounded-xl bg-navActBg text-navActIcon flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
              {session.avatar || session.photo ? (
                <img src={session.avatar || session.photo} alt={session.name} className="w-full h-full object-cover" />
              ) : (
                (session.name || 'W').slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{session.name?.split(' ')[0] || 'Usuário'}</div>
              <div className="text-[11px] text-navMuted uppercase tracking-wider truncate">{session.role}</div>
            </div>
            <Tooltip content="Sair da conta">
              <button
                type="button"
                onClick={logout}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Sair da conta"
                className="w-10 h-10 rounded-xl text-navMuted hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
              >
                <NavSvgIcon name="logout" className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Topo da área de conteúdo */}
        <header className="shrink-0 px-4 sm:px-6 lg:px-8 pt-4 pb-3 border-b border-border/60 bg-bg/90 backdrop-blur-md z-10">
          <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
              <h1 className="font-display text-[26px] md:text-[34px] font-bold text-ink tracking-tight leading-none">
                {pageTitle}
              </h1>
              {showMonthPicker && (
                <MonthPicker value={selectedPeriod} onChange={setSelectedPeriod} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Tooltip content="Buscar (Ctrl+K)">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label="Buscar"
                  className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-pill bg-card border border-border text-ink hover:bg-neutral transition-colors text-sm font-medium"
                >
                  <NavSvgIcon name="search" className="w-4 h-4 text-muted" />
                  <span className="hidden sm:inline text-muted">Buscar</span>
                </button>
              </Tooltip>

              <NotificationsBell />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative z-0 scroll-smooth pb-28 md:pb-8">
          <Suspense fallback={<RouteLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Barra inferior fixa para Celular (< 768px) */}
      <nav
        onContextMenu={(e) => e.preventDefault()}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-nav text-navMuted border-t border-white/10 z-40 grid grid-cols-5 items-center px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] select-none"
      >
        <NavLink
          to="/"
          end
          onContextMenu={(e) => e.preventDefault()}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-h-[48px] gap-1 rounded-xl transition-colors ${
              isActive ? 'text-navActIcon' : 'text-navMuted'
            }`
          }
        >
          <NavSvgIcon name="painel" className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none">Painel</span>
        </NavLink>

        <NavLink
          to="/transactions"
          onContextMenu={(e) => e.preventDefault()}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-h-[48px] gap-1 rounded-xl transition-colors ${
              isActive ? 'text-navActIcon' : 'text-navMuted'
            }`
          }
        >
          <NavSvgIcon name="transacoes" className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none">Transações</span>
        </NavLink>

        {/* Botão central redondo "Novo lançamento" em fab subindo 26 px */}
        <div className="flex flex-col items-center justify-center">
          <button
            type="button"
            onClick={() => navigate('/transactions?new=1')}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Novo lançamento"
            className="w-14 h-14 rounded-full bg-fab text-fabIcon flex items-center justify-center shadow-lg -translate-y-[26px] transition-transform active:scale-95"
          >
            <NavSvgIcon name="plus" className="w-6 h-6" />
          </button>
        </div>

        <NavLink
          to="/cards"
          onContextMenu={(e) => e.preventDefault()}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center min-h-[48px] gap-1 rounded-xl transition-colors ${
              isActive ? 'text-navActIcon' : 'text-navMuted'
            }`
          }
        >
          <NavSvgIcon name="cartoes" className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none">Cartões</span>
        </NavLink>

        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Mais opções"
          className={`flex flex-col items-center justify-center min-h-[48px] gap-1 rounded-xl transition-colors ${
            mobileMoreOpen ? 'text-navActIcon' : 'text-navMuted'
          }`}
        >
          <NavSvgIcon name="mais" className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none">Mais</span>
        </button>
      </nav>

      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Menu Mobile "Mais" (Dialog Radix UI) */}
      <Dialog.Root open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="md:hidden fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[28px] bg-bg text-ink border-t border-border p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl focus:outline-none"
          >
            <div className="w-10 h-1.5 bg-track rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-display text-xl font-bold text-ink">
                Menu
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar menu"
                  className="w-11 h-11 rounded-full bg-neutral text-ink flex items-center justify-center"
                >
                  <NavSvgIcon name="close" className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Cartão verde "Wynd no Android" no topo do menu Mais */}
            {appLinkVisible && (
              <div className="mb-4 rounded-[24px] p-4 bg-gradient-to-br from-heroStart to-heroEnd text-heroInk flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                    <NavSvgIcon name="phone" className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-base font-bold text-white leading-tight">
                      Wynd no Android
                    </div>
                    <div className="text-xs text-heroMuted mt-0.5">
                      Suas contas no bolso
                    </div>
                  </div>
                </div>
                <a
                  href={APP_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener"
                  onContextMenu={(e) => e.preventDefault()}
                  className="px-4 min-h-[44px] rounded-pill bg-white text-[#14261D] text-xs font-bold inline-flex items-center justify-center shrink-0"
                >
                  Baixar o app
                </a>
              </div>
            )}

            {/* Lista de itens: Contas, Fixas, Metas, Relatórios, Ferramentas, Usuários, Configurações, Ajuda */}
            <div className="flex flex-col gap-1.5 bg-card border border-border rounded-[24px] p-2">
              {visibleMobileMore.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMoreOpen(false)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 min-h-[48px] rounded-[16px] text-sm font-semibold transition-colors ${
                      isActive ? 'bg-priSoft text-priInk' : 'text-ink hover:bg-neutral'
                    }`
                  }
                >
                  <span className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-neutral text-pri flex items-center justify-center">
                      <NavSvgIcon name={item.icon} className="w-5 h-5" />
                    </span>
                    <span>{item.label}</span>
                  </span>
                  <NavSvgIcon name="chevronRight" className="w-4 h-4 text-muted" />
                </NavLink>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                logout();
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full mt-4 min-h-[48px] rounded-[18px] bg-spendSoft text-spendText font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <NavSvgIcon name="logout" className="w-4 h-4" />
              <span>Sair da conta</span>
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
