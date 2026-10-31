import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * 앱 안의 입력 창 (브라우저 window.prompt 대신).
 * 데스크톱 프로그램(Electron)은 window.prompt를 지원하지 않아서 직접 만든다.
 *   const v = await askText({ title: '웹 주소', placeholder: 'www.youtube.com' });
 */
export interface AskOptions { title: string; message?: string; placeholder?: string; initial?: string; confirmLabel?: string; type?: 'text' | 'password'; hint?: string }
type Req = AskOptions & { resolve: (v: string | null) => void };
let push: ((r: Req) => void) | null = null;
export const askText = (o: AskOptions) => new Promise<string | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ ...o, resolve });
});

export const PromptHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [v, setV] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { push = r => { setReq(prev => { prev?.resolve(null); return r; }); setV(r.initial || ''); }; return () => { push = null; }; }, []);
  useEffect(() => { if (req) setTimeout(() => inputRef.current?.focus(), 60); }, [req]);
  const done = (val: string | null) => { req?.resolve(val); setReq(null); };
  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.form
            role="dialog" aria-modal="true" aria-label={req.title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onSubmit={e => { e.preventDefault(); done(v); }}
            className="relative w-full max-w-sm p-5 bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
          >
            <h2 className="text-[17px] font-bold text-slate-900">{req.title}</h2>
            {req.message && <p className="mt-1 text-[13px] text-slate-500 whitespace-pre-line">{req.message}</p>}
            <input ref={inputRef} value={v} onChange={e => setV(e.target.value)} type={req.type || 'text'} placeholder={req.placeholder} aria-label={req.title}
              onKeyDown={e => { if (e.key === 'Escape') done(null); e.stopPropagation(); }}
              className="mt-4 w-full h-11 px-3.5 rounded-xl bg-slate-100 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-300" />
            {req.hint && <p className="mt-2 text-[12px] text-slate-500">{req.hint}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => done(null)} className="h-10 px-4 rounded-xl text-[14px] text-slate-600 hover:bg-slate-100">취소</button>
              <button type="submit" className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-semibold">{req.confirmLabel || '확인'}</button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
};
