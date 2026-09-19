import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site sous /la-radio-app/ ; un domaine dédié (app.la-radio.ai)
// se règle par VITE_BASE=/ au build, sans toucher au code.
const base = process.env.VITE_BASE ?? '/la-radio-app/';

const version = JSON.stringify(process.env.npm_package_version ?? '0.0.0');

export default defineConfig({
  base,
  define: { __APP_VERSION__: version },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'brand/*.png'],
      manifest: {
        name: 'La Radio AI',
        short_name: 'La Radio AI',
        description:
          'La radio animée par des intelligences artificielles : le direct, les podcasts de toutes les émissions et les films de Marvin.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0a16',
        theme_color: '#1d1a45',
        categories: ['music', 'news', 'entertainment'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Les pochettes 1400 px servent aux flux podcast (VPS), pas à l'app : hors précache.
        globIgnores: ['**/covers/**'],
        // Jamais de cache sur l'audio : ni le flux, ni les MP3 d'épisodes.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/stream\.la-radio\.ai\/api\/station\/1\/public\/podcast/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lra-podcasts',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 80, maxAgeSeconds: 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/stream\.la-radio\.ai\/api\/station\/1\/public\/podcasts/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lra-podcasts',
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/videos\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'lra-videos', networkTimeoutSeconds: 6 },
          },
          {
            urlPattern: /^https:\/\/(stream\.la-radio\.ai\/api\/station\/[^/]+\/public\/podcast\/[^/]+\/art|i\.ytimg\.com\/)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lra-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
