import React, { useState, useCallback, useRef, useEffect } from 'react';
import type * as fabric from 'fabric';
import { Whiteboard, WhiteboardHandle, ToolType, CanvasBackground, MediaSelection, CanvasChangeInfo } from './components/Canvas/Whiteboard';
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
import { CollaborationModal } from './components/UI/CollaborationModal';
import { ConfirmDialog, ConfirmState } from './components/UI/ConfirmDialog';
import { PresentationBar } from './components/Present/PresentationBar';
import { ShadeOverlay, SpotlightOverlay, TimerWidget, createOverlayState, drawOverlaysOnto } from './components/Present/FocusTools';
import { RecordStartDialog, RecordingStatus, RecordingResultDialog } from './components/Record/RecorderUI';
import { LessonRecorder, RecordingResult, isRecordingSupported } from './lib/lessonRecorder';
import { useMultiplayer, SyncData, CursorData } from './hooks/useMultiplayer';
import { AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { db, auth, signInWithGoogle } from './firebase';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { newId, normalizeSceneData, renderSceneImage, createImageScene } from './lib/canvasData';
import { saveProject, loadProject, isValidProject, downloadProjectFile, StoredProject } from './lib/projectStore';

interface Scene {
  id: string;
  name: string;
  data: string | null;
  thumbnail?: string;
  order: number;
}

const FIRESTORE_SCENE_LIMIT = 900_000;
const AUTOSAVE_MS = 30_000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

export default function App() {
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  // ---------- 도구 ----------
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isVertical, setIsVertical] = useState(true);
  const [canvasBackground, setCanvasBackground] = useState<CanvasBackground>('blank');
  const canvasBgRef = useRef(canvasBackground);
  canvasBgRef.current = canvasBackground;

  // ---------- 슬라이드 ----------
  const [projectName, setProjectName] = useState('새 수업');
  const [scenes, setScenesState] = useState<Scene[]>([{ id: 'scene-1', name: '슬라이드 1', data: null, order: 0 }]);
  const scenesRef = useRef(scenes);
  const [activeSceneId, setActiveSceneIdState] = useState('scene-1');
  const activeIdRef = useRef(activeSceneId);
  const [sceneRevision, setSceneRevision] = useState(0);

  // ---------- UI ----------
  const [mediaSelection, setMediaSelection] = useState<MediaSelection>({ type: 'none' });
  const [objects, setObjects] = useState<any[]>([]);
  const [mainCanvas, setMainCanvas] = useState<fabric.Canvas | null>(null);
  const [isNavigatorPinned, setIsNavigatorPinned] = useState(false);
  const [isSlideNavigatorOpen, setIsSlideNavigatorOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCollaborationModalOpen, setIsCollaborationModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // ---------- 발표 모드 · 수업 도구 · 녹화 ----------
  const [isPresenting, setIsPresenting] = useState(false);
  const isPresentingRef = useRef(false);
  isPresentingRef.current = isPresenting;
  const [shadeOn, setShadeOn] = useState(false);
  const [spotlightOn, setSpotlightOn] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const overlayStateRef = useRef(createOverlayState());
  const recorderRef = useRef<LessonRecorder | null>(null);
  const [recState, setRecState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [recStarting, setRecStarting] = useState(false);
  const [recResult, setRecResult] = useState<RecordingResult | null>(null);
  const [isPdfImportModalOpen, setIsPdfImportModalOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // ---------- 그리기 상태 ----------
  const isDrawingRef = useRef(false);
  const lastDrawingEndRef = useRef(0);
  const pendingRemoteRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // ---------- 협업 ----------
  const multiplayer = useMultiplayer();
  const mpRef = useRef(multiplayer);
  mpRef.current = multiplayer;
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const userRef = useRef<User | null>(null);
  const [boardId, setBoardId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('boardId'));
  const boardIdRef = useRef<string | null>(boardId);
  boardIdRef.current = boardId;
  const createdBoardRef = useRef(false);
  const lastSyncedRef = useRef(new Map<string, string>());
  const syncTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const warnedRef = useRef(new Set<string>());

  const warnOnce = (key: string, fn: () => void) => {
    if (warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    fn();
  };

  // =====================================================================
  // 슬라이드 상태 도우미 (항상 최신 값을 ref에서 읽어 오래된 값 참조를 막는다)
  // =====================================================================
  const updateScenes = useCallback((fn: (prev: Scene[]) => Scene[]) => {
    const next = fn(scenesRef.current);
    scenesRef.current = next;
    setScenesState(next);
  }, []);

  const setActiveSceneId = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveSceneIdState(id);
  }, []);

  const bumpRevision = useCallback(() => setSceneRevision(r => r + 1), []);

  // ---------- Firestore 쓰기 ----------
  const writeSceneDoc = useCallback(async (scene: Scene) => {
    const bId = boardIdRef.current;
    const u = userRef.current;
    if (!bId || !u) return;
    const data = scene.data || '';
    if (data.length > FIRESTORE_SCENE_LIMIT) {
      warnOnce(`size-${scene.id}`, () => toast.warning(`'${scene.name}'은(는) 용량이 커서 공유 링크로 전달되지 않습니다.`, {
        description: '사진이나 PDF 페이지 수를 줄이면 공유됩니다. 실시간 협업(방 코드)은 용량 제한이 없습니다.',
        duration: 8000,
      }));
      return;
    }
    try {
      await setDoc(doc(db, 'boards', bId, 'scenes', scene.id), {
        name: scene.name.slice(0, 100) || '슬라이드',
        data,
        order: scene.order,
        updatedAt: serverTimestamp(),
        updatedBy: u.uid,
      });
      lastSyncedRef.current.set(scene.id, data);
    } catch (err) {
      console.error('슬라이드 동기화 실패', err);
      warnOnce('sync-error', () => toast.error('공유 보드에 저장하지 못했습니다.', { description: '인터넷 연결 또는 권한을 확인해 주세요.' }));
    }
  }, []);

  const scheduleFirestoreSync = useCallback((sceneId: string) => {
    if (!boardIdRef.current || !userRef.current) return;
    const timers = syncTimersRef.current;
    const t = timers.get(sceneId);
    if (t) clearTimeout(t);
    timers.set(sceneId, setTimeout(() => {
      timers.delete(sceneId);
      const scene = scenesRef.current.find(s => s.id === sceneId);
      if (scene && lastSyncedRef.current.get(sceneId) !== (scene.data || '')) writeSceneDoc(scene);
    }, 800));
  }, [writeSceneDoc]);

  // ---------- 실시간 협업(PeerJS) 전송 ----------
  const peerConnected = () => mpRef.current.status === 'connected';
  const broadcastScene = useCallback((scene: Scene) => {
    if (!peerConnected()) return;
    mpRef.current.broadcast({ type: 'scene', payload: { sceneId: scene.id, name: scene.name, data: scene.data } });
  }, []);
  const fullPayload = (): SyncData => ({
    type: 'full',
    payload: { scenes: scenesRef.current.map(s => ({ id: s.id, name: s.name, data: s.data })) },
  });
  const broadcastFull = useCallback(() => {
    if (peerConnected()) mpRef.current.broadcast(fullPayload());
  }, []);

  /** 슬라이드 구조가 바뀌었을 때 (추가·삭제·순서·불러오기) 모든 공유 채널에 반영 */
  const publishStructure = useCallback((removedIds: string[] = []) => {
    broadcastFull();
    const bId = boardIdRef.current;
    if (bId && userRef.current) {
      scenesRef.current.forEach(s => writeSceneDoc(s));
      removedIds.forEach(id => deleteDoc(doc(db, 'boards', bId, 'scenes', id)).catch(err => console.error('슬라이드 삭제 동기화 실패', err)));
    }
  }, [broadcastFull, writeSceneDoc]);

  // ---------- 현재 슬라이드 내용 확정 ----------
  const captureCurrent = useCallback(() => {
    const wb = whiteboardRef.current;
    if (!wb) return;
    const data = wb.toJSON();
    if (!data) return;
    const id = activeIdRef.current;
    const prev = scenesRef.current.find(s => s.id === id);
    if (!prev || prev.data === data) return;
    const thumbnail = wb.getThumbnail();
    updateScenes(list => list.map(s => (s.id === id ? { ...s, data, thumbnail } : s)));
    dirtyRef.current = true;
    scheduleFirestoreSync(id);
    const updated = scenesRef.current.find(s => s.id === id);
    if (updated) broadcastScene(updated);
  }, [updateScenes, scheduleFirestoreSync, broadcastScene]);

  const goToScene = useCallback((id: string) => {
    if (id === activeIdRef.current) return;
    if (!scenesRef.current.some(s => s.id === id)) return;
    captureCurrent();
    setActiveSceneId(id);
    setMediaSelection({ type: 'none' });
  }, [captureCurrent, setActiveSceneId]);

  // ---------- 다른 사람의 변경 반영 ----------
  const flushPendingRemote = useCallback(() => {
    if (!pendingRemoteRef.current) return;
    if (isDrawingRef.current || Date.now() - lastDrawingEndRef.current < 800) {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushPendingRemote, 400);
      return;
    }
    pendingRemoteRef.current = false;
    bumpRevision();
  }, [bumpRevision]);

  const applyRemoteScene = useCallback((sceneId: string, data: string | null, name?: string, order?: number) => {
    const existing = scenesRef.current.find(s => s.id === sceneId);
    if (existing && existing.data === data && (!name || existing.name === name)) return;
    if (!existing) {
      const maxOrder = Math.max(-1, ...scenesRef.current.map(s => s.order));
      updateScenes(list => [...list, { id: sceneId, name: name || `슬라이드 ${list.length + 1}`, data, order: order ?? maxOrder + 1 }]
        .sort((a, b) => a.order - b.order));
      return;
    }
    updateScenes(list => list.map(s => (s.id === sceneId ? { ...s, data, name: name || s.name, thumbnail: undefined } : s)));
    if (sceneId === activeIdRef.current) {
      pendingRemoteRef.current = true;
      flushPendingRemote();
    }
  }, [updateScenes, flushPendingRemote]);

  const replaceAllScenes = useCallback((list: Scene[]) => {
    if (list.length === 0) return;
    updateScenes(() => list);
    if (!list.some(s => s.id === activeIdRef.current)) setActiveSceneId(list[0].id);
    else bumpRevision();
  }, [updateScenes, setActiveSceneId, bumpRevision]);

  // =====================================================================
  // 캔버스 변경 수신
  // =====================================================================
  const handleCanvasChange = useCallback((info: CanvasChangeInfo) => {
    const { sceneId, canvas, data, fromLoad } = info;
    setMainCanvas(canvas);
    setObjects(canvas.getObjects().filter(o => !o.excludeFromExport).map(o => ({
      id: (o as any).id,
      type: (o as any).isBackground ? 'background' : (o as any).isVideo ? 'video' : (o as any).isAudio ? 'audio' : (o as any).isWebLink ? 'weblink' : o.type,
      visible: o.visible,
      locked: !!(o as any).locked,
    })));
    if (fromLoad) return;
    if (sceneId !== activeIdRef.current) return;
    const thumbnail = whiteboardRef.current?.getThumbnail();
    updateScenes(list => list.map(s => (s.id === sceneId ? { ...s, data, thumbnail } : s)));
    dirtyRef.current = true;
    scheduleFirestoreSync(sceneId);
    const scene = scenesRef.current.find(s => s.id === sceneId);
    if (scene) broadcastScene(scene);
  }, [updateScenes, scheduleFirestoreSync, broadcastScene]);

  const handleDrawingStateChange = useCallback((drawing: boolean) => {
    isDrawingRef.current = drawing;
    if (!drawing) {
      lastDrawingEndRef.current = Date.now();
      if (pendingRemoteRef.current) flushPendingRemote();
    }
  }, [flushPendingRemote]);

  // =====================================================================
  // 실시간 협업(PeerJS) 수신
  // =====================================================================
  useEffect(() => {
    multiplayer.onReceiveData((data, from) => {
      switch (data.type) {
        case 'scene':
          applyRemoteScene(data.payload.sceneId, normalizeSceneData(data.payload.data), data.payload.name);
          break;
        case 'full':
          replaceAllScenes(data.payload.scenes.map((s, i) => ({ id: s.id, name: s.name, data: normalizeSceneData(s.data), order: i })));
          break;
        case 'sync_request':
          if (mpRef.current.isHost) {
            captureCurrent();
            mpRef.current.sendTo(from, fullPayload());
          }
          break;
      }
    });
  }, [multiplayer.onReceiveData, applyRemoteScene, replaceAllScenes, captureCurrent]);

  const handlePointerMove = useCallback((x: number, y: number) => {
    const mp = mpRef.current;
    if (mp.status !== 'connected' || !mp.myPeerId) return;
    mp.broadcast({
      type: 'cursor',
      payload: { id: mp.myPeerId, name: mp.userName || '참여자', color: mp.userColor, x, y, sceneId: activeIdRef.current },
    });
  }, []);

  const visibleCursors = (Object.values(multiplayer.cursors) as CursorData[]).filter(c => !c.sceneId || c.sceneId === activeSceneId);

  // =====================================================================
  // Firebase 공유 링크
  // =====================================================================
  useEffect(() => onAuthStateChanged(auth, u => {
    userRef.current = u;
    setUser(u);
    setAuthChecked(true);
  }), []);

  useEffect(() => {
    if (!boardId || !authChecked || user) return;
    toast('공유된 수업 보드입니다.', {
      id: 'login-needed',
      description: 'Google 계정으로 로그인하면 함께 볼 수 있습니다.',
      duration: Infinity,
      action: { label: '로그인', onClick: () => signInWithGoogle().catch(() => toast.error('로그인하지 못했습니다.')) },
    });
  }, [boardId, authChecked, user]);

  useEffect(() => {
    if (!boardId || !user) return;
    toast.dismiss('login-needed');
    let first = true;
    const q = query(collection(db, 'boards', boardId, 'scenes'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, snapshot => {
      if (first) {
        first = false;
        const list: Scene[] = snapshot.docs.map(d => {
          const v = d.data();
          const data = normalizeSceneData(v.data);
          lastSyncedRef.current.set(d.id, data || '');
          return { id: d.id, name: v.name, data, order: v.order ?? 0 };
        });
        if (createdBoardRef.current) return; // 방금 내가 만든 보드: 이미 같은 내용
        if (list.length > 0) {
          replaceAllScenes(list);
          toast.success('공유 보드에 연결되었습니다.');
        }
        return;
      }
      snapshot.docChanges().forEach(change => {
        if (change.doc.metadata.hasPendingWrites) return; // 내가 쓴 것
        const id = change.doc.id;
        if (change.type === 'removed') {
          if (scenesRef.current.length <= 1 || !scenesRef.current.some(s => s.id === id)) return;
          const idx = scenesRef.current.findIndex(s => s.id === id);
          updateScenes(list => list.filter(s => s.id !== id));
          if (activeIdRef.current === id) setActiveSceneId(scenesRef.current[Math.max(0, idx - 1)].id);
          return;
        }
        const v = change.doc.data();
        const data = normalizeSceneData(v.data);
        if (lastSyncedRef.current.get(id) === (data || '') && scenesRef.current.some(s => s.id === id)) return;
        lastSyncedRef.current.set(id, data || '');
        if (typeof v.order === 'number') {
          updateScenes(list => list.map(s => (s.id === id ? { ...s, order: v.order } : s)).sort((a, b) => a.order - b.order));
        }
        applyRemoteScene(id, data, v.name, v.order);
      });
    }, err => {
      console.error(err);
      toast.error('공유 보드를 불러오지 못했습니다.', { description: '링크가 맞는지, 접근 권한이 있는지 확인해 주세요.' });
    });
    return () => unsub();
  }, [boardId, user, replaceAllScenes, applyRemoteScene, updateScenes, setActiveSceneId]);

  const handleShare = async () => {
    let u = userRef.current;
    if (!u) {
      try {
        u = await signInWithGoogle();
        userRef.current = u;
      } catch {
        toast.error('로그인하지 못했습니다.');
        return;
      }
    }
    let id = boardIdRef.current;
    if (!id) {
      const toastId = toast.loading('공유 보드를 만드는 중…');
      try {
        captureCurrent();
        const ref = doc(collection(db, 'boards'));
        id = ref.id;
        await setDoc(ref, { name: projectName.slice(0, 100) || '수업 보드', ownerId: u!.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        createdBoardRef.current = true;
        boardIdRef.current = id;
        await Promise.all(scenesRef.current.map(s => writeSceneDoc(s)));
        setBoardId(id);
        toast.dismiss(toastId);
      } catch (err) {
        console.error(err);
        toast.dismiss(toastId);
        toast.error('공유 보드를 만들지 못했습니다.');
        boardIdRef.current = null;
        return;
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.set('boardId', id!);
    window.history.replaceState({}, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success('공유 링크를 복사했습니다.', { description: '받는 사람도 Google 로그인 후 볼 수 있습니다.' });
    } catch {
      toast.success('공유 링크', { description: url.toString(), duration: 15000 });
    }
  };

  // =====================================================================
  // 슬라이드 조작
  // =====================================================================
  const addScene = useCallback(() => {
    captureCurrent();
    const id = newId();
    const order = Math.max(-1, ...scenesRef.current.map(s => s.order)) + 1;
    const scene: Scene = { id, name: `슬라이드 ${scenesRef.current.length + 1}`, data: null, order };
    updateScenes(list => [...list, scene]);
    setActiveSceneId(id);
    writeSceneDoc(scene);
    broadcastScene(scene);
  }, [captureCurrent, updateScenes, setActiveSceneId, writeSceneDoc, broadcastScene]);

  const removeScene = useCallback((id: string) => {
    if (scenesRef.current.length <= 1) return;
    const scene = scenesRef.current.find(s => s.id === id);
    setConfirmState({
      title: `'${scene?.name || '슬라이드'}'를 삭제할까요?`,
      message: '삭제한 슬라이드는 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
      onConfirm: () => {
        if (id !== activeIdRef.current) captureCurrent();
        const idx = scenesRef.current.findIndex(s => s.id === id);
        updateScenes(list => list.filter(s => s.id !== id));
        if (activeIdRef.current === id) setActiveSceneId(scenesRef.current[Math.max(0, idx - 1)].id);
        dirtyRef.current = true;
        publishStructure([id]);
      },
    });
  }, [captureCurrent, updateScenes, setActiveSceneId, publishStructure]);

  const currentSceneIndex = scenes.findIndex(s => s.id === activeSceneId);
  const handleNextSlide = useCallback(() => {
    const i = scenesRef.current.findIndex(s => s.id === activeIdRef.current);
    if (i < scenesRef.current.length - 1) goToScene(scenesRef.current[i + 1].id);
  }, [goToScene]);
  const handlePrevSlide = useCallback(() => {
    const i = scenesRef.current.findIndex(s => s.id === activeIdRef.current);
    if (i > 0) goToScene(scenesRef.current[i - 1].id);
  }, [goToScene]);

  // 프레젠터(클리커)·키보드로 슬라이드 넘기기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (confirmState) return;
      const hasSelection = !!whiteboardRef.current?.getCanvas()?.getActiveObject();
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !hasSelection)) { e.preventDefault(); handleNextSlide(); }
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !hasSelection)) { e.preventDefault(); handlePrevSlide(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNextSlide, handlePrevSlide, confirmState]);

  const handleClear = useCallback(() => {
    const hasLocked = !!whiteboardRef.current?.hasLockedContent();
    setConfirmState({
      title: hasLocked ? '이 슬라이드를 어떻게 지울까요?' : '이 슬라이드를 모두 지울까요?',
      message: hasLocked
        ? 'PDF 배경과 잠근 객체는 남기고 판서만 지울 수 있습니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.'
        : '실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.',
      confirmLabel: '모두 지우기',
      danger: true,
      onConfirm: () => whiteboardRef.current?.clear('all'),
      ...(hasLocked ? { secondaryLabel: '판서만 지우기', onSecondary: () => whiteboardRef.current?.clear('ink') } : {}),
    });
  }, []);

  // =====================================================================
  // 저장 / 불러오기
  // =====================================================================
  const buildProject = useCallback((): StoredProject => {
    captureCurrent();
    return {
      format: 'educanvas-project',
      version: 1,
      name: projectName,
      savedAt: new Date().toISOString(),
      activeSceneId: activeIdRef.current,
      canvasBackground,
      scenes: scenesRef.current.map(({ id, name, data, thumbnail }) => ({ id, name, data, thumbnail })),
    };
  }, [captureCurrent, projectName, canvasBackground]);

  const saveToBrowser = useCallback(async (manual: boolean) => {
    try {
      await saveProject(buildProject());
      dirtyRef.current = false;
      if (manual) toast.success('저장했습니다.', { description: '이 브라우저에 저장되었습니다. 다른 컴퓨터에서 쓰려면 [파일로 내보내기]를 이용하세요.' });
    } catch (err) {
      console.error('저장 실패', err);
      warnOnce(manual ? `save-${Date.now()}` : 'autosave-error', () =>
        toast.error('브라우저에 저장하지 못했습니다.', { description: '저장 공간이 부족할 수 있습니다. [파일로 내보내기]로 보관해 주세요.' }));
    }
  }, [buildProject]);

  const applyProject = useCallback((p: StoredProject, opts: { publish?: boolean } = {}) => {
    const list: Scene[] = p.scenes.map((s, i) => ({ id: s.id, name: s.name, data: normalizeSceneData(s.data), thumbnail: s.thumbnail, order: i }));
    const removed = scenesRef.current.filter(s => !list.some(n => n.id === s.id)).map(s => s.id);
    setProjectName(p.name || '수업');
    if (p.canvasBackground) setCanvasBackground(p.canvasBackground);
    updateScenes(() => list);
    const target = list.some(s => s.id === p.activeSceneId) ? p.activeSceneId : list[0].id;
    if (target === activeIdRef.current) bumpRevision();
    else setActiveSceneId(target);
    dirtyRef.current = false;
    if (opts.publish) publishStructure(removed);
  }, [updateScenes, bumpRevision, setActiveSceneId, publishStructure]);

  const handleLoadFromBrowser = useCallback(async () => {
    try {
      const p = await loadProject();
      if (!p) { toast.error('저장된 수업이 없습니다.'); return; }
      setConfirmState({
        title: '저장된 수업을 불러올까요?',
        message: `'${p.name}' (${new Date(p.savedAt).toLocaleString('ko-KR')} 저장)\n지금 화면의 내용은 바뀝니다.`,
        confirmLabel: '불러오기',
        onConfirm: () => { applyProject(p, { publish: true }); toast.success('불러왔습니다.'); },
      });
    } catch {
      toast.error('불러오지 못했습니다.');
    }
  }, [applyProject]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const p = JSON.parse(await file.text());
      if (!isValidProject(p)) throw new Error('invalid');
      setConfirmState({
        title: `'${p.name}' 파일을 열까요?`,
        message: '지금 화면의 내용은 바뀝니다. 필요하면 먼저 저장해 주세요.',
        confirmLabel: '열기',
        onConfirm: () => { applyProject(p, { publish: true }); dirtyRef.current = true; toast.success('파일을 열었습니다.'); },
      });
    } catch {
      toast.error('옥쌤보드 수업 파일이 아닙니다.', { description: '[파일로 내보내기]로 만든 .json 파일을 선택해 주세요.' });
    }
  }, [applyProject]);

  // 시작할 때 이전 작업 복원 제안
  useEffect(() => {
    if (boardIdRef.current) return;
    loadProject().then(p => {
      if (!p || !p.scenes.some(s => s.data && JSON.parse(s.data).objects?.length)) return;
      toast('이전에 작업하던 수업이 있습니다.', {
        id: 'restore',
        description: `'${p.name}' · ${new Date(p.savedAt).toLocaleString('ko-KR')}`,
        duration: 15000,
        action: { label: '이어서 하기', onClick: () => applyProject(p) },
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 저장 (변경이 있을 때만, 알림 없이)
  const saveRef = useRef(saveToBrowser);
  saveRef.current = saveToBrowser;
  useEffect(() => {
    const t = setInterval(() => { if (dirtyRef.current && !isDrawingRef.current) saveRef.current(false); }, AUTOSAVE_MS);
    const onHide = () => { if (document.visibilityState === 'hidden' && dirtyRef.current) saveRef.current(false); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // =====================================================================
  // PDF 내보내기 / 가져오기
  // =====================================================================
  const handleExportPDF = useCallback(async (scope: 'all' | 'current') => {
    const canvas = whiteboardRef.current?.getCanvas();
    if (!canvas) return;
    captureCurrent();
    const targets = scope === 'all' ? scenesRef.current : scenesRef.current.filter(s => s.id === activeIdRef.current);
    const toastId = toast.loading('PDF를 만드는 중…');
    try {
      const { jsPDF } = await import('jspdf');
      let pdf: InstanceType<typeof jsPDF> | null = null;
      const bg = canvasBackground === 'dark' ? '#1a202c' : '#ffffff';
      for (let i = 0; i < targets.length; i++) {
        toast.loading(`PDF를 만드는 중… (${i + 1}/${targets.length})`, { id: toastId });
        const img = await renderSceneImage(targets[i].data, canvas.width, canvas.height, bg);
        const orientation = img.width >= img.height ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        else pdf.addPage('a4', orientation);
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const ratio = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
        const w = img.width * ratio, h = img.height * ratio;
        pdf.addImage(img.dataUrl, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
      }
      const date = new Date().toISOString().slice(0, 10);
      const blob = pdf!.output('blob');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${projectName || '수업'}_${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(`PDF로 내보냈습니다 (${targets.length}쪽).`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('PDF를 만들지 못했습니다.', { id: toastId });
    }
  }, [captureCurrent, canvasBackground, projectName]);

  const processPdf = async (mode: 'single' | 'multiple') => {
    const file = pendingPdfFile;
    if (!file) return;
    setIsPdfImportModalOpen(false);
    setPendingPdfFile(null);
    const toastId = toast.loading('PDF를 여는 중…');
    try {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        toast.loading(`PDF 페이지 변환 중… (${i}/${pdf.numPages})`, { id: toastId });
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1600 / base.width) });
        const c = document.createElement('canvas');
        c.width = viewport.width;
        c.height = viewport.height;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport } as any).promise;
        pages.push(c.toDataURL('image/jpeg', 0.85));
      }
      if (mode === 'single') {
        await whiteboardRef.current?.addImages(pages);
        toast.success(`${pages.length}쪽을 현재 슬라이드에 넣었습니다.`, { id: toastId });
        return;
      }
      const canvas = whiteboardRef.current?.getCanvas();
      const w = canvas?.width || window.innerWidth;
      const h = canvas?.height || window.innerHeight;
      const baseName = file.name.replace(/\.pdf$/i, '');
      const created: Scene[] = [];
      for (let i = 0; i < pages.length; i++) {
        created.push({ id: newId(), name: `${baseName} ${i + 1}쪽`.slice(0, 100), data: await createImageScene(pages[i], w, h), order: 0 });
      }
      captureCurrent();
      const list = [...scenesRef.current];
      const idx = list.findIndex(s => s.id === activeIdRef.current);
      const currentEmpty = (canvas?.getObjects().filter(o => !o.excludeFromExport).length ?? 1) === 0;
      const removed: string[] = [];
      if (currentEmpty) { removed.push(list[idx].id); list.splice(idx, 1, ...created); }
      else list.splice(idx + 1, 0, ...created);
      updateScenes(() => list.map((s, i) => ({ ...s, order: i })));
      setActiveSceneId(created[0].id);
      dirtyRef.current = true;
      publishStructure(removed);
      toast.success(`슬라이드 ${created.length}장을 만들었습니다.`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('PDF를 열지 못했습니다.', { id: toastId, description: '암호가 걸려 있거나 손상된 파일일 수 있습니다.' });
    }
  };

  // =====================================================================
  // AI 생성
  // =====================================================================
  const handleGenerate = async (q: string) => {
    if (!q.trim()) return;
    if (!GEMINI_KEY) {
      toast.error('AI 기능이 아직 설정되지 않았습니다.', { description: '관리자가 GEMINI_API_KEY를 설정해야 사용할 수 있습니다.' });
      return;
    }
    setIsGenerating(true);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const response = await ai.models.generateContent({
        model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3-flash-preview',
        contents: `당신은 교사의 판서를 돕는 조수입니다. 다음 주제를 칠판에 쓰기 좋게 한국어로 정리해 주세요.\n형식: 첫 줄은 제목, 이어서 핵심 내용 3~6줄(각 줄은 '• '로 시작, 한 줄 40자 이내). 마크다운 기호(#, ** 등)는 쓰지 마세요.\n주제: ${q}`,
      });
      const text = response.text?.trim();
      if (text) whiteboardRef.current?.addText(text, { width: 560 });
      else toast.error('AI가 내용을 만들지 못했습니다.');
    } catch (err) {
      console.error('Gemini 오류:', err);
      toast.error('AI 생성 중 오류가 발생했습니다.', { description: '잠시 후 다시 시도해 주세요.' });
    } finally {
      setIsGenerating(false);
    }
  };

  // =====================================================================
  // 발표 모드
  // =====================================================================
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFit = useCallback((delay = 250) => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => whiteboardRef.current?.fitToContent(), delay);
  }, []);

  const enterPresentation = useCallback(() => {
    captureCurrent();
    setIsPresenting(true);
    setIsSlideNavigatorOpen(false);
    if (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'bucket' || activeTool === 'eyedropper') setActiveTool('pen');
    const el = document.documentElement as any;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(el)).catch(() => {});
    scheduleFit(400);
  }, [captureCurrent, activeTool, scheduleFit]);

  const exitPresentation = useCallback(() => {
    setIsPresenting(false);
    const d = document as any;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen)?.call(d).catch?.(() => {});
    }
    setTimeout(() => whiteboardRef.current?.resetZoom(), 300);
  }, []);

  useEffect(() => {
    const onFs = () => {
      const d = document as any;
      if (!d.fullscreenElement && !d.webkitFullscreenElement && isPresentingRef.current) {
        setIsPresenting(false);
        setTimeout(() => whiteboardRef.current?.resetZoom(), 300);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPresentingRef.current && !(document as any).fullscreenElement) exitPresentation();
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [exitPresentation]);

  const handleWhiteboardResize = useCallback(() => {
    if (isPresentingRef.current) scheduleFit(200);
  }, [scheduleFit]);

  // =====================================================================
  // 녹화
  // =====================================================================
  const sceneLabel = useCallback((id: string) => {
    const i = scenesRef.current.findIndex(s => s.id === id);
    const s = scenesRef.current[i];
    return s ? `${i + 1}. ${s.name}` : '슬라이드';
  }, []);

  const startRecording = useCallback(async (opts: { mic: boolean; camera: boolean }) => {
    const wb = whiteboardRef.current;
    const container = wb?.getContainer();
    if (!wb || !container) return;
    setRecStarting(true);
    const rec = new LessonRecorder({
      container,
      getLayers: () => whiteboardRef.current?.getRecordLayers() ?? [],
      getBackground: () => ({
        color: canvasBgRef.current === 'dark' ? '#1a202c' : '#ffffff',
        pattern: canvasBgRef.current === 'grid' ? 'grid' : canvasBgRef.current === 'dot' ? 'dot' : 'none',
        vpt: (whiteboardRef.current?.getCanvas()?.viewportTransform as number[]) || [1, 0, 0, 1, 0, 0],
      }),
      drawOverlays: (ctx, w, h, scale) => drawOverlaysOnto(ctx, overlayStateRef.current, w, h, scale),
    });
    try {
      await rec.start(opts, sceneLabel(activeIdRef.current));
      recorderRef.current = rec;
      setRecState('recording');
      setRecordDialogOpen(false);
      toast.success('녹화를 시작했습니다.', { duration: 1500 });
    } catch (err: any) {
      rec.cancel();
      toast.error(err?.message === 'mic' ? '마이크를 사용할 수 없습니다.' : '녹화를 시작하지 못했습니다.', {
        description: err?.message === 'mic' ? '브라우저 주소창 옆의 권한 설정에서 마이크를 허용하거나, 마이크 없이 녹화해 주세요.' : undefined,
      });
    } finally {
      setRecStarting(false);
    }
  }, [sceneLabel]);

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    try {
      const result = await rec.stop();
      setRecResult(result);
    } catch (err) {
      console.error(err);
      toast.error('녹화 파일을 만들지 못했습니다.');
    } finally {
      recorderRef.current = null;
      setRecState('idle');
    }
  }, []);

  // 슬라이드를 넘길 때마다 녹화 구간 기록
  useEffect(() => {
    recorderRef.current?.mark(sceneLabel(activeSceneId));
  }, [activeSceneId, sceneLabel]);

  // 녹화 중 창을 닫으려 하면 경고
  useEffect(() => {
    if (recState === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recState]);

  const openRecordDialog = useCallback(() => {
    if (!isRecordingSupported()) {
      toast.error('이 브라우저에서는 녹화를 지원하지 않습니다.', { description: '크롬, 엣지, 최신 사파리를 사용해 주세요.' });
      return;
    }
    setRecordDialogOpen(true);
  }, []);

  // =====================================================================
  // 기타
  // =====================================================================
  const handleColorPicked = useCallback((c: string) => {
    setColor(c);
    setActiveTool('pen');
    toast.success('색을 골랐습니다.', { duration: 1200 });
  }, []);

  const handleCanvasBackgroundChange = useCallback((bg: CanvasBackground) => {
    setCanvasBackground(bg);
    setColor(prev => (bg === 'dark' && prev === '#000000' ? '#ffffff' : bg !== 'dark' && prev === '#ffffff' ? '#000000' : prev));
  }, []);

  const activeScene = scenes.find(s => s.id === activeSceneId);

  return (
    <div className="fixed inset-0 overflow-hidden font-sans bg-white text-gray-900">
      <Toaster position="top-center" richColors closeButton />

      {!isPresenting && (
      <TopNavBar
        projectName={projectName}
        onRenameProject={name => { setProjectName(name); dirtyRef.current = true; }}
        onSave={() => saveToBrowser(true)}
        onLoad={handleLoadFromBrowser}
        onExportFile={() => { downloadProjectFile(buildProject()); toast.success('수업 파일을 내보냈습니다.'); }}
        onImportFile={() => projectFileInputRef.current?.click()}
        onExportPDF={() => handleExportPDF('all')}
        onExportCurrentPDF={() => handleExportPDF('current')}
        onClearAll={handleClear}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleLayout={() => setIsVertical(v => !v)}
        onGenerate={handleGenerate}
        onShare={handleShare}
        onOpenMultiplayer={() => setIsCollaborationModalOpen(true)}
        isGenerating={isGenerating}
        aiEnabled={!!GEMINI_KEY}
        isSharing={!!boardId && !!user}
        peerStatus={multiplayer.status}
        peerCount={multiplayer.peers.length + (multiplayer.status === 'connected' ? 1 : 0)}
        onPresent={enterPresentation}
        onToggleShade={() => setShadeOn(v => !v)}
        onToggleSpotlight={() => setSpotlightOn(v => !v)}
        onToggleTimer={() => setTimerOn(v => !v)}
        shadeOn={shadeOn}
        spotlightOn={spotlightOn}
        timerOn={timerOn}
      />
      )}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
      />

      <CollaborationModal isOpen={isCollaborationModalOpen} onClose={() => setIsCollaborationModalOpen(false)} multiplayer={multiplayer} />

      <div className="absolute inset-0 z-0">
        <Whiteboard
          ref={whiteboardRef}
          tool={activeTool}
          color={color}
          brushSize={brushSize}
          canvasBackground={canvasBackground}
          sceneId={activeSceneId}
          sceneData={activeScene?.data ?? null}
          sceneRevision={sceneRevision}
          onCanvasChange={handleCanvasChange}
          onSelectionChange={setMediaSelection}
          onZoomChange={setZoomLevel}
          onColorPicked={handleColorPicked}
          onDrawingStateChange={handleDrawingStateChange}
          onRequestTool={setActiveTool}
          onPointerMove={handlePointerMove}
          onResize={handleWhiteboardResize}
          autoFit={isPresenting}
          cursors={visibleCursors}
        />
      </div>

      {!isPresenting && (<>
      <Toolbar
        activeTool={activeTool}
        onToolSelect={setActiveTool}
        onAddShape={shape => whiteboardRef.current?.addShape(shape)}
        onAddText={() => whiteboardRef.current?.addText()}
        color={color}
        onColorChange={setColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        isVertical={isVertical}
        onAddFile={file => {
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            setPendingPdfFile(file);
            setIsPdfImportModalOpen(true);
          } else {
            whiteboardRef.current?.addFile(file);
          }
        }}
        onAddWebLink={url => whiteboardRef.current?.addWebLink(url)}
        onUndo={() => whiteboardRef.current?.undo()}
        onRedo={() => whiteboardRef.current?.redo()}
        onCopy={() => whiteboardRef.current?.copy()}
        onPaste={() => whiteboardRef.current?.paste()}
        onCut={() => whiteboardRef.current?.cut()}
      />

      <LayerPanel
        objects={objects}
        onToggleVisibility={id => whiteboardRef.current?.toggleVisibility(id)}
        onToggleLock={id => whiteboardRef.current?.toggleLock(id)}
        onSelectObject={id => whiteboardRef.current?.selectObject(id)}
        onBringToFront={() => whiteboardRef.current?.bringToFront()}
        onSendToBack={() => whiteboardRef.current?.sendToBack()}
        onBringForward={() => whiteboardRef.current?.bringForward()}
        onSendBackward={() => whiteboardRef.current?.sendBackward()}
      />
      </>)}

      <MediaController selection={mediaSelection} onClose={() => setMediaSelection({ type: 'none' })} />

      {!isPresenting && (
      <BottomNavBar
        onZoomToggle={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}
        isZoomActive={activeTool === 'pan'}
        zoomLevel={zoomLevel}
        onResetZoom={() => whiteboardRef.current?.resetZoom()}
        currentSlide={currentSceneIndex + 1}
        totalSlides={scenes.length}
        onNextSlide={handleNextSlide}
        onPrevSlide={handlePrevSlide}
        onAddSlide={addScene}
        onOpenSlideNavigator={() => { captureCurrent(); setIsSlideNavigatorOpen(true); }}
        isNavigatorPinned={isNavigatorPinned}
        onToggleNavigatorPin={() => setIsNavigatorPinned(p => !p)}
        isCameraOpen={isCameraOpen}
        onToggleCamera={() => setIsCameraOpen(o => !o)}
        isVertical={isVertical}
        onRecord={openRecordDialog}
        isRecording={recState !== 'idle'}
      />
      )}

      {isPresenting && (
        <PresentationBar
          current={currentSceneIndex + 1}
          total={scenes.length}
          onPrev={handlePrevSlide}
          onNext={handleNextSlide}
          tool={activeTool}
          onTool={setActiveTool}
          color={color}
          onColor={setColor}
          onUndo={() => whiteboardRef.current?.undo()}
          onFit={() => whiteboardRef.current?.fitToContent()}
          shadeOn={shadeOn}
          onToggleShade={() => setShadeOn(v => !v)}
          spotlightOn={spotlightOn}
          onToggleSpotlight={() => setSpotlightOn(v => !v)}
          timerOn={timerOn}
          onToggleTimer={() => setTimerOn(v => !v)}
          onExit={exitPresentation}
        />
      )}

      {shadeOn && <ShadeOverlay stateRef={overlayStateRef} onClose={() => setShadeOn(false)} />}
      {spotlightOn && <SpotlightOverlay stateRef={overlayStateRef} onClose={() => setSpotlightOn(false)} />}
      {timerOn && <TimerWidget onClose={() => setTimerOn(false)} />}

      {recState !== 'idle' && (
        <RecordingStatus
          state={recState}
          getElapsed={() => recorderRef.current?.elapsed() ?? 0}
          onPause={() => { recorderRef.current?.pause(); setRecState('paused'); }}
          onResume={() => { recorderRef.current?.resume(); setRecState('recording'); }}
          onStop={stopRecording}
        />
      )}
      <RecordStartDialog isOpen={recordDialogOpen} onClose={() => setRecordDialogOpen(false)} onStart={startRecording} starting={recStarting} />
      <RecordingResultDialog
        result={recResult}
        fileBase={`${projectName || '수업'}_녹화_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')}`}
        onClose={() => setRecResult(null)}
      />

      <AnimatePresence>
        {isCameraOpen && <FloatingCamera onClose={() => setIsCameraOpen(false)} />}
      </AnimatePresence>

      {!isPresenting && (
      <Navigator
        mainCanvas={mainCanvas}
        isPinned={isNavigatorPinned}
        onTogglePin={() => setIsNavigatorPinned(p => !p)}
        isZoomActive={activeTool === 'pan'}
      />
      )}

      <SlideNavigator
        isOpen={isSlideNavigatorOpen}
        onClose={() => setIsSlideNavigatorOpen(false)}
        slides={scenes}
        activeSlideId={activeSceneId}
        onSelectSlide={id => { goToScene(id); setIsSlideNavigatorOpen(false); }}
        onAddSlide={addScene}
        onRemoveSlide={removeScene}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        canvasBackground={canvasBackground}
        onCanvasBackgroundChange={handleCanvasBackgroundChange}
        isVertical={isVertical}
        onToggleOrientation={() => setIsVertical(v => !v)}
      />

      <PdfImportModal
        isOpen={isPdfImportModalOpen}
        onClose={() => { setIsPdfImportModalOpen(false); setPendingPdfFile(null); }}
        onImport={processPdf}
        fileName={pendingPdfFile?.name}
      />

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}
