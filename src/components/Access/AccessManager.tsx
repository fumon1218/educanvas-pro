import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from 'firebase/auth';
import { ADMIN_EMAIL, AllowedUser, addAllowedUser, isValidEmail, normalizeEmail, removeAllowedUser, subscribeAllowedUsers } from '@/src/lib/access';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  admin: User;
}

/** 관리자 전용: 옥쌤보드를 쓸 수 있는 계정 관리 */
export const AccessManager: React.FC<Props> = ({ isOpen, onClose, admin }) => {
  const [users, setUsers] = useState<AllowedUser[] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUsers(null);
    return subscribeAllowedUsers(setUsers, err => {
      console.error(err);
      toast.error('허용 목록을 불러오지 못했습니다.', { description: 'Firebase 보안 규칙이 배포되었는지 확인해 주세요.' });
      setUsers([]);
    });
  }, [isOpen]);

  const add = async () => {
    const e = normalizeEmail(email);
    if (!isValidEmail(e)) { toast.error('이메일 주소를 확인해 주세요.'); return; }
    if (e === ADMIN_EMAIL) { toast.info('관리자 계정은 항상 사용할 수 있습니다.'); return; }
    if (users?.some(u => u.email === e)) { toast.info('이미 등록된 계정입니다.'); return; }
    setBusy(true);
    try {
      await addAllowedUser(e, name, admin);
      setEmail(''); setName('');
      toast.success(`${e} 계정을 등록했습니다.`, { description: '이제 이 계정으로 로그인하면 사용할 수 있습니다.' });
    } catch (err) {
      console.error(err);
      toast.error('등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: string) => {
    setConfirmRemove(null);
    try {
      await removeAllowedUser(e);
      toast.success(`${e} 계정의 사용 허락을 취소했습니다.`);
    } catch (err) {
      console.error(err);
      toast.error('삭제하지 못했습니다.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="사용자 관리"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-gray-100"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-800">사용자 관리</h2>
                <p className="text-xs text-gray-500 mt-0.5">등록한 Google 계정만 옥쌤보드를 쓸 수 있습니다.</p>
              </div>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-3 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }}
                  placeholder="Google 이메일 (예: teacher@gmail.com)"
                  className="flex-[3] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  aria-label="허용할 이메일"
                />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }}
                  placeholder="이름·메모 (선택)"
                  className="flex-[2] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  aria-label="이름 또는 메모"
                />
              </div>
              <button onClick={add} disabled={busy || !email.trim()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                사용 허락하기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50/60">
                <ShieldCheck size={18} className="text-indigo-600" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{ADMIN_EMAIL}</div>
                  <div className="text-[11px] text-indigo-600">관리자</div>
                </div>
              </div>
              {users === null ? (
                <div className="py-8 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">아직 등록한 계정이 없습니다.</div>
              ) : (
                <ul className="mt-1">
                  {users.map(u => (
                    <li key={u.email} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{u.email}</div>
                        <div className="text-[11px] text-gray-400">
                          {u.name ? `${u.name} · ` : ''}{u.addedAt ? `${u.addedAt.toLocaleDateString('ko-KR')} 등록` : '방금 등록'}
                        </div>
                      </div>
                      {confirmRemove === u.email ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => remove(u.email)} className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600">허락 취소</button>
                          <button onClick={() => setConfirmRemove(null)} className="px-2.5 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">아니요</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(u.email)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" aria-label={`${u.email} 허락 취소`} title="허락 취소">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed">
              허락을 취소하면 그 계정은 다음에 앱을 열 때부터 들어올 수 없고, 공유 보드도 읽거나 쓸 수 없습니다.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
