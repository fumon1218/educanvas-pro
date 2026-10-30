import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ExternalLink, X, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { sanitizeUrl } from '@/src/lib/canvasData';
import type { MediaSelection } from '@/src/components/Canvas/Whiteboard';

interface MediaControllerProps {
  selection: MediaSelection;
  onClose: () => void;
}

export const MediaController: React.FC<MediaControllerProps> = ({ selection, onClose }) => {
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
      className="absolute bottom-48 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl"
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
            <span className="text-xs font-medium text-gray-500 truncate max-w-[220px]">{selection.url}</span>
            {safeUrl ? (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
                <ExternalLink size={14} />
                새 창에서 열기
              </a>
            ) : (
              <span className="text-xs text-red-500">열 수 없는 주소입니다</span>
            )}
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-gray-200" />
      <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600" aria-label="닫기"><X size={18} /></button>
    </motion.div>
  );
};
