/**
 * 브라우저 IndexedDB 저장소. localStorage(약 5MB)와 달리 PDF 이미지가 많은
 * 수업 자료도 저장할 수 있다.
 */
export interface StoredScene {
  id: string;
  name: string;
  data: string | null;
  thumbnail?: string;
  /** 이 슬라이드만의 배경 (없으면 수업 전체 배경) */
  background?: string;
}

export interface StoredProject {
  format: 'educanvas-project';
  version: 1;
  name: string;
  savedAt: string;
  activeSceneId: string;
  canvasBackground: string;
  scenes: StoredScene[];
  /** 내보낸 파일에만: 함께 담은 3D 모델 */
  assets?: { models: PackedModel[] };
}

const DB_NAME = 'educanvas';
const STORE = 'projects';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: StoredProject): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function loadProject(): Promise<StoredProject | null> {
  const db = await openDB();
  const result = await new Promise<StoredProject | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredProject) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export function isValidProject(p: any): p is StoredProject {
  return (
    p && p.format === 'educanvas-project' && Array.isArray(p.scenes) && p.scenes.length > 0 &&
    p.scenes.every((s: any) => typeof s.id === 'string' && typeof s.name === 'string')
  );
}

export function downloadProjectFile(project: StoredProject) {
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `${project.name || '수업자료'}_${date}_옥쌤보드.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 수업 파일에 함께 담는 3D 모델 (다른 컴퓨터·다른 선생님도 그대로 열 수 있게) */
export interface PackedModel {
  id: string;
  name: string;
  driveId?: string;
  labels?: unknown[];
  thumb?: string;
  /** GLB 원본 (data URL) */
  data: string;
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });

/** 슬라이드에서 쓰는 3D 모델을 찾아 수업 파일에 넣는다 */
export async function packModels(project: StoredProject): Promise<{ project: StoredProject; count: number; bytes: number; missing: number }> {
  const ids = new Set<string>();
  for (const s of project.scenes) {
    if (!s.data || !s.data.includes('"isModel"')) continue;
    try { (JSON.parse(s.data).objects || []).forEach((o: any) => { if (o?.isModel && o.modelId) ids.add(o.modelId); }); } catch { /* 무시 */ }
  }
  if (!ids.size) return { project, count: 0, bytes: 0, missing: 0 };
  const { getModelBlob, getModelInfo } = await import('./assetStore');
  const models: PackedModel[] = [];
  let bytes = 0, missing = 0;
  for (const id of ids) {
    const [blob, info] = await Promise.all([getModelBlob(id), getModelInfo(id)]);
    if (!blob || !info) { missing++; continue; }
    bytes += blob.size;
    models.push({ id, name: info.name, driveId: info.driveId, labels: info.labels, thumb: info.thumb, data: await blobToDataUrl(blob) });
  }
  return { project: { ...project, assets: { models } }, count: models.length, bytes, missing };
}

/** 수업 파일에 들어 있던 3D 모델을 이 컴퓨터의 자산함에 넣는다 (이미 있으면 건너뜀) */
export async function unpackModels(p: any): Promise<number> {
  const models: PackedModel[] = Array.isArray(p?.assets?.models) ? p.assets.models : [];
  if (!models.length) return 0;
  const { addModel, getModelInfo, updateModel } = await import('./assetStore');
  let added = 0;
  for (const m of models) {
    if (!m?.id || typeof m.data !== 'string' || !m.data.startsWith('data:')) continue;
    if (await getModelInfo(m.id)) continue;
    const blob = await (await fetch(m.data)).blob();
    await addModel(blob, { id: m.id, name: m.name, driveId: m.driveId });
    await updateModel(m.id, { ...(Array.isArray(m.labels) ? { labels: m.labels as any } : {}), ...(m.thumb ? { thumb: m.thumb } : {}) });
    added++;
  }
  return added;
}
