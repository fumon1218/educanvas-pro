import React from 'react';
import { Plus, Trash2, Play, Square, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Scene {
  id: string;
  name: string;
  data: any;
}

interface RecordingPanelProps {
  scenes: Scene[];
  activeSceneId: string;
  onSceneSelect: (id: string) => void;
  onAddScene: () => void;
  onRemoveScene: (id: string) => void;
  isRecording: boolean;
  onToggleRecording: () => void;
}

export const RecordingPanel: React.FC<RecordingPanelProps> = ({
  scenes,
  activeSceneId,
  onSceneSelect,
  onAddScene,
  onRemoveScene,
  isRecording,
  onToggleRecording,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 bg-white/90 backdrop-blur-md border border-gray-200 rounded-3xl shadow-2xl z-50">
      <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
        <button
          onClick={onToggleRecording}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-semibold transition-all duration-300",
            isRecording 
              ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200" 
              : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200"
          )}
        >
          {isRecording ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto max-w-[50vw] px-2 no-scrollbar">
        <AnimatePresence mode="popLayout">
          {scenes.map((scene, index) => (
            <motion.div
              key={scene.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                "relative group flex items-center gap-2 px-4 py-2 rounded-xl border transition-all cursor-pointer whitespace-nowrap",
                activeSceneId === scene.id
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-500/20"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              )}
              onClick={() => onSceneSelect(scene.id)}
            >
              <span className="text-xs font-bold opacity-50">{index + 1}</span>
              <span className="text-sm font-medium">{scene.name}</span>
              
              {scenes.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveScene(scene.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-600 rounded-md transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          onClick={onAddScene}
          className="p-2 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-all"
          title="Add Scene"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <Save size={20} />
        </button>
      </div>
    </div>
  );
};
