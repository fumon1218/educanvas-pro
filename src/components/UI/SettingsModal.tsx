import NOTICES from '@/THIRD_PARTY_NOTICES.md?raw';
import React, { useState } from 'react';
import { getPenSettings, setPenSettings, type PenSettings } from '@/src/lib/pen';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layout, LogOut, Users } from 'lucide-react';
import { useAccess } from '@/src/components/Access/AccessGate';
import { cn } from '@/src/lib/utils';
import type { CanvasBackground } from '@/src/lib/backgrounds';
import { BackgroundPicker, type BackgroundScope } from './BackgroundPicker';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasBackground: CanvasBackground;
  onCanvasBackgroundChange: (bg: CanvasBackground, scope: BackgroundScope) => void;
  isVertical: boolean;
  onToggleOrientation: () => void;
  studentMode?: boolean;
  onStudentMode?: (on: boolean) => void;
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + Z / Ctrl + Y', '실행 취소 / 다시 실행'],
  ['Ctrl + C / X / V', '복사 / 잘라내기 / 붙여넣기'],
  ['Ctrl + G', '그룹으로 묶기 (Shift: 풀기)'],
  ['Delete', '선택한 객체 삭제'],
  ['Space + 끌기', '화면 이동'],
  ['마우스 휠 / 두 손가락 쓸기', '화면 위아래·좌우 이동'],
  ['Ctrl + 휠 / 두 손가락 벌리기', '확대·축소'],
  ['PageDown / → , PageUp / ←', '다음 / 이전 쪽·슬라이드 (프레젠터 리모컨 가능)'],
  ['Ctrl + S', '저장'],
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, canvasBackground, onCanvasBackgroundChange, isVertical, onToggleOrientation, studentMode = false, onStudentMode,
}) => {
  const access = useAccess();
  return (
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
            {access && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">계정</div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200">
                  {access.user.photoURL
                    ? <img src={access.user.photoURL} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                    : <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">{(access.user.displayName || access.user.email || '?')[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{access.user.displayName || '선생님'}</div>
                    <div className="text-xs text-gray-500 truncate">{access.user.email} · {access.role === 'admin' ? '관리자' : '사용자'}</div>
                  </div>
                  <button onClick={() => { onClose(); access.signOut(); }} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                    <LogOut size={14} />로그아웃
                  </button>
                </div>
                {access.role === 'admin' && (
                  <button onClick={() => { onClose(); access.openAccessManager(); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100">
                    <Users size={16} />사용자 관리 (사용 허락할 계정 등록)
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">수업 배경</div>
              <BackgroundPicker value={canvasBackground} onChange={onCanvasBackgroundChange} />
            </div>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-gray-700">학생 모드</span>
                <span className="block text-xs text-gray-500">공유·협업·학생 화면·AI를 숨기고 공부 도구(오답 모으기·가림 카드·복습·공부 기록)를 앞에 둡니다</span>
              </span>
              <input type="checkbox" className="w-5 h-5 accent-emerald-600 shrink-0" checked={studentMode} onChange={e => onStudentMode?.(e.target.checked)} aria-label="학생 모드" />
            </label>

            <PenSection />

            <details className="group rounded-xl border border-gray-100 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700">저작권·오픈소스 고지</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600">{NOTICES}</pre>
              <a href={`${import.meta.env.BASE_URL}licenses.txt`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs font-semibold text-indigo-600 hover:underline">라이선스 전문 보기</a>
            </details>

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
};

/** 애플 펜슬 설정 (이 기기에 저장) */
const PenSection: React.FC = () => {
  const [pen, setPen] = useState<PenSettings>(getPenSettings);
  const Toggle: React.FC<{ k: keyof PenSettings; title: string; desc: string }> = ({ k, title, desc }) => (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="space-y-0.5">
        <span className="block text-[13px] font-medium text-gray-800">{title}</span>
        <span className="block text-xs text-gray-500">{desc}</span>
      </span>
      <input type="checkbox" role="switch" className="sr-only peer" checked={pen[k]} onChange={e => setPen(setPenSettings({ [k]: e.target.checked }))} />
      <span className="relative w-10 h-6 shrink-0 rounded-full bg-gray-300 peer-checked:bg-indigo-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" aria-hidden />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-700">애플 펜슬 · 스타일러스</div>
      <Toggle k="pressure" title="필압 쓰기" desc="켜면 세게 누를수록 굵게, 끄면 누르는 힘과 상관없이 늘 같은 굵기로 씁니다. 이미 쓴 글씨는 그대로입니다." />
      <Toggle k="fingerPans" title="펜을 쓰면 손가락은 화면 이동만" desc="손바닥·손가락이 닿아도 그어지지 않습니다. 두 손가락으로 확대합니다." />
    </div>
  );
};
