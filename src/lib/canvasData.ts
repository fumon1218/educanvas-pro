import * as fabric from 'fabric';

/** 캔버스 직렬화 시 함께 저장할 사용자 정의 속성 */
export const EXTRA_PROPS = ['id', 'locked', 'isBackground', 'isVideo', 'isAudio', 'audioUrl', 'isWebLink', 'url', 'clipStart', 'clipEnd', 'isModel', 'modelId', 'modelName', 'driveId', 'isScore', 'scoreData', 'scoreTitle', 'scoreKey', 'scoreBoxes', 'pageNo', 'docId', 'docPage', 'isFlash', 'flashBox', 'flashDue'];

/** 세션 동안 살아 있는 동영상 요소 (blob URL → video element) */
export const videoRegistry = new Map<string, HTMLVideoElement>();

export const newId = () => Math.random().toString(36).slice(2, 11);

export function serializeCanvas(canvas: fabric.StaticCanvas): string {
  return JSON.stringify(canvas.toObject(EXTRA_PROPS));
}

/** 예전 버전에서 이중 문자열로 저장된 데이터도 읽을 수 있도록 정규화 */
export function normalizeSceneData(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return JSON.stringify(raw);
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return normalizeSceneData(parsed);
    return raw;
  } catch {
    return null;
  }
}

/** 동영상 재생 중 캔버스를 계속 다시 그리도록 연결 */
export function attachVideoRenderLoop(video: HTMLVideoElement, getCanvas: () => fabric.StaticCanvas | null) {
  if ((video as any).__loopAttached) return;
  (video as any).__loopAttached = true;
  const loop = () => {
    const c = getCanvas();
    c?.requestRenderAll();
    if (!video.paused && !video.ended) requestAnimationFrame(loop);
  };
  video.addEventListener('play', () => requestAnimationFrame(loop));
  video.addEventListener('seeked', () => getCanvas()?.requestRenderAll());
}

function makePlaceholder(props: any, label: string) {
  const w = Math.max(160, (props.width || 320) * (props.scaleX || 1));
  const h = Math.max(90, (props.height || 180) * (props.scaleY || 1));
  const g = new fabric.Group([
    new fabric.Rect({ width: w, height: h, fill: '#f3f4f6', stroke: '#9ca3af', strokeWidth: 2, strokeDashArray: [8, 6], rx: 12, ry: 12 }),
    new fabric.FabricText(label, { fontSize: 16, fill: '#6b7280', left: 16, top: h / 2 - 10, fontFamily: 'sans-serif' }),
  ], { left: props.left, top: props.top, angle: props.angle || 0 });
  (g as any).id = props.id || newId();
  return g;
}

/**
 * 장면 데이터를 캔버스에 불러온다.
 * 동영상 객체는 JSON으로 복원할 수 없으므로 세션의 video 요소로 다시 연결하고,
 * 없으면(새로고침 후 등) 자리표시자를 넣는다. 일부 객체가 깨져도 나머지는 불러온다.
 */
export async function loadCanvasData(canvas: fabric.StaticCanvas, data: string | null, getCanvas?: () => fabric.StaticCanvas | null) {
  canvas.clear();
  if (!data) return;
  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    return;
  }
  const objects: any[] = Array.isArray(json.objects) ? json.objects : [];
  const videos: { index: number; obj: any }[] = [];
  const rest: any[] = [];
  objects.forEach((o, index) => {
    if (o && o.isVideo) videos.push({ index, obj: o });
    else rest.push(o);
  });

  try {
    await canvas.loadFromJSON({ ...json, objects: rest });
  } catch (err) {
    console.warn('일부 객체를 불러오지 못했습니다. 객체별로 다시 시도합니다.', err);
    canvas.clear();
    for (const o of rest) {
      try {
        const [obj] = await fabric.util.enlivenObjects<fabric.FabricObject>([o]);
        if (obj) canvas.add(obj);
      } catch (e) {
        console.warn('객체 복원 실패', o?.type, e);
      }
    }
  }

  for (const { index, obj } of videos) {
    const el = videoRegistry.get(obj.src);
    let target: fabric.FabricObject;
    if (el) {
      const { type, version, src, filters, resizeFilter, crossOrigin, ...props } = obj;
      const img = new fabric.FabricImage(el, { ...props, objectCaching: false });
      (img as any).isVideo = true;
      (img as any).id = obj.id || newId();
      if (getCanvas) attachVideoRenderLoop(el, getCanvas);
      target = img;
    } else {
      target = makePlaceholder(obj, '🎬 동영상 (파일을 다시 넣어 주세요)');
    }
    canvas.insertAt(Math.min(index, canvas.getObjects().length), target);
  }
}

/** 장면의 내용 영역을 이미지로 렌더링 (PDF 내보내기용) */
export async function renderSceneImage(
  data: string | null,
  width: number,
  height: number,
  background: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height, enableRetinaScaling: false });
  await loadCanvasData(sc, data);
  sc.backgroundColor = background;

  let left = 0, top = 0, w = width, h = height;
  const objs = sc.getObjects().filter(o => o.visible !== false);
  if (objs.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objs.forEach(o => {
      const r = o.getBoundingRect();
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.left + r.width);
      maxY = Math.max(maxY, r.top + r.height);
    });
    const pad = 40;
    left = minX - pad; top = minY - pad;
    w = maxX - minX + pad * 2; h = maxY - minY + pad * 2;
    // 내용이 화면보다 작으면 화면 크기 기준으로 (판서 위치감 유지)
    if (minX >= 0 && minY >= 0 && maxX <= width && maxY <= height) {
      left = 0; top = 0; w = width; h = height;
    }
  }
  const multiplier = Math.min(2, 3000 / Math.max(w, h));
  // 영역 밖 객체도 그리기 위해 뷰포트를 이동
  sc.setDimensions({ width: w, height: h });
  sc.setViewportTransform([1, 0, 0, 1, -left, -top]);
  sc.renderAll();
  const dataUrl = sc.toDataURL({ format: 'jpeg', quality: 0.92, multiplier });
  sc.dispose();
  return { dataUrl, width: w, height: h };
}

/** 이미지 한 장을 화면 가운데에 배치한 장면 데이터를 만든다 (PDF 페이지별 슬라이드) */
export async function createImageScene(dataUrl: string, width: number, height: number, doc?: { docId: string; docPage: number }): Promise<string> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height, enableRetinaScaling: false });
  const img = await fabric.FabricImage.fromURL(dataUrl);
  const safeW = width - 100;
  const safeH = height - 200;
  img.scale(Math.min(safeW / img.width, safeH / img.height));
  // PDF 페이지는 '배경'으로 잠가서 판서 중에 끌려 움직이지 않게 한다 (레이어에서 잠금 해제 가능)
  img.set({
    cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false,
    selectable: false, evented: false,
    lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
    shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.22)', blur: 22, offsetX: 0, offsetY: 6 }),
  });
  (img as any).id = newId();
  (img as any).locked = true;
  (img as any).isBackground = true;
  if (doc) { (img as any).docId = doc.docId; (img as any).docPage = doc.docPage; }
  sc.add(img);
  sc.centerObject(img);
  const out = serializeCanvas(sc);
  sc.dispose();
  return out;
}

/** PDF 여러 쪽을 한 슬라이드에 위에서 아래로 이어 붙인 장면 (PageDown으로 한 쪽씩 넘긴다) */
export async function createStackedPdfScene(pages: string[], firstPageNo: number, width: number, docId?: string | null): Promise<string> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height: 800, enableRetinaScaling: false });
  const pageW = Math.max(400, width - 100);
  let y = 40;
  for (let i = 0; i < pages.length; i++) {
    const img = await fabric.FabricImage.fromURL(pages[i]);
    img.scale(pageW / img.width);
    img.set({
      originX: 'left', originY: 'top', left: (width - pageW) / 2, top: y,
      selectable: false, evented: false,
      lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
      cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false,
      shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.22)', blur: 22, offsetX: 0, offsetY: 6 }),
    });
    (img as any).id = newId();
    (img as any).locked = true;
    (img as any).isBackground = true;
    (img as any).pageNo = firstPageNo + i;
    if (docId) { (img as any).docId = docId; (img as any).docPage = firstPageNo + i; }
    sc.add(img);
    y += img.getScaledHeight() + 32;
  }
  const out = serializeCanvas(sc);
  sc.dispose();
  return out;
}

/** 악보 한 페이지를 화면 가운데에 놓은 장면 데이터 (선택하면 연주 막대가 나타난다) */
export async function createScoreScene(svg: string, scoreData: string, title: string, width: number, height: number, extra: { scoreKey?: string; scoreBoxes?: string } = {}): Promise<string> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height, enableRetinaScaling: false });
  const img = await fabric.FabricImage.fromURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  img.scale(Math.min((width - 80) / img.width, (height - 160) / img.height));
  img.set({ cornerColor: '#3b82f6', cornerSize: 10, transparentCorners: false });
  (img as any).id = newId();
  (img as any).isScore = true;
  (img as any).scoreData = scoreData;
  (img as any).scoreTitle = title;
  if (extra.scoreKey) (img as any).scoreKey = extra.scoreKey;
  if (extra.scoreBoxes) (img as any).scoreBoxes = extra.scoreBoxes;
  sc.add(img);
  sc.centerObject(img);
  const out = serializeCanvas(sc);
  sc.dispose();
  return out;
}

/** 큰 사진을 적당한 크기로 줄여 저장·공유 용량을 줄인다 */
export async function downscaleImageFile(file: File, maxDim = 1920): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const keepPng = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp' || file.type === 'image/svg+xml';
    return keepPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** http/https 주소만 허용 (javascript: 등 차단) */
export function sanitizeUrl(input: string): string | null {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
