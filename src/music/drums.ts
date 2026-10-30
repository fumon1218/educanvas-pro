// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/drums.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// Percussion staff: each line/space of a (treble-positioned) staff stands for one drum.
// The notes of a drum part are stored at their staff position; General MIDI drum numbers
// only appear in MIDI / MusicXML files and in the sound engine.

export interface DrumInfo {
  /** General MIDI percussion key (channel 10). */
  gm: number;
  label: string;
  /** Written with an x notehead (cymbals, hi-hats). */
  x: boolean;
  /** MIDI number of the treble-clef position the drum is written on (D4 = 62 ...). */
  staffMidi: number;
}

export const DRUMS: DrumInfo[] = [
  { gm: 44, label: '페달 하이햇', x: true, staffMidi: 62 },
  { gm: 36, label: '베이스 드럼', x: false, staffMidi: 65 },
  { gm: 41, label: '플로어 탐 (낮음)', x: false, staffMidi: 67 },
  { gm: 43, label: '플로어 탐', x: false, staffMidi: 69 },
  { gm: 45, label: '탐 (낮음)', x: false, staffMidi: 71 },
  { gm: 38, label: '스네어', x: false, staffMidi: 72 },
  { gm: 47, label: '탐 (중간)', x: false, staffMidi: 74 },
  { gm: 48, label: '탐 (높음)', x: false, staffMidi: 76 },
  { gm: 51, label: '라이드 심벌', x: true, staffMidi: 77 },
  { gm: 42, label: '하이햇', x: true, staffMidi: 79 },
  { gm: 49, label: '크래시 심벌', x: true, staffMidi: 81 },
  { gm: 46, label: '오픈 하이햇', x: true, staffMidi: 83 },
];

/** The drum written at (or nearest to) a staff position given as a MIDI number. */
export function drumForStaffMidi(midi: number): DrumInfo {
  let best = DRUMS[0];
  for (const d of DRUMS) {
    if (Math.abs(d.staffMidi - midi) < Math.abs(best.staffMidi - midi)) best = d;
  }
  return best;
}

export function drumForFrequency(freq: number): DrumInfo {
  return drumForStaffMidi(Math.round(69 + 12 * Math.log2(freq / 440)));
}

// Other General MIDI percussion keys are written as the drum that sounds most alike.
const ALIAS: Record<number, number> = {
  35: 36, 37: 38, 39: 38, 40: 38, 50: 48, 52: 49, 53: 51, 55: 49, 56: 51, 57: 49, 59: 51,
  54: 42, 58: 46, 60: 48, 61: 41, 62: 48, 63: 43, 64: 41,
};

/** The drum (of ours) for any General MIDI percussion key. */
export function drumForGm(gm: number): DrumInfo {
  const key = ALIAS[gm] ?? gm;
  const exact = DRUMS.find(d => d.gm === key);
  if (exact) return exact;
  let best = DRUMS[0];
  for (const d of DRUMS) if (Math.abs(d.gm - gm) < Math.abs(best.gm - gm)) best = d;
  return best;
}

/** Feet (kick, pedal hi-hat) are written on their own staff when a drum track is imported. */
export const isFootDrum = (gm: number): boolean => drumForGm(gm).gm === 36 || drumForGm(gm).gm === 44;
