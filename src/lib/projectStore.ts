/**
 * 브라우저 IndexedDB 저장소. localStorage(약 5MB)와 달리 PDF 이미지가 많은
 * 수업 자료도 저장할 수 있다.
 */
export interface StoredScene {
  id: string;
  name: string;
  data: string | null;
  thumbnail?: string;
}

export interface StoredProject {
  format: 'educanvas-project';
  version: 1;
  name: string;
  savedAt: string;
  activeSceneId: string;
  canvasBackground: 'blank' | 'grid' | 'dot' | 'dark';
  scenes: StoredScene[];
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
