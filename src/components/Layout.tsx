import React, { Suspense, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RouteLoading } from './RouteLoading';
import { User } from '../types';

const NAV_GROUPS = [
  {
    label: 'Visão geral',
    items: [
      { to: '/', label: 'Painel', icon: 'fa-gauge', module: null },
      { to: '/reports', label: 'Relatórios', icon: 'fa-chart-line', module: 'reports' },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      { to: '/accounts', label: 'Contas', icon: 'fa-wallet', module: 'accounts' },
      { to: '/cards', label: 'Cartões', icon: 'fa-credit-card', module: 'cards' },
      { to: '/transactions', label: 'Transações', icon: 'fa-arrow-right-arrow-left', module: 'transactions' },
      { to: '/subscriptions', label: 'Assinaturas', icon: 'fa-rotate', module: 'subscriptions' },
    ],
  },
];

const PROFILE_ITEMS = [
  { to: '/users', label: 'Usuários', icon: 'fa-users', module: 'manage_users' },
  { to: '/settings', label: 'Configurações', icon: 'fa-gear', module: 'config_system' },
];

const MOBILE_PRIMARY = [
  { to: '/', label: 'Início', icon: 'fa-gauge', module: null },
  { to: '/transactions', label: 'Extrato', icon: 'fa-arrow-right-arrow-left', module: 'transactions' },
];
const MOBILE_PRIMARY_RIGHT = [
  { to: '/cards', label: 'Cartões', icon: 'fa-credit-card', module: 'cards' },
];
const MOBILE_ALL_OTHER = [
  { to: '/accounts', label: 'Contas', icon: 'fa-wallet', module: 'accounts' },
  { to: '/subscriptions', label: 'Assinaturas', icon: 'fa-rotate', module: 'subscriptions' },
  { to: '/reports', label: 'Relatórios', icon: 'fa-chart-line', module: 'reports' },
  { to: '/users', label: 'Usuários', icon: 'fa-users', module: 'manage_users' },
  { to: '/settings', label: 'Configurações', icon: 'fa-gear', module: 'config_system' },
];

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

function navLinkClass(isActive: boolean) {
  return `flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
    isActive ? 'bg-[#e3b04b]/20 text-[#e3b04b]' : 'text-[#8fa39a] hover:bg-white/5 hover:text-white'
  }`;
}

export function Layout() {
  const { session, logout, hasPermission } = useAuth() as { session: User; logout: () => void; hasPermission: any };
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const visibleProfileItems = PROFILE_ITEMS.filter((item) => !item.module || hasPermission(item.module));
  const visibleMobileOther = MOBILE_ALL_OTHER.filter((item) => !item.module || hasPermission(item.module));

  return (
    <div className="flex h-screen bg-[#0e1412] text-[#f2f0ea] overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#e3b04b] rounded-full blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#3b82f6] rounded-full blur-[150px] mix-blend-screen" />
      </div>

      <aside
        className={`hidden md:flex flex-col ${collapsed ? 'w-20' : 'w-64'} bg-[#141d1a]/80 backdrop-blur-xl border-r border-white/10 z-20 relative transition-all duration-200`}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-6 -right-3 w-6 h-6 rounded-full bg-[#1c2624] border border-white/10 text-[#8fa39a] hover:text-white flex items-center justify-center text-xs z-30"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <i className={`fa-solid ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} />
        </button>

        <div className="p-6 overflow-hidden">
          <h1 className="text-2xl font-black tracking-tighter text-white whitespace-nowrap">{collapsed ? 'W' : 'Wynd'}</h1>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-4 flex flex-col gap-1">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.module || hasPermission(item.module));
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="mb-2">
                {!collapsed && (
                  <div className="text-[10px] uppercase tracking-widest text-[#5c6b66] px-4 mt-3 mb-1">{group.label}</div>
                )}
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => navLinkClass(isActive)} title={collapsed ? item.label : undefined}>
                    <i className={`fa-solid ${item.icon} w-5 text-center shrink-0`} />
                    {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="relative p-4 border-t border-white/10">
          {profileOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#1a2422] border border-white/10 rounded-xl p-2 shadow-2xl">
              {visibleProfileItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setProfileOpen(false)}
                  className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold ${isActive ? 'text-[#e3b04b]' : 'text-[#c9d2cf] hover:bg-white/5'}`}
                >
                  <i className={`fa-solid ${item.icon} w-4 text-center`} /> {item.label}
                </NavLink>
              ))}
              <button
                onClick={() => { setProfileOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-red-400 hover:bg-white/5"
              >
                <i className="fa-solid fa-right-from-bracket w-4 text-center" /> Sair
              </button>
            </div>
          )}
          <button onClick={() => setProfileOpen((o) => !o)} className="w-full flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 transition-colors">
            <img
              src={session.avatar || `https://ui-avatars.com/api/?name=${session.name}&background=e3b04b&color=000`}
              alt="Avatar"
              className="w-10 h-10 rounded-xl shrink-0"
            />
            {!collapsed && (
              <div className="truncate text-left flex-1">
                <div className="font-bold text-sm truncate">{session.name.split(' ')[0]}</div>
                <div className="text-[10px] text-[#8fa39a] uppercase tracking-widest">{session.role}</div>
              </div>
            )}
            {!collapsed && <i className={`fa-solid fa-chevron-up text-xs text-[#8fa39a] transition-transform ${profileOpen ? '' : 'rotate-180'}`} />}
          </button>
        </div>
      </aside>

      <main className="flex-1 h-full overflow-y-auto relative z-10 scroll-smooth pb-20 md:pb-0">
        <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#141d1a]/90 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-around px-2 pb-safe pt-2">
        {MOBILE_PRIMARY.filter((item) => !item.module || hasPermission(item.module)).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex flex-col items-center justify-center p-2 min-w-[56px] gap-1 transition-colors ${isActive ? 'text-[#e3b04b]' : 'text-[#8fa39a]'}`}>
            <i className={`fa-solid ${item.icon} text-xl`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
          </NavLink>
        ))}

        <button
          onClick={() => navigate('/transactions')}
          className="w-12 h-12 rounded-2xl bg-[#e3b04b] text-black flex items-center justify-center text-lg shadow-lg shadow-[#e3b04b]/30 -mt-5"
          title="Nova transação"
        >
          <i className="fa-solid fa-plus" />
        </button>

        {MOBILE_PRIMARY_RIGHT.filter((item) => !item.module || hasPermission(item.module)).map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex flex-col items-center justify-center p-2 min-w-[56px] gap-1 transition-colors ${isActive ? 'text-[#e3b04b]' : 'text-[#8fa39a]'}`}>
            <i className={`fa-solid ${item.icon} text-xl`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
          </NavLink>
        ))}

        <button onClick={() => setMobileMoreOpen(true)} className="flex flex-col items-center justify-center p-2 min-w-[56px] gap-1 text-[#8fa39a]">
          <i className="fa-solid fa-ellipsis text-xl" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Mais</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex items-end" onClick={() => setMobileMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-[#141d1a] border-t border-white/10 rounded-t-3xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="grid grid-cols-3 gap-3">
              {visibleMobileOther.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMoreOpen(false)}
                  className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 text-[#c9d2cf]"
                >
                  <i className={`fa-solid ${item.icon} text-xl text-[#e3b04b]`} />
                  <span className="text-xs font-semibold text-center">{item.label}</span>
                </NavLink>
              ))}
            </div>
            <button
              onClick={() => { setMobileMoreOpen(false); logout(); }}
              className="w-full mt-4 py-3 rounded-2xl bg-white/5 text-red-400 font-bold text-sm"
            >
              <i className="fa-solid fa-right-from-bracket mr-2" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
