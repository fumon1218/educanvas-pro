import React, { useState, useCallback, useRef, useEffect } from 'react';
import type * as fabric from 'fabric';
import { Whiteboard, WhiteboardHandle, ToolType, CanvasBackground, MediaSelection, CanvasChangeInfo, coordOrigin } from './components/Canvas/Whiteboard';
import { isBackgroundId, isDarkBackground, backgroundColor } from './lib/backgrounds';
import { StudentCaster, makeCastCode, castUrl, type CastView, type Poll, type StudentState } from './lib/studentCast';
import { StudentResponsePanel } from './components/Cast/StudentResponsePanel';
import { StudentCastModal } from './components/Cast/StudentCastModal';
import { Toolbar } from './components/UI/Toolbar';
import { MediaController } from './components/UI/MediaController';
import { ScoreDock } from './components/UI/ScoreDock';
import { PageIndicator, type PageInfo } from './components/UI/PageIndicator';
import { measureAt as measureAtSec } from './music/renderScore';
import { LayerPanel } from './components/UI/LayerPanel';
import { TopNavBar } from './components/UI/TopNavBar';
import { BottomNavBar } from './components/UI/BottomNavBar';
import { SettingsModal } from './components/UI/SettingsModal';
import { SlideNavigator } from './components/UI/SlideNavigator';
import { FloatingCamera } from './components/UI/FloatingCamera';
import { LessonHistoryModal } from './components/UI/LessonHistoryModal';
import { LessonDashboard } from './components/UI/LessonDashboard';
import { PromptHost, askText } from './components/UI/PromptHost';
import { buildTemplateScene, parseBibleRef, bibleUrl, type TemplateDef } from './lib/templates';
import { checkItemsOf, setCheckInData, type CheckItem } from './lib/noteOps';
import { ClipSaveModal, StudyLogModal, FocusChip, FlashReviewBar, type FocusState } from './components/Study/StudyTools';
import { WRONG_NOTE_ID, createClipScene, addToWrongNote, addStudyMinute, addFocusSession, nextDue, initialStudentMode, saveStudentMode } from './lib/study';
import { PdfImportModal, type PdfImportMode } from './components/UI/PdfImportModal';
import { CollaborationModal } from './components/UI/CollaborationModal';
import { ConfirmDialog, ConfirmState } from './components/UI/ConfirmDialog';
import { PresentationBar } from './components/Present/PresentationBar';
import { ShadeOverlay, SpotlightOverlay, TimerWidget, createOverlayState, drawOverlaysOnto } from './components/Present/FocusTools';
import { RecordStartDialog, RecordingStatus, RecordingResultDialog } from './components/Record/RecorderUI';
import { LessonRecorder, RecordingResult, isRecordingSupported } from './lib/lessonRecorder';
import { FloatingWindow, type WindowRect } from './components/Windows/FloatingWindow';
import { WebBrowserPane, type Clip } from './components/Windows/WebBrowserPane';
import { ModelViewerPane } from './components/Windows/ModelViewerPane';
import { AssetLibrary, importModelFiles } from './components/Windows/AssetLibrary';
import { Globe, Box } from 'lucide-react';

interface AppWindow {
  id: string;
  kind: 'web' | 'model';
  title: string;
  url?: string;
  clip?: Clip;
  modelId?: string;
  driveId?: string;
  rect: WindowRect;
  minimized: boolean;
  maximized: boolean;
  z: number;
}
import { useMultiplayer, SyncData, CursorData } from './hooks/useMultiplayer';
import { AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { isStaleChunkError, recoverFromStaleChunk } from './lib/appUpdate';
import { TEST_MODE } from './lib/testMode';
import { DocImportError, isDocumentFile, type PageSource } from './lib/docImport';
import { saveDoc } from './lib/hdRender';
import { cn } from './lib/utils';
import { db, auth, signInWithGoogle } from './firebase';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { newId, normalizeSceneData, renderSceneImage, createImageScene, createScoreScene, createStackedPdfScene } from './lib/canvasData';
import { saveProject, loadProject, loadLesson, loadLessonRaw, isLockedLesson, openWithCachedKey, unlockLesson, lockLesson, removeLock, isUnlocked, listLibrary, spaceOf, type Space, setLastLesson, restoreHistory, legacyLessonId, type HistoryEntry, isValidProject, downloadProjectFile, StoredProject, packModels, unpackModels } from './lib/projectStore';
import { formatBytes } from './lib/assetStore';

interface Scene {
  id: string;
  name: string;
  data: string | null;
  thumbnail?: string;
  order: number;
  background?: CanvasBackground;
}

const FIRESTORE_SCENE_LIMIT = 900_000;
const AUTOSAVE_MS = 30_000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

export default function App() {
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  // ---------- 도구 ----------
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isVerticalPref, setIsVertical] = useState(true);
  // 휴대폰(폭 640px 미만): 도구 막대는 아래 가로, 상단 단추는 [⋯] 메뉴
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const isVertical = isVerticalPref && !isPhone;
  const [canvasBackground, setCanvasBackground] = useState<CanvasBackground>('blank');
  const canvasBgRef = useRef(canvasBackground);

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

  // ---------- 떠 있는 창 (웹 브라우저 · 3D 모델) ----------
  const [windows, setWindows] = useState<AppWindow[]>([]);
  const zTopRef = useRef(90);
  const winElsRef = useRef(new Map<string, HTMLDivElement>());
  const modelCanvasRef = useRef(new Map<string, CanvasImageSource[]>());
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<{ name: string; numPages: number; preview: string | null; kind: string; note?: string } | null>(null);
  const pdfDocRef = useRef<PageSource | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // ---------- 그리기 상태 ----------
  const isDrawingRef = useRef(false);
  const lastDrawingEndRef = useRef(0);
  const pendingRemoteRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  /** 드라이브에 아직 올리지 않은 변경 */
  const driveDirtyRef = useRef(false);
  const markDirty = useCallback(() => { dirtyRef.current = true; driveDirtyRef.current = true; }, []);
  // 수업 고유 번호와 드라이브 파일
  const lessonRef = useRef<{ lessonId: string; fileId: string | null; modified: string | null; category?: string; space?: Space; noteDate?: string }>({ lessonId: newId() + newId(), fileId: null, modified: null });
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'error'>('saved');
  const saveErrorRef = useRef(false);

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
    markDirty();
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
      type: (o as any).isModel ? 'model' : (o as any).isScore ? 'score' : (o as any).isBackground ? 'background' : (o as any).isVideo ? 'video' : (o as any).isAudio ? 'audio' : (o as any).isWebLink ? 'weblink' : o.type,
      visible: o.visible,
      locked: !!(o as any).locked,
    })));
    if (fromLoad) return;
    if (sceneId !== activeIdRef.current) return;
    const thumbnail = whiteboardRef.current?.getThumbnail();
    updateScenes(list => list.map(s => (s.id === sceneId ? { ...s, data, thumbnail } : s)));
    markDirty();
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
        markDirty();
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
  /** 리모컨·키보드: 한 슬라이드에 이어 붙인 PDF는 쪽부터 넘기고, 끝나면 다음 슬라이드 */
  const handleNextStep = useCallback(() => { if (!whiteboardRef.current?.stepPage(1)) handleNextSlide(); }, [handleNextSlide]);
  const handlePrevStep = useCallback(() => { if (!whiteboardRef.current?.stepPage(-1)) handlePrevSlide(); }, [handlePrevSlide]);

  // 프레젠터(클리커)·키보드로 슬라이드 넘기기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (confirmState) return;
      const hasSelection = !!whiteboardRef.current?.getCanvas()?.getActiveObject();
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !hasSelection)) { e.preventDefault(); handleNextStep(); }
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !hasSelection)) { e.preventDefault(); handlePrevStep(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNextStep, handlePrevStep, confirmState]);

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
      scenes: scenesRef.current.map(({ id, name, data, thumbnail, background }) => ({ id, name, data, thumbnail, ...(background ? { background } : {}) })),
      lessonId: lessonRef.current.lessonId,
      ...(lessonRef.current.category ? { category: lessonRef.current.category } : {}),
      ...(lessonRef.current.space ? { space: lessonRef.current.space } : {}),
      ...(lessonRef.current.noteDate ? { noteDate: lessonRef.current.noteDate } : {}),
      ...(lessonRef.current.fileId ? { driveFileId: lessonRef.current.fileId } : {}),
      ...(lessonRef.current.modified ? { driveModified: lessonRef.current.modified } : {}),
    };
  }, [captureCurrent, projectName, canvasBackground]);

  const saveToBrowser = useCallback(async (manual: boolean) => {
    try {
      await saveProject(buildProject());
      dirtyRef.current = false;
      saveErrorRef.current = false;
      if (manual) toast.success(`'${projectName}' 수업을 저장했습니다.`, { description: driveOnRef.current ? '이 컴퓨터와 구글 드라이브에 저장됩니다. [내 노트]에서 언제든 엽니다.' : '이 컴퓨터(이 브라우저)에 저장되었습니다. 왼쪽 위 [내 노트]에서 언제든 엽니다.' });
    } catch (err) {
      console.error('저장 실패', err);
      saveErrorRef.current = true;
      warnOnce(manual ? `save-${Date.now()}` : 'autosave-error', () =>
        toast.error('브라우저에 저장하지 못했습니다.', { description: '저장 공간이 부족할 수 있습니다. [파일로 내보내기]로 보관해 주세요.' }));
    }
  }, [buildProject, projectName]);

  const applyProject = useCallback((p: StoredProject, opts: { publish?: boolean } = {}) => {
    const list: Scene[] = p.scenes.map((s, i) => ({ id: s.id, name: s.name, data: normalizeSceneData(s.data), thumbnail: s.thumbnail, order: i, ...(isBackgroundId(s.background) ? { background: s.background } : {}) }));
    const removed = scenesRef.current.filter(s => !list.some(n => n.id === s.id)).map(s => s.id);
    setProjectName(p.name || '수업');
    lessonRef.current = { lessonId: p.lessonId || legacyLessonId(p), fileId: p.driveFileId || null, modified: p.driveModified || null, category: p.category, space: p.space, noteDate: p.noteDate };
    if (isBackgroundId(p.canvasBackground)) setCanvasBackground(p.canvasBackground);
    updateScenes(() => list);
    const target = list.some(s => s.id === p.activeSceneId) ? p.activeSceneId : list[0].id;
    if (target === activeIdRef.current) bumpRevision();
    else setActiveSceneId(target);
    dirtyRef.current = false;
    if (opts.publish) publishStructure(removed);
  }, [updateScenes, bumpRevision, setActiveSceneId, publishStructure]);

  // =====================================================================
  // 구글 드라이브 동기화
  // =====================================================================
  const [driveOn, setDriveOn] = useState(() => { if (TEST_MODE) return false; try { return localStorage.getItem('okssam_drive_sync') === '1'; } catch { return false; } });
  const driveOnRef = useRef(driveOn);
  driveOnRef.current = driveOn;
  const [driveState, setDriveState] = useState<'off' | 'synced' | 'saving' | 'pending' | 'need-auth' | 'error' | 'conflict'>(driveOn ? 'pending' : 'off');
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const driveBusyRef = useRef(false);

  const driveTokenOrNull = useCallback(async (interactive: boolean) => {
    const { cachedToken, connectDrive } = await import('./lib/driveSync');
    const t = cachedToken();
    if (t) return t;
    if (!interactive) { setDriveState('need-auth'); return null; }
    try { return await connectDrive(); }
    catch (e: any) { if (e?.code !== 'cancelled') toast.error('구글 드라이브에 연결하지 못했습니다.', { description: e?.message }); setDriveState('need-auth'); return null; }
  }, []);

  /** 드라이브에 저장. force: 다른 기기의 더 새 버전을 덮어쓴다 */
  const saveToDrive = useCallback(async (opts: { manual?: boolean; force?: boolean } = {}) => {
    if (!driveOnRef.current || driveBusyRef.current) return;
    if (isUnlocked(lessonRef.current.lessonId)) { if (opts.manual) toast.info('암호로 잠근 노트는 구글 드라이브에 올리지 않습니다.'); return; }
    const token = await driveTokenOrNull(!!opts.manual);
    if (!token) return;
    driveBusyRef.current = true;
    setDriveState('saving');
    const id = opts.manual ? toast.loading('구글 드라이브에 저장하는 중…') : undefined;
    try {
      const sync = await import('./lib/driveSync');
      const proj = buildProject();
      const cur = lessonRef.current;
      // 다른 기기에서 더 최근에 고쳤는지 확인
      if (cur.fileId && cur.modified && !opts.force) {
        const remote = await sync.getModified(token, cur.fileId);
        if (remote && remote !== cur.modified) {
          setDriveState('conflict');
          if (id) toast.dismiss(id);
          setConfirmState({
            title: '다른 기기에서 더 최근에 고친 수업입니다',
            message: `드라이브의 '${proj.name}'이(가) ${new Date(remote).toLocaleString('ko-KR')}에 다른 곳에서 바뀌었습니다.\n이 기기의 내용으로 덮어쓰면 그 변경은 사라집니다.`,
            confirmLabel: '이 기기 것으로 덮어쓰기',
            danger: true,
            secondaryLabel: '드라이브 것 불러오기',
            onSecondary: () => { void openDriveLesson({ id: cur.fileId!, name: proj.name, modifiedTime: remote }); },
            onConfirm: () => { void saveToDrive({ manual: true, force: true }); },
          });
          return;
        }
      }
      driveDirtyRef.current = false;
      const ids = sync.modelIdsOf(proj);
      if (ids.length) await sync.uploadMissingModels(token, ids);
      const res = await sync.saveLesson(token, { ...proj, lessonId: cur.lessonId }, cur.fileId);
      lessonRef.current = { ...lessonRef.current, fileId: res.id, modified: res.modifiedTime };
      setDriveState(driveDirtyRef.current ? 'pending' : 'synced');
      // 드라이브 정보도 이 기기 저장에 남긴다
      saveProject(buildProject()).catch(() => {});
      if (id) toast.success('구글 드라이브에 저장했습니다.', { id, description: "'옥쌤보드' 폴더 · 다른 기기에서 [내 노트]로 열 수 있습니다." });
    } catch (e: any) {
      driveDirtyRef.current = true;
      setDriveState(e?.code === 'need-auth' ? 'need-auth' : 'error');
      if (id) toast.error('드라이브에 저장하지 못했습니다.', { id, description: e?.message });
      else if (e?.code !== 'need-auth' && e?.code !== 'network') warnOnce('drive-error', () => toast.error('구글 드라이브 저장에 문제가 있습니다.', { description: e?.message }));
    } finally {
      driveBusyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildProject, driveTokenOrNull]);

  /** 드라이브의 수업 열기 (3D 모델도 받아 옴) */
  const openDriveLesson = useCallback(async (l: { id: string; name: string; modifiedTime: string }) => {
    const token = await driveTokenOrNull(true);
    if (!token) return;
    if (dirtyRef.current) await saveRef.current(false);
    const id = toast.loading(`'${l.name}'을(를) 여는 중…`);
    try {
      const sync = await import('./lib/driveSync');
      const p = await sync.loadLesson(token, l.id);
      if (!isValidProject(p)) throw new Error('옥쌤보드 수업 파일이 아닙니다.');
      const got = await sync.downloadMissingModels(token, sync.modelIdsOf(p)).catch(() => 0);
      const opened = { ...p, driveFileId: l.id, driveModified: l.modifiedTime };
      applyProject(opened, { publish: true });
      driveDirtyRef.current = false;
      setDriveState('synced');
      // 화면이 바뀌기 전의 캔버스를 저장하지 않도록, 받은 수업을 그대로 이 기기에 저장
      saveProject(opened).catch(() => {});
      setLessonsOpen(false);
      toast.success(`'${l.name}'을(를) 열었습니다.`, { id, description: got ? `3D 모델 ${got}개를 드라이브에서 받아 왔습니다.` : undefined });
    } catch (e: any) {
      toast.error('수업을 열지 못했습니다.', { id, description: e?.message });
    }
  }, [driveTokenOrNull, applyProject, buildProject]);

  const enableDrive = useCallback(async () => {
    if (TEST_MODE) { toast.error('시험 모드에서는 구글 드라이브를 쓰지 않습니다.', { description: '실제 수업을 보호하기 위해서입니다. 주소에서 ?test=1을 빼고 새 탭으로 여세요.' }); return false; }
    const { connectDrive } = await import('./lib/driveSync');
    try {
      await connectDrive();
      try { localStorage.setItem('okssam_drive_sync', '1'); } catch { /* 무시 */ }
      setDriveOn(true);
      driveOnRef.current = true;
      driveDirtyRef.current = true;
      setDriveState('pending');
      void saveToDrive({ manual: true });
      return true;
    } catch (e: any) {
      if (e?.code !== 'cancelled') toast.error('구글 드라이브에 연결하지 못했습니다.', { description: e?.message });
      return false;
    }
  }, [saveToDrive]);

  const disableDrive = useCallback(() => {
    try { localStorage.removeItem('okssam_drive_sync'); } catch { /* 무시 */ }
    setDriveOn(false);
    setDriveState('off');
    toast.success('이 기기에서 드라이브 저장을 껐습니다.', { description: '드라이브에 있는 수업은 그대로 남아 있습니다.' });
  }, []);

  const newLesson = useCallback(async (opts: { category?: string; space?: Space; template?: TemplateDef; skipSave?: boolean } = {}) => {
    if (!opts.skipSave && dirtyRef.current) await saveRef.current(false);
    if (!opts.skipSave && driveOnRef.current && driveDirtyRef.current) await saveToDrive({});
    const now = new Date();
    const t = opts.template;
    const space = opts.space || t?.space || 'lesson';
    const w = whiteboardRef.current?.getCanvas()?.width || window.innerWidth;
    const data = t ? await buildTemplateScene(t, w, now) : null;
    const first: Scene = { id: newId(), name: t?.paper ? '1쪽' : '슬라이드 1', data, order: 0 };
    const name = t ? t.name(now) : '새 수업';
    const noteDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    applyProject({ format: 'educanvas-project', version: 1, name, savedAt: now.toISOString(), activeSceneId: first.id, canvasBackground: 'blank', scenes: [{ id: first.id, name: first.name, data }] }, { publish: true });
    lessonRef.current = { lessonId: newId() + newId(), fileId: null, modified: null, category: opts.category, space, noteDate };
    if (data) { markDirty(); setTimeout(() => { whiteboardRef.current?.goToPageNo(1); }, 400); }
    setLessonsOpen(false);
    toast.success(t?.paper ? `'${name}'을(를) 만들었습니다.` : '새 수업을 시작했습니다.', {
      description: t?.paper ? '칸에 펜으로 바로 쓰거나, 선택 도구로 칸을 두 번 눌러 타자로 적으세요. 쪽이 모자라면 노트 → [공책 쪽 추가].' : `${opts.category ? `'${opts.category}' 분류 · ` : ''}판서를 시작하면 [내 노트]에 자동으로 저장됩니다.`,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveToDrive, applyProject]);

  /** 잠긴 노트면 암호를 물어 연다 (이번에 이미 넣었으면 묻지 않음) */
  const resolveLesson = useCallback(async (id: string): Promise<StoredProject | null> => {
    const raw = await loadLessonRaw(id);
    if (!raw) return null;
    if (!isLockedLesson(raw)) return raw;
    const cached = await openWithCachedKey(raw);
    if (cached) return cached;
    for (let tries = 0; tries < 3; tries++) {
      const pw = await askText({ title: `'${raw.name}' 잠금 풀기`, message: tries ? '암호가 맞지 않습니다. 다시 입력하세요.' : '암호로 잠근 노트입니다.', type: 'password', confirmLabel: '열기' });
      if (pw == null) return null;
      const p = await unlockLesson(raw, pw);
      if (p) return p;
    }
    toast.error('암호가 맞지 않습니다.');
    return null;
  }, []);

  /** 이 컴퓨터에 저장된 수업 열기 (지금 수업은 먼저 저장) */
  const openLocalLesson = useCallback(async (id: string) => {
    if (id === lessonRef.current.lessonId) { setLessonsOpen(false); return; }
    const tid = toast.loading('수업을 여는 중…');
    try {
      if (dirtyRef.current) await saveRef.current(false);
      if (driveOnRef.current && driveDirtyRef.current) await saveToDrive({});
      toast.dismiss(tid);
      const p = await resolveLesson(id);
      if (!p) return;
      applyProject(p, { publish: true });
      driveDirtyRef.current = false;
      if (driveOnRef.current) setDriveState(p.driveFileId ? 'synced' : 'pending');
      void setLastLesson(id);
      setLessonsOpen(false);
      toast.success(`'${p.name}'을(를) 열었습니다.`);
    } catch (e: any) {
      toast.error('수업을 열지 못했습니다.', { id: tid, description: e?.message });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyProject, saveToDrive, resolveLesson]);

  // 드라이브 자동 저장: 바뀐 것이 있으면 30초마다 (그리는 중에는 기다림)
  useEffect(() => {
    if (!driveOn) return;
    const t = setInterval(() => {
      if (driveDirtyRef.current && !isDrawingRef.current && !driveBusyRef.current) void saveToDrive({});
      else if (driveDirtyRef.current) setDriveState(s => (s === 'synced' ? 'pending' : s));
    }, 30_000);
    const onHide = () => { if (document.visibilityState === 'hidden' && driveDirtyRef.current) void saveToDrive({}); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onHide); };
  }, [driveOn, saveToDrive]);

  // 표시용: 바뀌면 '올릴 것 있음'
  useEffect(() => {
    if (!driveOn) return;
    const t = setInterval(() => { if (driveDirtyRef.current) setDriveState(s => (s === 'synced' ? 'pending' : s)); }, 2000);
    return () => clearInterval(t);
  }, [driveOn]);

  const listDriveLessons = useCallback(async () => {
    const token = await driveTokenOrNull(true);
    if (!token) throw new Error('구글 드라이브에 연결해 주세요.');
    const { listLessons } = await import('./lib/driveSync');
    return listLessons(token);
  }, [driveTokenOrNull]);

  const handleLoadFromBrowser = useCallback(() => setLessonsOpen(true), []);

  /** 수업 기록에서 되살리기: 지금 수업은 먼저 기록에 보관된다 */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLesson, setHistoryLesson] = useState<string | undefined>(undefined);
  const buildRef = useRef(buildProject);
  buildRef.current = buildProject;
  const handleRestoreHistory = useCallback((h: HistoryEntry) => {
    setConfirmState({
      title: '이 수업을 되살릴까요?',
      message: `'${h.name}' (${new Date(h.savedAt).toLocaleString('ko-KR')} 저장, 슬라이드 ${h.slides}장)\n지금 수업은 수업 기록에 먼저 보관되므로 사라지지 않습니다.`,
      confirmLabel: '되살리기',
      onConfirm: async () => {
        try {
          const p = await restoreHistory(h.id, buildRef.current());
          if (!p) { toast.error('기록을 찾지 못했습니다.'); return; }
          applyProject(p, { publish: true });
          dirtyRef.current = false;
          setHistoryOpen(false);
          toast.success('수업을 되살렸습니다.');
        } catch { toast.error('되살리지 못했습니다.'); }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyProject]);

  /** 수업 파일 내보내기: 슬라이드에 쓴 3D 모델과 이름표도 함께 담는다 */
  const handleExportFile = useCallback(async () => {
    const base = buildProject();
    const id = toast.loading('수업 파일을 만드는 중…');
    try {
      const { project, count, bytes, missing } = await packModels(base);
      downloadProjectFile(project);
      toast.success('수업 파일을 내보냈습니다.', {
        id,
        description: count ? `3D 모델 ${count}개(${formatBytes(bytes)})와 이름표가 함께 들어 있습니다.${missing ? ` 이 컴퓨터에 없는 모델 ${missing}개는 빠졌습니다.` : ''}` : undefined,
      });
    } catch (err) {
      console.error(err);
      downloadProjectFile(base);
      toast.success('수업 파일을 내보냈습니다.', { id, description: '3D 모델은 담지 못했습니다.' });
    }
  }, [buildProject]);

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const p = JSON.parse(await file.text());
      if (!isValidProject(p)) throw new Error('invalid');
      setConfirmState({
        title: `'${p.name}' 파일을 열까요?`,
        message: '지금 수업은 저장되고, 이 파일은 새 수업으로 열립니다.',
        confirmLabel: '열기',
        onConfirm: async () => {
          let added = 0;
          if (p.assets?.models?.length) {
            const id = toast.loading('수업 파일의 3D 모델을 자산함에 넣는 중…');
            try { added = await unpackModels(p); } catch (err) { console.error(err); }
            toast.dismiss(id);
          }
          if (dirtyRef.current) await saveRef.current(false);
          // 파일은 새 수업으로 연다: 이 컴퓨터에 있는 같은 수업을 덮어쓰지 않게
          applyProject({ ...p, lessonId: newId() + newId(), driveFileId: undefined, driveModified: undefined }, { publish: true });
          markDirty();
          setLessonsOpen(false);
          toast.success('파일을 열었습니다. [내 노트]에 새 노트로 저장됩니다.', added ? { description: `3D 모델 ${added}개를 이 컴퓨터의 자산함에 넣었습니다.` } : undefined);
        },
      });
    } catch {
      toast.error('옥쌤보드 수업 파일이 아닙니다.', { description: '[파일로 내보내기]로 만든 .json 파일을 선택해 주세요.' });
    }
  }, [applyProject]);

  // =====================================================================
  // 학생 학습 도구: 오답 노트 · 가림 카드 복습 · 공부 기록 · 집중 타이머 · 학생 모드
  // =====================================================================
  const [studentMode, setStudentMode] = useState(initialStudentMode);
  const [clipImage, setClipImage] = useState<string | null>(null);
  const insertScenesRef = useRef<(c: Scene[]) => void>(() => {});
  const [studyOpen, setStudyOpen] = useState(false);

  const saveClip = useCallback(async (info: { tag: string; memo: string }) => {
    if (!clipImage) return;
    try {
      const src = `${projectName} · ${sceneLabelRef.current(activeIdRef.current)}`;
      const cv = whiteboardRef.current?.getCanvas();
      const data = await createClipScene(clipImage, { ...info, source: src }, cv?.width || window.innerWidth, cv?.height || window.innerHeight);
      const title = info.tag ? `${info.tag}` : '오답';
      let n: number;
      if (lessonRef.current.lessonId === WRONG_NOTE_ID) {
        insertScenesRef.current([{ id: newId(), name: title, data, order: 0 }]);
        n = scenesRef.current.length;
      } else n = await addToWrongNote(data, title);
      setClipImage(null);
      toast.success(`오답 노트에 넣었습니다 (${n}번째).`, {
        description: '같은 방법으로 계속 모을 수 있습니다.',
        action: lessonRef.current.lessonId === WRONG_NOTE_ID ? undefined : { label: '오답 노트 열기', onClick: () => { void openLocalLesson(WRONG_NOTE_ID); } },
      });
    } catch (e) {
      console.error(e);
      toast.error('오답 노트에 넣지 못했습니다.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipImage, projectName]);

  // 공부 시간: 수업 화면이 보이고 2분 안에 무언가를 했으면 1분씩 기록
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('pointerdown', bump, true);
    window.addEventListener('keydown', bump, true);
    window.addEventListener('wheel', bump, { capture: true, passive: true });
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivityRef.current < 120_000 && !boardIdRef.current)
        addStudyMinute(lessonRef.current.lessonId, projectNameRef.current || '수업');
    }, 60_000);
    return () => { clearInterval(t); window.removeEventListener('pointerdown', bump, true); window.removeEventListener('keydown', bump, true); window.removeEventListener('wheel', bump, true); };
  }, []);

  // 집중 타이머
  const [focus, setFocus] = useState<FocusState | null>(null);
  const beep = useCallback(() => {
    try {
      const ac = new AudioContext();
      [0, 0.25, 0.5].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.18, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2); o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.22); });
      setTimeout(() => ac.close(), 1200);
    } catch { /* 무시 */ }
  }, []);
  const startFocus = useCallback((focusMin: number, breakMin: number) => {
    setFocus({ phase: 'focus', endsAt: Date.now() + focusMin * 60_000, focusMin, breakMin });
    toast.success(`${focusMin}분 집중을 시작합니다.`);
  }, []);
  const togglePauseFocus = useCallback(() => setFocus(f => (!f ? f : f.paused !== undefined ? { ...f, endsAt: Date.now() + f.paused, paused: undefined } : { ...f, paused: Math.max(0, f.endsAt - Date.now()) })), []);
  useEffect(() => {
    if (!focus || focus.paused !== undefined) return;
    const t = setInterval(() => {
      if (Date.now() < focus.endsAt) return;
      beep();
      if (focus.phase === 'focus') {
        addFocusSession();
        toast.success('집중 끝! 잠깐 쉬어요.', { description: `${focus.breakMin}분 쉬는 시간` });
        setFocus({ ...focus, phase: 'break', endsAt: Date.now() + focus.breakMin * 60_000 });
      } else {
        toast('쉬는 시간이 끝났습니다.', { action: { label: '다시 집중', onClick: () => startFocus(focus.focusMin, focus.breakMin) } });
        setFocus(null);
      }
    }, 500);
    return () => clearInterval(t);
  }, [focus, beep, startFocus]);

  // 가림 카드 복습: 오늘 볼 카드(처음이거나 날짜가 된 것)를 낮은 단계부터
  type ReviewCard = { sceneId: string; id: string; box: number; requeued?: boolean };
  const [review, setReview] = useState<{ queue: ReviewCard[]; i: number; revealed: boolean; known: number; again: number; done?: boolean } | null>(null);
  const showCard = useCallback(async (c: ReviewCard) => {
    if (activeIdRef.current !== c.sceneId) setActiveSceneId(c.sceneId);
    for (let k = 0; k < 30; k++) {
      if (activeIdRef.current === c.sceneId && whiteboardRef.current?.focusObject(c.id)) {
        whiteboardRef.current?.setFlash(c.id, { revealed: false });
        return;
      }
      await new Promise(r => setTimeout(r, 120));
    }
  }, [setActiveSceneId]);
  const startReview = useCallback(async () => {
    captureCurrent();
    const cards: (ReviewCard & { due: number })[] = [];
    for (const sc of scenesRef.current) {
      if (sc.id === activeIdRef.current) {
        whiteboardRef.current?.getFlashCards().forEach(f => cards.push({ sceneId: sc.id, id: f.id, box: f.box, due: f.due }));
        continue;
      }
      if (!sc.data || !sc.data.includes('"isFlash"')) continue;
      try { (JSON.parse(sc.data).objects || []).forEach((o: any) => { if (o?.isFlash && o.id) cards.push({ sceneId: sc.id, id: o.id, box: o.flashBox || 1, due: o.flashDue || 0 }); }); } catch { /* 무시 */ }
    }
    if (!cards.length) { toast.info('가림 카드가 없습니다.', { description: '[공부·복습 → 가림 카드 만들기]로 외울 곳을 덮어 두세요.' }); return; }
    let queue = cards.filter(c => c.due <= Date.now());
    if (!queue.length) { queue = cards; toast('오늘 복습할 카드는 다 봤습니다. 모든 카드를 한 번 더 봅니다.'); }
    queue.sort((a, b) => a.box - b.box || a.due - b.due);
    setReview({ queue, i: 0, revealed: false, known: 0, again: 0 });
    await showCard(queue[0]);
  }, [captureCurrent, showCard]);
  const revealCard = useCallback(() => {
    setReview(r => { if (!r) return r; whiteboardRef.current?.setFlash(r.queue[r.i].id, { revealed: true }); return { ...r, revealed: true }; });
  }, []);
  const gradeCard = useCallback((known: boolean) => {
    setReview(r => {
      if (!r) return r;
      const c = r.queue[r.i];
      const box = known ? Math.min(5, c.box + 1) : 1;
      whiteboardRef.current?.setFlash(c.id, { box, due: known ? nextDue(box) : Date.now(), revealed: false });
      markDirty();
      const queue = [...r.queue];
      if (!known && !c.requeued) queue.push({ ...c, box, requeued: true }); // 모르는 카드는 이번에 한 번 더
      const next = { ...r, queue, i: r.i + 1, revealed: false, known: r.known + (known ? 1 : 0), again: r.again + (known ? 0 : 1) };
      if (next.i >= queue.length) return { ...next, i: queue.length - 1, done: true };
      void showCard(queue[next.i]);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCard]);

  // =====================================================================
  // 노트: 내보내기 · 잠금 · 할 일/기도 제목 모아 보기 · 노트 도구
  // =====================================================================
  const projectOf = useCallback(async (id: string): Promise<StoredProject | null> => {
    if (id === lessonRef.current.lessonId) return buildRef.current();
    return resolveLesson(id);
  }, [resolveLesson]);

  const exportById = useCallback(async (id: string, format: 'hwpx' | 'docx') => {
    const p = await projectOf(id);
    if (!p) return;
    const tid = toast.loading(format === 'hwpx' ? '한글 문서를 만드는 중…' : '워드 문서를 만드는 중…');
    try {
      const { exportNote } = await import('./lib/noteExport');
      await exportNote(p, format, true);
      toast.success(format === 'hwpx' ? '한글(hwpx) 파일을 만들었습니다.' : '워드(docx) 파일을 만들었습니다.', { id: tid, description: '타자로 쓴 글은 글자로, 펜으로 쓴 내용은 쪽 그림으로 들어갑니다.' });
    } catch (e: any) {
      console.error(e);
      toast.error('문서를 만들지 못했습니다.', { id: tid, description: e?.message });
    }
  }, [projectOf]);

  const lockById = useCallback(async (id: string) => {
    const p = await projectOf(id);
    if (!p) return;
    const pw = await askText({ title: '암호로 잠그기', message: `'${p.name}'을(를) 암호로 잠급니다.\n암호를 잊으면 아무도(저도) 열 수 없습니다.`, type: 'password', confirmLabel: '다음', hint: '4자 이상' });
    if (!pw) return;
    if (pw.length < 4) { toast.error('암호는 4자 이상으로 해 주세요.'); return; }
    const again = await askText({ title: '암호 확인', message: '같은 암호를 한 번 더 입력하세요.', type: 'password', confirmLabel: '잠그기' });
    if (again !== pw) { toast.error('두 암호가 다릅니다. 잠그지 않았습니다.'); return; }
    await lockLesson(p, pw);
    if (id === lessonRef.current.lessonId) dirtyRef.current = false;
    toast.success('노트를 잠갔습니다.', { description: '목록에서 내용·썸네일이 가려지고, 열 때 암호를 묻습니다. 구글 드라이브에는 올리지 않습니다. (이번에 연 동안은 다시 묻지 않습니다)' });
  }, [projectOf]);

  const unlockById = useCallback(async (id: string) => {
    const p = await projectOf(id);
    if (!p) return;
    await removeLock(p);
    toast.success('잠금을 풀었습니다.');
  }, [projectOf]);

  const listChecks = useCallback(async (space: Space, kind: 'todo' | 'prayer') => {
    const lib = await listLibrary();
    const out: CheckItem[] = [];
    for (const e of lib.lessons) {
      if (e.trashedAt || spaceOf(e) !== space) continue;
      if (e.locked && !isUnlocked(e.id)) continue;
      const p = e.id === lessonRef.current.lessonId ? buildRef.current() : await loadLesson(e.id);
      if (p) out.push(...checkItemsOf({ ...p, lessonId: e.id }, kind));
    }
    return out;
  }, []);

  const toggleCheck = useCallback(async (it: CheckItem, checked: boolean) => {
    if (it.lessonId === lessonRef.current.lessonId) {
      if (it.sceneId === activeIdRef.current && whiteboardRef.current?.setChecklistLine(it.objId, it.line, checked)) return;
      captureCurrent();
      const sc = scenesRef.current.find(x => x.id === it.sceneId);
      const next = sc?.data ? setCheckInData(sc.data, it.objId, it.line, checked) : null;
      if (next) { updateScenes(list => list.map(x => (x.id === it.sceneId ? { ...x, data: next } : x))); markDirty(); }
      return;
    }
    const p = await loadLesson(it.lessonId);
    if (!p) return;
    const scenes = p.scenes.map(x => (x.id === it.sceneId && x.data ? { ...x, data: setCheckInData(x.data, it.objId, it.line, checked) || x.data } : x));
    await saveProject({ ...p, scenes, savedAt: new Date().toISOString() }, { touchLast: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureCurrent, updateScenes]);

  const handleNoteTool = useCallback(async (kind: 'todo' | 'prayer' | 'bible' | 'page') => {
    if (kind === 'page') {
      const n = await whiteboardRef.current?.appendNotebookPage();
      if (n == null) toast.info('공책 쪽은 양식으로 만든 노트에서 늘릴 수 있습니다.', { description: '[내 노트 → 새 노트 → 줄 공책·설교 노트·회의록 …]' });
      else toast.success(`${n}쪽을 더했습니다.`);
      return;
    }
    if (kind === 'bible') {
      const v = await askText({ title: '성경 구절 카드', placeholder: '예: 롬 8:28-30, 시편 23편', confirmLabel: '넣기', hint: '본문은 카드에 직접 적거나 붙여넣습니다. [본문 보기]로 대한성서공회 성경을 엽니다.' });
      if (!v) return;
      const r = parseBibleRef(v.replace(/편/, ''));
      if (!r) { toast.error('구절을 알아보지 못했습니다.', { description: '예: 롬 8:28, 요한복음 3장 16절, 시 23' }); return; }
      whiteboardRef.current?.addBibleCard(r.ref);
      toast.success(`'${r.ref}' 카드를 넣었습니다.`, { action: { label: '본문 보기', onClick: () => openWebWindow(bibleUrl(r.code, r.chap)) }, duration: 8000 });
      return;
    }
    whiteboardRef.current?.addChecklist(kind);
    toast(kind === 'todo' ? '할 일을 적으세요. 줄마다 ☐가 붙고, ☐를 누르면 체크됩니다.' : '기도 제목을 적으세요. [내 노트 → 설교 → 기도 제목 모아 보기]에 모입니다.', { description: kind === 'todo' ? '@이름 ~11/5 를 적으면 담당·기한이 됩니다.' : undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시작할 때 마지막으로 연 수업을 이어서 연다 (공유 보드로 들어온 경우는 제외)
  useEffect(() => {
    if (boardIdRef.current) return;
    loadProject().then(p => {
      if (!p || boardIdRef.current || dirtyRef.current) return;
      applyProject(p);
      toast(`'${p.name}' 수업을 이어서 엽니다.`, {
        id: 'restore', duration: 6000,
        description: '다른 수업은 왼쪽 위 [내 노트]에서 엽니다.',
        action: { label: '내 노트', onClick: () => setLessonsOpen(true) },
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장 상태 표시 (상단 구름 아이콘)
  useEffect(() => {
    const t = setInterval(() => setSaveState(saveErrorRef.current ? 'error' : dirtyRef.current ? 'dirty' : 'saved'), 1500);
    return () => clearInterval(t);
  }, []);

  // 자동 저장 (변경이 있을 때만, 알림 없이)
  const saveRef = useRef(saveToBrowser);
  saveRef.current = saveToBrowser;
  // 새 버전으로 바꾸기 직전에 저장 (lib/appUpdate)
  useEffect(() => {
    (window as any).__okssamFlush = async () => { if (dirtyRef.current) await saveRef.current(false); };
    return () => { delete (window as any).__okssamFlush; };
  }, []);
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
      for (let i = 0; i < targets.length; i++) {
        toast.loading(`PDF를 만드는 중… (${i + 1}/${targets.length})`, { id: toastId });
        const img = await renderSceneImage(targets[i].data, canvas.width, canvas.height, backgroundColor(targets[i].background ?? canvasBackground));
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

  /** 새 슬라이드들을 지금 슬라이드 뒤에 넣는다 (지금 슬라이드가 비어 있으면 그 자리에) */
  const insertScenesAfterCurrent = useCallback((created: Scene[]) => {
    if (!created.length) return;
    const canvas = whiteboardRef.current?.getCanvas();
    captureCurrent();
    const list = [...scenesRef.current];
    const idx = list.findIndex(s => s.id === activeIdRef.current);
    const currentEmpty = (canvas?.getObjects().filter(o => !o.excludeFromExport).length ?? 1) === 0;
    const removed: string[] = [];
    if (currentEmpty) { removed.push(list[idx].id); list.splice(idx, 1, ...created); }
    else list.splice(idx + 1, 0, ...created);
    updateScenes(() => list.map((s, i) => ({ ...s, order: i })));
    setActiveSceneId(created[0].id);
    markDirty();
    publishStructure(removed);
  }, [captureCurrent, updateScenes, setActiveSceneId, publishStructure]);
  insertScenesRef.current = insertScenesAfterCurrent;

  /** 문서(PDF·한글·워드·파워포인트·엑셀·키노트 …)를 먼저 열어 쪽 수와 첫 쪽 미리보기를 보여 준다 */
  const openPdf = useCallback(async (file: File) => {
    const toastId = toast.loading('문서를 여는 중…');
    try {
      const { openDocument } = await import('./lib/docImport');
      const src = await openDocument(file, msg => toast.loading(msg, { id: toastId }));
      let preview: string | null = null;
      try { preview = await src.render(1, 240); } catch { /* 미리보기는 없어도 된다 */ }
      toast.dismiss(toastId);
      pdfDocRef.current?.destroy?.();
      pdfDocRef.current = src;
      setPendingPdf({ name: file.name, numPages: src.numPages, preview, kind: src.kind, note: src.note });
    } catch (err: any) {
      console.error(err);
      if (isStaleChunkError(err)) { toast.dismiss(toastId); void recoverFromStaleChunk(); return; }
      toast.error(err instanceof DocImportError ? err.message : '문서를 열지 못했습니다.', {
        id: toastId, duration: 9000,
        description: err?.hint || '암호가 걸려 있거나 손상된 파일일 수 있습니다. PDF로 저장해 넣으면 확실합니다.',
      });
    }
  }, []);

  const closePdf = useCallback(() => {
    setPendingPdf(null);
    pdfDocRef.current?.destroy?.();
    pdfDocRef.current = null;
  }, []);

  const processPdf = async (mode: PdfImportMode, from: number, to: number) => {
    const doc = pdfDocRef.current;
    const info = pendingPdf;
    if (!doc || !info) return;
    setPendingPdf(null);
    const count = to - from + 1;
    const toastId = toast.loading('쪽을 그림으로 바꾸는 중…');
    try {
      const pages: string[] = [];
      for (let i = from; i <= to; i++) {
        toast.loading(`${info.kind} 쪽 변환 중… (${i - from + 1}/${count})`, { id: toastId });
        pages.push(await doc.render(i, 1700));
      }
      // 고화질 확대용 원본 보관 (PDF·한글)
      const docId = doc.hd ? await saveDoc(doc.hd.data, doc.hd.kind, info.name) : null;
      const docOf = (i: number) => (docId ? { docId, docPage: from + i } : undefined);
      const baseName = info.name.replace(/\.[a-z0-9]+$/i, '');
      const range = count === 1 ? `${from}쪽` : `${from}~${to}쪽`;
      if (mode === 'grid') {
        await whiteboardRef.current?.addImages(pages, pages.map((_, i) => docOf(i) || null));
        toast.success(`${count}쪽을 지금 슬라이드에 넣었습니다.`, { id: toastId });
        return;
      }
      const canvas = whiteboardRef.current?.getCanvas();
      const w = canvas?.width || window.innerWidth;
      const h = canvas?.height || window.innerHeight;
      if (mode === 'stack') {
        const data = await createStackedPdfScene(pages, from, w, docId);
        insertScenesAfterCurrent([{ id: newId(), name: `${baseName} ${range}`.slice(0, 100), data, order: 0 }]);
        toast.success(`${count}쪽을 슬라이드 하나에 이어 붙였습니다.`, { id: toastId, description: 'PageDown(→)으로 한 쪽씩, 휠·두 손가락으로 위아래로 넘겨 보세요.' });
        return;
      }
      const created: Scene[] = [];
      for (let i = 0; i < pages.length; i++) {
        created.push({ id: newId(), name: `${baseName} ${from + i}쪽`.slice(0, 100), data: await createImageScene(pages[i], w, h, docOf(i)), order: 0 });
      }
      insertScenesAfterCurrent(created);
      toast.success(`슬라이드 ${created.length}장을 만들었습니다.`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('문서를 넣지 못했습니다.', { id: toastId, description: '쪽 수가 많으면 범위를 나누어 넣어 주세요.' });
    } finally {
      pdfDocRef.current?.destroy?.();
      pdfDocRef.current = null;
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
  // 떠 있는 창: 웹 브라우저 · 3D 모델
  // =====================================================================
  const nextRect = (w: number, h: number): WindowRect => {
    const n = windowsRef.current.length;
    const vw = window.innerWidth, vh = window.innerHeight;
    const W = Math.min(w, vw - 40), H = Math.min(h, vh - 120);
    return { x: Math.max(20, (vw - W) / 2 + n * 28 - 40), y: Math.max(70, (vh - H) / 2 + n * 28 - 30), w: W, h: H };
  };
  const openWebWindow = useCallback((url?: string, clip?: Clip) => {
    const id = newId();
    setWindows(ws => [...ws, { id, kind: 'web', title: '웹 브라우저', url, clip, rect: nextRect(900, 560), minimized: false, maximized: false, z: ++zTopRef.current }]);
  }, []);
  const openModelWindow = useCallback((modelId: string, name?: string, driveId?: string) => {
    const existing = windowsRef.current.find(w => w.kind === 'model' && w.modelId === modelId);
    if (existing) {
      setWindows(ws => ws.map(w => (w.id === existing.id ? { ...w, minimized: false, z: ++zTopRef.current } : w)));
      return;
    }
    const id = newId();
    setWindows(ws => [...ws, { id, kind: 'model', title: name?.replace(/\.glb$/i, '') || '3D 모델', modelId, driveId, rect: nextRect(640, 520), minimized: false, maximized: false, z: ++zTopRef.current }]);
  }, []);
  const updateWindow = useCallback((id: string, patch: Partial<AppWindow>) => {
    setWindows(ws => ws.map(w => (w.id === id ? { ...w, ...patch } : w)));
  }, []);
  const closeWindow = useCallback((id: string) => {
    setWindows(ws => ws.filter(w => w.id !== id));
    winElsRef.current.delete(id);
    modelCanvasRef.current.delete(id);
  }, []);
  const focusWindow = useCallback((id: string) => {
    setWindows(ws => {
      const top = Math.max(...ws.map(w => w.z));
      const me = ws.find(w => w.id === id);
      if (!me || me.z === top) return ws;
      return ws.map(w => (w.id === id ? { ...w, z: ++zTopRef.current } : w));
    });
  }, []);

  /** 녹화 화면에 떠 있는 창도 그린다 (3D는 실제 화면, 웹은 보안상 안내 상자) */
  const drawWindowsOnto = useCallback((ctx: CanvasRenderingContext2D, scale: number, offset: { x: number; y: number }) => {
    [...windowsRef.current].sort((a, b) => a.z - b.z).forEach(w => {
      const el = winElsRef.current.get(w.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (r.left - offset.x) * scale, y = (r.top - offset.y) * scale, ww = r.width * scale, hh = r.height * scale;
      const bar = 40 * scale;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(15,23,42,0.18)';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.roundRect(x, y, ww, hh, 16 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.clip();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x, y, ww, bar);
      ctx.fillStyle = '#334155';
      ctx.font = `600 ${13 * scale}px Pretendard, 'Noto Sans KR', sans-serif`;
      ctx.fillText(w.title, x + 14 * scale, y + 25 * scale);
      if (!w.minimized) {
        const mc = modelCanvasRef.current.get(w.id);
        if (mc && mc.length) {
          ctx.fillStyle = '#eef2f7';
          ctx.fillRect(x, y + bar, ww, hh - bar);
          mc.forEach(c => { const el = c as any; if ((el.width || el.videoWidth) && (el.height || el.videoHeight)) ctx.drawImage(c, x, y + bar, ww, hh - bar); });
        } else if (w.kind === 'web') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y + bar, ww, hh - bar);
          ctx.fillStyle = '#e2e8f0';
          ctx.textAlign = 'center';
          ctx.font = `600 ${18 * scale}px Pretendard, 'Noto Sans KR', sans-serif`;
          ctx.fillText('웹 화면은 브라우저 보안상 녹화에 담기지 않습니다', x + ww / 2, y + bar + (hh - bar) / 2);
        }
      }
      ctx.restore();
    });
  }, []);

  /** GLB 파일들을 자산함에 넣고, 첫 모델을 슬라이드에 카드로 넣은 뒤 3D 창으로 연다 */
  const handleModelFiles = useCallback(async (files: File[]) => {
    const toastId = toast.loading('3D 모델을 넣는 중…');
    const added = await importModelFiles(files, (d, t) => toast.loading(`3D 모델을 넣는 중… (${d}/${t})`, { id: toastId }));
    toast.dismiss(toastId);
    if (!added.length) return;
    for (const a of added.slice(0, 1)) {
      await whiteboardRef.current?.addModelCard(a);
      openModelWindow(a.id, a.name, a.driveId);
    }
    if (added.length > 1) toast.success(`나머지 ${added.length - 1}개는 3D 자산함에 넣었습니다.`);
  }, [openModelWindow]);

  /** 악보 파일(NWC·MIDI·MusicXML)을 악보 그림으로 넣는다 */
  const handleScoreFile = useCallback(async (file: File) => {
    const toastId = toast.loading('악보를 읽는 중…');
    try {
      const [{ loadScoreFile }, { renderScorePages }] = await Promise.all([import('./music/loadScore'), import('./music/renderScore')]);
      const { score, title } = await loadScoreFile(file);
      const pages = renderScorePages(score, { title });
      const data = JSON.stringify(score);
      const scoreKey = 'sc-' + newId();
      const boxesOf = (p: { boxes: unknown }) => JSON.stringify(p.boxes);
      if (pages.length === 1) {
        await whiteboardRef.current?.addScore(pages[0].svg, data, title, { scoreKey, scoreBoxes: boxesOf(pages[0]) });
        toast.success('악보를 넣었습니다.', { id: toastId, description: '악보를 선택하면 아래에 연주 막대가 나타납니다.' });
      } else {
        // 긴 악보는 페이지마다 슬라이드 한 장 (PDF와 같은 방식)
        const canvas = whiteboardRef.current?.getCanvas();
        const w = canvas?.width || window.innerWidth;
        const h = canvas?.height || window.innerHeight;
        const created: Scene[] = [];
        for (let i = 0; i < pages.length; i++) {
          created.push({ id: newId(), name: `${title} ${i + 1}쪽`.slice(0, 100), data: await createScoreScene(pages[i].svg, data, title, w, h, { scoreKey, scoreBoxes: boxesOf(pages[i]) }), order: 0 });
        }
        insertScenesAfterCurrent(created);
        toast.success(`악보를 슬라이드 ${pages.length}장에 나눠 넣었습니다.`, { id: toastId, description: '악보를 선택하면 아래에 연주 막대가 나타납니다. 펜으로 바로 판서할 수 있습니다.' });
      }
      score.warnings?.slice(0, 2).forEach(w => toast.info(w));
    } catch (err: any) {
      console.error(err);
      toast.error('악보를 읽지 못했습니다.', { id: toastId, description: err?.message || 'NWC, NWCTXT, MIDI, MusicXML 파일인지 확인해 주세요.' });
    }
  }, []);

  const routeFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    const isScoreFileName = (n: string) => /\.(nwc|nwctxt|mid|midi|musicxml|mxl|xml)$/i.test(n);
    if (isDocumentFile(file)) {
      openPdf(file);
    } else if (name.endsWith('.glb')) {
      handleModelFiles([file]);
    } else if (isScoreFileName(name) && !file.type.startsWith('image/')) {
      handleScoreFile(file);
    } else {
      whiteboardRef.current?.addFile(file);
    }
  }, [handleModelFiles, handleScoreFile, openPdf]);

  // 파일을 화면에 끌어다 놓아도 넣을 수 있게
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      if ((e.target as HTMLElement)?.closest?.('[role="dialog"]')) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const glbs = files.filter(f => /\.glb$/i.test(f.name));
      if (glbs.length > 1) handleModelFiles(glbs);
      files.filter(f => !(glbs.length > 1 && /\.glb$/i.test(f.name))).forEach(f => routeFile(f));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [routeFile, handleModelFiles]);

  // =====================================================================
  // 악보 연주 · 따라가기
  // =====================================================================
  const [activeScore, setActiveScore] = useState<{ key: string; data: string; title?: string } | null>(null);
  const [scoreFollow, setScoreFollow] = useState(true);
  const scoreFollowRef = useRef(scoreFollow);
  scoreFollowRef.current = scoreFollow;
  const scoreNavRef = useRef<{ key: string; timeline: { t: number; m: number }[]; sceneOf: Map<number, string>; lastM: number; lastJump: number } | null>(null);

  // 악보를 선택하면 연주 막대를 띄운다 (다른 것을 선택해도 연주 막대는 남는다)
  useEffect(() => {
    if (mediaSelection.type !== 'score' || !mediaSelection.scoreData) return;
    const key = mediaSelection.scoreKey || mediaSelection.objectId || 'score';
    setActiveScore(prev => (prev?.key === key ? prev : { key, data: mediaSelection.scoreData!, title: mediaSelection.name }));
  }, [mediaSelection]);

  // 악보가 바뀌면 마디 시간표와 '마디 → 슬라이드' 지도를 만든다
  useEffect(() => {
    if (!activeScore) { scoreNavRef.current = null; return; }
    let cancelled = false;
    (async () => {
      const { measureTimeline } = await import('./music/renderScore');
      let timeline: { t: number; m: number }[] = [];
      try { timeline = measureTimeline(JSON.parse(activeScore.data)); } catch { /* 무시 */ }
      const sceneOf = new Map<number, string>();
      for (const sc of scenesRef.current) {
        if (!sc.data || !sc.data.includes(activeScore.key)) continue;
        try {
          const objs: any[] = JSON.parse(sc.data).objects || [];
          objs.forEach(o => {
            if (!o?.isScore || (o.scoreKey || o.id) !== activeScore.key || !o.scoreBoxes) return;
            (JSON.parse(o.scoreBoxes) as { m: number }[]).forEach(b => { if (!sceneOf.has(b.m)) sceneOf.set(b.m, sc.id); });
          });
        } catch { /* 무시 */ }
      }
      if (!cancelled) scoreNavRef.current = { key: activeScore.key, timeline, sceneOf, lastM: -1, lastJump: 0 };
    })();
    return () => { cancelled = true; };
  }, [activeScore]);

  const handleScorePosition = useCallback((sec: number | null) => {
    const nav = scoreNavRef.current;
    const wb = whiteboardRef.current;
    if (!nav || !wb) return;
    if (sec == null || !scoreFollowRef.current) { wb.highlightScore(null, -1); nav.lastM = -1; return; }
    const m = measureAtSec(nav.timeline, sec);
    nav.lastM = m;
    if (wb.highlightScore(nav.key, m)) return;
    // 이 슬라이드에 없는 마디: 그 마디가 있는 슬라이드로 넘긴다 (불러오는 동안 한 번만)
    const target = nav.sceneOf.get(m);
    const now = Date.now();
    if (target && target !== activeIdRef.current && now - nav.lastJump > 700) {
      nav.lastJump = now;
      goToScene(target);
    }
  }, [goToScene]);

  const closeScore = useCallback(() => {
    whiteboardRef.current?.highlightScore(null, -1);
    setActiveScore(null);
  }, []);

  // =====================================================================
  // 학생 화면 보내기 (읽기 전용)
  // =====================================================================
  const [castOpen, setCastOpen] = useState(false);
  const [cast, setCast] = useState<{ status: 'idle' | 'connecting' | 'live' | 'error'; code: string | null; url: string | null; count: number }>({ status: 'idle', code: null, url: null, count: 0 });
  const casterRef = useRef<StudentCaster | null>(null);
  const [castStudents, setCastStudents] = useState<StudentState[]>([]);
  const [castPoll, setCastPoll] = useState<Poll | null>(null);
  const castSentRef = useRef<{ id: string; data: string | null; bg: string } | null>(null);
  const castViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const castLaserAt = useRef(0);

  const currentView = useCallback((): CastView => {
    const c = whiteboardRef.current?.getCanvas();
    if (!c) return { x: 0, y: 0, w: 1280, h: 720 };
    const v = c.viewportTransform || [1, 0, 0, 1, 0, 0];
    return { x: -v[4] / v[0], y: -v[5] / v[3], w: c.width / v[0], h: c.height / v[3] };
  }, []);

  const pushCastScene = useCallback((force = false) => {
    const caster = casterRef.current;
    if (!caster) return;
    const list = scenesRef.current;
    const idx = list.findIndex(s => s.id === activeIdRef.current);
    const sc = list[idx];
    if (!sc) return;
    const bg = canvasBgRef.current;
    const prev = castSentRef.current;
    if (!force && prev && prev.id === sc.id && prev.data === sc.data && prev.bg === bg) return;
    castSentRef.current = { id: sc.id, data: sc.data, bg };
    const c = whiteboardRef.current?.getCanvas();
    caster.send({ type: 'scene', sceneId: sc.id, index: idx, total: list.length, name: sc.name, data: sc.data, bg, origin: coordOrigin(c ?? { width: 0, height: 0 }), view: currentView(), lesson: projectNameRef.current, allowSave: castAllowSaveRef.current });
  }, [currentView]);

  const [castAllowSave, setCastAllowSave] = useState(() => { try { return localStorage.getItem('okssam_cast_allow_save') !== '0'; } catch { return true; } });
  const castAllowSaveRef = useRef(castAllowSave);
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;

  const startCast = useCallback(() => {
    casterRef.current?.stop();
    const code = makeCastCode();
    const caster = new StudentCaster(code);
    caster.onStatus = st => setCast(c => ({ ...c, status: st === 'live' ? 'live' : st }));
    caster.onCount = n => setCast(c => ({ ...c, count: n }));
    caster.onStudents = list => {
      setCastStudents(prev => {
        // 새로 손든 학생이 있으면 알려 준다
        const before = new Set(prev.filter(s => s.hand).map(s => s.sid));
        list.filter(s => s.hand && !before.has(s.sid)).forEach(s => toast(`✋ ${s.name} 학생이 손을 들었습니다.`, { duration: 2500 }));
        return list;
      });
    };
    setCastStudents([]);
    setCastPoll(null);
    casterRef.current = caster;
    castSentRef.current = null;
    setCast({ status: 'connecting', code, url: castUrl(code), count: 0 });
    caster.start();
    captureCurrent();
    pushCastScene(true);
  }, [captureCurrent, pushCastScene]);

  const stopCast = useCallback(() => {
    casterRef.current?.stop();
    casterRef.current = null;
    setCast({ status: 'idle', code: null, url: null, count: 0 });
    setCastStudents([]);
    setCastPoll(null);
    toast.success('학생 화면 보내기를 끝냈습니다.', { duration: 1500 });
  }, []);

  // 보내는 동안: 슬라이드·판서가 바뀌면 보낸다
  useEffect(() => {
    if (cast.status === 'idle') return;
    const t = setInterval(() => pushCastScene(), 600);
    return () => clearInterval(t);
  }, [cast.status, pushCastScene]);
  useEffect(() => () => casterRef.current?.stop(), []);

  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const pageInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleViewChange = useCallback(() => {
    if (!pageInfoTimer.current) {
      pageInfoTimer.current = setTimeout(() => {
        pageInfoTimer.current = null;
        const info = whiteboardRef.current?.getPageInfo() ?? null;
        setPageInfo(prev => (prev && info && prev.index === info.index && prev.total === info.total && prev.pageNo === info.pageNo ? prev : info));
      }, 150);
    }
    if (!casterRef.current || castViewTimer.current) return;
    castViewTimer.current = setTimeout(() => {
      castViewTimer.current = null;
      casterRef.current?.send({ type: 'view', view: currentView() });
    }, 200);
  }, [currentView]);

  // 슬라이드를 바꾸면 쪽 표시를 다시 잰다 (화면 위치가 같아 바뀜 알림이 없을 수 있음)
  useEffect(() => {
    const t1 = setTimeout(handleViewChange, 300);
    const t2 = setTimeout(handleViewChange, 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeSceneId, sceneRevision, handleViewChange]);

  const handleLaser = useCallback((x: number, y: number) => {
    if (!casterRef.current) return;
    const now = Date.now();
    if (now - castLaserAt.current < 50) return;
    castLaserAt.current = now;
    casterRef.current.send({ type: 'laser', x, y });
  }, []);

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
  const sceneLabelRef = useRef<(id: string) => string>(() => '');
  const sceneLabel = useCallback((id: string) => {
    const i = scenesRef.current.findIndex(s => s.id === id);
    const s = scenesRef.current[i];
    return s ? `${i + 1}. ${s.name}` : '슬라이드';
  }, []);
  sceneLabelRef.current = sceneLabel;

  const startRecording = useCallback(async (opts: { mic: boolean; camera: boolean }) => {
    const wb = whiteboardRef.current;
    const container = wb?.getContainer();
    if (!wb || !container) return;
    setRecStarting(true);
    const rec = new LessonRecorder({
      container,
      getLayers: () => whiteboardRef.current?.getRecordLayers() ?? [],
      getBackground: () => ({
        kind: canvasBgRef.current,
        vpt: (whiteboardRef.current?.getCanvas()?.viewportTransform as number[]) || [1, 0, 0, 1, 0, 0],
        origin: coordOrigin(whiteboardRef.current?.getCanvas() ?? { width: 0, height: 0 }),
      }),
      drawOverlays: (ctx, w, h, scale) => {
        const cr = whiteboardRef.current?.getContainer()?.getBoundingClientRect();
        const off = { x: cr?.left ?? 0, y: cr?.top ?? 0 };
        drawWindowsOnto(ctx, scale, off);
        drawOverlaysOnto(ctx, overlayStateRef.current, w, h, scale, off);
      },
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
  }, [sceneLabel, drawWindowsOnto]);

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

  /** 배경 바꾸기: 이 슬라이드만 또는 모든 슬라이드 */
  const handleCanvasBackgroundChange = useCallback((bg: CanvasBackground, scope: 'slide' | 'all' = 'all') => {
    if (scope === 'all') {
      setCanvasBackground(bg);
      updateScenes(list => list.map(s => (s.background ? { ...s, background: undefined } : s)));
    } else {
      updateScenes(list => list.map(s => (s.id === activeIdRef.current ? { ...s, background: bg } : s)));
    }
    markDirty();
    const dark = isDarkBackground(bg);
    setColor(prev => (dark && prev === '#000000' ? '#ffffff' : !dark && prev === '#ffffff' ? '#000000' : prev));
  }, [updateScenes]);

  const activeScene = scenes.find(s => s.id === activeSceneId);
  const effectiveBg: CanvasBackground = activeScene?.background ?? canvasBackground;
  canvasBgRef.current = effectiveBg;

  return (
    <div className={cn('fixed inset-0 overflow-hidden font-sans text-slate-900', isPresenting ? 'bg-white' : 'bg-[#eef1f6]')}>
      <Toaster position="top-center" offset={84} richColors closeButton />

      {!isPresenting && (
      <TopNavBar
        studentMode={studentMode}
        isPhone={isPhone}
        projectName={projectName}
        onRenameProject={name => { setProjectName(name); markDirty(); }}
        onSave={() => { void saveToBrowser(!driveOnRef.current); if (driveOnRef.current) void saveToDrive({ manual: true }); }}
        onLoad={handleLoadFromBrowser}
        onOpenHistory={() => { setHistoryLesson(lessonRef.current.lessonId); setHistoryOpen(true); }}
        onExportFile={handleExportFile}
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
        saveState={saveState}
        background={effectiveBg}
        onBackgroundChange={handleCanvasBackgroundChange}
        onOpenStudentCast={() => setCastOpen(true)}
        castOn={cast.status !== 'idle'}
        castCount={cast.count}
        driveState={driveState}
        onOpenLessons={() => setLessonsOpen(true)}
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

      <div
        className={cn(
          'absolute z-0 overflow-hidden transition-[inset,border-radius] duration-300',
          isPresenting ? 'inset-0' : isPhone ? 'top-[60px] left-1 right-1 bottom-[114px] rounded-xl ring-1 ring-slate-900/[0.06] bg-white' : cn('top-[80px] right-4 rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_2px_20px_-8px_rgba(15,23,42,0.18)] bg-white', isVertical ? 'left-[88px] lg:left-[160px] bottom-[100px]' : 'left-4 bottom-[160px]'),
        )}
      >
        <Whiteboard
          ref={whiteboardRef}
          tool={activeTool}
          color={color}
          brushSize={brushSize}
          canvasBackground={effectiveBg}
          sceneId={activeSceneId}
          sceneData={activeScene?.data ?? null}
          sceneRevision={sceneRevision}
          onCanvasChange={handleCanvasChange}
          onViewChange={handleViewChange}
          onClip={url => setClipImage(url)}
          onFlashCardAdded={() => toast.success('가림 카드를 만들었습니다.', { id: 'flash-added', description: '아무 도구로나 카드를 누르면 뒤집힙니다. 다 만들면 [공부·복습 → 플래시카드 복습]', duration: 3000 })}
          onMagnifyDone={() => { setActiveTool('pen'); toast.success('확대 사본을 옆에 놓았습니다.', { description: '펜으로 바로 판서할 수 있습니다. 선택 도구로 크기·위치를 바꿀 수 있습니다.', duration: 2500 }); }}
          onLaser={handleLaser}
          onSelectionChange={setMediaSelection}
          onZoomChange={setZoomLevel}
          onColorPicked={handleColorPicked}
          onDrawingStateChange={handleDrawingStateChange}
          onRequestTool={setActiveTool}
          onPointerMove={handlePointerMove}
          onOpenObject={sel => {
            if (sel.type === 'model' && sel.modelId) openModelWindow(sel.modelId, sel.name, sel.driveId);
            else if (sel.type === 'weblink' && sel.url) openWebWindow(sel.url, sel.clipStart != null || sel.clipEnd != null ? { start: sel.clipStart, end: sel.clipEnd } : undefined);
          }}
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
        onAddFile={file => { routeFile(file); }}
        onOpenWebWindow={() => openWebWindow()}
        onOpenAssets={() => setAssetsOpen(true)}
        onAddWebLink={url => whiteboardRef.current?.addWebLink(url)}
        onUndo={() => whiteboardRef.current?.undo()}
        onRedo={() => whiteboardRef.current?.redo()}
        onCopy={() => whiteboardRef.current?.copy()}
        onPaste={() => whiteboardRef.current?.paste()}
        onCut={() => whiteboardRef.current?.cut()}
        onStartReview={() => { void startReview(); }}
        onNoteTool={k => { void handleNoteTool(k); }}
        onOpenStudy={() => setStudyOpen(true)}
        studentMode={studentMode}
        isPhone={isPhone}
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

      {cast.status !== 'idle' && (
        <StudentResponsePanel
          students={castStudents}
          connected={cast.count}
          poll={castPoll}
          onPoll={p => { setCastPoll(p); casterRef.current?.setPoll(p); }}
          onLower={sid => casterRef.current?.lowerHands(sid)}
          className={isPresenting ? 'top-4 right-4' : 'top-[156px] right-6'}
        />
      )}
      {pageInfo && (
        <PageIndicator
          info={pageInfo}
          onStep={dir => { whiteboardRef.current?.stepPage(dir); }}
          onGo={n => !!whiteboardRef.current?.goToPageNo(n)}
          onAddPage={pageInfo.notebook ? () => { void handleNoteTool('page'); } : undefined}
          className={isPresenting ? 'top-4 left-4' : isPhone ? 'top-[68px] left-3' : isVertical ? 'top-[92px] left-[100px] lg:left-[172px]' : 'top-[92px] left-7'}
        />
      )}
      {activeScore && (
        <ScoreDock
          scoreData={activeScore.data}
          scoreKey={activeScore.key}
          title={activeScore.title}
          follow={scoreFollow}
          onToggleFollow={() => setScoreFollow(f => !f)}
          onPosition={handleScorePosition}
          onClose={closeScore}
          presenting={isPresenting}
        />
      )}
      <MediaController
        selection={mediaSelection.type === 'score' ? { type: 'none' } : mediaSelection}
        onClose={() => setMediaSelection({ type: 'none' })}
        onOpenWeb={(url, clip) => openWebWindow(url, clip)}
        onOpenModel={(id, name, driveId) => openModelWindow(id, name, driveId)}
      />

      {windows.map(w => (
        <FloatingWindow
          key={w.id}
          id={w.id}
          title={w.title}
          icon={w.kind === 'web' ? <Globe size={15} /> : <Box size={15} />}
          rect={w.rect}
          minimized={w.minimized}
          maximized={w.maximized}
          zIndex={w.z}
          onChange={rect => updateWindow(w.id, { rect })}
          onFocus={() => focusWindow(w.id)}
          onClose={() => closeWindow(w.id)}
          onToggleMinimize={() => updateWindow(w.id, { minimized: !w.minimized })}
          onToggleMaximize={() => updateWindow(w.id, { maximized: !w.maximized, minimized: false })}
          registerEl={el => { if (el) winElsRef.current.set(w.id, el); else winElsRef.current.delete(w.id); }}
        >
          {w.kind === 'web' ? (
            <WebBrowserPane
              initialUrl={w.url}
              initialClip={w.clip}
              registerVideo={v => { if (v) modelCanvasRef.current.set(w.id, [v]); else modelCanvasRef.current.delete(w.id); }}
              onTitle={t => updateWindow(w.id, { title: t })}
              onPinToCanvas={(url, clip) => { whiteboardRef.current?.addWebLink(url, clip); toast.success(clip ? '캔버스에 유튜브 구간 카드를 넣었습니다.' : '캔버스에 링크 카드를 넣었습니다.', { description: '카드를 두 번 누르면 수업 화면에서 바로 열립니다.' }); }}
            />
          ) : (
            <ModelViewerPane
              modelId={w.modelId!}
              driveId={w.driveId}
              modelName={w.title}
              onTitle={t => updateWindow(w.id, { title: t })}
              onSnapshot={url => { whiteboardRef.current?.addImageDataUrl(url); toast.success('지금 모습을 캔버스에 넣었습니다.'); }}
              registerCanvas={c => { if (c) modelCanvasRef.current.set(w.id, c); else modelCanvasRef.current.delete(w.id); }}
            />
          )}
        </FloatingWindow>
      ))}

      <AssetLibrary
        isOpen={assetsOpen}
        onClose={() => setAssetsOpen(false)}
        onInsert={async a => { setAssetsOpen(false); await whiteboardRef.current?.addModelCard(a); openModelWindow(a.id, a.name, a.driveId); }}
      />

      {!isPresenting && (
      <BottomNavBar
        isPhone={isPhone}
        zoomLevel={zoomLevel}
        onResetZoom={() => whiteboardRef.current?.resetZoom()}
        onZoomIn={() => whiteboardRef.current?.zoomIn()}
        onZoomOut={() => whiteboardRef.current?.zoomOut()}
        slides={scenes}
        activeSlideId={activeSceneId}
        onSelectSlide={goToScene}
        onNextSlide={handleNextSlide}
        onPrevSlide={handlePrevSlide}
        onAddSlide={addScene}
        onOpenSlideNavigator={() => { captureCurrent(); setIsSlideNavigatorOpen(true); }}
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
          onPrev={handlePrevStep}
          onNext={handleNextStep}
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
        canvasBackground={effectiveBg}
        onCanvasBackgroundChange={handleCanvasBackgroundChange}
        isVertical={isVertical}
        onToggleOrientation={() => setIsVertical(v => !v)}
        studentMode={studentMode}
        onStudentMode={on => { setStudentMode(on); saveStudentMode(on); toast.success(on ? '학생 모드를 켰습니다.' : '학생 모드를 껐습니다.', on ? { description: '왼쪽 [공부 도구]에서 오답 모으기·가림 카드·복습·공부 기록을 씁니다.' } : undefined); }}
      />
      <ClipSaveModal image={clipImage} source={`${projectName} · ${sceneLabel(activeSceneId)}`} onClose={() => setClipImage(null)} onSave={saveClip} />
      <StudyLogModal isOpen={studyOpen} onClose={() => setStudyOpen(false)} focus={focus} onStartFocus={startFocus} />
      {focus && <FocusChip focus={focus} onPause={togglePauseFocus} onStop={() => { setFocus(null); toast('집중 타이머를 끝냈습니다.'); }} />}
      <FlashReviewBar
        card={review && !review.done ? { index: review.i + 1, total: review.queue.length, slide: sceneLabel(review.queue[review.i].sceneId), revealed: review.revealed, box: review.queue[review.i].box } : null}
        done={review?.done ? { known: review.known, again: review.again } : null}
        onReveal={revealCard}
        onKnown={() => gradeCard(true)}
        onAgain={() => gradeCard(false)}
        onClose={() => setReview(null)}
      />

      <PromptHost />
      <LessonHistoryModal isOpen={historyOpen} lessonId={historyLesson} onClose={() => setHistoryOpen(false)} onRestore={handleRestoreHistory} />
      <LessonDashboard
        isOpen={lessonsOpen}
        onClose={() => setLessonsOpen(false)}
        currentLessonId={lessonRef.current.lessonId}
        onCurrentRenamed={name => { setProjectName(name); markDirty(); }}
        onCurrentCategory={c => { lessonRef.current.category = c; markDirty(); }}
        onCurrentSpace={sp => { lessonRef.current.space = sp; markDirty(); }}
        defaultSpace={studentMode ? 'student' : undefined}
        onOpenWrongNote={() => { void openLocalLesson(WRONG_NOTE_ID).then(() => { if (lessonRef.current.lessonId !== WRONG_NOTE_ID) toast.info('아직 오답 노트가 없습니다.', { description: '[공부·복습 → 오답 모으기]로 문제를 모으면 생깁니다.' }); }); }}
        onExport={(id, f) => { void exportById(id, f); }}
        onLock={lockById}
        onUnlock={unlockById}
        listChecks={listChecks}
        toggleCheck={toggleCheck}
        saveCurrent={async () => { if (dirtyRef.current) await saveRef.current(false); }}
        onOpen={id => { void openLocalLesson(id); }}
        onNew={o => { void newLesson(o); }}
        onImportFile={() => projectFileInputRef.current?.click()}
        onShowHistory={id => { setHistoryLesson(id); setHistoryOpen(true); }}
        onCurrentTrashed={() => { dirtyRef.current = false; void newLesson({ skipSave: true }); }}
        drive={{ on: driveOn, state: driveState, enable: enableDrive, disable: disableDrive, list: listDriveLessons, open: l => { void openDriveLesson(l); } }}
      />
      <StudentCastModal
        isOpen={castOpen}
        onClose={() => setCastOpen(false)}
        live={cast.status !== 'idle'}
        status={cast.status}
        code={cast.code}
        url={cast.url}
        count={cast.count}
        onStart={startCast}
        onStop={stopCast}
        allowSave={castAllowSave}
        onAllowSave={v => { setCastAllowSave(v); castAllowSaveRef.current = v; try { localStorage.setItem('okssam_cast_allow_save', v ? '1' : '0'); } catch { /* 무시 */ } castSentRef.current = null; }}
      />
      <PdfImportModal
        isOpen={!!pendingPdf}
        onClose={closePdf}
        onImport={processPdf}
        fileName={pendingPdf?.name}
        numPages={pendingPdf?.numPages ?? 1}
        preview={pendingPdf?.preview}
        kind={pendingPdf?.kind}
        note={pendingPdf?.note}
      />

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}
