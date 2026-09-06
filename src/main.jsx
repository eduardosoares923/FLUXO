import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './styles/style.css';
import './styles/components.css';
import './styles/dashboard.css';
import './styles/login.css';
import './styles/accounts.css';
import './styles/cards.css';
import './styles/transactions.css';
import './styles/reports.css';
import './styles/settings.css';
import './styles/mobile.css';
import './styles/app-shell.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
