import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { renderMonth, renderWeek, weekStart, type CalImage } from '@/src/lib/calendar';

/**
 * 달력 넣기: 월간 달력 또는 주간 계획표 (공휴일 표시)
 *   const img = await pickCalendar();
 */
type Req = { resolve: (v: CalImage | null) => void };
let push: ((r: Req) => void) | null = null;
export const pickCalendar = () => new Promise<CalImage | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ resolve });
});

const PREF = 'okssam_calendar_pref';
const readPref = (): { kind: 'month' | 'week'; mondayFirst: boolean } => {
  try { return { kind: 'month', mondayFirst: false, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { kind: 'month', mondayFirst: false }; }
};

export const CalendarHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [pref, setPref] = useState(readPref);
  const [cursor, setCursor] = useState(() => new Date());
  const [img, setImg] = useState<CalImage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    push = r => { setReq(prev => { prev?.resolve(null); return r; }); setCursor(new Date()); };
    return () => { push = null; };
  }, []);
  const save = (p: typeof pref) => { setPref(p); try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* 무시 */ } };

  const ws = weekStart(cursor, pref.mondayFirst);
  const key = pref.kind === 'month' ? `${cursor.getFullYear()}-${cursor.getMonth()}` : ws.toDateString();
  useEffect(() => {
    if (!req) return;
    let live = true;
    setLoading(true);
    (pref.kind === 'month' ? renderMonth(cursor.getFullYear(), cursor.getMonth() + 1, pref) : renderWeek(ws, pref))
      .then(r => { if (live) setImg(r); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, key, pref.kind, pref.mondayFirst]);

  const move = (n: number) => setCursor(d => {
    const x = new Date(d);
    if (pref.kind === 'month') { x.setDate(1); x.setMonth(x.getMonth() + n); } else x.setDate(x.getDate() + 7 * n);
    return x;
  });
  const done = (v: CalImage | null) => { req?.resolve(v); setReq(null); };
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const title = pref.kind === 'month' ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월` : `${ws.getMonth() + 1}/${ws.getDate()} – ${we.getMonth() + 1}/${we.getDate()}`;

  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="달력 넣기"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onKeyDown={e => { if (e.key === 'Escape') done(null); e.stopPropagation(); }}
            className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600"><CalendarDays size={20} /></div>
              <h2 className="flex-1 text-[17px] font-bold text-slate-900">달력 넣기</h2>
              <button onClick={() => done(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>
            <div className="px-5 space-y-3 overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex p-1 rounded-xl bg-slate-100">
                  {([['month', '월간 달력'], ['week', '주간 계획표']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => save({ ...pref, kind: k })} aria-pressed={pref.kind === k}
                      className={cn('h-8 px-3 rounded-lg text-[13px] font-semibold', pref.kind === k ? 'bg-white shadow text-slate-900' : 'text-slate-500')}>{l}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[13px] text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={pref.mondayFirst} onChange={e => save({ ...pref, mondayFirst: e.target.checked })} /> 월요일부터
                </label>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => move(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500" aria-label={pref.kind === 'month' ? '이전 달' : '이전 주'}><ChevronLeft size={18} /></button>
                <span className="min-w-[150px] text-center text-[16px] font-bold text-slate-800 tabular-nums">{title}</span>
                <button onClick={() => move(1)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500" aria-label={pref.kind === 'month' ? '다음 달' : '다음 주'}><ChevronRight size={18} /></button>
                <button onClick={() => setCursor(new Date())} className="h-8 px-2.5 rounded-lg text-[12px] text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">오늘</button>
              </div>
              <div className="relative rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-slate-50 min-h-[200px]">
                {img && <img src={img.url} alt={img.label} className={cn('w-full block', loading && 'opacity-50')} />}
                {loading && !img && <div className="absolute inset-0 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>}
              </div>
              <p className="text-[12px] text-slate-500">공휴일·대체공휴일은 빨간색으로 표시합니다. 넣은 뒤 칸에 펜이나 글로 적으세요.</p>
            </div>
            <div className="flex items-center justify-end gap-2 p-5 pt-4">
              <button onClick={() => done(null)} className="h-10 px-4 rounded-xl text-[14px] text-slate-600 hover:bg-slate-100">취소</button>
              <button onClick={() => img && done(img)} disabled={!img || loading} className="h-10 px-5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-[14px] font-semibold">넣기</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
