import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmState {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export const ConfirmDialog: React.FC<{ state: ConfirmState | null; onClose: () => void }> = ({ state, onClose }) => {
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { state.onConfirm(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state, onClose]);

  return (
    <AnimatePresence>
      {state && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6"
          >
            <div className="flex items-start gap-3">
              {state.danger && (
                <div className="p-2 bg-red-50 text-red-500 rounded-xl shrink-0"><AlertTriangle size={20} /></div>
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900">{state.title}</h2>
                {state.message && <p className="mt-1 text-sm text-gray-600 leading-relaxed">{state.message}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">취소</button>
              <button
                autoFocus
                onClick={() => { state.onConfirm(); onClose(); }}
                className={state.danger
                  ? 'px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600'
                  : 'px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700'}
              >
                {state.confirmLabel || '확인'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
