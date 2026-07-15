import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Monopoly/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'mark.svg'],
      manifest: {
        id: '/Monopoly/', name: 'Monopoly Party', short_name: 'Monopoly', description: 'A live multiplayer property trading game for friends.',
        theme_color: '#b7d7c5', background_color: '#f8f1df', display: 'standalone', orientation: 'any', start_url: '/Monopoly/#/', scope: '/Monopoly/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: 'index.html', runtimeCaching: [] }
    })
  ]
});
