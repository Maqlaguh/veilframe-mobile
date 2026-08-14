import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/veilframe-mobile/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['veilframe-icon.png'],
      manifest: {
        name: 'VeilFrame Lite',
        short_name: 'VeilFrame Lite',
        description: '端末内で動画を回転・トリム・音声補正するモバイル編集ツール',
        theme_color: '#17191e',
        background_color: '#17191e',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'veilframe-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'veilframe-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        cleanupOutdatedCaches: true
      }
    })
  ]
});
