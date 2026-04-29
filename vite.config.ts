import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FitFix — Garmin .FIT toolkit',
        short_name: 'FitFix',
        description:
          'Merge & clean Garmin .FIT activity files in your browser. 100% local, privacy-first.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: (() => {
          const tileFallback = {
            plugins: [
              {
                handlerDidError: async () =>
                  new Response('', { status: 504, statusText: 'Tile unavailable' }),
              },
            ],
          }
          return [
            {
              urlPattern: /^https:\/\/(.+)\.basemaps\.cartocdn\.com\/.*/,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'cartodb-tiles',
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                ...tileFallback,
              },
            },
            {
              urlPattern: /^https:\/\/(.+)\.tile\.opentopomap\.org\/.*/,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'topo-tiles',
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                ...tileFallback,
              },
            },
            {
              urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'esri-tiles',
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                ...tileFallback,
              },
            },
          ]
        })(),
      },
    }),
  ],
})
