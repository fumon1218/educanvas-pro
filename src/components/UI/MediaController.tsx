import React, { useState, useEffect } from 'react';
import { Play, Pause, Volume2, ExternalLink, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MediaControllerProps {
  selection: { type: 'video' | 'audio' | 'weblink' | 'none', element?: any, url?: string };
  onClose: () => void;
}

export const MediaController: React.FC<MediaControllerProps> = ({ selection, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (selection.type === 'video' && selection.element) {
      setIsPlaying(!selection.element.paused);
      setVolume(selection.element.volume);
    }
  }, [selection]);

  const togglePlay = () => {
    if (selection.type === 'video' && selection.element) {
      if (selection.element.paused) {
        selection.element.play();
        setIsPlaying(true);
      } else {
        selection.element.pause();
        setIsPlaying(false);
      }
    }
  };

  if (selection.type === 'none') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-48 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 bg-white/90 backdrop-blur-md border border-gray-200 rounded-2xl shadow-2xl"
    >
      <div className="flex items-center gap-3">
        {selection.type === 'video' && (
          <>
            <button onClick={togglePlay} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <Volume2 size={18} className="text-gray-400" />
              <input 
                type="range" 
                min="0" max="1" step="0.1" 
                value={volume} 
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (selection.element) selection.element.volume = v;
                }}
                className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </>
        )}
        {selection.type === 'audio' && (
          <audio controls src={selection.url} className="h-10" />
        )}
        {selection.type === 'weblink' && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-gray-500 truncate max-w-[200px]">{selection.url}</span>
            <a 
              href={selection.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <ExternalLink size={14} />
              Open Link
            </a>
          </div>
        )}
      </div>
      <div className="w-px h-6 bg-gray-200 mx-2" />
      <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
        <X size={18} />
      </button>
    </motion.div>
  );
};
