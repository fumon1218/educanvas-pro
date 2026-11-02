import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, PenLine } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useStudyData } from '@/src/lib/culture/studyData';
import { TRACE_DECKS, TRACE_MAX_PAGES, traceDeckDef, traceItems, tracePreview, type TraceDeck, type TraceOpts } from '@/src/lib/culture/trace';

/** 따라 쓰기 자료·범위 고르기: const o = await pickTrace('hanja') → TraceOpts (취소면 null) */
type Req = { n: number; deck?: string; resolve: (o: TraceOpts | null) => void };
let seq = 0;
let push: ((r: Req) => void) | null = null;
export const pickTrace = (deck?: string) => new Promise<TraceOpts | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ n: ++seq, deck, resolve });
});

const LAST_KEY = 'okssam_trace_last';
const loadLast = (): Partial<Record<TraceDeck, number>> => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}; } catch { return {}; } };

export const TracePickerHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    push = r => setReq(prev => { prev?.resolve(null); return r; });
    return () => { push = null; };
  }, []);
  return <AnimatePresence>{req && <TraceDialog key={req.n} req={req} close={() => setReq(null)} />}</AnimatePresence>;
};

/** 열려 있을 때만 학습 자료를 불러온다 */
const TraceDialog: React.FC<{ req: Req; close: () => void }> = ({ req, close }) => {
  const first = (traceDeckDef(req.deck || (() => { try { return localStorage.getItem('okssam_culture_deck') || ''; } catch { return ''; } })())?.id || 'hanja') as TraceDeck;
  const [deck, setDeck] = useState<TraceDeck>(first);
  const [start, setStart] = useState(() => loadLast()[first] || 1);
  const [pages, setPages] = useState(2);
  const [todoOnly, setTodoOnly] = useState(false);
  const { data, error, retry } = useStudyData();
  const def = traceDeckDef(deck)!;
  const total = data ? def.items(data).length : 0;

  // 덱을 바꾸면 지난번에 쓴 다음 번호부터
  const pickDeck = (d: TraceDeck) => { setDeck(d); setStart(loadLast()[d] || 1); };

  const count = def.perPage * pages;
  const opts: TraceOpts = { deck, start: Math.min(Math.max(1, start), Math.max(1, total)), count, todoOnly };
  const items = useMemo(() => (data ? traceItems(data, opts) : []), [data, deck, opts.start, count, todoOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (ok: boolean) => {
    if (ok && items.length) {
      const last = data ? def.items(data).indexOf(items[items.length - 1]) + 2 : 1;
      try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...loadLast(), [deck]: last > total ? 1 : last })); } catch { /* 무시 */ }
    }
    req.resolve(ok && items.length ? opts : null);
    close();
  };

  return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(false)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div role="dialog" aria-modal="true" aria-label="따라 쓰기 노트 만들기"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onKeyDown={e => { if (e.key === 'Escape') done(false); e.stopPropagation(); }}
            className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 bg-white rounded-3xl shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600"><PenLine size={18} /></div>
              <h2 className="text-[17px] font-bold text-slate-900">따라 쓰기 노트</h2>
            </div>
            <p className="mt-1.5 text-[12.5px] text-slate-500">흐린 글씨 위에 펜으로 따라 쓰고, 빈칸에 혼자 써 봅니다.</p>

            {error ? (
              <div className="py-8 text-center text-sm text-slate-500">{error}<button onClick={retry} className="block mx-auto mt-2 h-9 px-4 rounded-xl bg-slate-100 font-semibold">다시 불러오기</button></div>
            ) : !data ? (
              <div className="py-10 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
            ) : (
              <>
                <div className="mt-4 text-[12px] font-semibold text-slate-500">무엇을 쓸까요?</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {TRACE_DECKS.map(d => (
                    <button key={d.id} onClick={() => pickDeck(d.id)} aria-pressed={deck === d.id}
                      className={cn('h-10 px-2 rounded-xl text-[13px] font-semibold', deck === d.id ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}>
                      {d.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-slate-500">몇 번부터 (전체 {total})</span>
                    <input type="number" min={1} max={total} value={start} onChange={e => setStart(Number(e.target.value) || 1)}
                      className="mt-1.5 w-full h-10 px-3 rounded-xl bg-slate-100 text-[15px] tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-rose-200" />
                  </label>
                  <div>
                    <span className="text-[12px] font-semibold text-slate-500">몇 쪽</span>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                      {[1, 2, 4, 8].filter(n => n <= TRACE_MAX_PAGES).map(n => (
                        <button key={n} onClick={() => setPages(n)} aria-pressed={pages === n}
                          className={cn('h-10 rounded-xl text-[14px] font-semibold', pages === n ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700')}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
                  <input type="checkbox" checked={todoOnly} onChange={e => setTodoOnly(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                  카드 학습에서 외운 것은 빼기
                </label>

                <div className="mt-4 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                  <div className="text-[12px] font-semibold text-slate-500">{items.length}개{def.kind === 'text' ? ' 조문' : ` · 약 ${Math.max(1, Math.ceil(items.length / def.perPage))}쪽`}</div>
                  <div className={cn('mt-1 text-slate-800 line-clamp-2 break-all', ['hanja', 'cheonja', 'saja'].includes(deck) ? 'text-[20px] font-serif' : 'text-[14px]')}>
                    {items.slice(0, 16).map(x => tracePreview(deck, x)).join(deck === 'hanja' ? ' ' : ' · ')}{items.length > 16 ? ' …' : ''}
                  </div>
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => done(false)} className="h-10 px-4 rounded-xl text-[14px] text-slate-600 hover:bg-slate-100">취소</button>
              <button onClick={() => done(true)} disabled={!items.length} className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-[14px] font-semibold">노트 만들기</button>
            </div>
          </motion.div>
        </div>
  );
};
