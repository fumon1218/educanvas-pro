import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Highlighter, Eraser, MousePointer2, Hand, Undo2, Redo2, Minimize2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { ToolType } from '@/src/components/Canvas/Whiteboard';

/**
 * 집중 모드: 위·왼쪽·아래 막대를 모두 숨기고 이 작은 막대만 남긴다.
 * 3초 동안 움직임이 없으면 흐려진다. Esc 또는 [집중 모드 끝]으로 돌아간다.
 */
const COLORS = [
  { c: '#000000', n: '검정' },
  { c: '#ef4444', n: '빨강' },
  { c: '#2563eb', n: '파랑' },
  { c: '#16a34a', n: '초록' },
];

export const FocusBar: React.FC<{
  tool: ToolType;
  onTool: (t: ToolType) => void;
  color: string;
  onColor: (c: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExit: () => void;
}> = ({ tool, onTool, color, onColor, onUndo, onRedo, onExit }) => {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    const key = (e: KeyboardEvent) => {
      wake();
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && !(t?.isContentEditable || /INPUT|TEXTAREA/.test(t?.tagName))) onExit();
    };
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', key); if (timer.current) clearTimeout(timer.current); };
  }, [onExit]);

  const B: React.FC<{ title: string; active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ title, active, onClick, children }) => (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={active}
      className={cn('w-10 h-10 flex items-center justify-center rounded-full transition-colors', active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-900/[0.06]')}>
      {children}
    </button>
  );
  const Sep = () => <div className="w-px h-6 bg-slate-200 mx-1" />;
  return (
    <div role="toolbar" aria-label="집중 모드 도구"
      className={cn('fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-0.5 px-2 py-1 rounded-full bg-white/90 backdrop-blur-xl ring-1 ring-slate-900/[0.08] shadow-[0_10px_30px_-8px_rgba(15,23,42,0.3)] transition-opacity duration-500 max-w-[calc(100vw-16px)] overflow-x-auto',
        idle ? 'opacity-30 hover:opacity-100' : 'opacity-100')}>
      <B title="펜" active={tool === 'pen'} onClick={() => onTool('pen')}><Pencil size={18} /></B>
      <div className="flex items-center gap-1 px-1">
        {COLORS.map(c => (
          <button key={c.c} onClick={() => { onColor(c.c); if (tool !== 'pen' && tool !== 'highlighter') onTool('pen'); }} title={c.n} aria-label={`펜 색 ${c.n}`}
            className={cn('w-5 h-5 rounded-full ring-1 ring-black/10 shrink-0', color.toLowerCase() === c.c && 'ring-2 ring-indigo-500 ring-offset-1')} style={{ backgroundColor: c.c }} />
        ))}
      </div>
      <B title="형광펜" active={tool === 'highlighter'} onClick={() => onTool('highlighter')}><Highlighter size={18} /></B>
      <B title="지우개" active={tool === 'eraser'} onClick={() => onTool('eraser')}><Eraser size={18} /></B>
      <B title="선택" active={tool === 'select'} onClick={() => onTool('select')}><MousePointer2 size={18} /></B>
      <B title="화면 이동" active={tool === 'pan'} onClick={() => onTool('pan')}><Hand size={18} /></B>
      <Sep />
      <B title="실행 취소 (Ctrl+Z)" onClick={onUndo}><Undo2 size={18} /></B>
      <B title="다시 실행" onClick={onRedo}><Redo2 size={18} /></B>
      <Sep />
      <button onClick={onExit} title="집중 모드 끝 (Esc)" aria-label="집중 모드 끝"
        className="h-10 pl-3 pr-3.5 flex items-center gap-1.5 rounded-full text-[13px] font-semibold text-slate-700 hover:bg-slate-900/[0.06] shrink-0">
        <Minimize2 size={16} />끝
      </button>
    </div>
  );
};
