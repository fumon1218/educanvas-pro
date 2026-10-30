// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/score.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// Format-independent score model.
//
// The editor stores flat symbols with x/y coordinates. MIDI and MusicXML think in
// parts, measures and pitches. This module converts between the two so every
// file format only has to talk to `Score`.
//
// Time is measured in ticks: 48 ticks per quarter note. That is the smallest
// grid on which every supported length (down to a dotted 32nd or a triplet 32nd)
// is a whole number.

export const TPQ = 48;
export const MAX_STAVES = 8;

export type Clef = 'treble' | 'bass';
export type Accidental = 'sharp' | 'flat' | 'natural';
export type BaseValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth' | 'thirtysecond';
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface Duration {
  base: BaseValue;
  dotted: boolean;
  /** Triplet: three notes in the time of two. */
  tuplet: boolean;
}

export interface Pitch {
  step: Step;
  octave: number;
  /** -1 flat, 0 natural, +1 sharp (double accidentals are respelled on import). */
  alter: number;
}

export interface ScoreItem {
  kind: 'note' | 'rest';
  duration: Duration;
  pitch?: Pitch;
  /** An accidental sign that is printed next to the note. */
  show?: Accidental;
  /** Tied to the following note of the same pitch. */
  tieNext?: boolean;
  /** Further notes sounding together with `pitch` (a chord). */
  also?: Pitch[];
  /** Lyric syllable under the note (`_` = the previous syllable is held). */
  lyric?: string;
}

/** Bar line that closes a measure. `undefined` is a plain bar line. */
export type Divider = 'double' | 'final' | 'repeat_start' | 'repeat_end';

export interface ScoreMeasure {
  items: ScoreItem[];
  /** A time-signature change that takes effect at the start of this measure, e.g. `3/4`. */
  meter?: string;
  /** Chord symbols printed above the staff (`beat` counts quarter notes from the start of the measure). */
  chords?: { beat: number; text: string }[];
  end?: Divider;
}

export interface ScorePart {
  clef: Clef;
  measures: ScoreMeasure[];
  /** A forward repeat sign before the first measure. */
  leadingRepeat?: boolean;
  /** General MIDI program (0-127) of this part's instrument. */
  program?: number;
  /** An unpitched drum part: notes sit at their percussion-staff position. */
  percussion?: boolean;
  /** Display name of the part (instrument or user label). */
  name?: string;
}

export interface Score {
  tempo: number;
  beats: number;
  beatType: number;
  /** The first measure is a short pick-up (anacrusis) measure. */
  pickup: boolean;
  /** Key signature as a number of sharps (+) or flats (-). */
  fifths: number;
  parts: ScorePart[];
  /** General MIDI program (0-127) of the first part, if known. */
  program?: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

export const BASE_VALUES: BaseValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtysecond'];

const BASE_TICKS: Record<BaseValue, number> = {
  whole: 192,
  half: 96,
  quarter: 48,
  eighth: 24,
  sixteenth: 12,
  thirtysecond: 6,
};

export function durationTicks(d: Duration): number {
  let t = BASE_TICKS[d.base];
  if (d.dotted) t = (t * 3) / 2;
  if (d.tuplet) t = (t * 2) / 3;
  return Math.round(t);
}

interface Entry {
  duration: Duration;
  ticks: number;
}

// Every length the editor can write, simplest spelling first so that e.g. 48 ticks
// is a quarter note and not a dotted triplet quarter.
const ALL_DURATIONS: Entry[] = (() => {
  const out: Entry[] = [];
  const seen = new Set<number>();
  const variants = [
    { dotted: false, tuplet: false },
    { dotted: true, tuplet: false },
    { dotted: false, tuplet: true },
  ];
  for (const v of variants) {
    for (const base of BASE_VALUES) {
      const duration: Duration = { base, ...v };
      const ticks = durationTicks(duration);
      if (!seen.has(ticks)) {
        seen.add(ticks);
        out.push({ duration, ticks });
      }
    }
  }
  return out;
})();

export function durationFromTicks(ticks: number, allowTuplets: boolean): Duration | null {
  const hit = ALL_DURATIONS.find(e => e.ticks === ticks && (allowTuplets || !e.duration.tuplet));
  return hit ? { ...hit.duration } : null;
}

/**
 * Splits a length into writable pieces, largest first (e.g. 60 -> quarter + 16th).
 * Anything shorter than the smallest value is dropped.
 */
export function splitTicks(ticks: number, allowTuplets: boolean): Duration[] {
  const candidates = ALL_DURATIONS
    .filter(e => allowTuplets || !e.duration.tuplet)
    .sort((a, b) => b.ticks - a.ticks);
  const smallest = candidates[candidates.length - 1].ticks;
  const out: Duration[] = [];
  let remaining = Math.round(ticks);
  while (remaining >= smallest) {
    const hit = candidates.find(c => c.ticks <= remaining)!;
    out.push({ ...hit.duration });
    remaining -= hit.ticks;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------

export const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const STEP_SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchToMidi(p: Pitch): number {
  return 12 * (p.octave + 1) + STEP_SEMITONE[p.step] + p.alter;
}

const SHARP_SPELLING: [Step, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];
const FLAT_SPELLING: [Step, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];

export function midiToPitch(midi: number, preferFlat = false): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (preferFlat ? FLAT_SPELLING : SHARP_SPELLING)[pc];
  return { step, octave: Math.floor(midi / 12) - 1, alter };
}

/** Double sharps/flats and other exotic alterations become the equivalent ±1 spelling. */
export function normalizePitch(p: Pitch): Pitch {
  if (Math.abs(p.alter) <= 1) return p;
  return midiToPitch(pitchToMidi(p), p.alter < 0);
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/** Alteration (+1 / -1 / 0) a key signature gives to a note letter. */
export function keyAlter(fifths: number, step: string): number {
  const n = Math.max(-7, Math.min(7, Math.round(fifths || 0)));
  if (n > 0) return SHARP_ORDER.slice(0, n).includes(step) ? 1 : 0;
  if (n < 0) return SHARP_ORDER.slice(7 + n).reverse().includes(step) ? -1 : 0;
  return 0;
}

const DIATONIC_BASE: Record<Clef, number> = { treble: 34, bass: 22 }; // staff position of y = 100

export function pitchToDiatonic(p: Pitch): number {
  return p.octave * 7 + STEPS.indexOf(p.step);
}

export function yToPitch(y: number, clef: Clef, alter = 0): Pitch {
  const d = DIATONIC_BASE[clef] + Math.round((100 - y) / 10);
  return { step: STEPS[((d % 7) + 7) % 7], octave: Math.floor(d / 7), alter };
}

export function pitchToY(p: Pitch, clef: Clef): number {
  return 100 - (pitchToDiatonic(p) - DIATONIC_BASE[clef]) * 10;
}

// ---------------------------------------------------------------------------
// Editor elements <-> Score
// ---------------------------------------------------------------------------

export interface AppElementLike {
  id: string;
  x: number;
  y: number;
  staffIndex?: number;
  type: string;
  pitch?: { name: string; y: number; freq: number };
  accidental?: 'none' | Accidental;
  dotted?: boolean;
  tuplet?: boolean;
  tie?: boolean;
  /** `time_sig` marker: the new meter, e.g. `3/4` */
  meter?: string;
  /** `chord_sym` marker: the chord name, e.g. `Am7` */
  text?: string;
  /** lyric syllable under a note */
  lyric?: string;
}

export interface PitchTables {
  treble: { name: string; y: number; freq: number }[];
  bass: { name: string; y: number; freq: number }[];
}

const DIVIDER_OF: Record<string, Divider | 'plain'> = {
  barline: 'plain',
  double_barline: 'double',
  final_barline: 'final',
  repeat_start: 'repeat_start',
  repeat_end: 'repeat_end',
};

const ELEMENT_OF_DIVIDER: Record<Divider | 'plain', string> = {
  plain: 'barline',
  double: 'double_barline',
  final: 'final_barline',
  repeat_start: 'repeat_start',
  repeat_end: 'repeat_end',
};

export interface EditorState {
  elements: AppElementLike[];
  tempo: number;
  timeSignature: string;
  stavesCount: number;
  clefs: Clef[];
  isAnacrusis: boolean;
  fifths?: number;
  program?: number;
  /** Per-staff instrument info; falls back to `program`. */
  partInfo?: { program?: number; name?: string; percussion?: boolean }[];
}

export function elementsToScore(state: EditorState): Score {
  const [beats, beatType] = state.timeSignature.split('/').map(Number);
  const parts: ScorePart[] = [];

  for (let s = 0; s < state.stavesCount; s++) {
    const clef: Clef = state.clefs[s] === 'bass' ? 'bass' : 'treble';
    const info = state.partInfo?.[s];
    const part: ScorePart = { clef, measures: [], program: info?.program ?? state.program, name: info?.name, percussion: info?.percussion || undefined };
    let items: ScoreItem[] = [];
    let started = false;
    let pendingMeter: string | undefined;
    let pendingChords: { beat: number; text: string }[] = [];
    let measTicks = 0;
    let lastX = -1e9;

    const staffElements = state.elements
      .filter(el => (el.staffIndex || 0) === s)
      .sort((a, b) => a.x - b.x);

    for (const el of staffElements) {
      const divider = DIVIDER_OF[el.type];
      if (divider) {
        if (!started && items.length === 0) {
          // A bar line before any music: only a forward repeat means something.
          if (divider === 'repeat_start') part.leadingRepeat = true;
          continue;
        }
        const meas: ScoreMeasure = { items, end: divider === 'plain' ? undefined : divider };
        if (pendingMeter) meas.meter = pendingMeter;
        if (pendingChords.length) meas.chords = pendingChords;
        part.measures.push(meas);
        items = [];
        pendingMeter = undefined;
        pendingChords = [];
        measTicks = 0;
        lastX = -1e9;
        continue;
      }
      if (el.type === 'time_sig') { if (el.meter && (started || items.length > 0 || part.measures.length > 0)) pendingMeter = el.meter; continue; }
      if (el.type === 'chord_sym') { if (s === 0 && el.text) pendingChords.push({ beat: measTicks / TPQ, text: el.text }); continue; }

      const isNote = el.type.endsWith('_note');
      const isRest = el.type.endsWith('_rest');
      if (!isNote && !isRest) continue;
      started = true;

      const base = el.type.split('_')[0] as BaseValue;
      if (!BASE_VALUES.includes(base)) continue;
      const duration: Duration = { base, dotted: !!el.dotted, tuplet: !!el.tuplet };

      if (isRest) {
        items.push({ kind: 'rest', duration });
      } else {
        const base0 = yToPitch(el.y, clef, 0);
        // an explicit accidental wins; otherwise the key signature decides
        const alter = part.percussion ? 0 : el.accidental === 'sharp' ? 1 : el.accidental === 'flat' ? -1
          : el.accidental === 'natural' ? 0 : keyAlter(state.fifths ?? 0, base0.step);
        const pit = { ...base0, alter };
        const prevItem = items[items.length - 1];
        if (prevItem && prevItem.kind === 'note' && Math.abs(el.x - lastX) < 2 && durationTicks(prevItem.duration) === durationTicks(duration)) {
          // another note at the same x: part of a chord
          prevItem.also = [...(prevItem.also ?? []), pit];
          continue;
        }
        items.push({
          kind: 'note',
          duration,
          pitch: pit,
          show: el.accidental && el.accidental !== 'none' ? el.accidental : undefined,
          tieNext: el.tie ? true : undefined,
          ...(el.lyric ? { lyric: el.lyric } : {}),
        });
      }
      lastX = el.x;
      measTicks += durationTicks(duration);
    }
    if (items.length > 0) part.measures.push({ items, ...(pendingMeter ? { meter: pendingMeter } : {}), ...(pendingChords.length ? { chords: pendingChords } : {}) });
    parts.push(part);
  }

  return {
    tempo: state.tempo || 120,
    beats: beats || 4,
    beatType: beatType || 4,
    pickup: state.isAnacrusis,
    fifths: state.fifths ?? 0,
    parts,
    program: state.program,
    warnings: [],
  };
}

export interface ImportedState {
  elements: AppElementLike[];
  clefs: Clef[];
  stavesCount: number;
  tempo: number;
  timeSignature: string;
  isAnacrusis: boolean;
  fifths: number;
  program?: number;
  /** Per-staff program / name (same length as clefs). */
  partPrograms: (number | undefined)[];
  partPercussion: boolean[];
  partNames: (string | undefined)[];
  warnings: string[];
}

let idCounter = 0;
const newId = () => `imp-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Lays a score out on the editor's staves: measures line up across all staves. */
export function scoreToElements(score: Score, tables: PitchTables): ImportedState {
  const warnings = [...score.warnings];
  const parts = score.parts.slice(0, MAX_STAVES);
  if (score.parts.length > MAX_STAVES) {
    warnings.push(`오선은 최대 ${MAX_STAVES}개까지 불러옵니다. 나머지 ${score.parts.length - MAX_STAVES}개 파트는 제외했어요.`);
  }

  const elements: AppElementLike[] = [];
  let outOfRange = 0;
  const measureCount = Math.max(0, ...parts.map(p => p.measures.length));
  // leave room for the clef, key signature and time signature
  let x = 135 + Math.max(0, Math.abs(score.fifths || 0) - 2) * 10;

  parts.forEach((part, staffIndex) => {
    if (part.leadingRepeat) {
      elements.push({ id: newId(), x: x - 25, y: 100, staffIndex, type: 'repeat_start' });
    }
  });

  for (let m = 0; m < measureCount; m++) {
    if (parts.some(p => p.measures[m]?.meter)) x += 26;   // room for the new time signature
    const slots = Math.max(1, ...parts.map(p => p.measures[m]?.items.length ?? 0));

    parts.forEach((part, staffIndex) => {
      const measure = part.measures[m];
      if (!measure) return;
      if (measure.meter) elements.push({ id: newId(), x: x - 38, y: 100, staffIndex, type: 'time_sig', meter: measure.meter });
      const table = part.clef === 'bass' ? tables.bass : tables.treble;
      const minY = table[0].y;
      const maxY = table[table.length - 1].y;

      measure.items.forEach((item, i) => {
        const ex = x + i * 50;
        const base = item.duration.base;
        const common = {
          id: newId(),
          x: ex,
          staffIndex,
          dotted: item.duration.dotted || undefined,
          tuplet: item.duration.tuplet || undefined,
        };
        if (item.kind === 'rest' || !item.pitch) {
          elements.push({ ...common, y: 100, type: `${base}_rest` });
          return;
        }
        for (const [pi, pit] of [item.pitch, ...(item.also ?? [])].entries()) {
          let y = pitchToY(pit, part.clef);
          if (y < minY || y > maxY) {
            outOfRange++;
            y = Math.min(maxY, Math.max(minY, y));
          }
          const nearest = table.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best), table[0]);
          // the key signature already implies its own sharps/flats; only differences are marked
          const keyAlt = keyAlter(score.fifths, pit.step);
          const acc: 'none' | Accidental =
            part.percussion || pit.alter === keyAlt ? 'none'
              : pit.alter > 0 ? 'sharp' : pit.alter < 0 ? 'flat' : 'natural';
          elements.push({
            ...common,
            id: pi === 0 ? common.id : newId(),
            y: nearest.y,
            type: `${base}_note`,
            pitch: nearest,
            accidental: acc,
            tie: item.tieNext || undefined,
            ...(pi === 0 && item.lyric ? { lyric: item.lyric } : {}),
          });
        }
      });

      // chord symbols sit above the first note that starts at (or after) their beat
      if (measure.chords?.length) {
        let acc = 0;
        const starts = measure.items.map(it => { const b = acc / TPQ; acc += durationTicks(it.duration); return b; });
        for (const c of measure.chords) {
          let idx = starts.findIndex(b => b >= c.beat - 1e-6);
          if (idx < 0) idx = Math.max(0, starts.length - 1);
          elements.push({ id: newId(), x: x + idx * 50, y: 100, staffIndex, type: 'chord_sym', text: c.text });
        }
      }

      const isLast = m === part.measures.length - 1;
      if (measure.end !== undefined || !isLast) {
        elements.push({
          id: newId(),
          x: x + slots * 50 - 5,
          y: 100,
          staffIndex,
          type: ELEMENT_OF_DIVIDER[measure.end ?? 'plain'],
        });
      }
    });

    x += slots * 50 + 40;
  }

  if (outOfRange > 0) {
    warnings.push(`${outOfRange}개 음이 오선 표시 범위를 벗어나 가장 가까운 높이로 옮겨졌어요.`);
  }

  return {
    elements,
    clefs: parts.map(p => p.clef),
    stavesCount: Math.max(1, parts.length),
    tempo: score.tempo,
    timeSignature: `${score.beats}/${score.beatType}`,
    isAnacrusis: score.pickup,
    fifths: score.fifths,
    program: score.program,
    partPrograms: parts.map(p => p.program ?? score.program),
    partPercussion: parts.map(p => !!p.percussion),
    partNames: parts.map(p => p.name),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Events -> measures (shared by the MIDI and MusicXML importers)
// ---------------------------------------------------------------------------

export interface NoteEvent {
  start: number;
  end: number;
  pitch: Pitch;
  show?: Accidental;
  tieNext?: boolean;
  /** lyric syllable that starts with this note (MusicXML import) */
  lyric?: string;
}

export interface BuildOptions {
  allowTuplets: boolean;
  /** Which note of a chord survives: the editor holds one note at a time. */
  prefer: 'high' | 'low';
}

/**
 * Turns timed notes into measures. `boundaries` are the tick positions of the bar
 * lines (first measure start ... last measure end). Overlapping notes are reduced
 * to a single line, notes that cross a bar line are tied, gaps become rests.
 */
export function eventsToMeasures(
  events: NoteEvent[],
  boundaries: number[],
  opts: BuildOptions,
): { measures: ScoreMeasure[]; dropped: number } {
  const midiOf = (e: NoteEvent) => pitchToMidi(e.pitch);
  const sorted = events
    .filter(e => e.end > e.start)
    .sort((a, b) => a.start - b.start || (opts.prefer === 'high' ? midiOf(b) - midiOf(a) : midiOf(a) - midiOf(b)));

  const mono: NoteEvent[] = [];
  let dropped = 0;
  for (const e of sorted) {
    const last = mono[mono.length - 1];
    if (last && e.start < last.end) {
      if (e.start === last.start) {
        dropped++; // the rest of a chord
        continue;
      }
      last.end = e.start; // a new note cuts the previous one short
      last.tieNext = false;
    }
    mono.push({ ...e });
  }

  const measures: ScoreMeasure[] = [];
  let next = 0; // index of the first note that might still reach into the current measure

  for (let k = 0; k < boundaries.length - 1; k++) {
    const bs = boundaries[k];
    const be = boundaries[k + 1];
    if (be <= bs) continue; // zero-length measure
    const items: ScoreItem[] = [];
    let cursor = bs;

    while (next < mono.length && mono[next].end <= bs) next++;

    for (let i = next; i < mono.length && mono[i].start < be; i++) {
      const e = mono[i];
      if (e.end <= bs) continue;
      const segStart = Math.max(e.start, bs);
      const segEnd = Math.min(e.end, be);
      const continuesFromPrev = e.start < bs;
      const continuesToNext = e.end > be;

      if (segStart > cursor) {
        for (const d of splitTicks(segStart - cursor, opts.allowTuplets)) items.push({ kind: 'rest', duration: d });
      }
      const pieces = splitTicks(segEnd - segStart, opts.allowTuplets);
      pieces.forEach((d, idx) => {
        const lastPiece = idx === pieces.length - 1;
        items.push({
          kind: 'note',
          duration: d,
          pitch: e.pitch,
          show: idx === 0 && !continuesFromPrev ? e.show : undefined,
          tieNext: !lastPiece || continuesToNext || (e.tieNext && segEnd === e.end) ? true : undefined,
          ...(idx === 0 && !continuesFromPrev && e.lyric ? { lyric: e.lyric } : {}),
        });
      });
      cursor = segEnd;
    }

    // Fill the measure up with rests, including the last one (a final bar of rests is music too).
    if (cursor < be) {
      for (const d of splitTicks(be - cursor, opts.allowTuplets)) items.push({ kind: 'rest', duration: d });
    }
    measures.push({ items });
  }

  return { measures, dropped };
}

/** Plays a part's measures in order, repeating `|: ... :|` sections once (same as the editor). */
export function expandRepeats(part: ScorePart): ScoreMeasure[] {
  const seq: ScoreMeasure[] = [];
  let repeatStart = 0;
  part.measures.forEach(m => {
    seq.push(m);
    if (m.end === 'repeat_start') {
      repeatStart = seq.length;
    } else if (m.end === 'repeat_end') {
      seq.push(...seq.slice(repeatStart));
    }
  });
  return seq;
}

export function measureTicks(beats: number, beatType: number): number {
  return Math.round((beats * 4 * TPQ) / beatType);
}

/** A scheduled note/rest of one staff, in playback order. */
export interface PlayEntry<T> {
  el: T;
  duration: number;
  /** How long the note actually sounds: longer than `duration` at the head of a tie. */
  soundDuration: number;
  /** A tied continuation: shown/swept, but not struck again. */
  silent: boolean;
}

/**
 * Applies ties to a staff's play list: a note tied to the next note of the same
 * pitch sounds once for the combined length, and the continuation stays silent.
 */
export function applyTies<
  T extends { type: string; y: number; accidental?: string; tie?: boolean },
>(entries: PlayEntry<T>[]): void {
  let head: PlayEntry<T> | null = null;
  let prev: T | null = null;
  for (const entry of entries) {
    const el = entry.el;
    const isNote = el.type.endsWith('_note');
    const continues =
      isNote && head !== null && prev !== null && !!prev.tie &&
      prev.y === el.y && (prev.accidental || 'none') === (el.accidental || 'none');
    if (continues && head) {
      head.soundDuration += entry.duration;
      entry.silent = true;
    } else {
      head = isNote ? entry : null;
    }
    prev = isNote ? el : null;
  }
}
