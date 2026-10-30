// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/audio.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// Audio engine: sampled instruments (loaded at runtime from a SoundFont CDN)
// with an oscillator-based fallback, one shared signal chain and clean stop.
//
// Everything that does not need a real AudioContext (note-name parsing,
// sample selection, soundfont parsing) is exported separately so it can be
// unit-tested.

import { drumForFrequency } from './drums';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

// MIDI.js-format soundfonts rendered from FluidR3_GM. Check the license of the
// soundfont before distributing the app publicly.
export const SOUNDFONT_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';

export type InstrumentGroup = 'keyboard' | 'string' | 'wind' | 'sax' | 'brass' | 'guitar' | 'tuned' | 'percussion' | 'voice';

type SynthKind = 'piano' | 'reed' | 'flute' | 'brass' | 'bowed';

export interface InstrumentInfo {
  label: string;
  /** General MIDI program number (0-127), used for MIDI files. */
  program: number;
  group: InstrumentGroup;
  /** File name inside SOUNDFONT_BASE (without "-mp3.js"). */
  file: string;
  /** How the fallback oscillator synth should sound. */
  synth: SynthKind;
  /** Semitones by which the sound differs from the written note (Bb clarinet: -2). */
  transpose?: number;
  /** Clef the part is normally written in. */
  clef?: 'treble' | 'bass';
  /** Which drawing the instrument picker shows. */
  icon: InstrumentIcon;
  attack: number;
  /** Time constant of the exponential release after the note ends. */
  releaseTau: number;
  /** Seconds after the note ends before the sample is stopped. */
  tail: number;
  /** Unpitched drum kit: played with the built-in drum synthesizer, written on a percussion staff. */
  percussion?: boolean;
  /** Section / duo: how many slightly different players sound together (default 1). */
  voices?: number;
  /** Pitch spread of those players, in cents (+/- from the written pitch). */
  detune?: number;
}

export type InstrumentIcon =
  | 'keys' | 'harp' | 'violin' | 'flute' | 'reed' | 'sax' | 'trumpet' | 'horn' | 'trombone' | 'tuba'
  | 'guitar' | 'bass' | 'banjo' | 'mallet' | 'drums' | 'voice';

// Envelope per kind of sound: [attack, releaseTau, tail]
const ENV: Record<SynthKind | 'plucked', [number, number, number]> = {
  piano: [0.004, 0.18, 1.2], plucked: [0.004, 0.12, 0.8], flute: [0.04, 0.07, 0.5], reed: [0.04, 0.07, 0.5],
  brass: [0.04, 0.07, 0.5], bowed: [0.06, 0.09, 0.55],
};

interface Opts { transpose?: number; clef?: 'treble' | 'bass'; env?: SynthKind | 'plucked'; attack?: number; releaseTau?: number; tail?: number; percussion?: boolean; voices?: number; detune?: number }
const inst = (label: string, program: number, group: InstrumentGroup, file: string, synth: SynthKind, icon: InstrumentIcon, o: Opts = {}): InstrumentInfo => {
  const [a, r, t] = ENV[o.env ?? synth];
  return { label, program, group, file, synth, icon, transpose: o.transpose, clef: o.clef, attack: o.attack ?? a, releaseTau: o.releaseTau ?? r, tail: o.tail ?? t, percussion: o.percussion, voices: o.voices, detune: o.detune };
};

// `transpose`: how far the sounding pitch is from the written pitch.
// The first seven keys are older ones that saved scores may use - keep them.
const DEFS = {
  piano:        inst('피아노', 0, 'keyboard', 'acoustic_grand_piano', 'piano', 'keys'),
  electric_piano: inst('일렉트릭 피아노', 4, 'keyboard', 'electric_piano_1', 'piano', 'keys'),
  harpsichord:  inst('하프시코드', 6, 'keyboard', 'harpsichord', 'piano', 'keys', { env: 'plucked' }),
  celesta:      inst('첼레스타', 8, 'keyboard', 'celesta', 'piano', 'keys'),
  organ:        inst('파이프 오르간', 19, 'keyboard', 'church_organ', 'reed', 'keys', { attack: 0.03, releaseTau: 0.1, tail: 0.5 }),
  accordion:    inst('아코디언', 21, 'keyboard', 'accordion', 'reed', 'keys'),
  harp:         inst('하프', 46, 'keyboard', 'orchestral_harp', 'piano', 'harp', { env: 'plucked', tail: 1.2 }),

  violin:       inst('바이올린', 40, 'string', 'violin', 'bowed', 'violin'),
  viola:        inst('비올라', 41, 'string', 'viola', 'bowed', 'violin', { attack: 0.07, releaseTau: 0.09 }),
  cello:        inst('첼로', 42, 'string', 'cello', 'bowed', 'violin', { clef: 'bass', attack: 0.08, releaseTau: 0.1, tail: 0.6 }),
  contrabass:   inst('콘트라베이스', 43, 'string', 'contrabass', 'bowed', 'violin', { clef: 'bass', attack: 0.09, releaseTau: 0.12, tail: 0.6 }),
  string_ensemble: inst('현악 앙상블', 48, 'string', 'string_ensemble_1', 'bowed', 'violin', { attack: 0.12, releaseTau: 0.15, tail: 0.8 }),
  pizzicato:    inst('피치카토 현악', 45, 'string', 'pizzicato_strings', 'piano', 'violin', { env: 'plucked' }),

  piccolo:      inst('피콜로', 72, 'wind', 'piccolo', 'flute', 'flute'),
  flute:        inst('플루트', 73, 'wind', 'flute', 'flute', 'flute'),
  recorder:     inst('리코더', 74, 'wind', 'recorder', 'flute', 'flute', { attack: 0.03, releaseTau: 0.05, tail: 0.4 }),
  pan_flute:    inst('팬플루트', 75, 'wind', 'pan_flute', 'flute', 'flute'),
  oboe:         inst('오보에', 68, 'wind', 'oboe', 'reed', 'reed'),
  english_horn: inst('잉글리시 호른', 69, 'wind', 'english_horn', 'reed', 'reed', { transpose: -7 }),
  clarinet:     inst('클라리넷', 71, 'wind', 'clarinet', 'reed', 'reed', { transpose: -2, attack: 0.03, releaseTau: 0.06, tail: 0.4 }),
  bass_clarinet: inst('베이스 클라리넷', 71, 'wind', 'clarinet', 'reed', 'reed', { transpose: -14, attack: 0.04 }),
  bassoon:      inst('바순', 70, 'wind', 'bassoon', 'reed', 'reed', { clef: 'bass', attack: 0.05, releaseTau: 0.08 }),

  soprano_sax:  inst('소프라노 색소폰', 64, 'sax', 'soprano_sax', 'reed', 'sax', { transpose: -2 }),
  alto_sax:     inst('알토 색소폰', 65, 'sax', 'alto_sax', 'reed', 'sax', { transpose: -9 }),
  tenor_sax:    inst('테너 색소폰', 66, 'sax', 'tenor_sax', 'reed', 'sax', { transpose: -14 }),
  baritone_sax: inst('바리톤 색소폰', 67, 'sax', 'baritone_sax', 'reed', 'sax', { transpose: -21 }),

  french_horn:  inst('호른', 60, 'brass', 'french_horn', 'brass', 'horn', { transpose: -7, attack: 0.06, releaseTau: 0.1, tail: 0.6 }),
  trumpet:      inst('트럼펫', 56, 'brass', 'trumpet', 'brass', 'trumpet', { transpose: -2 }),
  muted_trumpet: inst('뮤트 트럼펫', 59, 'brass', 'muted_trumpet', 'brass', 'trumpet', { transpose: -2 }),
  trombone:     inst('트럼본', 57, 'brass', 'trombone', 'brass', 'trombone', { clef: 'bass' }),
  tuba:         inst('튜바', 58, 'brass', 'tuba', 'brass', 'tuba', { clef: 'bass', attack: 0.06 }),
  brass_section: inst('금관 섹션', 61, 'brass', 'brass_section', 'brass', 'trumpet', { attack: 0.06 }),

  acoustic_guitar: inst('어쿠스틱 기타', 25, 'guitar', 'acoustic_guitar_steel', 'piano', 'guitar', { env: 'plucked' }),
  classical_guitar: inst('클래식 기타', 24, 'guitar', 'acoustic_guitar_nylon', 'piano', 'guitar', { env: 'plucked' }),
  electric_guitar: inst('일렉트릭 기타', 27, 'guitar', 'electric_guitar_clean', 'piano', 'guitar', { env: 'plucked' }),
  jazz_guitar:  inst('재즈 기타', 26, 'guitar', 'electric_guitar_jazz', 'piano', 'guitar', { env: 'plucked' }),
  muted_guitar: inst('뮤트 기타', 28, 'guitar', 'electric_guitar_muted', 'piano', 'guitar', { env: 'plucked' }),
  overdrive_guitar: inst('오버드라이브 기타', 29, 'guitar', 'overdriven_guitar', 'piano', 'guitar', { env: 'plucked' }),
  distortion_guitar: inst('디스토션 기타', 30, 'guitar', 'distortion_guitar', 'piano', 'guitar', { env: 'plucked' }),
  acoustic_bass: inst('업라이트 베이스', 32, 'guitar', 'acoustic_bass', 'piano', 'bass', { env: 'plucked', clef: 'bass' }),
  electric_bass: inst('일렉트릭 베이스', 33, 'guitar', 'electric_bass_finger', 'piano', 'bass', { env: 'plucked', clef: 'bass' }),
  pick_bass:    inst('일렉트릭 베이스(피크)', 34, 'guitar', 'electric_bass_pick', 'piano', 'bass', { env: 'plucked', clef: 'bass' }),
  fretless_bass: inst('프렛리스 베이스', 35, 'guitar', 'fretless_bass', 'piano', 'bass', { env: 'plucked', clef: 'bass' }),
  slap_bass:    inst('슬랩 베이스', 36, 'guitar', 'slap_bass_1', 'piano', 'bass', { env: 'plucked', clef: 'bass' }),
  banjo:        inst('밴조', 105, 'guitar', 'banjo', 'piano', 'banjo', { env: 'plucked' }),

  vibraphone:   inst('비브라폰', 11, 'tuned', 'vibraphone', 'piano', 'mallet', { tail: 1.5 }),
  marimba:      inst('마림바', 12, 'tuned', 'marimba', 'piano', 'mallet', { tail: 0.8 }),
  xylophone:    inst('실로폰', 13, 'tuned', 'xylophone', 'piano', 'mallet', { tail: 0.5 }),
  glockenspiel: inst('글로켄슈필', 9, 'tuned', 'glockenspiel', 'piano', 'mallet', { tail: 1.5 }),
  music_box:    inst('오르골', 10, 'tuned', 'music_box', 'piano', 'mallet', { tail: 1.5 }),
  tubular_bells: inst('튜뷸러 벨', 14, 'tuned', 'tubular_bells', 'piano', 'mallet', { tail: 2 }),

  choir:        inst('합창 (아)', 52, 'voice', 'choir_aahs', 'bowed', 'voice', { attack: 0.12, releaseTau: 0.15, tail: 0.8 }),
  timpani:      inst('팀파니', 47, 'percussion', 'timpani', 'piano', 'drums', { clef: 'bass', tail: 1.5 }),
  voice_oohs:   inst('합창 (우)', 53, 'voice', 'voice_oohs', 'bowed', 'voice', { attack: 0.12, releaseTau: 0.15, tail: 0.8 }),
  // keep last: it shares program 0 with the piano, which should win when a file says "program 0"
  // Sections and duos: the same sound played by several slightly different players.
  violin_section:  inst('바이올린 (섹션)', 40, 'string', 'violin', 'bowed', 'violin', { voices: 4, detune: 14, attack: 0.07 }),
  viola_section:   inst('비올라 (섹션)', 41, 'string', 'viola', 'bowed', 'violin', { voices: 4, detune: 14, attack: 0.08, releaseTau: 0.09 }),
  cello_section:   inst('첼로 (섹션)', 42, 'string', 'cello', 'bowed', 'violin', { voices: 4, detune: 12, clef: 'bass', attack: 0.09, releaseTau: 0.1, tail: 0.6 }),
  bass_section:    inst('더블베이스 (섹션)', 43, 'string', 'contrabass', 'bowed', 'violin', { voices: 3, detune: 12, clef: 'bass', attack: 0.1, releaseTau: 0.12, tail: 0.6 }),
  flute_duo:       inst('플루트 (듀오)', 73, 'wind', 'flute', 'flute', 'flute', { voices: 2, detune: 9 }),
  oboe_duo:        inst('오보에 (듀오)', 68, 'wind', 'oboe', 'reed', 'reed', { voices: 2, detune: 9 }),
  clarinet_duo:    inst('클라리넷 (듀오)', 71, 'wind', 'clarinet', 'reed', 'reed', { voices: 2, detune: 9, transpose: -2, attack: 0.03, releaseTau: 0.06, tail: 0.4 }),
  bassoon_duo:     inst('바순 (듀오)', 70, 'wind', 'bassoon', 'reed', 'reed', { voices: 2, detune: 9, clef: 'bass', attack: 0.05, releaseTau: 0.08 }),
  horn_section:    inst('호른 (섹션)', 60, 'brass', 'french_horn', 'brass', 'horn', { voices: 3, detune: 10, transpose: -7, attack: 0.06, releaseTau: 0.1, tail: 0.6 }),
  trumpet_section: inst('트럼펫 (섹션)', 56, 'brass', 'trumpet', 'brass', 'trumpet', { voices: 3, detune: 10, transpose: -2 }),
  trombone_section: inst('트럼본 (섹션)', 57, 'brass', 'trombone', 'brass', 'trombone', { voices: 3, detune: 10, clef: 'bass' }),
  drum_kit:     inst('드럼 세트', 0, 'percussion', '', 'piano', 'drums', { clef: 'treble', percussion: true }),
} as const satisfies Record<string, InstrumentInfo>;

export const INSTRUMENTS: Record<keyof typeof DEFS, InstrumentInfo> = DEFS;
export type InstrumentName = keyof typeof DEFS;
export const INSTRUMENT_NAMES = Object.keys(DEFS) as InstrumentName[];

export const GROUP_LABEL: Record<InstrumentGroup, string> = {
  keyboard: '건반 / 하프',
  string: '현악기',
  wind: '목관악기',
  sax: '색소폰',
  brass: '금관악기',
  guitar: '기타 / 베이스',
  tuned: '건반 타악기',
  percussion: '드럼 / 타악기',
  voice: '합창',
};

/** Order of the groups in menus. */
export const INSTRUMENT_GROUPS = Object.keys(GROUP_LABEL) as InstrumentGroup[];

/** Closest instrument of ours for a General MIDI program number. */
export function instrumentForProgram(program: number): InstrumentName {
  const exact = INSTRUMENT_NAMES.find(n => INSTRUMENTS[n].program === program);
  if (exact) return exact;
  if (program >= 32 && program <= 39) return 'electric_bass';
  if (program >= 24 && program <= 31) return 'electric_guitar';
  if (program >= 44 && program <= 55) return 'string_ensemble';
  if (program >= 61 && program <= 63) return 'brass_section';
  if (program >= 80 && program <= 95) return 'string_ensemble';
  if (program >= 76 && program <= 79) return 'flute';
  if (program >= 16 && program <= 20) return 'organ';
  if (program >= 1 && program <= 7) return 'piano';
  return 'piano';
}

export function isInstrumentName(value: unknown): value is InstrumentName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(INSTRUMENTS, value);
}

const CACHE_NAME = 'soundfont-v1';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" -> 60, "Bb3" -> 58, "F#2" -> 42. Returns null for anything else. */
export function noteNameToMidi(name: string): number | null {
  const m = name.match(/^([A-G])([b#]?)(-?\d+)$/);
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (parseInt(m[3], 10) + 1) + SEMITONES[m[1]] + acc;
}

/** Frequency in Hz -> fractional MIDI note number (A4 = 440 Hz = 69). */
export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Picks the sample whose MIDI number is closest to `midi`. */
export function nearestSample(available: number[], midi: number): number | null {
  if (available.length === 0) return null;
  let best = available[0];
  let min = Math.abs(best - midi);
  for (const a of available) {
    const d = Math.abs(a - midi);
    if (d < min) {
      min = d;
      best = a;
    }
  }
  return best;
}

/**
 * Parses a MIDI.js soundfont script into { midiNumber: base64 mp3/ogg }.
 * The file looks like:  MIDI.Soundfont.x = {"A0":"data:audio/mp3;base64,....", ...}
 */
export function parseSoundfontScript(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /"([A-G][b#]?-?\d+)"\s*:\s*"data:audio\/[a-z0-9+.-]+;base64,([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const midi = noteNameToMidi(m[1]);
    if (midi !== null) out.set(midi, m[2]);
  }
  return out;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function fetchTextCached(url: string): Promise<string> {
  // Cache API keeps the (large) soundfont so later visits and offline use work.
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return await hit.text();
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache.put(url, res.clone()).catch(() => {});
      return await res.text();
    }
  } catch (e) {
    // fall through to a plain fetch below
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface InstrumentState {
  status: LoadStatus;
  encoded: Map<number, string>; // midi -> base64
  decoded: Map<number, AudioBuffer>;
  decoding: Map<number, Promise<AudioBuffer | null>>;
  loading?: Promise<void>;
}

interface Voice {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

/** Seconds each player of a section starts after the first (deterministic, so playback is repeatable). */
const LAYER_DELAY = [0, 0.014, 0.006, 0.022];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private input: GainNode | null = null;
  private voices = new Set<Voice>();
  private states = Object.fromEntries(
    INSTRUMENT_NAMES.map(n => [n, this.emptyState()]),
  ) as Record<InstrumentName, InstrumentState>;
  private listeners = new Set<(name: InstrumentName, status: LoadStatus) => void>();

  private emptyState(): InstrumentState {
    return { status: 'idle', encoded: new Map(), decoded: new Map(), decoding: new Map() };
  }

  onStatus(cb: (name: InstrumentName, status: LoadStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getStatus(name: InstrumentName): LoadStatus {
    return this.states[name].status;
  }

  private setStatus(name: InstrumentName, status: LoadStatus) {
    this.states[name].status = status;
    this.listeners.forEach(cb => cb(name, status));
  }

  /** Creates / resumes the context. Call from a user gesture (tap, click). */
  unlock(): AudioContext {
    this.primeIOS();
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      this.buildChain(this.ctx);
    }
    // iOS reports 'interrupted' after calls / locking the screen, not only 'suspended'
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** 'running' when sound can come out; anything else means the browser is holding the audio back. */
  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Waits (briefly) for the context to start; resolves to whether it is running. */
  async ensureRunning(timeoutMs = 800): Promise<boolean> {
    const ctx = this.unlock();
    if (ctx.state === 'running') return true;
    await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, timeoutMs))]);
    return (ctx.state as string) === 'running';
  }

  private silentEl: HTMLAudioElement | null = null;

  /**
   * iPad / iPhone Safari mutes Web Audio while the silent switch is on, unless the page
   * is treated as "media playback". Asking for the 'playback' audio session (Safari 17+)
   * or looping a silent audio element (older versions) fixes that. Needs a user gesture.
   */
  private primeIOS(): void {
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') session.type = 'playback';
    } catch (e) { /* not supported */ }
    if (this.silentEl || typeof document === 'undefined') return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return;
    try {
      // 0.5 s of 8-bit mono silence as a WAV file
      const rate = 8000, n = rate / 2;
      const buf = new Uint8Array(44 + n).fill(128);
      const dv = new DataView(buf.buffer);
      const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
      str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
      str(36, 'data'); dv.setUint32(40, n, true);
      const el = document.createElement('audio');
      el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      el.loop = true;
      el.setAttribute('playsinline', '');
      this.silentEl = el;
      el.play().catch(() => { this.silentEl = null; });
    } catch (e) { this.silentEl = null; }
  }

  private buildChain(ctx: AudioContext) {
    const input = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.9;

    // Short, light room reverb built from decaying noise (no impulse files).
    const reverb = ctx.createConvolver();
    const seconds = 1.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;

    input.connect(compressor);
    input.connect(reverb);
    reverb.connect(wet);
    wet.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);
    this.input = input;
  }

  /** Starts downloading an instrument's samples (no AudioContext needed). */
  loadInstrument(name: InstrumentName): Promise<void> {
    const state = this.states[name];
    if (state.status === 'ready') return Promise.resolve();
    if (INSTRUMENTS[name].percussion) {
      this.setStatus(name, 'ready'); // synthesized, nothing to download
      return Promise.resolve();
    }
    if (state.loading) return state.loading;

    this.setStatus(name, 'loading');
    const url = `${SOUNDFONT_BASE}${INSTRUMENTS[name].file}-mp3.js`;
    state.loading = fetchTextCached(url)
      .then(text => {
        const parsed = parseSoundfontScript(text);
        if (parsed.size === 0) throw new Error('no samples found in soundfont');
        state.encoded = parsed;
        this.setStatus(name, 'ready');
      })
      .catch(err => {
        console.warn(`Soundfont "${name}" failed to load, using synthesizer`, err);
        state.loading = undefined;
        this.setStatus(name, 'error');
      });
    return state.loading;
  }

  private decodeSample(name: InstrumentName, midi: number): Promise<AudioBuffer | null> {
    const state = this.states[name];
    const done = state.decoded.get(midi);
    if (done) return Promise.resolve(done);
    const pending = state.decoding.get(midi);
    if (pending) return pending;
    const b64 = state.encoded.get(midi);
    if (!b64 || !this.ctx) return Promise.resolve(null);

    // decodeAudioData detaches its input, so always hand it a fresh buffer.
    const p = this.ctx
      .decodeAudioData(base64ToArrayBuffer(b64))
      .then(buf => {
        state.decoded.set(midi, buf);
        state.decoding.delete(midi);
        return buf;
      })
      .catch(() => {
        state.decoding.delete(midi);
        return null;
      });
    state.decoding.set(midi, p);
    return p;
  }

  private sampleFor(name: InstrumentName, frequency: number): number | null {
    const state = this.states[name];
    if (state.status !== 'ready') return null;
    return nearestSample([...state.encoded.keys()], Math.round(frequencyToMidi(frequency)));
  }

  /** Decodes every sample needed for these frequencies so playback can start on time. */
  async prepare(name: InstrumentName, frequencies: number[]): Promise<void> {
    this.unlock();
    if (INSTRUMENTS[name].percussion) return;
    if (this.states[name].status === 'loading') await this.loadInstrument(name);
    if (this.states[name].status !== 'ready') return;
    const needed = new Set<number>();
    for (const f of frequencies) {
      const s = this.sampleFor(name, f);
      if (s !== null) needed.add(s);
    }
    await Promise.all([...needed].map(m => this.decodeSample(name, m)));
  }

  /** Schedules one note. `when` is in AudioContext time. */
  playNote(opts: {
    instrument: InstrumentName;
    frequency: number;
    when: number;
    duration: number;
    velocity?: number;
    /** Internal: one player of a section (already detuned and delayed). */
    layer?: boolean;
    detuneCents?: number;
  }): void {
    const ctx = this.unlock();
    if (!this.input) return;
    const { instrument } = opts;
    const frequency = opts.frequency * Math.pow(2, (opts.detuneCents ?? 0) / 1200);
    const when = Math.max(opts.when, ctx.currentTime);
    const duration = Math.max(0.05, opts.duration);
    const velocity = opts.velocity ?? 0.8;
    const env = INSTRUMENTS[instrument];
    if (env.voices && env.voices > 1 && !opts.layer) {
      // several players: spread the pitch a little and let each one start a hair late
      const n = env.voices;
      const spread = env.detune ?? 10;
      for (let i = 0; i < n; i++) {
        this.playNote({
          ...opts,
          layer: true,
          detuneCents: (i / (n - 1) - 0.5) * 2 * spread,
          when: opts.when + LAYER_DELAY[i % LAYER_DELAY.length],
          velocity: (opts.velocity ?? 0.8) * 1.15 / Math.sqrt(n),
        });
      }
      return;
    }
    if (env.percussion) {
      this.playDrum(drumForFrequency(frequency).gm, opts.when, velocity);
      return;
    }

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0, when);
    voiceGain.gain.linearRampToValueAtTime(velocity, when + env.attack);
    voiceGain.gain.setValueAtTime(velocity, when + Math.max(env.attack, duration));
    voiceGain.gain.setTargetAtTime(0, when + duration, env.releaseTau);
    voiceGain.connect(this.input);

    const voice: Voice = { gain: voiceGain, sources: [] };
    const stopAt = when + duration + env.tail;

    const midi = this.sampleFor(instrument, frequency);
    const buffer = midi !== null ? this.states[instrument].decoded.get(midi) : undefined;

    if (midi !== null && buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.pow(2, (frequencyToMidi(frequency) - midi) / 12);
      src.connect(voiceGain);
      src.start(when);
      src.stop(stopAt);
      voice.sources.push(src);
    } else {
      this.synth(ctx, instrument, frequency, when, duration, voiceGain, voice, stopAt);
    }

    this.voices.add(voice);
    const last = voice.sources[voice.sources.length - 1];
    if (last) {
      last.onended = () => {
        this.voices.delete(voice);
        try { voiceGain.disconnect(); } catch (e) { /* already gone */ }
      };
    }
  }

  private noiseBuffer?: AudioBuffer;

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** One drum hit (General MIDI percussion key), built from oscillators and filtered noise. */
  playDrum(gm: number, when: number, velocity = 0.8): void {
    const ctx = this.unlock();
    if (!this.input) return;
    const t = Math.max(when, ctx.currentTime);
    const out = ctx.createGain();
    out.gain.value = Math.min(1, velocity);
    out.connect(this.input);
    const voice: Voice = { gain: out, sources: [] };

    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.03);
      voice.sources.push(o);
    };
    const hiss = (type: BiquadFilterType, freq: number, q: number, dur: number, peak: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(t, Math.random());
      s.stop(t + dur + 0.03);
      voice.sources.push(s);
    };

    const TOM: Record<number, number> = { 41: 80, 43: 100, 45: 120, 47: 150, 48: 180, 50: 210 };
    switch (gm) {
      case 35:
      case 36:
        tone('sine', 150, 45, 0.32, 1);
        hiss('bandpass', 3000, 1, 0.025, 0.3);
        break;
      case 37:
        tone('square', 900, 650, 0.035, 0.4);
        hiss('bandpass', 2500, 2, 0.03, 0.4);
        break;
      case 38:
      case 39:
      case 40:
        tone('triangle', 230, 170, 0.11, 0.6);
        hiss('bandpass', 2200, 0.8, 0.2, 0.9);
        break;
      case 42:
        hiss('highpass', 7500, 0.7, 0.05, 0.55);
        break;
      case 44:
        hiss('highpass', 6500, 0.7, 0.04, 0.4);
        break;
      case 46:
        hiss('highpass', 7000, 0.7, 0.4, 0.5);
        break;
      case 49:
      case 52:
      case 55:
      case 57:
        hiss('highpass', 5000, 0.6, 1.4, 0.6);
        tone('square', 3300, 3300, 0.5, 0.04);
        break;
      case 51:
      case 53:
      case 59:
        hiss('highpass', 8000, 0.7, 0.7, 0.25);
        tone('triangle', 3100, 3100, 0.5, 0.1);
        tone('triangle', 4700, 4700, 0.35, 0.07);
        break;
      default: {
        const f = TOM[gm];
        if (f) {
          tone('sine', f * 1.6, f, 0.35, 0.95);
          hiss('lowpass', 1200, 0.7, 0.05, 0.3);
        } else {
          hiss('highpass', 7500, 0.7, 0.05, 0.5);
        }
      }
    }

    this.voices.add(voice);
    const last = voice.sources[voice.sources.length - 1];
    if (last) {
      last.onended = () => {
        this.voices.delete(voice);
        try { out.disconnect(); } catch (e) { /* already gone */ }
      };
    }
  }

  /** Plays one note right now (used when the user taps a staff position). */
  async preview(instrument: InstrumentName, frequency: number, duration: number): Promise<void> {
    this.unlock();
    // Kick off the download for next time; play the synth meanwhile.
    if (this.states[instrument].status === 'idle') this.loadInstrument(instrument);
    await this.prepare(instrument, [frequency]).catch(() => {});
    this.playNote({ instrument, frequency, when: 0, duration });
  }

  /** Silences everything immediately (with a few ms of fade to avoid clicks). */
  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.015);
        v.sources.forEach(s => {
          try { s.stop(now + 0.08); } catch (e) { /* not started / already stopped */ }
        });
      } catch (e) { /* ignore */ }
    }
    this.voices.clear();
  }

  // Oscillator fallback, used until samples are available (or if they fail).
  private synth(
    ctx: AudioContext,
    instrument: InstrumentName,
    f: number,
    when: number,
    duration: number,
    out: AudioNode,
    voice: Voice,
    stopAt: number,
  ) {
    const add = <T extends AudioScheduledSourceNode>(node: T, start: number, end: number): T => {
      node.start(start);
      node.stop(end);
      voice.sources.push(node);
      return node;
    };

    const kind = INSTRUMENTS[instrument].synth;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(f, when);

    if (kind === 'reed') {
      // Odd harmonics: square wave through a note-tracking low-pass filter.
      osc.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(f * 4, 8000), when);
      osc.connect(filter);
      filter.connect(out);
      add(osc, when, stopAt);
    } else if (kind === 'flute') {
      // Nearly pure tone with a touch of 2nd harmonic and gentle vibrato.
      osc.type = 'sine';
      const second = ctx.createOscillator();
      second.type = 'sine';
      second.frequency.setValueAtTime(f * 2, when);
      const secondGain = ctx.createGain();
      secondGain.gain.value = 0.18;
      second.connect(secondGain);
      secondGain.connect(out);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(5, when);
      lfoGain.gain.setValueAtTime(0, when);
      lfoGain.gain.linearRampToValueAtTime(f * 0.004, when + 0.3);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(out);
      add(osc, when, stopAt);
      add(second, when, stopAt);
      add(lfo, when, stopAt);
    } else if (kind === 'brass') {
      // Sawtooth whose brightness swells in after the attack.
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(f * 1.5, when);
      filter.frequency.linearRampToValueAtTime(Math.min(f * 5, 7000), when + 0.12);
      osc.connect(filter);
      filter.connect(out);
      add(osc, when, stopAt);
    } else if (kind === 'bowed') {
      // Sawtooth with vibrato; the filter follows the pitch so low notes keep their body.
      osc.type = 'sawtooth';
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(5.5, when);
      lfoGain.gain.setValueAtTime(0, when);
      lfoGain.gain.linearRampToValueAtTime(f * 0.008, when + 0.25); // vibrato fades in
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(f * 6, 9000), when);
      filter.Q.value = 0.7;
      osc.connect(filter);
      filter.connect(out);
      add(osc, when, stopAt);
      add(lfo, when, stopAt);
    } else {
      // Piano-ish: a few slightly stretched partials, brighter at the attack.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(f * 6, 10000), when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 200), when + duration + 1.5);
      filter.connect(out);
      const partials = [
        { ratio: 1, gain: 0.6, type: 'triangle' as OscillatorType },
        { ratio: 2.001, gain: 0.28, type: 'sine' as OscillatorType },
        { ratio: 3.003, gain: 0.14, type: 'sine' as OscillatorType },
        { ratio: 4.006, gain: 0.07, type: 'sine' as OscillatorType },
      ];
      for (const p of partials) {
        const o = ctx.createOscillator();
        o.type = p.type;
        o.frequency.setValueAtTime(f * p.ratio, when);
        const g = ctx.createGain();
        g.gain.setValueAtTime(p.gain, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + duration + 1.5);
        o.connect(g);
        g.connect(filter);
        add(o, when, stopAt);
      }
    }
  }
}

/** Sounding minus written pitch, in semitones (0 for non-transposing instruments). */
export const instrumentShift = (name: InstrumentName): number => (INSTRUMENTS[name] as InstrumentInfo).transpose ?? 0;
