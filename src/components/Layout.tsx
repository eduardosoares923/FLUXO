import React, { Suspense } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RouteLoading } from './RouteLoading';
import { User } from '../types';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  usuario: 'Usuário',
  visitante: 'Visitante',
};

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'fa-gauge', module: null },
  { to: '/accounts', label: 'Contas', icon: 'fa-wallet', module: 'accounts' },
  { to: '/cards', label: 'Cartões', icon: 'fa-credit-card', module: 'cards' },
  { to: '/transactions', label: 'Transações', icon: 'fa-arrow-right-arrow-left', module: 'transactions' },
  { to: '/subscriptions', label: 'Assinaturas', icon: 'fa-rotate', module: 'subscriptions' },
  { to: '/reports', label: 'Relatórios', icon: 'fa-chart-line', module: 'reports' },
  { to: '/users', label: 'Usuários', icon: 'fa-users', module: 'manage_users' },
  { to: '/settings', label: 'Configurações', icon: 'fa-gear', module: 'config_system' },
];

export function ProtectedRoute() {
  const { session, loading } = useAuth() as { session: User | null; loading: boolean };
  if (loading) return <div className="flex items-center justify-center h-screen text-[#8fa39a]">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth() as { session: User | null; loading: boolean };
  if (loading) return <div className="flex items-center justify-center h-screen text-[#8fa39a]">Carregando...</div>;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Manchas de gradiente animadas atrás de tudo (Tailwind)
function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute rounded-full blur-[80px] opacity-[0.14] animate-[drift_24s_ease-in-out_infinite] w-[520px] h-[520px] bg-[#e3b04b] -top-[180px] -left-[120px]" />
      <div className="absolute rounded-full blur-[80px] opacity-[0.14] animate-[drift_30s_ease-in-out_infinite] w-[420px] h-[420px] bg-[#5fd08f] -bottom-[160px] left-[30%] delay-[-6s]" />
      <div className="absolute rounded-full blur-[80px] opacity-[0.14] animate-[drift_27s_ease-in-out_infinite] w-[380px] h-[380px] bg-[#4d8dff] top-[10%] -right-[100px] delay-[-12s]" />
    </div>
  );
}

export function Layout() {
  const { session, logout, hasPermission } = useAuth() as { session: User; logout: () => void; hasPermission: (mod: string) => boolean };

  return (
    <div className="flex min-h-screen bg-[#0b1210] relative text-[#f2f0ea]">
      <BackgroundBlobs />
      
      {/* Sidebar inteira convertida para Tailwind */}
      <aside className="relative z-10 w-[260px] bg-white/[0.02] backdrop-blur-md border-r border-white/[0.08] flex flex-col transition-all">
        <div className="p-6">
          <h1 className="text-[1.4rem] font-extrabold tracking-wide bg-gradient-to-r from-[#f5d78a] via-[#e3b04b] to-[#f5d78a] bg-[length:200%_auto] bg-clip-text text-transparent animate-[shine_5s_linear_infinite]">
            FLUXO
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {NAV_ITEMS.filter((item) => !item.module || hasPermission(item.module)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-[0.92rem] transition-all duration-300 ${
                  isActive 
                    ? 'text-[#f5d78a] bg-white/[0.04]' 
                    : 'text-[#8fa39a] hover:text-[#f2f0ea] hover:bg-white/[0.04] hover:translate-x-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Badge de Ícone */}
                  <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[0.85rem] shrink-0 transition-all duration-300 ${
                    isActive 
                      ? 'bg-gradient-to-br from-[#f5d78a] to-[#e3b04b] text-[#241a06] shadow-[0_0_16px_rgba(227,176,75,0.5)]' 
                      : 'bg-white/5 group-hover:bg-white/10'
                  }`}>
                    <i className={`fa-solid ${item.icon}`} />
                  </span>
                  <span>{item.label}</span>
                  
                  {/* Linha indicadora dourada */}
                  {isActive && (
                    <div className="absolute left-[-2px] top-1/2 -translate-y-1/2 h-3/5 w-[3px] rounded-full bg-gradient-to-b from-[#f5d78a] to-[#e3b04b] shadow-[0_0_10px_#e3b04b]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-white/[0.08] mt-auto flex items-center gap-3">
          <img src={session.avatar} alt={session.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-semibold">{session.name}</div>
            <div className="text-[0.7rem] text-[#8fa39a] truncate">{roleLabels[session.role] || 'Usuário'}</div>
          </div>
          <button 
            onClick={logout} 
            title="Sair"
            className="text-[#8fa39a] hover:text-[#e3b04b] transition-colors p-2"
          >
            <i className="fa-solid fa-right-from-bracket text-lg" />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto relative z-10 h-screen">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
