import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'production' ? '/educanvas-pro/' : '/',
    plugins: [react(), tailwindcss()],
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
