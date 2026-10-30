import React, { useEffect, useRef } from 'react';

/** 데스크톱 프로그램(옥쌤보드 데스크톱)에서 실행 중인가 */
export const isDesktopApp = () => typeof window !== 'undefined' && !!(window as any).okssamDesktop?.isDesktop;

export interface DesktopWebHandle { back: () => void; forward: () => void; reload: () => void }

/**
 * 데스크톱 프로그램 전용: 진짜 브라우저(webview)로 웹 페이지를 연다.
 * 네이버·다음처럼 다른 앱 안에서 열리지 않게 막아 둔 사이트도 열리고, 로그인도 유지된다.
 */
export const DesktopWebView = React.forwardRef<DesktopWebHandle, {
  url: string;
  onNavigate?: (url: string) => void;
  onTitle?: (title: string) => void;
}>(({ url, onNavigate, onTitle }, ref) => {
  const elRef = useRef<any>(null);
  const cb = useRef({ onNavigate, onTitle });
  cb.current = { onNavigate, onTitle };

  React.useImperativeHandle(ref, () => ({
    back: () => { try { if (elRef.current?.canGoBack()) elRef.current.goBack(); } catch { /* 무시 */ } },
    forward: () => { try { if (elRef.current?.canGoForward()) elRef.current.goForward(); } catch { /* 무시 */ } },
    reload: () => { try { elRef.current?.reload(); } catch { /* 무시 */ } },
  }), []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const nav = (e: any) => { if (e?.url) cb.current.onNavigate?.(e.url); };
    const title = (e: any) => { if (e?.title) cb.current.onTitle?.(e.title); };
    el.addEventListener('did-navigate', nav);
    el.addEventListener('did-navigate-in-page', (e: any) => { if (e?.isMainFrame) nav(e); });
    el.addEventListener('page-title-updated', title);
    return () => {
      el.removeEventListener('did-navigate', nav);
      el.removeEventListener('page-title-updated', title);
    };
  }, []);

  // 주소가 바뀌면 이동
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    try {
      const cur = el.getURL?.();
      if (cur && cur !== url) el.loadURL(url);
    } catch { /* 아직 준비 전: src로 열림 */ }
  }, [url]);

  return React.createElement('webview', {
    ref: elRef,
    src: url,
    partition: 'persist:okssam-web',
    allowpopups: 'true',
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff' },
  });
});
DesktopWebView.displayName = 'DesktopWebView';
