/**
 * 악보 파일 읽기: NWC(노트워디 바이너리), NWCTXT, MIDI, MusicXML(.musicxml/.xml/.mxl)
 * 실제 해석은 옥쌤 악보 사보앱에서 가져온 모듈이 한다.
 */
import { isNwcBinary, nwcBinaryToText } from './nwcbin';
import { parseNWCTXT } from './nwctxt';
import { elementsToScore, type Score, type Clef } from './score';
import { parseMidi, midiToScore } from './midi';
import { closeSmallGaps } from './hymnMidi';
import { musicXmlToScore, extractMxl } from './musicxml';

// 사보앱(App.tsx)과 같은 음높이 표 (높은음자리표·낮은음자리표 오선 위치 → 음이름·주파수)
const PITCHES = [
  { name: '도6', y: 20, freq: 1046.5 }, { name: '시5', y: 30, freq: 987.77 }, { name: '라5', y: 40, freq: 880 },
  { name: '솔5', y: 50, freq: 783.99 }, { name: '파5', y: 60, freq: 698.46 }, { name: '미5', y: 70, freq: 659.25 },
  { name: '레5', y: 80, freq: 587.33 }, { name: '도5', y: 90, freq: 523.25 }, { name: '시4', y: 100, freq: 493.88 },
  { name: '라4', y: 110, freq: 440 }, { name: '솔4', y: 120, freq: 392 }, { name: '파4', y: 130, freq: 349.23 },
  { name: '미4', y: 140, freq: 329.63 }, { name: '레4', y: 150, freq: 293.66 }, { name: '도4', y: 160, freq: 261.63 },
  { name: '시3', y: 170, freq: 246.94 }, { name: '라3', y: 180, freq: 220 },
];
const BASS_PITCHES = [
  { name: '미4', y: 20, freq: 329.63 }, { name: '레4', y: 30, freq: 293.66 }, { name: '도4', y: 40, freq: 261.63 },
  { name: '시3', y: 50, freq: 246.94 }, { name: '라3', y: 60, freq: 220 }, { name: '솔3', y: 70, freq: 196 },
  { name: '파3', y: 80, freq: 174.61 }, { name: '미3', y: 90, freq: 164.81 }, { name: '레3', y: 100, freq: 146.83 },
  { name: '도3', y: 110, freq: 130.81 }, { name: '시2', y: 120, freq: 123.47 }, { name: '라2', y: 130, freq: 110 },
  { name: '솔2', y: 140, freq: 98 }, { name: '파2', y: 150, freq: 87.31 }, { name: '미2', y: 160, freq: 82.41 },
  { name: '레2', y: 170, freq: 73.42 }, { name: '도2', y: 180, freq: 65.41 },
];

export const SCORE_FILE_ACCEPT = '.nwc,.nwctxt,.mid,.midi,.musicxml,.xml,.mxl';
export const isScoreFileName = (name: string) => /\.(nwc|nwctxt|mid|midi|musicxml|mxl)$/i.test(name) || /\.xml$/i.test(name);

function fromNwcText(text: string): Score {
  const nwc = parseNWCTXT(text, { treble: PITCHES, bass: BASS_PITCHES });
  if (!nwc.elements.length) throw new Error('불러올 수 있는 음표나 쉼표를 찾지 못했습니다.');
  return elementsToScore({
    elements: nwc.elements as any,
    tempo: nwc.tempo || 100,
    timeSignature: nwc.timeSignature || '4/4',
    stavesCount: nwc.stavesCount,
    clefs: nwc.clefs as Clef[],
    isAnacrusis: false,
    partInfo: (nwc.partNames || []).map(name => ({ name: name || undefined })),
  });
}

export async function loadScoreFile(file: File): Promise<{ score: Score; title: string }> {
  const name = file.name;
  const title = name.replace(/\.[^.]+$/, '');
  const lower = name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let score: Score;
  if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
    score = midiToScore(closeSmallGaps(parseMidi(bytes)), 12);
  } else if (lower.endsWith('.mxl')) {
    score = musicXmlToScore(await extractMxl(bytes));
  } else if (lower.endsWith('.musicxml') || lower.endsWith('.xml')) {
    score = musicXmlToScore(new TextDecoder().decode(bytes));
  } else if (isNwcBinary(bytes)) {
    score = fromNwcText(await nwcBinaryToText(bytes));
  } else {
    // NWCTXT (글자 형식) — 한글 윈도우에서 만든 파일은 EUC-KR일 수 있다
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('�')) {
      try { text = new TextDecoder('euc-kr').decode(bytes); } catch { /* 그대로 사용 */ }
    }
    score = fromNwcText(text);
  }
  if (!score.parts.some(p => p.measures.some(m => m.items.length))) throw new Error('악보에서 음표를 찾지 못했습니다.');
  return { score, title };
}
