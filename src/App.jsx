import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteLoading } from './components/RouteLoading';
import { ToastContainer } from './components/ToastContainer';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Cards = lazy(() => import('./pages/Cards'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Import = lazy(() => import('./pages/Import'));

export default function App() {
  return (
    <ErrorBoundary name="Aplicação">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route
                path="/login"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <Login />
                  </Suspense>
                }
              />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/cards" element={<Cards />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/import" element={<Import />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        <ToastContainer />
      </AuthProvider>
    </ErrorBoundary>
  );
}
