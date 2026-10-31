import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, Loader2, RotateCcw } from 'lucide-react';
import { listHistory, type HistoryEntry } from '@/src/lib/projectStore';

const REASON: Record<HistoryEntry['reason'], string> = {
  replaced: '다른 수업으로 바뀌기 전',
  snapshot: '자동 보관 (20분마다)',
  'before-restore': '되살리기 전 수업',
};

/** 수업 기록: 덮어쓰기 전·20분마다 자동으로 보관된 수업 (최근 15개) */
export const LessonHistoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRestore: (e: HistoryEntry) => void;
}> = ({ isOpen, onClose, onRestore }) => {
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    setItems(null);
    listHistory().then(setItems).catch(() => setItems([]));
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="수업 기록"
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="relative w-full max-w-xl max-h-[min(80vh,640px)] flex flex-col bg-white rounded-3xl shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center gap-3 p-5 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><History size={20} /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-900">수업 기록</h2>
                <p className="text-xs text-slate-500">다른 수업을 저장하기 전과 20분마다 이 브라우저에 자동 보관합니다 (최근 15개).</p>
              </div>
              <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full" aria-label="닫기"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2">
              {items === null ? <div className="py-10 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                : items.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">아직 보관된 기록이 없습니다.</p>
                : (
                  <ul className="divide-y divide-slate-100">
                    {items.map(h => (
                      <li key={h.id} className="flex items-center gap-3 py-3">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold text-slate-800 truncate">{h.name}</span>
                          <span className="block text-[12px] text-slate-500">
                            {new Date(h.savedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 저장 · 슬라이드 {h.slides}장 · {REASON[h.reason]}
                          </span>
                        </span>
                        <button onClick={() => onRestore(h)} className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold flex items-center gap-1.5 shrink-0">
                          <RotateCcw size={14} />되살리기
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <p className="px-5 py-3 border-t border-slate-100 text-[12px] text-slate-500">되살리면 지금 수업도 기록에 먼저 보관되므로 아무것도 사라지지 않습니다.</p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
