// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/musicxml.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// MusicXML (score-partwise) writer and reader, plus .mxl (zip) extraction.
// No dependencies: a small tolerant XML parser is included so it also runs
// outside the browser (tests) and does not rely on DOMParser.

import {
  MAX_STAVES,
  TPQ,
  durationTicks,
  eventsToMeasures,
  measureTicks,
  midiToPitch,
  normalizePitch,
  pitchToMidi,
  type Accidental,
  type Clef,
  type Divider,
  type NoteEvent,
  type Score,
  type ScoreItem,
  type ScorePart,
  type Step,
} from './score';
import { drumForGm, drumForStaffMidi } from './drums';

// ---------------------------------------------------------------------------
// Minimal XML parser
// ---------------------------------------------------------------------------

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (i < n) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      top.text += src.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      i = end < 0 ? n : end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal [ ... ] subset
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else {
      // find the closing '>' while ignoring any inside quoted attribute values
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
      }
      const body = src.slice(lt + 1, j);
      i = j + 1;

      if (body[0] === '/') {
        const name = body.slice(1).trim();
        // pop up to the matching open tag (tolerates sloppy files)
        for (let k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) {
            stack.length = k;
            break;
          }
        }
      } else {
        const selfClose = body.endsWith('/');
        const inner = selfClose ? body.slice(0, -1) : body;
        const m = inner.match(/^\s*([^\s/>]+)/);
        if (!m) continue;
        const node: XmlNode = { name: m[1], attrs: {}, children: [], text: '' };
        const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let a: RegExpExecArray | null;
        const rest = inner.slice(m[0].length);
        while ((a = attrRe.exec(rest)) !== null) node.attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
        top.children.push(node);
        if (!selfClose) stack.push(node);
      }
    }
  }
  return root;
}

const kids = (node: XmlNode | undefined, name: string): XmlNode[] =>
  node ? node.children.filter(c => c.name === name) : [];
const kid = (node: XmlNode | undefined, name: string): XmlNode | undefined => kids(node, name)[0];
const txt = (node: XmlNode | undefined, name: string): string | undefined => {
  const k = kid(node, name);
  return k ? k.text.trim() : undefined;
};
const num = (node: XmlNode | undefined, name: string): number | undefined => {
  const t = txt(node, name);
  if (t === undefined || t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TYPE_NAME: Record<string, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  sixteenth: '16th',
  thirtysecond: '32nd',
};

function noteXml(item: ScoreItem, tieStop: boolean, drumId?: (pitch: NonNullable<ScoreItem['pitch']>) => string): string {
  const ticks = durationTicks(item.duration);
  let x = '<note>';
  if (item.kind === 'rest' || !item.pitch) {
    x += '<rest/>';
  } else if (drumId) {
    x += `<unpitched><display-step>${item.pitch.step}</display-step><display-octave>${item.pitch.octave}</display-octave></unpitched>`;
  } else {
    x += `<pitch><step>${item.pitch.step}</step>`;
    if (item.pitch.alter !== 0) x += `<alter>${item.pitch.alter}</alter>`;
    x += `<octave>${item.pitch.octave}</octave></pitch>`;
  }
  x += `<duration>${ticks}</duration>`;
  const tieStart = item.kind === 'note' && !!item.tieNext;
  if (item.kind === 'note' && tieStop) x += '<tie type="stop"/>';
  if (tieStart) x += '<tie type="start"/>';
  if (drumId && item.kind === 'note' && item.pitch) x += `<instrument id="${drumId(item.pitch)}"/>`;
  x += `<voice>1</voice><type>${TYPE_NAME[item.duration.base]}</type>`;
  if (item.duration.dotted) x += '<dot/>';
  if (item.kind === 'note' && item.show) x += `<accidental>${item.show}</accidental>`;
  if (item.duration.tuplet) {
    x += '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  }
  if (item.kind === 'note' && (tieStop || tieStart)) {
    x += '<notations>';
    if (tieStop) x += '<tied type="stop"/>';
    if (tieStart) x += '<tied type="start"/>';
    x += '</notations>';
  }
  if (item.kind === 'note' && item.lyric) {
    x += item.lyric === '_'
      ? '<lyric number="1"><extend/></lyric>'
      : `<lyric number="1"><syllabic>single</syllabic><text>${esc(item.lyric)}</text></lyric>`;
  }
  return x + '</note>';
}

/** `Am7`, `F#m`, `Bb`, `C7`, `Gmaj7` -> MusicXML <harmony>. */
function harmonyXml(text: string): string {
  const m = /^([A-G])([#b]?)(.*)$/.exec(text.trim());
  if (!m) return '';
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const q = m[3];
  const kind = q === 'm' ? 'minor' : q === '7' ? 'dominant' : q === 'm7' ? 'minor-seventh' : q === 'maj7' ? 'major-seventh' : q === 'dim' ? 'diminished' : q === 'sus4' ? 'suspended-fourth' : 'major';
  return `<harmony><root><root-step>${m[1]}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind text="${esc(q)}">${kind}</kind></harmony>`;
}

function barlineXml(location: 'left' | 'right', divider: Divider): string {
  if (divider === 'repeat_start') {
    return `<barline location="${location}"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>`;
  }
  if (divider === 'repeat_end') {
    return `<barline location="${location}"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>`;
  }
  if (divider === 'final') return `<barline location="${location}"><bar-style>light-heavy</bar-style></barline>`;
  return `<barline location="${location}"><bar-style>light-light</bar-style></barline>`;
}

export interface MusicXmlOptions {
  title?: string;
  partName?: string;
}

export function scoreToMusicXml(score: Score, opts: MusicXmlOptions = {}): string {
  const title = opts.title ?? '악보';
  const partName = opts.partName ?? '악기';
  const names = (i: number) => score.parts[i].name || `${partName} ${i + 1}`;
  const fullMeasure = measureTicks(score.beats, score.beatType);

  let x = '<?xml version="1.0" encoding="UTF-8"?>\n';
  x += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
  x += '<score-partwise version="3.1">';
  x += `<work><work-title>${esc(title)}</work-title></work>`;
  x += '<identification><encoding><software>Sheet Music App</software></encoding></identification>';

  x += '<part-list>';
  score.parts.forEach((p, i) => {
    const id = `P${i + 1}`;
    const program = (p.program ?? score.program ?? 0) + 1; // MusicXML counts programs from 1
    const channel = (i < 9 ? i : i + 1) % 16;
    x += `<score-part id="${id}"><part-name>${esc(names(i))}</part-name>`;
    if (p.percussion) {
      // one instrument per drum used, each pointing at its General MIDI percussion key (1-based here)
      const used = new Map<number, string>();
      for (const m of p.measures) for (const it of m.items) {
        if (it.kind === 'note' && it.pitch) {
          const d = drumForStaffMidi(pitchToMidi(it.pitch));
          used.set(d.gm, d.label);
        }
      }
      for (const [gm, label] of used) {
        x += `<score-instrument id="${id}-I${gm}"><instrument-name>${esc(label)}</instrument-name></score-instrument>`;
      }
      for (const gm of used.keys()) {
        x += `<midi-instrument id="${id}-I${gm}"><midi-channel>10</midi-channel><midi-unpitched>${gm + 1}</midi-unpitched></midi-instrument>`;
      }
    } else {
      x += `<score-instrument id="${id}-I1"><instrument-name>${esc(names(i))}</instrument-name></score-instrument>`;
      x += `<midi-instrument id="${id}-I1"><midi-channel>${channel + 1}</midi-channel><midi-program>${program}</midi-program></midi-instrument>`;
    }
    x += '</score-part>';
  });
  x += '</part-list>';

  score.parts.forEach((part, partIndex) => {
    x += `<part id="P${partIndex + 1}">`;
    let prevTied = false;
    let number = score.pickup ? 0 : 1;
    const measures = part.measures.length > 0 ? part.measures : [{ items: [] as ScoreItem[] }];

    measures.forEach((m, idx) => {
      const implicit = idx === 0 && score.pickup ? ' implicit="yes"' : '';
      x += `<measure number="${number}"${implicit}>`;

      const prev = idx > 0 ? measures[idx - 1] : undefined;
      if ((idx === 0 && part.leadingRepeat) || prev?.end === 'repeat_start') {
        x += barlineXml('left', 'repeat_start');
      }

      if (idx === 0) {
        x += `<attributes><divisions>${TPQ}</divisions><key><fifths>${score.fifths}</fifths></key>`;
        x += `<time><beats>${score.beats}</beats><beat-type>${score.beatType}</beat-type></time>`;
        x += part.percussion
          ? '<clef><sign>percussion</sign><line>2</line></clef>'
          : part.clef === 'bass'
          ? '<clef><sign>F</sign><line>4</line></clef>'
          : '<clef><sign>G</sign><line>2</line></clef>';
        x += '</attributes>';
        if (partIndex === 0) {
          x += '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>';
          x += `<per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>`;
        }
      }

      if (idx > 0 && m.meter) {
        const [mb, mt] = m.meter.split('/');
        x += `<attributes><time><beats>${mb}</beats><beat-type>${mt}</beat-type></time></attributes>`;
      }
      if (m.items.length === 0) {
        x += `<note><rest measure="yes"/><duration>${fullMeasure}</duration><voice>1</voice></note>`;
      }
      let acc = 0;
      const pendingHarm = [...(m.chords ?? [])].sort((a, b) => a.beat - b.beat);
      for (const item of m.items) {
        while (pendingHarm.length && pendingHarm[0].beat * TPQ <= acc + 1e-6) x += harmonyXml(pendingHarm.shift()!.text);
        const drumId = part.percussion ? (pt: NonNullable<ScoreItem['pitch']>) => `P${partIndex + 1}-I${drumForStaffMidi(pitchToMidi(pt)).gm}` : undefined;
        x += noteXml(item, prevTied && item.kind === 'note', drumId);
        for (const p of item.also ?? []) x += noteXml({ ...item, pitch: p, also: undefined, show: undefined }, prevTied, drumId).replace('<note>', '<note><chord/>');
        prevTied = item.kind === 'note' ? !!item.tieNext : false;
        acc += durationTicks(item.duration);
      }

      if (m.end && m.end !== 'repeat_start') x += barlineXml('right', m.end);
      x += '</measure>';
      number++;
    });
    x += '</part>';
  });

  return x + '</score-partwise>\n';
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const STEP_SET = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);

function parseBeats(s: string | undefined): number | undefined {
  if (!s) return undefined;
  // "3+2" style compound values: use the sum
  const total = s.split('+').reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0);
  return total > 0 ? total : undefined;
}

interface MeasureInfo {
  start: number;
  end: number;
  divider?: Divider;
  implicit: boolean;
  leftRepeat: boolean;
}

const clefFromSign = (sign: string | undefined, line: number | undefined): Clef | 'perc' => {
  if (sign === 'percussion') return 'perc';
  if (sign === 'F') return 'bass';
  if (sign === 'C' && (line ?? 3) >= 4) return 'bass'; // tenor clef
  return 'treble';
};

export function musicXmlToScore(xml: string): Score {
  const doc = parseXml(xml);
  const rootNode = doc.children.find(c => c.name === 'score-partwise' || c.name === 'score-timewise');
  if (!rootNode) throw new Error('MusicXML 파일이 아닙니다.');
  if (rootNode.name === 'score-timewise') {
    throw new Error('score-timewise 형식은 지원하지 않습니다. MuseScore 등에서 partwise로 다시 저장해 주세요.');
  }

  const warnings: string[] = [];
  let tempo: number | undefined;
  let beats: number | undefined;
  let beatType: number | undefined;
  let fifths: number | undefined;
  let program: number | undefined;
  let pickup = false;
  let graceSkipped = 0;
  let timeChanged = false;
  let dropped = 0;

  const partInfoById = new Map<string, { program?: number; name?: string }>();
  /** `partId:instrumentId` -> General MIDI percussion key (0-based). */
  const drumOfInstrument = new Map<string, number>();
  kids(kid(rootNode, 'part-list'), 'score-part').forEach(sp => {
    const mp = num(kid(sp, 'midi-instrument'), 'midi-program');
    for (const mi of kids(sp, 'midi-instrument')) {
      const un = num(mi, 'midi-unpitched');
      if (un !== undefined) drumOfInstrument.set(`${sp.attrs['id'] ?? ''}:${mi.attrs['id'] ?? ''}`, un - 1);
    }
    const nm = (kid(sp, 'part-name')?.text ?? '').trim();
    partInfoById.set(sp.attrs['id'] ?? '', {
      program: mp !== undefined ? Math.max(0, Math.min(127, mp - 1)) : undefined,
      name: nm || undefined,
    });
  });
  program = [...partInfoById.values()].find(v => v.program !== undefined)?.program;

  const outParts: ScorePart[] = [];

  kids(rootNode, 'part').forEach((partNode, partIndex) => {
    let divisions = 1;
    let staves = 1;
    const clefs = new Map<number, Clef | 'perc'>();
    const percStaffs = new Set<number>();
    const measureInfos: MeasureInfo[] = [];
    const eventsByStaff = new Map<number, NoteEvent[]>();
    let pos = 0;

    const tickOf = (duration: number) => Math.round((duration * TPQ) / divisions);

    kids(partNode, 'measure').forEach((measureNode, mIndex) => {
      const info: MeasureInfo = {
        start: pos,
        end: pos,
        implicit: measureNode.attrs['implicit'] === 'yes' || measureNode.attrs['number'] === '0',
        leftRepeat: false,
      };
      let cursor = 0;
      let maxCursor = 0;
      let lastStart = 0;

      for (const el of measureNode.children) {
        if (el.name === 'attributes') {
          const d = num(el, 'divisions');
          if (d && d > 0) divisions = d;
          const st = num(el, 'staves');
          if (st && st > 0) staves = Math.min(st, MAX_STAVES);
          const time = kid(el, 'time');
          if (time) {
            const b = parseBeats(txt(time, 'beats'));
            const bt = num(time, 'beat-type');
            if (b && bt) {
              if (beats === undefined) {
                beats = b;
                beatType = bt;
              } else if (b !== beats || bt !== beatType) {
                timeChanged = true;
              }
            }
          }
          const key = kid(el, 'key');
          if (key && fifths === undefined) fifths = num(key, 'fifths');
          for (const c of kids(el, 'clef')) {
            const staffNo = parseInt(c.attrs['number'] ?? '1', 10) || 1;
            clefs.set(staffNo, clefFromSign(txt(c, 'sign'), num(c, 'line')));
          }
        } else if (el.name === 'note') {
          if (kid(el, 'grace')) {
            graceSkipped++;
            continue;
          }
          const isChord = !!kid(el, 'chord');
          const dur = tickOf(num(el, 'duration') ?? 0);
          const start = isChord ? lastStart : cursor;
          if (!isChord) {
            lastStart = cursor;
            cursor += dur;
            maxCursor = Math.max(maxCursor, cursor);
          }
          const unpitched = kid(el, 'unpitched');
          const pitchNode = kid(el, 'pitch') ?? unpitched;
          if (kid(el, 'rest') || !pitchNode || dur <= 0) continue;

          const stepText = (unpitched ? txt(pitchNode, 'display-step') : txt(pitchNode, 'step')) ?? '';
          if (!STEP_SET.has(stepText)) continue;
          let pitch = normalizePitch({
            step: stepText as Step,
            octave: (unpitched ? num(pitchNode, 'display-octave') : num(pitchNode, 'octave')) ?? 4,
            alter: unpitched ? 0 : Math.round(num(pitchNode, 'alter') ?? 0),
          });
          if (unpitched) {
            // the drum's own General MIDI key is more reliable than where a file happens to draw it
            const gm = drumOfInstrument.get(`${partNode.attrs['id'] ?? ''}:${kid(el, 'instrument')?.attrs['id'] ?? ''}`);
            if (gm !== undefined) pitch = midiToPitch(drumForGm(gm).staffMidi);
            percStaffs.add(Math.min(parseInt(txt(el, 'staff') ?? '1', 10) || 1, MAX_STAVES));
          }
          const accText = txt(el, 'accidental');
          const show: Accidental | undefined =
            accText === 'sharp' || accText === 'flat' || accText === 'natural' ? accText : undefined;
          const tieNext = kids(el, 'tie').some(t => t.attrs['type'] === 'start');
          const staffNo = Math.min(parseInt(txt(el, 'staff') ?? '1', 10) || 1, MAX_STAVES);
          // first verse's syllable (number 1, or the first <lyric> when numbers are missing)
          const lyrics = kids(el, 'lyric');
          const l1 = lyrics.find(l => (l.attrs['number'] ?? '1') === '1') ?? lyrics[0];
          const lyricText = l1 ? (txt(l1, 'text') ?? '').trim() : '';
          const lyric = lyricText ? lyricText : l1 && kid(l1, 'extend') ? '_' : undefined;
          if (!eventsByStaff.has(staffNo)) eventsByStaff.set(staffNo, []);
          eventsByStaff.get(staffNo)!.push({
            start: info.start + start,
            end: info.start + start + dur,
            pitch,
            show,
            tieNext: tieNext || undefined,
            ...(lyric ? { lyric } : {}),
          });
        } else if (el.name === 'backup') {
          cursor = Math.max(0, cursor - tickOf(num(el, 'duration') ?? 0));
        } else if (el.name === 'forward') {
          cursor += tickOf(num(el, 'duration') ?? 0);
          maxCursor = Math.max(maxCursor, cursor);
        } else if (el.name === 'direction' || el.name === 'sound') {
          const sound = el.name === 'sound' ? el : kid(el, 'sound');
          const t = sound ? Number(sound.attrs['tempo']) : NaN;
          if (tempo === undefined) {
            if (Number.isFinite(t) && t > 0) {
              tempo = Math.round(t);
            } else if (el.name === 'direction') {
              const metro = kid(kid(el, 'direction-type'), 'metronome');
              const perMinute = num(metro, 'per-minute');
              if (perMinute && txt(metro, 'beat-unit') === 'quarter') tempo = Math.round(perMinute);
            }
          }
        } else if (el.name === 'barline') {
          const location = el.attrs['location'] ?? 'right';
          const repeat = kid(el, 'repeat');
          const style = txt(el, 'bar-style');
          if (location === 'left') {
            if (repeat?.attrs['direction'] === 'forward') info.leftRepeat = true;
          } else if (repeat?.attrs['direction'] === 'backward') {
            info.divider = 'repeat_end';
          } else if (style === 'light-heavy') {
            info.divider = 'final';
          } else if (style === 'light-light') {
            info.divider = 'double';
          }
        }
      }

      info.end = info.start + Math.max(maxCursor, cursor);
      pos = info.end;
      if (mIndex === 0 && info.implicit) pickup = true;
      measureInfos.push(info);
    });

    // A forward repeat belongs to the bar line before its measure.
    measureInfos.forEach((info, i) => {
      if (!info.leftRepeat) return;
      if (i === 0) return;
      const prev = measureInfos[i - 1];
      if (prev.divider === undefined || prev.divider === 'double') prev.divider = 'repeat_start';
    });
    const leading = measureInfos[0]?.leftRepeat === true;

    // Without an explicit marker, a short first measure is a pick-up.
    if (partIndex === 0 && !pickup && measureInfos.length > 1 && beats && beatType) {
      const first = measureInfos[0];
      const len = first.end - first.start;
      if (len > 0 && len < measureTicks(beats, beatType)) pickup = true;
    }

    if (measureInfos.length === 0) return;
    const boundaries = [...measureInfos.map(m => m.start), measureInfos[measureInfos.length - 1].end];

    const staffNumbers = Array.from({ length: staves }, (_, i) => i + 1);
    for (const staffNo of staffNumbers) {
      if (outParts.length >= MAX_STAVES) {
        warnings.push(`오선은 최대 ${MAX_STAVES}개까지 불러옵니다. 나머지 파트는 제외했어요.`);
        break;
      }
      const declared = clefs.get(staffNo) ?? (staffNo === 1 ? 'treble' : 'bass');
      const percussion = declared === 'perc' || percStaffs.has(staffNo);
      const clef: Clef = declared === 'perc' ? 'treble' : declared;
      const built = eventsToMeasures(eventsByStaff.get(staffNo) ?? [], boundaries, {
        allowTuplets: true,
        prefer: clef === 'bass' ? 'low' : 'high',
      });
      if (percussion) built.measures.forEach(m => m.items.forEach(it => { if (it.kind === 'note' && it.pitch) it.pitch = { ...it.pitch, alter: 0 }; }));
      dropped += built.dropped;
      built.measures.forEach((m, i) => {
        m.end = measureInfos[i]?.divider;
      });
      const pinfo = partInfoById.get(partNode.attrs['id'] ?? '');
      outParts.push({ clef, measures: built.measures, leadingRepeat: leading || undefined, program: percussion ? undefined : pinfo?.program, name: pinfo?.name, percussion: percussion || undefined });
    }
  });

  if (outParts.length === 0) throw new Error('불러올 수 있는 악보 파트를 찾지 못했습니다.');
  if (graceSkipped > 0) warnings.push(`꾸밈음 ${graceSkipped}개는 제외했어요.`);
  if (dropped > 0) warnings.push(`화음이나 여러 성부의 겹치는 음 ${dropped}개는 한 음만 남기고 제외했어요. (한 오선에는 한 번에 한 음만 쓸 수 있어요)`);
  if (timeChanged) warnings.push('곡 중간에 박자표가 바뀌지만 처음 박자표만 사용했어요.');

  return {
    tempo: Math.max(30, Math.min(300, tempo ?? 120)),
    beats: beats ?? 4,
    beatType: beatType ?? 4,
    pickup,
    fifths: fifths ?? 0,
    parts: outParts,
    program,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// .mxl (zip container)
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('이 브라우저는 .mxl 압축 해제를 지원하지 않습니다. 압축되지 않은 .musicxml로 저장해 주세요.');
  }
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('올바른 .mxl(zip) 파일이 아닙니다.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('손상된 .mxl 파일입니다.');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error('지원하지 않는 zip 압축 방식입니다.');
}

/** Returns the score XML inside a compressed MusicXML (.mxl) file. */
export async function extractMxl(bytes: Uint8Array): Promise<string> {
  const entries = listZip(bytes);
  const decode = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);

  let rootPath: string | undefined;
  const container = entries.find(e => e.name === 'META-INF/container.xml');
  if (container) {
    const doc = parseXml(decode(await readZipEntry(bytes, container)));
    const rootfiles = doc.children[0]?.children.find(c => c.name === 'rootfiles');
    rootPath = rootfiles?.children.find(c => c.name === 'rootfile')?.attrs['full-path'];
  }
  const target =
    entries.find(e => e.name === rootPath) ??
    entries.find(e => !e.name.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(e.name));
  if (!target) throw new Error('.mxl 안에서 악보 파일을 찾지 못했습니다.');
  return decode(await readZipEntry(bytes, target));
}
