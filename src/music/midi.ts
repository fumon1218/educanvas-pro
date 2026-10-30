// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/midi.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// Standard MIDI File (SMF) writer and reader. No dependencies.

import {
  MAX_STAVES,
  TPQ,
  durationTicks,
  eventsToMeasures,
  expandRepeats,
  measureTicks,
  midiToPitch,
  pitchToMidi,
  type NoteEvent,
  type Score,
  type ScoreItem,
  type ScorePart,
} from './score';
import { drumForGm, drumForStaffMidi, isFootDrum } from './drums';

const PPQ = 480;
const SCALE = PPQ / TPQ; // file ticks per score tick

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

interface RawEvent {
  tick: number;
  /** Ordering inside one tick: meta first, then note-offs, then note-ons. */
  order: number;
  data: number[];
}

function vlq(value: number): number[] {
  let n = Math.max(0, Math.floor(value));
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0) & 0x7f);

function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function meta(type: number, payload: number[]): number[] {
  return [0xff, type, ...vlq(payload.length), ...payload];
}

function trackChunk(events: RawEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of sorted) {
    body.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0x00, ...meta(0x2f, []));
  return [...ascii('MTrk'), ...u32(body.length), ...body];
}

/** The notes a part plays, with repeats expanded and tied notes merged. */
export function partToNotes(part: ScorePart): { start: number; ticks: number; midi: number }[] {
  const flat: ScoreItem[] = expandRepeats(part).flatMap(m => m.items);
  const notes: { start: number; ticks: number; midi: number }[] = [];
  let t = 0;
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    let ticks = durationTicks(item.duration);
    if (item.kind === 'rest' || !item.pitch) {
      t += ticks;
      continue;
    }
    const midi = pitchToMidi(item.pitch);
    let j = i;
    while (flat[j].tieNext) {
      const nextItem = flat[j + 1];
      if (!nextItem || nextItem.kind !== 'note' || !nextItem.pitch || pitchToMidi(nextItem.pitch) !== midi) break;
      j++;
      ticks += durationTicks(nextItem.duration);
    }
    notes.push({ start: t, ticks, midi });
    for (const p of item.also ?? []) notes.push({ start: t, ticks, midi: pitchToMidi(p) });
    t += ticks;
    i = j;
  }
  return notes;
}

export function writeMidi(score: Score): Uint8Array<ArrayBuffer> {
  const tracks: number[][] = [];

  // Conductor track: tempo, time signature, key.
  const conductor: RawEvent[] = [
    { tick: 0, order: -1, data: meta(0x03, utf8('Sheet Music')) },
    { tick: 0, order: -1, data: meta(0x51, u32(Math.round(60000000 / Math.max(1, score.tempo))).slice(1)) },
    { tick: 0, order: -1, data: meta(0x58, [score.beats & 0xff, Math.round(Math.log2(score.beatType)), 24, 8]) },
    { tick: 0, order: -1, data: meta(0x59, [score.fifths & 0xff, 0]) },
  ];
  tracks.push(trackChunk(conductor));

  score.parts.forEach((part, index) => {
    // channel 10 (index 9) is drums: only percussion parts use it
    const channel = part.percussion ? 9 : (index < 9 ? index : index + 1) % 16;
    const events: RawEvent[] = [
      { tick: 0, order: -1, data: meta(0x03, utf8(part.name || `Staff ${index + 1}`)) },
    ];
    if (!part.percussion) events.push({ tick: 0, order: -1, data: [0xc0 | channel, (part.program ?? score.program ?? 0) & 0x7f] });
    for (const n of partToNotes(part)) {
      if (part.percussion) n.midi = drumForStaffMidi(n.midi).gm;
      const on = Math.round(n.start * SCALE);
      const off = Math.round((n.start + n.ticks) * SCALE);
      events.push({ tick: on, order: 1, data: [0x90 | channel, n.midi & 0x7f, 80] });
      events.push({ tick: off, order: 0, data: [0x80 | channel, n.midi & 0x7f, 0] });
    }
    tracks.push(trackChunk(events));
  });

  const header = [...ascii('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...tracks.flat()]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface MidiNote {
  start: number;
  end: number;
  midi: number;
  velocity: number;
}

export interface MidiTrack {
  name?: string;
  program?: number;
  channel: number;
  notes: MidiNote[];
}

export interface MidiFile {
  ppq: number;
  tempo?: number;
  beats?: number;
  beatType?: number;
  fifths?: number;
  tempoChanges: number;
  tracks: MidiTrack[];
}

export function parseMidi(data: Uint8Array): MidiFile {
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > data.length) throw new Error('MIDI 파일이 중간에 끊겨 있습니다.');
  };
  const read8 = () => {
    need(1);
    return data[pos++];
  };
  const read16 = () => (read8() << 8) | read8();
  const read32 = () => ((read8() << 24) | (read8() << 16) | (read8() << 8) | read8()) >>> 0;
  const readVlq = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = read8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };
  const readTag = () => {
    need(4);
    const s = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
    pos += 4;
    return s;
  };

  if (readTag() !== 'MThd') throw new Error('MIDI 파일이 아닙니다.');
  const headerLen = read32();
  const format = read16();
  const trackCount = read16();
  const division = read16();
  pos += Math.max(0, headerLen - 6);
  if (division & 0x8000) throw new Error('SMPTE 시간 방식의 MIDI 파일은 지원하지 않습니다.');
  if (format > 2) throw new Error('지원하지 않는 MIDI 형식입니다.');

  const file: MidiFile = { ppq: division, tempoChanges: 0, tracks: [] };
  const tempos = new Set<number>();

  for (let t = 0; t < trackCount && pos < data.length; t++) {
    const tag = readTag();
    const length = read32();
    const end = Math.min(data.length, pos + length);
    if (tag !== 'MTrk') {
      pos = end;
      continue;
    }

    let tick = 0;
    let status = 0;
    let trackName: string | undefined;
    const programs = new Map<number, number>();
    const open = new Map<string, { start: number; velocity: number }[]>();
    const byChannel = new Map<number, MidiNote[]>();

    const closeNote = (ch: number, note: number, at: number) => {
      const list = open.get(`${ch}:${note}`);
      const started = list?.shift();
      if (!started) return;
      if (!byChannel.has(ch)) byChannel.set(ch, []);
      byChannel.get(ch)!.push({ start: started.start, end: Math.max(at, started.start), midi: note, velocity: started.velocity });
    };

    while (pos < end) {
      tick += readVlq();
      let first = read8();
      if (first < 0x80) {
        // running status: this byte is already the first data byte
        pos--;
        first = status;
      } else if (first < 0xf0) {
        status = first;
      }

      if (first === 0xff) {
        const type = read8();
        const len = readVlq();
        need(len);
        const payload = data.slice(pos, pos + len);
        pos += len;
        if (type === 0x2f) break;
        if (type === 0x03 && trackName === undefined) trackName = new TextDecoder().decode(payload);
        if (type === 0x51 && payload.length === 3) {
          const us = (payload[0] << 16) | (payload[1] << 8) | payload[2];
          if (us > 0) {
            const bpm = Math.round(60000000 / us);
            tempos.add(bpm);
            if (file.tempo === undefined) file.tempo = bpm;
          }
        }
        if (type === 0x58 && payload.length >= 2 && file.beats === undefined) {
          file.beats = payload[0];
          file.beatType = Math.pow(2, payload[1]);
        }
        if (type === 0x59 && payload.length >= 1 && file.fifths === undefined) {
          file.fifths = (payload[0] << 24) >> 24; // signed byte
        }
        continue;
      }
      if (first === 0xf0 || first === 0xf7) {
        const len = readVlq();
        need(len);
        pos += len;
        continue;
      }

      const kind = first & 0xf0;
      const ch = first & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        const d1 = read8();
        if (kind === 0xc0 && !programs.has(ch)) programs.set(ch, d1);
        continue;
      }
      const d1 = read8();
      const d2 = read8();
      if (kind === 0x90 && d2 > 0) {
        const key = `${ch}:${d1}`;
        if (!open.has(key)) open.set(key, []);
        open.get(key)!.push({ start: tick, velocity: d2 });
      } else if (kind === 0x80 || kind === 0x90) {
        closeNote(ch, d1, tick);
      }
    }
    pos = end;

    // Notes that were never switched off end with the track.
    for (const [key, list] of open) {
      const [ch, note] = key.split(':').map(Number);
      while (list.length) closeNote(ch, note, tick);
    }

    for (const [channel, notes] of byChannel) {
      if (notes.length === 0) continue;
      file.tracks.push({ name: trackName, program: programs.get(channel), channel, notes });
    }
  }

  file.tempoChanges = Math.max(0, tempos.size - 1);
  return file;
}

// ---------------------------------------------------------------------------
// MIDI -> Score
// ---------------------------------------------------------------------------

export const MIDI_GRIDS = [
  { id: 'eighth', ticks: 24, label: '8분음표' },
  { id: 'sixteenth', ticks: 12, label: '16분음표 (권장)' },
  { id: 'thirtysecond', ticks: 6, label: '32분음표' },
  { id: 'triplet', ticks: 4, label: '16분 + 셋잇단' },
] as const;

export type MidiGridId = (typeof MIDI_GRIDS)[number]['id'];

const MAX_MEASURES = 400;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function midiToScore(file: MidiFile, gridTicks = 12): Score {
  const warnings: string[] = [];
  const factor = TPQ / file.ppq;
  const beats = file.beats ?? 4;
  const beatType = file.beatType ?? 4;
  const grid = gridTicks;
  const allowTuplets = grid % 12 !== 0;

  type Staff = { clef: 'treble' | 'bass'; prefer: 'high' | 'low'; events: NoteEvent[]; program?: number; name?: string; percussion?: boolean };
  const staves: Staff[] = [];

  const toEvents = (notes: { start: number; end: number; midi: number }[]): NoteEvent[] =>
    notes.map(n => {
      const start = Math.round((n.start * factor) / grid) * grid;
      const end = Math.max(start + grid, Math.round((n.end * factor) / grid) * grid);
      return { start, end, pitch: midiToPitch(n.midi) };
    });

  /** A drum hit lasts until the next hit (at most a quarter note), written at its staff position. */
  const barTicks = measureTicks(beats, beatType);
  const drumEvents = (notes: MidiNote[]): NoteEvent[] => {
    const ev = toEvents(notes.map(n => ({ start: n.start, end: n.end, midi: drumForGm(n.midi).staffMidi })));
    const starts = [...new Set(ev.map(e => e.start))].sort((a, b) => a - b);
    return ev.map(e => {
      const next = starts.find(s => s > e.start);
      const barEnd = (Math.floor(e.start / barTicks) + 1) * barTicks;
      const end = Math.max(e.start + grid, Math.min(next ?? Infinity, e.start + TPQ, barEnd));
      return { ...e, end };
    });
  };

  for (const track of file.tracks) {
    if (track.channel === 9) {
      const name = track.name && !/^Staff \d+$/.test(track.name) ? track.name : undefined;
      const feet = track.notes.filter(n => isFootDrum(n.midi));
      const hands = track.notes.filter(n => !isFootDrum(n.midi));
      if (hands.length > 0) staves.push({ clef: 'treble', prefer: 'high', percussion: true, name: name ?? '드럼', events: drumEvents(hands) });
      if (feet.length > 0) staves.push({ clef: 'treble', prefer: 'high', percussion: true, name: hands.length > 0 ? '드럼 (발)' : name ?? '드럼', events: drumEvents(feet) });
      continue;
    }
    const before = staves.length;
    const pitches = track.notes.map(n => n.midi);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    if (low < 55 && high > 67 && high - low >= 24) {
      // Both hands in one track: split at middle C.
      staves.push({ clef: 'treble', prefer: 'high', events: toEvents(track.notes.filter(n => n.midi >= 60)) });
      staves.push({ clef: 'bass', prefer: 'low', events: toEvents(track.notes.filter(n => n.midi < 60)) });
    } else if (median(pitches) < 60) {
      staves.push({ clef: 'bass', prefer: 'low', events: toEvents(track.notes) });
    } else {
      staves.push({ clef: 'treble', prefer: 'high', events: toEvents(track.notes) });
    }
    const nm = track.name && !/^Staff \d+$/.test(track.name) ? track.name : undefined;
    for (let i = before; i < staves.length; i++) {
      staves[i].program = track.program;
      staves[i].name = nm;
    }
  }

  if (staves.length > MAX_STAVES) {
    warnings.push(`트랙이 많아 처음 ${MAX_STAVES}개 오선만 불러왔어요.`);
    staves.length = MAX_STAVES;
  }

  const mt = measureTicks(beats, beatType);
  const lastEnd = Math.max(0, ...staves.flatMap(s => s.events.map(e => e.end)));
  let measureCount = Math.max(1, Math.ceil(lastEnd / mt));
  if (measureCount > MAX_MEASURES) {
    warnings.push(`곡이 길어 앞의 ${MAX_MEASURES}마디만 불러왔어요.`);
    measureCount = MAX_MEASURES;
  }
  const boundaries = Array.from({ length: measureCount + 1 }, (_, i) => i * mt);

  let dropped = 0;
  const parts: ScorePart[] = staves.map(staff => {
    const built = eventsToMeasures(
      staff.events.filter(e => e.start < boundaries[boundaries.length - 1]),
      boundaries,
      { allowTuplets, prefer: staff.prefer },
    );
    dropped += built.dropped;
    if (built.measures.length > 0) built.measures[built.measures.length - 1].end = 'final';
    return { clef: staff.clef, measures: built.measures, program: staff.program, name: staff.name, percussion: staff.percussion || undefined };
  });

  if (dropped > 0) {
    warnings.push(`화음이나 겹치는 음 ${dropped}개는 한 음만 남기고 제외했어요. (한 오선에는 한 번에 한 음만 쓸 수 있어요)`);
  }
  if (file.tempoChanges > 0) {
    warnings.push('곡 중간에 템포가 바뀌지만 처음 템포만 사용했어요.');
  }

  return {
    tempo: Math.max(30, Math.min(300, file.tempo ?? 120)),
    beats,
    beatType,
    pickup: false,
    fifths: file.fifths ?? 0,
    parts,
    program: file.tracks.find(t => t.channel !== 9 && t.program !== undefined)?.program,
    warnings,
  };
}
