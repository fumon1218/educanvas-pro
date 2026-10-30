import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AccessGate } from './components/Access/AccessGate';
import { StudentView } from './components/Cast/StudentView';
import './index.css';
import './lib/install';

// 예상하지 못한 오류는 화면을 덮지 않고 콘솔에만 남긴다.
window.addEventListener('unhandledrejection', e => console.error('처리되지 않은 오류:', e.reason));

// 학생 화면(?watch=코드)은 로그인 없이 선생님이 보내는 화면만 본다
const watchCode = new URLSearchParams(window.location.search).get('watch')?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {watchCode ? (
      <StudentView code={watchCode} />
    ) : (
      <AccessGate>
        <App />
      </AccessGate>
    )}
  </StrictMode>,
);
