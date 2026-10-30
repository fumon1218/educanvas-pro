import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, Music, Loader2, Repeat, X, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { Score } from '@/src/music/score';
import { buildPlayable, ScorePlayer } from '@/src/music/scorePlayer';

import { AudioEngine, INSTRUMENTS, INSTRUMENT_NAMES, type InstrumentName } from '@/src/music/audio';

// 악기 소리는 앱 전체에서 하나의 엔진을 같이 쓴다 (사보앱과 같은 사운드폰트)
let sharedEngine: AudioEngine | null = null;
const engine = () => (sharedEngine ??= new AudioEngine());
let sharedPlayer: ScorePlayer | null = null;
const player = () => (sharedPlayer ??= new ScorePlayer(engine()));

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

/** 선택한 악보를 악기 소리로 연주한다 */
export const ScorePlayerBar: React.FC<{ scoreData: string; objectId?: string; onPosition?: (sec: number | null) => void }> = ({ scoreData, objectId, onPosition }) => {
  const onPosRef = useRef(onPosition);
  onPosRef.current = onPosition;
  const score = useMemo<Score | null>(() => { try { return JSON.parse(scoreData); } catch { return null; } }, [scoreData]);
  const playable = useMemo(() => (score ? buildPlayable(score) : null), [score]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [inst, setInst] = useState<InstrumentName | ''>('');
  const loadedFor = useRef<string | null>(null);
  const [loop, setLoop] = useState<{ a: number; b?: number } | null>(null);
  const [metro, setMetro] = useState(false);
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [solo, setSolo] = useState<number | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const partNames = (score?.parts ?? []).map((p, i) => ({ i, name: p.name || `${i + 1}성부`, perc: !!p.percussion }));

  useEffect(() => {
    const p = player();
    if (playable && loadedFor.current !== (objectId || scoreData.slice(0, 64))) {
      p.load(playable);
      loadedFor.current = objectId || scoreData.slice(0, 64);
      setPos(0);
      setPlaying(false);
      // 새 악보: 연습 설정 초기화
      p.loop = null; p.solo = null; p.muted = new Set();
      setLoop(null); setSolo(null); setMuted(new Set());
    }
    p.onEnd = () => { setPlaying(false); setPos(0); onPosRef.current?.(null); };
    const t = setInterval(() => { if (p.playing) { setPos(p.position); onPosRef.current?.(p.position); } }, 120);
    return () => clearInterval(t);
  }, [playable, objectId, scoreData]);

  // 선택을 바꾸거나 막대를 닫으면 멈춘다
  useEffect(() => () => { player().stop(); }, [objectId]);

  if (!score || !playable) return <span className="text-sm text-red-500">악보 정보를 읽지 못했습니다</span>;

  const toggle = async () => {
    const p = player();
    if (p.playing) { p.pause(); setPlaying(false); return; }
    engine().unlock();
    p.speed = speed;
    p.instrument = inst || null;
    p.metronome = metro;
    setLoading(true);
    setPlaying(true);
    await p.play(pos);
    setLoading(false);
  };
  const apply = (fn: (p: ScorePlayer) => void) => { const p = player(); fn(p); p.refresh(); };
  const setA = () => { const a = player().position; setLoop({ a }); apply(p => { p.loop = null; }); };
  const setB = () => {
    if (!loop) return;
    const b = player().position;
    if (b <= loop.a + 0.3) return;
    setLoop({ a: loop.a, b });
    apply(p => { p.loop = { a: loop.a, b }; });
  };
  const clearLoop = () => { setLoop(null); apply(p => { p.loop = null; }); };
  const toggleMute = (i: number) => {
    const next = new Set(muted);
    if (next.has(i)) next.delete(i); else next.add(i);
    setMuted(next);
    apply(p => { p.muted = next; });
  };
  const toggleSolo = (i: number) => {
    const v = solo === i ? null : i;
    setSolo(v);
    apply(p => { p.solo = v; });
  };
  const stop = () => { player().stop(); setPlaying(false); setPos(0); onPosRef.current?.(null); };
  const total = playable.total / speed;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Music size={18} className="text-indigo-500 shrink-0" />
      <button onClick={toggle} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700" aria-label={playing ? '일시정지' : '연주'} title={playing ? '일시정지' : '연주 (처음 한 번은 악기 소리를 받아 옵니다)'}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button onClick={stop} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" aria-label="정지" title="정지"><Square size={16} /></button>
      <input
        type="range" min={0} max={playable.total} step={0.1} value={pos}
        onChange={e => { const v = parseFloat(e.target.value); setPos(v); onPosRef.current?.(v); const p = player(); if (p.playing) p.play(v); }}
        className="w-40 accent-indigo-600" aria-label="연주 위치"
      />
      <span className="text-xs tabular-nums text-slate-500 w-20">{fmt(pos / speed)} / {fmt(total)}</span>
      <select value={speed} onChange={e => { const v = parseFloat(e.target.value); setSpeed(v); const p = player(); p.speed = v; if (p.playing) p.play(p.position); }} className="text-xs bg-slate-100 rounded-lg px-2 py-1.5" aria-label="빠르기">
        {SPEEDS.map(s => <option key={s} value={s}>{s === 1 ? '원래 빠르기' : `${s}배`}</option>)}
      </select>
      <select value={inst} onChange={e => { const v = e.target.value as InstrumentName | ''; setInst(v); const p = player(); p.instrument = v || null; if (p.playing) p.play(p.position); }} className="text-xs bg-slate-100 rounded-lg px-2 py-1.5 max-w-[130px]" aria-label="악기">
        <option value="">악보의 악기</option>
        {INSTRUMENT_NAMES.filter(n => !INSTRUMENTS[n].percussion).map(n => <option key={n} value={n}>{INSTRUMENTS[n].label}</option>)}
      </select>
      {/* 구간 반복 A–B */}
      <div className="flex items-center gap-1" role="group" aria-label="구간 반복">
        {!loop || loop.b == null ? (
          <>
            <button onClick={setA} className={cn('h-8 px-2 rounded-lg text-xs font-bold', loop ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')} title="지금 위치를 반복 시작(A)으로">A{loop ? ` ${fmt(loop.a / speed)}` : ''}</button>
            <button onClick={setB} disabled={!loop} className="h-8 px-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-40" title="지금 위치를 반복 끝(B)으로">B</button>
          </>
        ) : (
          <span className="flex items-center gap-1 h-8 pl-2 pr-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-semibold whitespace-nowrap">
            <Repeat size={13} />{fmt(loop.a / speed)}~{fmt(loop.b / speed)}
            <button onClick={clearLoop} className="p-0.5 rounded hover:bg-amber-200" aria-label="구간 반복 끄기"><X size={12} /></button>
          </span>
        )}
      </div>
      <button
        onClick={() => { const v = !metro; setMetro(v); apply(p => { p.metronome = v; }); }}
        aria-pressed={metro}
        className={cn('h-8 px-2 rounded-lg text-xs font-semibold whitespace-nowrap', metro ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')}
        title="메트로놈 (박자 소리)"
      >
        ♩ 메트로놈
      </button>
      {partNames.length > 1 && (
        <div className="relative">
          <button onClick={() => setPartsOpen(o => !o)} className={cn('h-8 px-2 rounded-lg text-xs font-semibold flex items-center gap-1', solo !== null || muted.size ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')} aria-expanded={partsOpen} title="성부(파트)별로 소리 켜고 끄기">
            <SlidersHorizontal size={13} />파트
          </button>
          {partsOpen && (
            <div className="absolute bottom-full mb-2 right-0 w-56 p-2 rounded-xl bg-white shadow-xl ring-1 ring-slate-200 z-10">
              <div className="px-1 pb-1 text-[11px] font-semibold text-slate-400">파트별 소리 (만: 그 파트만 듣기)</div>
              {partNames.map(pt => (
                <div key={pt.i} className="flex items-center gap-2 px-1 py-1">
                  <label className="flex-1 flex items-center gap-2 text-[12px] text-slate-700 min-w-0">
                    <input type="checkbox" checked={!muted.has(pt.i)} onChange={() => toggleMute(pt.i)} disabled={solo !== null} className="accent-indigo-600" />
                    <span className="truncate">{pt.name}</span>
                  </label>
                  <button onClick={() => toggleSolo(pt.i)} className={cn('h-6 px-2 rounded-md text-[11px] font-bold', solo === pt.i ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500')} aria-pressed={solo === pt.i}>만</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
