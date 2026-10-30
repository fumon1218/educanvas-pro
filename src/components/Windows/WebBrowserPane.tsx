import React, { useEffect, useRef, useState } from 'react';
import { YouTubePlayer, parseYouTube, type YouTubeHandle, type YouTubeTarget } from './YouTubePlayer';
import { getYouTubeKey, setYouTubeKey, searchYouTube, type YouTubeResult } from '@/src/lib/youtubeSearch';
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

export function toEmbeddableUrl(raw: string, clip?: Clip): { url: string; kind: 'youtube' | 'youtube-home' | 'vimeo' | 'google' | 'web' } | null {
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
    // 첫 화면·검색·채널 페이지는 유튜브가 다른 앱 안에서 열리지 못하게 막아 둔다 → 영상 고르기 안내
    return { url: safe, kind: 'youtube-home' };
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

/** 유튜브 영상 찾기: 검색 키가 있으면 앱 안에서 찾아 바로 재생, 없으면 새 탭에서 찾아 주소 붙여 넣기 */
const YouTubeHelper: React.FC<{ initial: string; onPaste: (url: string) => void }> = ({ initial, onPaste }) => {
  const [q, setQ] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(getYouTubeKey());
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [results, setResults] = useState<YouTubeResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (text = q) => {
    if (!text.trim()) return;
    if (!key) { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(text.trim())}`, '_blank', 'noopener'); return; }
    setBusy(true); setMsg(null);
    try { setResults(await searchYouTube(text)); }
    catch (e: any) { setMsg(e?.message || '찾지 못했습니다.'); if (e?.code === 'bad-key') setShowKey(true); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (initial && key) search(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const pasteFromClipboard = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const r = t ? toEmbeddableUrl(t) : null;
      if (r && r.kind === 'youtube') onPaste(t);
      else setMsg('복사한 내용이 유튜브 영상 주소가 아닙니다. 영상 화면에서 [공유] → [복사]를 눌러 주세요.');
    } catch {
      setMsg('붙여 넣기를 허락하지 않았습니다. 위 주소 칸에 영상 주소를 붙여 넣고(Ctrl/⌘+V) Enter를 눌러 주세요.');
    }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto flex flex-col items-center gap-3 p-5 text-center">
      {!results && (
        <>
          <div className="mt-4 w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center text-xl">▶</div>
          <div>
            <div className="text-[15px] font-bold text-slate-800">수업에 쓸 유튜브 영상 찾기</div>
            <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
              {key ? '찾을 말을 넣으면 수업 화면에서 바로 재생할 수 있는 영상만 보여 줍니다.' : <>유튜브 첫 화면은 다른 앱 안에서 열리지 않습니다. 새 탭에서 영상을 찾아 <b>[공유] → [복사]</b>한 뒤 아래 단추를 누르세요.</>}
            </p>
          </div>
        </>
      )}
      <form onSubmit={e => { e.preventDefault(); search(); }} className="w-full max-w-md flex gap-1.5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="찾을 영상 (예: 광합성 실험)" className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-slate-100 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-red-200" aria-label="유튜브에서 찾을 말" />
        <button type="submit" disabled={busy} className="h-10 px-3 rounded-xl bg-red-600 text-white text-[13px] font-semibold whitespace-nowrap disabled:opacity-60">{busy ? '찾는 중…' : key ? '찾기' : '유튜브에서 찾기 ↗'}</button>
      </form>
      {results && (
        results.length === 0 ? <p className="text-[13px] text-slate-500">찾은 영상이 없습니다.</p> : (
          <div className="w-full grid grid-cols-2 md:grid-cols-3 gap-3 text-left">
            {results.map(v => (
              <button key={v.id} onClick={() => onPaste(`https://www.youtube.com/watch?v=${v.id}`)} className="group text-left rounded-xl overflow-hidden ring-1 ring-slate-200 bg-white hover:ring-red-300 hover:shadow-md transition">
                <div className="relative aspect-video bg-slate-200">
                  {v.thumb && <img src={v.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  {v.duration && <span className="absolute right-1 bottom-1 px-1 rounded bg-black/75 text-white text-[10px] font-semibold tabular-nums">{v.duration}</span>}
                </div>
                <div className="p-2">
                  <div className="text-[12px] font-semibold text-slate-800 line-clamp-2 leading-snug">{v.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">{v.channel}</div>
                </div>
              </button>
            ))}
          </div>
        )
      )}
      {!key && <button onClick={pasteFromClipboard} className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[13px] font-semibold">복사한 영상 주소 붙여 넣기</button>}
      {msg && <p className="text-[12px] text-red-500 max-w-md" role="alert">{msg}</p>}
      <div className="mt-auto pt-2 text-[11px] text-slate-400">
        {!showKey ? (
          <button onClick={() => setShowKey(true)} className="underline underline-offset-2 hover:text-slate-600">{key ? '유튜브 검색 키 바꾸기' : '앱 안에서 바로 찾으려면: 유튜브 검색 키 넣기'}</button>
        ) : (
          <form onSubmit={e => { e.preventDefault(); setYouTubeKey(keyDraft); setKey(keyDraft.trim()); setShowKey(false); setKeyDraft(''); setMsg(null); setResults(null); }} className="flex flex-col items-center gap-1.5">
            <span>Google Cloud의 'YouTube Data API v3' 브라우저용 API 키 (이 기기에만 보관)</span>
            <span className="flex gap-1.5">
              <input value={keyDraft} onChange={e => setKeyDraft(e.target.value)} placeholder="AIza…" className="w-60 h-8 px-2 rounded-lg bg-slate-100 text-[12px] font-mono" aria-label="유튜브 검색 키" autoComplete="off" />
              <button type="submit" className="h-8 px-3 rounded-lg bg-slate-900 text-white font-semibold">저장</button>
              {key && <button type="button" onClick={() => { setYouTubeKey(''); setKey(''); setShowKey(false); setResults(null); }} className="h-8 px-2 rounded-lg bg-slate-100 text-slate-600">지우기</button>}
            </span>
          </form>
        )}
      </div>
    </div>
  );
};

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

  const [ytSearch, setYtSearch] = useState<string | null>(null);
  const ytRef = useRef<YouTubeHandle>(null);
  const ytTarget = React.useMemo<YouTubeTarget | null>(() => {
    if (!current || current.kind !== 'youtube') return null;
    const t = parseYouTube(current.original);
    if (!t) return null;
    return { ...t, ...(clip?.start != null ? { start: clip.start } : {}), ...(clip?.end != null ? { end: clip.end } : {}) };
  }, [current, clip]);
  const go = (raw: string, withClip: Clip | undefined = clip) => {
    // 주소가 아닌 낱말은 유튜브 검색어로 본다
    if (raw.trim() && !/[.:/]/.test(raw.trim())) { setCurrent(null); setError(null); setYtSearch(raw.trim()); return; }
    const r = toEmbeddableUrl(raw, withClip);
    if (r?.kind === 'youtube-home') {
      const u = new URL(r.url);
      setCurrent(null); setError(null);
      setYtSearch(u.searchParams.get('search_query') || '');
      onTitle?.('유튜브');
      return;
    }
    setYtSearch(null);
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
          placeholder="웹 주소, 유튜브 영상 주소 또는 찾을 말"
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
            <button type="button" onClick={() => setStartText(fmtTime(ytRef.current?.getTime() ?? 0))} className="h-8 px-2 rounded-lg bg-slate-100 text-slate-600" title="재생 중인 지금 위치를 시작으로">지금</button>
            <span className="text-slate-400">~</span>
            <input value={endText} onChange={e => setEndText(e.target.value)} placeholder="끝 (예: 3:05)" className="w-24 h-8 px-2 rounded-lg bg-slate-100 tabular-nums" aria-label="구간 끝" />
            <button type="button" onClick={() => setEndText(fmtTime(ytRef.current?.getTime() ?? 0))} className="h-8 px-2 rounded-lg bg-slate-100 text-slate-600" title="재생 중인 지금 위치를 끝으로">지금</button>
            <button type="button" onClick={applyClip} className="h-8 px-3 rounded-lg bg-slate-900 text-white font-semibold">이 구간 재생</button>
            {onPinToCanvas && (
              <button type="button" onClick={() => { const c = readClip(); if (c !== null) onPinToCanvas(current.original, c); }} className="h-8 px-3 rounded-lg bg-red-600 text-white font-semibold">구간 카드로 넣기</button>
            )}
            {clipError && <span className="text-red-500 w-full">{clipError}</span>}
          </div>
        )}
        {ytSearch !== null && !current ? (
          <YouTubeHelper
            initial={ytSearch}
            onPaste={url => go(url)}
          />
        ) : current?.kind === 'youtube' && ytTarget ? (
          <YouTubePlayer key={reloadKey} ref={ytRef} target={ytTarget} watchUrl={current.original} />
        ) : current ? (
          <iframe
            key={`${current.url}-${reloadKey}`}
            src={current.url}
            title="웹 화면"
            className="absolute inset-0 w-full h-full border-0 bg-white"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            // 다른 사이트가 수업 화면 전체를 다른 페이지로 바꾸지 못하게 (상단 이동 금지)
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="text-sm font-semibold text-slate-700">수업에 쓸 웹 페이지나 영상을 여세요</div>
            <button onClick={() => setYtSearch('')} className="flex items-center gap-2 h-11 px-5 rounded-xl bg-red-600 text-white text-[14px] font-semibold shadow-sm hover:bg-red-700">▶ 유튜브 영상 찾기</button>
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
