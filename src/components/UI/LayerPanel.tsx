import React from 'react';
import { Layers, Eye, EyeOff, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LayerObject {
  id: string;
  type: string;
  visible: boolean;
  locked: boolean;
}

interface LayerPanelProps {
  objects: LayerObject[];
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onSelectObject: (id: string) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  path: '펜 선', 'i-text': '글자', text: '글자', textbox: '글자 상자', image: '사진', rect: '사각형', circle: '원',
  ellipse: '타원', triangle: '삼각형', polygon: '다각형', line: '직선', group: '그룹', video: '동영상', audio: '소리', weblink: '웹 링크',
};

export const LayerPanel: React.FC<LayerPanelProps> = React.memo(({
  objects, onToggleVisibility, onToggleLock, onSelectObject, onBringToFront, onSendToBack, onBringForward, onSendBackward,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const reversed = [...objects].reverse();

  const ArrangeButton = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button onClick={onClick} className="p-1.5 hover:bg-white rounded text-gray-600 hover:text-indigo-600" title={title} aria-label={title}>{children}</button>
  );

  return (
    <div className="absolute z-30 pointer-events-none right-6 bottom-28">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:bg-gray-50 pointer-events-auto',
          isOpen && 'bg-indigo-50 text-indigo-600 border-indigo-200',
        )}
        aria-expanded={isOpen}
      >
        <Layers size={20} />
        <span className="font-semibold text-sm">레이어 ({objects.length})</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-0 bottom-full mb-2 w-64 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[400px] pointer-events-auto"
          >
            <div className="p-2 border-b border-gray-100 flex justify-between bg-gray-50">
              <ArrangeButton onClick={onBringToFront} title="맨 앞으로"><ArrowUpToLine size={16} /></ArrangeButton>
              <ArrangeButton onClick={onBringForward} title="앞으로"><ArrowUp size={16} /></ArrangeButton>
              <ArrangeButton onClick={onSendBackward} title="뒤로"><ArrowDown size={16} /></ArrangeButton>
              <ArrangeButton onClick={onSendToBack} title="맨 뒤로"><ArrowDownToLine size={16} /></ArrangeButton>
            </div>
            <div className="overflow-y-auto flex-1 p-2 flex flex-col gap-1">
              {reversed.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-4">이 슬라이드에 아직 아무것도 없습니다</div>
              ) : reversed.map((obj, index) => (
                <div
                  key={obj.id || index}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group cursor-pointer border border-transparent hover:border-gray-200"
                  onClick={() => onSelectObject(obj.id)}
                >
                  <span className={cn('text-xs font-medium truncate flex-1', obj.visible ? 'text-gray-700' : 'text-gray-400 line-through')}>
                    {TYPE_LABELS[obj.type] || obj.type}
                  </span>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                    <button onClick={e => { e.stopPropagation(); onToggleLock(obj.id); }} className="p-1 hover:bg-gray-200 rounded text-gray-500" title={obj.locked ? '잠금 풀기' : '잠그기'} aria-label={obj.locked ? '잠금 풀기' : '잠그기'}>
                      {obj.locked ? <Lock size={14} className="text-red-500" /> : <Unlock size={14} />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); onToggleVisibility(obj.id); }} className="p-1 hover:bg-gray-200 rounded text-gray-500" title={obj.visible ? '숨기기' : '보이기'} aria-label={obj.visible ? '숨기기' : '보이기'}>
                      {obj.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-gray-400" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400">잠근 객체는 선택·이동·지우개에서 보호됩니다.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
