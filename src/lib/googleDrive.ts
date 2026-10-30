/**
 * 구글 드라이브에서 3D 모델(GLB)을 찾아 받아 온다. (읽기 전용, 과금 없음)
 * 로그인한 같은 Google 계정으로 드라이브 읽기 권한을 한 번 더 허락받아 쓴다.
 */
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from '@/src/firebase';

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
let cached: { token: string; until: number } | null = null;

export class DriveError extends Error {
  constructor(public code: 'cancelled' | 'not-signed-in' | 'no-permission' | 'api-disabled' | 'network' | 'expired' | 'other', message: string) {
    super(message);
  }
}

export async function getDriveToken(forcePrompt = false): Promise<string> {
  if (!forcePrompt && cached && cached.until > Date.now()) return cached.token;
  const user = auth.currentUser;
  if (!user) throw new DriveError('not-signed-in', '먼저 Google로 로그인해 주세요.');
  const provider = new GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ login_hint: user.email || '' });
  try {
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new DriveError('no-permission', '드라이브 권한을 받지 못했습니다.');
    cached = { token, until: Date.now() + 50 * 60 * 1000 };
    return token;
  } catch (e: any) {
    if (e instanceof DriveError) throw e;
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') throw new DriveError('cancelled', '취소했습니다.');
    if (e?.code === 'auth/user-mismatch') throw new DriveError('no-permission', '지금 로그인한 계정과 같은 계정을 골라 주세요.');
    if (e?.code === 'auth/popup-blocked') throw new DriveError('other', '팝업이 막혀 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.');
    throw new DriveError('other', e?.message || '드라이브에 연결하지 못했습니다.');
  }
}

async function api(path: string, token: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError('network', '인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 401) { cached = null; throw new DriveError('expired', '드라이브 연결이 끝났습니다. 다시 연결해 주세요.'); }
  if (res.status === 403) {
    const body = await res.text().catch(() => '');
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(body)) throw new DriveError('api-disabled', '이 앱에서 구글 드라이브 기능이 아직 켜지지 않았습니다. 관리자가 Google Cloud에서 Drive API를 사용 설정해야 합니다.');
    throw new DriveError('no-permission', '드라이브 파일을 읽을 권한이 없습니다.');
  }
  if (!res.ok) throw new DriveError('other', `드라이브 오류 (${res.status})`);
  return res;
}

export interface DriveFile { id: string; name: string; size?: string; modifiedTime?: string; thumbnailLink?: string; parents?: string[] }

/** 드라이브 전체에서 GLB 파일을 찾는다 (최대 1000개) */
export async function listGlbFiles(token: string, search = ''): Promise<DriveFile[]> {
  const esc = search.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let q = "trashed = false and (name contains '.glb' or mimeType = 'model/gltf-binary')";
  if (esc.trim()) q += ` and name contains '${esc.trim()}'`;
  const out: DriveFile[] = [];
  let pageToken = '';
  for (let i = 0; i < 5; i++) {
    const params = new URLSearchParams({
      q, pageSize: '200', orderBy: 'modifiedTime desc', spaces: 'drive',
      fields: 'nextPageToken, files(id, name, size, modifiedTime, thumbnailLink, parents)',
      includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const json = await (await api(`files?${params}`, token)).json();
    out.push(...(json.files || []).filter((f: DriveFile) => /\.glb$/i.test(f.name)));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export async function downloadDriveFile(token: string, id: string): Promise<Blob> {
  const res = await api(`files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, token);
  return res.blob();
}
