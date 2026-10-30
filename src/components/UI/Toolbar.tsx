import React, { useState } from 'react';
import {
  Pencil, Pen, Feather, Minus, Eraser, Zap, MousePointer2, Circle, Square, Triangle as TriangleIcon, Shapes, Type,
  PaintBucket, Highlighter, Upload, Link, Undo2, Redo2, Hand, Pipette, Scissors, Copy, ClipboardPaste,
  Lasso, Slash, MoveRight, Pentagon, Globe, Box, Music, ImagePlus, MoreHorizontal, Palette,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { HexColorPicker } from 'react-colorful';
import { toast } from 'sonner';
import { sanitizeUrl } from '@/src/lib/canvasData';
import type { ToolType } from '@/src/components/Canvas/Whiteboard';
import { glass } from './BottomNavBar';

type ShapeType = 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon' | 'line' | 'arrow';

interface ToolbarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  onAddShape: (shape: ShapeType) => void;
  onAddText: () => void;
  color: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  isVertical: boolean;
  onAddFile: (file: File) => void;
  onAddWebLink: (url: string) => void;
  onOpenWebWindow?: () => void;
  onOpenAssets?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
}

const QUICK_COLORS = [
  { c: '#ef4444', n: '빨강' }, { c: '#4f46e5', n: '남색' },
  { c: '#000000', n: '검정' }, { c: '#22c55e', n: '초록' },
];
const PRESET_COLORS = [
  { c: '#000000', n: '검정' }, { c: '#ffffff', n: '흰색' }, { c: '#ef4444', n: '빨강' }, { c: '#f97316', n: '주황' },
  { c: '#eab308', n: '노랑' }, { c: '#22c55e', n: '초록' }, { c: '#3b82f6', n: '파랑' }, { c: '#8b5cf6', n: '보라' },
];
const SIZES = [
  { v: 2, label: '가늘게', d: 6 },
  { v: 5, label: '보통', d: 11 },
  { v: 10, label: '굵게', d: 16 },
];
const PEN_TOOLS: ToolType[] = ['pen', 'pencil', 'fountain', 'ballpoint', 'dashed'];

/** 왼쪽 도구 패널: 아이콘과 이름을 함께 보여 주는 세련된 도구 목록 (가로 모드에서는 아이콘만) */
export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool, onToolSelect, onAddShape, onAddText, color, onColorChange, brushSize, onBrushSizeChange,
  isVertical, onAddFile, onAddWebLink, onUndo, onRedo, onCopy, onPaste, onCut, onOpenWebWindow, onOpenAssets,
}) => {
  const [menu, setMenu] = useState<string | null>(null);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const pickColor = (c: string, remember = false) => {
    onColorChange(c);
    if (remember && !PRESET_COLORS.some(p => p.c === c) && !recentColors.includes(c)) setRecentColors(prev => [c, ...prev.slice(0, 5)]);
    if (!PEN_TOOLS.includes(activeTool) && activeTool !== 'highlighter' && activeTool !== 'select') onToolSelect('pen');
  };

  const handleEyedropper = async () => {
    setMenu(null);
    if ('EyeDropper' in window) {
      try {
        const result = await new (window as any).EyeDropper().open();
        pickColor(result.sRGBHex, true);
        toast.success('색을 골랐습니다.', { duration: 1200 });
      } catch { /* 취소 */ }
    } else {
      onToolSelect('eyedropper');
      toast.info('캔버스에서 색을 가져올 곳을 누르세요.', { duration: 2000 });
    }
  };

  const handleWebLinkPrompt = () => {
    const input = window.prompt('웹 주소를 입력하세요 (예: www.youtube.com)');
    if (input == null) return;
    const url = sanitizeUrl(input);
    if (!url) {
      toast.error('올바른 웹 주소가 아닙니다.', { description: 'http:// 또는 https:// 주소만 넣을 수 있습니다.' });
      return;
    }
    onAddWebLink(url);
  };

  type MenuItem = { id: string; icon: React.ElementType; label: string; action?: () => void; hint?: string };
  const menus: Record<string, { title: string; items: MenuItem[]; sizes?: boolean }> = {
    pen: {
      title: '펜 종류', sizes: true,
      items: [
        { id: 'pen', icon: Pencil, label: '기본 펜' },
        { id: 'ballpoint', icon: Pen, label: '볼펜' },
        { id: 'fountain', icon: Feather, label: '만년필' },
        { id: 'pencil', icon: Pencil, label: '연필' },
        { id: 'dashed', icon: Minus, label: '점선' },
      ],
    },
    shapes: {
      title: '도형', sizes: true,
      items: [
        { id: 'line', icon: Slash, label: '직선', action: () => onAddShape('line') },
        { id: 'arrow', icon: MoveRight, label: '화살표', action: () => onAddShape('arrow') },
        { id: 'rect', icon: Square, label: '사각형', action: () => onAddShape('rect') },
        { id: 'circle', icon: Circle, label: '원', action: () => onAddShape('circle') },
        { id: 'ellipse', icon: Circle, label: '타원', action: () => onAddShape('ellipse') },
        { id: 'triangle', icon: TriangleIcon, label: '삼각형', action: () => onAddShape('triangle') },
        { id: 'polygon', icon: Pentagon, label: '오각형', action: () => onAddShape('polygon') },
      ],
    },
    media: {
      title: '자료 넣기',
      items: [
        { id: 'upload', icon: Upload, label: '파일 넣기', hint: '사진·PDF·영상·소리·GLB·악보', action: () => fileInputRef.current?.click() },
        { id: 'webwin', icon: Globe, label: '웹 브라우저', hint: '유튜브·구글 문서', action: () => onOpenWebWindow?.() },
        { id: 'assets', icon: Box, label: '3D 자산함', hint: 'GLB 모델 모음', action: () => onOpenAssets?.() },
        { id: 'score', icon: Music, label: '악보', hint: 'NWC·MIDI·MusicXML', action: () => fileInputRef.current?.click() },
        { id: 'weblink', icon: Link, label: '웹 링크 카드', action: handleWebLinkPrompt },
      ],
    },
    more: {
      title: '더 보기',
      items: [
        { id: 'lasso', icon: Lasso, label: '올가미로 선택' },
        { id: 'bucket', icon: PaintBucket, label: '채우기' },
        { id: 'eyedrop', icon: Pipette, label: '스포이트', action: handleEyedropper },
        { id: 'cutclip', icon: Scissors, label: '잘라내기', action: () => onCut?.() },
        { id: 'copy', icon: Copy, label: '복사', action: () => onCopy?.() },
        { id: 'paste', icon: ClipboardPaste, label: '붙여넣기', action: () => onPaste?.() },
      ],
    },
  };

  const runItem = (it: MenuItem) => {
    if (it.action) it.action();
    else onToolSelect(it.id as ToolType);
    setMenu(null);
  };

  const Row: React.FC<{ icon: React.ElementType; label: string; active?: boolean; onClick: () => void; title?: string; caret?: boolean }> = ({ icon: Icon, label, active, onClick, title, caret }) => (
    <button
      onClick={onClick}
      title={title || label}
      aria-label={title || label}
      aria-pressed={active}
      className={cn(
        'group flex items-center rounded-xl transition-all',
        isVertical ? 'w-full gap-2.5 h-10 px-2.5' : 'w-11 h-11 justify-center',
        active ? 'bg-indigo-600 text-white shadow-[0_6px_14px_-4px_rgba(79,70,229,0.55)]' : 'text-slate-600 hover:bg-slate-900/[0.05]',
      )}
    >
      <Icon size={19} strokeWidth={active ? 2.1 : 1.8} className="shrink-0" />
      {isVertical && <span className={cn('text-[13px] flex-1 text-left whitespace-nowrap', active ? 'font-semibold' : 'font-medium')}>{label}</span>}
      {isVertical && caret && <MoreHorizontal size={14} className={cn('opacity-0 group-hover:opacity-60', active && 'opacity-70')} />}
    </button>
  );

  const toggle = (id: string) => setMenu(m => (m === id ? null : id));
  const penActive = PEN_TOOLS.includes(activeTool);

  return (
    <div className={cn('absolute z-40 pointer-events-none', isVertical ? 'left-4 top-[88px] bottom-[108px] flex flex-col' : 'bottom-[96px] left-1/2 -translate-x-1/2')}>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.ppt,.pptx,.glb,.nwc,.nwctxt,.mid,.midi,.musicxml,.xml,.mxl"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onAddFile(file);
          e.target.value = '';
        }}
      />

      <div className={cn('pointer-events-auto rounded-2xl', glass, isVertical ? 'w-[132px] p-2 flex flex-col gap-0.5 max-h-full overflow-y-auto scrollbar-hide' : 'flex items-center gap-0.5 p-1.5')}>
        <Row icon={MousePointer2} label="선택" active={activeTool === 'select'} onClick={() => { onToolSelect('select'); setMenu(null); }} />
        <Row icon={Hand} label="손" title="손 (화면 이동 · 스페이스바를 누른 채 끌어도 됩니다)" active={activeTool === 'pan'} onClick={() => { onToolSelect('pan'); setMenu(null); }} />
        <Row icon={Pencil} label="펜" caret active={penActive} onClick={() => { if (!penActive) onToolSelect('pen'); toggle('pen'); }} />
        <Row icon={Highlighter} label="형광펜" active={activeTool === 'highlighter'} onClick={() => { onToolSelect('highlighter'); setMenu(null); }} />
        <Row icon={Eraser} label="지우개" title="지우개 (펜 선·글자·도형)" active={activeTool === 'eraser'} onClick={() => { onToolSelect('eraser'); setMenu(null); }} />
        <Row icon={Shapes} label="도형" caret active={menu === 'shapes'} onClick={() => toggle('shapes')} />
        <Row icon={Type} label="글자" onClick={() => { onAddText(); setMenu(null); }} />
        <Row icon={Zap} label="레이저" active={activeTool === 'laser'} onClick={() => { onToolSelect('laser'); setMenu(null); }} />
        <Row icon={ImagePlus} label="자료 넣기" caret active={menu === 'media'} onClick={() => toggle('media')} />
        <Row icon={MoreHorizontal} label="더 보기" caret active={menu === 'more' || ['lasso', 'bucket', 'eyedropper'].includes(activeTool)} onClick={() => toggle('more')} />

        <div className={cn('bg-slate-200/80', isVertical ? 'h-px mx-1 my-2' : 'w-px h-7 mx-1')} />

        {/* 빠른 색 */}
        <div className={cn(isVertical ? 'grid grid-cols-2 gap-2 px-3 py-1 justify-items-center' : 'flex items-center gap-1.5 px-1')}>
          {QUICK_COLORS.map(q => (
            <button
              key={q.c}
              onClick={() => pickColor(q.c)}
              title={q.n}
              aria-label={`색 ${q.n}`}
              className={cn('w-7 h-7 rounded-full transition-transform hover:scale-110', color.toLowerCase() === q.c && 'ring-2 ring-offset-2 ring-indigo-500')}
              style={{ backgroundColor: q.c }}
            />
          ))}
          {isVertical && (
            <button onClick={() => toggle('color')} title="다른 색 고르기" aria-label="다른 색 고르기" className="col-span-2 mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800">
              <span className="w-4 h-4 rounded-full ring-1 ring-slate-300" style={{ background: QUICK_COLORS.some(q => q.c === color.toLowerCase()) ? 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)' : color }} />
              다른 색
            </button>
          )}
          {!isVertical && (
            <button onClick={() => toggle('color')} title="다른 색 고르기" aria-label="다른 색 고르기" className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-900/5"><Palette size={16} /></button>
          )}
        </div>

        {/* 굵기 */}
        <div className={cn('flex items-center', isVertical ? 'justify-around px-2 py-1.5' : 'gap-1 px-1')}>
          {SIZES.map(s => (
            <button
              key={s.v}
              onClick={() => onBrushSizeChange(s.v)}
              title={`굵기: ${s.label}`}
              aria-label={`굵기 ${s.label}`}
              aria-pressed={brushSize === s.v}
              className={cn('w-8 h-8 flex items-center justify-center rounded-full', brushSize === s.v ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-900/5')}
            >
              <span className={cn('rounded-full', brushSize === s.v ? 'bg-indigo-600' : 'bg-slate-700')} style={{ width: s.d, height: s.d }} />
            </button>
          ))}
        </div>

        <div className={cn('bg-slate-200/80', isVertical ? 'h-px mx-1 my-1.5' : 'w-px h-7 mx-1')} />
        <div className={cn('flex', isVertical ? 'justify-around' : 'gap-0.5')}>
          <button onClick={onUndo} className="w-10 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소"><Undo2 size={18} /></button>
          <button onClick={onRedo} className="w-10 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5" title="다시 실행 (Ctrl+Y)" aria-label="다시 실행"><Redo2 size={18} /></button>
        </div>
      </div>

      {/* 하위 메뉴 */}
      <AnimatePresence>
        {menu && menu !== 'color' && menus[menu] && (
          <motion.div
            key={menu}
            initial={{ opacity: 0, x: isVertical ? -6 : 0, y: isVertical ? 0 : 6 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: isVertical ? -6 : 0, y: isVertical ? 0 : 6 }}
            className={cn(
              'absolute z-50 p-2 rounded-2xl pointer-events-auto bg-white/95 backdrop-blur-xl ring-1 ring-slate-900/[0.07] shadow-[0_18px_40px_-12px_rgba(15,23,42,0.3)] w-[230px]',
              isVertical ? 'left-[144px] top-24' : 'bottom-full mb-3 left-1/2 -translate-x-1/2',
            )}
          >
            <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400">{menus[menu].title}</div>
            {menus[menu].items.map(it => (
              <button
                key={it.id}
                onClick={() => runItem(it)}
                className={cn(
                  'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors',
                  activeTool === it.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-900/[0.04]',
                )}
              >
                <it.icon size={17} strokeWidth={1.8} className="shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium">{it.label}</span>
                  {it.hint && <span className="block text-[11px] text-slate-400 truncate">{it.hint}</span>}
                </span>
              </button>
            ))}
            {menus[menu].sizes && (
              <div className="mt-1 pt-2 border-t border-slate-100 px-2.5 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">굵기</span>
                <div className="flex items-center gap-1">
                  {[2, 5, 10, 16].map(v => (
                    <button key={v} onClick={() => onBrushSizeChange(v)} aria-label={`굵기 ${v}`} className={cn('w-8 h-8 flex items-center justify-center rounded-full', brushSize === v ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-100')}>
                      <span className="rounded-full bg-slate-700" style={{ width: 3 + v * 0.7, height: 3 + v * 0.7 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        {menu === 'color' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className={cn('absolute z-50 p-3 rounded-2xl pointer-events-auto bg-white ring-1 ring-slate-900/[0.07] shadow-[0_18px_40px_-12px_rgba(15,23,42,0.3)] w-[236px]', isVertical ? 'left-[144px] bottom-24' : 'bottom-full mb-3 left-1/2 -translate-x-1/2')}
          >
            <div className="grid grid-cols-8 gap-1.5 mb-3">
              {PRESET_COLORS.map(p => (
                <button key={p.c} onClick={() => pickColor(p.c)} title={p.n} aria-label={p.n} className={cn('w-6 h-6 rounded-full ring-1 ring-slate-300', color.toLowerCase() === p.c && 'ring-2 ring-offset-1 ring-indigo-500')} style={{ backgroundColor: p.c }} />
              ))}
            </div>
            <HexColorPicker color={color} onChange={c => onColorChange(c)} onMouseUp={() => pickColor(color, true)} style={{ width: '100%' }} />
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1.5 min-h-6">
                {recentColors.length > 0
                  ? recentColors.map(c => <button key={c} onClick={() => pickColor(c)} className="w-6 h-6 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: c }} aria-label={c} />)
                  : <span className="text-[11px] text-slate-400">최근 색 없음</span>}
              </div>
              <button onClick={handleEyedropper} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="스포이트" aria-label="스포이트"><Pipette size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
