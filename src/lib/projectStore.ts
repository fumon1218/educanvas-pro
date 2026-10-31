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
  /** 분류 (예: '3학년 과학') */
  category?: string;
  /** 공간: 수업·학생·설교·업무 */
  space?: Space;
  /** 노트 날짜 (YYYY-MM-DD, 달력 보기) */
  noteDate?: string;
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

export const hasContent = (p: StoredProject | null | undefined) =>
  !!p?.scenes?.some(s => { try { return !!s.data && JSON.parse(s.data).objects?.length > 0; } catch { return false; } });

const reqP = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const runTx = (db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<void> | void) =>
  new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    Promise.resolve(fn(tx.objectStore(STORE))).catch(err => { try { tx.abort(); } catch { /* 무시 */ } reject(err); });
  });

async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try { return await fn(db); } finally { db.close(); }
}

// ===========================================================================
// 내 수업 (이 브라우저의 수업 서재)
//  수업마다 따로 칸(lesson:<번호>)에 저장하고, 목록(library-index)에 이름·분류·썸네일을 둔다.
// ===========================================================================

export type Space = 'lesson' | 'student' | 'sermon' | 'work';
export const SPACES: { id: Space; label: string; noun: string }[] = [
  { id: 'lesson', label: '수업', noun: '수업' },
  { id: 'student', label: '학생', noun: '공부 노트' },
  { id: 'sermon', label: '설교', noun: '설교 노트' },
  { id: 'work', label: '업무', noun: '업무 노트' },
];
export const spaceOf = (x: { space?: Space }) => x.space || 'lesson';

export interface LibraryEntry {
  id: string;
  space?: Space;
  noteDate?: string;
  /** 내용 찾기용 글자 (잠긴 노트는 비움) */
  text?: string;
  /** 암호로 잠근 노트 */
  locked?: boolean;
  name: string;
  savedAt: string;
  createdAt: string;
  slides: number;
  thumb?: string;
  category?: string;
  favorite?: boolean;
  /** 휴지통에 넣은 시각 (30일 뒤 완전히 지움) */
  trashedAt?: string;
  driveFileId?: string;
}
interface LibraryMeta { lastLessonId?: string; categories: string[] }

const LESSON = (id: string) => `lesson:${id}`;
const LIB_INDEX = 'library-index';
const LIB_META = 'library-meta';
const LEGACY_CURRENT = 'current';
const LEGACY_PREV = 'previous';
const TRASH_DAYS = 30;

/** 노트에 타자로 쓴 글자들 (내용 찾기·내보내기) */
export function textOfScene(data: string | null | undefined): string[] {
  if (!data || !data.includes('"text"')) return [];
  const out: string[] = [];
  const walk = (objs: any[]) => objs?.forEach(o => {
    if (!o) return;
    if (typeof o.text === 'string' && !o.isPlaceholder && o.text.trim()) out.push(o.text.trim());
    else if (typeof o.bibleText === 'string') out.push(o.bibleText.trim());
    if (Array.isArray(o.objects)) walk(o.objects);
  });
  try { walk(JSON.parse(data).objects || []); } catch { /* 무시 */ }
  return out;
}

const entryOf = (p: StoredProject, prev?: LibraryEntry, locked = false): LibraryEntry => {
  const e: LibraryEntry = {
    ...(prev || {}),
    id: lessonOf(p),
    name: p.name || '수업',
    savedAt: p.savedAt,
    createdAt: prev?.createdAt || p.savedAt,
    slides: p.scenes?.length || 0,
    thumb: locked ? undefined : p.scenes?.find(s => s.id === p.activeSceneId)?.thumbnail || p.scenes?.[0]?.thumbnail || prev?.thumb,
    category: p.category ?? prev?.category,
    space: p.space ?? prev?.space,
    noteDate: p.noteDate ?? prev?.noteDate,
    driveFileId: p.driveFileId || prev?.driveFileId,
    text: locked ? undefined : p.scenes?.flatMap(s => textOfScene(s.data)).join(' · ').replace(/\s+/g, ' ').slice(0, 6000),
  };
  if (locked) e.locked = true; else delete e.locked;
  return e;
};

// ===========================================================================
// 노트 잠금: 암호로 잠근 노트는 내용을 암호화해서 저장한다 (AES-GCM, 암호에서 PBKDF2로 열쇠를 만든다)
// 암호를 잊으면 열 수 없다. 잠긴 노트는 썸네일·찾기 글자·수업 기록·드라이브 저장에서 빠진다.
// ===========================================================================

export interface LockedLesson { format: 'okssam-locked'; v: 1; lessonId: string; name: string; savedAt: string; salt: string; iv: string; data: string }
export const isLockedLesson = (p: any): p is LockedLesson => p?.format === 'okssam-locked';
const unlocked = new Map<string, { key: CryptoKey; salt: Uint8Array }>();
export const isUnlocked = (id: string) => unlocked.has(id);
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptProject(p: StoredProject, k: { key: CryptoKey; salt: Uint8Array }): Promise<LockedLesson> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.key, new TextEncoder().encode(JSON.stringify(p))));
  return { format: 'okssam-locked', v: 1, lessonId: lessonOf(p), name: p.name, savedAt: p.savedAt, salt: b64(k.salt), iv: b64(iv), data: b64(data) };
}
/** 이번에 이미 암호를 넣은 노트면 다시 묻지 않고 연다 */
export async function openWithCachedKey(l: LockedLesson): Promise<StoredProject | null> {
  const k = unlocked.get(l.lessonId);
  if (!k) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(l.iv) }, k.key, unb64(l.data));
    return { ...(JSON.parse(new TextDecoder().decode(plain)) as StoredProject), lessonId: l.lessonId };
  } catch { return null; }
}
/** 잠긴 노트 열기. 암호가 틀리면 null */
export async function unlockLesson(l: LockedLesson, password: string): Promise<StoredProject | null> {
  try {
    const salt = unb64(l.salt);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(l.iv) }, key, unb64(l.data));
    const p = JSON.parse(new TextDecoder().decode(plain)) as StoredProject;
    unlocked.set(l.lessonId, { key, salt });
    return { ...p, lessonId: l.lessonId };
  } catch { return null; }
}
/** 이 노트를 암호로 잠근다 (수업 기록에 남은 예전 모습도 지운다) */
export async function lockLesson(p: StoredProject, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const id = lessonOf(p);
  unlocked.set(id, { key, salt });
  const enc = await encryptProject({ ...p, lessonId: id }, { key, salt });
  await withDB(async db => {
    await ensureMigrated(db);
    await runTx(db, 'readwrite', async store => {
      const { index, meta } = await readLib(store);
      const i = index.findIndex(e => e.id === id);
      const entry = entryOf(p, i >= 0 ? index[i] : undefined, true);
      if (i >= 0) index[i] = entry; else index.push(entry);
      store.put(enc, LESSON(id));
      store.put(index, LIB_INDEX);
      store.put(meta, LIB_META);
      const h = ((await reqP(store.get('history-index'))) as HistoryEntry[] | undefined) || [];
      h.filter(x => x.lessonId === id).forEach(x => store.delete(x.id));
      store.put(h.filter(x => x.lessonId !== id), 'history-index');
    });
  });
}
/** 잠금 풀기 (열려 있는 노트만) */
export async function removeLock(p: StoredProject): Promise<void> {
  unlocked.delete(lessonOf(p));
  await saveProject(p, { touchLast: false, plain: true });
}
/** 앱을 잠시 떠나면 다시 암호를 묻도록 열쇠를 잊는다 */
export const forgetUnlocked = (id?: string) => { if (id) unlocked.delete(id); else unlocked.clear(); };

async function readLib(store: IDBObjectStore): Promise<{ index: LibraryEntry[]; meta: LibraryMeta }> {
  const [i, m] = await Promise.all([reqP(store.get(LIB_INDEX)), reqP(store.get(LIB_META))]);
  return { index: (i as LibraryEntry[]) || [], meta: { categories: [], ...((m as LibraryMeta) || {}) } };
}

/**
 * 예전 방식(수업 칸 하나 'current' + 직전 수업 'previous')으로 저장된 수업을 서재로 옮긴다.
 * 예전 버전 탭이 아직 열려 있어 'current'에 다시 쓸 수도 있으므로, 앱을 열 때마다 확인한다.
 * 옮긴 뒤에는 예전 칸을 비운다(내용은 서재에 있음).
 */
async function migrate(db: IDBDatabase) {
  await runTx(db, 'readwrite', async store => {
    const { index, meta } = await readLib(store);
    let changed = false;
    for (const key of [LEGACY_PREV, LEGACY_CURRENT]) {
      const p = (await reqP(store.get(key))) as StoredProject | undefined;
      if (!p) continue;
      if (hasContent(p)) {
        const id = lessonOf(p);
        const i = index.findIndex(e => e.id === id);
        if (i < 0 || Date.parse(p.savedAt) > Date.parse(index[i].savedAt)) {
          const fixed = { ...p, lessonId: id };
          store.put(fixed, LESSON(id));
          const entry = entryOf(fixed, i >= 0 ? index[i] : undefined);
          if (i >= 0) index[i] = entry; else index.push(entry);
          if (key === LEGACY_CURRENT) meta.lastLessonId = id;
        }
      }
      store.delete(key);
      changed = true;
    }
    // 30일 지난 휴지통 비우기
    const now = Date.now();
    const keep = index.filter(e => !(e.trashedAt && now - Date.parse(e.trashedAt) > TRASH_DAYS * 864e5));
    if (keep.length !== index.length) { index.filter(e => !keep.includes(e)).forEach(e => store.delete(LESSON(e.id))); changed = true; }
    if (changed) { store.put(keep, LIB_INDEX); store.put(meta, LIB_META); }
  });
}

let migrated: Promise<void> | null = null;
const ensureMigrated = (db: IDBDatabase) => (migrated ||= migrate(db).catch(e => { migrated = null; throw e; }));

/** 지운 뒤 다시 정리 (휴지통 30일) 등 서재 목록 */
export async function listLibrary(): Promise<{ lessons: LibraryEntry[]; categories: string[]; lastLessonId?: string }> {
  return withDB(async db => {
    await ensureMigrated(db);
    let out!: { index: LibraryEntry[]; meta: LibraryMeta };
    await runTx(db, 'readonly', async store => { out = await readLib(store); });
    const cats = Array.from(new Set([...out.meta.categories, ...out.index.map(e => e.category).filter(Boolean) as string[]]));
    return { lessons: out.index, categories: cats, lastLessonId: out.meta.lastLessonId };
  });
}

export async function loadLesson(id: string): Promise<StoredProject | null> {
  const raw = await loadLessonRaw(id);
  if (!raw) return null;
  if (isLockedLesson(raw)) return null; // 잠긴 노트는 loadLessonRaw + unlockLesson으로
  return raw;
}

/** 잠긴 노트면 LockedLesson 그대로 */
export async function loadLessonRaw(id: string): Promise<StoredProject | LockedLesson | null> {
  return withDB(async db => {
    await ensureMigrated(db);
    let p: any;
    await runTx(db, 'readonly', async store => { p = await reqP(store.get(LESSON(id))); });
    if (!p) return null;
    return isLockedLesson(p) ? p : { ...p, lessonId: id };
  });
}

/** 마지막으로 연 수업 (앱을 켜면 이어서 연다) */
export async function loadProject(): Promise<StoredProject | null> {
  const lib = await listLibrary();
  const last = lib.lastLessonId && lib.lessons.find(e => e.id === lib.lastLessonId && !e.trashedAt);
  return last ? loadLesson(last.id) : null;
}

/** 목록 정보 바꾸기 (이름·분류·즐겨찾기·휴지통). 이름·분류는 수업 파일에도 적는다 */
export async function updateLesson(id: string, patch: Partial<Pick<LibraryEntry, 'name' | 'category' | 'favorite' | 'trashedAt' | 'space' | 'noteDate'>>): Promise<void> {
  await withDB(async db => {
    await ensureMigrated(db);
    await runTx(db, 'readwrite', async store => {
      const { index, meta } = await readLib(store);
      const e = index.find(x => x.id === id);
      if (!e) return;
      Object.assign(e, patch);
      if (patch.trashedAt === undefined && 'trashedAt' in patch) delete e.trashedAt;
      if (patch.category === '' ) delete e.category;
      if ('name' in patch || 'category' in patch || 'space' in patch || 'noteDate' in patch) {
        const p = (await reqP(store.get(LESSON(id)))) as StoredProject | LockedLesson | undefined;
        // 잠긴 노트는 목록 정보만 바꾼다 (내용은 열 때 맞춰짐)
        if (p && !isLockedLesson(p)) store.put({
          ...p,
          ...(patch.name ? { name: patch.name } : {}),
          ...('category' in patch ? { category: patch.category || undefined } : {}),
          ...('space' in patch ? { space: patch.space } : {}),
          ...('noteDate' in patch ? { noteDate: patch.noteDate } : {}),
        }, LESSON(id));
      }
      if (patch.category && !meta.categories.includes(patch.category)) meta.categories.push(patch.category);
      store.put(index, LIB_INDEX);
      store.put(meta, LIB_META);
    });
  });
}

/** 휴지통에서 완전히 지우기 */
export async function deleteLessonForever(id: string): Promise<void> {
  await withDB(db => runTx(db, 'readwrite', async store => {
    const { index } = await readLib(store);
    store.put(index.filter(e => e.id !== id), LIB_INDEX);
    store.delete(LESSON(id));
  }));
}

/** 수업 복제 → 새 수업 번호 */
export async function duplicateLesson(id: string, newLessonId: string): Promise<LibraryEntry | null> {
  const p = await loadLesson(id);
  if (!p) return null;
  const copy: StoredProject = { ...p, lessonId: newLessonId, name: `${p.name} (사본)`, savedAt: new Date().toISOString(), driveFileId: undefined, driveModified: undefined };
  await withDB(db => runTx(db, 'readwrite', async store => {
    const { index } = await readLib(store);
    store.put(copy, LESSON(newLessonId));
    index.push({ ...entryOf(copy), createdAt: copy.savedAt, favorite: false });
    store.put(index, LIB_INDEX);
  }));
  return entryOf(copy);
}

/** 분류 목록 (빈 분류도 남김) */
export async function setCategories(categories: string[]): Promise<void> {
  await withDB(db => runTx(db, 'readwrite', async store => {
    const { meta } = await readLib(store);
    store.put({ ...meta, categories }, LIB_META);
  }));
}

/** 분류 이름 바꾸기/지우기 (to=''이면 '분류 없음'으로) */
export async function renameCategory(from: string, to: string): Promise<void> {
  await withDB(db => runTx(db, 'readwrite', async store => {
    const { index, meta } = await readLib(store);
    for (const e of index) if (e.category === from) { if (to) e.category = to; else delete e.category; }
    meta.categories = Array.from(new Set(meta.categories.map(c => (c === from ? to : c)).filter(Boolean)));
    store.put(index, LIB_INDEX);
    store.put(meta, LIB_META);
  }));
}

/** 지금 여는 수업이 무엇인지 기억 (서재에 아직 없는 빈 수업이면 비움) */
export async function setLastLesson(id: string | null): Promise<void> {
  await withDB(db => runTx(db, 'readwrite', async store => {
    const { meta } = await readLib(store);
    store.put({ ...meta, lastLessonId: id || undefined }, LIB_META);
  })).catch(() => {});
}

// ---------------------------------------------------------------------------
// 수업 기록 (자동 보관): 같은 수업도 20분마다 그때 모습을 보관 (최근 15개)
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
const MAX_HISTORY = 30;
const SNAPSHOT_EVERY_MS = 20 * 60 * 1000;

function pushHistory(store: IDBObjectStore, index: HistoryEntry[], p: StoredProject, reason: HistoryReason): HistoryEntry[] {
  const id = `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  store.put(p, id);
  const next = [{ id, name: p.name || '수업', savedAt: p.savedAt, keptAt: new Date().toISOString(), slides: p.scenes?.length || 0, reason, lessonId: lessonOf(p) }, ...index];
  for (const old of next.slice(MAX_HISTORY)) store.delete(old.id);
  return next.slice(0, MAX_HISTORY);
}

async function trimHistory(db: IDBDatabase) {
  await runTx(db, 'readwrite', async store => {
    const index = ((await reqP(store.get(INDEX_KEY))) as HistoryEntry[] | undefined) || [];
    const keep = index.slice(0, Math.floor(index.length / 2));
    for (const h of index.slice(keep.length)) store.delete(h.id);
    store.put(keep, INDEX_KEY);
  });
}

/**
 * 수업 저장: 그 수업의 칸에만 쓴다(다른 수업은 절대 건드리지 않음).
 * 20분마다 직전 모습을 수업 기록에 보관하고, 보관이 실패해도 저장은 반드시 한다.
 * 아직 아무것도 그리지 않은 새 수업은 목록에 올리지 않는다.
 */
export async function saveProject(project: StoredProject, opts: { touchLast?: boolean; plain?: boolean } = {}): Promise<void> {
  const id = lessonOf(project);
  const p = { ...project, lessonId: id };
  const lockKey = opts.plain ? undefined : unlocked.get(id);
  const stored: StoredProject | LockedLesson = lockKey ? await encryptProject(p, lockKey) : p;
  await withDB(async db => {
    await ensureMigrated(db);
    let skip = false;
    try {
      await runTx(db, 'readwrite', async store => {
        const [oldRaw, hRaw, lib] = await Promise.all([reqP(store.get(LESSON(id))), reqP(store.get(INDEX_KEY)), readLib(store)]);
        const old = isLockedLesson(oldRaw) ? undefined : (oldRaw as StoredProject | undefined);
        if (!oldRaw && !hasContent(p) && !lib.index.some(e => e.id === id)) { skip = true; return; }
        let h = (hRaw as HistoryEntry[] | undefined) || [];
        if (old && !lockKey && hasContent(old)) {
          const last = h.find(x => x.lessonId === id);
          if (Date.now() - (last ? Date.parse(last.keptAt) : 0) > SNAPSHOT_EVERY_MS) { h = pushHistory(store, h, old, 'snapshot'); store.put(h, INDEX_KEY); }
        }
      });
    } catch (e) { console.warn('수업 기록 보관 실패', e); await trimHistory(db).catch(() => {}); }
    if (skip) return;
    const put = () => runTx(db, 'readwrite', async store => {
      const { index, meta } = await readLib(store);
      const i = index.findIndex(e => e.id === id);
      const entry = entryOf(p, i >= 0 ? index[i] : undefined, !!lockKey);
      if (i >= 0) index[i] = entry; else index.push(entry);
      store.put(stored, LESSON(id));
      store.put(index, LIB_INDEX);
      store.put(opts.touchLast === false ? meta : { ...meta, lastLessonId: id }, LIB_META);
    });
    try { await put(); }
    catch { await trimHistory(db).catch(() => {}); await put(); }
  });
}

/** 수업 기록 목록 (최근 것부터). lessonId를 주면 그 수업 것만 */
export async function listHistory(lessonId?: string): Promise<HistoryEntry[]> {
  return withDB(async db => {
    let list: HistoryEntry[] = [];
    await runTx(db, 'readonly', async store => { list = ((await reqP(store.get(INDEX_KEY))) as HistoryEntry[]) || []; });
    return lessonId ? list.filter(h => h.lessonId === lessonId) : list;
  });
}

export async function loadHistory(id: string): Promise<StoredProject | null> {
  return withDB(async db => {
    let p: StoredProject | undefined;
    await runTx(db, 'readonly', async store => { p = (await reqP(store.get(id))) as StoredProject | undefined; });
    return p || null;
  });
}

/**
 * 기록의 모습으로 되돌리기: 그 수업의 지금 모습을 먼저 기록에 보관하고, 고른 모습을 그 수업 칸에 넣는다.
 * (되살린 기록도 그대로 남겨 둔다 → 몇 번을 오가도 사라지는 것이 없다)
 */
export async function restoreHistory(id: string, current: StoredProject | null): Promise<StoredProject | null> {
  const target = await loadHistory(id);
  if (!target) return null;
  const tid = lessonOf(target);
  const restored = { ...target, lessonId: tid, savedAt: new Date().toISOString() };
  await withDB(async db => {
    await ensureMigrated(db);
    await runTx(db, 'readwrite', async store => {
      let h = ((await reqP(store.get(INDEX_KEY))) as HistoryEntry[] | undefined) || [];
      const nowInSlot = (await reqP(store.get(LESSON(tid)))) as StoredProject | undefined;
      const keepFirst = current && lessonOf(current) === tid ? current : nowInSlot;
      if (keepFirst && hasContent(keepFirst)) h = pushHistory(store, h, keepFirst, 'before-restore');
      // 다른 수업을 보던 중이었으면 그 수업도 저장해 둔다
      if (current && lessonOf(current) !== tid && hasContent(current)) store.put({ ...current, lessonId: lessonOf(current) }, LESSON(lessonOf(current)));
      store.put(h, INDEX_KEY);
      const { index, meta } = await readLib(store);
      const i = index.findIndex(e => e.id === tid);
      const entry = entryOf(restored, i >= 0 ? index[i] : undefined);
      delete entry.trashedAt;
      if (i >= 0) index[i] = entry; else index.push(entry);
      store.put(restored, LESSON(tid));
      store.put(index, LIB_INDEX);
      store.put({ ...meta, lastLessonId: tid }, LIB_META);
    });
  });
  return restored;
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
