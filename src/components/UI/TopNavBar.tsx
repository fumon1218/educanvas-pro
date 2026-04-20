import React, { useState, useRef, useEffect } from 'react';
import { Home, ArrowLeft, ChevronDown, Users, Share, MoreHorizontal, Save, FolderOpen, FileText, Trash2, LayoutTemplate, Settings, Search, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TopNavBarProps {
  onSave?: () => void;
  onLoad?: () => void;
  onExportPDF?: () => void;
  onClearAll?: () => void;
  onOpenSettings?: () => void;
  onToggleLayout?: () => void;
  onGenerate?: (query: string) => void;
  onShare?: () => void;
  onGoHome?: () => void;
  onOpenMultiplayer?: () => void;
  isGenerating?: boolean;
  isZenMode?: boolean;
  view?: 'home' | 'editor';
}

export const TopNavBar: React.FC<TopNavBarProps> = ({ 
  onSave, 
  onLoad, 
  onExportPDF,
  onClearAll,
  onOpenSettings,
  onToggleLayout,
  onGenerate,
  onShare,
  onGoHome,
  isGenerating = false,
  isZenMode = false,
  view = 'editor'
}) => {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn(
      "absolute top-0 left-0 w-full z-50 flex flex-col pointer-events-none transition-all duration-400 opacity-100 translate-y-0"
    )}>
      {/* Layer 1: Main Nav */}
      <div className="flex justify-between items-center h-16 px-4">
        {/* Left */}
        <div className="pointer-events-auto flex items-center gap-3">
          <button 
            onClick={onGoHome}
            className={cn(
              "p-2.5 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-gray-600",
              view === 'home' && "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
            )}
            title="Home"
          >
            <Home size={20} />
          </button>

          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all group"
            >
              <span className="font-medium text-sm text-gray-700">File</span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>

            <AnimatePresence>
              {isFileMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 top-full left-0 mt-2 w-48 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1 pointer-events-auto"
                >
                  <button 
                    onClick={() => { onSave?.(); setIsFileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    <Save size={16} className="text-gray-500" />
                    Save Project
                  </button>
                  <button 
                    onClick={() => { onLoad?.(); setIsFileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    <FolderOpen size={16} className="text-gray-500" />
                    Load Project
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button 
                    onClick={() => { onExportPDF?.(); setIsFileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    <FileText size={16} className="text-gray-500" />
                    Export as PDF
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center */}
        <div className="pointer-events-auto">
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button 
            onClick={onOpenMultiplayer}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white rounded-full shadow-sm hover:shadow-md hover:bg-green-700 transition-all text-sm font-medium"
          >
            <Users size={14} />
            협업하기
          </button>

          <button 
            onClick={onShare}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-full shadow-sm hover:shadow-md hover:bg-indigo-700 transition-all text-sm font-medium"
          >
            <Share size={14} />
            Share
          </button>
          
          {/* Compact Search/Generate Bar */}
          <div className="relative flex items-center w-64 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-all focus-within:w-80">
            <div className="pl-3 pr-2 text-gray-400">
              <Sparkles size={14} />
            </div>
            <input 
              type="text" 
              placeholder="Generate with AI..." 
              className="flex-1 bg-transparent border-none outline-none py-1.5 text-xs text-gray-700 placeholder:text-gray-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onGenerate && searchQuery.trim()) {
                  onGenerate(searchQuery);
                  setSearchQuery("");
                }
              }}
            />
            <div className="pr-1.5">
              <button 
                onClick={() => {
                  if (onGenerate && searchQuery.trim()) {
                    onGenerate(searchQuery);
                    setSearchQuery("");
                  }
                }}
                disabled={isGenerating || !searchQuery.trim()}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full transition-colors",
                  isGenerating || !searchQuery.trim()
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                )}
              >
                {isGenerating ? <Sparkles size={12} className="animate-spin" /> : <ArrowRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Layer 2: Action Bar */}
      <div className="flex justify-end items-center h-14 px-4 mt-2">
        {/* Right Group */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button 
            onClick={onClearAll}
            className="p-2.5 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all text-gray-600 group"
            title="Clear All"
          >
            <Trash2 size={18} />
          </button>
          <button 
            onClick={onToggleLayout}
            className="p-2.5 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-gray-600 group"
          >
            <LayoutTemplate size={18} />
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2.5 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-gray-600 group"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
