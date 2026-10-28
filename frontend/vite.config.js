import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Caches the built app shell so the till still loads after a refresh
    // while the internet is down (the data side is handled by IndexedDB).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Supermarket POS',
        short_name: 'POS',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#059669',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    // Dev only: forward API calls to FastAPI so no CORS setup is needed.
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
