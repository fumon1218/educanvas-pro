import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { jsPDF } from 'jspdf';
import { cn } from '@/src/lib/utils';

interface WhiteboardProps {
  tool: 'pen' | 'eraser' | 'laser' | 'select' | 'cut' | 'circle' | 'rect' | 'pencil' | 'fountain' | 'ballpoint' | 'dashed' | 'bucket' | 'highlighter' | 'pan' | 'eyedropper';
  color: string;
  brushSize: number;
  onSceneChange?: (json: any) => void;
  onSelectionChange?: (selection: { type: 'video' | 'audio' | 'weblink' | 'none', element?: any, url?: string }) => void;
  onZoomChange?: (zoom: number) => void;
  initialData?: any;
  onColorPicked?: (color: string) => void;
  onObjectsChange?: (objects: any[]) => void;
  canvasBackground?: 'blank' | 'grid' | 'dot' | 'dark';
  onCanvasChange?: (canvas: fabric.Canvas) => void;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  activeSceneId?: string;
  isZenMode?: boolean;
  multiplayer?: any;
}

export interface WhiteboardHandle {
  addResource: (type: 'image' | 'text', data: string) => void;
  addFile: (file: File) => Promise<void>;
  addImages: (dataUrls: string[]) => void;
  addWebLink: (url: string) => void;
  addShape: (type: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon') => void;
  addText: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  toggleLock: (id: string) => void;
  toggleVisibility: (id: string) => void;
  selectObject: (id: string) => void;
  toJSON: () => string;
  loadFromJSON: (json: string) => void;
  exportToPDF: () => void;
  getCanvas: () => fabric.Canvas | null;
  copy: () => void;
  paste: () => void;
  cut: () => void;
  deleteSelected: () => void;
  group: () => void;
  ungroup: () => void;
}

let globalClipboard: any = null;

export const Whiteboard = React.memo(React.forwardRef<WhiteboardHandle, WhiteboardProps>(({
  tool,
  color,
  brushSize,
  onSceneChange,
  onSelectionChange,
  onZoomChange,
  initialData,
  onColorPicked,
  onObjectsChange,
  canvasBackground = 'blank',
  onCanvasChange,
  onDrawingStateChange,
  activeSceneId,
  multiplayer,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef(tool);
  const lastLoadedSceneIdRef = useRef<string | undefined>(activeSceneId);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    if (fabricRef.current && activeSceneId !== lastLoadedSceneIdRef.current) {
      lastLoadedSceneIdRef.current = activeSceneId;
      if (initialData) {
        isRestoringRef.current = true;
        fabricRef.current.loadFromJSON(initialData)
          .then(() => {
            if (fabricRef.current) {
              const isSelectionTool = toolRef.current === 'select' || toolRef.current === 'cut';
              fabricRef.current.forEachObject(obj => {
                obj.selectable = isSelectionTool;
                obj.evented = isSelectionTool;
              });
              fabricRef.current.requestRenderAll();
            }
          })
          .catch((err) => {
            console.error("Error loading canvas data:", err);
          })
          .finally(() => {
            isRestoringRef.current = false;
          });
      } else {
        fabricRef.current.clear();
        fabricRef.current.backgroundColor = '#ffffff';
        fabricRef.current.requestRenderAll();
      }
    }
  }, [activeSceneId, initialData]);

  // History State
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [hasSelection, setHasSelection] = useState(false);
  const [isGroupSelected, setIsGroupSelected] = useState(false);
  const [canGroup, setCanGroup] = useState(false);
  const isRestoringRef = useRef(false);
  const isDrawingRef = useRef(false);

  const multiplayerRef = useRef(multiplayer);
  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);

  const updateObjectsList = useCallback(() => {
    if (!fabricRef.current || isDrawingRef.current) return;
    const objects = fabricRef.current.getObjects().map(obj => ({
      id: (obj as any).id,
      type: obj.type,
      visible: obj.visible,
      locked: !obj.selectable,
    }));
    onObjectsChange?.(objects);
  }, [onObjectsChange]);

  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleImagesAdd = useCallback(async (dataUrls: string[]) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    
    const columns = 4;
    const padding = 40;
    const targetWidth = 400;
    
    const images = await Promise.all(dataUrls.map(url => {
      return new Promise<fabric.FabricImage>((resolve) => {
        fabric.FabricImage.fromURL(url).then(resolve);
      });
    }));
    
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;
    
    images.forEach((img, index) => {
      const scale = targetWidth / img.width!;
      img.scale(scale);
      
      const col = index % columns;
      const row = Math.floor(index / columns);
      
      if (col === 0 && row > 0) {
         currentX = 0;
         currentY += rowHeight + padding;
         rowHeight = 0;
      }
      
      img.set({
        left: currentX,
        top: currentY,
        cornerColor: '#3b82f6',
        cornerSize: 10,
        transparentCorners: false,
      });
      
      currentX += img.getScaledWidth() + padding;
      rowHeight = Math.max(rowHeight, img.getScaledHeight());
    });
    
    const totalWidth = Math.min(images.length, columns) * targetWidth + (Math.min(images.length, columns) - 1) * padding;
    const totalHeight = currentY + rowHeight;
    
    const startX = (canvas.width! - totalWidth) / 2;
    const startY = (canvas.height! - totalHeight) / 2;
    
    images.forEach(img => {
      img.set({
        left: img.left! + startX,
        top: img.top! + startY
      });
      canvas.add(img);
    });
    
    if (images.length > 0) {
      const sel = new fabric.ActiveSelection(images, { canvas });
      canvas.setActiveObject(sel);
      canvas.requestRenderAll();
    }
  }, []);

  const saveHistory = useCallback(() => {
    if (isRestoringRef.current || !fabricRef.current || isDrawingRef.current) return;
    
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    
    historyTimeoutRef.current = setTimeout(() => {
      if (!fabricRef.current) return;
      const jsonStr = JSON.stringify(fabricRef.current.toObject(['id', 'isVideo', 'videoElement', 'isAudio', 'audioUrl', 'isWebLink', 'url']));
      
      setUndoStack((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === jsonStr) {
          return prev;
        }
        return [...prev, jsonStr];
      });
      setRedoStack([]);
      updateObjectsList();
    }, 100); // Trigger much faster so undo captures the state
  }, [updateObjectsList]);

  const notifyCanvasChange = useCallback(() => {
    if (onCanvasChange && fabricRef.current) {
      if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
      
      notifyTimeoutRef.current = setTimeout(() => {
        if (fabricRef.current) {
          onCanvasChange(fabricRef.current);
        }
      }, 1000); // Increased to 1s
    }
  }, [onCanvasChange]);

  const handleCopy = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone().then((cloned: any) => {
        globalClipboard = cloned;
      });
    }
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      isRestoringRef.current = true;
      canvas.remove(...activeObjects);
      canvas.discardActiveObject();
      isRestoringRef.current = false;
      saveHistory();
      notifyCanvasChange();
      canvas.requestRenderAll();
      setHasSelection(false);
    }
  }, [saveHistory, notifyCanvasChange]);

  const handleCut = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone().then((cloned: any) => {
        globalClipboard = cloned;
        handleDeleteSelected();
      });
    }
  }, [handleDeleteSelected]);

  const handlePaste = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || !globalClipboard) return;

    globalClipboard.clone().then((clonedObj: any) => {
      canvas.discardActiveObject();
      
      clonedObj.set({
        left: clonedObj.left + 20,
        top: clonedObj.top + 20,
        evented: true,
      });
      
      if (clonedObj.type === 'activeSelection') {
        clonedObj.canvas = canvas;
        clonedObj.forEachObject((obj: any) => {
          if (!obj.id) obj.id = Math.random().toString(36).substr(2, 9);
          canvas.add(obj);
        });
        clonedObj.setCoords();
      } else {
        if (!clonedObj.id) clonedObj.id = Math.random().toString(36).substr(2, 9);
        canvas.add(clonedObj);
      }
      
      globalClipboard.top += 20;
      globalClipboard.left += 20;
      
      canvas.setActiveObject(clonedObj);
      canvas.requestRenderAll();
      
      saveHistory();
      notifyCanvasChange();
    });
  }, [saveHistory, notifyCanvasChange]);

  const handleGroup = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    
    if (activeObject && activeObject.type === 'activeSelection') {
      (activeObject as any).toGroup();
      canvas.requestRenderAll();
      saveHistory();
      notifyCanvasChange();
    }
  }, [saveHistory, notifyCanvasChange]);

  const handleUngroup = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    
    if (activeObject && activeObject.type === 'group') {
      (activeObject as any).toActiveSelection();
      canvas.requestRenderAll();
      saveHistory();
      notifyCanvasChange();
    }
  }, [saveHistory, notifyCanvasChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only delete if we're not typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        handlePaste();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelected, handleCopy, handlePaste]);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    undo: () => {
      if (undoStack.length <= 1 || !fabricRef.current) return;

      isRestoringRef.current = true;
      const current = undoStack[undoStack.length - 1];
      const prev = undoStack[undoStack.length - 2];
      
      setRedoStack((stack) => [...stack, current]);
      setUndoStack((stack) => stack.slice(0, -1));

      // Use string directly if loadFromJSON supports it, or parse it if it's a string
      const parsedPrev = typeof prev === 'string' ? JSON.parse(prev) : prev;
      fabricRef.current.loadFromJSON(parsedPrev).then(() => {
        fabricRef.current?.renderAll();
        isRestoringRef.current = false;
      });
    },
    redo: () => {
      if (redoStack.length === 0 || !fabricRef.current) return;

      isRestoringRef.current = true;
      const next = redoStack[redoStack.length - 1];
      
      setUndoStack((stack) => [...stack, next]);
      setRedoStack((stack) => stack.slice(0, -1));

      const parsedNext = typeof next === 'string' ? JSON.parse(next) : next;
      fabricRef.current.loadFromJSON(parsedNext).then(() => {
        fabricRef.current?.renderAll();
        isRestoringRef.current = false;
      });
    },
    zoomIn: () => {
      if (!fabricRef.current) return;
      let zoom = fabricRef.current.getZoom();
      zoom *= 1.1;
      if (zoom > 20) zoom = 20;
      fabricRef.current.setZoom(zoom);
      onZoomChange?.(zoom);
    },
    zoomOut: () => {
      if (!fabricRef.current) return;
      let zoom = fabricRef.current.getZoom();
      zoom /= 1.1;
      if (zoom < 0.01) zoom = 0.01;
      fabricRef.current.setZoom(zoom);
      onZoomChange?.(zoom);
    },
    resetZoom: () => {
      if (!fabricRef.current) return;
      fabricRef.current.setZoom(1);
      fabricRef.current.viewportTransform = [1, 0, 0, 1, 0, 0];
      fabricRef.current.renderAll();
      onZoomChange?.(1);
    },
    bringToFront: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.bringObjectToFront(activeObject);
        saveHistory();
      }
    },
    sendToBack: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.sendObjectToBack(activeObject);
        saveHistory();
      }
    },
    bringForward: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.bringObjectForward(activeObject);
        saveHistory();
      }
    },
    sendBackward: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.sendObjectBackwards(activeObject);
        saveHistory();
      }
    },
    toggleLock: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).id === id);
      if (obj) {
        const isLocked = !obj.selectable;
        obj.set({
          selectable: isLocked,
          evented: isLocked,
          lockMovementX: !isLocked,
          lockMovementY: !isLocked,
          lockRotation: !isLocked,
          lockScalingX: !isLocked,
          lockScalingY: !isLocked,
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        saveHistory();
      }
    },
    toggleVisibility: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).id === id);
      if (obj) {
        obj.set('visible', !obj.visible);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        saveHistory();
      }
    },
    selectObject: (id: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const obj = canvas.getObjects().find(o => (o as any).id === id);
      if (obj && obj.selectable && obj.visible) {
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
      }
    },
    toJSON: () => {
      const canvas = fabricRef.current;
      if (!canvas) return '';
      return JSON.stringify(canvas.toObject(['id', 'isVideo', 'videoElement', 'isAudio', 'audioUrl', 'isWebLink', 'url']));
    },
    loadFromJSON: (json: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      try {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        canvas.loadFromJSON(parsed).then(() => {
          canvas.renderAll();
          saveHistory();
        });
      } catch (e) {
        console.error('Failed to load JSON', e);
      }
    },
    exportToPDF: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      
      // Temporarily deselect objects to avoid selection boxes in PDF
      canvas.discardActiveObject();
      canvas.renderAll();

      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 2 // High resolution
      });

      // A4 dimensions in mm
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Calculate aspect ratio to fit image
      const imgProps = pdf.getImageProperties(dataUrl);
      const imgRatio = imgProps.width / imgProps.height;
      const pdfRatio = pdfWidth / pdfHeight;

      let finalWidth, finalHeight;
      if (imgRatio > pdfRatio) {
        finalWidth = pdfWidth;
        finalHeight = pdfWidth / imgRatio;
      } else {
        finalHeight = pdfHeight;
        finalWidth = pdfHeight * imgRatio;
      }

      // Center the image
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;

      pdf.addImage(dataUrl, 'PNG', x, y, finalWidth, finalHeight);
      
      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`Lecture_Note_${dateStr}.pdf`);
    },
    getCanvas: () => fabricRef.current,
    addResource: (type, data) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (type === 'text') {
        const text = new fabric.IText(data, {
          left: 100,
          top: 100,
          fontSize: 20,
          fontFamily: 'Inter',
          fill: '#333',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
      } else if (type === 'image') {
        fabric.FabricImage.fromURL(data).then((img) => {
          img.scaleToWidth(200);
          canvas.add(img);
          canvas.setActiveObject(img);
        });
      }
      canvas.requestRenderAll();
    },
    addFile: async (file) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const fileType = file.type;
      const fileName = file.name.toLowerCase();

      if (fileType.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          fabric.FabricImage.fromURL(e.target?.result as string).then((img) => {
            const safeWidth = canvas.width! - 100;
            const safeHeight = canvas.height! - 240;
            const scale = Math.min(safeWidth / img.width!, safeHeight / img.height!, 1);
            img.scale(scale);
            canvas.centerObject(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
          });
        };
        reader.readAsDataURL(file);
      } else if (fileType.startsWith('video/')) {
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(file);
        videoElement.muted = true;
        videoElement.loop = true;
        videoElement.playsInline = true;
        videoElement.crossOrigin = 'anonymous';

        videoElement.onloadedmetadata = () => {
          const fabricVideo = new fabric.FabricImage(videoElement, {
            objectCaching: false,
          });
          
          const safeWidth = canvas.width! - 100;
          const safeHeight = canvas.height! - 240;
          const scale = Math.min(safeWidth / fabricVideo.width!, safeHeight / fabricVideo.height!, 1);
          fabricVideo.scale(scale);
          canvas.centerObject(fabricVideo);
          
          canvas.add(fabricVideo);
          canvas.setActiveObject(fabricVideo);

          // Video play logic
          videoElement.play();

          // Custom property to identify video
          (fabricVideo as any).isVideo = true;
          (fabricVideo as any).videoElement = videoElement;

          const render = () => {
            canvas.requestRenderAll();
            if (!videoElement.paused && !videoElement.ended) {
              fabric.util.requestAnimFrame(render);
            }
          };
          fabric.util.requestAnimFrame(render);
        };
      } else if (fileType.startsWith('audio/')) {
        const audioUrl = URL.createObjectURL(file);
        const group = new fabric.Group([
          new fabric.Rect({
            width: 120,
            height: 120,
            fill: '#f3f4f6',
            stroke: '#e5e7eb',
            strokeWidth: 2,
            rx: 12,
            ry: 12,
          }),
          new fabric.IText('🎵', {
            fontSize: 40,
            left: 40,
            top: 25,
          }),
          new fabric.IText(file.name.substring(0, 15) + '...', {
            fontSize: 10,
            left: 10,
            top: 80,
            fill: '#666',
          })
        ], {
          left: 100,
          top: 100,
        });
        (group as any).isAudio = true;
        (group as any).audioUrl = audioUrl;
        canvas.add(group);
        canvas.setActiveObject(group);
      } else if (fileName.endsWith('.pptx')) {
        try {
          // Dynamic import JSZip from CDN
          const JSZipModule: any = await import('https://esm.sh/jszip');
          const JSZip = JSZipModule.default;
          const zip = await JSZip.loadAsync(file);
          const mediaFolder = zip.folder("ppt/media");
          
          if (mediaFolder) {
            const imageFiles = Object.keys(mediaFolder.files).filter(name => 
              name.toLowerCase().match(/\.(jpg|jpeg|png|gif|emf|wmf)$/i)
            );
            
            if (imageFiles.length > 0) {
              const dataUrls = await Promise.all(imageFiles.map(async name => {
                const fileData = mediaFolder.file(name);
                if (!fileData) return "";
                const blob = await fileData.async("blob");
                return URL.createObjectURL(blob);
              }));
              
              const validUrls = dataUrls.filter(url => url !== "");
              if (validUrls.length > 0) {
                handleImagesAdd(validUrls);
                return;
              }
            }
          }
        } catch (err) {
          console.error("Error extracting images from PPTX:", err);
        }

        // Fallback if extraction fails
        const group = new fabric.Group([
          new fabric.Rect({
            width: 120,
            height: 120,
            fill: '#fff',
            stroke: '#3b82f6',
            strokeWidth: 2,
            rx: 12,
            ry: 12,
          }),
          new fabric.IText('📄', {
            fontSize: 40,
            left: 40,
            top: 25,
          }),
          new fabric.IText(file.name.substring(0, 15) + '...', {
            fontSize: 10,
            left: 10,
            top: 80,
            fill: '#666',
          }),
          new fabric.IText('Images not found. Convert to PDF.', {
            fontSize: 8,
            left: 10,
            top: 100,
            fill: '#999',
          })
        ], {
          left: 100,
          top: 100,
        });
        canvas.add(group);
        canvas.setActiveObject(group);
      }
      canvas.requestRenderAll();
    },
    addImages: (dataUrls: string[]) => handleImagesAdd(dataUrls),
    addWebLink: (url) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const group = new fabric.Group([
        new fabric.Rect({
          width: 200,
          height: 100,
          fill: '#fff',
          stroke: '#10b981',
          strokeWidth: 2,
          rx: 12,
          ry: 12,
        }),
        new fabric.IText('🌐 Web Link', {
          fontSize: 14,
          left: 20,
          top: 20,
          fill: '#059669',
          fontWeight: 'bold',
        }),
        new fabric.IText(url.substring(0, 30) + (url.length > 30 ? '...' : ''), {
          fontSize: 10,
          left: 20,
          top: 50,
          fill: '#666',
        }),
        new fabric.IText('Click to open', {
          fontSize: 10,
          left: 20,
          top: 70,
          fill: '#3b82f6',
          underline: true,
        })
      ], {
        left: 100,
        top: 100,
      });
      (group as any).isWebLink = true;
      (group as any).url = url;
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
    },
    addShape: (type) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const commonProps = {
        left: 150,
        top: 150,
        fill: 'transparent',
        stroke: color,
        strokeWidth: brushSize,
        cornerColor: '#3b82f6',
        cornerSize: 10,
        transparentCorners: false,
      };

      let shape;
      switch (type) {
        case 'rect':
          shape = new fabric.Rect({ ...commonProps, width: 100, height: 100 });
          break;
        case 'circle':
          shape = new fabric.Circle({ ...commonProps, radius: 50 });
          break;
        case 'ellipse':
          shape = new fabric.Ellipse({ ...commonProps, rx: 80, ry: 40 });
          break;
        case 'triangle':
          shape = new fabric.Triangle({ ...commonProps, width: 100, height: 100 });
          break;
        case 'polygon':
          const points = [
            { x: 50, y: 0 }, { x: 100, y: 40 }, { x: 80, y: 100 }, 
            { x: 20, y: 100 }, { x: 0, y: 40 }
          ];
          shape = new fabric.Polygon(points, { ...commonProps });
          break;
      }

      if (shape) {
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.requestRenderAll();
      }
    },
    addText: () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const text = new fabric.IText('내용을 입력하세요', {
        left: 100,
        top: 100,
        fontFamily: 'Arial',
        fontSize: 24,
        fill: color,
        cornerColor: '#3b82f6',
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
    },
    clear: () => {
      const canvas = fabricRef.current;
      if (canvas) {
        saveHistory();
        canvas.getObjects().slice().forEach(obj => canvas.remove(obj));
        
        // Reset zoom and pan
        canvas.setZoom(1);
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] = 0;
          vpt[5] = 0;
        }
        
        canvas.requestRenderAll();
        onCanvasChange?.(canvas);
        onZoomChange?.(1);
      }
    },
    copy: handleCopy,
    paste: handlePaste,
    cut: handleCut,
    deleteSelected: handleDeleteSelected,
    group: handleGroup,
    ungroup: handleUngroup,
  }));

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: '#ffffff',
      allowTouchScrolling: false,
      stopContextMenu: true,
      enablePointerEvents: false, // Disable to treat Pencil like a finger (Touch Events)
      renderOnAddRemove: false,
      skipTargetFind: true,
      fireMiddleClick: false,
      fireRightClick: false,
      imageSmoothingEnabled: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      stateful: false,
      selection: false,
      containerClass: 'whiteboard-canvas-container',
    });

    // Force hardware acceleration and optimize touch action
    try {
      if (containerRef.current) {
        containerRef.current.style.touchAction = 'none';
        containerRef.current.style.userSelect = 'none';
        containerRef.current.style.webkitUserSelect = 'none';
        
        // Apply to all canvas children
        const canvases = containerRef.current.querySelectorAll('canvas');
        canvases.forEach(c => {
          c.style.touchAction = 'none';
        });
      }
    } catch (e) {
      console.warn("Could not set touch action styles", e);
    }

    fabricRef.current = canvas;
    // Enable object caching for better performance with many objects
    fabric.Object.prototype.objectCaching = true;

    canvas.on('mouse:down', () => { 
      isDrawingRef.current = true;
      if (onDrawingStateChange) onDrawingStateChange(true);
    });
    canvas.on('mouse:up', () => { 
      isDrawingRef.current = false;
      if (onDrawingStateChange) onDrawingStateChange(false);
      // Trigger updates after drawing ends
      saveHistory();
      notifyCanvasChange();
    });

    // Initial state save
    const initialJson = canvas.toObject(['id', 'isVideo', 'videoElement', 'isAudio', 'audioUrl', 'isWebLink', 'url']);
    setUndoStack([initialJson]);

    // History Listeners
    canvas.on('object:added', (e) => {
      if (!(e.target as any).id) {
        (e.target as any).id = Math.random().toString(36).substr(2, 9);
      }
      // For paths, we rely on path:created to avoid double saving
      if (e.target?.type !== 'path') {
        saveHistory();
        notifyCanvasChange();
      }
    });
    canvas.on('object:modified', () => {
      saveHistory();
      notifyCanvasChange();
    });
    canvas.on('object:removed', () => {
      if (isRestoringRef.current) return;
      saveHistory();
      notifyCanvasChange();
    });
    
    const updateSelectionState = () => {
      const activeObject = canvas.getActiveObject();
      setHasSelection(!!activeObject);
      setCanGroup(activeObject?.type === 'activeSelection');
      setIsGroupSelected(activeObject?.type === 'group');
    };

    canvas.on('selection:created', (e) => {
      updateSelectionState();
      const target = e.selected?.[0];
      if (target) {
        if ((target as any).isVideo) {
          onSelectionChange?.({ type: 'video', element: (target as any).videoElement });
        } else if ((target as any).isAudio) {
          onSelectionChange?.({ type: 'audio', url: (target as any).audioUrl });
        } else if ((target as any).isWebLink) {
          onSelectionChange?.({ type: 'weblink', url: (target as any).url });
        } else {
          onSelectionChange?.({ type: 'none' });
        }
      }
    });

    canvas.on('selection:updated', (e) => {
      updateSelectionState();
      const target = e.selected?.[0];
      if (target) {
        if ((target as any).isVideo) {
          onSelectionChange?.({ type: 'video', element: (target as any).videoElement });
        } else if ((target as any).isAudio) {
          onSelectionChange?.({ type: 'audio', url: (target as any).audioUrl });
        } else if ((target as any).isWebLink) {
          onSelectionChange?.({ type: 'weblink', url: (target as any).url });
        } else {
          onSelectionChange?.({ type: 'none' });
        }
      }
    });

    canvas.on('selection:cleared', () => {
      updateSelectionState();
      onSelectionChange?.({ type: 'none' });
    });

    // Handle Zoom
    canvas.on('mouse:wheel', (opt) => {
      try {
        const e = opt.e as WheelEvent;
        if (!e) return;
        
        const delta = e.deltaY || (e as any).wheelDelta || 0;
        if (typeof delta !== 'number' || isNaN(delta) || delta === 0) return;
        
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        
        if ((opt as any).viewportPoint) {
          canvas.zoomToPoint((opt as any).viewportPoint, zoom);
        } else if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          canvas.zoomToPoint(new fabric.Point(x, y), zoom);
        }
        
        canvas.requestRenderAll();
        
        onZoomChange?.(zoom);
        notifyCanvasChange();
        
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      } catch (err) {
        console.error("Zoom error:", err);
      }
    });

    // Handle Panning (Space + Drag)
    const panningState = {
      isPanning: false,
      isDragging: false,
      lastPosX: 0,
      lastPosY: 0,
      cursorLastSend: 0,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        panningState.isPanning = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        panningState.isPanning = false;
        panningState.isDragging = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.on('mouse:down', (opt) => {
      if (!opt.e) return;
      const e = opt.e as any;
      if (panningState.isPanning || toolRef.current === 'pan') {
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
        
        panningState.isDragging = true;
        panningState.lastPosX = clientX;
        panningState.lastPosY = clientY;
      }
    });

    canvas.on('mouse:move', (opt) => {
      if (!opt.e) return;
      const e = opt.e as any;
      if (panningState.isDragging && (panningState.isPanning || toolRef.current === 'pan')) {
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
        
        const vpt = canvas.viewportTransform!;
        vpt[4] += clientX - panningState.lastPosX;
        vpt[5] += clientY - panningState.lastPosY;
        canvas.requestRenderAll();
        notifyCanvasChange();
        panningState.lastPosX = clientX;
        panningState.lastPosY = clientY;
      }

      // Multiplayer Live Cursors logic
      const mp = multiplayerRef.current;
      if (mp && mp.status === 'connected' && mp.myPeerId) {
        if (!panningState.cursorLastSend) panningState.cursorLastSend = 0;
        const now = Date.now();
        if (now - panningState.cursorLastSend > 50) {
          panningState.cursorLastSend = now;
          const pos = canvas.getScenePoint(e);
          mp.broadcast({
            type: 'cursor',
            payload: {
              id: mp.myPeerId,
              name: '사용자',
              x: pos.x,
              y: pos.y,
              color: '#3b82f6'
            }
          });
        }
      }
    });

    canvas.on('mouse:up', () => {
      panningState.isDragging = false;
    });

    // Multi-touch Zoom and Pan
    let touchState = {
      isMultiTouch: false,
      initialDistance: 0,
      initialZoom: 1,
      lastMidpointX: 0,
      lastMidpointY: 0,
    };

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getMidpoint = (touches: TouchList) => {
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    };

    const handleTouchStart = (e: TouchEvent) => {
      try {
        if (e.touches.length === 2) {
          if (e.cancelable) e.preventDefault(); // Prevent default browser zoom/scroll
          touchState.isMultiTouch = true;
          touchState.initialDistance = getDistance(e.touches);
          touchState.initialZoom = canvas.getZoom();
          const midpoint = getMidpoint(e.touches);
          touchState.lastMidpointX = midpoint.x;
          touchState.lastMidpointY = midpoint.y;
          
          // Disable drawing/selection temporarily during multi-touch
          canvas.isDrawingMode = false;
          canvas.selection = false;
        }
      } catch (err) {
        console.error("Touch start error:", err);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      try {
        if (e.touches.length === 2 && touchState.isMultiTouch) {
          if (e.cancelable) e.preventDefault();
          
          const currentDistance = getDistance(e.touches);
          const midpoint = getMidpoint(e.touches);
          
          // Calculate Zoom
          const scale = currentDistance / touchState.initialDistance;
          let newZoom = touchState.initialZoom * scale;
          if (newZoom > 20) newZoom = 20;
          if (newZoom < 0.01) newZoom = 0.01;

          // Calculate Pan
          const dx = midpoint.x - touchState.lastMidpointX;
          const dy = midpoint.y - touchState.lastMidpointY;

          // Apply Pan
          const vpt = canvas.viewportTransform!;
          vpt[4] += dx;
          vpt[5] += dy;

          // Apply Zoom at midpoint
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const zoomPoint = new fabric.Point(midpoint.x - rect.left, midpoint.y - rect.top);
            canvas.zoomToPoint(zoomPoint, newZoom);
          }

          canvas.requestRenderAll();
          
          touchState.lastMidpointX = midpoint.x;
          touchState.lastMidpointY = midpoint.y;
          
          onZoomChange?.(newZoom);
          notifyCanvasChange();
        }
      } catch (err) {
        console.error("Touch move error:", err);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      try {
        if (touchState.isMultiTouch && e.touches.length < 2) {
          touchState.isMultiTouch = false;
          
          // Restore drawing/selection mode based on current tool
          const currentTool = toolRef.current;
          canvas.isDrawingMode = currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'pencil' || currentTool === 'fountain' || currentTool === 'ballpoint' || currentTool === 'dashed' || currentTool === 'highlighter' || currentTool === 'cut';
          canvas.selection = currentTool === 'select' || currentTool === 'cut';
        }
      } catch (err) {
        console.error("Touch end error:", err);
      }
    };

    let lastPenInteractionTime = 0;

    const blockPenHover = (e: any) => {
      if (e.pointerType === 'pen') {
        lastPenInteractionTime = Date.now();
        if (e.pressure === 0 || e.buttons === 0) {
          e.stopPropagation();
          e.preventDefault();
        }
      } else if (e.pointerType === 'touch' && Date.now() - lastPenInteractionTime < 1500) {
        // Palm Rejection: Ignore touch pointers for 1.5s after using Apple Pencil
        e.stopPropagation();
      }
    };

    const blockTouchFromFabric = (e: TouchEvent) => {
      let hasStylus = false;
      for (let i = 0; i < e.touches.length; i++) {
        if ((e.touches[i] as any).touchType === 'stylus') {
          hasStylus = true;
          lastPenInteractionTime = Date.now();
        }
      }
      // Palm Rejection: Block single-finger skin touches shortly after Pen usage
      if (e.touches.length === 1 && !hasStylus && Date.now() - lastPenInteractionTime < 1500) {
        e.stopPropagation();
      }
    };

    const touchTarget = containerRef.current;
    if (touchTarget) {
      touchTarget.addEventListener('pointerdown', blockPenHover, { capture: true, passive: false });
      touchTarget.addEventListener('pointermove', blockPenHover, { capture: true, passive: false });
      touchTarget.addEventListener('touchstart', blockTouchFromFabric, { capture: true, passive: false });
      touchTarget.addEventListener('touchmove', blockTouchFromFabric, { capture: true, passive: false });
      
      touchTarget.addEventListener('touchstart', handleTouchStart, { passive: false });
      touchTarget.addEventListener('touchmove', handleTouchMove, { passive: false });
      touchTarget.addEventListener('touchend', handleTouchEnd);
      touchTarget.addEventListener('touchcancel', handleTouchEnd);
    }

    // Handle Resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && fabricRef.current) {
        fabricRef.current.setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        notifyCanvasChange();
      }
    });
    resizeObserver.observe(containerRef.current);

    // Initial Data
    if (initialData) {
      canvas.loadFromJSON(initialData).then(() => {
        canvas.renderAll();
        updateObjectsList();
        notifyCanvasChange();
      });
    } else {
      notifyCanvasChange();
    }

    return () => {
      if (touchTarget) {
        touchTarget.removeEventListener('touchstart', handleTouchStart);
        touchTarget.removeEventListener('touchmove', handleTouchMove);
        touchTarget.removeEventListener('touchend', handleTouchEnd);
        touchTarget.removeEventListener('touchcancel', handleTouchEnd);
      }
      resizeObserver.disconnect();
      canvas.dispose();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Update Tool & Brush
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    let laserPointer: fabric.Circle | null = null;

    const handleLaserDown = (options: any) => {
      if (tool !== 'laser') return;
      
      const pointerPos = canvas.getScenePoint(options.e);

      laserPointer = new fabric.Circle({
        radius: 6,
        fill: 'red',
        left: pointerPos.x,
        top: pointerPos.y,
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
        shadow: new fabric.Shadow({ color: 'red', blur: 12, offsetX: 0, offsetY: 0 })
      });
      
      canvas.add(laserPointer);
      canvas.bringObjectToFront(laserPointer);
      canvas.requestRenderAll();
    };

    const handleLaserMove = (options: any) => {
      if (tool !== 'laser' || !laserPointer) return;
      const pointerPos = canvas.getScenePoint(options.e);
      laserPointer.set({ left: pointerPos.x, top: pointerPos.y });
      canvas.bringObjectToFront(laserPointer);
      canvas.requestRenderAll();
    };

    const handleLaserUp = () => {
      if (tool !== 'laser' || !laserPointer) return;
      canvas.remove(laserPointer);
      laserPointer = null;
      canvas.requestRenderAll();
    };

    const handleBucketFill = (options: any) => {
      if (tool !== 'bucket' || !options.target) return;
      options.target.set('fill', color);
      canvas.requestRenderAll();
    };

    let eraserCircle: fabric.Circle | null = null;
    let isErasing = false;

    const eraseAtPointer = (e: any) => {
      if (!eraserCircle) return;
      const pointerPos = canvas.getScenePoint(e);
      eraserCircle.set({ left: pointerPos.x, top: pointerPos.y });
      eraserCircle.setCoords();

      const objects = canvas.getObjects();
      let removed = false;
      
      objects.forEach(obj => {
         if (obj === eraserCircle) return;
         if (obj.type === 'path' || obj.type === 'i-text' || obj.type === 'text') {
            if (obj.intersectsWithObject(eraserCircle) || obj.containsPoint(pointerPos)) {
               canvas.remove(obj);
               removed = true;
            }
         }
      });
      if (removed) {
         canvas.requestRenderAll();
         notifyCanvasChange(); // Sync the deletion immediately via WebRTC
      }
    };

    const handleEraserDown = (options: any) => {
      if (tool !== 'eraser') return;
      isErasing = true;
      
      if (!eraserCircle) {
         eraserCircle = new fabric.Circle({
            radius: brushSize,
            fill: 'rgba(220, 220, 220, 0.7)',
            selectable: false,
            evented: false,
            originX: 'center',
            originY: 'center',
            stroke: 'rgba(100, 100, 100, 0.8)',
            strokeWidth: 1,
         });
         canvas.add(eraserCircle);
      }
      eraseAtPointer(options.e);
    };

    const handleEraserMove = (options: any) => {
      if (tool !== 'eraser') return;
      const pointerPos = canvas.getScenePoint(options.e);
      
      if (!eraserCircle) {
         eraserCircle = new fabric.Circle({
            radius: brushSize,
            fill: 'rgba(220, 220, 220, 0.7)',
            selectable: false,
            evented: false,
            originX: 'center',
            originY: 'center',
            stroke: 'rgba(100, 100, 100, 0.8)',
            strokeWidth: 1,
         });
         canvas.add(eraserCircle);
      }
      
      eraserCircle.set({ left: pointerPos.x, top: pointerPos.y });
      canvas.bringObjectToFront(eraserCircle);
      canvas.requestRenderAll();

      if (isErasing) {
         eraseAtPointer(options.e);
      }
    };

    const handleEraserUp = () => {
      if (tool !== 'eraser') return;
      isErasing = false;
      saveHistory(); // commit deletion to history
    };

    const handleEyedropper = (options: any) => {
      if (tool !== 'eyedropper') return;
      
      try {
        const el = (canvas as any).elements?.lower?.el || canvas.getElement();
        if (!el) return;
        const ctx = el.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        const rect = el.getBoundingClientRect();
        const x = (options.e.clientX - rect.left) * (el.width / rect.width);
        const y = (options.e.clientY - rect.top) * (el.height / rect.height);
        
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hex = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);
        
        if (onColorPicked) {
          onColorPicked(hex);
        }
      } catch (err) {
        console.error("Eyedropper error:", err);
      }
    };

    if (tool === 'laser') {
      canvas.isDrawingMode = false;
      canvas.on('mouse:down', handleLaserDown);
      canvas.on('mouse:move', handleLaserMove);
      canvas.on('mouse:up', handleLaserUp);
    } else if (tool === 'eraser') {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = 'none';
      canvas.on('mouse:down', handleEraserDown);
      canvas.on('mouse:move', handleEraserMove);
      canvas.on('mouse:up', handleEraserUp);
    } else if (tool === 'bucket') {
      canvas.isDrawingMode = false;
      canvas.on('mouse:down', handleBucketFill);
    } else if (tool === 'eyedropper') {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';
      canvas.on('mouse:down', handleEyedropper);
    } else if (tool === 'pan') {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = 'grab';
    } else if (tool === 'select') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.defaultCursor = 'default';
    } else if (tool === 'cut') {
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.defaultCursor = 'crosshair';
    } else {
      canvas.off('mouse:down', handleLaserDown);
      canvas.off('mouse:move', handleLaserMove);
      canvas.off('mouse:up', handleLaserUp);
      canvas.off('mouse:down', handleEraserDown);
      canvas.off('mouse:move', handleEraserMove);
      canvas.off('mouse:up', handleEraserUp);
      canvas.off('mouse:down', handleBucketFill);
      canvas.off('mouse:down', handleEyedropper);
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';
    }

    // Update all objects' selectability based on current tool
    const isSelectionTool = tool === 'select' || tool === 'cut';
    canvas.forEachObject(obj => {
      obj.selectable = isSelectionTool;
      obj.evented = isSelectionTool;
    });

    canvas.isDrawingMode = tool === 'pen' || tool === 'pencil' || tool === 'fountain' || tool === 'ballpoint' || tool === 'dashed' || tool === 'highlighter' || tool === 'cut';
    
    if (canvas.isDrawingMode) {
      const currentBrush = canvas.freeDrawingBrush;
      // Check if we need to create a new brush or if we can just update the current one
      let needsNewBrush = !(currentBrush instanceof fabric.PencilBrush);
      let brush = needsNewBrush ? new fabric.PencilBrush(canvas) : (currentBrush as fabric.PencilBrush);
        
        let targetWidth = brushSize;
        let targetColor = color;
        let targetShadow = null;
        let targetLineCap: CanvasLineCap = 'round';
        let targetLineJoin: CanvasLineJoin = 'round';

        switch (tool) {
          case 'pencil':
            targetWidth = 2;
            targetColor = color.startsWith('#') ? `${color}b3` : color;
            targetShadow = null; // Remove expensive shadows
            break;
          case 'fountain':
            targetWidth = brushSize * 2.5;
            targetLineCap = 'square';
            targetLineJoin = 'miter';
            break;
          case 'ballpoint':
            targetWidth = brushSize;
            break;
          case 'dashed':
            targetWidth = brushSize;
            break;
          case 'highlighter':
            targetWidth = brushSize * 4;
            targetColor = color.startsWith('#') ? `${color}4D` : color;
            targetLineCap = 'square';
            break;
          case 'cut':
            targetWidth = 2;
            targetColor = '#3b82f6';
            break;
          default:
            targetWidth = brushSize;
            break;
        }

      if (needsNewBrush || brush.color !== targetColor || brush.width !== targetWidth || brush.strokeLineCap !== targetLineCap) {
        brush.color = targetColor;
        brush.width = targetWidth;
        brush.shadow = targetShadow;
        brush.strokeLineCap = targetLineCap;
        brush.strokeLineJoin = targetLineJoin;
        brush.decimate = 1.2; // Balanced for 120Hz iPad input
        canvas.freeDrawingBrush = brush;
      }
    }

    // Update skipTargetFind based on tool
    canvas.skipTargetFind = canvas.isDrawingMode;

    // Update active object color if color changes
    const activeObject = canvas.getActiveObject();
    if (activeObject && tool === 'select') {
      if (activeObject.type === 'i-text' || activeObject.type === 'text') {
        activeObject.set('fill', color);
      } else {
        activeObject.set('stroke', color);
      }
      canvas.requestRenderAll();
    }

      // Consolidated path:created listener
    const handlePathCreated = (e: any) => {
      if (!(e.path as any).id) {
        (e.path as any).id = Math.random().toString(36).substr(2, 9);
      }
      
      // Lasso / Cut tool logic
      if (tool === 'cut') {
        const path = e.path;
        const canvas = fabricRef.current;
        if (canvas) {
          const objects = canvas.getObjects().filter(obj => {
            if (obj === path) return false;
            // Check if object center is within the lasso path
            return path.containsPoint(obj.getCenterPoint());
          });

          if (objects.length > 0) {
            canvas.discardActiveObject();
            const sel = new fabric.ActiveSelection(objects, { canvas });
            canvas.setActiveObject(sel);
          }
          canvas.remove(path);
          canvas.requestRenderAll();
        }
        return;
      }

      // Apply tool-specific properties
      if (tool === 'dashed') {
        e.path.set({ strokeDashArray: [10, 5] });
      } else if (tool === 'highlighter') {
        e.path.set({ globalCompositeOperation: 'multiply', opacity: 0.8 });
      }
      
      // Performance optimizations for the new path
      e.path.set({ 
        objectCaching: true,
        selectable: true,
        evented: true,
        strokeUniform: true,
      });
      
      // Use requestAnimationFrame for non-critical updates
      requestAnimationFrame(() => {
        if (!fabricRef.current) return;
        fabricRef.current.requestRenderAll();
        saveHistory();
        notifyCanvasChange();
      });
    };

    canvas.on('path:created', handlePathCreated);

    return () => {
      if (laserPointer) canvas.remove(laserPointer);
      if (eraserCircle) canvas.remove(eraserCircle);
      canvas.off('mouse:down', handleLaserDown);
      canvas.off('mouse:move', handleLaserMove);
      canvas.off('mouse:up', handleLaserUp);
      canvas.off('mouse:down', handleEraserDown);
      canvas.off('mouse:move', handleEraserMove);
      canvas.off('mouse:up', handleEraserUp);
      canvas.off('mouse:down', handleBucketFill);
      canvas.off('mouse:down', handleEyedropper);
      canvas.off('path:created', handlePathCreated);
    };
  }, [tool, color, brushSize, onColorPicked]);

  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    if (canvasBackground === 'dark') {
      canvas.backgroundColor = '#1a202c';
    } else {
      canvas.backgroundColor = 'transparent';
    }
    canvas.requestRenderAll();
  }, [canvasBackground]);

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "w-full h-full overflow-hidden relative transition-colors duration-300 touch-none",
        canvasBackground === 'dark' ? "bg-[#1a202c]" : "bg-white"
      )}
      style={{
        backgroundImage: 
          canvasBackground === 'grid' 
            ? 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)'
            : canvasBackground === 'dot'
            ? 'radial-gradient(circle, #d1d5db 1.5px, transparent 1.5px)'
            : 'none',
        backgroundSize: 
          canvasBackground === 'grid' ? '40px 40px' : 
          canvasBackground === 'dot' ? '24px 24px' : 'auto'
      }}
    >
      <canvas ref={canvasRef} />
      
      {/* Live Cursors Overlay */}
      {multiplayer && multiplayer.cursors && Object.values(multiplayer.cursors).map((cursor: any) => {
        const vpt = fabricRef.current?.viewportTransform || [1, 0, 0, 1, 0, 0];
        const domX = cursor.x * vpt[0] + vpt[4];
        const domY = cursor.y * vpt[3] + vpt[5];
        return (
          <div 
            key={cursor.id}
            className="absolute z-[100] pointer-events-none transition-all duration-75 ease-linear"
            style={{ transform: `translate(${domX}px, ${domY}px)` }}
          >
            <svg className="w-5 h-5 drop-shadow-md" style={{ color: cursor.color }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.85a.5.5 0 00-.85.35z"/>
            </svg>
            <div 
              className="absolute top-5 left-5 text-white text-[10px] px-1.5 py-0.5 rounded-sm whitespace-nowrap shadow-sm font-medium"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </div>
          </div>
        );
      })}
      
      {/* Floating Action Bar for Selected Objects */}
      {hasSelection && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white p-2 rounded-2xl shadow-lg border border-gray-100">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
            title="Copy (Ctrl+C)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button
            onClick={handlePaste}
            className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
            title="Paste (Ctrl+V)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          </button>
          
          {(canGroup || isGroupSelected) && (
            <>
              <div className="w-px h-6 bg-gray-200 mx-1"></div>
              {canGroup && (
                <button
                  onClick={handleGroup}
                  className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
                  title="Group (Ctrl+G)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M10 6.5h4"/><path d="M10 17.5h4"/><path d="M6.5 10v4"/><path d="M17.5 10v4"/></svg>
                </button>
              )}
              {isGroupSelected && (
                <button
                  onClick={handleUngroup}
                  className="flex items-center justify-center w-10 h-10 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
                  title="Ungroup (Ctrl+Shift+G)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M10 6.5h4" strokeDasharray="2 2"/><path d="M10 17.5h4" strokeDasharray="2 2"/><path d="M6.5 10v4" strokeDasharray="2 2"/><path d="M17.5 10v4" strokeDasharray="2 2"/></svg>
                </button>
              )}
            </>
          )}

          <div className="w-px h-6 bg-gray-200 mx-1"></div>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center justify-center w-10 h-10 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
            title="Delete (Del)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}));
