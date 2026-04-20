import React, { useState, useCallback, useRef, useEffect, useTransition } from 'react';
import { Whiteboard, WhiteboardHandle } from './components/Canvas/Whiteboard';
import { Toolbar } from './components/UI/Toolbar';
import { MediaController } from './components/UI/MediaController';
import { LayerPanel } from './components/UI/LayerPanel';
import { TopNavBar } from './components/UI/TopNavBar';
import { BottomNavBar } from './components/UI/BottomNavBar';
import { SettingsModal } from './components/UI/SettingsModal';
import { Navigator } from './components/UI/Navigator';
import { SlideNavigator } from './components/UI/SlideNavigator';
import { FloatingCamera } from './components/UI/FloatingCamera';
import { PdfImportModal } from './components/UI/PdfImportModal';
import { HomeScreen } from './components/UI/HomeScreen';
import { CollaborationModal } from './components/UI/CollaborationModal';
import { useMultiplayer } from './hooks/useMultiplayer';
import { Hand, Heart, ThumbsUp, MessageSquare, Users, Settings, LayoutTemplate } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import * as fabric from 'fabric';
import { db, auth, signInWithGoogle } from './firebase';
import { collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, query, orderBy, writeBatch, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface Scene {
  id: string;
  name: string;
  data: any;
  thumbnail?: string;
}

import { GoogleGenAI } from "@google/genai";

export default function App() {
  const [isPending, startTransition] = useTransition();
  const whiteboardRef = useRef<WhiteboardHandle>(null);
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'laser' | 'select' | 'cut' | 'circle' | 'rect' | 'pencil' | 'fountain' | 'ballpoint' | 'dashed' | 'bucket' | 'highlighter' | 'pan' | 'eyedropper'>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([
    { id: '1', name: 'Introduction', data: null },
  ]);
  const [activeSceneId, setActiveSceneId] = useState('1');
  const [view, setView] = useState<'home' | 'editor'>('editor');
  const [isVertical, setIsVertical] = useState(true);
  const [mediaSelection, setMediaSelection] = useState<{ type: 'video' | 'audio' | 'weblink' | 'none', element?: any, url?: string }>({ type: 'none' });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [objects, setObjects] = useState<any[]>([]);
  const [mainCanvas, setMainCanvas] = useState<fabric.Canvas | null>(null);
  const [isNavigatorPinned, setIsNavigatorPinned] = useState(false);
  const [isSlideNavigatorOpen, setIsSlideNavigatorOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const isDrawingRef = useRef(false);
  const lastDrawingEndTimeRef = useRef<number>(0);
  const zenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const multiplayer = useMultiplayer('Guest', '#3b82f6');
  const [isCollaborationModalOpen, setIsCollaborationModalOpen] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [canvasBackground, setCanvasBackground] = useState<'blank' | 'grid' | 'dot' | 'dark'>('blank');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [recordSystemAudio, setRecordSystemAudio] = useState(false);

  // Firebase State
  const [user, setUser] = useState<any>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const isUpdatingFromFirebase = useRef(false);

  // PDF Import State
  const [isPdfImportModalOpen, setIsPdfImportModalOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);

  useEffect(() => {
    multiplayer.onReceiveData((data) => {
      if (data.type === 'state') {
         if (isDrawingRef.current || (Date.now() - lastDrawingEndTimeRef.current < 1000)) return;
         if (whiteboardRef.current && typeof data.payload === 'string') {
            whiteboardRef.current.loadFromJSON(data.payload);
         }
      }
      if (data.type === 'sync_request' && multiplayer.isHost) {
         const currentData = whiteboardRef.current?.toJSON();
         if (currentData) {
           multiplayer.broadcast({ type: 'state', payload: currentData });
         }
      }
    });
  }, [multiplayer]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bId = params.get('boardId');
    if (bId) {
      setBoardId(bId);
      setIsCollaborating(true);
    }
  }, []);

  useEffect(() => {
    if (!boardId || !isCollaborating) return;

    const scenesRef = collection(db, 'boards', boardId, 'scenes');
    const q = query(scenesRef, orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // CRITICAL: Suspend Firebase updates while user is drawing to prevent re-renders
      if (isDrawingRef.current) return;
      
      if (isUpdatingFromFirebase.current) return;
      
      const loadedScenes: Scene[] = [];
      let hasChanges = false;
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const existingScene = scenes.find(s => s.id === doc.id);
        
        // Only consider it a change if the data is different and not from us
        // Or if it's a new scene
        if (!existingScene || (data.updatedBy !== auth.currentUser?.uid)) {
          hasChanges = true;
        }

        loadedScenes.push({
          id: doc.id,
          name: data.name,
          data: data.data ? JSON.parse(data.data) : null,
        });
      });

      if (hasChanges && loadedScenes.length > 0) {
        isUpdatingFromFirebase.current = true;
        setScenes(loadedScenes);
        
        if (!loadedScenes.find(s => s.id === activeSceneId)) {
          setActiveSceneId(loadedScenes[0].id);
        }
        
        setTimeout(() => {
          isUpdatingFromFirebase.current = false;
        }, 1000);
      }
    });

    return () => unsubscribe();
  }, [boardId, isCollaborating]);

  const syncSceneToFirebase = useCallback(async (sceneId: string, data: any) => {
    if (!boardId || !isCollaborating || !user || isUpdatingFromFirebase.current) return;
    
    try {
      isUpdatingFromFirebase.current = true;
      const sceneRef = doc(db, 'boards', boardId, 'scenes', sceneId);
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) {
        isUpdatingFromFirebase.current = false;
        return;
      }
      
      await setDoc(sceneRef, {
        name: scene.name,
        data: data ? JSON.stringify(data) : "",
        order: scenes.findIndex(s => s.id === sceneId),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      
      setTimeout(() => {
        isUpdatingFromFirebase.current = false;
      }, 1000);
    } catch (error) {
      console.error("Error syncing scene:", error);
      isUpdatingFromFirebase.current = false;
    }
  }, [boardId, isCollaborating, user, scenes]);

  const handleShare = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        toast.error("Failed to sign in");
        return;
      }
    }

    if (!boardId) {
      try {
        toast.loading("Creating collaborative board...");
        const newBoardRef = doc(collection(db, 'boards'));
        const newBoardId = newBoardRef.id;
        
        await setDoc(newBoardRef, {
          name: "Shared Whiteboard",
          ownerId: auth.currentUser?.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const batch = writeBatch(db);
        scenes.forEach((scene, index) => {
          const sceneRef = doc(db, 'boards', newBoardId, 'scenes', scene.id);
          batch.set(sceneRef, {
            name: scene.name,
            data: scene.data ? JSON.stringify(scene.data) : "",
            order: index,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid
          });
        });
        await batch.commit();

        setBoardId(newBoardId);
        setIsCollaborating(true);
        
        const url = new URL(window.location.href);
        url.searchParams.set('boardId', newBoardId);
        window.history.pushState({}, '', url);
        
        toast.dismiss();
        toast.success("Board created! URL copied to clipboard.");
        navigator.clipboard.writeText(url.toString());
      } catch (error) {
        console.error(error);
        toast.dismiss();
        toast.error("Failed to create board");
      }
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('boardId', boardId);
      navigator.clipboard.writeText(url.toString());
      toast.success("Link copied to clipboard!");
    }
  };

  const saveCurrentScene = useCallback(() => {
    if (whiteboardRef.current) {
      const currentData = whiteboardRef.current.toJSON();
      const canvas = whiteboardRef.current.getCanvas();
      const thumbnail = canvas ? canvas.toDataURL({ multiplier: 0.1 }) : undefined;
      
      setScenes(prev => prev.map(s => s.id === activeSceneId ? { ...s, data: currentData, thumbnail } : s));
      
      if (isCollaborating && boardId) {
        syncSceneToFirebase(activeSceneId, currentData);
      }
    }
  }, [activeSceneId, isCollaborating, boardId, syncSceneToFirebase]);

  const addScene = async () => {
    saveCurrentScene();
    const newId = Math.random().toString(36).substr(2, 9);
    const newScene = { id: newId, name: `Scene ${scenes.length + 1}`, data: null };
    setScenes(prev => [...prev, newScene]);
    setActiveSceneId(newId);

    if (isCollaborating && boardId && user) {
      try {
        await setDoc(doc(db, 'boards', boardId, 'scenes', newId), {
          name: newScene.name,
          data: "",
          order: scenes.length,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        });
      } catch (error) {
        console.error("Error creating scene in Firebase", error);
      }
    }
  };

  const handleSelectSlide = (id: string) => {
    saveCurrentScene();
    setActiveSceneId(id);
    setIsSlideNavigatorOpen(false);
  };

  const removeScene = async (id: string) => {
    if (scenes.length > 1) {
      const newScenes = scenes.filter(s => s.id !== id);
      setScenes(newScenes);
      if (activeSceneId === id) {
        setActiveSceneId(newScenes[0].id);
      }

      if (isCollaborating && boardId) {
        try {
          await deleteDoc(doc(db, 'boards', boardId, 'scenes', id));
        } catch (error) {
          console.error("Error deleting scene from Firebase", error);
        }
      }
    }
  };

  const handleClear = useCallback(() => {
    whiteboardRef.current?.clear();
  }, []);

  const handleZoomIn = useCallback(() => whiteboardRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => whiteboardRef.current?.zoomOut(), []);
  const handleResetZoom = useCallback(() => whiteboardRef.current?.resetZoom(), []);

  const processPdf = async (mode: 'single' | 'multiple') => {
    if (!pendingPdfFile) return;
    setIsPdfImportModalOpen(false);
    
    try {
      toast.loading("Processing PDF...");
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      
      const arrayBuffer = await pendingPdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      
      const pageImages: string[] = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;
        await page.render({ canvasContext: ctx!, viewport }).promise;
        pageImages.push(tempCanvas.toDataURL('image/png'));
      }
      
      toast.dismiss();
      
      if (mode === 'single') {
        whiteboardRef.current?.addImages(pageImages);
        toast.success(`Added ${numPages} pages to current slide`);
      } else {
        const newScenes = [...scenes];
        const startIndex = scenes.findIndex(s => s.id === activeSceneId);
        
        const mainCanvas = whiteboardRef.current?.getCanvas();
        const canvasWidth = mainCanvas?.width || window.innerWidth;
        const canvasHeight = mainCanvas?.height || window.innerHeight;
        
        const generatedScenes = await Promise.all(pageImages.map(async (img, i) => {
          return new Promise<Scene>((resolve) => {
            fabric.FabricImage.fromURL(img).then((fabricImg) => {
              const safeWidth = canvasWidth - 100;
              const safeHeight = canvasHeight - 240;
              const scale = Math.min(safeWidth / fabricImg.width!, safeHeight / fabricImg.height!);
              fabricImg.scale(scale);
              
              fabricImg.set({
                cornerColor: '#3b82f6',
                cornerSize: 10,
                transparentCorners: false,
              });
              
              const tempCanvas = new fabric.StaticCanvas(null, {
                width: canvasWidth,
                height: canvasHeight
              });
              tempCanvas.add(fabricImg);
              tempCanvas.centerObject(fabricImg);
              
              resolve({
                id: Math.random().toString(36).substr(2, 9),
                name: `Page ${i + 1}`,
                data: tempCanvas.toObject()
              });
            });
          });
        }));
        
        const canvas = whiteboardRef.current?.getCanvas();
        const isEmpty = canvas ? canvas.getObjects().length === 0 : false;
        
        if (isEmpty) {
          newScenes.splice(startIndex, 1, ...generatedScenes);
        } else {
          newScenes.splice(startIndex + 1, 0, ...generatedScenes);
        }
        
        setScenes(newScenes);
        setActiveSceneId(generatedScenes[0].id);
        toast.success(`Created ${generatedScenes.length} new slides`);
      }
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to process PDF");
    } finally {
      setPendingPdfFile(null);
    }
  };

  // Zen Mode Logic
  const lastActivityRef = useRef(Date.now());
  const resetZenTimer = useCallback(() => {
    const now = Date.now();
    // Throttle activity updates to once every 500ms
    if (now - lastActivityRef.current < 500) return;
    lastActivityRef.current = now;

    setIsZenMode(false);
    if (zenTimeoutRef.current) clearTimeout(zenTimeoutRef.current);
    // Zen mode disabled to keep UI fixed
    /*
    zenTimeoutRef.current = setTimeout(() => {
      setIsZenMode(true);
    }, 10000); // 10 seconds of inactivity to trigger zen mode
    */
  }, []);

  useEffect(() => {
    // Zen mode disabled
    setIsZenMode(false);
    if (zenTimeoutRef.current) clearTimeout(zenTimeoutRef.current);
  }, []);

  const handleColorPicked = useCallback((newColor: string) => {
    setColor(newColor);
    setActiveTool('pen');
  }, []);

  const currentSceneIndex = scenes.findIndex(s => s.id === activeSceneId);

  const handleNextSlide = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1) {
      saveCurrentScene();
      setActiveSceneId(scenes[currentSceneIndex + 1].id);
    }
  }, [currentSceneIndex, scenes, saveCurrentScene]);

  const handlePrevSlide = useCallback(() => {
    if (currentSceneIndex > 0) {
      saveCurrentScene();
      setActiveSceneId(scenes[currentSceneIndex - 1].id);
    }
  }, [currentSceneIndex, scenes, saveCurrentScene]);

  const handleCanvasBackgroundChange = useCallback((bg: 'blank' | 'grid' | 'dot' | 'dark') => {
    setCanvasBackground(bg);
    if (bg === 'dark' && color === '#000000') {
      setColor('#ffffff');
    } else if (bg !== 'dark' && color === '#ffffff') {
      setColor('#000000');
    }
  }, [color]);

  const handleGenerate = async (query: string) => {
    if (!query.trim()) return;
    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a detailed description or SVG-like data for: ${query}. If it's a diagram, describe it in text. If it's an image, provide a detailed prompt for DALL-E or similar. For now, just return a high-quality educational explanation or a placeholder URL for an image.`,
      });

      const text = response.text;
      if (text) {
        whiteboardRef.current?.addResource('text', text);
      }
    } catch (err) {
      console.error("Gemini generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveProject = () => {
    if (!whiteboardRef.current) return;
    const json = whiteboardRef.current.toJSON();
    const projectId = `lecture_board_${Date.now()}`;
    localStorage.setItem('current_project', json);
    toast.success('Project Saved Successfully', {
      description: 'Your canvas state has been saved to local storage.',
    });
  };

  const handleLoadProject = () => {
    const savedJson = localStorage.getItem('current_project');
    if (savedJson && whiteboardRef.current) {
      whiteboardRef.current.loadFromJSON(savedJson);
      toast.success('Project Loaded', {
        description: 'Your previous canvas state has been restored.',
      });
    } else {
      toast.error('No Saved Project Found', {
        description: 'There is no project saved in local storage.',
      });
    }
  };

  const handleExportPDF = () => {
    if (!whiteboardRef.current) return;
    toast.promise(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          whiteboardRef.current?.exportToPDF();
          resolve();
        }, 500);
      }),
      {
        loading: 'Generating PDF...',
        success: 'PDF Exported Successfully',
        error: 'Failed to export PDF',
      }
    );
  };

  // Auto-save every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (whiteboardRef.current) {
        const json = whiteboardRef.current.toJSON();
        localStorage.setItem('current_project', json);
        toast.success('Auto-saved Project', {
          description: 'Your progress has been automatically saved.',
        });
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const thumbnailTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCanvasChange = useCallback((canvas: fabric.Canvas) => {
    if (isDrawingRef.current) return; // Skip if drawing

    if (thumbnailTimeoutRef.current) clearTimeout(thumbnailTimeoutRef.current);
    
    thumbnailTimeoutRef.current = setTimeout(() => {
      if (isDrawingRef.current) return; // Double check
      
      const runHeavyTasks = () => {
        // CRITICAL: Ensure user is TRULY idle. 
        // Check if drawing is active OR if a stroke just ended very recently.
        const now = Date.now();
        if (isDrawingRef.current || (now - lastDrawingEndTimeRef.current < 1000)) {
          // If user is drawing or just finished a stroke < 1s ago, defer again
          thumbnailTimeoutRef.current = setTimeout(runHeavyTasks, 500);
          return;
        }

        startTransition(() => {
          setMainCanvas(canvas);
          setObjects(canvas.getObjects().map(obj => ({
            id: (obj as any).id || Math.random().toString(36).substr(2, 9),
            type: obj.type,
            visible: obj.visible,
            locked: (obj as any).selectable === false,
            name: (obj as any).name || obj.type
          })));

          const currentData = canvas.toJSON();
          const thumbnail = canvas.toDataURL({ multiplier: 0.1 });
          
          // Update local state
          setScenes(prev => prev.map(s => s.id === activeSceneId ? { ...s, data: currentData, thumbnail } : s));
          
          if (isCollaborating && boardId) {
            syncSceneToFirebase(activeSceneId, currentData);
          }
          
          if (multiplayer.roomId) {
            multiplayer.broadcast({ type: 'state', payload: currentData });
          }
        });
      };

      // Use requestIdleCallback if available, otherwise fallback to setTimeout
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(runHeavyTasks, { timeout: 2000 });
      } else {
        setTimeout(runHeavyTasks, 1);
      }
    }, 1000); // Reduced to 1s of idleness
  }, [activeSceneId, isCollaborating, boardId, syncSceneToFirebase]);

  const handleDrawingStateChange = useCallback((isDrawing: boolean) => {
    isDrawingRef.current = isDrawing;
    if (!isDrawing) {
      lastDrawingEndTimeRef.current = Date.now();
    }
  }, []);

  return (
    <div className={cn(
      "fixed inset-0 overflow-hidden font-sans transition-colors duration-300",
      theme === 'dark' ? "bg-gray-900 text-white dark" : "bg-white text-gray-900"
    )}>
      <Toaster position="top-center" />
      <TopNavBar 
        onSave={handleSaveProject}
        onLoad={handleLoadProject}
        onExportPDF={handleExportPDF}
        onClearAll={handleClear}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleLayout={() => setIsVertical(!isVertical)}
        onGenerate={handleGenerate}
        onShare={handleShare}
        onGoHome={() => setView(view === 'home' ? 'editor' : 'home')}
        onOpenMultiplayer={() => setIsCollaborationModalOpen(true)}
        isGenerating={isGenerating}
        isZenMode={isZenMode}
        view={view}
      />
      
      <CollaborationModal 
        isOpen={isCollaborationModalOpen}
        onClose={() => setIsCollaborationModalOpen(false)}
        multiplayer={multiplayer}
      />
      
      {/* Main Canvas Container */}
      <div className={cn(
        "absolute inset-0 z-0 transition-all duration-300",
        view === 'home' && "blur-sm scale-95 opacity-50 pointer-events-none"
      )}>
        <Whiteboard 
          ref={whiteboardRef}
          tool={activeTool}
          color={color}
          brushSize={brushSize}
          initialData={scenes.find(s => s.id === activeSceneId)?.data}
          onSelectionChange={setMediaSelection}
          onZoomChange={setZoomLevel}
          onColorPicked={handleColorPicked}
          onCanvasChange={handleCanvasChange}
          onDrawingStateChange={handleDrawingStateChange}
          activeSceneId={activeSceneId}
          canvasBackground={canvasBackground}
          isZenMode={isZenMode}
          multiplayer={multiplayer}
        />
      </div>

      {/* Floating UI Elements */}
      {view === 'editor' && (
        <>
          <Toolbar 
            activeTool={activeTool}
            onToolSelect={setActiveTool}
            onAddShape={(shape) => {
              whiteboardRef.current?.addShape(shape);
              setActiveTool('select');
            }}
            onAddText={() => {
              whiteboardRef.current?.addText();
              setActiveTool('select');
            }}
            color={color}
            onColorChange={setColor}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            onClear={handleClear}
            isVertical={isVertical}
            onAddFile={(file) => {
              if (file.type === 'application/pdf') {
                setPendingPdfFile(file);
                setIsPdfImportModalOpen(true);
              } else {
                whiteboardRef.current?.addFile(file);
              }
              setActiveTool('select');
            }}
            onAddWebLink={(url) => {
              whiteboardRef.current?.addWebLink(url);
              setActiveTool('select');
            }}
            onUndo={() => whiteboardRef.current?.undo()}
            onRedo={() => whiteboardRef.current?.redo()}
            zoomLevel={zoomLevel}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            isZenMode={isZenMode}
            onCopy={() => whiteboardRef.current?.copy()}
            onPaste={() => whiteboardRef.current?.paste()}
            onCut={() => whiteboardRef.current?.cut()}
          />

          <LayerPanel 
            objects={objects}
            onToggleVisibility={(id) => whiteboardRef.current?.toggleVisibility(id)}
            onToggleLock={(id) => whiteboardRef.current?.toggleLock(id)}
            onSelectObject={(id) => whiteboardRef.current?.selectObject(id)}
            onBringToFront={() => whiteboardRef.current?.bringToFront()}
            onSendToBack={() => whiteboardRef.current?.sendToBack()}
            onBringForward={() => whiteboardRef.current?.bringForward()}
            onSendBackward={() => whiteboardRef.current?.sendBackward()}
            isVertical={isVertical}
            isZenMode={isZenMode}
          />

          <MediaController 
            selection={mediaSelection}
            onClose={() => setMediaSelection({ type: 'none' })}
          />

          <BottomNavBar 
            onZoomToggle={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}
            isZoomActive={activeTool === 'pan'}
            zoomLevel={zoomLevel}
            onResetZoom={handleResetZoom}
            currentSlide={currentSceneIndex + 1}
            totalSlides={scenes.length}
            onNextSlide={handleNextSlide}
            onPrevSlide={handlePrevSlide}
            onAddSlide={addScene}
            onOpenSlideNavigator={() => setIsSlideNavigatorOpen(true)}
            isNavigatorPinned={isNavigatorPinned}
            onToggleNavigatorPin={() => setIsNavigatorPinned(!isNavigatorPinned)}
            isCameraOpen={isCameraOpen}
            onToggleCamera={() => setIsCameraOpen(!isCameraOpen)}
            isZenMode={isZenMode}
            isVertical={isVertical}
          />
        </>
      )}

      <AnimatePresence>
        {isCameraOpen && (
          <FloatingCamera onClose={() => setIsCameraOpen(false)} />
        )}
      </AnimatePresence>

      <Navigator 
        mainCanvas={mainCanvas} 
        isPinned={isNavigatorPinned} 
        onTogglePin={() => setIsNavigatorPinned(!isNavigatorPinned)} 
        isZoomActive={activeTool === 'pan'}
        isZenMode={isZenMode}
      />

      <SlideNavigator 
        isOpen={isSlideNavigatorOpen}
        onClose={() => setIsSlideNavigatorOpen(false)}
        slides={scenes}
        activeSlideId={activeSceneId}
        onSelectSlide={handleSelectSlide}
        onAddSlide={addScene}
        onRemoveSlide={removeScene}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        canvasBackground={canvasBackground}
        onCanvasBackgroundChange={handleCanvasBackgroundChange}
        isVertical={isVertical}
        onToggleOrientation={() => setIsVertical(!isVertical)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        recordSystemAudio={recordSystemAudio}
        onToggleRecordSystemAudio={() => setRecordSystemAudio(!recordSystemAudio)}
      />

      <PdfImportModal 
        isOpen={isPdfImportModalOpen}
        onClose={() => {
          setIsPdfImportModalOpen(false);
          setPendingPdfFile(null);
        }}
        onImport={processPdf}
        fileName={pendingPdfFile?.name}
      />

      <AnimatePresence>
        {view === 'home' && (
          <HomeScreen 
            projects={scenes}
            activeProjectId={activeSceneId}
            onSelectProject={(id) => {
              setActiveSceneId(id);
              setView('editor');
            }}
            onCreateProject={addScene}
            onClose={() => setView('editor')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
