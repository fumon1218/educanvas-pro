import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layout, Moon, Sun, Grid, Circle, Square, MonitorSpeaker } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasBackground: 'blank' | 'grid' | 'dot' | 'dark';
  onCanvasBackgroundChange: (bg: 'blank' | 'grid' | 'dot' | 'dark') => void;
  isVertical: boolean;
  onToggleOrientation: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  recordSystemAudio: boolean;
  onToggleRecordSystemAudio: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  canvasBackground,
  onCanvasBackgroundChange,
  isVertical,
  onToggleOrientation,
  theme,
  onToggleTheme,
  recordSystemAudio,
  onToggleRecordSystemAudio,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-800">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-8">
            {/* Canvas Background */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Canvas Background</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onCanvasBackgroundChange('blank')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    canvasBackground === 'blank' ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-gray-300 text-gray-600"
                  )}
                >
                  <Square size={18} />
                  <span className="font-medium text-sm">Blank</span>
                </button>
                <button
                  onClick={() => onCanvasBackgroundChange('grid')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    canvasBackground === 'grid' ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-gray-300 text-gray-600"
                  )}
                >
                  <Grid size={18} />
                  <span className="font-medium text-sm">Grid</span>
                </button>
                <button
                  onClick={() => onCanvasBackgroundChange('dot')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    canvasBackground === 'dot' ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-gray-300 text-gray-600"
                  )}
                >
                  <Circle size={18} />
                  <span className="font-medium text-sm">Dot</span>
                </button>
                <button
                  onClick={() => onCanvasBackgroundChange('dark')}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    canvasBackground === 'dark' ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 hover:border-gray-300 text-gray-600"
                  )}
                >
                  <Moon size={18} />
                  <span className="font-medium text-sm">Dark Board</span>
                </button>
              </div>
            </div>

            {/* Toolbar Orientation */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Toolbar Layout</label>
                <p className="text-xs text-gray-500">Switch between horizontal and vertical</p>
              </div>
              <button
                onClick={onToggleOrientation}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium text-gray-700"
              >
                <Layout size={16} className={cn("transition-transform", isVertical ? "-rotate-90" : "")} />
                {isVertical ? 'Vertical' : 'Horizontal'}
              </button>
            </div>

            {/* Theme */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Theme</label>
                <p className="text-xs text-gray-500">App appearance</p>
              </div>
              <button
                onClick={onToggleTheme}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium text-gray-700"
              >
                {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>

            {/* Recording Sync */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">System Audio</label>
                <p className="text-xs text-gray-500">Include system audio in recordings</p>
              </div>
              <button
                onClick={onToggleRecordSystemAudio}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  recordSystemAudio ? "bg-purple-500" : "bg-gray-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    recordSystemAudio ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
