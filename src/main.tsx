import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fontes locais (@fontsource) para funcionamento offline no PWA
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';

// Base visual com tokens CSS + estilos globais
import './styles/tailwind.css';
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
