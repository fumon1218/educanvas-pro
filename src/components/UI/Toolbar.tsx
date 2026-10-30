import React, { useState } from 'react';
import {
  Pencil, Pen, Feather, Minus, Eraser, Zap, MousePointer2, Circle, Square, Triangle as TriangleIcon, Shapes, Type,
  PaintBucket, Plus, Highlighter, Upload, Link, Undo2, Redo2, Hand, Pipette, Scissors, Copy, ClipboardPaste,
  Lasso, Slash, MoveRight, Pentagon,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { HexColorPicker } from 'react-colorful';
import { toast } from 'sonner';
import { sanitizeUrl } from '@/src/lib/canvasData';
import type { ToolType } from '@/src/components/Canvas/Whiteboard';

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
  onUndo: () => void;
  onRedo: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
}

const PRESET_COLORS = [
  { c: '#000000', n: '검정' }, { c: '#ffffff', n: '흰색' }, { c: '#ef4444', n: '빨강' }, { c: '#f97316', n: '주황' },
  { c: '#eab308', n: '노랑' }, { c: '#22c55e', n: '초록' }, { c: '#3b82f6', n: '파랑' }, { c: '#8b5cf6', n: '보라' },
];

const SIZES = [
  { v: 2, label: '가늘게', dot: 'w-1 h-1' },
  { v: 4, label: '보통', dot: 'w-1.5 h-1.5' },
  { v: 8, label: '굵게', dot: 'w-2.5 h-2.5' },
  { v: 14, label: '아주 굵게', dot: 'w-3.5 h-3.5' },
];

const DRAW_TOOLS: ToolType[] = ['pen', 'pencil', 'fountain', 'ballpoint', 'dashed', 'highlighter'];

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool, onToolSelect, onAddShape, onAddText, color, onColorChange, brushSize, onBrushSizeChange,
  isVertical, onAddFile, onAddWebLink, onUndo, onRedo, onCopy, onPaste, onCut,
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleColorChange = (newColor: string, remember = false) => {
    onColorChange(newColor);
    if (remember && !PRESET_COLORS.some(p => p.c === newColor) && !recentColors.includes(newColor)) {
      setRecentColors(prev => [newColor, ...prev.slice(0, 5)]);
    }
  };

  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const result = await new (window as any).EyeDropper().open();
        handleColorChange(result.sRGBHex, true);
        toast.success('색을 골랐습니다.', { duration: 1200 });
      } catch { /* 사용자가 취소 */ }
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

  const categories: Record<string, { label: string; tools: { id: string; icon: any; label: string; action?: () => void }[] }> = {
    media: {
      label: '자료 넣기',
      tools: [
        { id: 'upload', icon: Upload, label: '파일 (사진·PDF·영상·소리)', action: () => fileInputRef.current?.click() },
        { id: 'weblink', icon: Link, label: '웹 링크', action: handleWebLinkPrompt },
      ],
    },
    draw: {
      label: '펜 종류',
      tools: [
        { id: 'pen', icon: Pencil, label: '기본 펜' },
        { id: 'pencil', icon: Pencil, label: '연필' },
        { id: 'fountain', icon: Feather, label: '만년필' },
        { id: 'ballpoint', icon: Pen, label: '볼펜' },
        { id: 'dashed', icon: Minus, label: '점선' },
        { id: 'highlighter', icon: Highlighter, label: '형광펜' },
      ],
    },
    shapes: {
      label: '도형',
      tools: [
        { id: 'line', icon: Slash, label: '직선', action: () => onAddShape('line') },
        { id: 'arrow', icon: MoveRight, label: '화살표', action: () => onAddShape('arrow') },
        { id: 'rect', icon: Square, label: '사각형', action: () => onAddShape('rect') },
        { id: 'circle', icon: Circle, label: '원', action: () => onAddShape('circle') },
        { id: 'ellipse', icon: Circle, label: '타원', action: () => onAddShape('ellipse') },
        { id: 'triangle', icon: TriangleIcon, label: '삼각형', action: () => onAddShape('triangle') },
        { id: 'polygon', icon: Pentagon, label: '오각형', action: () => onAddShape('polygon') },
      ],
    },
    edit: {
      label: '편집',
      tools: [
        { id: 'lasso', icon: Lasso, label: '올가미로 선택' },
        { id: 'cutclip', icon: Scissors, label: '잘라내기', action: () => onCut?.() },
        { id: 'copy', icon: Copy, label: '복사', action: () => onCopy?.() },
        { id: 'paste', icon: ClipboardPaste, label: '붙여넣기', action: () => onPaste?.() },
      ],
    },
  };

  const handleToolClick = (toolId: string, action?: () => void) => {
    if (action) action();
    else onToolSelect(toolId as ToolType);
    setActiveCategory(null);
  };

  const toggleCategory = (id: string) => {
    setShowColorPicker(false);
    setActiveCategory(activeCategory === id ? null : id);
  };

  const btn = (active: boolean) => cn(
    'p-3 rounded-full transition-all relative',
    active ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
  );

  const ToolButton: React.FC<{ title: string; active: boolean; onClick: () => void; children: React.ReactNode }> = ({ title, active, onClick, children }) => (
    <button onClick={onClick} className={btn(active)} title={title} aria-label={title} aria-pressed={active}>{children}</button>
  );

  return (
    <div className={cn(
      'absolute z-40 pointer-events-none',
      isVertical ? 'left-4 top-20 flex flex-col items-center gap-4' : 'bottom-24 left-1/2 -translate-x-1/2 flex flex-row items-center gap-4',
    )}>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.ppt,.pptx"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onAddFile(file);
          e.target.value = '';
        }}
      />

      <div className={cn(
        'flex bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-lg pointer-events-auto',
        isVertical ? 'flex-col gap-1.5 p-2.5 max-h-[calc(100vh-240px)] overflow-y-auto scrollbar-hide' : 'flex-row gap-1.5 items-center p-2',
      )}>
        <ToolButton title="자료 넣기" active={activeCategory === 'media'} onClick={() => toggleCategory('media')}><Plus size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="선택 (V)" active={activeTool === 'select'} onClick={() => onToolSelect('select')}><MousePointer2 size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="화면 이동 (스페이스바를 누른 채 끌어도 됩니다)" active={activeTool === 'pan'} onClick={() => onToolSelect('pan')}><Hand size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="펜" active={activeCategory === 'draw' || DRAW_TOOLS.includes(activeTool)} onClick={() => {
          if (!DRAW_TOOLS.includes(activeTool)) onToolSelect('pen');
          toggleCategory('draw');
        }}><Pencil size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="지우개 (펜 선·글자·도형)" active={activeTool === 'eraser'} onClick={() => onToolSelect('eraser')}><Eraser size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="채우기" active={activeTool === 'bucket'} onClick={() => onToolSelect('bucket')}><PaintBucket size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="도형·직선·화살표" active={activeCategory === 'shapes'} onClick={() => toggleCategory('shapes')}><Shapes size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="글자 넣기" active={false} onClick={onAddText}><Type size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="편집 (올가미·복사·붙여넣기)" active={activeCategory === 'edit' || activeTool === 'lasso'} onClick={() => toggleCategory('edit')}><Scissors size={22} strokeWidth={1.5} /></ToolButton>
        <ToolButton title="레이저 포인터" active={activeTool === 'laser'} onClick={() => onToolSelect('laser')}><Zap size={22} strokeWidth={1.5} /></ToolButton>

        <div className={cn('bg-gray-200', isVertical ? 'h-px w-8 mx-auto my-1' : 'w-px h-8 mx-1 my-auto')} />

        <div className={cn('flex', isVertical ? 'flex-col gap-2 items-center' : 'flex-row gap-2 items-center')}>
          <button
            onClick={() => { setActiveCategory(null); setShowColorPicker(!showColorPicker); }}
            className="w-8 h-8 rounded-full border-2 border-gray-300 shadow-sm transition-transform hover:scale-110"
            style={{ backgroundColor: color }}
            title="색 고르기"
            aria-label="색 고르기"
          />
          <button
            onClick={handleEyedropper}
            className={cn('p-2 rounded-full transition-all hover:bg-gray-100', activeTool === 'eyedropper' ? 'bg-blue-50 text-blue-600' : 'text-gray-500')}
            title="스포이트 (화면에서 색 가져오기)"
            aria-label="스포이트"
          >
            <Pipette size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className={cn(
        'flex bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-lg pointer-events-auto',
        isVertical ? 'flex-col gap-1 p-2' : 'flex-row gap-1 p-2',
      )}>
        <button onClick={onUndo} className="p-2.5 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-900" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소"><Undo2 size={20} strokeWidth={1.5} /></button>
        <button onClick={onRedo} className="p-2.5 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-900" title="다시 실행 (Ctrl+Y)" aria-label="다시 실행"><Redo2 size={20} strokeWidth={1.5} /></button>
      </div>

      {/* 색 고르기 */}
      <AnimatePresence>
        {showColorPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              'absolute z-50 p-3 bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto w-[232px]',
              isVertical ? 'left-[84px] top-1/3' : 'bottom-full mb-4 left-1/2 -translate-x-1/2',
            )}
          >
            <div className="grid grid-cols-8 gap-1.5 mb-3">
              {PRESET_COLORS.map(p => (
                <button
                  key={p.c}
                  onClick={() => handleColorChange(p.c)}
                  title={p.n}
                  aria-label={p.n}
                  className={cn('w-6 h-6 rounded-full border border-gray-300', color.toLowerCase() === p.c && 'ring-2 ring-offset-1 ring-blue-500')}
                  style={{ backgroundColor: p.c }}
                />
              ))}
            </div>
            <HexColorPicker color={color} onChange={c => handleColorChange(c)} onMouseUp={() => handleColorChange(color, true)} style={{ width: '100%' }} />
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-gray-400 mb-1.5">최근 사용한 색</div>
              <div className="flex gap-1.5 min-h-6">
                {recentColors.length > 0 ? recentColors.map(c => (
                  <button key={c} onClick={() => handleColorChange(c)} className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: c }} aria-label={c} />
                )) : <div className="text-[11px] text-gray-400">아직 없습니다</div>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 하위 메뉴 */}
      <AnimatePresence>
        {activeCategory && (
          <motion.div
            initial={{ opacity: 0, x: isVertical ? -8 : 0, y: isVertical ? 0 : 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: isVertical ? -8 : 0, y: isVertical ? 0 : 8 }}
            className={cn(
              'absolute z-50 flex p-2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl min-w-[190px] pointer-events-auto',
              isVertical ? 'left-[84px] top-1/4 flex-col gap-1' : 'bottom-full mb-4 left-1/2 -translate-x-1/2 flex-row gap-1 items-center flex-wrap max-w-[90vw]',
            )}
          >
            <div className="px-3 py-1 text-[11px] font-bold text-gray-400">{categories[activeCategory].label}</div>
            {categories[activeCategory].tools.map(t => (
              <button
                key={t.id}
                onClick={() => handleToolClick(t.id, t.action)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left',
                  activeTool === t.id ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <t.icon size={18} strokeWidth={1.5} />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
            {(activeCategory === 'draw' || activeCategory === 'shapes') && (
              <div className="mt-1 pt-2 border-t border-gray-100 px-2">
                <div className="text-[11px] font-bold text-gray-400 mb-1">굵기</div>
                <div className="flex items-center gap-1">
                  {SIZES.map(s => (
                    <button
                      key={s.v}
                      onClick={() => onBrushSizeChange(s.v)}
                      className={cn('w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100', brushSize === s.v && 'bg-blue-50 ring-1 ring-blue-200')}
                      title={s.label}
                      aria-label={`굵기 ${s.label}`}
                    >
                      <div className={cn('bg-gray-700 rounded-full', s.dot)} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
