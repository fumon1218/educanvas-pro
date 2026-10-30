import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCw, Crosshair, Play, Pause, ImagePlus, Loader2, Sun, Moon, Tag, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { getModelBlob, getModelInfo, updateModel, type ModelLabel } from '@/src/lib/assetStore';
import { loadGlb, makeEnvironment, frameObject } from '@/src/lib/three3d';

interface Props {
  modelId: string;
  /** 구글 드라이브 파일 번호: 이 컴퓨터 자산함에 없을 때 드라이브에서 다시 받는다 */
  driveId?: string;
  modelName?: string;
  onTitle?: (t: string) => void;
  /** 지금 보이는 모습을 캔버스에 사진으로 넣기 */
  onSnapshot?: (dataUrl: string, name: string) => void;
  /** 녹화용으로 WebGL 캔버스를 알려 준다 */
  registerCanvas?: (c: HTMLCanvasElement[] | null) => void;
}

/** 이름표 하나를 그린다 (화면·사진·녹화 공통) */
function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, k: number) {
  ctx.save();
  ctx.font = `600 ${13 * k}px Pretendard, 'Noto Sans KR', sans-serif`;
  const tw = ctx.measureText(text).width;
  const bx = x + 18 * k, by = y - 34 * k, bw = tw + 18 * k, bh = 26 * k;
  ctx.strokeStyle = 'rgba(15,23,42,0.75)';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by + bh); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15,23,42,0.25)'; ctx.shadowBlur = 8 * k; ctx.shadowOffsetY = 2 * k;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8 * k); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5 * k; ctx.stroke();
  ctx.fillStyle = '#1e293b'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 9 * k, by + bh / 2 + 0.5 * k);
  ctx.fillStyle = '#4f46e5'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * k;
  ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  return { x: bx, y: by, w: bw, h: bh };
}

/** GLB 3D 모델 보기: 끌어서 돌리기, 휠·두 손가락으로 확대, 오른쪽 버튼(두 손가락 끌기)으로 이동 */
export const ModelViewerPane: React.FC<Props> = ({ modelId, driveId, modelName, onTitle, onSnapshot, registerCanvas }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [labelMode, setLabelMode] = useState(false);
  const labelModeRef = useRef(false);
  labelModeRef.current = labelMode;
  const labelsRef = useRef<ModelLabel[]>([]);
  const [labelCount, setLabelCount] = useState(0);
  const [draft, setDraft] = useState<{ x: number; y: number; p: [number, number, number] } | null>(null);
  const [draftText, setDraftText] = useState('');
  const saveLabels = (next: ModelLabel[]) => {
    labelsRef.current = next;
    setLabelCount(next.length);
    updateModel(modelId, { labels: next }).catch(() => {});
  };
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
    const overlay = overlayRef.current!;
    registerCanvas?.([renderer.domElement, overlay]);

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
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
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
      drawLabels(overlay.getContext('2d')!, overlay.width, overlay.height);
    };

    /** 이름표: 모델 좌표 → 화면 좌표로 옮겨 그린다. 가려진 쪽은 흐리게 */
    const v = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    let boxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
    const hiddenOf = new Map<string, boolean>();
    let frame = 0;
    const drawLabels = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      ctx.clearRect(0, 0, W, H);
      boxes = [];
      frame++;
      if (!model || !labelsRef.current.length) return;
      const k = W / (host.clientWidth || 1);
      camera.getWorldDirection(camDir);
      for (const l of labelsRef.current) {
        v.set(l.p[0], l.p[1], l.p[2]);
        model.localToWorld(v);
        const toPoint = v.clone().sub(camera.position);
        if (toPoint.dot(camDir) <= 0) continue;
        // 가려졌는지는 몇 프레임에 한 번만 잰다 (큰 모델에서도 가볍게)
        let hidden = hiddenOf.get(l.id) ?? false;
        if (frame % 10 === 0) {
          const dist = toPoint.length();
          ray.set(camera.position, toPoint.normalize());
          const hit = ray.intersectObject(model, true)[0];
          hidden = !!hit && hit.distance < dist - dist * 0.02;
          hiddenOf.set(l.id, hidden);
        }
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        ctx.globalAlpha = hidden ? 0.35 : 1;
        const b = drawLabel(ctx, x, y, l.text, k);
        boxes.push({ id: l.id, x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k });
      }
      ctx.globalAlpha = 1;
    };

    // 이름표 붙이기: 이름표 모드에서 모델을 누르면 그 자리에 이름을 적는다 (끌어서 돌린 경우는 제외)
    const ray = new THREE.Raycaster();
    const down = { x: 0, y: 0, t: 0 };
    const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; down.t = Date.now(); };
    const onUp = (e: PointerEvent) => {
      if (!labelModeRef.current || !model) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || Date.now() - down.t > 600) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const onBox = boxes.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
      if (onBox) {
        const before = labelsRef.current;
        saveLabels(before.filter(l => l.id !== onBox.id));
        toast('이름표를 지웠습니다.', { action: { label: '되돌리기', onClick: () => saveLabels(before) }, duration: 3000 });
        return;
      }
      const ndc = new THREE.Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(model, true)[0];
      if (!hit) return;
      const local = model.worldToLocal(hit.point.clone());
      setDraft({ x: px, y: py, p: [local.x, local.y, local.z] });
      setDraftText('');
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    loop();

    api.current = {
      reset: () => { if (model) { frameObject(model, camera, controls.target); controls.update(); } },
      snapshot: () => {
        renderer.render(scene, camera);
        const c = document.createElement('canvas');
        c.width = renderer.domElement.width; c.height = renderer.domElement.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(renderer.domElement, 0, 0);
        ctx.drawImage(overlay, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      },
      setAuto: v => { controls.autoRotate = v; },
      setAnim: v => { animPlaying = v; },
      setDark: v => { scene.background = v ? new THREE.Color(0x1f2937) : null; },
    };

    (async () => {
      try {
        const [blob, meta] = await Promise.all([getModelBlob(modelId), getModelInfo(modelId)]);
        if (disposed) return;
        if (!blob) { setStatus('missing'); return; }
        labelsRef.current = meta?.labels ?? [];
        setLabelCount(labelsRef.current.length);
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
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
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
  }, [modelId, reloadKey]);

  const fetchFromDrive = async () => {
    if (!driveId) return;
    setFetching(true);
    try {
      const { getDriveToken, downloadDriveFile } = await import('@/src/lib/googleDrive');
      const { importModelBlob } = await import('./AssetLibrary');
      const token = await getDriveToken();
      const blob = await downloadDriveFile(token, driveId);
      await importModelBlob(blob, { name: modelName || '3D 모델.glb', driveId, id: modelId });
      setStatus('loading');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      if (e?.code !== 'cancelled') toast.error('드라이브에서 받지 못했습니다.', { description: e?.message });
    } finally {
      setFetching(false);
    }
  };

  const commitDraft = () => {
    const t = draftText.trim();
    if (draft && t) saveLabels([...labelsRef.current, { id: Math.random().toString(36).slice(2, 10), text: t.slice(0, 40), p: draft.p }]);
    setDraft(null);
  };

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
      <div ref={hostRef} className={cn('absolute inset-0', labelMode && '[&>canvas]:cursor-crosshair')} />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
      {draft && (
        <form
          onSubmit={e => { e.preventDefault(); commitDraft(); }}
          className="absolute z-10 flex items-center gap-1 p-1 rounded-xl bg-white shadow-lg ring-1 ring-indigo-200"
          style={{ left: Math.max(4, draft.x + 12), top: Math.max(4, draft.y - 44) }}
        >
          <input
            autoFocus value={draftText} onChange={e => setDraftText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setDraft(null); e.stopPropagation(); }}
            placeholder="이름 (예: 심장)" maxLength={40}
            className="w-36 h-8 px-2 rounded-lg bg-slate-100 text-[13px] outline-none" aria-label="이름표 내용"
          />
          <button type="submit" className="h-8 px-2.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold">붙이기</button>
        </form>
      )}
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 p-6 text-center">
          {status === 'loading' && <><Loader2 className="animate-spin text-indigo-500" />3D 모델을 여는 중…</>}
          {status === 'missing' && (driveId ? (
            <>
              이 컴퓨터의 3D 자산함에는 아직 없는 모델입니다.<br />구글 드라이브에서 받아 올 수 있습니다.
              <button onClick={fetchFromDrive} disabled={fetching} className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold disabled:opacity-60">
                {fetching ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}구글 드라이브에서 받기
              </button>
            </>
          ) : <>이 컴퓨터의 3D 자산함에 이 모델이 없습니다.<br />GLB 파일을 다시 넣어 주세요.</>)}
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
            <Btn title={labelMode ? '이름표 붙이기 끝내기' : '이름표 붙이기 (모델을 누른 자리에 이름을 적습니다)'} active={labelMode} onClick={() => { setLabelMode(m => !m); setDraft(null); }}>
              <Tag size={16} />
            </Btn>
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
            {labelMode ? '모델을 누르면 이름표를 붙입니다 · 이름표를 누르면 지웁니다' : <>끌기: 돌리기 · 휠/두 손가락: 확대 · 오른쪽 끌기: 이동 {info && `· ${info}`}{labelCount > 0 && ` · 이름표 ${labelCount}개`}</>}
          </div>
        </>
      )}
    </div>
  );
};
