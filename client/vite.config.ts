import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gymawy',
        short_name: 'Gymawy',
        description: 'Track lifts, cardio, body weight and food — with AI meal scanning.',
        theme_color: '#070908',
        background_color: '#070908',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Offline reading: signed-in GET responses are cached and served when the network fails (the outbox in
        // src/lib/offline.ts handles writes). NetworkFirst without a timeout, so a slow cold start on Render never
        // shows stale data. Auth (except /me), AI and barcode lookups are never cached. The cache is per account:
        // it's cleared on log out and when another account signs in (setOutboxOwner).
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin &&
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              !/^\/api\/(auth\/(?!me$)|ai\/|food\/barcode\/|health)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gymawy-api',
              expiration: { maxEntries: 300, maxAgeSeconds: 14 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // API_PORT lets the E2E suite run its own API next to a normal dev session.
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4000}` },
  },
});
