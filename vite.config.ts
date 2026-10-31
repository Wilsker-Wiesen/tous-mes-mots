import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relativ, damit die App unter / (lokal) und unter /tous-mes-mots/ (Pages) gleich läuft.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tous mes mots',
        short_name: 'Mes mots',
        description: 'Persönlicher Vokabeltrainer Französisch',
        lang: 'de',
        display: 'standalone',
        start_url: '.',
        background_color: '#f4f1fa',
        theme_color: '#f4f1fa',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Die Anmeldeseite des Workers nie durch die zwischengespeicherte App ersetzen.
        navigateFallbackDenylist: [/^\/login/],
      },
    }),
  ],
});
