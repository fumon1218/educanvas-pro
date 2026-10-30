// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/hymnMidi.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// The hymn MIDI files end every note a little before the next one starts (gate time). Written out as
// notation that leaves a 16th rest after nearly every note, so short gaps are closed (legato) first.

import type { MidiFile } from './midi';

/** Extends each note to the next note's start when the gap is at most a sixteenth note. */
export function closeSmallGaps(file: MidiFile): MidiFile {
  const maxGap = file.ppq / 4 + 1;
  return {
    ...file,
    tracks: file.tracks.map(track => {
      if (track.channel === 9) return track;
      const starts = [...new Set(track.notes.map(n => n.start))].sort((a, b) => a - b);
      return {
        ...track,
        notes: track.notes.map(n => {
          const next = starts.find(s => s > n.start + 1);
          if (next === undefined) return n;
          const gap = next - n.end;
          return gap > 0 && gap <= maxGap ? { ...n, end: next } : n;
        }),
      };
    }),
  };
}
