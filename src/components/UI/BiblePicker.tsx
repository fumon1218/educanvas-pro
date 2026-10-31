import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Loader2, X, Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { BOOKS, parseBibleRef } from '@/src/lib/templates';
import {
  BIBLE_VERSIONS, getBiblePref, getPassage, isDownloaded, partsToText, refLabel, setBiblePref, versionById,
  type BiblePref, type CardBg, type Passage, type VerseRange,
} from '@/src/lib/bibleText';
import { passagesToText, renderRubyCard } from '@/src/lib/bibleCard';

/**
 * 성경 구절 고르기: 구절을 적거나 책·장을 고르고, 절을 눌러 범위를 정한 뒤 [넣기].
 *   const card = await pickBible('롬 8:28');
 */
export interface BibleCardPayload { ref: string; text: string; bg: CardBg; image?: { url: string; w: number; h: number } }
type Req = { initial?: string; resolve: (v: BibleCardPayload | null) => void };
let push: ((r: Req) => void) | null = null;
export const pickBible = (initial?: string) => new Promise<BibleCardPayload | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ initial, resolve });
});

const CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
const LANGS: [string, string][] = [['ko', '한국어'], ['en', '영어'], ['ja', '일본어']];

export const BibleHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [pref, setPref] = useState<BiblePref>(getBiblePref);
  const [range, setRange] = useState<VerseRange>({ bookNo: 43, chap: 3, from: 16 });
  const [refInput, setRefInput] = useState('');
  const [chapter, setChapter] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    push = r => {
      setReq(prev => { prev?.resolve(null); return r; });
      const p = r.initial ? parseBibleRef(r.initial.replace(/편/, '')) : null;
      if (p) { setRange({ bookNo: p.bookNo, chap: p.chap, from: p.from, to: p.to }); setRefInput(p.ref); }
      else setRefInput('');
      setErr(''); anchor.current = null;
    };
    return () => { push = null; };
  }, []);
  useEffect(() => { if (req) { setTimeout(() => inputRef.current?.focus(), 60); Promise.all(BIBLE_VERSIONS.map(async v => [v.id, await isDownloaded(v)] as const)).then(x => setHave(Object.fromEntries(x))); } }, [req]);

  const versions = useMemo(() => pref.versions.map(versionById).filter(Boolean) as NonNullable<ReturnType<typeof versionById>>[], [pref.versions]);
  const first = versions[0];
  const hasRuby = versions.some(v => v.ruby);

  // 첫 번역본으로 장 전체를 미리 보기
  useEffect(() => {
    if (!req || !first) { setChapter(null); return; }
    let live = true;
    setLoading(true); setErr('');
    getPassage(first, { bookNo: range.bookNo, chap: range.chap })
      .then(p => { if (live) { setChapter(p); setHave(h => ({ ...h, [first.id]: true })); } })
      .catch(() => { if (live) { setChapter(null); setErr('본문을 받지 못했습니다. 인터넷 연결을 확인해 주세요. (한 번 받은 번역본은 인터넷 없이도 됩니다)'); } })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [req, first, range.bookNo, range.chap]);

  const bookName = BOOKS[range.bookNo - 1]?.[0] || '';
  const label = refLabel(bookName, range);
  const savePref = (p: BiblePref) => { setPref(p); setBiblePref(p); };
  const toggleVersion = (id: string) => {
    const on = pref.versions.includes(id);
    const next = on ? pref.versions.filter(x => x !== id) : [...pref.versions, id].slice(-4);
    if (next.length) savePref({ ...pref, versions: next });
  };
  const applyRef = (s: string) => {
    const p = parseBibleRef(s.replace(/편/, ''));
    if (!p) { setErr('구절을 알아보지 못했습니다. 예: 롬 8:28-30, 요한복음 3장 16절, 시 23'); return false; }
    setErr(''); setRange({ bookNo: p.bookNo, chap: p.chap, from: p.from, to: p.to }); setRefInput(p.ref);
    return true;
  };
  // 절을 처음 누르면 시작, 다음에 누르면 끝
  const anchor = useRef<number | null>(null);
  const clickVerse = (n: number) => {
    const a = anchor.current;
    const next = a == null || a === n ? { ...range, from: n, to: undefined } : { ...range, from: Math.min(a, n), to: Math.max(a, n) };
    anchor.current = a == null ? n : null;
    setRange(next);
    setRefInput(refLabel(bookName, next));
  };
  const inRange = (n: number) => range.from == null || (n >= range.from && n <= (range.to ?? range.from));

  const done = (v: BibleCardPayload | null) => { req?.resolve(v); setReq(null); };
  const insert = async () => {
    if (refInput && refInput !== label && !applyRef(refInput)) return;
    const r = refInput && refInput !== label ? parseBibleRef(refInput.replace(/편/, '')) : null;
    const use: VerseRange = r ? { bookNo: r.bookNo, chap: r.chap, from: r.from, to: r.to } : range;
    setBusy(true);
    try {
      const ps = (await Promise.all(versions.map(v => getPassage(v, use)))).filter(p => p.verses.length);
      if (!ps.length) { setErr('그 구절이 없습니다. 장·절 번호를 확인해 주세요.'); return; }
      const ref = refLabel(BOOKS[use.bookNo - 1][0], use);
      const opts = { ruby: pref.ruby, numbers: pref.numbers, bg: pref.bg };
      const text = passagesToText(ref, ps, opts);
      const image = pref.ruby === 'over' && ps.some(p => p.version.ruby) ? await renderRubyCard(ref, ps, opts) : undefined;
      done({ ref, text, image, bg: pref.bg });
    } catch {
      setErr('본문을 받지 못했습니다. 인터넷 연결을 확인해 주세요.');
    } finally { setBusy(false); }
  };

  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="성경 구절 카드"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onKeyDown={e => { if (e.key === 'Escape') done(null); e.stopPropagation(); }}
            className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><BookOpen size={20} /></div>
              <h2 className="flex-1 text-[17px] font-bold text-slate-900">성경 구절 카드</h2>
              <button onClick={() => done(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>

            <div className="px-5 space-y-3 overflow-y-auto">
              {/* 구절 */}
              <form onSubmit={e => { e.preventDefault(); applyRef(refInput); }} className="flex flex-wrap gap-2">
                <input ref={inputRef} value={refInput} onChange={e => setRefInput(e.target.value)} placeholder="예: 롬 8:28-30, 시 23" aria-label="구절"
                  onBlur={() => refInput && refInput !== label && applyRef(refInput)}
                  className="flex-1 min-w-[160px] h-11 px-3.5 rounded-xl bg-slate-100 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-amber-300" />
                <select value={range.bookNo} onChange={e => { const b = Number(e.target.value); const r = { bookNo: b, chap: 1 }; setRange(r); setRefInput(refLabel(BOOKS[b - 1][0], r)); }}
                  aria-label="책" className="h-11 px-2 rounded-xl bg-slate-100 text-[14px]">
                  {BOOKS.map((b, i) => <option key={b[2]} value={i + 1}>{b[0]}</option>)}
                </select>
                <select value={range.chap} onChange={e => { const r = { bookNo: range.bookNo, chap: Number(e.target.value) }; setRange(r); setRefInput(refLabel(bookName, r)); }}
                  aria-label="장" className="h-11 px-2 rounded-xl bg-slate-100 text-[14px]">
                  {Array.from({ length: CHAPTERS[range.bookNo - 1] || 1 }, (_, i) => <option key={i} value={i + 1}>{i + 1}장</option>)}
                </select>
              </form>

              {/* 번역본 */}
              <div>
                <p className="text-[12px] text-slate-500 mb-1.5">번역본 (여러 개 고르면 나란히 · 최대 4개) <span className="text-slate-400">· ✓ 받아 둔 번역본</span></p>
                {LANGS.map(([lang, ln]) => (
                  <div key={lang} className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="w-12 text-[12px] font-semibold text-slate-400">{ln}</span>
                    {BIBLE_VERSIONS.filter(v => v.lang === lang).map(v => {
                      const on = pref.versions.includes(v.id);
                      return (
                        <button key={v.id} type="button" onClick={() => toggleVersion(v.id)} aria-pressed={on}
                          className={cn('h-8 px-2.5 rounded-lg text-[13px] font-medium ring-1 transition-colors', on ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
                          {v.name}{have[v.id] && <Check size={11} className="inline ml-0.5 -mt-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* 표시 방식 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600">
                {hasRuby && (
                  <span className="flex items-center gap-1.5">
                    한자 읽는 법
                    {([['paren', '괄호로 (글자)'], ['over', '위에 작게 (그림)']] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => savePref({ ...pref, ruby: k })} aria-pressed={pref.ruby === k}
                        className={cn('h-7 px-2.5 rounded-lg ring-1', pref.ruby === k ? 'bg-slate-800 text-white ring-slate-800' : 'ring-slate-200 hover:bg-slate-50')}>{l}</button>
                    ))}
                  </span>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={pref.numbers} onChange={e => savePref({ ...pref, numbers: e.target.checked })} /> 절 번호
                </label>
                <span className="flex items-center gap-1.5">
                  바탕
                  {([['yellow', '노랑', 'bg-amber-100'], ['white', '흰색', 'bg-white'], ['none', '투명', 'bg-[conic-gradient(#e2e8f0_25%,#fff_0_50%,#e2e8f0_0_75%,#fff_0)] bg-[length:8px_8px]']] as const).map(([k, l, sw]) => (
                    <button key={k} type="button" onClick={() => savePref({ ...pref, bg: k as CardBg })} aria-pressed={pref.bg === k}
                      className={cn('h-7 pl-1.5 pr-2.5 rounded-lg ring-1 flex items-center gap-1.5', pref.bg === k ? 'ring-2 ring-slate-800 font-semibold' : 'ring-slate-200 hover:bg-slate-50')}>
                      <span className={cn('w-4 h-4 rounded ring-1 ring-slate-300', sw)} />{l}
                    </button>
                  ))}
                </span>
              </div>
              {hasRuby && (
                <p className="text-[12px] text-slate-500 -mt-1">
                  {pref.ruby === 'over' ? '카드가 그림으로 들어갑니다. 글자 크기·색을 바꾸려면 카드를 고른 뒤 [글자로 바꾸기]를 누르세요.' : '太初(태초)처럼 괄호로 넣습니다. 글자를 고치고, 크기·굵기·색·바탕도 바꿀 수 있습니다.'}
                </p>
              )}

              {/* 미리 보기 */}
              <div className="rounded-2xl bg-amber-50/60 ring-1 ring-amber-100 p-3 min-h-[140px] max-h-[38vh] overflow-y-auto">
                <p className="text-[12px] text-amber-800 font-semibold mb-1.5">{label} {first ? `· ${first.name}` : ''} <span className="font-normal text-amber-700/70">— 절을 누르면 처음, 한 번 더 누르면 끝</span></p>
                {loading ? (
                  <div className="py-8 flex flex-col items-center gap-2 text-slate-400 text-[13px]">
                    <Loader2 className="animate-spin" />
                    {first && !have[first.id] && <span>{first.name}을(를) 처음 한 번 받고 있습니다 (약 2MB)…</span>}
                  </div>
                ) : chapter ? (
                  <ol className="space-y-0.5">
                    {chapter.verses.map(v => (
                      <li key={v.n}>
                        <button type="button" onClick={() => clickVerse(v.n)}
                          className={cn('w-full text-left px-2 py-1 rounded-lg text-[14px] leading-relaxed', inRange(v.n) && range.from != null ? 'bg-amber-200/70 text-slate-900' : 'text-slate-600 hover:bg-white')}>
                          <sup className="font-bold text-amber-700 mr-1">{v.n}</sup>
                          {v.parts.map((p, i) => p.rt && pref.ruby === 'over' ? <ruby key={i}>{p.t}<rt className="text-[10px] text-amber-700">{p.rt}</rt></ruby> : <React.Fragment key={i}>{p.rt ? partsToText([p]) : p.t}</React.Fragment>)}
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
              {err && <p className="text-[13px] text-red-600">{err}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 pt-4">
              <button type="button" onClick={() => done(null)} className="h-10 px-4 rounded-xl text-[14px] text-slate-600 hover:bg-slate-100">취소</button>
              <button type="button" onClick={insert} disabled={busy || !versions.length}
                className="h-10 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[14px] font-semibold flex items-center gap-1.5">
                {busy && <Loader2 size={15} className="animate-spin" />} 넣기
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
