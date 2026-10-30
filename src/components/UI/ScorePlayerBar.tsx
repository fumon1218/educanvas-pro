import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, Music, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    const p = player();
    if (playable && loadedFor.current !== (objectId || scoreData.slice(0, 64))) {
      p.load(playable);
      loadedFor.current = objectId || scoreData.slice(0, 64);
      setPos(0);
      setPlaying(false);
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
    setLoading(true);
    setPlaying(true);
    await p.play(pos);
    setLoading(false);
  };
  const stop = () => { player().stop(); setPlaying(false); setPos(0); onPosRef.current?.(null); };
  const total = playable.total / speed;

  return (
    <div className="flex items-center gap-3">
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
    </div>
  );
};
