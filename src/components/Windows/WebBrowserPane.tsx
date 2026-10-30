import React, { useEffect, useState } from 'react';
import { ExternalLink, RotateCw, ArrowRight, Pin, Info, Scissors } from 'lucide-react';
import { sanitizeUrl } from '@/src/lib/canvasData';

/** 유튜브·비메오·구글 문서 주소를 창 안에서 재생·표시할 수 있는 주소로 바꾼다 */
export interface Clip { start?: number; end?: number }

/** '2:10', '1:02:03', '130', '2m10s' → 초 */
export function parseTime(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((a, n) => a * 60 + parseInt(n, 10), 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return undefined;
}
export const fmtTime = (sec?: number) => {
  if (sec == null || !isFinite(sec)) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
export const clipLabel = (c?: Clip) => (c && (c.start != null || c.end != null) ? `${fmtTime(c.start ?? 0)} ~ ${c.end != null ? fmtTime(c.end) : '끝'}` : '');

export function toEmbeddableUrl(raw: string, clip?: Clip): { url: string; kind: 'youtube' | 'vimeo' | 'google' | 'web' } | null {
  const safe = sanitizeUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  const startSec = clip?.start ?? (t ? parseTime(t) ?? 0 : 0);
  const yt = (id: string) => {
    const e = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    e.searchParams.set('rel', '0');
    e.searchParams.set('modestbranding', '1');
    if (startSec > 0) e.searchParams.set('start', String(Math.floor(startSec)));
    if (clip?.end != null && clip.end > startSec) e.searchParams.set('end', String(Math.floor(clip.end)));
    if (clip && (clip.start != null || clip.end != null)) e.searchParams.set('autoplay', '1');
    const list = u.searchParams.get('list');
    if (list) e.searchParams.set('list', list);
    return { url: e.toString(), kind: 'youtube' as const };
  };
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v) return yt(v);
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
    if (m) return yt(m[2]);
    const list = u.searchParams.get('list');
    if (list) return { url: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`, kind: 'youtube' };
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) return yt(id);
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    if (m) return { url: `https://player.vimeo.com/video/${m[1]}`, kind: 'vimeo' };
  }
  if (host === 'docs.google.com') {
    // 문서·슬라이드·시트: /edit → /preview (보기 전용으로 창 안에 표시 가능)
    const m = u.pathname.match(/^(\/(document|presentation|spreadsheets)\/d\/[\w-]+)/);
    if (m) return { url: `https://docs.google.com${m[1]}/preview`, kind: 'google' };
  }
  return { url: safe, kind: 'web' };
}

interface Props {
  initialUrl?: string;
  initialClip?: Clip;
  onTitle?: (title: string) => void;
  onPinToCanvas?: (url: string, clip?: Clip) => void;
}

const EXAMPLES = [
  { label: '유튜브 영상 주소', hint: 'youtube.com/watch?v=… 또는 youtu.be/…' },
  { label: '구글 문서·슬라이드', hint: '공유 링크를 그대로 붙여 넣기' },
  { label: '교육 사이트', hint: '예: phet.colorado.edu' },
];

export const WebBrowserPane: React.FC<Props> = ({ initialUrl, initialClip, onTitle, onPinToCanvas }) => {
  const [clip, setClip] = useState<Clip | undefined>(initialClip);
  const [clipOpen, setClipOpen] = useState(false);
  const [startText, setStartText] = useState(initialClip?.start != null ? fmtTime(initialClip.start) : '');
  const [endText, setEndText] = useState(initialClip?.end != null ? fmtTime(initialClip.end) : '');
  const [input, setInput] = useState(initialUrl || '');
  const [current, setCurrent] = useState<{ url: string; original: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const go = (raw: string, withClip: Clip | undefined = clip) => {
    const r = toEmbeddableUrl(raw, withClip);
    if (!r || !/[.:]/.test(raw)) {
      setError('웹 주소를 넣어 주세요. 유튜브 영상은 주소를 복사해 붙여 넣으면 바로 재생됩니다.');
      return;
    }
    setError(null);
    const original = sanitizeUrl(raw)!;
    setCurrent({ url: r.url, original, kind: r.kind });
    setInput(original);
    onTitle?.(r.kind === 'youtube' ? '유튜브' : new URL(original).hostname.replace(/^www\./, ''));
  };

  const [clipError, setClipError] = useState<string | null>(null);
  /** 입력한 구간을 읽는다. 잘못되면 null */
  const readClip = (): Clip | undefined | null => {
    const a = parseTime(startText), b = parseTime(endText);
    if ((startText.trim() && a == null) || (endText.trim() && b == null)) { setClipError('시간은 2:10 이나 130 처럼 적어 주세요.'); return null; }
    if (a != null && b != null && b <= a) { setClipError('끝 시간이 시작보다 뒤여야 합니다.'); return null; }
    setClipError(null);
    return a == null && b == null ? undefined : { start: a, end: b };
  };
  const applyClip = () => {
    const c = readClip();
    if (c === null || !current) return;
    setClip(c);
    go(current.original, c);
  };

  useEffect(() => {
    if (initialUrl) go(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <form
        className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-200 bg-white"
        onSubmit={e => { e.preventDefault(); go(input); }}
      >
        <button type="button" onClick={() => setReloadKey(k => k + 1)} disabled={!current} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="새로 고침" aria-label="새로 고침">
          <RotateCw size={15} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="웹 주소 또는 유튜브 영상 주소를 붙여 넣으세요"
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-slate-100 text-[13px] text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
          aria-label="웹 주소"
          onFocus={e => e.currentTarget.select()}
        />
        <button type="submit" className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" title="열기" aria-label="열기">
          <ArrowRight size={15} />
        </button>
        {current && (
          <>
            {current.kind === 'youtube' && (
              <button type="button" onClick={() => setClipOpen(o => !o)} className={`flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-semibold ${clipOpen || clip ? 'bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-100'}`} title="시작·끝 시간을 정해 그 부분만 재생" aria-label="수업 구간 정하기">
                <Scissors size={14} />{clip ? clipLabel(clip) : '구간'}
              </button>
            )}
            {onPinToCanvas && (
              <button type="button" onClick={() => onPinToCanvas(current.original)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="이 주소를 캔버스에 링크 카드로 넣기" aria-label="캔버스에 링크 카드로 넣기">
                <Pin size={15} />
              </button>
            )}
            <a href={current.original} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="새 브라우저 탭에서 열기" aria-label="새 브라우저 탭에서 열기">
              <ExternalLink size={15} />
            </a>
          </>
        )}
      </form>

      <div className="relative flex-1 min-h-0 bg-slate-50">
        {current?.kind === 'youtube' && clipOpen && (
          <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white/95 backdrop-blur ring-1 ring-slate-200 shadow-lg text-[12px]">
            <span className="font-semibold text-slate-600">수업 구간</span>
            <input value={startText} onChange={e => setStartText(e.target.value)} placeholder="시작 (예: 2:10)" className="w-24 h-8 px-2 rounded-lg bg-slate-100 tabular-nums" aria-label="구간 시작" />
            <span className="text-slate-400">~</span>
            <input value={endText} onChange={e => setEndText(e.target.value)} placeholder="끝 (예: 3:05)" className="w-24 h-8 px-2 rounded-lg bg-slate-100 tabular-nums" aria-label="구간 끝" />
            <button type="button" onClick={applyClip} className="h-8 px-3 rounded-lg bg-slate-900 text-white font-semibold">이 구간 재생</button>
            {onPinToCanvas && (
              <button type="button" onClick={() => { const c = readClip(); if (c !== null) onPinToCanvas(current.original, c); }} className="h-8 px-3 rounded-lg bg-red-600 text-white font-semibold">구간 카드로 넣기</button>
            )}
            {clipError && <span className="text-red-500 w-full">{clipError}</span>}
          </div>
        )}
        {current ? (
          <iframe
            key={`${current.url}-${reloadKey}`}
            src={current.url}
            title="웹 화면"
            className="absolute inset-0 w-full h-full border-0 bg-white"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="text-sm font-semibold text-slate-700">수업에 쓸 웹 페이지나 영상을 여세요</div>
            <div className="grid gap-2 w-full max-w-sm">
              {EXAMPLES.map(e => (
                <div key={e.label} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-left">
                  <div className="text-[13px] font-medium text-slate-700">{e.label}</div>
                  <div className="text-[11px] text-slate-400">{e.hint}</div>
                </div>
              ))}
            </div>
            {error && <div className="text-xs text-red-500" role="alert">{error}</div>}
          </div>
        )}
      </div>
      {current && current.kind === 'web' && (
        <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-slate-400 border-t border-slate-100 bg-white">
          <Info size={12} className="shrink-0" />
          화면이 비어 있으면 그 사이트가 다른 앱 안에서 열리는 것을 막아 둔 경우입니다. 오른쪽 위 ↗ 버튼으로 새 탭에서 여세요.
        </div>
      )}
    </div>
  );
};
