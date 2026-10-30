import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '@/src/firebase';

/**
 * 관리자 계정. 이 계정은 항상 사용할 수 있고, 다른 사람의 사용 허락을 관리한다.
 * 바꿀 때는 firestore.rules의 isAdmin()도 같이 바꿔야 한다.
 */
export const ADMIN_EMAIL = 'fumon1218@gmail.com';

export type AccessRole = 'admin' | 'member' | 'denied';

export interface AllowedUser {
  email: string;
  name?: string;
  addedAt?: Date;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export async function checkAccess(user: User): Promise<AccessRole> {
  const email = normalizeEmail(user.email || '');
  if (!email || !user.emailVerified) return 'denied';
  if (email === ADMIN_EMAIL) return 'admin';
  try {
    const snap = await getDoc(doc(db, 'allowedUsers', email));
    return snap.exists() ? 'member' : 'denied';
  } catch (err: any) {
    // 권한 없음(permission-denied)도 '허락되지 않음'으로 처리
    if (err?.code === 'permission-denied') return 'denied';
    throw err;
  }
}

export function subscribeAllowedUsers(onChange: (users: AllowedUser[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, 'allowedUsers'), orderBy('addedAt', 'desc'));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => {
      const v = d.data();
      return { email: d.id, name: v.name || '', addedAt: v.addedAt?.toDate?.() };
    }));
  }, onError);
}

export async function addAllowedUser(email: string, name: string, admin: User) {
  const id = normalizeEmail(email);
  await setDoc(doc(db, 'allowedUsers', id), {
    name: name.trim().slice(0, 40),
    addedAt: serverTimestamp(),
    addedBy: admin.uid,
  });
}

export async function removeAllowedUser(email: string) {
  await deleteDoc(doc(db, 'allowedUsers', normalizeEmail(email)));
}
