/** 설치형 앱(PWA) 설치: 브라우저가 주는 설치 기회를 잡아 두었다가 [앱으로 설치]에서 쓴다 */
let deferred: any = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}

export const canInstall = () => !!deferred;
export const isInstalled = () => typeof window !== 'undefined' && (!!(window as any).okssamDesktop || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** 설치 창을 띄운다. 띄울 수 없으면 false (사파리 등: 공유 → 홈 화면에 추가 안내) */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  try { await e.userChoice; } catch { /* 무시 */ }
  listeners.forEach(f => f());
  return true;
}
