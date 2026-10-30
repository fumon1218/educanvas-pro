import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layout, Moon, Grid, Circle, Square } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { CanvasBackground } from '@/src/components/Canvas/Whiteboard';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasBackground: CanvasBackground;
  onCanvasBackgroundChange: (bg: CanvasBackground) => void;
  isVertical: boolean;
  onToggleOrientation: () => void;
}

const BACKGROUNDS: { id: CanvasBackground; label: string; icon: React.ElementType }[] = [
  { id: 'blank', label: '흰 화면', icon: Square },
  { id: 'grid', label: '모눈', icon: Grid },
  { id: 'dot', label: '점선 모눈', icon: Circle },
  { id: 'dark', label: '칠판(어두운 화면)', icon: Moon },
];

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Z / Ctrl + Y', '실행 취소 / 다시 실행'],
  ['Ctrl + C / X / V', '복사 / 잘라내기 / 붙여넣기'],
  ['Ctrl + G', '그룹으로 묶기 (Shift: 풀기)'],
  ['Delete', '선택한 객체 삭제'],
  ['Space + 끌기', '화면 이동'],
  ['마우스 휠 / 두 손가락', '확대·축소'],
  ['PageDown / → , PageUp / ←', '다음 / 이전 슬라이드 (프레젠터 리모컨 가능)'],
  ['Ctrl + S', '저장'],
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, canvasBackground, onCanvasBackgroundChange, isVertical, onToggleOrientation,
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="설정"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-gray-200"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-800">설정</h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full" aria-label="닫기"><X size={20} /></button>
          </div>

          <div className="p-6 space-y-8">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">캔버스 배경</div>
              <div className="grid grid-cols-2 gap-3">
                {BACKGROUNDS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => onCanvasBackgroundChange(b.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border transition-all',
                      canvasBackground === b.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-600',
                    )}
                  >
                    <b.icon size={18} />
                    <span className="font-medium text-sm">{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-700">도구 막대 위치</div>
                <p className="text-xs text-gray-500">왼쪽 세로 또는 아래쪽 가로</p>
              </div>
              <button onClick={onToggleOrientation} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700">
                <Layout size={16} className={cn(isVertical && '-rotate-90')} />
                {isVertical ? '세로' : '가로'}
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-700">단축키</div>
              <dl className="text-xs divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2">
                    <dt className="font-mono text-gray-600 whitespace-nowrap">{k}</dt>
                    <dd className="text-gray-500 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
