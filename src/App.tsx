import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteLoading } from './components/RouteLoading';
import { ToastContainer } from './components/ToastContainer';
import {
  TermsPage,
  PrivacyPage,
  DeleteAccountPublicPage,
} from './pages/LegalPages';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Cards = lazy(() => import('./pages/Cards'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Goals = lazy(() => import('./pages/Goals'));
const Reports = lazy(() => import('./pages/Reports'));
const Tools = lazy(() => import('./pages/Tools'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));
const Import = lazy(() => import('./pages/Import'));

export default function App() {
  return (
    <ErrorBoundary name="Aplicação">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Páginas legais públicas (acessíveis logado ou não) */}
            <Route path="/termos" element={<TermsPage />} />
            <Route path="/privacidade" element={<PrivacyPage />} />
            <Route path="/excluir-conta" element={<DeleteAccountPublicPage />} />

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
                <Route path="/goals" element={<Goals />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/users" element={<Users />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/help" element={<Help />} />
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

