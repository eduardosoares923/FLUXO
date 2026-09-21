import React, { Suspense } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RouteLoading } from './RouteLoading';
import { User } from '../types';

const NAV_ITEMS = [
  { to: '/', label: 'Painel', icon: 'fa-gauge', module: null },
  { to: '/transactions', label: 'Transações', icon: 'fa-arrow-right-arrow-left', module: 'transactions' },
  { to: '/accounts', label: 'Contas', icon: 'fa-wallet', module: 'accounts' },
  { to: '/cards', label: 'Cartões', icon: 'fa-credit-card', module: 'cards' },
  { to: '/subscriptions', label: 'Assinaturas', icon: 'fa-rotate', module: 'subscriptions' },
  { to: '/reports', label: 'Relatórios', icon: 'fa-chart-line', module: 'reports' },
  { to: '/users', label: 'Usuários', icon: 'fa-users', module: 'manage_users' },
  { to: '/settings', label: 'Ajustes', icon: 'fa-gear', module: 'config_system' },
];

export function ProtectedRoute() {
  const { session, loading } = useAuth() as { session: User | null, loading: boolean };
  if (loading) return <RouteLoading />;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth() as { session: User | null, loading: boolean };
  if (loading) return <RouteLoading />;
  return session ? <Navigate to="/" replace /> : <Outlet />;
}

export function Layout() {
  const { session, logout, hasPermission } = useAuth() as { session: User, logout: () => void, hasPermission: any };

  return (
    <div className="flex h-screen bg-[#0e1412] text-[#f2f0ea] overflow-hidden">
      {/* BACKGROUND DECORATIVO */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#e3b04b] rounded-full blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3b82f6] rounded-full blur-[150px] mix-blend-screen" />
      </div>

      {/* SIDEBAR - DESKTOP ONLY */}
      <aside className="hidden md:flex flex-col w-64 bg-[#141d1a]/80 backdrop-blur-xl border-r border-white/10 z-20">
        <div className="p-6">
          <h1 className="text-2xl font-black tracking-tighter text-white">FLUXO</h1>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 flex flex-col gap-1">
          {NAV_ITEMS.filter((item) => !item.module || hasPermission(item.module)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${isActive ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : 'text-[#8fa39a] hover:bg-white/5 hover:text-white'}`}>
              <i className={`fa-solid ${item.icon} w-5 text-center`} /> <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3 truncate">
            <img src={session.avatar || `https://ui-avatars.com/api/?name=${session.name}&background=e3b04b&color=000`} alt="Avatar" className="w-10 h-10 rounded-xl" />
            <div className="truncate"><div className="font-bold text-sm truncate">{session.name.split(' ')[0]}</div><div className="text-[10px] text-[#8fa39a] uppercase tracking-widest">{session.role}</div></div>
          </div>
          <button onClick={logout} className="p-2 text-[#8fa39a] hover:text-red-400 transition-colors"><i className="fa-solid fa-right-from-bracket" /></button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 h-full overflow-y-auto relative z-10 scroll-smooth">
        <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>
      </main>

      {/* BOTTOM NAV - MOBILE ONLY */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#141d1a]/90 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-around px-2 pb-safe pt-2">
        {NAV_ITEMS.filter((item) => !item.module || hasPermission(item.module)).slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center p-2 min-w-[60px] gap-1 transition-colors ${isActive ? 'text-[#e3b04b]' : 'text-[#8fa39a]'}`}>
            <i className={`fa-solid ${item.icon} text-xl`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
