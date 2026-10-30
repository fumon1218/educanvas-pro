import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Minus, Plus, Play, Pause, RotateCcw, GripHorizontal } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/**
 * 수업 집중 도구: 가림막, 스포트라이트, 타이머.
 * 녹화 화면에도 같은 모습이 들어가도록 현재 상태를 overlayStateRef에 기록한다.
 */
export interface OverlayState {
  shadeOn: boolean;
  /** 가림막 윗변 위치 (화면 높이 대비 0~1) */
  shadeTop: number;
  spotlightOn: boolean;
  spotX: number;
  spotY: number;
  spotR: number;
}

export const createOverlayState = (): OverlayState => ({
  shadeOn: false, shadeTop: 0.4, spotlightOn: false, spotX: -9999, spotY: -9999, spotR: 140,
});

/** 녹화용: 같은 오버레이를 녹화 캔버스에 그린다 (좌표는 화면 CSS px 기준 → scale 배율 적용) */
export function drawOverlaysOnto(ctx: CanvasRenderingContext2D, st: OverlayState, w: number, h: number, scale: number, offset: { x: number; y: number } = { x: 0, y: 0 }) {
  if (st.spotlightOn && st.spotX > -9000) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc((st.spotX - offset.x) * scale, (st.spotY - offset.y) * scale, st.spotR * scale, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }
  if (st.shadeOn) {
    // 가림막은 브라우저 창 높이 기준 → 녹화하는 판 영역 기준으로 바꾼다
    const top = Math.max(0, (st.shadeTop * window.innerHeight - offset.y) * scale);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, top, w, h - top);
  }
}

// ---------------------------------------------------------------------------
// 가림막: 화면 아래쪽을 가리고, 손잡이를 끌어 내리며 조금씩 보여 준다
// ---------------------------------------------------------------------------
export const ShadeOverlay: React.FC<{
  stateRef: React.MutableRefObject<OverlayState>;
  onClose: () => void;
}> = ({ stateRef, onClose }) => {
  const [top, setTop] = useState(stateRef.current.shadeTop);
  const dragging = useRef(false);

  useEffect(() => {
    stateRef.current.shadeOn = true;
    return () => { stateRef.current.shadeOn = false; };
  }, [stateRef]);

  const setRatio = (r: number) => {
    const v = Math.min(0.97, Math.max(0.03, r));
    stateRef.current.shadeTop = v;
    setTop(v);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setRatio(e.clientY / window.innerHeight);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[30] bg-gray-800 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]"
      style={{ top: `${top * 100}%`, touchAction: 'none' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700 text-white shadow-lg cursor-ns-resize select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="끌어서 가림막 높이 조절"
      >
        <GripHorizontal size={18} />
        <span className="text-sm font-medium">가림막 · 끌어서 보이기</span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          className="ml-1 p-1 rounded-full hover:bg-white/20"
          aria-label="가림막 닫기"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 스포트라이트: 마우스·펜 주변만 밝게
// ---------------------------------------------------------------------------
export const SpotlightOverlay: React.FC<{
  stateRef: React.MutableRefObject<OverlayState>;
  onClose: () => void;
}> = ({ stateRef, onClose }) => {
  const [pos, setPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [r, setR] = useState(stateRef.current.spotR);

  useEffect(() => {
    stateRef.current.spotlightOn = true;
    stateRef.current.spotX = window.innerWidth / 2;
    stateRef.current.spotY = window.innerHeight / 2;
    const move = (e: PointerEvent) => {
      stateRef.current.spotX = e.clientX;
      stateRef.current.spotY = e.clientY;
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      stateRef.current.spotlightOn = false;
    };
  }, [stateRef]);

  const changeR = (d: number) => {
    const v = Math.min(400, Math.max(60, r + d));
    stateRef.current.spotR = v;
    setR(v);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[30] pointer-events-none"
        style={{ background: `radial-gradient(circle ${r}px at ${pos.x}px ${pos.y}px, transparent 0, transparent ${r - 2}px, rgba(0,0,0,0.72) ${r}px)` }}
        aria-hidden="true"
      />
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[61] flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-900/85 text-white shadow-lg">
        <span className="text-sm font-medium mr-1">스포트라이트</span>
        <button onClick={() => changeR(-30)} className="p-1 rounded-full hover:bg-white/20" aria-label="작게"><Minus size={15} /></button>
        <button onClick={() => changeR(30)} className="p-1 rounded-full hover:bg-white/20" aria-label="크게"><Plus size={15} /></button>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 ml-1" aria-label="스포트라이트 끄기"><X size={15} /></button>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 타이머
// ---------------------------------------------------------------------------
const PRESETS = [1, 3, 5, 10];

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* 소리 재생 불가 환경 */ }
}

export const TimerWidget: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [total, setTotal] = useState(3 * 60);
  const [left, setLeft] = useState(3 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const remain = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(remain);
      if (remain === 0) {
        setRunning(false);
        setDone(true);
        beep();
      }
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  const start = useCallback(() => {
    if (left === 0) return;
    endRef.current = Date.now() + left * 1000;
    setDone(false);
    setRunning(true);
  }, [left]);

  const setPreset = (m: number) => {
    setRunning(false);
    setDone(false);
    setTotal(m * 60);
    setLeft(m * 60);
  };
  const adjust = (d: number) => {
    if (running) return;
    const v = Math.max(0, Math.min(99 * 60, left + d));
    setTotal(v); setLeft(v); setDone(false);
  };

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const progress = total > 0 ? left / total : 0;

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'fixed top-24 right-6 z-[62] w-64 rounded-3xl shadow-2xl border p-4 cursor-move select-none',
        done ? 'bg-red-500 border-red-400 text-white animate-pulse' : 'bg-white border-gray-200 text-gray-900',
      )}
      role="timer"
      aria-label="수업 타이머"
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn('text-xs font-semibold', done ? 'text-white' : 'text-gray-400')}>{done ? '시간이 다 됐어요!' : '타이머'}</span>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-black/10" aria-label="타이머 닫기"><X size={16} /></button>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => adjust(-60)} disabled={running} className="p-1.5 rounded-full hover:bg-black/10 disabled:opacity-30" aria-label="1분 줄이기"><Minus size={16} /></button>
        <div className="text-5xl font-bold tabular-nums tracking-tight">{mm}:{ss}</div>
        <button onClick={() => adjust(60)} disabled={running} className="p-1.5 rounded-full hover:bg-black/10 disabled:opacity-30" aria-label="1분 늘리기"><Plus size={16} /></button>
      </div>
      <div className={cn('h-1.5 rounded-full mt-3 overflow-hidden', done ? 'bg-white/30' : 'bg-gray-100')}>
        <div className={cn('h-full rounded-full transition-[width] duration-300', done ? 'bg-white' : 'bg-indigo-500')} style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex gap-1.5 mt-3">
        {PRESETS.map(m => (
          <button key={m} onClick={() => setPreset(m)} className={cn('flex-1 py-1 rounded-lg text-xs font-medium', done ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>
            {m}분
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => (running ? setRunning(false) : start())}
          className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold', done ? 'bg-white text-red-600' : 'bg-indigo-600 text-white hover:bg-indigo-700')}
        >
          {running ? <><Pause size={15} />멈춤</> : <><Play size={15} />시작</>}
        </button>
        <button
          onClick={() => { setRunning(false); setDone(false); setLeft(total); }}
          className={cn('px-3 rounded-xl', done ? 'bg-white/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
          aria-label="처음으로"
          title="처음으로"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </motion.div>
  );
};
