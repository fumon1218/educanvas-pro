import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Pencil, Highlighter, Zap, Eraser, MousePointer2, Undo2, Hand,
  PanelBottomClose, Flashlight, Timer, Maximize, X,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { ToolType } from '@/src/components/Canvas/Whiteboard';

interface Props {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  tool: ToolType;
  onTool: (t: ToolType) => void;
  color: string;
  onColor: (c: string) => void;
  onUndo: () => void;
  onFit: () => void;
  shadeOn: boolean;
  onToggleShade: () => void;
  spotlightOn: boolean;
  onToggleSpotlight: () => void;
  timerOn: boolean;
  onToggleTimer: () => void;
  onExit: () => void;
}

const COLORS = [
  { c: '#ef4444', n: '빨강' },
  { c: '#000000', n: '검정' },
  { c: '#2563eb', n: '파랑' },
  { c: '#ffffff', n: '흰색' },
];

/** 발표 모드 전용 작은 도구 막대. 3초 동안 움직임이 없으면 흐려진다. */
export const PresentationBar: React.FC<Props> = props => {
  const { current, total, tool, color } = props;
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wake = () => {
      setIdle(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const B: React.FC<{ title: string; active?: boolean; onClick: () => void; children: React.ReactNode; className?: string }> = ({ title, active, onClick, children, className }) => (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn('p-2.5 rounded-full transition-colors', active ? 'bg-white text-gray-900' : 'text-white/90 hover:bg-white/15', className)}
    >
      {children}
    </button>
  );
  const Sep = () => <div className="w-px h-6 bg-white/20 mx-1" />;

  return (
    <div
      className={cn(
        'fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-gray-900/85 backdrop-blur-md shadow-2xl transition-opacity duration-500',
        idle ? 'opacity-25 hover:opacity-100' : 'opacity-100',
      )}
      role="toolbar"
      aria-label="발표 도구"
    >
      <B title="이전 슬라이드 (PageUp)" onClick={props.onPrev}><ChevronLeft size={20} /></B>
      <span className="text-white text-sm font-semibold tabular-nums px-1 min-w-[52px] text-center">{current} / {total}</span>
      <B title="다음 슬라이드 (PageDown)" onClick={props.onNext}><ChevronRight size={20} /></B>
      <Sep />
      <B title="펜" active={tool === 'pen'} onClick={() => props.onTool('pen')}><Pencil size={18} /></B>
      <div className="flex items-center gap-1 px-1">
        {COLORS.map(c => (
          <button
            key={c.c}
            onClick={() => { props.onColor(c.c); if (tool !== 'pen' && tool !== 'highlighter') props.onTool('pen'); }}
            title={c.n}
            aria-label={`펜 색 ${c.n}`}
            className={cn('w-5 h-5 rounded-full border border-white/40', color.toLowerCase() === c.c && 'ring-2 ring-white ring-offset-1 ring-offset-gray-900')}
            style={{ backgroundColor: c.c }}
          />
        ))}
      </div>
      <B title="형광펜" active={tool === 'highlighter'} onClick={() => props.onTool('highlighter')}><Highlighter size={18} /></B>
      <B title="레이저 포인터" active={tool === 'laser'} onClick={() => props.onTool('laser')}><Zap size={18} /></B>
      <B title="지우개" active={tool === 'eraser'} onClick={() => props.onTool('eraser')}><Eraser size={18} /></B>
      <B title="선택" active={tool === 'select'} onClick={() => props.onTool('select')}><MousePointer2 size={18} /></B>
      <B title="화면 이동" active={tool === 'pan'} onClick={() => props.onTool('pan')}><Hand size={18} /></B>
      <B title="실행 취소 (Ctrl+Z)" onClick={props.onUndo}><Undo2 size={18} /></B>
      <Sep />
      <B title="가림막" active={props.shadeOn} onClick={props.onToggleShade}><PanelBottomClose size={18} /></B>
      <B title="스포트라이트" active={props.spotlightOn} onClick={props.onToggleSpotlight}><Flashlight size={18} /></B>
      <B title="타이머" active={props.timerOn} onClick={props.onToggleTimer}><Timer size={18} /></B>
      <B title="화면에 맞추기" onClick={props.onFit}><Maximize size={18} /></B>
      <Sep />
      <B title="발표 끝내기 (Esc)" onClick={props.onExit} className="hover:bg-red-500/80"><X size={18} /></B>
    </div>
  );
};
