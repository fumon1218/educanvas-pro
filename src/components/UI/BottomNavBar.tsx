import React from 'react';
import { Search, Video, Circle, Mic, ChevronLeft, ChevronRight, Plus, ChevronUp, LayoutTemplate } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface BottomNavBarProps {
  onZoomToggle: () => void;
  isZoomActive: boolean;
  zoomLevel: number;
  onResetZoom: () => void;
  currentSlide: number;
  totalSlides: number;
  onNextSlide: () => void;
  onPrevSlide: () => void;
  onAddSlide: () => void;
  onOpenSlideNavigator: () => void;
  isNavigatorPinned: boolean;
  onToggleNavigatorPin: () => void;
  isCameraOpen?: boolean;
  onToggleCamera?: () => void;
  isZenMode?: boolean;
  isVertical?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ 
  onZoomToggle, 
  isZoomActive,
  zoomLevel,
  onResetZoom,
  currentSlide,
  totalSlides,
  onNextSlide,
  onPrevSlide,
  onAddSlide,
  onOpenSlideNavigator,
  isNavigatorPinned,
  onToggleNavigatorPin,
  isCameraOpen = false,
  onToggleCamera,
  isZenMode = false,
  isVertical = true
}) => {
  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <div className={cn(
      "absolute bottom-0 left-0 w-full flex justify-between items-end pb-6 pointer-events-none transition-all duration-400 z-40 opacity-100 translate-y-0",
      isVertical ? "pl-[88px] pr-6" : "px-6"
    )}>
      {/* Left Group (Zoom + Media Control) */}
      <div className="flex items-end gap-6">
        {/* Floating Zoom */}
        <div className="pointer-events-auto z-10 flex items-center gap-3">
          <button 
            onClick={onZoomToggle}
            onDoubleClick={onResetZoom}
            className={cn(
              "relative w-14 h-14 flex items-center justify-center rounded-full shadow-lg hover:shadow-2xl transition-all group overflow-hidden",
              isZoomActive 
                ? "bg-purple-700 text-white ring-4 ring-purple-200" 
                : "bg-purple-600 text-white hover:bg-purple-700"
            )}
            title="Pan / Zoom Canvas (Double-click to reset)"
          >
            <AnimatePresence mode="wait">
              {zoomPercent === 100 ? (
                <motion.div
                  key="icon"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Search size={24} strokeWidth={2} />
                </motion.div>
              ) : (
                <motion.span
                  key="percent"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className={cn(
                    "font-bold text-white leading-none",
                    zoomPercent >= 1000 ? "text-[10px]" : "text-xs"
                  )}
                >
                  {zoomPercent}%
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button 
            onClick={onToggleNavigatorPin}
            className={cn(
              "p-3 rounded-full shadow-lg hover:shadow-2xl transition-all",
              isNavigatorPinned 
                ? "bg-indigo-600 text-white" 
                : "bg-white text-gray-600 hover:bg-gray-50"
            )}
            title={isNavigatorPinned ? "Unpin Mini-map" : "Pin Mini-map"}
          >
            <LayoutTemplate size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Media Control */}
        <div className="pointer-events-auto z-40">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-2xl transition-all p-2 group">
            <button 
              onClick={onToggleCamera}
              className={cn(
                "p-3 rounded-full transition-colors",
                isCameraOpen ? "text-blue-600 bg-blue-50" : "text-gray-500 hover:bg-gray-100"
              )} 
              title={isCameraOpen ? "Close Camera" : "Open Camera"}
            >
              <Video size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Right (Slide Navigation) */}
      <div className="pointer-events-auto z-40">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-2xl transition-all p-1.5 group">
          <button 
            onClick={onPrevSlide}
            disabled={currentSlide <= 1}
            className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors" 
            title="Previous Slide"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          
          <div className="w-px h-6 bg-gray-200 mx-1" />
          
          <button 
            onClick={onOpenSlideNavigator}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors font-medium text-sm"
          >
            <span>{currentSlide} / {totalSlides}</span>
            <ChevronUp size={16} strokeWidth={1.5} className="text-gray-400" />
          </button>
          
          <div className="w-px h-6 bg-gray-200 mx-1" />
          
          <button 
            onClick={onAddSlide}
            className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors" 
            title="Add Slide"
          >
            <Plus size={20} strokeWidth={1.5} />
          </button>
          
          <div className="w-px h-6 bg-gray-200 mx-1" />
          
          <button 
            onClick={onNextSlide}
            disabled={currentSlide >= totalSlides}
            className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors" 
            title="Next Slide"
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
};
