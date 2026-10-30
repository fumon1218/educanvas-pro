import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 예상하지 못한 오류는 화면을 덮지 않고 콘솔에만 남긴다.
window.addEventListener('unhandledrejection', e => console.error('처리되지 않은 오류:', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
