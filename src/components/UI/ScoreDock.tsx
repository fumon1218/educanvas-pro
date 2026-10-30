import React from 'react';
import { motion } from 'motion/react';
import { X, ScanLine } from 'lucide-react';
import { ScorePlayerBar } from './ScorePlayerBar';
import { cn } from '@/src/lib/utils';

/**
 * 악보 연주 막대. 슬라이드를 넘겨도 사라지지 않고 계속 연주하며,
 * [따라가기]를 켜면 연주 중인 마디를 표시하고 다음 쪽 슬라이드로 자동으로 넘긴다.
 */
export const ScoreDock: React.FC<{
  scoreData: string;
  scoreKey: string;
  title?: string;
  follow: boolean;
  onToggleFollow: () => void;
  onPosition: (sec: number | null) => void;
  onClose: () => void;
  presenting?: boolean;
}> = ({ scoreData, scoreKey, title, follow, onToggleFollow, onPosition, onClose, presenting }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn(
      'absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl bg-white/90 backdrop-blur-xl ring-1 ring-slate-900/[0.06] shadow-[0_8px_30px_-6px_rgba(15,23,42,0.25)] max-w-[calc(100vw-32px)] overflow-x-auto',
      presenting ? 'bottom-24' : 'bottom-[108px]',
    )}
    role="region"
    aria-label="악보 연주"
  >
    {title && <span className="hidden md:block text-[12px] font-semibold text-slate-500 max-w-[140px] truncate">{title}</span>}
    <ScorePlayerBar scoreData={scoreData} objectId={scoreKey} onPosition={onPosition} />
    <button
      onClick={onToggleFollow}
      aria-pressed={follow}
      title="연주하는 마디를 표시하고 다음 쪽 슬라이드로 자동으로 넘깁니다"
      className={cn('flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-semibold whitespace-nowrap', follow ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
    >
      <ScanLine size={15} />따라가기
    </button>
    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="연주 막대 닫기" title="연주 멈추고 닫기"><X size={18} /></button>
  </motion.div>
);
