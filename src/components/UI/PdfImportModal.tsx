import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Rows3, CopyPlus, LayoutGrid } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type PdfImportMode = 'stack' | 'slides' | 'grid';

interface PdfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (mode: PdfImportMode, from: number, to: number) => void;
  fileName?: string;
  /** 문서 종류 (PDF, 한글 문서, 파워포인트 …) */
  kind?: string;
  /** 원본과 다를 수 있는 점 */
  note?: string;
  numPages: number;
  preview?: string | null;
}

const MODE_KEY = 'okssam_pdf_mode';
const STACK_MAX = 60;

const MODES: { id: PdfImportMode; icon: React.ElementType; title: string; desc: string }[] = [
  { id: 'stack', icon: Rows3, title: '슬라이드 하나에 차례대로', desc: '쪽을 위에서 아래로 이어 붙입니다. 휠·두 손가락으로 내려 보고, PageDown으로 한 쪽씩 넘깁니다.' },
  { id: 'slides', icon: CopyPlus, title: '쪽마다 슬라이드 자동 추가', desc: '쪽 수만큼 슬라이드가 늘어납니다. 쪽마다 따로 판서하고 넘기기 좋습니다.' },
  { id: 'grid', icon: LayoutGrid, title: '지금 슬라이드에 나란히', desc: '사진처럼 나란히 놓고 자유롭게 옮깁니다.' },
];

export const PdfImportModal: React.FC<PdfImportModalProps> = ({ isOpen, onClose, onImport, fileName, numPages, preview, kind, note }) => {
  const [mode, setMode] = useState<PdfImportMode>(() => {
    try { const v = localStorage.getItem(MODE_KEY); if (v === 'stack' || v === 'slides' || v === 'grid') return v; } catch { /* 무시 */ }
    return 'slides';
  });
  const [all, setAll] = useState(true);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(numPages);

  useEffect(() => { if (isOpen) { setAll(true); setFrom(1); setTo(numPages); } }, [isOpen, numPages]);

  const a = all ? 1 : Math.max(1, Math.min(numPages, from || 1));
  const b = all ? numPages : Math.max(a, Math.min(numPages, to || a));
  const count = b - a + 1;
  const tooMany = mode === 'stack' && count > STACK_MAX;
  const gridTooMany = mode === 'grid' && count > 24;

  const submit = () => {
    if (tooMany || gridTooMany) return;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* 무시 */ }
    onImport(mode, a, b);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="문서 넣기"
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[560px] overflow-hidden ring-1 ring-slate-900/5"
          >
            <div className="flex items-center gap-3 px-6 pt-6 pb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"><FileText size={22} /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-900">{kind || 'PDF'} 넣기</h2>
                <p className="text-xs text-slate-500 truncate">{fileName || '문서.pdf'} · 전체 {numPages}쪽</p>
                {note && <p className="mt-1 text-[11.5px] leading-snug text-amber-700">{note}</p>}
              </div>
              <button onClick={onClose} aria-label="닫기" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>

            <div className="px-6 pb-6 flex gap-5">
              {preview && (
                <div className="hidden sm:block w-[120px] shrink-0">
                  <img src={preview} alt="첫 쪽 미리보기" className="w-full rounded-lg ring-1 ring-slate-200 shadow-sm" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="space-y-2" role="radiogroup" aria-label="넣는 방식">
                  {MODES.map(m => (
                    <button
                      key={m.id}
                      role="radio"
                      aria-checked={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={cn('w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all', mode === m.id ? 'ring-2 ring-indigo-500 bg-indigo-50/60' : 'ring-1 ring-slate-200 hover:ring-slate-300')}
                    >
                      <m.icon size={20} className={cn('mt-0.5 shrink-0', mode === m.id ? 'text-indigo-600' : 'text-slate-400')} />
                      <span>
                        <span className={cn('block text-[14px] font-semibold', mode === m.id ? 'text-indigo-700' : 'text-slate-800')}>{m.title}</span>
                        <span className="block text-[12px] text-slate-500 mt-0.5 leading-snug">{m.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-[12px] font-semibold text-slate-500">넣을 쪽</div>
                  <div className="flex items-center gap-2 text-[13px]">
                    <button onClick={() => setAll(true)} className={cn('h-9 px-3 rounded-lg font-medium', all ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>전체</button>
                    <button onClick={() => setAll(false)} className={cn('h-9 px-3 rounded-lg font-medium', !all ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>범위</button>
                    {!all && (
                      <span className="flex items-center gap-1.5">
                        <input type="number" min={1} max={numPages} value={from} onChange={e => setFrom(parseInt(e.target.value, 10) || 1)} className="w-16 h-9 px-2 rounded-lg ring-1 ring-slate-200 text-center tabular-nums" aria-label="시작 쪽" />
                        <span className="text-slate-400">~</span>
                        <input type="number" min={1} max={numPages} value={to} onChange={e => setTo(parseInt(e.target.value, 10) || 1)} className="w-16 h-9 px-2 rounded-lg ring-1 ring-slate-200 text-center tabular-nums" aria-label="끝 쪽" />
                        <span className="text-slate-500">쪽</span>
                      </span>
                    )}
                  </div>
                  {(tooMany || gridTooMany) && (
                    <p className="text-[12px] text-red-600">
                      {tooMany ? `한 슬라이드에는 ${STACK_MAX}쪽까지 넣을 수 있습니다. 범위를 줄이거나 '쪽마다 슬라이드'를 골라 주세요.` : '나란히 넣기는 24쪽까지입니다.'}
                    </p>
                  )}
                </div>

                <button
                  onClick={submit}
                  disabled={tooMany || gridTooMany}
                  className="w-full h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold"
                >
                  {count}쪽 넣기
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
