import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, ExternalLink, X } from 'lucide-react';

/**
 * 개별화교육계획(IEP) 작성 도구 — 옥쌤의 즐거운 교실(oks-class)의 curriculum/iep 를 그대로 옮겨 온 것(public/iep).
 * 기록은 이 기기 브라우저에만 저장되고(저장 키 oks_iep_v1), 같은 주소의 즐거운 교실과 함께 씀.
 */
export const IepWindow: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const src = `${import.meta.env.BASE_URL}iep/iep.html`;
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className="fixed inset-0 z-[120] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="개별화교육계획">
          <div className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-slate-200 bg-teal-50 shrink-0">
            <ClipboardList size={18} className="text-teal-600" />
            <span className="flex-1 text-[15px] font-bold text-slate-800 truncate">개별화교육계획</span>
            <span className="hidden md:inline text-[12px] text-slate-500">기록은 이 기기에만 저장됩니다 · 다른 기기로 옮길 때는 [저장·불러오기]의 파일 저장을 쓰세요</span>
            <a href={src} target="_blank" rel="noopener" className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-[13px] text-teal-700 hover:bg-teal-100" title="새 창으로 열기"><ExternalLink size={15} /><span className="hidden sm:inline">새 창</span></a>
            <button onClick={onClose} className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-slate-700 hover:bg-slate-200/60" aria-label="개별화교육계획 닫기"><X size={16} />닫기</button>
          </div>
          <iframe src={src} title="개별화교육계획 작성 도구" className="flex-1 w-full border-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
