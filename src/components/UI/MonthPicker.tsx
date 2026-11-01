import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/** 연도·월 고르기: const d = await pickMonth('교회 계획', new Date()) → 그 달 1일 (취소면 null) */
type Req = { title: string; initial: Date; resolve: (d: Date | null) => void };
let push: ((r: Req) => void) | null = null;
export const pickMonth = (title: string, initial: Date) => new Promise<Date | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ title, initial, resolve });
});

export const MonthPickerHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  useEffect(() => {
    push = r => { setReq(prev => { prev?.resolve(null); return r; }); setYear(r.initial.getFullYear()); setMonth(r.initial.getMonth()); };
    return () => { push = null; };
  }, []);
  const done = (d: Date | null) => { req?.resolve(d); setReq(null); };
  const now = new Date();
  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div role="dialog" aria-modal="true" aria-label={`${req.title} 달 고르기`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onKeyDown={e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter') done(new Date(year, month, 1)); e.stopPropagation(); }}
            className="relative w-full max-w-sm p-5 bg-white rounded-3xl shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-violet-50 text-violet-600"><CalendarDays size={18} /></div>
              <h2 className="text-[17px] font-bold text-slate-900">{req.title} · 몇 월?</h2>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button onClick={() => setYear(y => y - 1)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500" aria-label="이전 해"><ChevronLeft size={18} /></button>
              <span className="min-w-[90px] text-center text-[18px] font-bold tabular-nums text-slate-800">{year}년</span>
              <button onClick={() => setYear(y => y + 1)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500" aria-label="다음 해"><ChevronRight size={18} /></button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => (
                <button key={i} onClick={() => setMonth(i)} aria-pressed={month === i}
                  className={cn('h-11 rounded-xl text-[15px] font-semibold', month === i ? 'bg-violet-600 text-white' : year === now.getFullYear() && i === now.getMonth() ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}>
                  {i + 1}월
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => done(null)} className="h-10 px-4 rounded-xl text-[14px] text-slate-600 hover:bg-slate-100">취소</button>
              <button onClick={() => done(new Date(year, month, 1))} className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[14px] font-semibold">{year}년 {month + 1}월로</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
