import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

export const FloatingCamera = ({ onClose }: { onClose: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError('Camera access denied or not available.');
        console.error(err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="absolute bottom-32 right-6 z-50 w-64 h-48 bg-black rounded-2xl shadow-2xl overflow-hidden border-2 border-white/20 cursor-move"
    >
      <button 
        onClick={onClose}
        className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-sm transition-colors"
      >
        <X size={16} />
      </button>
      
      {error ? (
        <div className="w-full h-full flex items-center justify-center text-white text-sm p-4 text-center">
          {error}
        </div>
      ) : (
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover pointer-events-none scale-x-[-1]"
        />
      )}
    </motion.div>
  );
};
