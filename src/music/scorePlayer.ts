// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/scorePlayer.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// A small player that plays a Score straight through the AudioEngine (no editor state needed):
// play / pause / seek / speed, per-part mute, one instrument for everything, and lyric cues.

import { TPQ, durationTicks, expandRepeats, pitchToMidi, type Score } from './score';
import { instrumentForProgram, type AudioEngine, type InstrumentName } from './audio';

export interface PlayNote { part: number; t: number; d: number; midi: number }
export interface LyricCue { t: number; text: string }
export interface Playable {
  notes: PlayNote[];
  cues: LyricCue[];
  /** length in seconds at the written tempo */
  total: number;
  partCount: number;
  programs: Array<number | undefined>;
  /** written tempo (quarter notes per minute) and time signature, for the metronome */
  tempo?: number;
  beats?: number;
  beatType?: number;
  /** length in seconds of a short first (pick-up) measure, 0 when there is none */
  pickupSec?: number;
}

/** Notes and lyric cues of a score in seconds (repeats played out, ties merged, chords split). */
export function buildPlayable(score: Score): Playable {
  const spt = 60 / (score.tempo || 100) / TPQ;
  const notes: PlayNote[] = [];
  const cues: LyricCue[] = [];
  let total = 0;
  let lyricPart = -1;
  score.parts.forEach((part, pi) => {
    if (part.percussion) return;
    if (lyricPart < 0) lyricPart = pi;
    let tick = 0;
    let open = new Map<number, PlayNote>();
    for (const m of expandRepeats(part)) {
      for (const it of m.items) {
        const dur = durationTicks(it.duration);
        if (it.kind === 'note' && it.pitch) {
          const next = new Map<number, PlayNote>();
          for (const p of [it.pitch, ...(it.also ?? [])]) {
            const midi = pitchToMidi(p);
            let n = open.get(midi);
            if (n) n.d += dur * spt;
            else { n = { part: pi, t: tick * spt, d: dur * spt, midi }; notes.push(n); }
            if (it.tieNext) next.set(midi, n);
          }
          open = next;
          if (it.lyric && pi === lyricPart) cues.push({ t: tick * spt, text: it.lyric });
        } else {
          open = new Map();
        }
        tick += dur;
      }
    }
    total = Math.max(total, tick * spt);
  });
  const first = score.parts.find(p => !p.percussion)?.measures[0];
  const pickupSec = score.pickup && first ? first.items.reduce((a, it) => a + durationTicks(it.duration), 0) * spt : 0;
  return { notes, cues, total, partCount: score.parts.length, programs: score.parts.map(p => p.program), tempo: score.tempo || 100, beats: score.beats, beatType: score.beatType, pickupSec };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class ScorePlayer {
  private pl: Playable | null = null;
  private pos = 0;
  private startCtx = 0;
  private startPos = 0;
  private session = 0;
  private endTimer: number | undefined;
  playing = false;
  /** the browser kept the audio muted when playback started */
  blocked = false;
  speed = 1;
  muted = new Set<number>();
  /** when set, only this part sounds (「내 파트만」) */
  /** A-B repeat (score seconds) */
  loop: { a: number; b: number } | null = null;
  solo: number | null = null;
  /** per-part volume, 1 = normal (missing = 1) */
  vols: number[] = [];
  /** play every part with this instrument (otherwise: the part's own program, else piano) */
  instrument: InstrumentName | null = null;
  /** 옥쌤보드: 박자에 맞춰 똑딱 소리 (첫 박은 높게) */
  metronome = false;
  private clicks: OscillatorNode[] = [];
  onEnd: (() => void) | null = null;

  constructor(private engine: AudioEngine) {}

  load(pl: Playable) {
    this.stop();
    this.pl = pl;
    this.pos = 0;
  }

  get total() { return this.pl?.total ?? 0; }
  get playable() { return this.pl; }

  /** current position in score seconds */
  get position(): number {
    if (!this.pl) return 0;
    if (!this.playing) return this.pos;
    const ctx = this.engine.unlock();
    const raw = this.startPos + Math.max(0, ctx.currentTime - this.startCtx) * this.speed;
    return Math.min(this.loop ? this.loop.b : this.pl.total, raw);
  }

  private instrumentOf(part: number, pl: Playable): InstrumentName {
    if (this.instrument) return this.instrument;
    const p = pl.programs[part];
    return p === undefined ? 'piano' : instrumentForProgram(p);
  }

  async play(from: number = this.pos): Promise<void> {
    const pl = this.pl;
    if (!pl) return;
    const my = ++this.session;
    this.engine.stopAll();
    this.stopClicks();
    window.clearTimeout(this.endTimer);
    if (this.loop && (from >= this.loop.b - 0.05 || from < this.loop.a - 0.05)) from = this.loop.a;
    if (from >= pl.total - 0.05) from = 0;
    const end = this.loop ? Math.min(this.loop.b, pl.total) : pl.total;
    this.pos = from;
    this.playing = true;
    const todo = pl.notes.filter(n => n.t + n.d > from && n.t < end && (this.solo !== null ? n.part === this.solo : !this.muted.has(n.part)));
    const need = new Map<InstrumentName, number[]>();
    for (const n of todo) {
      const inst = this.instrumentOf(n.part, pl);
      const list = need.get(inst) ?? [];
      list.push(hz(n.midi));
      need.set(inst, list);
    }
    await Promise.all([...need].map(([inst, f]) => this.engine.prepare(inst, f).catch(() => {})));
    if (my !== this.session) return;
    this.blocked = !(await this.engine.ensureRunning());
    if (my !== this.session) return;
    const ctx = this.engine.unlock();
    const start = ctx.currentTime + 0.08;
    for (const n of todo) {
      const lead = n.t - from;
      this.engine.playNote({
        instrument: this.instrumentOf(n.part, pl),
        frequency: hz(n.midi),
        when: start + Math.max(0, lead) / this.speed,
        duration: (Math.min(lead < 0 ? n.d + lead : n.d, end - Math.max(n.t, from))) / this.speed,
        velocity: Math.min(1, 0.8 * (this.vols[n.part] ?? 1)),
      });
    }
    if (this.metronome) this.scheduleClicks(ctx, start, from, end, pl);
    this.startCtx = start;
    this.startPos = from;
    const looping = !!this.loop;
    this.endTimer = window.setTimeout(() => {
      if (my !== this.session) return;
      if (looping && this.loop) { void this.play(this.loop.a); return; }   // back to A
      this.playing = false;
      this.pos = 0;
      this.onEnd?.();
    }, ((end - from) / this.speed + (looping ? 0.1 : 0.6)) * 1000);
  }

  pause() {
    if (!this.playing) return;
    this.pos = this.position;
    this.halt();
  }

  stop() {
    this.pos = 0;
    this.halt();
  }

  private scheduleClicks(ctx: AudioContext, start: number, from: number, end: number, pl: Playable) {
    const beatSec = (60 / (pl.tempo || 100)) * (4 / (pl.beatType || 4));
    const beats = pl.beats || 4;
    const offset = pl.pickupSec || 0;
    let k = Math.ceil((from - offset) / beatSec - 1e-6);
    for (let t = offset + k * beatSec; t < end - 1e-3 && this.clicks.length < 4000; k++, t = offset + k * beatSec) {
      const when = start + (t - from) / this.speed;
      const accent = ((k % beats) + beats) % beats === 0;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = accent ? 1760 : 1175;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.13, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      osc.connect(g).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.06);
      osc.onended = () => { this.clicks = this.clicks.filter(c => c !== osc); };
      this.clicks.push(osc);
    }
  }

  private stopClicks() {
    this.clicks.forEach(c => { try { c.stop(); } catch { /* 이미 끝남 */ } });
    this.clicks = [];
  }

  private halt() {
    this.stopClicks();
    this.session++;
    window.clearTimeout(this.endTimer);
    this.engine.stopAll();
    this.playing = false;
  }

  seek(sec: number) {
    const s = Math.max(0, Math.min(this.total, sec));
    if (this.playing) void this.play(s);
    else this.pos = s;
  }

  /** after changing speed / mute / instrument while playing */
  refresh() {
    if (this.playing) void this.play(this.position);
  }
}

/** Plays an audio file from the device with the same small interface as ScorePlayer. */
export class FilePlayer {
  private a: HTMLAudioElement;
  private url: string | null = null;
  playing = false;
  blocked = false;
  speed = 1;
  muted = new Set<number>();
  instrument: InstrumentName | null = null;
  onEnd: (() => void) | null = null;

  constructor() {
    this.a = new Audio();
    this.a.preload = 'auto';
    this.a.addEventListener('ended', () => { this.playing = false; this.onEnd?.(); });
  }

  /** resolves to the length in seconds */
  async load(blob: Blob): Promise<number> {
    this.stop();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    const a = this.a;
    a.src = this.url;
    await new Promise<void>((res, rej) => {
      const ok = () => { a.removeEventListener('error', bad); res(); };
      const bad = () => { a.removeEventListener('loadedmetadata', ok); rej(new Error('이 음원은 이 기기에서 재생할 수 없는 형식이에요.')); };
      a.addEventListener('loadedmetadata', ok, { once: true });
      a.addEventListener('error', bad, { once: true });
    });
    return this.total;
  }

  get total() { return Number.isFinite(this.a.duration) ? this.a.duration : 0; }
  get position() { return this.a.currentTime; }

  async play(from?: number): Promise<void> {
    const a = this.a;
    if (from !== undefined) a.currentTime = from >= this.total - 0.05 ? 0 : from;
    else if (a.ended) a.currentTime = 0;
    a.playbackRate = this.speed;
    try { await a.play(); this.playing = true; this.blocked = false; }
    catch { this.playing = false; this.blocked = true; }
  }

  pause() { this.a.pause(); this.playing = false; }
  stop() { this.a.pause(); try { this.a.currentTime = 0; } catch { /* nothing loaded */ } this.playing = false; }
  seek(s: number) { this.a.currentTime = Math.max(0, Math.min(this.total, s)); }
  refresh() { this.a.playbackRate = this.speed; }
  dispose() { this.stop(); this.a.removeAttribute('src'); if (this.url) URL.revokeObjectURL(this.url); this.url = null; }
}
