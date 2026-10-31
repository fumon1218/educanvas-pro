import React, { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface PageInfo { index: number; total: number; pageNo: number; first: number; last: number; notebook?: boolean }

/** 한 슬라이드에 이어 붙인 PDF의 지금 쪽 번호와 쪽 이동 */
export const PageIndicator: React.FC<{
  info: PageInfo;
  onStep: (dir: 1 | -1) => void;
  onGo: (pageNo: number) => boolean;
  /** 공책: 쪽 더하기 */
  onAddPage?: () => void;
  className?: string;
}> = ({ info, onStep, onGo, onAddPage, className }) => {
  const [draft, setDraft] = useState(String(info.pageNo));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(info.pageNo)); }, [info.pageNo, editing]);

  const go = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || !onGo(n)) setDraft(String(info.pageNo));
    setEditing(false);
  };

  return (
    <div
      className={cn('absolute z-30 flex items-center gap-0.5 p-1 rounded-xl bg-white/90 backdrop-blur-xl ring-1 ring-slate-900/[0.06] shadow-[0_6px_20px_-8px_rgba(15,23,42,0.25)] text-[13px]', className)}
      role="group"
      aria-label="PDF 쪽"
    >
      <button onClick={() => onStep(-1)} disabled={info.index <= 0} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 disabled:opacity-30" aria-label="앞 쪽" title="앞 쪽 (PageUp)"><ChevronUp size={16} /></button>
      <form onSubmit={e => { e.preventDefault(); go(); }} className="flex items-center gap-1 px-1">
        <input
          value={draft}
          onFocus={e => { setEditing(true); e.currentTarget.select(); }}
          onBlur={go}
          onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
          onKeyDown={e => e.stopPropagation()}
          inputMode="numeric"
          className="w-11 h-7 rounded-md bg-slate-100 text-center font-semibold tabular-nums text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
          aria-label="쪽 번호로 이동"
          title="쪽 번호를 적고 Enter"
        />
        <span className="text-slate-500 whitespace-nowrap tabular-nums">쪽 <span className="text-slate-400">· {info.index + 1}/{info.total}</span></span>
      </form>
      <button onClick={() => onStep(1)} disabled={info.index >= info.total - 1} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 disabled:opacity-30" aria-label="다음 쪽" title="다음 쪽 (PageDown)"><ChevronDown size={16} /></button>
      {onAddPage && <button onClick={onAddPage} className="h-7 px-2 ml-0.5 flex items-center gap-1 rounded-lg text-indigo-600 font-semibold hover:bg-indigo-50" aria-label="쪽 더하기" title="공책 쪽 하나 더하기"><Plus size={14} />쪽</button>}
    </div>
  );
};
