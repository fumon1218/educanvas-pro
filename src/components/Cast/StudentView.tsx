import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Loader2, MonitorSmartphone, WifiOff, Hand, Check, Download, Image as ImageIcon, FileDown } from 'lucide-react';
import { loadCanvasData } from '@/src/lib/canvasData';
import { drawBackground, isBackgroundId, type CanvasBackground } from '@/src/lib/backgrounds';
import { watchCast, type CastView, type Poll, type StudentMessage } from '@/src/lib/studentCast';
import { cn } from '@/src/lib/utils';

const NAME_KEY = 'okssam_student_name';
const SID_KEY = 'okssam_student_id';
const load = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };

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
  const [name, setName] = useState(load(NAME_KEY));
  const [nameDraft, setNameDraft] = useState(load(NAME_KEY));
  const nameRef = useRef(name);
  nameRef.current = name;
  const sid = useRef(load(SID_KEY) || (() => { const v = Math.random().toString(36).slice(2, 12); save(SID_KEY, v); return v; })()).current;
  const sendRef = useRef<(m: StudentMessage) => void>(() => {});
  const [hand, setHand] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const send = (m: StudentMessage) => sendRef.current(m);
  // 판서 받아 가기: 선생님이 보여 준 슬라이드를 모아 둔다 (선생님이 허락한 경우)
  const slidesRef = useRef(new Map<string, { index: number; name: string; data: string | null; bg: CanvasBackground; origin: { x: number; y: number } }>());
  const [allowSave, setAllowSave] = useState(false);
  const [lesson, setLesson] = useState('');
  const [saveMenu, setSaveMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const who = () => nameRef.current || '학생';

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
    const conn = watchCast(code, {
      onStatus: setStatus,
      hello: () => ({ type: 'hello', sid, name: who() }),
      onMessage: async m => {
        if (m.type === 'poll') {
          setPoll(prev => { if (prev?.id !== m.poll?.id) setAnswer(null); return m.poll; });
          return;
        }
        if (m.type === 'scene') {
          stateRef.current = { bg: isBackgroundId(m.bg) ? m.bg : 'blank', origin: m.origin, view: m.view };
          setAllowSave(m.allowSave !== false);
          if (m.lesson) setLesson(m.lesson);
          slidesRef.current.set(m.sceneId, { index: m.index, name: m.name, data: m.data, bg: stateRef.current.bg, origin: m.origin });
          setSeenCount(slidesRef.current.size);
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
    sendRef.current = conn.send;
    return () => { conn.stop(); window.removeEventListener('resize', onResize); fc.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 레이저 점은 잠시 뒤 사라진다
  useEffect(() => {
    if (!laser) return;
    const t = setTimeout(() => setLaser(null), 1200);
    return () => clearTimeout(t);
  }, [laser]);

  const fileBase = () => (lesson || '수업').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const download = (url: string, name: string) => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  /** 지금 보이는 화면을 그림으로 */
  const saveCurrent = () => {
    const fc = fcRef.current, bg = bgRef.current;
    if (!fc || !bg) return;
    const c = document.createElement('canvas');
    c.width = bg.width; c.height = bg.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(fc.getElement(), 0, 0, c.width, c.height);
    download(c.toDataURL('image/png'), `${fileBase()}_${label.split(' ')[0] || ''}쪽.png`.replace('_쪽', ''));
    setSaveMenu(false);
  };

  /** 지금까지 본 슬라이드를 모두 PDF로 (판서 포함) */
  const savePdf = async () => {
    setSaving(true);
    try {
      const { jsPDF } = await import('jspdf');
      const list = [...slidesRef.current.values()].sort((a, b) => a.index - b.index);
      let pdf: InstanceType<typeof jsPDF> | null = null;
      for (const sl of list) {
        const W = 1600, H = 1000;
        const el = document.createElement('canvas');
        const sc = new fabric.StaticCanvas(el, { width: W, height: H, enableRetinaScaling: false, renderOnAddRemove: false });
        await loadCanvasData(sc, sl.data);
        const objs = sc.getObjects();
        let vpt: fabric.TMat2D = [1, 0, 0, 1, 0, 0];
        if (objs.length) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          objs.forEach(o => { const r = o.getBoundingRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.left + r.width); y1 = Math.max(y1, r.top + r.height); });
          const pad = 30, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
          const z = Math.min(W / w, H / h);
          vpt = [z, 0, 0, z, W / 2 - (x0 + x1) / 2 * z, H / 2 - (y0 + y1) / 2 * z];
        }
        sc.setViewportTransform(vpt);
        sc.renderAll();
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const ctx = out.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        drawBackground(ctx, sl.bg, W, H, vpt as number[], 1, sl.origin);
        ctx.drawImage(sc.getElement(), 0, 0);
        sc.dispose();
        if (!pdf) pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
        else pdf.addPage([W, H], 'landscape');
        pdf.addImage(out.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
      }
      if (pdf) pdf.save(`${fileBase()}_판서.pdf`);
    } catch (e) { console.error(e); alert('PDF를 만들지 못했습니다.'); }
    finally { setSaving(false); setSaveMenu(false); }
  };

  const vpt = fcRef.current?.viewportTransform;
  const laserPos = laser && vpt ? { left: laser.x * vpt[0] + vpt[4], top: laser.y * vpt[3] + vpt[5] } : null;

  return (
    <div className="fixed inset-0 bg-[#eef1f6] flex flex-col font-sans select-none">
      <div ref={boxRef} className="relative flex-1 m-2 sm:m-3 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-900/[0.06] shadow-sm">
        <canvas ref={bgRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
        {/* 판서 층은 배경 무늬 위에 */}
        <div className="absolute inset-0"><canvas ref={elRef} /></div>
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
      {/* 선생님 질문에 답하기 */}
      {poll && status === 'live' && (
        <div className="mx-2 sm:mx-3 mb-1 p-2 rounded-2xl bg-white ring-1 ring-indigo-200 shadow-sm flex items-center gap-2" role="group" aria-label="선생님 질문에 답하기">
          <span className="px-2 text-[13px] font-semibold text-indigo-700 whitespace-nowrap">{answer ? '답을 보냈어요' : '선생님 질문'}</span>
          <div className="flex-1 flex gap-2">
            {(poll.kind === 'ox' ? ['O', 'X'] : Array.from({ length: poll.n || 4 }, (_, i) => String(i + 1))).map(v => (
              <button
                key={v}
                onClick={() => { setAnswer(v); send({ type: 'answer', sid, name: who(), pollId: poll.id, value: v }); }}
                className={cn('flex-1 h-14 rounded-xl text-2xl font-black transition-all', answer === v ? 'bg-indigo-600 text-white scale-[1.03]' : v === 'O' ? 'bg-sky-50 text-sky-600' : v === 'X' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700')}
                aria-pressed={answer === v}
                aria-label={`답 ${v}`}
              >
                {v === 'O' ? '⭕' : v === 'X' ? '❌' : v}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="h-12 px-3 flex items-center gap-2 text-[13px] text-slate-500">
        {name ? (
          <button onClick={() => { setNameDraft(name); setName(''); }} className="font-semibold text-slate-700 truncate max-w-[120px]" title="이름 바꾸기">{name}</button>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); const v = nameDraft.trim().slice(0, 20); if (!v) return; setName(v); save(NAME_KEY, v); send({ type: 'hello', sid, name: v }); }}
            className="flex items-center gap-1.5"
          >
            <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="내 이름" maxLength={20} className="w-28 h-8 px-2 rounded-lg bg-white ring-1 ring-slate-200 text-[13px]" aria-label="내 이름" />
            <button type="submit" className="h-8 px-2.5 rounded-lg bg-slate-900 text-white text-[12px] font-semibold">확인</button>
          </form>
        )}
        <button
          onClick={() => { const v = !hand; setHand(v); send({ type: 'hand', sid, name: who(), up: v }); }}
          disabled={status !== 'live'}
          className={cn('flex items-center gap-1.5 h-9 px-3 rounded-xl font-semibold disabled:opacity-40', hand ? 'bg-amber-400 text-amber-950' : 'bg-white ring-1 ring-slate-200 text-slate-700')}
          aria-pressed={hand}
        >
          {hand ? <Check size={16} /> : <Hand size={16} />}{hand ? '손 든 중' : '손들기'}
        </button>
        {allowSave && hasScene && (
          <div className="relative">
            <button onClick={() => setSaveMenu(v => !v)} className="flex items-center gap-1.5 h-9 px-3 rounded-xl font-semibold bg-white ring-1 ring-slate-200 text-slate-700" aria-expanded={saveMenu} aria-haspopup="menu">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}판서 받아 가기
            </button>
            {saveMenu && (
              <div role="menu" className="absolute bottom-11 left-0 w-60 p-1 rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10 text-[13px]">
                <button role="menuitem" onClick={saveCurrent} className="w-full h-10 px-3 rounded-lg flex items-center gap-2 hover:bg-slate-100 text-left"><ImageIcon size={15} />지금 화면 (그림)</button>
                <button role="menuitem" onClick={() => { void savePdf(); }} disabled={saving} className="w-full h-10 px-3 rounded-lg flex items-center gap-2 hover:bg-slate-100 text-left"><FileDown size={15} />지금까지 본 슬라이드 {seenCount}장 (PDF)</button>
              </div>
            )}
          </div>
        )}
        <span className="ml-auto tabular-nums truncate">{label}</span>
      </div>
    </div>
  );
};
