import { storeName } from './testMode';
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
  /** 수업 고유 번호 (드라이브 동기화) */
  lessonId?: string;
  /** 이 수업이 저장된 드라이브 파일과 그때의 수정 시각 */
  driveFileId?: string;
  driveModified?: string;
  /** 내보낸 파일에만: 함께 담은 3D 모델 */
  assets?: { models: PackedModel[] };
}

const DB_NAME = storeName('educanvas');
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

/** 수업 번호가 없던 예전 저장본은 저장 시각으로 같은 수업인지 알아본다 */
export const legacyLessonId = (p: { savedAt?: string }) => 'legacy-' + (p.savedAt || '');
const lessonOf = (p: StoredProject) => p.lessonId || legacyLessonId(p);

const hasContent = (p: StoredProject | null | undefined) =>
  !!p?.scenes?.some(s => { try { return !!s.data && JSON.parse(s.data).objects?.length > 0; } catch { return false; } });

// ---------------------------------------------------------------------------
// 수업 기록 (자동 보관)
//  - 다른 수업을 저장하면 원래 수업을 보관한다 ('다른 수업으로 바뀌기 전')
//  - 같은 수업도 20분마다 한 번씩 그때 모습을 보관한다 ('자동 보관')
//  - 최근 15개까지. 무엇을 해도 저장된 수업이 한 번에 사라지지 않게 한다.
// ---------------------------------------------------------------------------

export type HistoryReason = 'replaced' | 'snapshot' | 'before-restore';
export interface HistoryEntry {
  id: string;
  name: string;
  savedAt: string;
  keptAt: string;
  slides: number;
  reason: HistoryReason;
  lessonId: string;
}
const INDEX_KEY = 'history-index';
const OLD_PREV_KEY = 'previous';
const MAX_HISTORY = 15;
const SNAPSHOT_EVERY_MS = 20 * 60 * 1000;

const reqP = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** 같은 트랜잭션 안에서 기록 한 칸 추가 + 오래된 것 정리 */
function pushHistory(store: IDBObjectStore, index: HistoryEntry[], p: StoredProject, reason: HistoryReason): HistoryEntry[] {
  const id = `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  store.put(p, id);
  const next = [{ id, name: p.name || '수업', savedAt: p.savedAt, keptAt: new Date().toISOString(), slides: p.scenes?.length || 0, reason, lessonId: lessonOf(p) }, ...index];
  for (const old of next.slice(MAX_HISTORY)) store.delete(old.id);
  return next.slice(0, MAX_HISTORY);
}

const runTx = (db: IDBDatabase, fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<void> | void) =>
  new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    Promise.resolve(fn(tx.objectStore(STORE), tx)).catch(err => { try { tx.abort(); } catch { /* 무시 */ } reject(err); });
  });

/** 덮어쓰기 전에 필요하면 지금 저장본을 수업 기록에 보관 */
async function keepHistoryBefore(db: IDBDatabase, project: StoredProject) {
  await runTx(db, async store => {
    const [oldRaw, idxRaw, prevRaw] = await Promise.all([reqP(store.get(KEY)), reqP(store.get(INDEX_KEY)), reqP(store.get(OLD_PREV_KEY))]);
    const old = oldRaw as StoredProject | undefined;
    let index = (idxRaw as HistoryEntry[] | undefined) || [];
    const before = index.length;
    // v0.9.1의 '직전 수업' 한 칸을 기록으로 옮긴다
    if (prevRaw) { index = pushHistory(store, index, prevRaw as StoredProject, 'replaced'); store.delete(OLD_PREV_KEY); }
    if (old && hasContent(old)) {
      if (lessonOf(old) !== project.lessonId) index = pushHistory(store, index, old, 'replaced');
      else {
        const last = index.find(h => h.lessonId === lessonOf(old));
        if (Date.now() - (last ? Date.parse(last.keptAt) : 0) > SNAPSHOT_EVERY_MS) index = pushHistory(store, index, old, 'snapshot');
      }
    }
    if (index.length !== before || prevRaw) store.put(index, INDEX_KEY);
  });
}

/** 저장 공간이 모자랄 때: 오래된 기록 절반을 지운다 (자동 보관만, 지금 수업은 건드리지 않음) */
async function trimHistory(db: IDBDatabase) {
  await runTx(db, async store => {
    const index = ((await reqP(store.get(INDEX_KEY))) as HistoryEntry[] | undefined) || [];
    const keep = index.slice(0, Math.floor(index.length / 2));
    for (const h of index.slice(keep.length)) store.delete(h.id);
    store.put(keep, INDEX_KEY);
  });
}

/**
 * 이 브라우저에 저장. 덮어쓰기 전에 원래 수업을 수업 기록에 보관한다.
 * 보관이 실패해도(저장 공간 부족 등) 지금 수업 저장은 반드시 한다.
 */
export async function saveProject(project: StoredProject): Promise<void> {
  const db = await openDB();
  try {
    try { await keepHistoryBefore(db, project); }
    catch (e) { console.warn('수업 기록 보관 실패', e); try { await trimHistory(db); } catch { /* 무시 */ } }
    const put = () => runTx(db, store => { store.put(project, KEY); });
    try { await put(); }
    catch (e) {
      // 공간이 모자라면 오래된 기록을 줄이고 한 번 더
      await trimHistory(db).catch(() => {});
      await put();
    }
  } finally { db.close(); }
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

/** 수업 기록 목록 (최근 것부터). 예전 '직전 수업'도 함께 보여 준다 */
export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const st = tx.objectStore(STORE);
  const [idx, prev] = await Promise.all([reqP(st.get(INDEX_KEY)), reqP(st.get(OLD_PREV_KEY))]);
  db.close();
  const list = ((idx as HistoryEntry[]) || []).slice();
  const p = prev as StoredProject | undefined;
  if (p) list.unshift({ id: OLD_PREV_KEY, name: p.name || '수업', savedAt: p.savedAt, keptAt: p.savedAt, slides: p.scenes?.length || 0, reason: 'replaced', lessonId: lessonOf(p) });
  return list;
}

export async function loadHistory(id: string): Promise<StoredProject | null> {
  const db = await openDB();
  const p = await reqP(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  db.close();
  return (p as StoredProject) || null;
}

/**
 * 기록의 수업을 되살린다: 지금 수업은 먼저 기록에 보관하고, 고른 수업을 지금 수업으로.
 * (되살린 기록은 그대로 남겨 둔다 → 몇 번을 오가도 사라지는 것이 없다)
 */
export async function restoreHistory(id: string, current: StoredProject | null): Promise<StoredProject | null> {
  const target = await loadHistory(id);
  if (!target) return null;
  const db = await openDB();
  try {
    await runTx(db, async store => {
      let index = ((await reqP(store.get(INDEX_KEY))) as HistoryEntry[] | undefined) || [];
      if (current && hasContent(current)) index = pushHistory(store, index, current, 'before-restore');
      store.put(index, INDEX_KEY);
      store.put({ ...target, lessonId: lessonOf(target) }, KEY);
    });
  } finally { db.close(); }
  return { ...target, lessonId: lessonOf(target) };
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
