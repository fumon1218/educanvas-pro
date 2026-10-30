import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ExternalLink, X, RotateCcw, AppWindow, Box } from 'lucide-react';
import { ScorePlayerBar } from './ScorePlayerBar';
import { motion } from 'motion/react';
import { sanitizeUrl } from '@/src/lib/canvasData';
import type { MediaSelection } from '@/src/components/Canvas/Whiteboard';
import { clipLabel, type Clip } from '@/src/components/Windows/WebBrowserPane';

interface MediaControllerProps {
  selection: MediaSelection;
  onClose: () => void;
  onOpenWeb?: (url: string, clip?: Clip) => void;
  onOpenModel?: (modelId: string, name?: string, driveId?: string) => void;
}

export const MediaController: React.FC<MediaControllerProps> = ({ selection, onClose, onOpenWeb, onOpenModel }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const video: HTMLVideoElement | undefined = selection.type === 'video' ? selection.element : undefined;

  useEffect(() => {
    if (!video) return;
    const sync = () => { setIsPlaying(!video.paused); setMuted(video.muted); setVolume(video.volume); };
    sync();
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('volumechange', sync);
    return () => {
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('volumechange', sync);
    };
  }, [video]);

  if (selection.type === 'none') return null;
  const safeUrl = selection.type === 'weblink' ? sanitizeUrl(selection.url || '') : null;
  const clip: Clip | undefined = selection.type === 'weblink' && (selection.clipStart != null || selection.clipEnd != null) ? { start: selection.clipStart, end: selection.clipEnd } : undefined;

  const togglePlay = () => {
    if (!video) return;
    if (video.paused) {
      video.muted = false; // 선생님이 직접 재생하면 소리도 켠다
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    } else video.pause();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-[108px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-2.5 bg-white/85 backdrop-blur-xl ring-1 ring-slate-900/[0.06] rounded-2xl shadow-[0_8px_30px_-6px_rgba(15,23,42,0.22)]"
    >
      <div className="flex items-center gap-3">
        {video && (
          <>
            <button onClick={togglePlay} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700" aria-label={isPlaying ? '일시정지' : '재생'} title={isPlaying ? '일시정지' : '재생'}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => { video.currentTime = 0; }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="처음부터" title="처음부터">
              <RotateCcw size={18} />
            </button>
            <button onClick={() => { video.muted = !video.muted; }} className="p-1 text-gray-500 hover:text-gray-700" aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.1" value={volume}
              onChange={e => { video.volume = parseFloat(e.target.value); if (video.muted) video.muted = false; }}
              className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              aria-label="소리 크기"
            />
          </>
        )}
        {selection.type === 'audio' && (
          selection.url ? <audio controls src={selection.url} className="h-10" /> : <span className="text-sm text-gray-500">소리 파일을 찾을 수 없습니다</span>
        )}
        {selection.type === 'weblink' && (
          <div className="flex items-center gap-4">
            {clip && <span className="text-xs font-bold text-red-600 whitespace-nowrap">▶ {clipLabel(clip)}</span>}
            <span className="text-xs font-medium text-gray-500 truncate max-w-[220px]">{selection.url}</span>
            {safeUrl ? (
              <>
                {onOpenWeb && (
                  <button onClick={() => onOpenWeb(safeUrl, clip)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
                    <AppWindow size={14} />
                    수업 화면에서 열기
                  </button>
                )}
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
                  <ExternalLink size={14} />
                  새 탭
                </a>
              </>
            ) : (
              <span className="text-xs text-red-500">열 수 없는 주소입니다</span>
            )}
          </div>
        )}
        {selection.type === 'model' && (
          <div className="flex items-center gap-3">
            <Box size={18} className="text-indigo-500" />
            <span className="text-xs font-medium text-gray-600 truncate max-w-[200px]">{selection.name?.replace(/\.glb$/i, '') || '3D 모델'}</span>
            <button onClick={() => selection.modelId && onOpenModel?.(selection.modelId, selection.name, selection.driveId)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
              3D로 보기
            </button>
          </div>
        )}
        {selection.type === 'score' && selection.scoreData && (
          <ScorePlayerBar scoreData={selection.scoreData} objectId={selection.objectId} />
        )}
      </div>
      <div className="w-px h-6 bg-gray-200" />
      <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600" aria-label="닫기"><X size={18} /></button>
    </motion.div>
  );
};
