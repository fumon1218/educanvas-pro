/**
 * 교양 · 카드 학습
 *  사자성어 · 천자문 · 한자 1800 · 영어 VOA 1500 · 영문법 예문 · 일본어 · 스페인어 · 특수교육법
 *  목록 / 카드(뒤집기) / 퀴즈(4지선다). 외운 항목은 이 브라우저에 저장.
 *  (Edu-Scheduler Premium '교양 → 학습' 탭을 옮겨 온 것)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, Shuffle, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useKnown, useStudyData, speak, type StudyData, type Voice } from '@/src/lib/culture/studyData';
import { GRAMMAR_ITEMS } from '@/src/lib/culture/grammar';
import { cn } from '@/src/lib/utils';

type DeckId = 'saja' | 'cheonja' | 'hanja' | 'en' | 'grammar' | 'ja' | 'es' | 'esw' | 'law';
interface DeckDef {
  id: DeckId; label: string; voice?: Voice;
  items: (d: StudyData) => any[];
  front: (x: any) => string; sub?: (x: any) => string; back: (x: any) => string; detail?: (x: any) => string;
  serif?: boolean;
}
const DECKS: DeckDef[] = [
  { id: 'saja', label: '사자성어', items: d => d.saja, front: x => x.h, sub: x => x.r, back: x => x.m, detail: x => [x.hun.join(' · '), x.n].filter(Boolean).join('\n'), serif: true },
  { id: 'cheonja', label: '천자문', items: d => d.cheonja, front: x => x.h, sub: x => x.r, back: x => x.m, serif: true },
  { id: 'hanja', label: '한자 1800', items: d => d.hanja, front: x => x.c, sub: x => x.e, back: x => `${x.hun} ${x.e}`, detail: x => (x.jp ? `일본어 훈독: ${x.jp}` : ''), serif: true },
  { id: 'en', label: '영어 VOA 1500', voice: 'en-US', items: d => d.en, front: x => x.w, back: x => x.k || x.d, detail: x => x.d },
  { id: 'grammar', label: '영문법 예문', voice: 'en-US', items: () => GRAMMAR_ITEMS, front: x => x.en, sub: x => x.lesson, back: x => x.ko, detail: x => x.note },
  { id: 'ja', label: '일본어 기초 문장', voice: 'ja-JP', items: d => d.ja, front: x => x.t, sub: x => [x.kana, x.p].filter(Boolean).join(' · '), back: x => x.k, detail: x => x.n },
  { id: 'es', label: '스페인어 문장', voice: 'es-ES', items: d => d.es, front: x => x.t, sub: x => x.p, back: x => x.k, detail: x => x.n },
  { id: 'esw', label: '스페인어 단어', voice: 'es-ES', items: d => d.esw, front: x => x.w, sub: x => x.c, back: x => x.k },
  { id: 'law', label: '특수교육법', items: d => d.law, front: x => `${x.no} (${x.t})`, sub: x => x.ch, back: x => x.x },
];
const HANJA_DECKS: DeckId[] = ['saja', 'cheonja', 'hanja'];
const DECK_KEY = 'okssam_culture_deck';
const loadDeck = (): DeckId => { try { const v = localStorage.getItem(DECK_KEY) as DeckId | null; return v && DECKS.some(d => d.id === v) ? v : 'saja'; } catch { return 'saja'; } };

function shuffleArr<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

const SpeakBtn: React.FC<{ text: string; lang: Voice; small?: boolean }> = ({ text, lang, small }) => (
  <button type="button" title="듣기" aria-label="듣기"
    onClick={e => { e.stopPropagation(); if (!speak(text, lang)) toast.error('이 브라우저는 소리 내어 읽기를 지원하지 않습니다.'); }}
    className={cn('rounded-full ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center shrink-0', small ? 'w-7 h-7' : 'w-9 h-9')}>
    <Volume2 size={small ? 13 : 16} />
  </button>
);

const KnownBtn: React.FC<{ known: boolean; onClick: () => void; small?: boolean }> = ({ known, onClick, small }) => (
  <button type="button" onClick={e => { e.stopPropagation(); onClick(); }} aria-pressed={known}
    className={cn('rounded-full font-semibold flex items-center gap-1 ring-1 transition-colors shrink-0', small ? 'h-7 px-2.5 text-[11px]' : 'h-9 px-3.5 text-[13px]',
      known ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-800')}>
    <Check size={small ? 12 : 14} />{known ? '외웠어요' : '외우기'}
  </button>
);

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="flex p-1 bg-slate-100 rounded-xl">
    {options.map(([v, l]) => (
      <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={cn('px-3 h-7 rounded-lg text-[12.5px] font-semibold', value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>{l}</button>
    ))}
  </div>
);

export const CultureStudy: React.FC = () => {
  const { data, error, retry } = useStudyData();
  const known = useKnown();
  const [deck, setDeckState] = useState<DeckId>(loadDeck);
  const [mode, setMode] = useState<'list' | 'card' | 'quiz'>('card');
  const [filter, setFilter] = useState<'all' | 'todo' | 'known'>('all');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(0);
  const [limit, setLimit] = useState(60);
  const setDeck = (d: DeckId) => { setDeckState(d); try { localStorage.setItem(DECK_KEY, d); } catch { /* 무시 */ } };
  useEffect(() => { setLimit(60); setStage(0); }, [deck]);

  const def = DECKS.find(d => d.id === deck) || DECKS[0];
  const all = useMemo(() => (data ? def.items(data) : []), [data, def]);
  const knownSet = known.knownSet(deck);
  const list = useMemo(() => all.filter((x: any) => {
    if (deck === 'saja' && stage && x.st !== stage) return false;
    if (filter === 'todo' && knownSet.has(x.id)) return false;
    if (filter === 'known' && !knownSet.has(x.id)) return false;
    if (q) { const s = JSON.stringify(x).toLowerCase(); if (!s.includes(q.toLowerCase())) return false; }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, deck, stage, filter, q, filter !== 'all' ? knownSet : null]);

  if (error) return (
    <div className="py-20 text-center text-sm text-slate-500">
      <p>{error}</p>
      <button onClick={retry} className="mt-3 h-9 px-4 rounded-xl bg-slate-100 text-slate-700 font-semibold">다시 불러오기</button>
    </div>
  );
  if (!data) return <div className="py-24 flex flex-col items-center gap-2 text-slate-400"><Loader2 className="animate-spin" /><span className="text-sm">학습 자료를 불러오는 중…</span></div>;

  return (
    <div className="space-y-4">
      {/* 덱 */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="학습 자료">
        {DECKS.map(d => {
          const total = d.items(data).length, kn = known.count(d.id), on = deck === d.id;
          return (
            <button key={d.id} role="tab" aria-selected={on} onClick={() => setDeck(d.id)}
              className={cn('px-3 py-2 rounded-xl text-left ring-1 transition-colors', on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-800 ring-slate-200 hover:ring-indigo-300')}>
              <div className="text-[13px] font-semibold">{d.label}</div>
              <div className={cn('text-[11px] mt-0.5 tabular-nums', on ? 'text-indigo-100' : 'text-slate-400')}>{kn} / {total} 외움</div>
            </button>
          );
        })}
      </div>

      {/* 보기 방식 · 거르기 · 찾기 */}
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="보기 방식" value={mode} onChange={setMode} options={[['card', '카드'], ['list', '목록'], ['quiz', '퀴즈']]} />
        <Seg label="거르기" value={filter} onChange={setFilter} options={[['all', '전체'], ['todo', '아직'], ['known', '외운 것']]} />
        {deck === 'saja' && (
          <select value={stage} onChange={e => setStage(Number(e.target.value))} aria-label="난이도" className="h-9 px-3 bg-slate-100 rounded-xl text-[12.5px] font-semibold text-slate-700 outline-none">
            <option value={0}>난이도 전체</option>
            {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>{s}단계{s === 1 ? ' (쉬움)' : s === 5 ? ' (어려움)' : ''}</option>)}
          </select>
        )}
        <label className="relative flex-1 min-w-[160px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`${def.label}에서 찾기`} aria-label="카드 찾기"
            className="w-full h-9 pl-8 pr-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" />
        </label>
        <span className="text-[12px] text-slate-400 tabular-nums">{list.length}개</span>
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500 rounded-2xl ring-1 ring-slate-200">해당하는 카드가 없습니다.</div>
      ) : mode === 'list' ? (
        <>
          <div className={cn('grid gap-3', deck === 'law' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
            {list.slice(0, limit).map((x: any) => (
              <div key={x.id} className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn('font-bold text-slate-900 break-words', def.serif ? 'font-serif text-2xl' : 'text-base')}>{def.front(x)}</div>
                    {def.sub?.(x) && <div className="text-[12px] text-indigo-600 font-semibold mt-0.5">{def.sub(x)}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {def.voice && <SpeakBtn text={def.front(x)} lang={def.voice} small />}
                    <KnownBtn small known={knownSet.has(x.id)} onClick={() => known.setKnown(deck, x.id, !knownSet.has(x.id))} />
                  </div>
                </div>
                <div className={cn('text-sm text-slate-700 mt-2 leading-relaxed', deck === 'law' && 'whitespace-pre-line text-[13px]')}>{def.back(x)}</div>
                {def.detail?.(x) && <div className="text-[11.5px] text-slate-500 mt-1.5 whitespace-pre-line leading-relaxed">{def.detail(x)}</div>}
              </div>
            ))}
          </div>
          {list.length > limit && (
            <button onClick={() => setLimit(limit + 90)} className="w-full h-10 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">더 보기 ({list.length - limit}개 남음)</button>
          )}
        </>
      ) : mode === 'card' ? (
        <FlashCards key={deck + filter + stage + q} def={def} list={list} known={knownSet} onKnown={(id, v) => known.setKnown(deck, id, v)} />
      ) : (
        <Quiz key={deck + filter + stage + q} def={def} list={list} pool={all} onKnown={id => known.setKnown(deck, id, true)} />
      )}
    </div>
  );
};

const FlashCards: React.FC<{ def: DeckDef; list: any[]; known: Set<string>; onKnown: (id: string, v: boolean) => void }> = ({ def, list, known, onKnown }) => {
  const [order, setOrder] = useState(list);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const x = order[Math.min(i, order.length - 1)];
  const go = (n: number) => { setFlip(false); setI(v => ((v + n) % order.length + order.length) % order.length); };

  // ← → 넘기기, 스페이스 뒤집기 (입력 칸에 쓰는 중이면 무시)
  //  먼저 받아서(capture) 멈춰야 뒤에 있는 판서 슬라이드가 같이 넘어가지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const act = e.key === 'ArrowRight' ? () => go(1) : e.key === 'ArrowLeft' ? () => go(-1) : e.key === ' ' ? () => setFlip(f => !f) : null;
      if (!act) return;
      e.preventDefault(); e.stopPropagation();
      act();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.length]);

  if (!x) return null;
  const isHanja = HANJA_DECKS.includes(def.id);
  const isKnown = known.has(x.id);
  return (
    <div className="max-w-2xl mx-auto">
      <div className="relative">
        <button onClick={() => setFlip(!flip)} aria-label={flip ? '앞면 보기' : '뒷면 보기'}
          className={cn('w-full min-h-[300px] rounded-3xl ring-1 shadow-sm p-8 flex flex-col items-center justify-center text-center transition-colors',
            flip ? 'bg-indigo-50/60 ring-indigo-100' : 'bg-white ring-slate-200')}>
          {!flip ? (
            <>
              <div className={cn('font-bold text-slate-900 break-words', def.serif ? 'font-serif text-5xl sm:text-6xl tracking-widest' : 'text-3xl')}>{def.front(x)}</div>
              {def.sub?.(x) && !isHanja && <div className="text-sm text-slate-500 mt-3">{def.sub(x)}</div>}
              <div className="text-[12px] text-slate-400 mt-6 flex items-center gap-1"><RotateCcw size={12} />눌러서 뒤집기</div>
            </>
          ) : (
            <>
              {def.sub?.(x) && <div className="text-sm font-bold text-indigo-600 mb-2">{def.sub(x)}</div>}
              <div className={cn('text-slate-800 leading-relaxed', def.id === 'law' ? 'text-sm text-left whitespace-pre-line max-h-[360px] overflow-y-auto' : 'text-xl font-bold')}>{def.back(x)}</div>
              {def.detail?.(x) && <div className="text-[12px] text-slate-500 mt-3 whitespace-pre-line">{def.detail(x)}</div>}
            </>
          )}
        </button>
        {def.voice && <div className="absolute top-3 right-3"><SpeakBtn text={def.front(x)} lang={def.voice} /></div>}
      </div>
      <div className="flex items-center justify-between mt-4 gap-2">
        <button onClick={() => go(-1)} aria-label="이전 카드" className="w-11 h-11 rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center justify-center"><ChevronLeft size={20} /></button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="text-[12px] text-slate-500 tabular-nums">{Math.min(i, order.length - 1) + 1} / {order.length}</span>
          <button onClick={() => { setOrder(shuffleArr(list)); setI(0); setFlip(false); }} className="h-9 px-3 rounded-full bg-white ring-1 ring-slate-200 text-[13px] font-semibold text-slate-600 flex items-center gap-1"><Shuffle size={14} />섞기</button>
          <KnownBtn known={isKnown} onClick={() => { onKnown(x.id, !isKnown); if (!isKnown) go(1); }} />
        </div>
        <button onClick={() => go(1)} aria-label="다음 카드" className="w-11 h-11 rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center justify-center"><ChevronRight size={20} /></button>
      </div>
      <p className="hidden md:block text-center text-[11.5px] text-slate-400 mt-3">← → 키로 넘기고, 스페이스로 뒤집어요</p>
    </div>
  );
};

const Quiz: React.FC<{ def: DeckDef; list: any[]; pool: any[]; onKnown: (id: string) => void }> = ({ def, list, pool, onKnown }) => {
  const isLaw = def.id === 'law';
  const make = () => {
    const x = list[Math.floor(Math.random() * list.length)];
    const ans = isLaw ? `${x.no} (${x.t})` : def.back(x);
    const others = shuffleArr(pool.filter(p => p.id !== x.id)).slice(0, 12).map(p => (isLaw ? `${p.no} (${p.t})` : def.back(p))).filter(s => s !== ans);
    const opts = shuffleArr([ans, ...Array.from(new Set(others)).slice(0, 3)]);
    return { x, ans, opts };
  };
  const [cur, setCur] = useState(make);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  const pick = (o: string) => {
    if (picked) return;
    setPicked(o);
    setScore(s => ({ ok: s.ok + (o === cur.ans ? 1 : 0), n: s.n + 1 }));
  };
  const next = () => { setPicked(null); setCur(make()); };
  const x = cur.x;
  const question = isLaw ? (x.x.length > 220 ? x.x.slice(0, 220) + '…' : x.x) : def.front(x);
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-[12px] text-slate-500 text-right mb-2 tabular-nums">맞힌 문제 {score.ok} / {score.n}</div>
      <div className="relative bg-white rounded-3xl ring-1 ring-slate-200 p-8 text-center shadow-sm">
        {def.voice && <div className="absolute top-3 right-3"><SpeakBtn text={def.front(x)} lang={def.voice} small /></div>}
        <div className="text-[12px] font-semibold text-slate-400 mb-3">{isLaw ? '어느 조문일까요?' : '뜻을 고르세요'}</div>
        <div className={cn('text-slate-900 break-words', isLaw ? 'text-sm text-left whitespace-pre-line leading-relaxed' : def.serif ? 'font-serif text-5xl font-bold tracking-widest' : 'text-3xl font-bold')}>{question}</div>
        {!isLaw && def.sub?.(x) && picked && <div className="text-sm text-indigo-600 font-bold mt-3">{def.sub(x)}</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        {cur.opts.map(o => {
          const state = !picked ? '' : o === cur.ans ? 'ok' : o === picked ? 'bad' : '';
          return (
            <button key={o} onClick={() => pick(o)} disabled={!!picked && state === ''}
              className={cn('p-4 rounded-2xl ring-1 text-sm font-semibold text-left transition-colors',
                state === 'ok' ? 'bg-emerald-50 ring-emerald-400 text-emerald-800' : state === 'bad' ? 'bg-red-50 ring-red-300 text-red-700' : 'bg-white ring-slate-200 text-slate-800 hover:ring-indigo-300 disabled:opacity-60')}>{o}</button>
          );
        })}
      </div>
      {picked && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {picked === cur.ans && <button onClick={() => { onKnown(x.id); next(); }} className="h-10 px-4 rounded-full bg-white ring-1 ring-slate-200 text-sm font-semibold flex items-center gap-1"><Check size={14} />외웠어요로 표시하고 다음</button>}
          <button onClick={next} className="h-10 px-5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">다음 문제</button>
        </div>
      )}
    </div>
  );
};
