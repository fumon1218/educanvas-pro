import React, { useEffect, useRef } from 'react';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface WindowRect { x: number; y: number; w: number; h: number }

interface Props {
  id: string;
  title: string;
  icon?: React.ReactNode;
  rect: WindowRect;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  onChange: (rect: WindowRect) => void;
  onFocus: () => void;
  onClose: () => void;
  onToggleMinimize: () => void;
  onToggleMaximize: () => void;
  /** 녹화 때 창 위치를 알 수 있도록 바깥 요소를 등록 */
  registerEl?: (el: HTMLDivElement | null) => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

const MIN_W = 280;
const MIN_H = 180;

/** 화면 위에 떠 있는 창: 제목 막대로 옮기고, 오른쪽 아래 모서리로 크기를 바꾼다 */
export const FloatingWindow: React.FC<Props> = ({
  title, icon, rect, minimized, maximized, zIndex, onChange, onFocus, onClose, onToggleMinimize, onToggleMaximize,
  registerEl, headerExtra, children,
}) => {
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; r: WindowRect } | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => registerEl?.(null), [registerEl]);

  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select,a')) return;
    if (maximized && mode === 'move') return;
    e.preventDefault();
    onFocus();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, r: { ...rect } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (d.mode === 'move') {
      onChange({ ...d.r, x: Math.min(vw - 80, Math.max(-d.r.w + 120, d.r.x + dx)), y: Math.min(vh - 40, Math.max(0, d.r.y + dy)) });
    } else {
      onChange({ ...d.r, w: Math.max(MIN_W, d.r.w + dx), h: Math.max(MIN_H, d.r.h + dy) });
    }
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 무시 */ }
  };

  const style: React.CSSProperties = maximized
    ? { left: 12, top: 12, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)', zIndex }
    : { left: rect.x, top: rect.y, width: rect.w, height: minimized ? 'auto' : rect.h, zIndex };

  return (
    <div
      ref={el => { elRef.current = el; registerEl?.(el); }}
      className="fixed flex flex-col rounded-2xl overflow-hidden bg-white shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/10"
      style={style}
      onPointerDown={onFocus}
      role="dialog"
      aria-label={title}
    >
      <div
        className="flex items-center gap-2 h-10 pl-3 pr-1.5 bg-slate-50 border-b border-slate-200 cursor-grab active:cursor-grabbing select-none shrink-0"
        onPointerDown={start('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={onToggleMaximize}
      >
        {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
        <span className="text-[13px] font-semibold text-slate-700 truncate flex-1">{title}</span>
        {headerExtra}
        <button onClick={onToggleMinimize} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200" title={minimized ? '펼치기' : '접기'} aria-label={minimized ? '펼치기' : '접기'}>
          <Minus size={15} />
        </button>
        <button onClick={onToggleMaximize} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200" title={maximized ? '원래 크기' : '크게 보기'} aria-label={maximized ? '원래 크기' : '크게 보기'}>
          {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500 hover:text-white" title="닫기" aria-label="창 닫기">
          <X size={15} />
        </button>
      </div>
      <div className={cn('relative flex-1 min-h-0', minimized && 'hidden')}>{children}</div>
      {!minimized && !maximized && (
        <div
          className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize"
          onPointerDown={start('resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" className="w-full h-full text-slate-400"><path d="M18 8 L8 18 M18 13 L13 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </div>
      )}
    </div>
  );
};
