import React, { useRef, useState } from 'react';
import { GripVertical, Plus, X, Pencil, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/**
 * 교회 계획 항목: 자주 쓰는 일정을 끌어다 달력 칸에 놓는다.
 *  - 손가락·펜·마우스 모두 끌기 가능 (포인터 이벤트)
 *  - 눌러만 떼면 지금 화면 가운데에 놓는다
 *  - 항목은 이 기기에 저장하고 [고치기]로 더하거나 지운다
 */
export interface PlanItem { text: string; kind: 'chip' | 'banner'; color: string }

const COLORS: { c: string; n: string }[] = [
  { c: '#1e3a8a', n: '파랑' },
  { c: '#be123c', n: '빨강' },
  { c: '#0f172a', n: '검정' },
  { c: '#047857', n: '초록' },
];
const BANNER = '#a7f3d0';

const DEFAULT_ITEMS: PlanItem[] = [
  { text: '수요말씀', kind: 'chip', color: '#0f172a' },
  { text: '교사모임', kind: 'chip', color: '#0f172a' },
  { text: '청년회', kind: 'chip', color: '#0f172a' },
  { text: '중고등부', kind: 'chip', color: '#0f172a' },
  { text: '찬양대', kind: 'chip', color: '#0f172a' },
  { text: '구역모임', kind: 'chip', color: '#1e3a8a' },
  { text: '조모임', kind: 'chip', color: '#1e3a8a' },
  { text: '임원월례회', kind: 'chip', color: '#1e3a8a' },
  { text: '어머니회', kind: 'chip', color: '#1e3a8a' },
  { text: '봉사회', kind: 'chip', color: '#1e3a8a' },
  { text: '이삭부', kind: 'chip', color: '#1e3a8a' },
  { text: '성찬식', kind: 'chip', color: '#be123c' },
  { text: '대청소', kind: 'chip', color: '#be123c' },
  { text: '김장', kind: 'chip', color: '#be123c' },
  { text: '수련회', kind: 'chip', color: '#be123c' },
  { text: '식사조', kind: 'chip', color: '#0f172a' },
  { text: '설교: ', kind: 'chip', color: '#be123c' },
  { text: '대집회', kind: 'banner', color: BANNER },
  { text: '소집회 19:30~', kind: 'banner', color: BANNER },
];
const KEY = 'okssam_plan_items';
const load = (): PlanItem[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(v) && v.length ? v : DEFAULT_ITEMS; } catch { return DEFAULT_ITEMS; } };
const save = (v: PlanItem[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 무시 */ } };

export const PlanPalette: React.FC<{
  onDrop: (clientX: number, clientY: number, item: PlanItem) => boolean;
  onDropCenter: (item: PlanItem) => void;
  onClose: () => void;
  className?: string;
}> = ({ onDrop, onDropCenter, onClose, className }) => {
  const [items, setItems] = useState<PlanItem[]>(load);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState(COLORS[0].c);
  const [draftBanner, setDraftBanner] = useState(false);
  /** 고치는 중인 항목 번호 (없으면 새 항목 더하기) */
  const [sel, setSel] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; item: PlanItem } | null>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; moved: boolean; item: PlanItem } | null>(null);

  const update = (v: PlanItem[]) => { setItems(v); save(v); };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    const it: PlanItem = { text: t, kind: draftBanner ? 'banner' : 'chip', color: draftBanner ? BANNER : draftColor };
    if (sel != null) update(items.map((x, j) => (j === sel ? it : x)));
    else update([...items, it]);
    setDraft(''); setSel(null);
  };
  const pick = (i: number) => {
    if (sel === i) { setSel(null); setDraft(''); return; }
    const it = items[i];
    setSel(i); setDraft(it.text); setDraftBanner(it.kind === 'banner'); if (it.kind !== 'banner') setDraftColor(it.color);
  };
  const moveItem = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const v = items.slice(); [v[i], v[j]] = [v[j], v[i]];
    update(v);
    if (sel === i) setSel(j); else if (sel === j) setSel(i);
  };
  const remove = (i: number) => { update(items.filter((_, j) => j !== i)); if (sel === i) { setSel(null); setDraft(''); } else if (sel != null && sel > i) setSel(sel - 1); };

  const down = (e: React.PointerEvent, item: PlanItem) => {
    if (editing) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, item };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (d.moved) setGhost({ x: e.clientX, y: e.clientY, item: d.item });
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) { onDropCenter(d.item); return; }
    onDrop(e.clientX, e.clientY, d.item);
  };

  return (
    <>
      <div className={cn('absolute z-40 w-[214px] max-h-[calc(100%-260px)] flex flex-col rounded-2xl bg-white/95 backdrop-blur-xl ring-1 ring-slate-900/[0.07] shadow-[0_10px_30px_-10px_rgba(15,23,42,0.3)]', className)}
        role="toolbar" aria-label="교회 계획 항목">
        <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5">
          <span className="flex-1 text-[13px] font-bold text-slate-700">계획 항목</span>
          <button onClick={() => { setEditing(v => !v); setSel(null); setDraft(''); }} className={cn('w-7 h-7 flex items-center justify-center rounded-lg', editing ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-100')} title={editing ? '고치기 끝' : '항목 고치기'} aria-label={editing ? '고치기 끝' : '항목 고치기'}>
            {editing ? <Check size={15} /> : <Pencil size={14} />}
          </button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" title="닫기 (노트 → 교회 계획 항목으로 다시 열기)" aria-label="계획 항목 닫기"><X size={15} /></button>
        </div>
        <p className="px-3 pb-1.5 text-[11px] text-slate-400 leading-snug">{editing ? '항목을 누르면 아래에서 이름·색을 바꿉니다. ‹ › 로 순서를 옮기고 × 로 지웁니다.' : '달력 칸으로 끌어다 놓으세요. 놓은 뒤 두 번 누르면 글을 고칩니다.'}</p>
        <div className="flex-1 overflow-y-auto px-2.5 pb-2 flex flex-wrap gap-1.5 content-start">
          {items.map((it, i) => (
            <span key={i + it.text}
              onPointerDown={e => down(e, it)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setGhost(null); }}
              className={cn('touch-none select-none inline-flex items-center gap-0.5 h-8 rounded-lg text-[13px] font-bold ring-1',
                sel === i ? 'ring-2 ring-indigo-500' : 'ring-slate-200',
                it.kind === 'banner' ? 'px-3 w-full justify-center' : editing ? 'px-0.5' : 'pl-1 pr-2', editing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:ring-indigo-300')}
              style={{ color: it.kind === 'banner' ? '#0f172a' : it.color, background: it.kind === 'banner' ? it.color : '#fff' }}
              title={editing ? undefined : '끌어다 놓기'}>
              {it.kind !== 'banner' && !editing && <GripVertical size={12} className="text-slate-300" />}
              {editing && <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="w-5 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-25" aria-label={`${it.text} 앞으로`}><ChevronLeft size={13} /></button>}
              {editing ? <button onClick={() => pick(i)} className="px-0.5" aria-label={`${it.text} 고치기`} aria-pressed={sel === i}>{it.text}</button> : it.text}
              {editing && <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} className="w-5 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-25" aria-label={`${it.text} 뒤로`}><ChevronRight size={13} /></button>}
              {editing && <button onClick={() => remove(i)} className="w-5 h-6 flex items-center justify-center text-slate-400 hover:text-red-600" aria-label={`${it.text} 지우기`}><X size={13} /></button>}
            </span>
          ))}
        </div>
        {editing && (
          <form onSubmit={e => { e.preventDefault(); add(); }} className="border-t border-slate-100 p-2.5 space-y-1.5">
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder={sel != null ? '바꿀 이름' : '새 항목 (예: 성탄 발표회)'} aria-label={sel != null ? '항목 이름' : '새 항목'}
              className="w-full h-8 px-2.5 rounded-lg bg-slate-100 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200" />
            <div className="flex items-center gap-1.5">
              {COLORS.map(c => <button type="button" key={c.c} onClick={() => { setDraftColor(c.c); setDraftBanner(false); }} className={cn('w-5 h-5 rounded-full', !draftBanner && draftColor === c.c && 'ring-2 ring-offset-1 ring-indigo-500')} style={{ background: c.c }} aria-label={`글자 색 ${c.n}`} />)}
              <button type="button" onClick={() => setDraftBanner(b => !b)} className={cn('h-6 px-2 rounded-md text-[11px] font-semibold', draftBanner ? 'bg-emerald-200 text-emerald-900 ring-2 ring-emerald-500' : 'bg-emerald-100 text-emerald-800')}>긴 띠</button>
              {sel != null
                ? <button type="submit" disabled={!draft.trim()} className="ml-auto h-7 px-2.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold disabled:opacity-40">바꾸기</button>
                : <button type="submit" disabled={!draft.trim()} className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-40" aria-label="항목 더하기"><Plus size={15} /></button>}
            </div>
            <div className="flex items-center justify-between">
              {sel != null ? <button type="button" onClick={() => { setSel(null); setDraft(''); }} className="text-[11px] text-indigo-600 font-semibold">새 항목 더하기로</button> : <span />}
              <button type="button" onClick={() => { update(DEFAULT_ITEMS); setSel(null); setDraft(''); }} className="text-[11px] text-slate-400 hover:text-slate-600">처음 항목으로 되돌리기</button>
            </div>
          </form>
        )}
      </div>
      {ghost && (
        <div className="fixed z-[200] pointer-events-none -translate-x-2 -translate-y-1/2 px-2.5 h-8 flex items-center rounded-lg text-[14px] font-bold shadow-lg ring-1 ring-black/10"
          style={{ left: ghost.x, top: ghost.y, color: ghost.item.kind === 'banner' ? '#0f172a' : ghost.item.color, background: ghost.item.kind === 'banner' ? ghost.item.color : '#fff' }}>
          {ghost.item.text}
        </div>
      )}
    </>
  );
};
