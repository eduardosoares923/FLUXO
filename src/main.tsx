import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Apenas o CSS mestre com as variáveis e Tailwind
import './styles/style.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
