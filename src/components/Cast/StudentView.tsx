import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Loader2, MonitorSmartphone, WifiOff } from 'lucide-react';
import { loadCanvasData } from '@/src/lib/canvasData';
import { drawBackground, isBackgroundId, type CanvasBackground } from '@/src/lib/backgrounds';
import { watchCast, type CastView } from '@/src/lib/studentCast';

/**
 * 학생 화면(읽기 전용). 로그인 없이 링크/QR로 들어와 선생님이 보여 주는 슬라이드를 본다.
 * 선생님이 보내는 것 말고는 아무것도 읽거나 쓰지 않는다.
 */
export const StudentView: React.FC<{ code: string }> = ({ code }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<fabric.StaticCanvas | null>(null);
  const stateRef = useRef<{ bg: CanvasBackground; origin: { x: number; y: number }; view: CastView | null }>({ bg: 'blank', origin: { x: 0, y: 0 }, view: null });
  const [status, setStatus] = useState<'connecting' | 'live' | 'waiting' | 'ended' | 'error'>('connecting');
  const [label, setLabel] = useState('');
  const [hasScene, setHasScene] = useState(false);
  const [laser, setLaser] = useState<{ x: number; y: number; t: number } | null>(null);
  const loadToken = useRef(0);

  const layout = () => {
    const fc = fcRef.current, box = boxRef.current, bg = bgRef.current;
    if (!fc || !box || !bg) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (fc.width !== W || fc.height !== H) fc.setDimensions({ width: W, height: H });
    const v = stateRef.current.view;
    let vpt: fabric.TMat2D = [1, 0, 0, 1, 0, 0];
    if (v && v.w > 0 && v.h > 0) {
      const z = Math.min(W / v.w, H / v.h);
      vpt = [z, 0, 0, z, W / 2 - (v.x + v.w / 2) * z, H / 2 - (v.y + v.h / 2) * z];
    }
    fc.setViewportTransform(vpt);
    fc.requestRenderAll();
    const dpr = window.devicePixelRatio || 1;
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    const ctx = bg.getContext('2d');
    if (ctx) drawBackground(ctx, stateRef.current.bg, bg.width, bg.height, vpt as number[], dpr, stateRef.current.origin);
  };

  useEffect(() => {
    document.title = '옥쌤보드 · 학생 화면';
    const fc = new fabric.StaticCanvas(elRef.current!, { enableRetinaScaling: true, renderOnAddRemove: false });
    fcRef.current = fc;
    const onResize = () => layout();
    window.addEventListener('resize', onResize);
    layout();
    const stop = watchCast(code, {
      onStatus: setStatus,
      onMessage: async m => {
        if (m.type === 'scene') {
          stateRef.current = { bg: isBackgroundId(m.bg) ? m.bg : 'blank', origin: m.origin, view: m.view };
          setLabel(`${m.index + 1} / ${m.total}${m.name ? ` · ${m.name}` : ''}`);
          const token = ++loadToken.current;
          await loadCanvasData(fc, m.data);
          if (token !== loadToken.current) return;
          fc.getObjects().forEach(o => { o.selectable = false; o.evented = false; });
          setHasScene(true);
          layout();
        } else if (m.type === 'view') {
          stateRef.current.view = m.view;
          layout();
        } else if (m.type === 'laser') {
          setLaser({ x: m.x, y: m.y, t: Date.now() });
        }
      },
    });
    return () => { stop(); window.removeEventListener('resize', onResize); fc.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 레이저 점은 잠시 뒤 사라진다
  useEffect(() => {
    if (!laser) return;
    const t = setTimeout(() => setLaser(null), 1200);
    return () => clearTimeout(t);
  }, [laser]);

  const vpt = fcRef.current?.viewportTransform;
  const laserPos = laser && vpt ? { left: laser.x * vpt[0] + vpt[4], top: laser.y * vpt[3] + vpt[5] } : null;

  return (
    <div className="fixed inset-0 bg-[#eef1f6] flex flex-col font-sans select-none">
      <div ref={boxRef} className="relative flex-1 m-2 sm:m-3 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-900/[0.06] shadow-sm">
        <canvas ref={bgRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
        <canvas ref={elRef} />
        {laserPos && <span className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.6)] pointer-events-none" style={laserPos} />}
        {(!hasScene || status !== 'live') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm text-slate-600">
            {status === 'ended' ? <MonitorSmartphone size={40} className="text-slate-400" /> : status === 'error' ? <WifiOff size={40} className="text-slate-400" /> : <Loader2 size={36} className="animate-spin text-indigo-500" />}
            <p className="text-lg font-semibold text-slate-800">
              {status === 'ended' ? '선생님이 화면 보내기를 끝냈습니다' : status === 'live' ? '선생님 화면을 받는 중…' : status === 'error' ? '연결하지 못했습니다. 다시 시도하는 중…' : '선생님 화면을 기다리는 중…'}
            </p>
            <p className="text-sm text-slate-500">코드 <b className="font-mono tracking-widest text-slate-700">{code}</b></p>
          </div>
        )}
      </div>
      <div className="h-10 px-4 flex items-center justify-between text-[13px] text-slate-500">
        <span className="font-semibold text-slate-700">옥쌤보드 · 학생 화면</span>
        <span className="tabular-nums truncate ml-3">{label}</span>
      </div>
    </div>
  );
};
