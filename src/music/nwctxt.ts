// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/nwctxt.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// NoteWorthy Composer text format (.nwctxt) import / export.
// Kept free of React so it can be unit-tested on its own.

export type NwcAccidental = 'none' | 'sharp' | 'flat' | 'natural';

export interface NwcPitch {
  name: string;
  y: number;
  freq: number;
}

export interface NwcElement {
  tie?: boolean;
  id: string;
  x: number;
  y: number;
  staffIndex?: number;
  type: string;
  pitch?: NwcPitch;
  accidental?: NwcAccidental;
  dotted?: boolean;
}

export interface NwcScore {
  elements: NwcElement[];
  clefs: ('treble' | 'bass')[];
  stavesCount: number;
  tempo?: number;
  timeSignature?: string;
  /** staff names from |AddStaff|Name:"..." */
  partNames?: string[];
}

export interface NwcPitchTables {
  treble: NwcPitch[];
  bass: NwcPitch[];
}

// App duration prefix  <->  nwctxt duration name
const DUR_TO_NWC: Record<string, string> = {
  whole: 'Whole',
  half: 'Half',
  quarter: '4th',
  eighth: '8th',
  sixteenth: '16th',
  thirtysecond: '32nd',
};

const NWC_TO_DUR: Record<string, string> = {
  whole: 'whole',
  half: 'half',
  '2nd': 'half',
  '4th': 'quarter',
  quarter: 'quarter',
  '8th': 'eighth',
  eighth: 'eighth',
  '16th': 'sixteenth',
  sixteenth: 'sixteenth',
  '32nd': 'thirtysecond',
  thirtysecond: 'thirtysecond',
  // 64th has no counterpart in the app; it is approximated by the shortest value.
  '64th': 'thirtysecond',
};

const ACC_TO_NWC: Record<string, string> = { sharp: '#', flat: 'b', natural: 'n' };
const NWC_TO_ACC: Record<string, NwcAccidental> = {
  '#': 'sharp',
  b: 'flat',
  n: 'natural',
  // Older exports of this app used these characters.
  '^': 'sharp',
  _: 'flat',
  '=': 'natural',
};

let idCounter = 0;
const newId = () => `nwc-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

// "4th,Dotted" -> basic value "4th" plus whether a dot is present.
// Double dots are approximated by a single dot (the app has no double dots).
const splitDuration = (raw: string): { key: string; dotted: boolean } => {
  const parts = raw.split(',').map(p => p.trim().toLowerCase());
  return {
    key: parts[0],
    dotted: parts.slice(1).some(p => p === 'dotted' || p === 'dbldotted'),
  };
};

const field = (line: string, name: string): string | undefined => {
  const m = line.match(new RegExp(`\\|${name}:([^|]*)`));
  return m ? m[1] : undefined;
};

export interface NwcExportInput {
  elements: NwcElement[];
  tempo: number;
  timeSignature: string;
  stavesCount: number;
  clefs: ('treble' | 'bass')[];
}

export function exportNWCTXT(input: NwcExportInput): string {
  const { elements, tempo, timeSignature, stavesCount, clefs } = input;
  let text = '!NoteWorthyComposer(2.75)\n';

  for (let s = 0; s < stavesCount; s++) {
    text += `|AddStaff|Name:"Staff ${s + 1}"\n`;
    text += `|Clef|Type:${clefs[s] === 'bass' ? 'Bass' : 'Treble'}\n`;
    if (s === 0) {
      text += `|TimeSig|Signature:${timeSignature}\n`;
      text += `|Tempo|Tempo:${tempo}|Base:Quarter\n`;
    }

    const staffElements = elements
      .filter(el => (el.staffIndex || 0) === s)
      .sort((a, b) => a.x - b.x);

    for (const el of staffElements) {
      if (el.type.endsWith('_note')) {
        const dur = DUR_TO_NWC[el.type.split('_')[0]] + (el.dotted ? ',Dotted' : '');
        const pos = Math.round((100 - el.y) / 10);
        const acc = el.accidental ? ACC_TO_NWC[el.accidental] ?? '' : '';
        text += `|Note|Dur:${dur}|Pos:${acc}${pos}\n`;
      } else if (el.type.endsWith('_rest')) {
        const dur = DUR_TO_NWC[el.type.split('_')[0]] + (el.dotted ? ',Dotted' : '');
        text += `|Rest|Dur:${dur}\n`;
      } else if (el.type === 'barline') {
        text += '|Bar|\n';
      } else if (el.type === 'double_barline') {
        text += '|Bar|Style:Double\n';
      } else if (el.type === 'repeat_start') {
        text += '|Bar|Style:MasterRepeatOpen\n';
      } else if (el.type === 'repeat_end') {
        text += '|Bar|Style:MasterRepeatClose\n';
      } else if (el.type === 'final_barline') {
        text += '|Bar|Style:SectionClose\n';
      }
    }
  }
  return text;
}

const nearestPitch = (table: NwcPitch[], y: number): NwcPitch => {
  let best = table[0];
  let min = Infinity;
  for (const p of table) {
    const d = Math.abs(y - p.y);
    if (d < min) {
      min = d;
      best = p;
    }
  }
  return best;
};

export function parseNWCTXT(text: string, tables: NwcPitchTables): NwcScore {
  const lines = text.split(/\r?\n/);
  const elements: NwcElement[] = [];
  const clefs: ('treble' | 'bass')[] = ['treble'];
  let currentX = 135;
  let currentStaff = 0;
  let staffStarted = false;
  let maxStaff = 0;
  let tempo: number | undefined;
  let timeSignature: string | undefined;
  const partNames: string[] = [];

  for (let raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;

    if (line.startsWith('|AddStaff|')) {
      // Real files begin with |AddStaff| for the first staff, so only
      // advance from the second one onward.
      if (staffStarted) {
        currentStaff++;
        maxStaff = Math.max(maxStaff, currentStaff);
      }
      staffStarted = true;
      currentX = 135;
      if (!clefs[currentStaff]) clefs[currentStaff] = 'treble';
      const nm = line.match(/\|Name:"([^"]*)"/);
      partNames[currentStaff] = nm && !/^Staff \d+$/i.test(nm[1]) ? nm[1] : '';
    } else if (line.startsWith('|Clef|')) {
      const type = field(line, 'Type');
      if (type) clefs[currentStaff] = type.toLowerCase() === 'bass' ? 'bass' : 'treble';
    } else if (line.startsWith('|Note|') || line.startsWith('|Chord|')) {
      const durRaw = field(line, 'Dur');
      const posRaw = field(line, 'Pos');
      if (!durRaw || !posRaw) continue;

      const { key: durKey, dotted } = splitDuration(durRaw);
      const dur = NWC_TO_DUR[durKey] ?? 'quarter';
      const table = clefs[currentStaff] === 'bass' ? tables.bass : tables.treble;

      // A chord lists several positions; each becomes a note at the same x.
      for (const part of posRaw.split(',')) {
        const m = part.trim().match(/^([#bnxv^_=]?)(-?\d+)/);
        if (!m) continue;
        const accChar = m[1] === 'x' ? '#' : m[1] === 'v' ? 'b' : m[1];
        const accidental: NwcAccidental = accChar ? NWC_TO_ACC[accChar] ?? 'none' : 'none';
        const pitch = nearestPitch(table, 100 - parseInt(m[2], 10) * 10);
        elements.push({
          id: newId(),
          x: currentX,
          y: pitch.y,
          staffIndex: currentStaff,
          type: `${dur}_note`,
          pitch,
          accidental,
          dotted: dotted || undefined,
          tie: part.trim().slice(m[0].length).includes('^') || undefined,
        });
      }
      currentX += 50;
    } else if (line.startsWith('|Rest|')) {
      const durRaw = field(line, 'Dur');
      if (!durRaw) continue;
      const { key: restKey, dotted: restDotted } = splitDuration(durRaw);
      const dur = NWC_TO_DUR[restKey] ?? 'quarter';
      elements.push({
        id: newId(),
        x: currentX,
        y: 100,
        staffIndex: currentStaff,
        type: `${dur}_rest`,
        dotted: restDotted || undefined,
      });
      currentX += 50;
    } else if (line.startsWith('|Bar|')) {
      const style = field(line, 'Style') ?? 'Single';
      let type = 'barline';
      if (style === 'MasterRepeatOpen' || style === 'LocalRepeatOpen') type = 'repeat_start';
      else if (style === 'MasterRepeatClose' || style === 'LocalRepeatClose') type = 'repeat_end';
      else if (style === 'Double') type = 'double_barline';
      else if (style === 'SectionClose') type = 'final_barline';
      elements.push({ id: newId(), x: currentX, y: 100, staffIndex: currentStaff, type });
      currentX += 50;
    } else if (line.startsWith('|TimeSig|')) {
      const sig = field(line, 'Signature');
      if (sig && currentStaff === 0 && !timeSignature) {
        timeSignature = sig === 'Common' ? '4/4' : sig === 'AllaBreve' ? '2/2' : sig;
      }
    } else if (line.startsWith('|Tempo|')) {
      const t = field(line, 'Tempo');
      if (t && currentStaff === 0 && tempo === undefined) {
        const n = parseInt(t, 10);
        if (!Number.isNaN(n)) tempo = n;
      }
    }
  }

  return {
    elements,
    clefs,
    stavesCount: maxStaff + 1,
    tempo,
    timeSignature,
    partNames,
  };
}
