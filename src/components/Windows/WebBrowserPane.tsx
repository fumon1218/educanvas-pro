import React, { useEffect, useState } from 'react';
import { ExternalLink, RotateCw, ArrowRight, Pin, Info } from 'lucide-react';
import { sanitizeUrl } from '@/src/lib/canvasData';

/** 유튜브·비메오·구글 문서 주소를 창 안에서 재생·표시할 수 있는 주소로 바꾼다 */
export function toEmbeddableUrl(raw: string): { url: string; kind: 'youtube' | 'vimeo' | 'google' | 'web' } | null {
  const safe = sanitizeUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const t = u.searchParams.get('t') || u.searchParams.get('start');
  const startSec = t ? parseInt(t.replace(/s$/, ''), 10) : 0;
  const yt = (id: string) => {
    const e = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    e.searchParams.set('rel', '0');
    e.searchParams.set('modestbranding', '1');
    if (startSec > 0) e.searchParams.set('start', String(startSec));
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
  onTitle?: (title: string) => void;
  onPinToCanvas?: (url: string) => void;
}

const EXAMPLES = [
  { label: '유튜브 영상 주소', hint: 'youtube.com/watch?v=… 또는 youtu.be/…' },
  { label: '구글 문서·슬라이드', hint: '공유 링크를 그대로 붙여 넣기' },
  { label: '교육 사이트', hint: '예: phet.colorado.edu' },
];

export const WebBrowserPane: React.FC<Props> = ({ initialUrl, onTitle, onPinToCanvas }) => {
  const [input, setInput] = useState(initialUrl || '');
  const [current, setCurrent] = useState<{ url: string; original: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const go = (raw: string) => {
    const r = toEmbeddableUrl(raw);
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
