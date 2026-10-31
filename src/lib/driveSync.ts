/**
 * 구글 드라이브 동기화: 선생님 드라이브의 '옥쌤보드' 폴더에 수업을 저장하고, 어느 기기에서든 같은 수업 목록을 본다.
 * - 권한은 drive.file: 옥쌤보드가 만든 파일만 보고 고칠 수 있다(다른 드라이브 파일에는 손대지 않음).
 * - 무료(개인 드라이브 용량 안), 과금 설정 없음.
 * - 3D 모델(GLB)은 수업 파일과 따로 한 번만 올리고, 수업에는 모델 번호만 적는다.
 */
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from '@/src/firebase';
import type { StoredProject } from './projectStore';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'okssam_drive_file_token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class SyncError extends Error {
  constructor(public code: 'need-auth' | 'cancelled' | 'network' | 'quota' | 'not-found' | 'other', msg: string) { super(msg); }
}

// ---------- 권한 ----------
export function cachedToken(): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (v && v.until > Date.now() + 60_000 && v.email === auth.currentUser?.email) return v.token;
  } catch { /* 무시 */ }
  return null;
}

/** 드라이브 저장 권한을 받는다 (팝업: 단추를 눌렀을 때만 부를 것) */
export async function connectDrive(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new SyncError('need-auth', '먼저 Google로 로그인해 주세요.');
  const provider = new GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ login_hint: user.email || '' });
  try {
    const r = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(r)?.accessToken;
    if (!token) throw new SyncError('need-auth', '드라이브 권한을 받지 못했습니다.');
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, until: Date.now() + 55 * 60_000, email: user.email })); } catch { /* 무시 */ }
    return token;
  } catch (e: any) {
    if (e instanceof SyncError) throw e;
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') throw new SyncError('cancelled', '취소했습니다.');
    if (e?.code === 'auth/popup-blocked') throw new SyncError('need-auth', '팝업이 막혀 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.');
    if (e?.code === 'auth/user-mismatch') throw new SyncError('need-auth', '지금 로그인한 계정과 같은 계정을 골라 주세요.');
    throw new SyncError('other', e?.message || '드라이브에 연결하지 못했습니다.');
  }
}

function forget() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ } }

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new SyncError('network', '인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 401) { forget(); throw new SyncError('need-auth', '드라이브 연결이 끝났습니다. 다시 연결해 주세요.'); }
  if (res.status === 404) throw new SyncError('not-found', '드라이브에서 파일을 찾지 못했습니다.');
  if (res.status === 403) {
    const t = await res.text().catch(() => '');
    if (/storageQuota|quotaExceeded/i.test(t)) throw new SyncError('quota', '구글 드라이브 저장 공간이 가득 찼습니다.');
    if (/insufficientPermissions|insufficient authentication scopes/i.test(t)) { forget(); throw new SyncError('need-auth', '드라이브 저장 권한이 필요합니다.'); }
    throw new SyncError('other', '드라이브에 저장할 권한이 없습니다.');
  }
  if (!res.ok) throw new SyncError('other', `드라이브 오류 (${res.status})`);
  return res;
}

const q = (s: string) => encodeURIComponent(s);

// ---------- 폴더 ----------
let folderId: string | null = null;
async function ensureFolder(token: string): Promise<string> {
  if (folderId) return folderId;
  const found = await (await call(token, `${API}/files?q=${q("appProperties has { key='okssam' and value='root' } and trashed=false")}&fields=files(id)&spaces=drive`)).json();
  if (found.files?.[0]?.id) return (folderId = found.files[0].id);
  const created = await (await call(token, `${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '옥쌤보드', mimeType: 'application/vnd.google-apps.folder', appProperties: { okssam: 'root' } }),
  })).json();
  return (folderId = created.id);
}

/** 큰 파일도 올릴 수 있는 이어 올리기 방식 */
async function upload(token: string, meta: Record<string, unknown>, body: Blob, fileId?: string): Promise<{ id: string; modifiedTime: string }> {
  const init = await call(token, `${UPLOAD}/files${fileId ? `/${fileId}` : ''}?uploadType=resumable&fields=id,modifiedTime`, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': body.type || 'application/octet-stream', 'X-Upload-Content-Length': String(body.size) },
    body: JSON.stringify(meta),
  });
  const loc = init.headers.get('Location');
  if (!loc) {
    // 업로드 주소를 읽지 못하는 환경: 5MB 이하는 한 번에 올린다
    if (body.size > 5 * 1024 * 1024) throw new SyncError('other', '큰 파일을 드라이브에 올리지 못했습니다.');
    const boundary = 'okssam' + Math.random().toString(36).slice(2);
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${body.type || 'application/octet-stream'}\r\n\r\n`,
      body, `\r\n--${boundary}--`,
    ]);
    const res = await call(token, `${UPLOAD}/files${fileId ? `/${fileId}` : ''}?uploadType=multipart&fields=id,modifiedTime`, {
      method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
    });
    return res.json();
  }
  const res = await call(token, loc, { method: 'PUT', body });
  return res.json();
}

// ---------- 수업 ----------
export interface DriveLesson { id: string; name: string; modifiedTime: string; size?: number; lessonId?: string; category?: string; slides?: number; thumb?: string }

export async function listLessons(token: string): Promise<DriveLesson[]> {
  const fields = 'files(id,name,modifiedTime,size,appProperties)';
  const json = await (await call(token, `${API}/files?q=${q("appProperties has { key='okssam' and value='lesson' } and trashed=false")}&orderBy=modifiedTime desc&pageSize=200&fields=${q(fields)}&spaces=drive`)).json();
  return (json.files || []).map((f: any) => ({
    id: f.id, name: (f.name || '').replace(/\.okssam\.json$/, ''), modifiedTime: f.modifiedTime, size: f.size ? +f.size : undefined,
    lessonId: f.appProperties?.lessonId, category: f.appProperties?.category, slides: f.appProperties?.slides ? +f.appProperties.slides : undefined,
  }));
}

export async function getModified(token: string, fileId: string): Promise<string | null> {
  try {
    const j = await (await call(token, `${API}/files/${fileId}?fields=modifiedTime,trashed`)).json();
    return j.trashed ? null : j.modifiedTime;
  } catch (e: any) {
    if (e?.code === 'not-found') return null;
    throw e;
  }
}

export async function saveLesson(token: string, project: StoredProject & { lessonId: string }, fileId?: string | null): Promise<{ id: string; modifiedTime: string }> {
  const parent = await ensureFolder(token);
  const { assets: _drop, ...clean } = project as any;
  const body = new Blob([JSON.stringify(clean)], { type: 'application/json' });
  const meta: Record<string, unknown> = {
    name: `${(project.name || '수업').replace(/[\\/]/g, ' ').slice(0, 80)}.okssam.json`,
    mimeType: 'application/json',
    appProperties: { okssam: 'lesson', lessonId: project.lessonId, slides: String(project.scenes.length), ...(project.category ? { category: project.category.slice(0, 40) } : {}) },
  };
  if (!fileId) meta.parents = [parent];
  try {
    return await upload(token, meta, body, fileId || undefined);
  } catch (e: any) {
    // 드라이브에서 지운 파일이면 새로 만든다
    if (e?.code === 'not-found' && fileId) { meta.parents = [parent]; return upload(token, meta, body); }
    throw e;
  }
}

export async function loadLesson(token: string, fileId: string): Promise<StoredProject & { lessonId?: string }> {
  return (await call(token, `${API}/files/${fileId}?alt=media`)).json();
}

// ---------- 3D 모델 ----------
const MODELS_KEY = 'okssam_drive_models';
const knownModels = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(MODELS_KEY) || '{}'); } catch { return {}; } };
const rememberModel = (modelId: string, fileId: string) => { try { localStorage.setItem(MODELS_KEY, JSON.stringify({ ...knownModels(), [modelId]: fileId })); } catch { /* 무시 */ } };

async function findModel(token: string, modelId: string): Promise<{ id: string; name: string } | null> {
  const known = knownModels()[modelId];
  if (known) return { id: known, name: '' };
  const j = await (await call(token, `${API}/files?q=${q(`appProperties has { key='modelId' and value='${modelId.replace(/'/g, '')}' } and trashed=false`)}&fields=files(id,name)&spaces=drive`)).json();
  const f = j.files?.[0];
  if (f) rememberModel(modelId, f.id);
  return f || null;
}

/** 수업에 쓰인 3D 모델 중 아직 드라이브에 없는 것을 올린다 */
export async function uploadMissingModels(token: string, modelIds: string[]): Promise<number> {
  if (!modelIds.length) return 0;
  const { getModelBlob, getModelInfo } = await import('./assetStore');
  const parent = await ensureFolder(token);
  let n = 0;
  for (const id of modelIds) {
    if (await findModel(token, id)) continue;
    const [blob, info] = await Promise.all([getModelBlob(id), getModelInfo(id)]);
    if (!blob || !info) continue;
    const labels = info.labels?.length ? JSON.stringify(info.labels).slice(0, 110) : '';
    const r = await upload(token, {
      name: info.name || `${id}.glb`, parents: [parent], mimeType: 'model/gltf-binary',
      appProperties: { okssam: 'model', modelId: id, ...(labels.length < 110 ? { labels } : {}) },
      ...(info.labels?.length ? { description: JSON.stringify({ labels: info.labels }) } : {}),
    }, blob);
    rememberModel(id, r.id);
    n++;
  }
  return n;
}

/** 이 기기 자산함에 없는 3D 모델을 드라이브에서 받는다 */
export async function downloadMissingModels(token: string, modelIds: string[]): Promise<number> {
  if (!modelIds.length) return 0;
  const { getModelInfo, updateModel } = await import('./assetStore');
  const { importModelBlob } = await import('@/src/components/Windows/AssetLibrary');
  let n = 0;
  for (const id of modelIds) {
    if (await getModelInfo(id)) continue;
    const f = await findModel(token, id);
    if (!f) continue;
    const meta = await (await call(token, `${API}/files/${f.id}?fields=name,description`)).json();
    const blob = await (await call(token, `${API}/files/${f.id}?alt=media`)).blob();
    await importModelBlob(blob, { name: meta.name || `${id}.glb`, id });
    try { const d = JSON.parse(meta.description || '{}'); if (Array.isArray(d.labels)) await updateModel(id, { labels: d.labels }); } catch { /* 무시 */ }
    n++;
  }
  return n;
}

/** 수업 데이터에서 3D 모델 번호 모으기 */
export function modelIdsOf(project: StoredProject): string[] {
  const ids = new Set<string>();
  for (const s of project.scenes) {
    if (!s.data || !s.data.includes('"isModel"')) continue;
    try { (JSON.parse(s.data).objects || []).forEach((o: any) => { if (o?.isModel && o.modelId) ids.add(o.modelId); }); } catch { /* 무시 */ }
  }
  return [...ids];
}
