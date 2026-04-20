import React, { useState } from 'react';
import { 
  Pencil, 
  Pen,
  Feather,
  Minus,
  Eraser, 
  Zap, 
  MousePointer2, 
  Circle, 
  Square, 
  Triangle as TriangleIcon,
  Shapes,
  Type,
  Trash2,
  PaintBucket,
  Plus,
  Star,
  Image as ImageIcon,
  Smile,
  Highlighter,
  Upload,
  Link,
  File as FileIcon,
  Undo2,
  Redo2,
  Hand,
  Palette,
  Pipette,
  Scissors,
  Settings,
  Search,
  Copy,
  ClipboardPaste
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { HexColorPicker } from 'react-colorful';

interface ToolbarProps {
  activeTool: string;
  onToolSelect: (tool: any) => void;
  onAddShape: (shape: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon') => void;
  onAddText: () => void;
  color: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  onClear: () => void;
  isVertical: boolean;
  onAddFile: (file: File) => void;
  onAddWebLink: (url: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isZenMode?: boolean;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolSelect,
  onAddShape,
  onAddText,
  color,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  onClear,
  isVertical,
  onAddFile,
  onAddWebLink,
  onUndo,
  onRedo,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isZenMode = false,
  onCopy,
  onPaste,
  onCut,
}) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPickedNotification, setShowPickedNotification] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleColorChange = (newColor: string) => {
    onColorChange(newColor);
    if (!recentColors.includes(newColor) && !['#000000', '#ef4444', '#3b82f6'].includes(newColor)) {
      setRecentColors(prev => [newColor, ...prev.slice(0, 4)]);
    }
  };

  const handleEyedropper = async () => {
    if ('EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        handleColorChange(result.sRGBHex);
        
        setShowPickedNotification(true);
        setTimeout(() => setShowPickedNotification(false), 2000);
      } catch (e) {
        console.log('EyeDropper canceled or failed', e);
      }
    } else {
      // Fallback
      onToolSelect('eyedropper');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAddFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleWebLinkPrompt = () => {
    const url = window.prompt('Enter website URL:');
    if (url) {
      onAddWebLink(url);
    }
  };

  const categories = [
    {
      id: 'media',
      icon: Plus,
      label: 'Media',
      tools: [
        { id: 'upload', icon: Upload, label: 'Upload File', action: () => fileInputRef.current?.click() },
        { id: 'weblink', icon: Link, label: 'Web Link', action: handleWebLinkPrompt },
      ]
    },
    {
      id: 'draw',
      icon: Pencil,
      label: 'Drawing Tools',
      tools: [
        { id: 'pen', icon: Pencil, label: 'Standard Pen' },
        { id: 'pencil', icon: Pencil, label: 'Pencil' },
        { id: 'fountain', icon: Feather, label: 'Fountain Pen' },
        { id: 'ballpoint', icon: Pen, label: 'Ballpoint Pen' },
        { id: 'dashed', icon: Minus, label: 'Dashed Line' },
        { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
      ]
    },
    {
      id: 'shapes',
      icon: Shapes,
      label: 'Shapes',
      tools: [
        { id: 'rect', icon: Square, label: 'Rectangle', action: () => onAddShape('rect') },
        { id: 'circle', icon: Circle, label: 'Circle', action: () => onAddShape('circle') },
        { id: 'ellipse', icon: Circle, label: 'Ellipse', action: () => onAddShape('ellipse') },
        { id: 'triangle', icon: TriangleIcon, label: 'Triangle', action: () => onAddShape('triangle') },
        { id: 'polygon', icon: Shapes, label: 'Polygon', action: () => onAddShape('polygon') },
      ]
    },
    {
      id: 'edit',
      icon: Scissors,
      label: 'Edit',
      tools: [
        { id: 'cut', icon: Scissors, label: 'Lasso / Cut', action: () => onCut?.() },
        { id: 'copy', icon: Copy, label: 'Copy', action: () => onCopy?.() },
        { id: 'paste', icon: ClipboardPaste, label: 'Paste', action: () => onPaste?.() },
      ]
    }
  ];

  const colors = [
    '#000000', '#ef4444', '#3b82f6'
  ];

  const handleToolClick = (toolId: string, action?: () => void) => {
    if (action) {
      action();
    } else {
      onToolSelect(toolId);
    }
    setActiveCategory(null);
  };

  return (
    <div className={cn(
      "absolute z-40 transition-all duration-400 pointer-events-none opacity-100",
      isVertical 
        ? "left-4 top-20 flex flex-col items-center gap-4" 
        : "bottom-24 left-1/2 -translate-x-1/2 flex flex-row items-center gap-4"
    )}>
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,video/*,audio/*,.pdf,.ppt,.pptx,.xls,.xlsx"
        onChange={handleFileUpload}
      />
      
      {/* Main Group (Top) */}
      <div className={cn(
        "flex bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 pointer-events-auto",
        isVertical ? "flex-col gap-2 p-3 max-h-[calc(100vh-240px)] overflow-y-auto scrollbar-hide" : "flex-row gap-2 items-center p-2"
      )}>
        {/* 1. Plus (+) */}
        <button
          onClick={() => setActiveCategory(activeCategory === 'media' ? null : 'media')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeCategory === 'media' ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Add Media"
        >
          <Plus size={22} strokeWidth={1.5} />
        </button>

        {/* 2. Select (Pointer) */}
        <button
          onClick={() => onToolSelect('select')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeTool === 'select' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Select"
        >
          <MousePointer2 size={22} strokeWidth={1.5} />
        </button>

        {/* 2.5 Pan (Hand) */}
        <button
          onClick={() => onToolSelect('pan')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeTool === 'pan' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Pan"
        >
          <Hand size={22} strokeWidth={1.5} />
        </button>

        {/* 3. Pencil */}
        <button
          onClick={() => setActiveCategory(activeCategory === 'draw' ? null : 'draw')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeCategory === 'draw' || ['pen', 'pencil', 'fountain', 'ballpoint', 'dashed', 'highlighter'].includes(activeTool) 
              ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Drawing Tools"
        >
          <Pencil size={22} strokeWidth={1.5} />
        </button>

        {/* 4. Eraser */}
        <button
          onClick={() => onToolSelect('eraser')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeTool === 'eraser' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Eraser"
        >
          <Eraser size={22} strokeWidth={1.5} />
        </button>

        {/* 5. Bucket */}
        <button
          onClick={() => onToolSelect('bucket')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeTool === 'bucket' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Color Drop"
        >
          <PaintBucket size={22} strokeWidth={1.5} />
        </button>

        {/* 6. Shapes */}
        <button
          onClick={() => setActiveCategory(activeCategory === 'shapes' ? null : 'shapes')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeCategory === 'shapes' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Shapes"
        >
          <Shapes size={22} strokeWidth={1.5} />
        </button>

        {/* 7. T (Text) */}
        <button
          onClick={onAddText}
          className="p-3 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          title="Add Text"
        >
          <Type size={22} strokeWidth={1.5} />
        </button>

        {/* 8. Edit / Cut */}
        <button
          onClick={() => setActiveCategory(activeCategory === 'edit' ? null : 'edit')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeCategory === 'edit' || activeTool === 'cut' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Edit"
        >
          <Scissors size={22} strokeWidth={1.5} />
        </button>

        {/* 9. Laser Pointer */}
        <button
          onClick={() => onToolSelect('laser')}
          className={cn(
            "p-3 rounded-full transition-all group relative",
            activeTool === 'laser' ? "bg-blue-50 text-blue-600 ring-2 ring-blue-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          )}
          title="Laser Pointer"
        >
          <Zap size={22} strokeWidth={1.5} />
        </button>

        {/* Color Picker / Eyedropper inside Main Pill */}
        <div className={cn("bg-gray-200 transition-all", isVertical ? "h-px w-8 mx-auto my-1" : "w-px h-8 mx-1 my-auto")} />
        
        <div className={cn("flex transition-all", isVertical ? "flex-col gap-2 items-center" : "flex-row gap-2")}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-8 h-8 rounded-full border-2 border-gray-200 shadow-sm transition-transform hover:scale-110"
            style={{ backgroundColor: color }}
            title="Color Picker"
          />
          <button
            onClick={handleEyedropper}
            className={cn(
              "p-2 rounded-full transition-all hover:bg-gray-100",
              activeTool === 'eyedropper' ? "bg-blue-50 text-blue-600" : "text-gray-500"
            )}
            title="Eyedropper"
          >
            <Pipette size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* History Group (Middle) */}
      <div className={cn(
        "flex bg-white/90 backdrop-blur-md border border-gray-200 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 pointer-events-auto",
        isVertical ? "flex-col gap-1 p-2" : "flex-row gap-1 p-2"
      )}>
        <button
          onClick={onUndo}
          className="p-2.5 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          title="Undo"
        >
          <Undo2 size={20} strokeWidth={1.5} />
        </button>
        <button
          onClick={onRedo}
          className="p-2.5 rounded-full text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          title="Redo"
        >
          <Redo2 size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Pop-out Menus */}
      <AnimatePresence>
        {showColorPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: isVertical ? 20 : 0, y: isVertical ? 0 : 20 }}
            animate={{ opacity: 1, scale: 1, x: isVertical ? 80 : 0, y: isVertical ? 0 : -20 }}
            exit={{ opacity: 0, scale: 0.9, x: isVertical ? 20 : 0, y: isVertical ? 0 : 20 }}
            className={cn(
              "absolute z-50 p-3 bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto",
              isVertical ? "left-0 top-1/2 -translate-y-1/2" : "bottom-full mb-4 left-1/2 -translate-x-1/2"
            )}
          >
            <HexColorPicker color={color} onChange={handleColorChange} />
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent Colors</div>
              <div className="flex gap-2">
                {recentColors.length > 0 ? recentColors.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleColorChange(c)}
                    className="w-6 h-6 rounded-full border border-gray-200"
                    style={{ backgroundColor: c }}
                  />
                )) : (
                  <div className="text-[10px] text-gray-400 italic">No custom colors yet</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPickedNotification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: isVertical ? 20 : 0 }}
            animate={{ opacity: 1, scale: 1, x: isVertical ? 80 : 0 }}
            exit={{ opacity: 0, scale: 0.9, x: isVertical ? 20 : 0 }}
            className={cn(
              "absolute z-[60] px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg shadow-lg whitespace-nowrap pointer-events-none",
              isVertical ? "left-0 top-1/2 -translate-y-1/2" : "bottom-full mb-4 left-1/2 -translate-x-1/2"
            )}
          >
            Color Picked!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sub-menu (Pop-out) */}
      <AnimatePresence>
        {activeCategory && (
          <motion.div
            initial={isVertical ? { opacity: 0, x: -10 } : { opacity: 0, y: 10 }}
            animate={isVertical ? { opacity: 1, x: 80 } : { opacity: 1, y: -10 }}
            exit={isVertical ? { opacity: 0, x: -10 } : { opacity: 0, y: 10 }}
            className={cn(
              "absolute z-50 flex p-2 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl min-w-[160px] transition-all duration-300 pointer-events-auto",
              isVertical ? "left-0 top-1/4 flex-col gap-2" : "bottom-full mb-4 left-1/2 -translate-x-1/2 flex-row gap-2 items-center"
            )}
          >
            <div className={cn(
              "px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest",
              !isVertical && "hidden"
            )}>
              {categories.find(c => c.id === activeCategory)?.label}
            </div>
            {categories.find(c => c.id === activeCategory)?.tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool.id, tool.action)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
                  activeTool === tool.id ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200" : "text-gray-600 hover:bg-gray-50",
                  !isVertical && "flex-col gap-1 py-1.5 px-2 min-w-[60px]"
                )}
              >
                <tool.icon size={18} strokeWidth={1.5} />
                <span className={cn("font-medium", isVertical ? "text-sm" : "text-[10px]")}>{tool.label}</span>
              </button>
            ))}
            {(activeCategory === 'draw' || activeCategory === 'shapes') && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-2 px-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Thickness</div>
                <div className="flex items-center justify-between gap-2">
                  <button 
                    onClick={() => onBrushSizeChange(2)}
                    className={cn("w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100", brushSize === 2 ? "bg-blue-50 ring-1 ring-blue-200" : "")}
                    title="Thin"
                  >
                    <div className="w-1 h-1 bg-gray-600 rounded-full" />
                  </button>
                  <button 
                    onClick={() => onBrushSizeChange(6)}
                    className={cn("w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100", brushSize === 6 ? "bg-blue-50 ring-1 ring-blue-200" : "")}
                    title="Medium"
                  >
                    <div className="w-2 h-2 bg-gray-600 rounded-full" />
                  </button>
                  <button 
                    onClick={() => onBrushSizeChange(12)}
                    className={cn("w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100", brushSize === 12 ? "bg-blue-50 ring-1 ring-blue-200" : "")}
                    title="Thick"
                  >
                    <div className="w-3 h-3 bg-gray-600 rounded-full" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
