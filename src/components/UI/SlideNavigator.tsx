import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Layout } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Slide {
  id: string;
  name: string;
  data: any;
  thumbnail?: string;
}

interface SlideNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  slides: Slide[];
  activeSlideId: string;
  onSelectSlide: (id: string) => void;
  onAddSlide: () => void;
  onRemoveSlide: (id: string) => void;
}

export const SlideNavigator: React.FC<SlideNavigatorProps> = ({
  isOpen,
  onClose,
  slides,
  activeSlideId,
  onSelectSlide,
  onAddSlide,
  onRemoveSlide,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-6xl h-[400px] bg-white rounded-t-3xl shadow-2xl border-t border-gray-200 pointer-events-auto flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-bottom border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Layout size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Slide Navigator</h2>
                  <p className="text-sm text-gray-500">Manage and navigate through your lecture slides</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onAddSlide}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  <Plus size={18} />
                  New Slide
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 text-gray-400 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8 custom-scrollbar">
              <div className="flex gap-6 h-full items-center">
                {slides.map((slide, index) => (
                  <div
                    key={slide.id}
                    className="flex flex-col gap-3 group shrink-0"
                  >
                    <div
                      onClick={() => onSelectSlide(slide.id)}
                      className={cn(
                        "relative w-56 aspect-[16/9] bg-gray-50 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden group-hover:shadow-xl",
                        activeSlideId === slide.id
                          ? "border-indigo-600 shadow-lg shadow-indigo-100 scale-105"
                          : "border-gray-200 hover:border-indigo-300"
                      )}
                    >
                      {slide.thumbnail ? (
                        <img
                          src={slide.thumbnail}
                          alt={slide.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Layout size={48} strokeWidth={1} />
                        </div>
                      )}
                      
                      {/* Overlay Info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                         <span className="text-white text-xs font-bold">Slide {index + 1}</span>
                      </div>

                      {/* Delete Button */}
                      {slides.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSlide(slide.id);
                          }}
                          className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className={cn(
                        "text-xs font-bold uppercase tracking-wider",
                        activeSlideId === slide.id ? "text-indigo-600" : "text-gray-400"
                      )}>
                        Page {index + 1}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 truncate max-w-[120px]">
                        {slide.name}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Add Slide Placeholder */}
                <button
                  onClick={onAddSlide}
                  className="w-56 aspect-[16/9] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 hover:bg-indigo-50/30 transition-all shrink-0"
                >
                  <Plus size={32} strokeWidth={1} />
                  <span className="text-xs font-bold uppercase tracking-widest">Add Slide</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
