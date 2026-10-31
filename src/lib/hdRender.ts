/**
 * 고화질 확대: 수업에 넣은 PDF·한글 문서의 원본을 이 기기에 보관해 두었다가,
 * 확대하면 화면에 보이는 부분만 그 배율에 맞춰 다시 그린다(벡터 원본이라 글자가 선명).
 * 저장되는 수업에는 원래 그림만 들어가므로 수업 크기는 늘지 않는다.
 */
import { storeName } from './testMode';

export type DocKind = 'pdf' | 'hwp';
interface StoredDoc { id: string; kind: DocKind; name: string; data: Blob; addedAt: string }

const DB = storeName('okssam-docs');
const STORE = 'docs';
const openDB = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

/** 원본 문서를 보관하고 번호를 돌려준다 (같은 파일은 한 번만) */
export async function saveDoc(data: ArrayBuffer, kind: DocKind, name: string): Promise<string | null> {
  try {
    const id = 'doc-' + hex(await crypto.subtle.digest('SHA-256', data)).slice(0, 24);
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const g = st.get(id);
      g.onsuccess = () => { if (!g.result) st.put({ id, kind, name, data: new Blob([data]), addedAt: new Date().toISOString() } as StoredDoc); };
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
    db.close();
    return id;
  } catch (e) { console.warn('원본 문서 보관 실패(고화질 확대 없이 계속)', e); return null; }
}

async function getDoc(id: string): Promise<StoredDoc | null> {
  try {
    const db = await openDB();
    const d = await new Promise<StoredDoc | null>((res, rej) => { const g = db.transaction(STORE).objectStore(STORE).get(id); g.onsuccess = () => res(g.result || null); g.onerror = () => rej(g.error); });
    db.close();
    return d;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 다시 그리기
// ---------------------------------------------------------------------------

export interface Region { u0: number; v0: number; u1: number; v1: number }
interface Renderer { render(page: number, r: Region, pxW: number): Promise<HTMLCanvasElement | null>; destroy(): void }

const MAX_PIXELS = 16_000_000;

async function pdfRenderer(data: ArrayBuffer): Promise<Renderer> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data }).promise;
  return {
    async render(pageNo, r, pxW) {
      if (pageNo < 1 || pageNo > doc.numPages) return null;
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      let scale = pxW / ((r.u1 - r.u0) * base.width);
      const w = () => Math.round((r.u1 - r.u0) * base.width * scale), h = () => Math.round((r.v1 - r.v0) * base.height * scale);
      if (w() * h() > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / (w() * h()));
      const vp = page.getViewport({ scale, offsetX: -r.u0 * base.width * scale, offsetY: -r.v0 * base.height * scale });
      const c = document.createElement('canvas');
      c.width = Math.max(1, w()); c.height = Math.max(1, h());
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
      page.cleanup();
      return c;
    },
    destroy: () => { void doc.destroy(); },
  };
}

async function hwpRenderer(data: ArrayBuffer): Promise<Renderer> {
  const { loadRhwpModule } = await import('./docImport');
  const mod = await loadRhwpModule();
  const doc = new mod.HwpDocument(new Uint8Array(data));
  const size = new Map<number, { w: number; h: number }>();
  return {
    async render(pageNo, r, pxW) {
      if (pageNo < 1 || pageNo > doc.pageCount()) return null;
      let s = size.get(pageNo);
      if (!s) { const c0 = document.createElement('canvas'); doc.renderPageToCanvas(pageNo - 1, c0, 1); s = { w: c0.width, h: c0.height }; size.set(pageNo, s); }
      // 한글 엔진은 쪽 전체만 그리므로, 필요한 배율로 전체를 그리고 보이는 부분을 잘라 낸다
      let scale = pxW / ((r.u1 - r.u0) * s.w);
      if (s.w * scale * s.h * scale > MAX_PIXELS * 1.5) scale = Math.sqrt((MAX_PIXELS * 1.5) / (s.w * s.h));
      const full = document.createElement('canvas');
      doc.renderPageToCanvas(pageNo - 1, full, scale);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round((r.u1 - r.u0) * full.width)); out.height = Math.max(1, Math.round((r.v1 - r.v0) * full.height));
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(full, r.u0 * full.width, r.v0 * full.height, out.width, out.height, 0, 0, out.width, out.height);
      full.width = full.height = 0;
      return out;
    },
    destroy: () => { try { doc.free?.(); } catch { /* 무시 */ } },
  };
}

// 최근에 쓴 문서 3개까지 열어 둔다
const open = new Map<string, Promise<Renderer | null>>();
export function getRenderer(docId: string): Promise<Renderer | null> {
  let p = open.get(docId);
  if (p) { open.delete(docId); open.set(docId, p); return p; }
  p = (async () => {
    const d = await getDoc(docId);
    if (!d) return null;
    const buf = await d.data.arrayBuffer();
    try { return d.kind === 'pdf' ? await pdfRenderer(buf) : await hwpRenderer(buf); }
    catch (e) { console.warn('고화질 다시 그리기 준비 실패', e); return null; }
  })();
  open.set(docId, p);
  while (open.size > 3) {
    const [k, v] = open.entries().next().value as [string, Promise<Renderer | null>];
    open.delete(k);
    v.then(r => r?.destroy()).catch(() => {});
  }
  return p;
}
