import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cloud, Loader2, FilePlus2, RefreshCw, FileText, Check } from 'lucide-react';
import type { DriveLesson } from '@/src/lib/driveSync';
import { cn } from '@/src/lib/utils';

const ago = (iso: string) => {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

/** 구글 드라이브의 '내 수업' 목록: 어느 기기에서든 같은 수업을 연다 */
export const DriveLessonsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  enabled: boolean;
  onEnable: () => Promise<boolean>;
  onDisable: () => void;
  list: () => Promise<DriveLesson[]>;
  currentFileId: string | null;
  onOpenLesson: (l: DriveLesson) => void;
  onNewLesson: () => void;
  onSaveNow: () => void;
  status: string;
}> = ({ isOpen, onClose, enabled, onEnable, onDisable, list, currentFileId, onOpenLesson, onNewLesson, onSaveNow, status }) => {
  const [items, setItems] = useState<DriveLesson[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setItems(await list()); }
    catch (e: any) { setErr(e?.message || '목록을 불러오지 못했습니다.'); setItems(null); }
    finally { setBusy(false); }
  }, [list]);

  useEffect(() => { if (isOpen && enabled) refresh(); }, [isOpen, enabled, refresh]);

  const shown = (items || []).filter(i => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="내 수업 (구글 드라이브)"
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="relative w-full max-w-2xl max-h-[min(80vh,700px)] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3 p-5 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-sky-50 text-sky-600"><Cloud size={20} /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-900">내 수업</h2>
                <p className="text-xs text-slate-500 truncate">{enabled ? `구글 드라이브 '옥쌤보드' 폴더 · ${status}` : '구글 드라이브에 저장하면 어느 기기에서든 같은 수업을 엽니다'}</p>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>

            {!enabled ? (
              <div className="p-8 flex flex-col items-center text-center gap-4">
                <ul className="text-[13px] text-slate-600 space-y-1.5 text-left list-disc pl-5">
                  <li>수업을 저장하면 내 구글 드라이브 <b>'옥쌤보드'</b> 폴더에 함께 올라갑니다(30초마다 자동).</li>
                  <li>맥북·교실 컴퓨터·아이패드에서 같은 계정으로 들어가면 이 목록이 똑같이 보입니다.</li>
                  <li>교과서 PDF·3D 모델도 함께 옮겨집니다. 무료이며, 옥쌤보드가 만든 파일만 다룹니다.</li>
                  <li>다른 기기에서 더 최근에 고쳤으면 덮어쓰기 전에 알려 줍니다.</li>
                </ul>
                <button
                  onClick={async () => { setBusy(true); const ok = await onEnable(); setBusy(false); if (ok) refresh(); }}
                  disabled={busy}
                  className="h-12 px-6 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Cloud size={18} />}구글 드라이브에 저장 켜기
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-5 py-3">
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="수업 이름으로 찾기" className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-slate-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-sky-200" aria-label="수업 찾기" />
                  <button onClick={refresh} disabled={busy} className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="새로 고침" title="목록 새로 고침"><RefreshCw size={15} className={cn(busy && 'animate-spin')} /></button>
                  <button onClick={onSaveNow} className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[13px] font-semibold">지금 저장</button>
                  <button onClick={onNewLesson} className="h-9 px-3 rounded-xl bg-sky-600 text-white text-[13px] font-semibold flex items-center gap-1.5"><FilePlus2 size={15} />새 수업</button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-4">
                  {err ? <p className="py-10 text-center text-sm text-red-500">{err}</p>
                    : items === null ? <div className="py-10 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                    : shown.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">{items.length ? '찾는 수업이 없습니다.' : '아직 드라이브에 저장한 수업이 없습니다. [지금 저장]을 눌러 보세요.'}</p>
                    : (
                      <ul className="divide-y divide-slate-100">
                        {shown.map(l => (
                          <li key={l.id}>
                            <button onClick={() => onOpenLesson(l)} disabled={l.id === currentFileId} className="w-full flex items-center gap-3 py-3 text-left disabled:cursor-default group">
                              <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', l.id === currentFileId ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-sky-50 group-hover:text-sky-600')}>
                                {l.id === currentFileId ? <Check size={16} /> : <FileText size={16} />}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-semibold text-slate-800 truncate">{l.name}</span>
                                <span className="block text-[12px] text-slate-500">{ago(l.modifiedTime)}{l.slides ? ` · 슬라이드 ${l.slides}장` : ''}{l.size ? ` · ${l.size > 1048576 ? (l.size / 1048576).toFixed(1) + 'MB' : Math.ceil(l.size / 1024) + 'KB'}` : ''}</span>
                              </span>
                              <span className="text-[12px] font-semibold text-sky-600">{l.id === currentFileId ? '지금 여는 중' : '열기'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-500">
                  <span>지우거나 이름을 바꾸려면 구글 드라이브의 '옥쌤보드' 폴더에서 하세요.</span>
                  <button onClick={onDisable} className="text-slate-400 hover:text-red-500">이 기기에서 드라이브 저장 끄기</button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
