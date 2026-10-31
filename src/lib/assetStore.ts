import { storeName } from './testMode';
/**
 * 3D 자산함: GLB 파일을 이 브라우저(IndexedDB)에 보관한다.
 * 수업 파일(.json)에는 모델 자체가 아니라 모델 번호와 미리보기만 들어간다.
 */
export interface ModelAsset {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  thumb?: string; // PNG data URL
  /** 구글 드라이브에서 가져온 파일이면 그 파일 번호 (다른 컴퓨터에서 다시 받을 때 쓴다) */
  driveId?: string;
  /** 3D 모델에 붙인 이름표 */
  labels?: ModelLabel[];
}

export interface ModelLabel {
  id: string;
  text: string;
  /** 모델 좌표계의 위치 */
  p: [number, number, number];
}

interface ModelRecord extends ModelAsset {
  blob: Blob;
}

const DB_NAME = storeName('okssam-assets');
const STORE = 'models';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    let result: T | undefined;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  });
}

const newAssetId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

/** 같은 이름·크기의 파일이 이미 있으면 그것을 돌려준다 */
export async function addModel(file: Blob & { name?: string }, opts: { id?: string; driveId?: string; name?: string } = {}): Promise<{ asset: ModelAsset; existed: boolean }> {
  const name = opts.name || file.name || '3D 모델.glb';
  const all = await listModels();
  const same = all.find(a => (opts.id && a.id === opts.id) || (opts.driveId && a.driveId === opts.driveId) || (a.name === name && a.size === file.size));
  if (same) {
    if (opts.driveId && !same.driveId) await updateModel(same.id, { driveId: opts.driveId });
    return { asset: { ...same, driveId: same.driveId || opts.driveId }, existed: true };
  }
  const rec: ModelRecord = { id: opts.id || newAssetId(), name, size: file.size, addedAt: Date.now(), blob: file, ...(opts.driveId ? { driveId: opts.driveId } : {}) };
  await tx('readwrite', s => s.put(rec));
  try { await navigator.storage?.persist?.(); } catch { /* 지원하지 않는 브라우저 */ }
  const { blob, ...asset } = rec;
  void blob;
  return { asset, existed: false };
}

export async function listModels(): Promise<ModelAsset[]> {
  const rows = (await tx<ModelRecord[]>('readonly', s => s.getAll())) || [];
  return rows.map(({ blob, ...a }) => { void blob; return a; }).sort((a, b) => b.addedAt - a.addedAt);
}

export async function getModelBlob(id: string): Promise<Blob | null> {
  const rec = await tx<ModelRecord>('readonly', s => s.get(id));
  return rec?.blob ?? null;
}

export async function getModelInfo(id: string): Promise<ModelAsset | null> {
  const rec = await tx<ModelRecord>('readonly', s => s.get(id));
  if (!rec) return null;
  const { blob, ...a } = rec;
  void blob;
  return a;
}

export async function setModelThumb(id: string, thumb: string) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    const g = s.get(id);
    g.onsuccess = () => { if (g.result) s.put({ ...g.result, thumb }); };
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function updateModel(id: string, patch: Partial<Omit<ModelAsset, 'id'>>) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    const g = s.get(id);
    g.onsuccess = () => { if (g.result) s.put({ ...g.result, ...patch }); };
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function deleteModel(id: string) {
  await tx('readwrite', s => s.delete(id));
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}

export const formatBytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)}GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
