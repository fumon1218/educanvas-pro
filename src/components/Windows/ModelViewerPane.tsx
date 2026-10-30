import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCw, Crosshair, Play, Pause, ImagePlus, Loader2, Sun, Moon } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getModelBlob, getModelInfo } from '@/src/lib/assetStore';
import { loadGlb, makeEnvironment, frameObject } from '@/src/lib/three3d';

interface Props {
  modelId: string;
  onTitle?: (t: string) => void;
  /** 지금 보이는 모습을 캔버스에 사진으로 넣기 */
  onSnapshot?: (dataUrl: string, name: string) => void;
  /** 녹화용으로 WebGL 캔버스를 알려 준다 */
  registerCanvas?: (c: HTMLCanvasElement | null) => void;
}

/** GLB 3D 모델 보기: 끌어서 돌리기, 휠·두 손가락으로 확대, 오른쪽 버튼(두 손가락 끌기)으로 이동 */
export const ModelViewerPane: React.FC<Props> = ({ modelId, onTitle, onSnapshot, registerCanvas }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ reset: () => void; snapshot: () => string; setAuto: (v: boolean) => void; setAnim: (v: boolean) => void; setDark: (v: boolean) => void } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [name, setName] = useState('3D 모델');
  const [autoRotate, setAutoRotate] = useState(false);
  const [hasAnim, setHasAnim] = useState(false);
  const [animOn, setAnimOn] = useState(true);
  const [dark, setDark] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    registerCanvas?.(renderer.domElement);

    const scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 2;
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Object3D | null = null;
    const clock = new THREE.Clock();
    let animPlaying = true;

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (mixer && animPlaying) mixer.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    api.current = {
      reset: () => { if (model) { frameObject(model, camera, controls.target); controls.update(); } },
      snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
      setAuto: v => { controls.autoRotate = v; },
      setAnim: v => { animPlaying = v; },
      setDark: v => { scene.background = v ? new THREE.Color(0x1f2937) : null; },
    };

    (async () => {
      try {
        const [blob, meta] = await Promise.all([getModelBlob(modelId), getModelInfo(modelId)]);
        if (disposed) return;
        if (!blob) { setStatus('missing'); return; }
        const title = meta?.name?.replace(/\.(glb|gltf)$/i, '') || '3D 모델';
        setName(title);
        onTitle?.(title);
        const gltf = await loadGlb(blob, renderer);
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        frameObject(model, camera, controls.target);
        controls.update();
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach(clip => mixer!.clipAction(clip).play());
          setHasAnim(true);
        }
        let tris = 0;
        model.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry) {
            const g = m.geometry;
            tris += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
          }
        });
        setInfo(`면 ${Math.round(tris).toLocaleString('ko-KR')}개${gltf.animations.length ? ` · 애니메이션 ${gltf.animations.length}개` : ''}`);
        setStatus('ready');
      } catch (err) {
        console.error('3D 모델을 열지 못했습니다', err);
        if (!disposed) setStatus('error');
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      registerCanvas?.(null);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach(mat => mat && (mat as THREE.Material).dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const Btn: React.FC<{ title: string; active?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ title, active, onClick, disabled, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn('p-2 rounded-xl transition-colors disabled:opacity-30', active ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-600 hover:bg-white shadow-sm')}
    >
      {children}
    </button>
  );

  return (
    <div className={cn('absolute inset-0', dark ? 'bg-slate-800' : 'bg-gradient-to-b from-slate-50 to-slate-200')}>
      <div ref={hostRef} className="absolute inset-0" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 p-6 text-center">
          {status === 'loading' && <><Loader2 className="animate-spin text-indigo-500" />3D 모델을 여는 중…</>}
          {status === 'missing' && <>이 컴퓨터의 3D 자산함에 이 모델이 없습니다.<br />GLB 파일을 다시 넣어 주세요.</>}
          {status === 'error' && <>3D 모델을 열지 못했습니다.<br />GLB(glTF 바이너리) 파일인지 확인해 주세요.</>}
        </div>
      )}
      {status === 'ready' && (
        <>
          <div className="absolute left-2 top-2 flex flex-col gap-1.5">
            <Btn title="자동으로 돌리기" active={autoRotate} onClick={() => { const v = !autoRotate; setAutoRotate(v); api.current?.setAuto(v); }}><RotateCw size={16} /></Btn>
            <Btn title="처음 시점으로" onClick={() => api.current?.reset()}><Crosshair size={16} /></Btn>
            {hasAnim && (
              <Btn title={animOn ? '움직임 멈추기' : '움직임 재생'} active={animOn} onClick={() => { const v = !animOn; setAnimOn(v); api.current?.setAnim(v); }}>
                {animOn ? <Pause size={16} /> : <Play size={16} />}
              </Btn>
            )}
            <Btn title={dark ? '밝은 배경' : '어두운 배경'} onClick={() => { const v = !dark; setDark(v); api.current?.setDark(v); }}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Btn>
          </div>
          {onSnapshot && (
            <button
              onClick={() => { const url = api.current?.snapshot(); if (url) onSnapshot(url, name); }}
              className="absolute right-2 top-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow hover:bg-indigo-700"
              title="지금 보이는 모습을 캔버스에 사진으로 넣기"
            >
              <ImagePlus size={15} />캔버스에 넣기
            </button>
          )}
          <div className="absolute left-2 bottom-2 px-2 py-1 rounded-lg bg-black/40 text-white text-[11px]">
            끌기: 돌리기 · 휠/두 손가락: 확대 · 오른쪽 끌기: 이동 {info && `· ${info}`}
          </div>
        </>
      )}
    </div>
  );
};
