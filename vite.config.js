import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Wynd Controle Financeiro',
        short_name: 'Wynd',
        description: 'Controle financeiro pessoal e familiar',
        theme_color: '#F3F1E9',
        background_color: '#F3F1E9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('@tanstack')) return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
