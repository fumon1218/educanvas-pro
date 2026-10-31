import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AccessGate } from './components/Access/AccessGate';
import { StudentView } from './components/Cast/StudentView';
import './index.css';
import { TEST_MODE } from './lib/testMode';
import './lib/install';
import { setupAppUpdates } from './lib/appUpdate';

// 예상하지 못한 오류는 화면을 덮지 않고 콘솔에만 남긴다.
window.addEventListener('unhandledrejection', e => console.error('처리되지 않은 오류:', e.reason));

setupAppUpdates();

// 시험 모드 띠: 실제 수업과 분리된 저장소를 쓰고 있음을 늘 보여 준다
if (TEST_MODE) {
  const bar = document.createElement('div');
  bar.textContent = '시험 모드 · 실제 수업과 분리된 저장소를 씁니다 (드라이브 꺼짐)';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#dc2626;color:#fff;font:600 12px/1 sans-serif;padding:5px 12px;border-radius:0 0 10px 10px;pointer-events:none;';
  document.body.appendChild(bar);
  document.title = '[시험] ' + document.title;
}

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
