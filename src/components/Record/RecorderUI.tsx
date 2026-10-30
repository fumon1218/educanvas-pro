import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Circle, Square, Pause, Play, X, Download, Copy, Mic, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { formatTime, RecordingResult } from '@/src/lib/lessonRecorder';

/** 녹화 시작 전 설정 창 */
export const RecordStartDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onStart: (opts: { mic: boolean; camera: boolean }) => void;
  starting: boolean;
}> = ({ isOpen, onClose, onStart, starting }) => {
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(false);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            role="dialog" aria-modal="true" aria-label="수업 녹화"
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">수업 녹화</h2>
              <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full" aria-label="닫기"><X size={18} /></button>
            </div>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              판서 화면과 목소리를 함께 녹화합니다. 녹화 파일은 이 컴퓨터에만 저장되고 어디에도 올라가지 않습니다.
            </p>
            <div className="mt-5 space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={mic} onChange={e => setMic(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <Mic size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-800">마이크 소리 넣기</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                <Camera size={18} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-800">내 얼굴(카메라) 작은 화면 넣기</span>
              </label>
            </div>
            <p className="mt-3 text-xs text-gray-400">슬라이드를 넘길 때마다 구간이 자동으로 기록됩니다. 녹화 중에도 펜·레이저·가림막을 그대로 쓸 수 있습니다.</p>
            <button
              onClick={() => onStart({ mic, camera })}
              disabled={starting}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60"
            >
              {starting ? <Loader2 size={18} className="animate-spin" /> : <Circle size={16} fill="currentColor" />}
              녹화 시작
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/** 녹화 중 상단 표시줄 */
export const RecordingStatus: React.FC<{
  state: 'recording' | 'paused';
  getElapsed: () => number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}> = ({ state, getElapsed, onPause, onResume, onStop }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full bg-gray-900/90 text-white shadow-2xl" role="status" aria-live="polite">
      <span className={cn('w-2.5 h-2.5 rounded-full', state === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-yellow-400')} />
      <span className="text-sm font-semibold">{state === 'recording' ? '녹화 중' : '일시정지'}</span>
      <span className="text-sm tabular-nums text-white/80 w-14">{formatTime(getElapsed())}</span>
      {state === 'recording' ? (
        <button onClick={onPause} className="p-2 rounded-full hover:bg-white/15" aria-label="일시정지" title="일시정지"><Pause size={16} /></button>
      ) : (
        <button onClick={onResume} className="p-2 rounded-full hover:bg-white/15" aria-label="이어서 녹화" title="이어서 녹화"><Play size={16} /></button>
      )}
      <button onClick={onStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-sm font-semibold" aria-label="녹화 끝내기">
        <Square size={12} fill="currentColor" />끝내기
      </button>
    </div>
  );
};

/** 녹화 결과 */
export const RecordingResultDialog: React.FC<{
  result: RecordingResult | null;
  fileBase: string;
  onClose: () => void;
}> = ({ result, fileBase, onClose }) => {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [result]);
  if (!result) return null;

  const chaptersText = result.chapters.map(c => `${formatTime(c.at)} ${c.label}`).join('\n');
  const fileName = `${fileBase}.${result.extension}`;
  const download = () => {
    const a = document.createElement('a');
    a.href = result.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSaved(true);
  };
  const close = () => {
    if (!saved) {
      if (!window.confirm('녹화 파일을 아직 저장하지 않았습니다. 닫으면 녹화 내용이 사라집니다. 닫을까요?')) return;
    }
    URL.revokeObjectURL(result.url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="녹화 완료" className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">녹화가 끝났습니다</h2>
            <p className="text-xs text-gray-500 mt-0.5">길이 {formatTime(result.durationMs)} · {(result.blob.size / 1024 / 1024).toFixed(1)}MB · {result.extension.toUpperCase()}</p>
          </div>
          <button onClick={close} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full" aria-label="닫기"><X size={18} /></button>
        </div>
        <video src={result.url} controls className="mt-4 w-full rounded-2xl bg-black aspect-video" />
        <button onClick={download} className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
          <Download size={18} />{saved ? '다시 저장하기' : '영상 파일로 저장'}
        </button>
        {result.extension === 'webm' && (
          <p className="mt-2 text-xs text-gray-400">WEBM 영상은 크롬·엣지·유튜브·구글 드라이브에서 바로 재생됩니다. 다른 프로그램에서 열리지 않으면 MP4로 변환해 주세요.</p>
        )}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-700">슬라이드 구간 (유튜브 챕터로 붙여 넣을 수 있습니다)</span>
            <button
              onClick={() => navigator.clipboard?.writeText(chaptersText).then(() => toast.success('구간 목록을 복사했습니다.')).catch(() => toast.error('복사하지 못했습니다.'))}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              <Copy size={13} />복사
            </button>
          </div>
          <pre className="text-xs bg-gray-50 border border-gray-100 rounded-xl p-3 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-gray-700">{chaptersText}</pre>
        </div>
      </div>
    </div>
  );
};
