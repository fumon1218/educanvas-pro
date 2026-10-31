import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'production' ? '/educanvas-pro/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      // 설치형 앱(PWA): 한 번 열어 두면 인터넷이 불안해도 앱 화면이 바로 열린다
      VitePWA({
        // 새 버전은 선생님이 [새 버전으로 바꾸기]를 누를 때 바꾼다 (수업 중에 화면이 바뀌지 않게)
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
        manifest: {
          name: '옥쌤보드',
          short_name: '옥쌤보드',
          description: '선생님을 위한 수업 판서·발표 앱',
          lang: 'ko',
          theme_color: '#4F46E5',
          background_color: '#eef1f6',
          display: 'standalone',
          orientation: 'any',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,jpg,svg,wasm,woff2,mjs}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/__/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            // 악기 소리(사운드폰트)와 글꼴은 한 번 받으면 보관
            { urlPattern: /^https:\/\/gleitz\.github\.io\//, handler: 'CacheFirst', options: { cacheName: 'soundfonts', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
            { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
            { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
          ],
        },
      }),
    ],
    define: {
      // 주의: 이 값은 빌드 결과(공개 웹페이지)에 그대로 들어갑니다.
      // 공개 배포에서는 키를 넣지 말고, 서버(예: Cloud Functions)를 거쳐 호출하도록 바꿔야 합니다.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            fabric: ['fabric'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            ui: ['motion', 'lucide-react', 'sonner', 'react-colorful'],
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
