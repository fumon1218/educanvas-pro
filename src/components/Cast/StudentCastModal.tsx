import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, MonitorSmartphone, Radio, Square } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

export const StudentCastModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  live: boolean;
  status: 'idle' | 'connecting' | 'live' | 'error';
  code: string | null;
  url: string | null;
  count: number;
  onStart: () => void;
  onStop: () => void;
  allowSave?: boolean;
  onAllowSave?: (v: boolean) => void;
}> = ({ isOpen, onClose, live, status, code, url, count, onStart, onStop, allowSave = true, onAllowSave }) => {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [url]);

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast.success('학생용 링크를 복사했습니다.'); }
    catch { toast.error('복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.'); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="학생 화면 보내기"
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-6 pt-6 pb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center"><MonitorSmartphone size={22} /></div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-900">학생 화면 보내기</h2>
                <p className="text-xs text-slate-500">학생 태블릿·컴퓨터에 지금 화면을 읽기 전용으로 보여 줍니다</p>
              </div>
              <button onClick={onClose} aria-label="닫기" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>

            {!live ? (
              <div className="px-6 pb-6 space-y-4">
                <ul className="text-[13px] text-slate-600 space-y-1.5 list-disc pl-5">
                  <li>학생은 <b>로그인 없이</b> 링크나 QR 코드로 들어옵니다.</li>
                  <li>선생님이 넘기는 슬라이드, 판서, 확대한 부분, 레이저 점이 그대로 보입니다.</li>
                  <li>학생은 화면을 바꿀 수 없습니다. 끝내기를 누르면 학생 화면도 멈춥니다.</li>
                </ul>
                <SaveToggle value={allowSave} onChange={onAllowSave} />
                <button onClick={onStart} className="w-full h-12 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center justify-center gap-2">
                  <Radio size={18} />보내기 시작
                </button>
              </div>
            ) : (
              <div className="px-6 pb-6">
                <div className="flex gap-4 items-center">
                  <div className="w-40 h-40 shrink-0 rounded-2xl ring-1 ring-slate-200 bg-white flex items-center justify-center overflow-hidden">
                    {qr ? <img src={qr} alt="학생 화면 QR 코드" className="w-full h-full" /> : <span className="text-xs text-slate-400">QR 만드는 중…</span>}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-[12px] text-slate-500">코드</div>
                    <div className="font-mono text-3xl font-bold tracking-[0.2em] text-slate-900">{code}</div>
                    <div className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded-full', status === 'live' ? 'bg-emerald-50 text-emerald-700' : status === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>
                      <span className={cn('w-2 h-2 rounded-full', status === 'live' ? 'bg-emerald-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-amber-500')} />
                      {status === 'live' ? `보내는 중 · 학생 ${count}명` : status === 'error' ? '연결 오류 (인터넷을 확인해 주세요)' : '준비 중…'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <input readOnly value={url ?? ''} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-slate-100 text-[12px] text-slate-600" aria-label="학생용 링크" />
                  <button onClick={copy} className="h-10 px-3 rounded-xl bg-slate-900 text-white text-[13px] font-semibold flex items-center gap-1.5"><Copy size={14} />복사</button>
                </div>
                <div className="mt-3"><SaveToggle value={allowSave} onChange={onAllowSave} /></div>
                <button onClick={onStop} className="mt-4 w-full h-11 rounded-2xl ring-1 ring-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center justify-center gap-2">
                  <Square size={15} />보내기 끝내기
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** 학생이 판서를 받아 갈 수 있게 할지 */
const SaveToggle: React.FC<{ value: boolean; onChange?: (v: boolean) => void }> = ({ value, onChange }) => (
  <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 cursor-pointer">
    <span>
      <span className="block text-[13px] font-semibold text-slate-800">학생이 판서 받아 가기</span>
      <span className="block text-[12px] text-slate-500">학생이 본 슬라이드를 그림·PDF로 저장해 복습할 수 있습니다</span>
    </span>
    <input type="checkbox" className="w-5 h-5 accent-sky-600" checked={value} onChange={e => onChange?.(e.target.checked)} aria-label="학생이 판서 받아 가기" />
  </label>
);
