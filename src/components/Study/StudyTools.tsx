import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookmarkPlus, Loader2, Timer, Play, Pause, Square, BarChart3, Eye, Check, RotateCcw, Layers } from 'lucide-react';
import { lastDays, fmtMin, readLog } from '@/src/lib/study';
import { cn } from '@/src/lib/utils';

const Shell: React.FC<{ isOpen: boolean; onClose: () => void; label: string; icon: React.ElementType; tint: string; title: string; sub?: string; children: React.ReactNode; wide?: boolean }> = ({ isOpen, onClose, label, icon: Icon, tint, title, sub, children, wide }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
        <motion.div role="dialog" aria-modal="true" aria-label={label}
          initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className={cn('relative w-full max-h-[min(88vh,760px)] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5', wide ? 'max-w-2xl' : 'max-w-lg')}>
          <div className="flex items-center gap-3 p-5 border-b border-slate-100">
            <div className={cn('p-2 rounded-xl', tint)}><Icon size={20} /></div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              {sub && <p className="text-xs text-slate-500">{sub}</p>}
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// ---------------------------------------------------------------------------
// 오답 노트에 넣기
// ---------------------------------------------------------------------------

const TAGS_KEY = 'okssam_wrong_tags';
const recentTags = (): string[] => { try { return JSON.parse(localStorage.getItem(TAGS_KEY) || '[]'); } catch { return []; } };

export const ClipSaveModal: React.FC<{
  image: string | null;
  source: string;
  onClose: () => void;
  onSave: (info: { tag: string; memo: string }) => Promise<void>;
}> = ({ image, source, onClose, onSave }) => {
  const [tag, setTag] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const tags = useMemo(() => recentTags(), [image]);
  useEffect(() => { if (image) { setMemo(''); setTag(recentTags()[0] || ''); } }, [image]);
  const save = async () => {
    setBusy(true);
    try {
      const t = tag.trim().slice(0, 40);
      if (t) try { localStorage.setItem(TAGS_KEY, JSON.stringify([t, ...recentTags().filter(x => x !== t)].slice(0, 8))); } catch { /* 무시 */ }
      await onSave({ tag: t, memo: memo.trim().slice(0, 300) });
    } finally { setBusy(false); }
  };
  return (
    <Shell isOpen={!!image} onClose={onClose} label="오답 노트에 넣기" icon={BookmarkPlus} tint="bg-red-50 text-red-600" title="오답 노트에 넣기" sub={`출처: ${source}`}>
      {image && <img src={image} alt="잘라 낸 문제" className="w-full max-h-64 object-contain rounded-xl ring-1 ring-slate-200 bg-slate-50" />}
      <label className="block mt-4 text-[13px] font-semibold text-slate-700">과목·단원 꼬리표</label>
      <input value={tag} onChange={e => setTag(e.target.value)} placeholder="예: 수학 · 이차함수" aria-label="과목·단원 꼬리표"
        className="mt-1.5 w-full h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-red-200" />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map(t => <button key={t} onClick={() => setTag(t)} className={cn('px-2.5 h-7 rounded-full text-[12px]', t === tag ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600')}>#{t}</button>)}
        </div>
      )}
      <label className="block mt-4 text-[13px] font-semibold text-slate-700">왜 틀렸나요? (메모, 선택)</label>
      <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} placeholder="예: 꼭짓점 공식에서 부호 실수" aria-label="메모"
        className="mt-1.5 w-full px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-red-200 resize-none" />
      <button onClick={save} disabled={busy} className="mt-5 w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <BookmarkPlus size={18} />}오답 노트에 넣기
      </button>
      <p className="mt-2 text-[12px] text-slate-500 text-center">[내 노트 → 학생]의 '오답 노트'에 한 장씩 쌓입니다. 시험 전에 그 노트만 넘겨 보세요.</p>
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// 플래시카드 복습 (화면 아래 떠 있는 막대)
// ---------------------------------------------------------------------------

export const FlashReviewBar: React.FC<{
  card: { index: number; total: number; slide: string; revealed: boolean; box: number } | null;
  done: { known: number; again: number } | null;
  onReveal: () => void;
  onKnown: () => void;
  onAgain: () => void;
  onClose: () => void;
}> = ({ card, done, onReveal, onKnown, onAgain, onClose }) => {
  if (!card && !done) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[95] w-[min(560px,calc(100vw-24px))] p-3 rounded-2xl bg-white/95 backdrop-blur shadow-2xl ring-1 ring-amber-300 flex items-center gap-2" role="region" aria-label="플래시카드 복습">
      <Layers size={18} className="text-amber-600 shrink-0 ml-1" />
      {done ? (
        <>
          <span className="flex-1 text-[14px] text-slate-700"><b>복습 끝!</b> 알았다 {done.known} · 다시 볼 것 {done.again}</span>
          <button onClick={onClose} className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[13px] font-semibold">닫기</button>
        </>
      ) : card && (
        <>
          <span className="flex-1 min-w-0 text-[13px] text-slate-600 truncate"><b className="text-slate-900">{card.index} / {card.total}</b> · {card.slide} · {card.box}단계</span>
          {!card.revealed ? (
            <button onClick={onReveal} className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold flex items-center gap-1.5"><Eye size={17} />보기</button>
          ) : (
            <>
              <button onClick={onAgain} className="h-11 px-4 rounded-xl bg-rose-50 text-rose-700 font-semibold flex items-center gap-1.5"><RotateCcw size={16} />몰랐다</button>
              <button onClick={onKnown} className="h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold flex items-center gap-1.5"><Check size={17} />알았다</button>
            </>
          )}
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="복습 그만하기"><X size={18} /></button>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 공부 기록 + 집중 타이머
// ---------------------------------------------------------------------------

export interface FocusState { phase: 'focus' | 'break'; endsAt: number; paused?: number; focusMin: number; breakMin: number }

export const StudyLogModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  focus: FocusState | null;
  onStartFocus: (focusMin: number, breakMin: number) => void;
}> = ({ isOpen, onClose, focus, onStartFocus }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!isOpen) return; const t = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(t); }, [isOpen]);
  const days = useMemo(() => lastDays(7), [isOpen, tick]);
  const today = days[days.length - 1].log;
  const week = days.reduce((a, d) => a + d.log.minutes, 0);
  const max = Math.max(30, ...days.map(d => d.log.minutes));
  const top = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number }>();
    for (const d of days) for (const [id, e] of Object.entries(d.log.lessons)) { const x = m.get(id) || { name: e.name, minutes: 0 }; x.minutes += e.minutes; x.name = e.name; m.set(id, x); }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  }, [days]);
  const streak = useMemo(() => { const l = readLog(); let n = 0; const d = new Date(); for (;;) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if ((l[k]?.minutes || 0) >= 10) { n++; d.setDate(d.getDate() - 1); } else break; } return n; }, [days]);
  return (
    <Shell isOpen={isOpen} onClose={onClose} label="공부 기록" icon={BarChart3} tint="bg-emerald-50 text-emerald-600" title="공부 기록" sub="수업을 보고 쓴 시간이 1분 단위로 자동 기록됩니다 (이 기기)" wide>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="오늘" value={fmtMin(today.minutes)} />
        <Stat label="최근 7일" value={fmtMin(week)} />
        <Stat label="연속 공부" value={`${streak}일`} hint="하루 10분 이상" />
      </div>
      <div className="mt-5">
        <div className="text-[13px] font-semibold text-slate-700 mb-2">최근 7일</div>
        <div className="flex items-end gap-2 h-36" role="img" aria-label="최근 7일 공부 시간 막대">
          {days.map(d => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11px] text-slate-500 tabular-nums">{d.log.minutes ? fmtMin(d.log.minutes) : ''}</span>
              <div className="w-full rounded-t-lg bg-emerald-500/85" style={{ height: `${Math.max(2, (d.log.minutes / max) * 100)}px` }} title={`${d.label}: ${fmtMin(d.log.minutes)} · 집중 ${d.log.focus}회`} />
              <span className={cn('text-[11px]', d.label === '오늘' ? 'font-bold text-slate-800' : 'text-slate-500')}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      {top.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold text-slate-700 mb-2">수업별 (최근 7일)</div>
          <ul className="space-y-1.5">
            {top.map(t => (
              <li key={t.name} className="flex items-center gap-2 text-[13px]">
                <span className="w-40 truncate text-slate-700">{t.name}</span>
                <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-emerald-400" style={{ width: `${(t.minutes / top[0].minutes) * 100}%` }} /></span>
                <span className="w-16 text-right tabular-nums text-slate-500">{fmtMin(t.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 p-4 rounded-2xl bg-slate-50">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-slate-800"><Timer size={17} />집중 타이머</div>
        <p className="mt-1 text-[12px] text-slate-500">집중하고 쉬기를 번갈아 합니다. 오늘 집중 {today.focus}회.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[[25, 5], [50, 10], [15, 3]].map(([f, b]) => (
            <button key={f} onClick={() => { onStartFocus(f, b); onClose(); }} disabled={!!focus}
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold disabled:opacity-40">{f}분 집중 · {b}분 쉬기</button>
          ))}
        </div>
        {focus && <p className="mt-2 text-[12px] text-emerald-700">타이머가 화면 위쪽에서 돌아가고 있습니다.</p>}
      </div>
    </Shell>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="p-3 rounded-2xl bg-slate-50 text-center">
    <div className="text-[12px] text-slate-500">{label}</div>
    <div className="mt-0.5 text-[20px] font-bold text-slate-900 tabular-nums">{value}</div>
    {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
  </div>
);

/** 화면 위쪽에 떠 있는 집중 타이머 */
export const FocusChip: React.FC<{ focus: FocusState; onPause: () => void; onStop: () => void }> = ({ focus, onPause, onStop }) => {
  const [, set] = useState(0);
  const raf = useRef(0);
  useEffect(() => { const t = setInterval(() => set(n => n + 1), 500); return () => { clearInterval(t); cancelAnimationFrame(raf.current); }; }, []);
  const left = Math.max(0, (focus.paused ?? focus.endsAt - Date.now()) / 1000);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(Math.floor(left % 60)).padStart(2, '0');
  const total = (focus.phase === 'focus' ? focus.focusMin : focus.breakMin) * 60;
  return (
    <div className={cn('fixed top-[76px] left-1/2 -translate-x-1/2 z-[60] h-11 pl-3 pr-1.5 rounded-full shadow-lg ring-1 flex items-center gap-2', focus.phase === 'focus' ? 'bg-emerald-600 text-white ring-emerald-700' : 'bg-sky-100 text-sky-800 ring-sky-200')} role="timer" aria-label={`${focus.phase === 'focus' ? '집중' : '쉬는'} 시간 ${mm}분 ${ss}초 남음`}>
      <Timer size={16} />
      <span className="text-[13px] font-semibold">{focus.phase === 'focus' ? '집중' : '쉬는 시간'}</span>
      <span className="text-[17px] font-bold tabular-nums">{mm}:{ss}</span>
      <span className="w-16 h-1.5 rounded-full bg-black/15 overflow-hidden"><span className="block h-full bg-current opacity-70" style={{ width: `${100 - (left / total) * 100}%` }} /></span>
      <button onClick={onPause} className="p-1.5 rounded-full hover:bg-black/10" aria-label={focus.paused ? '이어서' : '잠시 멈춤'}>{focus.paused ? <Play size={15} /> : <Pause size={15} />}</button>
      <button onClick={onStop} className="p-1.5 rounded-full hover:bg-black/10" aria-label="타이머 끝내기"><Square size={14} /></button>
    </div>
  );
};
