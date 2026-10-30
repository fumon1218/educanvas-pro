import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

/**
 * 유튜브 공식 IFrame Player API로 영상을 재생한다.
 * (Lumio·Pear Deck·Canva·Miro 같은 상용 수업 앱이 쓰는 방식: 일반 iframe 대신 유튜브가 제공하는 플레이어를 붙인다)
 * - 시작·끝 시간, 재생 위치 읽기, 오류(퍼가기 금지 등) 알림을 지원한다.
 */
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('api')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT?.Player) { apiPromise = null; reject(new Error('timeout')); } }, 15000);
  });
  return apiPromise;
}

export interface YouTubeTarget { videoId?: string; listId?: string; start?: number; end?: number }

/** 유튜브 주소 → 영상 번호·재생목록·시작 시간 */
export function parseYouTube(raw: string): YouTubeTarget | null {
  let u: URL;
  try { u = new URL(/^https?:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  const secs = (v: string | null) => {
    if (!v) return undefined;
    if (/^\d+$/.test(v)) return +v;
    const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : undefined;
  };
  const list = u.searchParams.get('list') || undefined;
  let id: string | undefined;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{6,})/)?.[1];
  } else return null;
  if (!id && !list) return null;
  return { videoId: id && id !== 'videoseries' ? id : undefined, listId: list, start: secs(t) };
}

const ERRORS: Record<number, string> = {
  2: '영상 주소가 올바르지 않습니다.',
  5: '이 브라우저에서 재생할 수 없는 영상입니다.',
  100: '영상을 찾을 수 없습니다. 삭제되었거나 비공개 영상입니다.',
  101: '영상 올린 사람이 다른 사이트에서 재생하지 못하게 막아 둔 영상입니다.',
  150: '영상 올린 사람이 다른 사이트에서 재생하지 못하게 막아 둔 영상입니다.',
  152: '이 영상은 다른 사이트에서 재생할 수 없습니다.',
  153: '유튜브가 재생을 허락하지 않았습니다(플레이어 설정 오류).',
};

export interface YouTubeHandle { getTime: () => number; seek: (s: number) => void; play: () => void; pause: () => void }

export const YouTubePlayer = React.forwardRef<YouTubeHandle, {
  target: YouTubeTarget;
  watchUrl: string;
  onTime?: (sec: number) => void;
}>(({ target, watchUrl, onTime }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  React.useImperativeHandle(ref, () => ({
    getTime: () => { try { return playerRef.current?.getCurrentTime?.() ?? 0; } catch { return 0; } },
    seek: s => { try { playerRef.current?.seekTo?.(s, true); } catch { /* 무시 */ } },
    play: () => { try { playerRef.current?.playVideo?.(); } catch { /* 무시 */ } },
    pause: () => { try { playerRef.current?.pauseVideo?.(); } catch { /* 무시 */ } },
  }), []);

  useEffect(() => {
    let dead = false;
    let timer: number | undefined;
    setState('loading');
    loadApi().then(YT => {
      if (dead || !hostRef.current) return;
      const el = document.createElement('div');
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(el);
      const playerVars: Record<string, any> = {
        rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1,
        origin: window.location.origin, widget_referrer: window.location.href,
      };
      if (target.start) playerVars.start = Math.floor(target.start);
      if (target.end) playerVars.end = Math.floor(target.end);
      if (target.listId) { playerVars.list = target.listId; playerVars.listType = 'playlist'; }
      playerRef.current = new YT.Player(el, {
        width: '100%', height: '100%',
        ...(target.videoId ? { videoId: target.videoId } : {}),
        playerVars,
        events: {
          onReady: () => {
            if (dead) return;
            setState('ready');
            const f = playerRef.current?.getIframe?.();
            if (f) { f.style.position = 'absolute'; f.style.inset = '0'; f.style.width = '100%'; f.style.height = '100%'; f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture'); }
            if (target.start != null || target.end != null) { try { playerRef.current.playVideo(); } catch { /* 무시 */ } }
            timer = window.setInterval(() => { try { onTimeRef.current?.(playerRef.current.getCurrentTime()); } catch { /* 무시 */ } }, 500);
          },
          onError: (e: any) => { if (!dead) { setErr(ERRORS[e?.data] || `재생할 수 없습니다 (오류 ${e?.data}).`); setState('error'); } },
        },
      });
    }).catch(() => { if (!dead) { setErr('유튜브 플레이어를 불러오지 못했습니다. 인터넷 연결이나 학교 방화벽(유튜브 차단)을 확인해 주세요.'); setState('error'); } });
    return () => {
      dead = true;
      window.clearInterval(timer);
      try { playerRef.current?.destroy?.(); } catch { /* 무시 */ }
      playerRef.current = null;
    };
  }, [target.videoId, target.listId, target.start, target.end]);

  return (
    <div className="absolute inset-0 bg-black">
      <div ref={hostRef} className="absolute inset-0" />
      {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="animate-spin" /></div>}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-slate-900 text-white">
          <div className="text-[15px] font-semibold">{err}</div>
          <p className="text-[12px] text-white/60">새 탭에서는 볼 수 있습니다. 수업 화면을 공유 중이면 그 탭을 함께 보여 주세요.</p>
          <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-red-600 text-white text-[13px] font-semibold"><ExternalLink size={15} />유튜브에서 열기</a>
        </div>
      )}
    </div>
  );
});
YouTubePlayer.displayName = 'YouTubePlayer';
