/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
  esbuild: {
    // Keep console statements in production build
    drop: [],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'RamboFlow – Zeiterfassung & Management',
        short_name: 'RamboFlow',
        description: 'Professionelle Zeiterfassung, Ticketverwaltung und Projektmanagement für IT-Dienstleister',
        theme_color: '#FF6A00',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Haupt-Bundle (~3.2 MB) MIT precachen: sonst serviert ein alter
        // Service Worker seine alte index.html, muss das Bundle aber aus dem
        // Netz holen — das nach einem Deploy nicht mehr existiert (404,
        // "App down"-Vorfall 03.08.2026). Mit Precache bleibt die alte
        // Version offline lauffähig, bis autoUpdate die neue aktiviert.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Add custom service worker code for push notifications
        importScripts: ['push-sw.js'],
        // Don't cache API responses, especially downloads
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Never cache download URLs
            urlPattern: /\/api\/.*\/download/,
            handler: 'NetworkOnly',
          },
          {
            // Don't cache other API calls
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60, // 1 minute max
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    })
  ]
})
