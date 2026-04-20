import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { motion, AnimatePresence } from 'motion/react';
import { Pin, PinOff } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface NavigatorProps {
  mainCanvas: fabric.Canvas | null;
  isPinned: boolean;
  onTogglePin: () => void;
  isZoomActive: boolean;
  isZenMode?: boolean;
}

export const Navigator: React.FC<NavigatorProps> = ({ mainCanvas, isPinned, onTogglePin, isZoomActive, isZenMode = false }) => {
  const [viewfinder, setViewfinder] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [imgData, setImgData] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showNavigator = useCallback(() => {
    setIsVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (isZoomActive) {
      showNavigator();
    }
  }, [isZoomActive, showNavigator]);

  useEffect(() => {
    if (!mainCanvas) return;

    let timeoutId: NodeJS.Timeout | null = null;
    const updateMiniMap = () => {
      if (!mainCanvas) return;

      const dataUrl = mainCanvas.toDataURL({
        format: 'png',
        quality: 0.3,
        multiplier: 0.05,
      });
      setImgData(dataUrl);

      const zoom = mainCanvas.getZoom();
      const vpt = mainCanvas.viewportTransform!;
      const width = mainCanvas.width!;
      const height = mainCanvas.height!;

      const left = -vpt[4] / zoom;
      const top = -vpt[5] / zoom;
      const viewWidth = width / zoom;
      const viewHeight = height / zoom;

      const objects = mainCanvas.getObjects();
      let minX = 0, minY = 0, maxX = width, maxY = height;

      if (objects.length > 0) {
        objects.forEach(obj => {
          const bound = obj.getBoundingRect();
          minX = Math.min(minX, bound.left);
          minY = Math.min(minY, bound.top);
          maxX = Math.max(maxX, bound.left + bound.width);
          maxY = Math.max(maxY, bound.top + bound.height);
        });
      }

      const padding = 200;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;

      setViewfinder({
        left: (left - minX) / totalWidth,
        top: (top - minY) / totalHeight,
        width: viewWidth / totalWidth,
        height: viewHeight / totalHeight,
      });
    };

    const throttledUpdate = () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        updateMiniMap();
        timeoutId = null;
      }, 100);
    };

    const handleStateChange = () => {
      throttledUpdate();
    };

    const handleWheel = () => {
      showNavigator();
      throttledUpdate();
    };

    const handlePanInteraction = () => {
      if (isZoomActive) {
        showNavigator();
      }
      throttledUpdate();
    };

    mainCanvas.on('object:added', handleStateChange);
    mainCanvas.on('object:modified', handleStateChange);
    mainCanvas.on('object:removed', handleStateChange);
    mainCanvas.on('mouse:wheel', handleWheel);
    mainCanvas.on('mouse:move', handlePanInteraction);
    mainCanvas.on('mouse:down', handlePanInteraction);

    updateMiniMap();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      mainCanvas.off('object:added', handleStateChange);
      mainCanvas.off('object:modified', handleStateChange);
      mainCanvas.off('object:removed', handleStateChange);
      mainCanvas.off('mouse:wheel', handleWheel);
      mainCanvas.off('mouse:move', handlePanInteraction);
      mainCanvas.off('mouse:down', handlePanInteraction);
    };
  }, [mainCanvas, showNavigator, isZoomActive]);

  const handleMiniMapInteract = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!mainCanvas) return;
    
    showNavigator();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const zoom = mainCanvas.getZoom();
    const width = mainCanvas.width!;
    const height = mainCanvas.height!;
    
    const objects = mainCanvas.getObjects();
    let minX = 0, minY = 0, maxX = width, maxY = height;

    if (objects.length > 0) {
      objects.forEach(obj => {
        const bound = obj.getBoundingRect();
        minX = Math.min(minX, bound.left);
        minY = Math.min(minY, bound.top);
        maxX = Math.max(maxX, bound.left + bound.width);
        maxY = Math.max(maxY, bound.top + bound.height);
      });
    }

    const padding = 200;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;

    const targetCanvasX = minX + x * totalWidth;
    const targetCanvasY = minY + y * totalHeight;

    const vpt = mainCanvas.viewportTransform!;
    vpt[4] = -(targetCanvasX * zoom) + width / 2;
    vpt[5] = -(targetCanvasY * zoom) + height / 2;
    
    mainCanvas.requestRenderAll();
    
    const viewWidth = width / zoom;
    const viewHeight = height / zoom;
    setViewfinder({
      left: (targetCanvasX - viewWidth / 2 - minX) / totalWidth,
      top: (targetCanvasY - viewHeight / 2 - minY) / totalHeight,
      width: viewWidth / totalWidth,
      height: viewHeight / totalHeight,
    });

  }, [mainCanvas, showNavigator]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    handleMiniMapInteract(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      handleMiniMapInteract(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    showNavigator();
  };

  const actuallyVisible = (isVisible || isPinned || isDragging) && !isZenMode;

  return (
    <AnimatePresence>
      {mainCanvas && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ 
            opacity: actuallyVisible ? 1 : 0, 
            scale: actuallyVisible ? 1 : 0.95, 
            y: actuallyVisible ? 0 : 10,
            pointerEvents: actuallyVisible ? 'auto' : 'none'
          }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="absolute bottom-24 right-6 w-56 h-36 bg-white/90 backdrop-blur-md border border-gray-200 rounded-xl shadow-2xl z-40 overflow-hidden"
          onMouseEnter={() => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            setIsVisible(true);
          }}
          onMouseLeave={() => {
            if (!isPinned && !isDragging) {
              showNavigator();
            }
          }}
        >
          <div className="relative w-full h-full p-2 flex flex-col">
            <div className="flex justify-between items-center mb-1 px-1">
              <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Navigator</span>
              <button 
                onClick={onTogglePin}
                className={cn("p-1 rounded hover:bg-gray-200 transition-colors", isPinned ? "text-indigo-600" : "text-gray-400")}
                title={isPinned ? "Unpin (Auto-hide)" : "Pin (Always show)"}
              >
                {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
              </button>
            </div>
            <div 
              className="relative flex-1 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden cursor-crosshair touch-none" 
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {imgData && (
                <img 
                  src={imgData} 
                  alt="Mini-map" 
                  className="w-full h-full object-contain opacity-50 pointer-events-none"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
              )}
              
              {/* Viewfinder */}
              <div 
                className="absolute border-2 border-purple-500 bg-purple-500/20 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.1)]"
                style={{
                  left: `${viewfinder.left * 100}%`,
                  top: `${viewfinder.top * 100}%`,
                  width: `${viewfinder.width * 100}%`,
                  height: `${viewfinder.height * 100}%`,
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
