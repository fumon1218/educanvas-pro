import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, getRedirectResult, User } from 'firebase/auth';
import { LogIn, LogOut, ShieldAlert, Loader2, Copy } from 'lucide-react';
import { auth, signInWithGoogle, logOut } from '@/src/firebase';
import { checkAccess, AccessRole } from '@/src/lib/access';
import { AccessManager } from './AccessManager';

interface AccessContextValue {
  user: User;
  role: Exclude<AccessRole, 'denied'>;
  signOut: () => void;
  openAccessManager: () => void;
}

const AccessContext = createContext<AccessContextValue | null>(null);
export const useAccess = () => useContext(AccessContext);

type GateState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'checking'; user: User }
  | { status: 'denied'; user: User }
  | { status: 'error'; user: User; message: string }
  | { status: 'ok'; user: User; role: 'admin' | 'member' };

const BASE = import.meta.env.BASE_URL;

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-indigo-50 via-white to-purple-50 font-sans">
    <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        {children}
      </div>
    </div>
  </div>
);

const Brand = () => (
  <div className="flex items-center gap-3">
    <img src={`${BASE}icon-192.png`} alt="" className="w-11 h-11 rounded-xl shadow" />
    <div>
      <div className="text-xl font-extrabold text-gray-900 tracking-tight">옥쌤보드</div>
      <div className="text-xs text-gray-500">선생님을 위한 강의용 판서 앱</div>
    </div>
  </div>
);

export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GateState>({ status: 'loading' });
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const evaluate = useCallback(async (user: User | null) => {
    if (!user) { setState({ status: 'signed-out' }); return; }
    setState({ status: 'checking', user });
    try {
      const role = await checkAccess(user);
      setState(role === 'denied' ? { status: 'denied', user } : { status: 'ok', user, role });
    } catch (err) {
      console.error('사용 권한 확인 실패', err);
      setState({ status: 'error', user, message: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.' });
    }
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch(err => console.error('로그인 결과 처리 실패', err));
    return onAuthStateChanged(auth, evaluate);
  }, [evaluate]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setSignInError(err?.code === 'auth/unauthorized-domain'
          ? '이 주소에서는 로그인이 허용되지 않았습니다. 관리자가 Firebase에 도메인을 등록해야 합니다.'
          : '로그인하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = useCallback(() => { logOut().catch(() => {}); }, []);

  if (state.status === 'loading' || state.status === 'checking') {
    return (
      <Shell>
        <div className="p-10 flex flex-col items-center gap-4 text-gray-500">
          <Brand />
          <Loader2 className="animate-spin text-indigo-500" />
          <div className="text-sm">{state.status === 'checking' ? '사용 권한을 확인하는 중…' : '불러오는 중…'}</div>
        </div>
      </Shell>
    );
  }

  if (state.status === 'signed-out') {
    return (
      <Shell>
        <img src={`${BASE}welcome.jpg`} alt="" className="w-full aspect-[16/10] object-cover bg-gray-50" />
        <div className="p-8 flex flex-col gap-5">
          <Brand />
          <p className="text-sm text-gray-600 leading-relaxed">
            옥쌤보드는 <b>초대받은 선생님만</b> 사용할 수 있습니다.<br />
            Google 계정으로 로그인해 주세요.
          </p>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {signingIn ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            Google 계정으로 로그인
          </button>
          {signInError && <p className="text-sm text-red-500" role="alert">{signInError}</p>}
        </div>
      </Shell>
    );
  }

  if (state.status === 'denied' || state.status === 'error') {
    const email = state.user.email || '';
    return (
      <Shell>
        <div className="p-8 flex flex-col gap-5">
          <Brand />
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
            <ShieldAlert className="text-amber-500 shrink-0" size={22} />
            <div className="text-sm text-gray-700 leading-relaxed">
              {state.status === 'denied' ? (
                <>
                  <b>아직 사용 허락을 받지 않은 계정입니다.</b><br />
                  옥쌤보드를 공유해 준 선생님께 아래 이메일을 알려 주시면, 등록 후 바로 사용할 수 있습니다.
                </>
              ) : (
                <><b>사용 권한을 확인하지 못했습니다.</b><br />{state.message}</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 p-1 pl-4 bg-gray-50 border border-gray-200 rounded-xl">
            <span className="flex-1 font-mono text-sm text-gray-700 truncate">{email}</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
              className="px-3 py-2 bg-white border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Copy size={14} />{copied ? '복사됨' : '복사'}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => evaluate(state.user)} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
              다시 확인
            </button>
            <button onClick={handleSignOut} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
              <LogOut size={15} />다른 계정으로 로그인
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const value: AccessContextValue = {
    user: state.user,
    role: state.role,
    signOut: handleSignOut,
    openAccessManager: () => setManagerOpen(true),
  };

  return (
    <AccessContext.Provider value={value}>
      {children}
      {state.role === 'admin' && <AccessManager isOpen={managerOpen} onClose={() => setManagerOpen(false)} admin={state.user} />}
    </AccessContext.Provider>
  );
};
