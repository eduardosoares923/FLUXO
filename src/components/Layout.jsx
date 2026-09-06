import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { RouteLoading } from './RouteLoading';

const roleLabels = {
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
  const { session, loading } = useAuth();
  if (loading) return <div className="app-loading">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="app-loading">Carregando...</div>;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Manchas de gradiente atrás de tudo, se movendo bem devagar. Puramente
// decorativo (aria-hidden), não interfere em nada funcional.
function BackgroundBlobs() {
  return (
    <div className="bg-blobs" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  );
}

export function Layout() {
  const { session, logout, hasPermission } = useAuth();

  return (
    <div className="app-shell">
      <BackgroundBlobs />
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>FLUXO</h1>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !item.module || hasPermission(item.module)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="icon-badge">
                <i className={`fa-solid ${item.icon}`} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <img src={session.avatar} alt={session.name} id="userAvatar" />
          <div>
            <div id="userName">{session.name}</div>
            <div id="userRoleTitle">{roleLabels[session.role] || 'Usuário'}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sair">
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </aside>
      <main className="app-content">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
