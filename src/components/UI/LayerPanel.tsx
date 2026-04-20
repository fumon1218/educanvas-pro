import React from 'react';
import { Layers, Eye, EyeOff, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

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
  isVertical: boolean;
  isZenMode?: boolean;
}

export const LayerPanel: React.FC<LayerPanelProps> = React.memo(({
  objects,
  onToggleVisibility,
  onToggleLock,
  onSelectObject,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  isVertical,
  isZenMode = false
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  // Reverse objects to show top layer first
  const reversedObjects = [...objects].reverse();

  return (
    <div className={cn(
      "absolute z-50 transition-all duration-400 pointer-events-none right-6 bottom-24 opacity-100 translate-x-0"
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg hover:shadow-2xl transition-all hover:bg-gray-50 pointer-events-auto",
          isOpen && "bg-indigo-50 text-indigo-600 border-indigo-200"
        )}
      >
        <Layers size={20} />
        <span className="font-semibold text-sm">Layers</span>
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute right-0 bottom-full mb-2 w-64 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[400px] pointer-events-auto"
        >
          <div className="p-2 border-b border-gray-100 flex justify-between bg-gray-50">
            <button onClick={onBringToFront} className="p-1.5 hover:bg-white rounded text-gray-600 hover:text-indigo-600" title="Bring to Front">
              <ArrowUpToLine size={16} />
            </button>
            <button onClick={onBringForward} className="p-1.5 hover:bg-white rounded text-gray-600 hover:text-indigo-600" title="Bring Forward">
              <ArrowUp size={16} />
            </button>
            <button onClick={onSendBackward} className="p-1.5 hover:bg-white rounded text-gray-600 hover:text-indigo-600" title="Send Backward">
              <ArrowDown size={16} />
            </button>
            <button onClick={onSendToBack} className="p-1.5 hover:bg-white rounded text-gray-600 hover:text-indigo-600" title="Send to Back">
              <ArrowDownToLine size={16} />
            </button>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 flex flex-col gap-1">
            {reversedObjects.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">No objects on canvas</div>
            ) : (
              reversedObjects.map((obj, index) => (
                <div 
                  key={obj.id || index}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group cursor-pointer border border-transparent hover:border-gray-200"
                  onClick={() => onSelectObject(obj.id)}
                >
                  <span className="text-xs font-medium text-gray-700 capitalize truncate flex-1">
                    {obj.type.replace('-', ' ')}
                  </span>
                  <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onToggleLock(obj.id); }}
                      className="p-1 hover:bg-gray-200 rounded text-gray-500"
                    >
                      {obj.locked ? <Lock size={14} className="text-red-500" /> : <Unlock size={14} />}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onToggleVisibility(obj.id); }}
                      className="p-1 hover:bg-gray-200 rounded text-gray-500"
                    >
                      {obj.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-gray-400" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
});
