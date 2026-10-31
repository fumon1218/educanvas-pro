import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { cn } from '@/src/lib/utils';
import {
  serializeCanvas,
  loadCanvasData,
  newId,
  videoRegistry,
  attachVideoRenderLoop,
  downscaleImageFile,
  fileToDataURL,
} from '@/src/lib/canvasData';
import { toast } from 'sonner';
import { PressureBrush, getPenSettings, notePointer, deviceHasPen, rememberPen } from '@/src/lib/pen';
import { appendPaper, makeChecklist } from '@/src/lib/templates';

export type ToolType =
  | 'pen' | 'eraser' | 'laser' | 'select' | 'lasso' | 'pencil' | 'fountain' | 'ballpoint'
  | 'dashed' | 'bucket' | 'highlighter' | 'pan' | 'eyedropper' | 'magnify' | 'clip' | 'flashcard';

import { drawBackground, isDarkBackground, backgroundColor, type CanvasBackground } from '@/src/lib/backgrounds';
export type { CanvasBackground } from '@/src/lib/backgrounds';

export type MediaSelection = {
  type: 'video' | 'audio' | 'weblink' | 'model' | 'score' | 'none';
  element?: any;
  url?: string;
  modelId?: string;
  name?: string;
  scoreData?: string;
  scoreKey?: string;
  objectId?: string;
  /** 웹 링크 카드의 재생 구간 (초) */
  clipStart?: number;
  clipEnd?: number;
  driveId?: string;
};

export interface CanvasChangeInfo {
  sceneId: string;
  canvas: fabric.Canvas;
  data: string;
  fromLoad: boolean;
}

export interface RemoteCursor {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

interface WhiteboardProps {
  tool: ToolType;
  color: string;
  brushSize: number;
  canvasBackground?: CanvasBackground;
  sceneId: string;
  sceneData: string | null;
  /** 같은 슬라이드라도 외부(협업·불러오기)에서 내용이 바뀌면 증가시켜 다시 불러온다 */
  sceneRevision: number;
  onCanvasChange?: (info: CanvasChangeInfo) => void;
  onSelectionChange?: (selection: MediaSelection) => void;
  onZoomChange?: (zoom: number) => void;
  /** 레이저 포인터 위치 (판서 좌표) — 학생 화면으로 보낼 때 */
  onLaser?: (x: number, y: number) => void;
  /** 화면을 옮기거나 확대했을 때 */
  onViewChange?: () => void;
  /** 확대 사본을 만든 뒤 (펜으로 바꾸기 등) */
  onMagnifyDone?: () => void;
  /** 오답 모으기: 끌어 감싼 영역 그림 */
  onClip?: (dataUrl: string) => void;
  /** 가림 카드를 하나 만들었을 때 */
  onFlashCardAdded?: () => void;
  onColorPicked?: (color: string) => void;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  onRequestTool?: (tool: ToolType) => void;
  onPointerMove?: (x: number, y: number) => void;
  onResize?: () => void;
  /** 3D 카드·웹 카드를 두 번 눌렀을 때 */
  onOpenObject?: (sel: MediaSelection) => void;
  /** 슬라이드를 열 때 내용이 화면에 꽉 차도록 맞춤 (발표 모드) */
  autoFit?: boolean;
  cursors?: RemoteCursor[];
}

export interface WhiteboardHandle {
  addText: (text?: string, options?: { width?: number }) => void;
  addFile: (file: File) => Promise<void>;
  addImages: (dataUrls: string[], docs?: ({ docId: string; docPage: number } | null)[]) => Promise<void>;
  addWebLink: (url: string, clip?: { start?: number; end?: number }) => void;
  addShape: (type: 'rect' | 'circle' | 'ellipse' | 'triangle' | 'polygon' | 'line' | 'arrow') => void;
  /** ink: 잠긴 객체·PDF 배경은 남기고 판서만 지움 / all: 모두 지움 */
  clear: (mode?: 'ink' | 'all') => void;
  hasLockedContent: () => boolean;
  fitToContent: () => void;
  /** 한 슬라이드에 이어 붙인 PDF 쪽을 넘긴다. 더 넘길 쪽이 없으면 false */
  stepPage: (dir: 1 | -1) => boolean;
  /** 이어 붙인 PDF 쪽 정보 (없으면 null) */
  /** 양식 칸에 적은 글 (예: 설교 노트 'passage' = 본문) */
  getFieldText: (key: string) => string;
  getPageInfo: () => { index: number; total: number; pageNo: number; first: number; last: number; notebook?: boolean } | null;
  /** PDF 쪽 번호로 이동 */
  goToPageNo: (n: number) => boolean;
  /** 이 슬라이드의 가림 카드들 */
  getFlashCards: () => { id: string; box: number; due: number }[];
  /** 객체 하나를 화면 가득 보여 주기 */
  focusObject: (id: string) => boolean;
  /** 가림 카드 덮기/열기, 복습 단계 바꾸기 */
  setFlash: (id: string, patch: { revealed?: boolean; box?: number; due?: number }) => void;
  /** 공책(양식) 슬라이드에 쪽 하나 더하기. 공책이 아니면 null */
  appendNotebookPage: () => Promise<number | null>;
  /** 화면 가운데에 할 일·기도 제목 목록 넣기 */
  addChecklist: (kind: 'todo' | 'prayer') => void;
  /** 성경 구절 카드 넣기 */
  /** 성경 구절 카드: image가 있으면 읽는 법을 단 그림 카드(두 번 누르면 text로 바뀜), 없으면 글 상자 */
  addBibleCard: (card: { ref: string; text: string; bg?: string; image?: { url: string; w: number; h: number } }) => Promise<void>;
  /** 체크 목록의 한 줄 체크/해제 */
  setChecklistLine: (objId: string, line: number, checked: boolean) => boolean;
  getLaserCanvas: () => HTMLCanvasElement | null;
  /** 녹화용: [판서 캔버스, 그리는 중인 선 캔버스, 레이저 캔버스] */
  getRecordLayers: () => (HTMLCanvasElement | null)[];
  getContainer: () => HTMLDivElement | null;
  addModelCard: (asset: { id: string; name: string; thumb?: string; driveId?: string }) => Promise<void>;
  addScore: (svg: string, scoreData: string, title: string, extra?: { scoreKey?: string; scoreBoxes?: string }) => Promise<void>;
  /** 연주 중인 마디를 표시한다. 이 슬라이드에 그 마디가 없으면 false. key가 null이면 표시를 지운다 */
  highlightScore: (key: string | null, measure: number) => boolean;
  addImageDataUrl: (dataUrl: string) => Promise<void>;
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
  getCanvas: () => fabric.Canvas | null;
  getThumbnail: () => string | undefined;
  copy: () => void;
  paste: () => void;
  cut: () => void;
  deleteSelected: () => void;
  group: () => void;
  ungroup: () => void;
}

const DRAWING_TOOLS: ToolType[] = ['pen', 'pencil', 'fountain', 'ballpoint', 'dashed', 'highlighter', 'lasso'];
/** 애플 펜슬 필압을 쓰는 도구 (형광펜·점선·올가미는 일정한 굵기) */
const PRESSURE_TOOLS: ToolType[] = ['pen', 'pencil', 'fountain', 'ballpoint'];
const ERASABLE_TYPES = new Set(['path', 'i-text', 'text', 'textbox', 'rect', 'circle', 'ellipse', 'triangle', 'polygon', 'polyline', 'line']);
const SHAPE_TYPES = new Set(['rect', 'circle', 'ellipse', 'triangle', 'polygon']);
const TEXT_TYPES = new Set(['i-text', 'text', 'textbox']);
const HISTORY_LIMIT = 50;
const KOREAN_FONT = "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

/** 성경 구절 글 상자: 첫 줄(구절·번역본)과 [번역본] 줄은 작게 */
const BIBLE_BG: Record<string, string> = { yellow: '#fef3c7', white: '#ffffff', none: '' };
function makeBibleTextbox(text: string, left: number, top: number, width: number, bg = 'yellow') {
  const styles: Record<number, Record<number, any>> = {};
  text.split('\n').forEach((line, i) => {
    const head = i === 0, label = /^\[[^\]]+\]$/.test(line);
    if (!head && !label) return;
    styles[i] = Object.fromEntries(Array.from({ length: line.length }, (_, k) => [k, { fontWeight: 'bold', fill: head ? '#92400e' : '#b45309', fontSize: head ? 15 : 12 }]));
  });
  return new fabric.Textbox(text, {
    left, top, width, originX: 'left', originY: 'top', fontSize: 22, lineHeight: 1.4,
    fill: '#1e293b', fontFamily: KOREAN_FONT + ", 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic'", backgroundColor: BIBLE_BG[bg] ?? BIBLE_BG.yellow, padding: 14,
    styles: styles as any,
  });
}

let globalClipboard: fabric.FabricObject | null = null;

/** 경로(path)의 꼭짓점을 화면(scene) 좌표로 변환 */
function getPathScenePoints(path: fabric.Path): fabric.Point[] {
  const m = path.calcTransformMatrix();
  const off = path.pathOffset;
  const pts: fabric.Point[] = [];
  for (const cmd of path.path as any[]) {
    const n = cmd.length;
    if (n >= 3) {
      const x = cmd[n - 2], y = cmd[n - 1];
      if (typeof x === 'number' && typeof y === 'number') {
        pts.push(fabric.util.transformPoint(new fabric.Point(x - off.x, y - off.y), m));
      }
    }
  }
  return pts;
}

function pointInPolygon(p: fabric.Point, poly: fabric.Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(p: fabric.Point, a: fabric.Point, b: fabric.Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx, y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}


function selectionOf(target: any): MediaSelection {
  if (!target) return { type: 'none' };
  if (target.isVideo) return { type: 'video', element: target.getElement() };
  if (target.isAudio) return { type: 'audio', url: target.audioUrl };
  if (target.isWebLink) return { type: 'weblink', url: target.url, clipStart: target.clipStart, clipEnd: target.clipEnd };
  if (target.isModel) return { type: 'model', modelId: target.modelId, name: target.modelName, driveId: target.driveId };
  if (target.isScore) return { type: 'score', scoreData: target.scoreData, name: target.scoreTitle, objectId: target.id, scoreKey: target.scoreKey || target.id };
  return { type: 'none' };
}

function isLocked(obj: fabric.FabricObject) {
  return !!(obj as any).locked;
}

/** 좌표평면의 원점: 처음 화면(100%)의 가운데 */
export const coordOrigin = (canvas: { width: number; height: number }) => ({ x: Math.round(canvas.width / 2 / 40) * 40, y: Math.round(canvas.height / 2 / 40) * 40 });

function isHelper(obj: fabric.FabricObject | undefined) {
  return !!obj && !!obj.excludeFromExport;
}

export const Whiteboard = React.memo(React.forwardRef<WhiteboardHandle, WhiteboardProps>((props, ref) => {
  const { tool, color, brushSize, canvasBackground = 'blank', sceneId, sceneData, sceneRevision, cursors } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 최신 props를 이벤트 핸들러에서 안전하게 쓰기 위한 ref (오래된 값 참조 방지)
  const propsRef = useRef(props);
  propsRef.current = props;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const colorRef = useRef(color);
  colorRef.current = color;
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const backgroundRef = useRef(canvasBackground);
  backgroundRef.current = canvasBackground;

  const currentSceneIdRef = useRef<string>(sceneId);
  const isLoadingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const isDrawingRef = useRef(false);
  const loadTokenRef = useRef(0);

  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const pendingHistoryRef = useRef(false);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const laserPointsRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const laserAnimRef = useRef<number | null>(null);
  const eraserCursorRef = useRef<fabric.Circle | null>(null);
  const isErasingRef = useRef(false);
  const erasedRef = useRef(false);

  /** 선택 도구로 바뀐 직후 선택할 객체들 (도구 전환과 선택 사이의 순서 문제 방지) */
  const pendingSelectRef = useRef<fabric.FabricObject[] | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [isGroupSelected, setIsGroupSelected] = useState(false);
  const [canGroup, setCanGroup] = useState(false);
  const [, forceRender] = useState(0);

  const getCanvas = useCallback(() => fabricRef.current, []);

  // ---------- 배경 (수업 템플릿 무늬) ----------
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const scoreHlRef = useRef<fabric.Rect | null>(null);
  const bgKeyRef = useRef('');
  const paintBackground = useCallback(() => {
    const el = bgCanvasRef.current, canvas = fabricRef.current, box = containerRef.current;
    if (!el || !canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.getWidth() || box.clientWidth, h = canvas.getHeight() || box.clientHeight; // 매번 레이아웃을 읽지 않게
    const v = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const key = [backgroundRef.current, w, h, dpr, v[0], v[4], v[5]].join('|');
    if (key === bgKeyRef.current) return;
    bgKeyRef.current = key;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    drawBackground(ctx, backgroundRef.current, el.width, el.height, v as number[], dpr, coordOrigin(canvas));
  }, []);

  // ---------- 배경 ----------
  const applyBackground = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.backgroundColor = 'transparent';
    canvas.requestRenderAll();
    paintBackground();
  }, []);

  // ---------- 도구 상태 (선택 가능 여부 등) ----------
  const applyToolState = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const t = toolRef.current;
    const isSelect = t === 'select';
    const isBucket = t === 'bucket';
    canvas.isDrawingMode = DRAWING_TOOLS.includes(t);
    canvas.selection = isSelect;
    canvas.skipTargetFind = !(isSelect || isBucket);
    canvas.defaultCursor =
      t === 'pan' ? 'grab' : t === 'eraser' ? 'none' : isSelect ? 'default' : t === 'bucket' ? 'pointer' : t === 'magnify' ? 'zoom-in' : 'crosshair';
    canvas.forEachObject(obj => {
      if (isHelper(obj)) return;
      const locked = isLocked(obj);
      obj.selectable = isSelect && !locked;
      obj.evented = (isSelect && !locked) || (isBucket && !locked);
    });
    if (t !== 'eraser' && eraserCursorRef.current) {
      canvas.remove(eraserCursorRef.current);
      eraserCursorRef.current = null;
    }
    canvas.requestRenderAll();
  }, []);

  // ---------- 변경 알림 / 히스토리 ----------
  const notifyChange = useCallback(() => {
    if (isLoadingRef.current) return;
    const scheduledFor = currentSceneIdRef.current;
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => {
      const canvas = fabricRef.current;
      if (!canvas || isLoadingRef.current) return;
      if (currentSceneIdRef.current !== scheduledFor) return; // 그 사이 슬라이드가 바뀜
      if (isDrawingRef.current) {
        notifyChange();
        return;
      }
      propsRef.current.onCanvasChange?.({ sceneId: scheduledFor, canvas, data: serializeCanvas(canvas), fromLoad: false });
    }, 600);
  }, []);

  /** 슬라이드마다 실행 취소 기록을 따로 보관 (다른 슬라이드에 다녀와도 유지) */
  const historyMapRef = useRef(new Map<string, { undo: string[]; redo: string[] }>());
  const attachHistory = useCallback((id: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const snap = serializeCanvas(canvas);
    let entry = historyMapRef.current.get(id);
    if (!entry) {
      entry = { undo: [snap], redo: [] };
      historyMapRef.current.set(id, entry);
    } else if (entry.undo[entry.undo.length - 1] !== snap) {
      // 다른 사람의 변경이나 불러오기로 내용이 바뀐 경우: 새 단계로 기록
      entry.undo.push(snap);
      if (entry.undo.length > HISTORY_LIMIT) entry.undo.splice(0, entry.undo.length - HISTORY_LIMIT);
      entry.redo.length = 0;
    }
    undoRef.current = entry.undo;
    redoRef.current = entry.redo;
  }, []);

  const recordHistory = useCallback(() => {
    if (isLoadingRef.current || isRestoringRef.current) return;
    if (isDrawingRef.current) {
      pendingHistoryRef.current = true;
      return;
    }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      const canvas = fabricRef.current;
      if (!canvas || isLoadingRef.current || isRestoringRef.current) return;
      const snap = serializeCanvas(canvas);
      const stack = undoRef.current;
      if (stack[stack.length - 1] === snap) return;
      stack.push(snap);
      if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length - HISTORY_LIMIT);
      redoRef.current.length = 0;
    }, 150);
  }, []);

  const commitChange = useCallback(() => {
    recordHistory();
    notifyChange();
  }, [recordHistory, notifyChange]);

  const afterLoad = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.forEachObject(obj => {
      if (!(obj as any).id) (obj as any).id = newId();
      if (isLocked(obj)) obj.set({ lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true });
    });
    applyBackground();
    applyToolState();
  }, [applyBackground, applyToolState]);

  const restoreSnapshot = useCallback(async (snap: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    isRestoringRef.current = true;
    try {
      canvas.discardActiveObject();
      await loadCanvasData(canvas, snap, getCanvas);
      afterLoad();
    } finally {
      isRestoringRef.current = false;
    }
    notifyChange();
    forceRender(n => n + 1);
  }, [afterLoad, getCanvas, notifyChange]);

  const undo = useCallback(() => {
    if (undoRef.current.length <= 1 || isRestoringRef.current) return;
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    const current = undoRef.current.pop()!;
    redoRef.current.push(current);
    restoreSnapshot(undoRef.current[undoRef.current.length - 1]);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0 || isRestoringRef.current) return;
    const next = redoRef.current.pop()!;
    undoRef.current.push(next);
    restoreSnapshot(next);
  }, [restoreSnapshot]);

  const selectObjects = useCallback((objs: fabric.FabricObject[]) => {
    const canvas = fabricRef.current;
    if (!canvas || objs.length === 0) return;
    if (toolRef.current !== 'select') {
      pendingSelectRef.current = objs;
      propsRef.current.onRequestTool?.('select');
      return;
    }
    objs.forEach(o => { o.selectable = true; o.evented = true; });
    canvas.discardActiveObject();
    canvas.setActiveObject(objs.length === 1 ? objs[0] : new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
  }, []);

  // ---------- 레이저 포인터 (잔상이 남았다가 사라짐, 저장되지 않음) ----------
  const drawLaser = useCallback(() => {
    const el = laserCanvasRef.current;
    if (!el) { laserAnimRef.current = null; return; }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const now = performance.now();
    const LIFE = 700;
    const pts = laserPointsRef.current.filter(p => now - p.t < LIFE);
    laserPointsRef.current = pts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    if (pts.length > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - (now - pts[i].t) / LIFE;
        ctx.strokeStyle = `rgba(239, 68, 68, ${Math.max(0, a) * 0.85})`;
        ctx.lineWidth = 3 + a * 5;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      const last = pts[pts.length - 1];
      const fresh = now - last.t < 250;
      if (fresh) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      laserAnimRef.current = requestAnimationFrame(drawLaser);
    } else {
      laserAnimRef.current = null;
    }
  }, []);

  const pushLaserPoint = useCallback((e: any) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top;
    laserPointsRef.current.push({ x, y, t: performance.now() });
    const v = fabricRef.current?.viewportTransform;
    if (v && propsRef.current.onLaser) propsRef.current.onLaser((x - v[4]) / v[0], (y - v[5]) / v[3]);
    if (laserPointsRef.current.length > 120) laserPointsRef.current.shift();
    if (laserAnimRef.current == null) laserAnimRef.current = requestAnimationFrame(drawLaser);
  }, [drawLaser]);

  // ---------- 영역 확대 사본 ----------
  const magRef = useRef<{ x0: number; y0: number; rect: fabric.Rect } | null>(null);
  /** 화면의 한 영역(장면 좌표)을 선명한 그림으로 (긴 변 약 1600px, 바탕색 포함) */
  const cropRegion = useCallback(async (x: number, y: number, w: number, h: number): Promise<string | null> => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const v = canvas.viewportTransform;
    const z = v[0];
    const sw = w * z, sh = h * z;
    const multiplier = Math.min(6, Math.max(1, 1600 / Math.max(sw, sh)));
    const helpers = canvas.getObjects().filter(o => isHelper(o));
    helpers.forEach(o => { o.visible = false; });
    let url: string;
    try {
      url = canvas.toDataURL({ format: 'png', left: x * z + v[4], top: y * z + v[5], width: sw, height: sh, multiplier });
    } finally {
      helpers.forEach(o => { o.visible = true; });
    }
    // 흰 바탕을 깔아 투명한 부분이 비치지 않게
    const base = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = backgroundColor(backgroundRef.current);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(base, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  }, []);

  /** 가림 카드: 영역을 덮는 카드. 누르면 뒤집혀 보이고 다시 누르면 덮인다 */
  const makeFlashCard = useCallback((x: number, y: number, w: number, h: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const z = canvas.getZoom();
    const rect = new fabric.Rect({ width: w, height: h, rx: 10 / z, ry: 10 / z, fill: '#fcd34d', stroke: '#d97706', strokeWidth: 2 / z, originX: 'center', originY: 'center' });
    const fs = Math.max(10 / z, Math.min(h * 0.45, w * 0.22, 40 / z));
    const label = new fabric.FabricText('?', { fontSize: fs * 1.4, fontWeight: 'bold', fill: '#92400e', fontFamily: KOREAN_FONT, originX: 'center', originY: 'center' });
    const g = new fabric.Group([rect, label], { left: x + w / 2, top: y + h / 2, originX: 'center', originY: 'center', cornerColor: '#d97706', cornerSize: 10, transparentCorners: false, subTargetCheck: false });
    (g as any).id = newId();
    (g as any).isFlash = true;
    (g as any).flashBox = 1;
    (g as any).flashDue = 0;
    canvas.add(g);
    canvas.requestRenderAll();
    propsRef.current.onFlashCardAdded?.();
  }, []);

  const makeClip = useCallback(async (x: number, y: number, w: number, h: number) => {
    const url = await cropRegion(x, y, w, h);
    if (url) propsRef.current.onClip?.(url);
  }, [cropRegion]);

  const makeMagnified = useCallback(async (x: number, y: number, w: number, h: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const v = canvas.viewportTransform;
    const z = v[0];
    const cropped = await cropRegion(x, y, w, h);
    if (!cropped) return;
    const img = await fabric.FabricImage.fromURL(cropped);
    // 원래 크기의 2배(화면의 70%를 넘지 않게), 화면 안에서 영역 오른쪽 또는 가운데
    const viewW = canvas.width / z, viewH = canvas.height / z;
    const scaleWorld = Math.min(2 * w, viewW * 0.7) / img.width;
    const finalScale = Math.min(scaleWorld, (viewH * 0.8) / img.height);
    img.scale(finalScale);
    const dw = img.getScaledWidth(), dh = img.getScaledHeight();
    const vx0 = -v[4] / z, vy0 = -v[5] / z;
    let left = x + w + 24 / z;
    if (left + dw > vx0 + viewW - 12 / z) left = Math.max(vx0 + 12 / z, vx0 + (viewW - dw) / 2);
    const top = Math.min(Math.max(vy0 + 12 / z, y + h / 2 - dh / 2), vy0 + viewH - dh - 12 / z);
    img.set({
      originX: 'left', originY: 'top', left, top,
      stroke: '#6366f1', strokeWidth: 3, strokeUniform: true,
      shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.28)', blur: 24, offsetX: 0, offsetY: 8 }),
      cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false,
    });
    (img as any).id = newId();
    canvas.add(img);
    canvas.requestRenderAll();
    propsRef.current.onMagnifyDone?.();
  }, [cropRegion]);

  // ---------- 이어 붙인 PDF 쪽 ----------
  const stackedPages = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return [];
    return canvas.getObjects().filter(o => (o as any).pageNo != null && o.visible !== false).sort((a, b) => a.getBoundingRect().top - b.getBoundingRect().top);
  }, []);
  const fitRect = useCallback((r: { left: number; top: number; width: number; height: number }, pad = 16) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const zoom = Math.min(3, Math.max(0.05, Math.min((canvas.width - pad * 2) / r.width, (canvas.height - pad * 2) / r.height)));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    canvas.setViewportTransform([zoom, 0, 0, zoom, canvas.width / 2 - cx * zoom, canvas.height / 2 - cy * zoom]);
    canvas.requestRenderAll();
    propsRef.current.onZoomChange?.(zoom);
    forceRender(n => n + 1);
  }, []);
  /** 지금 화면 가운데에 있는 쪽 번호(배열 위치) */
  const currentPageIndex = useCallback((pages: fabric.FabricObject[]) => {
    const canvas = fabricRef.current;
    if (!canvas || !pages.length) return -1;
    const v = canvas.viewportTransform;
    const cy = (canvas.height / 2 - v[5]) / v[3];
    let best = 0, bestD = Infinity;
    pages.forEach((p, i) => {
      const r = p.getBoundingRect();
      const d = cy < r.top ? r.top - cy : cy > r.top + r.height ? cy - r.top - r.height : 0;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }, []);
  const stepPage = useCallback((dir: 1 | -1) => {
    const pages = stackedPages();
    if (pages.length < 2) return false;
    const i = currentPageIndex(pages);
    const j = i + dir;
    if (j < 0 || j >= pages.length) return false;
    fitRect(pages[j].getBoundingRect());
    return true;
  }, [stackedPages, currentPageIndex, fitRect]);

  // ---------- 내용 전체가 화면에 들어오도록 맞추기 ----------
  const fitToContent = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // 여러 쪽을 이어 붙인 슬라이드는 지금 보고 있는 쪽 하나를 맞춘다
    const pages = stackedPages();
    if (pages.length > 1) { fitRect(pages[Math.max(0, currentPageIndex(pages))].getBoundingRect()); return; }
    const objs = canvas.getObjects().filter(o => !isHelper(o) && o.visible !== false);
    if (objs.length === 0) {
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      propsRef.current.onZoomChange?.(1);
      forceRender(n => n + 1);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objs.forEach(o => {
      const r = o.getBoundingRect();
      minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.left + r.width); maxY = Math.max(maxY, r.top + r.height);
    });
    const pad = 24;
    const w = maxX - minX, h = maxY - minY;
    const zoom = Math.min(3, Math.max(0.1, Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    canvas.setViewportTransform([zoom, 0, 0, zoom, canvas.width / 2 - cx * zoom, canvas.height / 2 - cy * zoom]);
    canvas.requestRenderAll();
    propsRef.current.onZoomChange?.(zoom);
    forceRender(n => n + 1);
  }, []);

  // ---------- 화면 중앙 배치 ----------
  const placeAtCenter = useCallback((obj: fabric.FabricObject) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.viewportCenterObject(obj);
  }, []);

  const addAndSelect = useCallback((obj: fabric.FabricObject) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!(obj as any).id) (obj as any).id = newId();
    canvas.add(obj);
    selectObjects([obj]);
  }, [selectObjects]);

  // ---------- 편집 동작 ----------
  const handleCopy = useCallback(() => {
    const active = fabricRef.current?.getActiveObject();
    if (active) active.clone(['id', 'locked']).then(cloned => { globalClipboard = cloned; });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects();
    if (objs.length === 0) return;
    canvas.discardActiveObject();
    canvas.remove(...objs);
    canvas.requestRenderAll();
    setHasSelection(false);
    commitChange();
  }, [commitChange]);

  const handleCut = useCallback(() => {
    const active = fabricRef.current?.getActiveObject();
    if (!active) return;
    active.clone(['id', 'locked']).then(cloned => {
      globalClipboard = cloned;
      handleDeleteSelected();
    });
  }, [handleDeleteSelected]);

  const handlePaste = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !globalClipboard) return;
    const cloned: any = await globalClipboard.clone(['locked']);
    canvas.discardActiveObject();
    cloned.set({ left: cloned.left + 20, top: cloned.top + 20, evented: true });
    if (cloned instanceof fabric.ActiveSelection) {
      cloned.canvas = canvas;
      cloned.forEachObject((o: any) => { o.id = newId(); canvas.add(o); });
      cloned.setCoords();
    } else {
      cloned.id = newId();
      canvas.add(cloned);
    }
    globalClipboard.set({ left: (globalClipboard.left || 0) + 20, top: (globalClipboard.top || 0) + 20 });
    if (toolRef.current !== 'select') propsRef.current.onRequestTool?.('select');
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
    commitChange();
  }, [commitChange]);

  const handleGroup = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!(active instanceof fabric.ActiveSelection)) return;
    const objs = active.removeAll();
    canvas.remove(...objs);
    const group = new fabric.Group(objs);
    (group as any).id = newId();
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    commitChange();
  }, [commitChange]);

  const handleUngroup = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!(active instanceof fabric.Group) || active instanceof fabric.ActiveSelection) return;
    if ((active as any).isAudio || (active as any).isWebLink) return; // 미디어 카드는 풀지 않음
    const objs = active.removeAll();
    canvas.remove(active);
    objs.forEach(o => { (o as any).id = (o as any).id || newId(); canvas.add(o); });
    const sel = new fabric.ActiveSelection(objs, { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    commitChange();
  }, [commitChange]);

  const handleImagesAdd = useCallback(async (dataUrls: string[], docs?: ({ docId: string; docPage: number } | null)[]) => {
    const canvas = fabricRef.current;
    if (!canvas || dataUrls.length === 0) return;
    const columns = Math.min(4, dataUrls.length);
    const padding = 40;
    const targetWidth = 400;
    const images = await Promise.all(dataUrls.map(url => fabric.FabricImage.fromURL(url)));
    const center = canvas.getVpCenter();
    const rows = Math.ceil(images.length / columns);
    const cellH = Math.max(...images.map(img => img.height * (targetWidth / img.width)));
    const totalW = columns * targetWidth + (columns - 1) * padding;
    const totalH = rows * cellH + (rows - 1) * padding;
    images.forEach((img, i) => {
      img.scale(targetWidth / img.width);
      const col = i % columns, row = Math.floor(i / columns);
      img.set({
        left: center.x - totalW / 2 + col * (targetWidth + padding) + targetWidth / 2,
        top: center.y - totalH / 2 + row * (cellH + padding) + img.getScaledHeight() / 2,
        cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false,
      });
      (img as any).id = newId();
      const d = docs?.[i];
      if (d) { (img as any).docId = d.docId; (img as any).docPage = d.docPage; }
      canvas.add(img);
    });
    selectObjects(images);
  }, [selectObjects]);

  // ---------- 외부 노출 메서드 ----------
  React.useImperativeHandle(ref, () => ({
    getFlashCards: () => (fabricRef.current?.getObjects() || []).filter((o: any) => o.isFlash).map((o: any) => ({ id: o.id, box: o.flashBox || 1, due: o.flashDue || 0 })),
    focusObject: (id: string) => {
      const o = fabricRef.current?.getObjects().find((x: any) => x.id === id);
      if (!o) return false;
      const r = o.getBoundingRect();
      const padW = r.width * 1.2, padH = r.height * 2.2;
      fitRect({ left: r.left - (padW - r.width) / 2, top: r.top - (padH - r.height) / 2, width: padW, height: padH });
      return true;
    },
    setFlash: (id: string, patch: { revealed?: boolean; box?: number; due?: number }) => {
      const canvas = fabricRef.current;
      const o: any = canvas?.getObjects().find((x: any) => x.id === id);
      if (!canvas || !o) return;
      if (patch.revealed !== undefined) { o.__revealed = patch.revealed; o.set({ opacity: patch.revealed ? 0.12 : 1 }); }
      if (patch.box !== undefined) o.flashBox = patch.box;
      if (patch.due !== undefined) o.flashDue = patch.due;
      canvas.requestRenderAll();
      if (patch.box !== undefined || patch.due !== undefined) commitChange();
    },
    undo,
    redo,
    zoomIn: () => {
      const c = fabricRef.current; if (!c) return;
      const zoom = Math.min(20, c.getZoom() * 1.1);
      c.zoomToPoint(new fabric.Point(c.width / 2, c.height / 2), zoom);
      propsRef.current.onZoomChange?.(zoom);
    },
    zoomOut: () => {
      const c = fabricRef.current; if (!c) return;
      const zoom = Math.max(0.05, c.getZoom() / 1.1);
      c.zoomToPoint(new fabric.Point(c.width / 2, c.height / 2), zoom);
      propsRef.current.onZoomChange?.(zoom);
    },
    resetZoom: () => {
      const c = fabricRef.current; if (!c) return;
      c.setViewportTransform([1, 0, 0, 1, 0, 0]);
      c.requestRenderAll();
      propsRef.current.onZoomChange?.(1);
      forceRender(n => n + 1);
    },
    bringToFront: () => { const c = fabricRef.current; const o = c?.getActiveObject(); if (c && o) { c.bringObjectToFront(o); commitChange(); } },
    sendToBack: () => { const c = fabricRef.current; const o = c?.getActiveObject(); if (c && o) { c.sendObjectToBack(o); commitChange(); } },
    bringForward: () => { const c = fabricRef.current; const o = c?.getActiveObject(); if (c && o) { c.bringObjectForward(o); commitChange(); } },
    sendBackward: () => { const c = fabricRef.current; const o = c?.getActiveObject(); if (c && o) { c.sendObjectBackwards(o); commitChange(); } },
    toggleLock: (id: string) => {
      const c = fabricRef.current; if (!c) return;
      const obj = c.getObjects().find(o => (o as any).id === id);
      if (!obj) return;
      const lock = !isLocked(obj);
      (obj as any).locked = lock;
      obj.set({ lockMovementX: lock, lockMovementY: lock, lockRotation: lock, lockScalingX: lock, lockScalingY: lock });
      c.discardActiveObject();
      applyToolState();
      commitChange();
    },
    toggleVisibility: (id: string) => {
      const c = fabricRef.current; if (!c) return;
      const obj = c.getObjects().find(o => (o as any).id === id);
      if (!obj) return;
      obj.set('visible', !obj.visible);
      c.discardActiveObject();
      c.requestRenderAll();
      commitChange();
    },
    selectObject: (id: string) => {
      const c = fabricRef.current; if (!c) return;
      const obj = c.getObjects().find(o => (o as any).id === id);
      if (obj && !isLocked(obj) && obj.visible) selectObjects([obj]);
    },
    toJSON: () => (fabricRef.current ? serializeCanvas(fabricRef.current) : ''),
    getCanvas: () => fabricRef.current,
    getThumbnail: () => {
      const c = fabricRef.current;
      if (!c) return undefined;
      try { return c.toDataURL({ multiplier: 0.15, format: 'png' }); } catch { return undefined; }
    },
    addText: (text = '내용을 입력하세요', options: { width?: number } = {}) => {
      const t = options.width
        ? new fabric.Textbox(text, { width: options.width, fontFamily: KOREAN_FONT, fontSize: 22, fill: isDarkBackground(backgroundRef.current) ? '#ffffff' : colorRef.current, cornerColor: '#3b82f6' })
        : new fabric.IText(text, { fontFamily: KOREAN_FONT, fontSize: Math.max(20, brushSizeRef.current * 6), fill: colorRef.current, cornerColor: '#3b82f6' });
      placeAtCenter(t);
      addAndSelect(t);
    },
    addFile: async (file: File) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const type = file.type;
      const name = file.name.toLowerCase();
      if (type.startsWith('image/')) {
        const dataUrl = await downscaleImageFile(file);
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const scale = Math.min((canvas.width - 100) / img.width, (canvas.height - 240) / img.height, 1) / canvas.getZoom();
        img.scale(scale);
        img.set({ cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false });
        placeAtCenter(img);
        addAndSelect(img);
      } else if (type.startsWith('video/')) {
        const el = document.createElement('video');
        const src = URL.createObjectURL(file);
        el.src = src;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.preload = 'auto';
        await new Promise<void>(resolve => { el.onloadeddata = () => resolve(); el.onerror = () => resolve(); });
        el.width = el.videoWidth;
        el.height = el.videoHeight;
        videoRegistry.set(src, el);
        attachVideoRenderLoop(el, getCanvas);
        const vid = new fabric.FabricImage(el, { objectCaching: false });
        const scale = Math.min((canvas.width - 100) / vid.width, (canvas.height - 240) / vid.height, 1) / canvas.getZoom();
        vid.scale(scale);
        (vid as any).isVideo = true;
        placeAtCenter(vid);
        addAndSelect(vid);
        el.play().catch(() => {});
        toast.info('동영상은 이 화면이 열려 있는 동안만 유지됩니다. 새로고침 후에는 파일을 다시 넣어 주세요.');
      } else if (type.startsWith('audio/')) {
        let audioUrl: string;
        if (file.size <= 3 * 1024 * 1024) {
          audioUrl = await fileToDataURL(file);
        } else {
          audioUrl = URL.createObjectURL(file);
          toast.info('3MB가 넘는 오디오는 저장되지 않고, 이 화면에서만 재생됩니다.');
        }
        const label = file.name.length > 16 ? file.name.slice(0, 15) + '…' : file.name;
        const group = new fabric.Group([
          new fabric.Rect({ width: 140, height: 120, fill: '#f3f4f6', stroke: '#e5e7eb', strokeWidth: 2, rx: 12, ry: 12, originX: 'left', originY: 'top' }),
          new fabric.FabricText('🎵', { fontSize: 40, left: 48, top: 20, originX: 'left', originY: 'top' }),
          new fabric.FabricText(label, { fontSize: 11, left: 10, top: 84, fill: '#666', fontFamily: KOREAN_FONT, originX: 'left', originY: 'top' }),
        ]);
        (group as any).isAudio = true;
        (group as any).audioUrl = audioUrl;
        placeAtCenter(group);
        addAndSelect(group);
      } else if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
        toast.error('파워포인트 파일은 바로 넣을 수 없습니다.', {
          description: 'PowerPoint에서 [다른 이름으로 저장 → PDF]로 저장한 뒤 PDF 파일을 넣어 주세요. 슬라이드마다 한 장씩 들어갑니다.',
          duration: 8000,
        });
      } else {
        toast.error('지원하지 않는 파일 형식입니다.', { description: '사진, PDF, 한글, 워드, 파워포인트, 엑셀, 키노트·페이지스·넘버스, 동영상, 소리, 악보 파일을 넣을 수 있습니다.' });
      }
    },
    addImages: handleImagesAdd,
    addWebLink: (url: string, clip?: { start?: number; end?: number }) => {
      const display = url.length > 34 ? url.slice(0, 33) + '…' : url;
      const isYt = /(^|\.)(youtube\.com|youtu\.be)$/i.test((() => { try { return new URL(url).hostname; } catch { return ''; } })());
      const hasClip = !!clip && (clip.start != null || clip.end != null);
      const t = (n?: number) => (n == null ? '' : `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`);
      const accent = isYt ? '#dc2626' : '#10b981';
      const head = isYt ? (hasClip ? `▶ 유튜브 구간 ${t(clip!.start ?? 0)} ~ ${clip!.end != null ? t(clip!.end) : '끝'}` : '▶ 유튜브 영상') : '🌐 웹 링크';
      const group = new fabric.Group([
        new fabric.Rect({ width: 260, height: 100, fill: '#fff', stroke: accent, strokeWidth: 2, rx: 12, ry: 12, originX: 'left', originY: 'top' }),
        new fabric.Rect({ width: 6, height: 76, left: 10, top: 12, fill: accent, rx: 3, ry: 3, originX: 'left', originY: 'top' }),
        new fabric.FabricText(head, { fontSize: 15, left: 26, top: 16, fill: accent, fontWeight: 'bold', fontFamily: KOREAN_FONT, originX: 'left', originY: 'top' }),
        new fabric.FabricText(display, { fontSize: 11, left: 26, top: 46, fill: '#666', originX: 'left', originY: 'top' }),
        new fabric.FabricText('두 번 누르면 수업 화면에서 열립니다', { fontSize: 10, left: 26, top: 70, fill: '#3b82f6', fontFamily: KOREAN_FONT, originX: 'left', originY: 'top' }),
      ]);
      (group as any).isWebLink = true;
      (group as any).url = url;
      if (hasClip) { (group as any).clipStart = clip!.start; (group as any).clipEnd = clip!.end; }
      placeAtCenter(group);
      addAndSelect(group);
    },
    addShape: (type) => {
      const common = {
        fill: 'transparent', stroke: colorRef.current, strokeWidth: brushSizeRef.current,
        cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false, strokeUniform: true,
      };
      let shape: fabric.FabricObject | null = null;
      switch (type) {
        case 'rect': shape = new fabric.Rect({ ...common, width: 140, height: 100 }); break;
        case 'circle': shape = new fabric.Circle({ ...common, radius: 60 }); break;
        case 'ellipse': shape = new fabric.Ellipse({ ...common, rx: 90, ry: 50 }); break;
        case 'triangle': shape = new fabric.Triangle({ ...common, width: 120, height: 100 }); break;
        case 'polygon':
          shape = new fabric.Polygon([{ x: 50, y: 0 }, { x: 100, y: 40 }, { x: 80, y: 100 }, { x: 20, y: 100 }, { x: 0, y: 40 }], common);
          break;
        case 'line':
          shape = new fabric.Line([0, 0, 200, 0], { ...common, fill: undefined, strokeLineCap: 'round' });
          break;
        case 'arrow': {
          const w = Math.max(2, brushSizeRef.current);
          const head = 8 + w * 2.5;
          shape = new fabric.Path(`M 0 0 L 200 0 M ${200 - head} ${-head * 0.6} L 200 0 L ${200 - head} ${head * 0.6}`, {
            ...common, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round',
          });
          break;
        }
      }
      if (shape) {
        placeAtCenter(shape);
        addAndSelect(shape);
      }
    },
    clear: (mode: 'ink' | 'all' = 'all') => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.discardActiveObject();
      const targets = canvas.getObjects().filter(o => !isHelper(o) && (mode === 'all' || (!isLocked(o) && !(o as any).isBackground)));
      canvas.remove(...targets);
      if (mode === 'all') {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        propsRef.current.onZoomChange?.(1);
      }
      canvas.requestRenderAll();
      commitChange();
    },
    hasLockedContent: () => !!fabricRef.current?.getObjects().some(o => !isHelper(o) && (isLocked(o) || (o as any).isBackground)),
    fitToContent: () => fitToContent(),
    stepPage,
    getFieldText: (key: string) => {
      const o: any = fabricRef.current?.getObjects().find((x: any) => x.field === key && typeof x.text === 'string' && !x.isPlaceholder);
      return o ? String(o.text).trim() : '';
    },
    getPageInfo: () => {
      const pages = stackedPages();
      const notebook = pages.some(p => (p as any).notebook);
      if (pages.length < 2 && !notebook) return null;
      if (!pages.length) return null;
      const i = Math.max(0, currentPageIndex(pages));
      const nos = pages.map(p => (p as any).pageNo as number);
      return { index: i, total: pages.length, pageNo: nos[i], first: Math.min(...nos), last: Math.max(...nos), notebook };
    },
    appendNotebookPage: async () => {
      const canvas = fabricRef.current;
      if (!canvas) return null;
      const n = await appendPaper(canvas);
      if (n == null) return null;
      const page = stackedPages().find(p => (p as any).pageNo === n);
      if (page) fitRect(page.getBoundingRect());
      commitChange();
      return n;
    },
    addChecklist: (kind: 'todo' | 'prayer') => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const z = canvas.getZoom();
      const c = canvas.getVpCenter();
      const w = Math.min(560, (canvas.width / z) * 0.6);
      const head = new fabric.FabricText(kind === 'todo' ? '할 일' : '기도 제목', { fontSize: 22, fontWeight: 'bold', fill: kind === 'todo' ? '#dc2626' : '#d97706', fontFamily: KOREAN_FONT, originX: 'left', originY: 'top', left: c.x - w / 2, top: c.y - 80 });
      (head as any).id = newId();
      const t = makeChecklist(kind, c.x - w / 2, c.y - 44, w, 22, '☐ ');
      canvas.add(head, t);
      canvas.setActiveObject(t);
      (t as fabric.Textbox).enterEditing();
      (t as fabric.Textbox).selectionStart = (t as fabric.Textbox).selectionEnd = 2;
      canvas.requestRenderAll();
    },
    addBibleCard: async (card) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const z = canvas.getZoom();
      const c = canvas.getVpCenter();
      let obj: fabric.FabricObject;
      if (card.image) {
        const img = await fabric.FabricImage.fromURL(card.image.url);
        const vw = (canvas.width / z) * 0.8;
        const sc = Math.min(card.image.w, vw) / img.width;
        img.set({ left: c.x - (img.width * sc) / 2, top: c.y - Math.min(img.height * sc, (canvas.height / z) * 0.8) / 2, originX: 'left', originY: 'top', scaleX: sc, scaleY: sc });
        obj = img;
      } else {
        const w = Math.min(600, (canvas.width / z) * 0.7);
        obj = makeBibleTextbox(card.text, c.x - w / 2, c.y - 60, w, card.bg);
      }
      Object.assign(obj as any, { id: newId(), bibleRef: card.ref, bibleText: card.text, bibleBg: card.bg || 'yellow' });
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      commitChange();
    },
    setChecklistLine: (objId: string, line: number, checked: boolean) => {
      const canvas = fabricRef.current;
      const o: any = canvas?.getObjects().find((x: any) => x.id === objId);
      if (!canvas || !o || !o.checklist) return false;
      const lines = String(o.text).split('\n');
      if (!lines[line]) return false;
      lines[line] = (checked ? '☑' : '☐') + lines[line].replace(/^[☐☑]/, '');
      o.set({ text: lines.join('\n') });
      o.initDimensions?.();
      canvas.requestRenderAll();
      commitChange();
      return true;
    },
    goToPageNo: (n: number) => {
      const pages = stackedPages();
      const target = pages.find(p => (p as any).pageNo === n);
      if (!target) return false;
      fitRect(target.getBoundingRect());
      return true;
    },
    getLaserCanvas: () => laserCanvasRef.current,
    getRecordLayers: () => {
      const c: any = fabricRef.current;
      return [c?.lowerCanvasEl ?? null, c?.upperCanvasEl ?? null, laserCanvasRef.current];
    },
    getContainer: () => containerRef.current,
    addModelCard: async (asset) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const W = 220, H = 230;
      const parts: fabric.FabricObject[] = [
        new fabric.Rect({ width: W, height: H, fill: '#ffffff', stroke: '#c7d2fe', strokeWidth: 2, rx: 18, ry: 18, originX: 'left', originY: 'top' }),
      ];
      if (asset.thumb) {
        try {
          const img = await fabric.FabricImage.fromURL(asset.thumb);
          const sc = Math.min((W - 24) / img.width, 170 / img.height);
          img.set({ scaleX: sc, scaleY: sc, originX: 'center', originY: 'center', left: W / 2, top: 98 });
          parts.push(img);
        } catch { /* 미리보기 없음 */ }
      } else {
        parts.push(new fabric.FabricText('🧊', { fontSize: 64, originX: 'center', originY: 'center', left: W / 2, top: 98 }));
      }
      const label = asset.name.replace(/\.glb$/i, '');
      parts.push(new fabric.Rect({ width: W - 16, height: 34, fill: '#eef2ff', rx: 10, ry: 10, originX: 'left', originY: 'top', left: 8, top: H - 42 }));
      parts.push(new fabric.FabricText(`3D  ${label.length > 16 ? label.slice(0, 15) + '…' : label}`, { fontSize: 14, fontWeight: 'bold', fill: '#4338ca', fontFamily: KOREAN_FONT, originX: 'center', originY: 'center', left: W / 2, top: H - 25 }));
      const group = new fabric.Group(parts);
      (group as any).isModel = true;
      (group as any).modelId = asset.id;
      (group as any).modelName = asset.name;
      if (asset.driveId) (group as any).driveId = asset.driveId;
      placeAtCenter(group);
      addAndSelect(group);
    },
    highlightScore: (key, measure) => {
      const canvas = fabricRef.current;
      if (!canvas) return false;
      const clear = () => {
        if (scoreHlRef.current) { canvas.remove(scoreHlRef.current); scoreHlRef.current = null; canvas.requestRenderAll(); }
      };
      if (!key || measure < 0) { clear(); return false; }
      for (const o of canvas.getObjects() as any[]) {
        if (!o.isScore || (o.scoreKey || o.id) !== key || !o.scoreBoxes || o.visible === false) continue;
        if (!o.__boxes) { try { o.__boxes = JSON.parse(o.scoreBoxes); } catch { o.__boxes = []; } }
        const b = (o.__boxes as { m: number; x: number; y: number; w: number; h: number }[]).find(x => x.m === measure);
        if (!b) continue;
        const M = o.calcTransformMatrix();
        const p0 = fabric.util.transformPoint(new fabric.Point(b.x - o.width / 2, b.y - o.height / 2), M);
        const p1 = fabric.util.transformPoint(new fabric.Point(b.x + b.w - o.width / 2, b.y + b.h - o.height / 2), M);
        const left = Math.min(p0.x, p1.x), top = Math.min(p0.y, p1.y), width = Math.abs(p1.x - p0.x), height = Math.abs(p1.y - p0.y);
        let hl = scoreHlRef.current;
        if (!hl) {
          hl = new fabric.Rect({
            originX: 'left', originY: 'top', fill: 'rgba(99,102,241,0.14)', stroke: 'rgba(79,70,229,0.75)', strokeWidth: 2,
            rx: 6, ry: 6, selectable: false, evented: false, excludeFromExport: true, objectCaching: false, strokeUniform: true,
          });
          scoreHlRef.current = hl;
          canvas.add(hl);
        } else if (canvas.getObjects().indexOf(hl) < 0) canvas.add(hl);
        hl.set({ left, top, width, height });
        hl.setCoords();
        canvas.bringObjectToFront(hl);
        canvas.requestRenderAll();
        return true;
      }
      clear();
      return false;
    },
    addScore: async (svg, scoreData, title, extra = {}) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = await fabric.FabricImage.fromURL(url);
      const scale = Math.min((canvas.width * 0.8) / img.width, (canvas.height * 0.8) / img.height, 1) / canvas.getZoom();
      img.scale(scale);
      img.set({ cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false });
      (img as any).isScore = true;
      (img as any).scoreData = scoreData;
      (img as any).scoreTitle = title;
      if (extra.scoreKey) (img as any).scoreKey = extra.scoreKey;
      if (extra.scoreBoxes) (img as any).scoreBoxes = extra.scoreBoxes;
      placeAtCenter(img);
      addAndSelect(img);
    },
    addImageDataUrl: async (dataUrl) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const img = await fabric.FabricImage.fromURL(dataUrl);
      const scale = Math.min((canvas.width * 0.5) / img.width, (canvas.height * 0.6) / img.height, 1) / canvas.getZoom();
      img.scale(scale);
      img.set({ cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false });
      placeAtCenter(img);
      addAndSelect(img);
    },
    copy: handleCopy,
    paste: handlePaste,
    cut: handleCut,
    deleteSelected: handleDeleteSelected,
    group: handleGroup,
    ungroup: handleUngroup,
  }), [undo, redo, commitChange, applyToolState, selectObjects, fitToContent, stepPage, placeAtCenter, addAndSelect, getCanvas, handleImagesAdd, handleCopy, handlePaste, handleCut, handleDeleteSelected, handleGroup, handleUngroup, fitRect]);

  // ---------- 캔버스 초기화 (한 번) ----------
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const container = containerRef.current;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: 'transparent',
      allowTouchScrolling: false,
      stopContextMenu: true,
      enablePointerEvents: false, // 펜슬을 손가락처럼 처리 (Touch Events)
      skipTargetFind: true,
      fireMiddleClick: false,
      fireRightClick: false,
      imageSmoothingEnabled: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      selection: false,
      containerClass: 'whiteboard-canvas-container',
    });
    fabricRef.current = canvas;
    (window as any).__okbCanvas = canvas; // 자동 점검(테스트)용
    fabric.FabricObject.ownDefaults.objectCaching = true;

    container.style.touchAction = 'none';
    container.style.userSelect = 'none';
    // 아이패드: 길게 누를 때 뜨는 메뉴·돋보기·글자 선택 막기
    (container.style as any).webkitUserSelect = 'none';
    (container.style as any).webkitTouchCallout = 'none';
    container.querySelectorAll('canvas').forEach(c => { (c as HTMLCanvasElement).style.touchAction = 'none'; });

    // --- 객체 이벤트 ---
    let lastVpt = '';
    // --- 고화질 확대: PDF·한글 쪽을 확대하면 보이는 부분을 원본에서 선명하게 다시 그린다 ---
    const hd = { timer: 0 as any, gen: 0, key: '' };
    const installHd = (obj: any) => {
      if (obj.__hdInstalled) return;
      obj.__hdInstalled = true;
      const orig = obj._render.bind(obj);
      obj._render = function (ctx: CanvasRenderingContext2D) {
        orig(ctx);
        const h = this.__hd;
        if (!h) return;
        const w = this.width, ht = this.height;
        ctx.drawImage(h.canvas, -w / 2 + h.r.u0 * w, -ht / 2 + h.r.v0 * ht, (h.r.u1 - h.r.u0) * w, (h.r.v1 - h.r.v0) * ht);
      };
    };
    const dropHd = (obj: any) => { if (obj.__hd) { obj.__hd = null; obj.objectCaching = true; obj.dirty = true; } };
    const runHd = async () => {
      const gen = ++hd.gen;
      const zoom = canvas.getZoom();
      const dpr = window.devicePixelRatio || 1;
      const inv = fabric.util.invertTransform(canvas.viewportTransform);
      const tl = fabric.util.transformPoint(new fabric.Point(0, 0), inv);
      const br = fabric.util.transformPoint(new fabric.Point(canvas.getWidth(), canvas.getHeight()), inv);
      const { getRenderer } = await import('@/src/lib/hdRender');
      for (const obj of canvas.getObjects() as any[]) {
        if (gen !== hd.gen) return;
        if (obj.type !== 'image' || !obj.docId || !obj.docPage || !obj.aCoords) continue;
        if (obj.angle) { dropHd(obj); continue; }
        const a = obj.aCoords;
        const x0 = Math.min(a.tl.x, a.br.x), x1 = Math.max(a.tl.x, a.br.x), y0 = Math.min(a.tl.y, a.br.y), y1 = Math.max(a.tl.y, a.br.y);
        const vx0 = Math.max(x0, tl.x), vx1 = Math.min(x1, br.x), vy0 = Math.max(y0, tl.y), vy1 = Math.min(y1, br.y);
        const screenPerImagePx = (Math.abs(obj.scaleX) || 1) * zoom * dpr;
        // 화면 밖이거나, 원래 그림으로도 충분히 선명하면 다시 그리지 않는다
        if (vx1 <= vx0 || vy1 <= vy0 || screenPerImagePx <= 1.15) { dropHd(obj); continue; }
        const W = x1 - x0, H = y1 - y0;
        const m = 0.08; // 조금 옮겨도 바로 흐려지지 않게 여유
        const r = {
          u0: Math.max(0, (vx0 - x0) / W - m), v0: Math.max(0, (vy0 - y0) / H - m),
          u1: Math.min(1, (vx1 - x0) / W + m), v1: Math.min(1, (vy1 - y0) / H + m),
        };
        if (obj.flipX) [r.u0, r.u1] = [1 - r.u1, 1 - r.u0];
        if (obj.flipY) [r.v0, r.v1] = [1 - r.v1, 1 - r.v0];
        const pxW = Math.ceil((r.u1 - r.u0) * W * zoom * dpr);
        const cur = obj.__hd;
        if (cur && cur.r.u0 <= r.u0 + 1e-3 && cur.r.v0 <= r.v0 + 1e-3 && cur.r.u1 >= r.u1 - 1e-3 && cur.r.v1 >= r.v1 - 1e-3 && cur.pxPerU >= (pxW / (r.u1 - r.u0)) * 0.9) continue;
        const ren = await getRenderer(obj.docId);
        if (!ren || gen !== hd.gen) continue;
        let c: HTMLCanvasElement | null = null;
        try { c = await ren.render(obj.docPage, r, pxW); } catch (e) { console.warn('고화질 다시 그리기 실패', e); }
        if (!c || gen !== hd.gen || !canvas.getObjects().includes(obj)) continue;
        installHd(obj);
        obj.__hd = { canvas: c, r, pxPerU: c.width / (r.u1 - r.u0) };
        obj.objectCaching = false; // 캐시는 해상도가 제한되므로 직접 그린다
        obj.dirty = true;
        canvas.requestRenderAll();
      }
    };
    const scheduleHd = () => { clearTimeout(hd.timer); hd.timer = setTimeout(() => { void runHd(); }, 260); };
    canvas.on('after:render', () => {
      paintBackground();
      const v = canvas.viewportTransform;
      const k = v ? `${v[0]}|${v[4]}|${v[5]}|${canvas.width}|${canvas.height}` : '';
      if (k !== lastVpt) { lastVpt = k; propsRef.current.onViewChange?.(); }
      const hk = `${k}|${canvas.getObjects().length}`;
      if (hk !== hd.key) { hd.key = hk; scheduleHd(); }
    });
    // 양식 칸: 처음 쓰기 시작하면 회색 안내 글자를 지운다
    canvas.on('text:editing:entered', (e: any) => {
      const t = e.target;
      if (t?.isPlaceholder) {
        t.isPlaceholder = false;
        t.set({ text: '', fill: '#0f172a' });
        // 입력용 숨은 글상자도 비워야 안내 글자가 다시 붙지 않는다
        if (t.hiddenTextarea) t.hiddenTextarea.value = '';
        t.selectionStart = t.selectionEnd = 0;
        t.initDimensions?.();
        canvas.requestRenderAll();
      }
    });
    // 체크 목록: 글자를 고친 뒤 줄마다 ☐를 붙인다 (빈 칸으로 비우면 안내 글자로 되돌림)
    canvas.on('text:editing:exited', (e: any) => {
      const t = e.target;
      if (!t) return;
      if (t.checklist) {
        const lines = String(t.text).split('\n').map((l: string) => (l.trim() && !/^[☐☑]/.test(l) ? '☐ ' + l : l));
        const next = lines.join('\n');
        if (next !== t.text) { t.set({ text: next }); canvas.requestRenderAll(); commitChange(); }
      }
    });
    canvas.on('object:added', e => {
      const obj = e.target;
      if (!obj || isHelper(obj)) return;
      if (!(obj as any).id) (obj as any).id = newId();
      if (obj.type !== 'path') commitChange(); // path는 path:created에서 처리
    });
    canvas.on('object:modified', () => commitChange());
    canvas.on('object:removed', e => {
      if (isHelper(e.target)) return;
      if (isRestoringRef.current || isLoadingRef.current) return;
      commitChange();
    });

    const emitSelection = () => {
      const active = canvas.getActiveObject();
      setHasSelection(!!active);
      setCanGroup(active instanceof fabric.ActiveSelection);
      setIsGroupSelected(!!active && active instanceof fabric.Group && !(active instanceof fabric.ActiveSelection) && !(active as any).isAudio && !(active as any).isWebLink);
      const target: any = canvas.getActiveObjects()[0];
      const cb = propsRef.current.onSelectionChange;
      if (!cb) return;
      cb(selectionOf(target));
    };
    canvas.on('selection:created', emitSelection);
    canvas.on('selection:updated', emitSelection);
    canvas.on('selection:cleared', emitSelection);
    canvas.on('mouse:dblclick', opt => {
      // 읽는 법을 단 성경 카드 → 고칠 수 있는 글(괄호 방식)로
      const bt: any = opt.target;
      if (bt && bt.type === 'image' && bt.bibleText && !bt.locked) {
        const t = makeBibleTextbox(bt.bibleText, bt.left, bt.top, bt.getScaledWidth(), bt.bibleBg);
        Object.assign(t as any, { id: newId(), bibleRef: bt.bibleRef, bibleText: bt.bibleText, bibleBg: bt.bibleBg });
        const idx = canvas.getObjects().indexOf(bt);
        canvas.remove(bt);
        canvas.insertAt(idx, t);
        canvas.setActiveObject(t);
        t.enterEditing();
        canvas.requestRenderAll();
        commitChange();
        return;
      }
      const sel = selectionOf(opt.target);
      if (sel.type === 'model' || sel.type === 'weblink' || sel.type === 'score') propsRef.current.onOpenObject?.(sel);
    });

    // --- 확대/축소 (휠) ---
    canvas.on('mouse:wheel', opt => {
      const e = opt.e as WheelEvent;
      if (!e || (!e.deltaY && !e.deltaX)) return;
      // 휠·두 손가락 쓸기는 화면 이동, Ctrl(또는 두 손가락 벌리기)+휠은 확대·축소
      if (!e.ctrlKey && !e.metaKey) {
        const v = canvas.viewportTransform;
        const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? canvas.height : 1;
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
        const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
        canvas.setViewportTransform([v[0], v[1], v[2], v[3], v[4] - dx, v[5] - dy]);
        canvas.requestRenderAll();
        forceRender(n => n + 1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      let zoom = canvas.getZoom() * 0.995 ** e.deltaY;
      zoom = Math.min(20, Math.max(0.05, zoom));
      canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
      canvas.requestRenderAll();
      propsRef.current.onZoomChange?.(zoom);
      forceRender(n => n + 1);
      e.preventDefault();
      e.stopPropagation();
    });

    // --- 도구별 포인터 처리 ---
    const pan = { spaceDown: false, dragging: false, lastX: 0, lastY: 0, cursorSent: 0 };
    const clientXY = (e: any) => ({
      x: e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX ?? 0,
      y: e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY ?? 0,
    });

    const eraseAt = (p: fabric.Point) => {
      const radius = Math.max(10, brushSizeRef.current * 2);
      const victims: fabric.FabricObject[] = [];
      canvas.getObjects().forEach(obj => {
        if (isHelper(obj) || isLocked(obj) || !obj.visible) return;
        if (!ERASABLE_TYPES.has(obj.type)) return; // 사진·PDF·미디어 카드는 지우개로 지우지 않음
        if (obj.type === 'path') {
          const pts = getPathScenePoints(obj as fabric.Path);
          const tol = radius + ((obj.strokeWidth || 1) * (obj.scaleX || 1)) / 2;
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[i + 1] || pts[i];
            if (distToSegment(p, a, b) <= tol) { victims.push(obj); break; }
          }
        } else if (obj.containsPoint(p)) {
          victims.push(obj);
        } else {
          const r = obj.getBoundingRect();
          if (p.x >= r.left - radius && p.x <= r.left + r.width + radius && p.y >= r.top - radius && p.y <= r.top + r.height + radius && obj.type === 'line') {
            victims.push(obj);
          }
        }
      });
      if (victims.length) {
        isRestoringRef.current = true; // 지우는 동안 개별 기록 방지
        canvas.remove(...victims);
        isRestoringRef.current = false;
        erasedRef.current = true;
      }
    };

    const showEraserCursor = (p: fabric.Point) => {
      const r = Math.max(10, brushSizeRef.current * 2);
      if (!eraserCursorRef.current) {
        eraserCursorRef.current = new fabric.Circle({
          radius: r, fill: 'rgba(220,220,220,0.5)', stroke: 'rgba(100,100,100,0.8)', strokeWidth: 1,
          originX: 'center', originY: 'center', selectable: false, evented: false, excludeFromExport: true,
        });
        canvas.add(eraserCursorRef.current);
      }
      eraserCursorRef.current.set({ left: p.x, top: p.y, radius: r, strokeWidth: 1 / canvas.getZoom() });
      canvas.bringObjectToFront(eraserCursorRef.current);
      canvas.requestRenderAll();
    };

    canvas.on('mouse:down', opt => {
      isDrawingRef.current = true;
      propsRef.current.onDrawingStateChange?.(true);
      const t = toolRef.current;
      const e: any = opt.e;
      if ((t === 'magnify' || t === 'clip' || t === 'flashcard') && !pan.spaceDown) {
        const p0 = canvas.getScenePoint(e);
        const z = canvas.getZoom();
        const col = t === 'clip' ? ['rgba(239,68,68,0.08)', '#ef4444'] : t === 'flashcard' ? ['rgba(245,158,11,0.15)', '#d97706'] : ['rgba(99,102,241,0.08)', '#6366f1'];
        const rect = new fabric.Rect({
          left: p0.x, top: p0.y, width: 1, height: 1, originX: 'left', originY: 'top',
          fill: col[0], stroke: col[1], strokeWidth: 2 / z, strokeDashArray: [8 / z, 6 / z],
          selectable: false, evented: false, excludeFromExport: true, objectCaching: false,
        });
        magRef.current = { x0: p0.x, y0: p0.y, rect };
        canvas.add(rect);
        return;
      }
      if (pan.spaceDown || t === 'pan') {
        const { x, y } = clientXY(e);
        pan.dragging = true; pan.lastX = x; pan.lastY = y;
        canvas.setCursor('grabbing');
        return;
      }
      const p = canvas.getScenePoint(e);
      if (t === 'laser') {
        pushLaserPoint(e);
      } else if (t === 'eraser') {
        isErasingRef.current = true;
        erasedRef.current = false;
        showEraserCursor(p);
        eraseAt(p);
      } else if (t === 'bucket') {
        const target: any = opt.target;
        if (!target || isLocked(target) || target.type === 'image' || target instanceof fabric.Group) return;
        if (TEXT_TYPES.has(target.type)) target.set('fill', colorRef.current);
        else if (SHAPE_TYPES.has(target.type)) target.set('fill', colorRef.current);
        else if (target.type === 'path') {
          const pts = getPathScenePoints(target);
          const closed = pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 40;
          target.set(closed ? 'fill' : 'stroke', colorRef.current);
        } else target.set('stroke', colorRef.current);
        canvas.requestRenderAll();
        commitChange();
      } else if (t === 'eyedropper') {
        try {
          const el = canvas.lowerCanvasEl;
          const ctx = el.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
          const rect = el.getBoundingClientRect();
          const { x, y } = clientXY(e);
          const px = ctx.getImageData((x - rect.left) * (el.width / rect.width), (y - rect.top) * (el.height / rect.height), 1, 1).data;
          let hex = '#' + ((1 << 24) + (px[0] << 16) + (px[1] << 8) + px[2]).toString(16).slice(1);
          if (px[3] === 0) hex = backgroundColor(backgroundRef.current);
          propsRef.current.onColorPicked?.(hex);
        } catch (err) {
          console.error('스포이트 오류', err);
        }
      }
    });

    canvas.on('mouse:move', opt => {
      const e: any = opt.e;
      const t = toolRef.current;
      if (magRef.current) {
        const p1 = canvas.getScenePoint(e);
        const m = magRef.current;
        m.rect.set({ left: Math.min(m.x0, p1.x), top: Math.min(m.y0, p1.y), width: Math.abs(p1.x - m.x0), height: Math.abs(p1.y - m.y0) });
        canvas.requestRenderAll();
        return;
      }
      if (pan.dragging) {
        const { x, y } = clientXY(e);
        canvas.relativePan(new fabric.Point(x - pan.lastX, y - pan.lastY));
        pan.lastX = x; pan.lastY = y;
        forceRender(n => n + 1);
        return;
      }
      const p = canvas.getScenePoint(e);
      if (t === 'laser') {
        pushLaserPoint(e);
      } else if (t === 'eraser') {
        showEraserCursor(p);
        if (isErasingRef.current) eraseAt(p);
      }
      const now = Date.now();
      if (propsRef.current.onPointerMove && now - pan.cursorSent > 50) {
        pan.cursorSent = now;
        propsRef.current.onPointerMove(p.x, p.y);
      }
    });

    canvas.on('mouse:up', () => {
      if (magRef.current) {
        const { rect } = magRef.current;
        magRef.current = null;
        canvas.remove(rect);
        isDrawingRef.current = false;
        propsRef.current.onDrawingStateChange?.(false);
        const w = rect.width, h = rect.height;
        if (w * canvas.getZoom() > 12 && h * canvas.getZoom() > 12) {
          const t = toolRef.current;
          if (t === 'clip') void makeClip(rect.left, rect.top, w, h);
          else if (t === 'flashcard') makeFlashCard(rect.left, rect.top, w, h);
          else void makeMagnified(rect.left, rect.top, w, h);
        }
        return;
      }
      const wasPanning = pan.dragging;
      pan.dragging = false;
      if (wasPanning) canvas.setCursor(toolRef.current === 'pan' || pan.spaceDown ? 'grab' : 'default');
      const erased = isErasingRef.current && erasedRef.current;
      isErasingRef.current = false;
      isDrawingRef.current = false;
      propsRef.current.onDrawingStateChange?.(false);
      if (erased) { erasedRef.current = false; commitChange(); }
      if (pendingHistoryRef.current) { pendingHistoryRef.current = false; recordHistory(); }
    });

    canvas.on('mouse:out', () => {
      if (eraserCursorRef.current) {
        canvas.remove(eraserCursorRef.current);
        eraserCursorRef.current = null;
        canvas.requestRenderAll();
      }
    });

    // --- 펜으로 그린 선 처리 (올가미 포함) ---
    canvas.on('path:created', (e: any) => {
      const path: fabric.Path = e.path;
      (path as any).id = (path as any).id || newId();
      const t = toolRef.current;
      if (t === 'lasso') {
        const poly = getPathScenePoints(path);
        isRestoringRef.current = true;
        canvas.remove(path);
        isRestoringRef.current = false;
        const picked = canvas.getObjects().filter(o =>
          !isHelper(o) && !isLocked(o) && o.visible && pointInPolygon(o.getCenterPoint(), poly));
        if (picked.length > 0) selectObjects(picked);
        else toast.info('올가미 안에 선택할 객체가 없습니다.');
        return;
      }
      if (t === 'dashed') path.set({ strokeDashArray: [12, 8] });
      if (t === 'highlighter') path.set({ globalCompositeOperation: 'multiply' });
      path.set({ objectCaching: true, strokeUniform: true, selectable: false, evented: false });
      requestAnimationFrame(() => {
        canvas.requestRenderAll();
        commitChange();
      });
    });

    // --- 키보드 ---
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' && !pan.spaceDown) {
        pan.spaceDown = true;
        canvas.setCursor('grab');
        canvas.defaultCursor = 'grab';
        e.preventDefault();
        return;
      }
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) { e.preventDefault(); redo(); }
      else if (mod && key === 'c') handleCopy();
      else if (mod && key === 'x') handleCut();
      else if (mod && key === 'v') { if (globalClipboard) { e.preventDefault(); handlePaste(); } }
      else if (mod && key === 'g' && !e.shiftKey) { e.preventDefault(); handleGroup(); }
      else if (mod && key === 'g' && e.shiftKey) { e.preventDefault(); handleUngroup(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (canvas.getActiveObjects().length) { e.preventDefault(); handleDeleteSelected(); }
      }
      else if (e.key === 'Escape') { canvas.discardActiveObject(); canvas.requestRenderAll(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        pan.spaceDown = false;
        pan.dragging = false;
        applyToolState();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // --- 두 손가락 확대/이동 + 손바닥 무시 ---
    const touch = { multi: false, startDist: 0, startZoom: 1, lastMidX: 0, lastMidY: 0 };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        touch.multi = true;
        touch.startDist = dist(e.touches);
        touch.startZoom = canvas.getZoom();
        const m = mid(e.touches);
        touch.lastMidX = m.x; touch.lastMidY = m.y;
        canvas.isDrawingMode = false;
        canvas.selection = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !touch.multi) return;
      if (e.cancelable) e.preventDefault();
      const m = mid(e.touches);
      canvas.relativePan(new fabric.Point(m.x - touch.lastMidX, m.y - touch.lastMidY));
      const zoom = Math.min(20, Math.max(0.05, touch.startZoom * (dist(e.touches) / touch.startDist)));
      const rect = container.getBoundingClientRect();
      canvas.zoomToPoint(new fabric.Point(m.x - rect.left, m.y - rect.top), zoom);
      canvas.requestRenderAll();
      touch.lastMidX = m.x; touch.lastMidY = m.y;
      propsRef.current.onZoomChange?.(zoom);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touch.multi && e.touches.length < 2) {
        touch.multi = false;
        applyToolState();
        forceRender(n => n + 1);
      }
    };
    let lastPenTime = 0;
    // 펜(애플 펜슬)을 한 번이라도 쓰면, 그 뒤로 손가락 한 개는 그리지 않고 화면만 옮긴다
    // 이 기기에서 펜슬을 쓴 적이 있으면 처음부터 '펜 모드' (다시 열어도 첫 손가락이 펜으로 그어지지 않게)
    let penSeen = deviceHasPen();
    const fingerPan = { id: -1, x: 0, y: 0 };
    const hoverDot = document.createElement('div');
    hoverDot.setAttribute('aria-hidden', 'true');
    hoverDot.style.cssText = 'position:fixed;left:0;top:0;border-radius:9999px;pointer-events:none;z-index:45;display:none;will-change:transform;box-shadow:0 0 0 1px rgba(255,255,255,.9);';
    // React가 그리는 판서 상자 안에 넣으면 화면이 바뀔 때 React와 부딪혀 앱이 멈춘다 → 페이지 맨 위층에 둔다
    document.body.appendChild(hoverDot);
    const drawingNow = () => canvas.isDrawingMode || ['eraser', 'laser', 'rect', 'circle', 'triangle', 'line', 'arrow', 'text', 'bucket', 'magnify', 'clip', 'flashcard'].includes(toolRef.current as string);
    const fingerPansNow = () => penSeen && getPenSettings().fingerPans && drawingNow();
    const onPenFirstSeen = () => {
      if (penSeen) return;
      penSeen = true;
      rememberPen();
      try {
        if (!sessionStorage.getItem('okssam_pen_toast')) {
          sessionStorage.setItem('okssam_pen_toast', '1');
          if (getPenSettings().fingerPans) toast('애플 펜슬을 쓰고 있습니다.', { description: '펜으로는 쓰고, 손가락으로는 화면을 옮기거나 두 손가락으로 확대합니다. (설정에서 바꿀 수 있습니다)', duration: 6000 });
        }
      } catch { /* 무시 */ }
    };
    // 펜 끝 미리보기: 한 프레임에 한 번만, 위치는 transform으로 (레이아웃을 다시 계산하지 않아 배터리 절약)
    const hover = { raf: 0, x: 0, y: 0, rect: null as DOMRect | null };
    const showHover = (e: PointerEvent) => {
      if (!canvas.isDrawingMode) { hoverDot.style.display = 'none'; return; }
      hover.x = e.clientX; hover.y = e.clientY;
      if (hover.raf) return;
      hover.raf = requestAnimationFrame(() => {
        hover.raf = 0;
        const size = Math.max(4, (canvas.freeDrawingBrush?.width || 4) * canvas.getZoom());
        hoverDot.style.width = hoverDot.style.height = `${size}px`;
        hoverDot.style.background = (canvas.freeDrawingBrush?.color as string) || '#000';
        hoverDot.style.opacity = '0.55';
        hoverDot.style.transform = `translate(${hover.x - size / 2}px, ${hover.y - size / 2}px)`;
        hoverDot.style.display = 'block';
      });
    };
    /** 체크 목록 줄 앞(☐)을 누르면 체크/해제 (선택·지우개 도구 제외) */
    const toggleCheckAt = (e: PointerEvent): boolean => {
      const t = toolRef.current;
      if (t === 'select' || t === 'eraser' || t === 'lasso') return false;
      if (e.pointerType === 'touch' && fingerPansNow()) return false;
      const rect = canvas.upperCanvasEl.getBoundingClientRect();
      const sp = fabric.util.transformPoint(new fabric.Point(e.clientX - rect.left, e.clientY - rect.top), fabric.util.invertTransform(canvas.viewportTransform));
      const objs = canvas.getObjects() as any[];
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (!o.checklist || !o.visible || o.isEditing || !o.containsPoint(sp)) continue;
        const local = fabric.util.transformPoint(sp, fabric.util.invertTransform(o.calcTransformMatrix()));
        const x = local.x + o.width / 2, y = local.y + o.height / 2;
        if (x > o.fontSize * 1.6) return false; // 줄 앞 상자만
        let acc = 0, wrapped = -1;
        for (let li = 0; li < o._textLines.length; li++) { const h = o.getHeightOfLine(li); if (y < acc + h) { wrapped = li; break; } acc += h; }
        if (wrapped < 0) return false;
        const map = o._styleMap?.[wrapped];
        if (map && map.offset !== 0) return false;
        const line = map ? map.line : wrapped;
        const lines = String(o.text).split('\n');
        const cur = lines[line] || '';
        if (!/^[☐☑]/.test(cur)) return false;
        lines[line] = (cur[0] === '☑' ? '☐' : '☑') + cur.slice(1);
        o.set({ text: lines.join('\n') });
        o.initDimensions?.();
        canvas.requestRenderAll();
        commitChange();
        return true;
      }
      return false;
    };
    const flipFlashAt = (e: PointerEvent): boolean => {
      const t = toolRef.current;
      if (t === 'select' || t === 'eraser' || t === 'lasso' || t === 'flashcard') return false;
      if (e.pointerType === 'touch' && fingerPansNow()) return false;
      const rect = canvas.upperCanvasEl.getBoundingClientRect();
      const sp = fabric.util.transformPoint(new fabric.Point(e.clientX - rect.left, e.clientY - rect.top), fabric.util.invertTransform(canvas.viewportTransform));
      const objs = canvas.getObjects() as any[];
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (o.isFlash && o.visible && o.containsPoint(sp)) {
          o.__revealed = !o.__revealed;
          o.set({ opacity: o.__revealed ? 0.12 : 1 });
          canvas.requestRenderAll();
          return true;
        }
      }
      return false;
    };
    const blockPenHover = (e: any) => {
      notePointer(e);
      if (e.type === 'pointerdown' && (e.buttons || e.pointerType !== 'pen' || e.pressure > 0) && (toggleCheckAt(e) || flipFlashAt(e))) { e.stopPropagation(); e.preventDefault(); return; }
      if (e.pointerType === 'pen') {
        onPenFirstSeen();
        const hovering = e.type === 'pointermove' && e.buttons === 0;
        if (hovering) {
          // 펜을 화면에 대지 않고 띄워 둔 상태(호버, 펜슬 프로·2세대): 어디에 써질지 점으로만 보여 준다.
          // 기본 동작은 막지 않는다 (아이패드 자체 호버 미리보기와 부딪히지 않게)
          showHover(e);
          e.stopPropagation();
        } else {
          lastPenTime = Date.now(); // 손바닥 무시는 실제로 닿았을 때부터
          if (hover.raf) { cancelAnimationFrame(hover.raf); hover.raf = 0; }
          hoverDot.style.display = 'none';
        }
      } else if (e.pointerType === 'touch') {
        if (fingerPansNow()) {
          // 손가락 한 개 = 화면 옮기기 (그리지 않음)
          e.stopPropagation();
          if (e.type === 'pointerdown' && fingerPan.id === -1) { fingerPan.id = e.pointerId; fingerPan.x = e.clientX; fingerPan.y = e.clientY; }
          else if (e.type === 'pointermove' && e.pointerId === fingerPan.id && !touch.multi) {
            canvas.relativePan(new fabric.Point(e.clientX - fingerPan.x, e.clientY - fingerPan.y));
            fingerPan.x = e.clientX; fingerPan.y = e.clientY;
            canvas.requestRenderAll();
            propsRef.current.onViewChange?.();
          }
          return;
        }
        if (Date.now() - lastPenTime < 1500) e.stopPropagation(); // 펜 사용 직후 손바닥 터치 무시
      }
    };
    const endFingerPan = (e: PointerEvent) => {
      if (e.pointerId === fingerPan.id) { fingerPan.id = -1; forceRender(n => n + 1); }
      if (e.pointerType === 'pen') hoverDot.style.display = 'none';
    };
    const hideHover = () => { hoverDot.style.display = 'none'; };
    /** 쓰던 선 버리기 (두 손가락 확대가 시작될 때 첫 손가락으로 시작된 점·선) */
    let suppressTouches = false;
    const cancelStroke = () => {
      const br: any = canvas.freeDrawingBrush;
      if (br?.cancelStroke) br.cancelStroke();
      else { br?._reset?.(); canvas.clearContext(canvas.contextTop); }
      // 판서 엔진의 '그리는 중' 상태도 끈다 → 손을 뗄 때 빈 선(점)을 마무리하지 않음
      (canvas as any)._isCurrentlyDrawing = false;
      suppressTouches = true; // 손가락을 모두 뗄 때까지 판서 엔진에 터치를 보내지 않는다
    };
    const blockPalm = (e: TouchEvent) => {
      let stylus = false;
      for (let i = 0; i < e.touches.length; i++) {
        if ((e.touches[i] as any).touchType === 'stylus') { stylus = true; lastPenTime = Date.now(); onPenFirstSeen(); }
      }
      if (e.touches.length >= 2 && !stylus) {
        // 두 손가락 = 확대·이동만. 판서 엔진에 닿기 전에 여기서 처리한다 (첫 닿는 순간 점이 찍히지 않게)
        if (!suppressTouches) cancelStroke();
        if (e.type === 'touchstart') onTouchStart(e); else onTouchMove(e);
        e.stopPropagation();
        return;
      }
      if (suppressTouches && !stylus) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); return; }
      if (e.touches.length === 1 && !stylus && (fingerPansNow() || Date.now() - lastPenTime < 1500)) e.stopPropagation();
    };
    const endTouches = (e: TouchEvent) => { if (e.touches.length === 0) suppressTouches = false; };
    const cap = { capture: true, passive: false } as AddEventListenerOptions;
    container.addEventListener('pointerdown', blockPenHover, cap);
    container.addEventListener('pointermove', blockPenHover, cap);
    container.addEventListener('touchstart', blockPalm, cap);
    container.addEventListener('touchmove', blockPalm, cap);
    container.addEventListener('pointerup', endFingerPan, true);
    container.addEventListener('pointercancel', endFingerPan, true);
    container.addEventListener('pointerleave', hideHover);
    container.addEventListener('touchend', endTouches, true);
    container.addEventListener('touchcancel', endTouches, true);
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    // --- 크기 변경 ---
    const ro = new ResizeObserver(() => {
      hover.rect = null;
      canvas.setDimensions({ width: container.clientWidth, height: container.clientHeight });
      canvas.requestRenderAll();
      const lc = laserCanvasRef.current;
      if (lc) {
        const dpr = window.devicePixelRatio || 1;
        lc.width = Math.round(container.clientWidth * dpr);
        lc.height = Math.round(container.clientHeight * dpr);
      }
      propsRef.current.onResize?.();
    });
    ro.observe(container);

    return () => {
      container.removeEventListener('pointerdown', blockPenHover, cap);
      container.removeEventListener('pointermove', blockPenHover, cap);
      container.removeEventListener('touchstart', blockPalm, cap);
      container.removeEventListener('touchmove', blockPalm, cap);
      container.removeEventListener('pointerup', endFingerPan, true);
      container.removeEventListener('pointercancel', endFingerPan, true);
      container.removeEventListener('pointerleave', hideHover);
      hoverDot.remove();
      clearTimeout(hd.timer);
      container.removeEventListener('touchend', endTouches, true);
      container.removeEventListener('touchcancel', endTouches, true);
      if (hover.raf) cancelAnimationFrame(hover.raf);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      ro.disconnect();
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 슬라이드 불러오기 (슬라이드 전환 또는 외부 변경 시) ----------
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const token = ++loadTokenRef.current;
    const switchingScene = currentSceneIdRef.current !== sceneId;
    currentSceneIdRef.current = sceneId;
    isLoadingRef.current = true;
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    canvas.discardActiveObject();
    eraserCursorRef.current = null;
    (async () => {
      try {
        await loadCanvasData(canvas, sceneData, getCanvas);
      } catch (err) {
        console.error('슬라이드를 불러오지 못했습니다', err);
        toast.error('슬라이드 일부를 불러오지 못했습니다.');
      }
      if (token !== loadTokenRef.current) return; // 더 최근의 불러오기가 시작됨
      afterLoad();
      const pagesAfterLoad = stackedPages();
      if (switchingScene && pagesAfterLoad.length > 1) {
        fitRect(pagesAfterLoad[0].getBoundingRect());
      } else if (propsRef.current.autoFit) {
        fitToContent();
      } else if (switchingScene) {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        propsRef.current.onZoomChange?.(1);
      }
      attachHistory(sceneId);
      isLoadingRef.current = false;
      setHasSelection(false);
      propsRef.current.onCanvasChange?.({ sceneId, canvas, data: '', fromLoad: true });
      forceRender(n => n + 1);
    })();
    // sceneData는 sceneId/sceneRevision이 바뀔 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, sceneRevision]);

  // ---------- 도구 / 펜 설정 ----------
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (tool !== 'select') {
      canvas.discardActiveObject();
      setHasSelection(false);
    }
    applyToolState();
    if (tool === 'select' && pendingSelectRef.current) {
      const objs = pendingSelectRef.current.filter(o => canvas.getObjects().includes(o));
      pendingSelectRef.current = null;
      if (objs.length) {
        canvas.discardActiveObject();
        canvas.setActiveObject(objs.length === 1 ? objs[0] : new fabric.ActiveSelection(objs, { canvas }));
        canvas.requestRenderAll();
      }
    }
    if (canvas.isDrawingMode) {
      const brush = canvas.freeDrawingBrush instanceof PressureBrush ? canvas.freeDrawingBrush : new PressureBrush(canvas);
      brush.pressureEnabled = getPenSettings().pressure && PRESSURE_TOOLS.includes(tool);
      const hex = color.startsWith('#') && color.length === 7;
      let width = brushSize, c = color;
      let cap: CanvasLineCap = 'round', join: CanvasLineJoin = 'round';
      switch (tool) {
        case 'pencil': width = Math.max(1.5, brushSize / 2); c = hex ? `${color}b3` : color; break;
        case 'fountain': width = brushSize * 2.5; cap = 'square'; join = 'miter'; break;
        case 'highlighter': width = brushSize * 4; c = hex ? `${color}55` : color; cap = 'square'; break;
        case 'lasso': width = 2; c = '#3b82f6'; break;
      }
      brush.color = c;
      brush.width = width;
      brush.strokeLineCap = cap;
      brush.strokeLineJoin = join;
      brush.strokeDashArray = tool === 'lasso' ? [6, 6] : null;
      brush.decimate = 1.2;
      canvas.freeDrawingBrush = brush;
    }
  }, [tool, color, brushSize, applyToolState]);

  // ---------- 선택된 객체에 색 적용 (색을 바꿀 때만) ----------
  const prevColorRef = useRef(color);
  useEffect(() => {
    if (prevColorRef.current === color) return;
    prevColorRef.current = color;
    const canvas = fabricRef.current;
    if (!canvas || toolRef.current !== 'select') return;
    const objs = canvas.getActiveObjects();
    let changed = false;
    objs.forEach((o: any) => {
      if (o.type === 'image' || o instanceof fabric.Group) return;
      if (TEXT_TYPES.has(o.type)) o.set('fill', color);
      else o.set('stroke', color);
      changed = true;
    });
    if (changed) { canvas.requestRenderAll(); commitChange(); }
  }, [color, commitChange]);

  // ---------- 배경 ----------
  useEffect(() => { applyBackground(); }, [canvasBackground, applyBackground]);

  const vpt = fabricRef.current?.viewportTransform || [1, 0, 0, 1, 0, 0];

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full h-full overflow-hidden relative transition-colors duration-300 touch-none',
      )}
      style={{ backgroundColor: backgroundColor(canvasBackground) }}
    >
      <canvas ref={bgCanvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }} aria-hidden="true" />
      <canvas ref={canvasRef} />
      <canvas ref={laserCanvasRef} className="absolute inset-0 pointer-events-none z-[90]" style={{ width: '100%', height: '100%' }} aria-hidden="true" />

      {/* 다른 참여자의 커서 */}
      {cursors?.map(cursor => {
        const domX = cursor.x * vpt[0] + vpt[4];
        const domY = cursor.y * vpt[3] + vpt[5];
        return (
          <div
            key={cursor.id}
            className="absolute left-0 top-0 z-[100] pointer-events-none transition-transform duration-75 ease-linear"
            style={{ transform: `translate(${domX}px, ${domY}px)` }}
          >
            <svg className="w-5 h-5 drop-shadow-md" style={{ color: cursor.color }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 01.35-.15h6.87a.5.5 0 00.35-.85L6.35 2.85a.5.5 0 00-.85.35z" />
            </svg>
            <div className="absolute top-5 left-5 text-white text-[11px] px-1.5 py-0.5 rounded-sm whitespace-nowrap shadow-sm font-medium" style={{ backgroundColor: cursor.color }}>
              {cursor.name}
            </div>
          </div>
        );
      })}

      {/* 선택한 객체용 작업 막대 */}
      {hasSelection && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-white/95 backdrop-blur-xl p-1.5 rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.25)]">
          <ActionButton onClick={handleCopy} title="복사 (Ctrl+C)">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </ActionButton>
          <ActionButton onClick={handlePaste} title="붙여넣기 (Ctrl+V)">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          </ActionButton>
          {canGroup && (
            <ActionButton onClick={handleGroup} title="그룹으로 묶기 (Ctrl+G)">
              <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><path d="M10 6.5h4" /><path d="M10 17.5h4" /><path d="M6.5 10v4" /><path d="M17.5 10v4" />
            </ActionButton>
          )}
          {isGroupSelected && (
            <ActionButton onClick={handleUngroup} title="그룹 풀기 (Ctrl+Shift+G)">
              <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
            </ActionButton>
          )}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <ActionButton onClick={handleDeleteSelected} title="삭제 (Delete)" danger>
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
          </ActionButton>
        </div>
      )}
    </div>
  );
}));

const ActionButton: React.FC<{ onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }> = ({ onClick, title, danger, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={cn(
      'flex items-center justify-center w-10 h-10 rounded-xl transition-colors',
      danger ? 'text-red-500 hover:bg-red-50 hover:text-red-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    )}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  </button>
);
