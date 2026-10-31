import { toast } from 'sonner';

/**
 * 새 버전 배포와 '지금 열려 있는 화면'이 부딪히지 않게 한다.
 *
 * - 새 버전이 나와도 수업 중인 화면은 지금 버전 그대로 둔다 (수업이 끊기지 않게).
 *   화면 아래에 [새 버전으로 바꾸기]를 띄우고, 누르면 저장한 뒤 바꾼다.
 * - 그래도 예전 화면이 지워진 프로그램 조각을 찾으면(PDF 열기 등이 실패) 저장하고 한 번 새로 고친다.
 */

const STALE_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to load module script/i;
const RELOAD_KEY = 'okssam_stale_reload_at';

export const isStaleChunkError = (err: unknown) => {
  const msg = (err as any)?.message ?? String(err ?? '');
  return STALE_RE.test(msg);
};

/** 화면이 저장할 거리를 가지고 있으면 저장해 둔다 (App이 등록) */
const flushBeforeReload = async () => {
  try { await (window as any).__okssamFlush?.(); } catch { /* 저장이 안 되어도 새로 고침은 한다 */ }
};

let recovering = false;
/** 예전 화면이 새 버전과 어긋났을 때: 저장 → 새로 고침 (계속 반복되지 않게 1분에 한 번만) */
export const recoverFromStaleChunk = async () => {
  if (recovering) return;
  recovering = true;
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* 무시 */ }
  if (Date.now() - last < 60_000) {
    recovering = false;
    toast.error('앱의 새 버전을 받아 오지 못했습니다.', { description: '인터넷 연결을 확인한 뒤 새로 고침해 주세요.' });
    return;
  }
  toast.loading('옥쌤보드가 새 버전으로 바뀌었습니다. 저장하고 다시 여는 중…', { id: 'okssam-update' });
  await flushBeforeReload();
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* 무시 */ }
  window.location.reload();
};

export function setupAppUpdates() {
  // 지워진 조각을 불러오려다 실패하면 회복
  window.addEventListener('vite:preloadError', (e: Event) => { e.preventDefault(); void recoverFromStaleChunk(); });
  window.addEventListener('unhandledrejection', e => { if (isStaleChunkError(e.reason)) { e.preventDefault(); void recoverFromStaleChunk(); } });

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        toast('옥쌤보드 새 버전이 준비되었습니다.', {
          id: 'okssam-update',
          duration: Infinity,
          description: '지금 수업은 그대로 쓸 수 있습니다. 편할 때 바꿔 주세요.',
          action: {
            label: '새 버전으로 바꾸기',
            onClick: async () => {
              toast.loading('저장하고 새 버전으로 바꾸는 중…', { id: 'okssam-update' });
              await flushBeforeReload();
              await updateSW(true);
              setTimeout(() => window.location.reload(), 1500);
            },
          },
        });
      },
      onRegisteredSW(_url, reg) {
        // 앱을 오래 켜 두어도 30분마다 새 버전을 확인
        if (reg) setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}); }, 30 * 60 * 1000);
      },
    });
  }).catch(() => { /* 서비스 워커를 쓸 수 없는 환경 */ });
}
