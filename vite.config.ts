/// <reference types="vite-plugin-pwa/react" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    target: ['es2020', 'safari15'],
    rollupOptions: {
      output: {
        manualChunks: {
          xlsx: ['xlsx'],
          vendor: ['react', 'react-dom', 'recharts', 'dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Grocery Manager',
        short_name: 'Grocery',
        description: 'Full-store grocery stock, expiry & promotions manager',
        theme_color: '#059669',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: './manifest-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: './manifest-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
