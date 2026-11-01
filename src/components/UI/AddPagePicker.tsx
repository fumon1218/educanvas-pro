import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown, ArrowRight, FilePlus2, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { paperChoices, paperImage, type PaperStyle } from '@/src/lib/templates';

/**
 * 쪽 더하기: 어느 쪽으로(아래·오른쪽) 어떤 종이를 붙일지 고른다.
 *   const r = await pickPage(hasPages);  // { style?: PaperStyle; direction }
 */
export interface AddPageChoice { style?: PaperStyle; direction: 'down' | 'right' }
type Req = { hasPages: boolean; resolve: (v: AddPageChoice | null) => void };
let push: ((r: Req) => void) | null = null;
export const pickPage = (hasPages: boolean) => new Promise<AddPageChoice | null>(resolve => {
  if (!push) { resolve(null); return; }
  push({ hasPages, resolve });
});

const DIR_KEY = 'okssam_addpage_dir';

export const AddPageHost: React.FC = () => {
  const [req, setReq] = useState<Req | null>(null);
  const [dir, setDir] = useState<'down' | 'right'>(() => { try { return localStorage.getItem(DIR_KEY) === 'right' ? 'right' : 'down'; } catch { return 'down'; } });
  useEffect(() => { push = r => setReq(prev => { prev?.resolve(null); return r; }); return () => { push = null; }; }, []);
  const done = (v: AddPageChoice | null) => { req?.resolve(v); setReq(null); };
  const choose = (style?: PaperStyle) => { try { localStorage.setItem(DIR_KEY, dir); } catch { /* 무시 */ } done({ style, direction: dir }); };

  const Card: React.FC<{ label: string; img?: string; onClick: () => void; hint?: string }> = ({ label, img, onClick, hint }) => (
    <button onClick={onClick} className="group flex flex-col items-stretch gap-1.5 p-2 rounded-2xl ring-1 ring-slate-200 hover:ring-2 hover:ring-indigo-400 bg-white text-left">
      <span className="block aspect-[1240/1754] rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-100">
        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-400"><FilePlus2 size={22} /></span>}
      </span>
      <span className="text-[12px] font-semibold text-slate-700 leading-tight">{label}</span>
      {hint && <span className="text-[11px] text-slate-400 leading-tight -mt-1">{hint}</span>}
    </button>
  );

  return (
    <AnimatePresence>
      {req && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => done(null)} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div role="dialog" aria-modal="true" aria-label="쪽 더하기"
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onKeyDown={e => { if (e.key === 'Escape') done(null); e.stopPropagation(); }}
            className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><FilePlus2 size={20} /></div>
              <h2 className="flex-1 text-[17px] font-bold text-slate-900">쪽 더하기</h2>
              <button onClick={() => done(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>
            <div className="px-5 pb-5 space-y-3 overflow-y-auto">
              {req.hasPages && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-slate-500">붙일 곳</span>
                  <div className="flex p-1 rounded-xl bg-slate-100">
                    {([['down', '아래로', ArrowDown], ['right', '오른쪽으로', ArrowRight]] as const).map(([k, l, I]) => (
                      <button key={k} onClick={() => setDir(k)} aria-pressed={dir === k}
                        className={cn('h-8 px-3 rounded-lg text-[13px] font-semibold flex items-center gap-1.5', dir === k ? 'bg-white shadow text-slate-900' : 'text-slate-500')}><I size={14} />{l}</button>
                    ))}
                  </div>
                  <span className="text-[12px] text-slate-400 hidden sm:inline">지금 보고 있는 쪽 옆에 붙습니다</span>
                </div>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {req.hasPages && <Card label="같은 종이로 이어서" hint="머리 칸 없이" onClick={() => choose(undefined)} />}
                {paperChoices().map(c => <Card key={c.style} label={c.label} img={paperImage(c.style, true)} onClick={() => choose(c.style)} />)}
              </div>
              <p className="text-[12px] text-slate-500">붙인 쪽은 선택 도구로 종이를 끌어 자유롭게 옮길 수 있습니다. 종이를 고르면 그 위의 칸·필기도 함께 옮겨지고 복사됩니다.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
