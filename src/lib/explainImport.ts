/**
 * Explain Everything 프로젝트(.explain) 불러오기
 *
 * .explain은 zip 파일이다.
 *   metadata.json            이름, 장면 순서
 *   assets.json              그림·문서 목록
 *   Scenes/<장면>.json       장면에 놓인 것들 (PuppetFamily) + 쌓는 순서 (CanvasHierarchy)
 *   Assets/Documents/*.pdf   넣은 PDF 원본
 *   Assets/Images/*.png      넣은 그림, 펜 글씨를 그린 그림(DrawingSnapshot)
 *   Assets/Thumbnail/*.png   개체마다 작은 미리보기
 *
 * 개체(puppet)는 크기(Size)와 변환 행렬(Transform: x' = M11·x + M21·y + Tx, y' = M12·x + M22·y + Ty,
 * 원점은 개체의 왼쪽 위)을 가진다. 이 행렬을 그대로 옮겨 놓는다.
 *  - 문서(PDF 쪽)  → 쪽 그림 (확대하면 원본에서 고화질로 다시 그림)
 *  - 그림          → 그림
 *  - 펜·형광펜     → Explain Everything이 저장해 둔 글씨 그림 (모양 그대로)
 *  - 도형(선·사각형) → 선·도형
 *  - 그 밖(글 상자 등) → 미리보기 그림
 * 녹화(타임라인·소리)는 가져오지 않는다.
 */
import * as fabric from 'fabric';
import { serializeCanvas } from './canvasData';
import { pdfSource } from './docImport';
import { saveDoc } from './hdRender';

export const isExplainFile = (f: File) => /\.explain$/i.test(f.name);

/** 화면으로 옮길 때 키우는 배율 (Explain Everything 좌표는 작다) */
const WORLD = 4;
const newId = () => Math.random().toString(36).slice(2, 11);
type M6 = [number, number, number, number, number, number];
const mul = (a: M6, b: M6): M6 => fabric.util.multiplyTransformMatrices(a as any, b as any) as unknown as M6;
const rgba = (c?: { R: number; G: number; B: number; A: number }) => (c ? `rgba(${Math.round(c.R * 255)},${Math.round(c.G * 255)},${Math.round(c.B * 255)},${+c.A.toFixed(3)})` : 'transparent');

export interface ExplainResult { name: string; scenes: { name: string; data: string }[]; skipped: number }

export async function importExplain(file: File, onStatus?: (s: string) => void): Promise<ExplainResult> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const readJson = async (p: string) => { const f = zip.file(p); return f ? JSON.parse(await f.async('string')) : null; };
  const meta = await readJson('metadata.json');
  const assets = await readJson('assets.json');
  if (!meta || !zip.folder('Scenes')) throw new Error('Explain Everything 프로젝트가 아닙니다.');
  const name = String(meta.Name || file.name).replace(/\.(explain|pdf|pptx?|key|docx?)$/i, '') || 'Explain Everything';

  // --- 파일 꺼내기 ---------------------------------------------------------
  const blobUrl = new Map<string, Promise<string | null>>();
  const dataUrlOf = (path: string) => {
    let p = blobUrl.get(path);
    if (!p) {
      const f = zip.file(path);
      p = f ? f.async('base64').then(b => `data:image/${/\.jpe?g$/i.test(path) ? 'jpeg' : 'png'};base64,${b}`) : Promise.resolve(null);
      blobUrl.set(path, p);
    }
    return p;
  };
  const imageAsset = (id: string) => {
    const a = (assets?.ImageAssets || []).find((x: any) => x.UniqueID === id);
    return dataUrlOf(`Assets/Images/${id}.${a?.Extension || 'png'}`);
  };
  const thumbAsset = (id: string) => dataUrlOf(`Assets/Thumbnail/${id}.png`);

  // 문서(PDF)는 쪽마다 한 번만 그린다
  const docs = new Map<string, Promise<{ render: (i: number) => Promise<string>; docId: string | null } | null>>();
  const docOf = (id: string) => {
    let p = docs.get(id);
    if (!p) {
      p = (async () => {
        const a = (assets?.DocumentAssets || []).find((x: any) => x.UniqueID === id);
        const f = zip.file(`Assets/Documents/${id}.${a?.Extension || 'pdf'}`);
        if (!f || (a?.Extension && a.Extension.toLowerCase() !== 'pdf')) return null;
        const buf = await f.async('arraybuffer');
        const docId = await saveDoc(buf.slice(0), 'pdf', a?.Name || name);
        const src = await pdfSource(buf);
        const pages = new Map<number, Promise<string>>();
        return { docId, render: (i: number) => { let r = pages.get(i); if (!r) { r = src.render(i, 1400); pages.set(i, r); } return r; } };
      })();
      docs.set(id, p);
    }
    return p;
  };

  // --- 장면 ----------------------------------------------------------------
  const sceneIds: string[] = (meta.ScenesMetadata || []).map((s: any) => s.UniqueId).filter(Boolean);
  if (!sceneIds.length) zip.folder('Scenes')!.forEach(p => { if (p.endsWith('.json')) sceneIds.push(p.slice(0, -5)); });
  const out: ExplainResult = { name, scenes: [], skipped: 0 };

  for (let si = 0; si < sceneIds.length; si++) {
    onStatus?.(`장면 ${si + 1}/${sceneIds.length} 옮기는 중…`);
    const scene = await readJson(`Scenes/${sceneIds[si]}.json`);
    if (!scene) continue;
    // 개체 모으기 + 쌓는 순서
    const byId = new Map<string, any>();
    const dfs: string[] = [];
    let hier: any = null;
    const walk = (o: any) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (o.CanvasHierarchy) hier = o.CanvasHierarchy;
      if (typeof o.Type === 'string' && o.Type.endsWith('Puppet') && o.Transform) { byId.set(o.UniqueID, o); dfs.push(o.UniqueID); }
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    };
    walk(scene.PuppetFamily);
    const order: string[] = hier?.LayerHierarchies?.flatMap((l: any) => l.GraphicPuppetsUniqueIds || []) || [];
    const ids = [...order.filter(id => byId.has(id)), ...dfs.filter(id => !order.includes(id))];

    const el = document.createElement('canvas');
    const sc = new fabric.StaticCanvas(el, { width: 1200, height: 800, enableRetinaScaling: false });
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || p.IsHidden) continue;
      try {
        const obj = await puppetToObject(p);
        if (!obj) { out.skipped++; continue; }
        (obj as any).id = newId();
        sc.add(obj);
      } catch (e) { console.warn('[explain] 건너뜀', p.Type, e); out.skipped++; }
    }
    // 왼쪽 위로 모으기
    const objs = sc.getObjects();
    if (objs.length) {
      let minX = Infinity, minY = Infinity;
      for (const o of objs) { const r = o.getBoundingRect(); minX = Math.min(minX, r.left); minY = Math.min(minY, r.top); }
      const dx = 80 - minX, dy = 60 - minY;
      for (const o of objs) { o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy }); o.setCoords(); }
    }
    out.scenes.push({ name: sceneIds.length > 1 ? `${name} ${si + 1}` : name, data: serializeCanvas(sc) });
    sc.dispose();
  }
  return out;

  // --- 개체 하나 ---------------------------------------------------------
  async function puppetToObject(p: any): Promise<fabric.FabricObject | null> {
    const T = p.Transform;
    const W: M6 = [T.M11 * WORLD, T.M12 * WORLD, T.M21 * WORLD, T.M22 * WORLD, T.Tx * WORLD, T.Ty * WORLD];
    const size = { w: p.Size?.Width || 1, h: p.Size?.Height || 1 };
    const unit = Math.hypot(T.M11, T.M12) * WORLD; // 개체 좌표 1 = 화면 몇 px

    /** 그림을 개체 좌표 (x, y, w, h) 자리에 놓는다 */
    const placeImage = async (url: string | null, x: number, y: number, w: number, h: number) => {
      if (!url) return null;
      const img = await fabric.FabricImage.fromURL(url);
      const m = mul(W, [w / img.width, 0, 0, h / img.height, x, y]);
      fabric.util.applyTransformToObject(img, mul(m, [1, 0, 0, 1, img.width / 2, img.height / 2]) as any);
      return img;
    };

    switch (p.Type) {
      case 'MCDocumentPuppet': {
        const d = await docOf(p.DocumentAsset);
        if (!d) return placeImage(p.Thumbnail ? await thumbAsset(p.Thumbnail) : null, 0, 0, size.w, size.h);
        const pageNo = (p.PageNumber ?? 0) + 1;
        const img = await placeImage(await d.render(pageNo), 0, 0, size.w, size.h);
        if (!img) return null;
        img.set({
          selectable: false, evented: false, lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
          shadow: p.Shadow?.IsVisible ? new fabric.Shadow({ color: 'rgba(15,23,42,0.2)', blur: 14, offsetX: 0, offsetY: 3 }) : null,
        });
        Object.assign(img as any, { locked: true, isBackground: true, ...(d.docId ? { docId: d.docId, docPage: pageNo } : {}) });
        return img;
      }
      case 'MCImagePuppet':
        return placeImage((await imageAsset(p.ImageAsset)) || (p.Thumbnail ? await thumbAsset(p.Thumbnail) : null), 0, 0, size.w, size.h);
      case 'MCDrawingPuppet': {
        const s = p.DrawingSnapshot;
        if (s?.ImageAsset && s.Rect) return placeImage(await imageAsset(s.ImageAsset), s.Rect.Origin.X, s.Rect.Origin.Y, s.Rect.Size.Width, s.Rect.Size.Height);
        return drawingToPath(p, W, unit);
      }
      case 'MCShapePuppet':
        return shapeToObject(p, W, size, unit);
      default:
        return p.Thumbnail ? placeImage(await thumbAsset(p.Thumbnail), 0, 0, size.w, size.h) : null;
    }
  }
}

const apply = (m: M6, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** 도형: 선·경로는 화면 좌표로 바꿔 그리고, 그 밖은 사각형(테두리·채움) */
function shapeToObject(p: any, W: M6, size: { w: number; h: number }, unit: number): fabric.FabricObject | null {
  const sh = p.Shape || {};
  const stroke = rgba(p.BorderColor);
  const strokeWidth = Math.max(0.5, (p.BorderWidth || 1) * unit);
  const fill = p.FillColor && p.FillColor.A > 0 ? rgba(p.FillColor) : '';
  const els: any[] | undefined = sh.Path?.Elements;
  const pt = (q: any) => { const r = apply(W, q.X * size.w, q.Y * size.h); return `${r.x.toFixed(2)} ${r.y.toFixed(2)}`; };
  let d = '';
  if (els?.length) {
    for (const e of els) {
      if (e.T === 0) d += `M ${pt(e.P1)} `;
      else if (e.T === 1) d += `L ${pt(e.P1)} `;
      else if (e.T === 2 && e.P2) d += `Q ${pt(e.P1)} ${pt(e.P2)} `;
      else if (e.T === 3 && e.P3) d += `C ${pt(e.P1)} ${pt(e.P2)} ${pt(e.P3)} `;
      else if (e.T === 4) d += 'Z ';
      else if (e.P1) d += `L ${pt(e.P1)} `;
    }
  } else {
    const c = [[0, 0], [size.w, 0], [size.w, size.h], [0, size.h]].map(([x, y]) => apply(W, x, y));
    if (sh.Type === 1) {
      // 타원
      const k = 0.5523;
      const P = (u: number, v: number) => { const r = apply(W, size.w * (0.5 + u / 2), size.h * (0.5 + v / 2)); return `${r.x.toFixed(2)} ${r.y.toFixed(2)}`; };
      d = `M ${P(1, 0)} C ${P(1, k)} ${P(k, 1)} ${P(0, 1)} C ${P(-k, 1)} ${P(-1, k)} ${P(-1, 0)} C ${P(-1, -k)} ${P(-k, -1)} ${P(0, -1)} C ${P(k, -1)} ${P(1, -k)} ${P(1, 0)} Z`;
    } else d = `M ${c.map(q => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' L ')} Z`;
  }
  if (!d.trim()) return null;
  return new fabric.Path(d, { fill: fill || '', stroke, strokeWidth, strokeLineCap: 'round', strokeLineJoin: 'round', objectCaching: true });
}

/** 글씨 그림이 없을 때: 점들을 이어 선으로 */
function drawingToPath(p: any, W: M6, unit: number): fabric.FabricObject | null {
  const lines: any[] = p.Drawing?.Lines || [];
  const paths = lines.filter(l => l.Points?.length).map(l => {
    const d = l.Points.map((q: any, i: number) => { const r = apply(W, q.X, q.Y); return `${i ? 'L' : 'M'} ${r.x.toFixed(2)} ${r.y.toFixed(2)}`; }).join(' ');
    return new fabric.Path(d, { fill: '', stroke: rgba(l.Color), strokeWidth: Math.max(1, (l.Thickness || 2) * unit * 2.8), strokeLineCap: 'round', strokeLineJoin: 'round' });
  });
  if (!paths.length) return null;
  return paths.length === 1 ? paths[0] : new fabric.Group(paths);
}
