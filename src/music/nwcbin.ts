// 출처: fumon1218/sheet-music-app (옥쌤 악보 사보앱) src/nwcbin.ts — 옥쌤보드에서 악보 읽기·재생에 그대로 사용
// Binary NoteWorthy Composer files (.nwc, versions 1.7x - 2.0x, optionally "[NWZ]" zlib-compressed)
// converted to NWCTXT text, which the rest of the app already understands.
// Layout follows the public description in music21's noteworthy/binaryTranslate.

export const isNwcBinary = (b: Uint8Array): boolean => {
  const head = String.fromCharCode(...b.slice(0, 21));
  return head.startsWith('[NWZ]') || head.startsWith('[NoteWorthy ArtWare]');
};

const inflate = async (data: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축된 NWC 파일을 풀 수 없습니다. 최신 Chrome/Safari를 사용해 주세요.');
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  void w.write(data as unknown as BufferSource).catch(() => {});
  void w.close().catch(() => {});
  // Some files carry extra bytes after the zlib stream: the stream then errors at its very end,
  // after all the real data came out. Keep what was produced instead of failing.
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
      total += (value as Uint8Array).length;
    }
  } catch (e) {
    if (total === 0) throw e;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};

const DUR = ['Whole', 'Half', '4th', '8th', '16th', '32nd', '64th'];
// diatonic step number (C0 = 0) of the middle line for each clef type: treble, bass, alto, tenor
const MIDDLE = [34, 22, 28, 26];

class R {
  p = 0;
  constructor(public d: Uint8Array, private cp: TextDecoder) {}
  u8() { return this.d[this.p++]; }
  i8() { const v = this.d[this.p++]; return v > 127 ? v - 256 : v; }
  u16() { const v = this.d[this.p] | (this.d[this.p + 1] << 8); this.p += 2; return v; }
  skip(n: number) { this.p += n; }
  str() {
    let e = this.p;
    while (e < this.d.length && this.d[e] !== 0) e++;
    const s = this.cp.decode(this.d.subarray(this.p, e));
    this.p = e + 1;
    return s;
  }
}

/** `writtenPitch`: ignore octave-shifted clefs (treble 8va/8vb) so notes sit where a player reads them, instead of at sounding pitch. */
export async function nwcBinaryToText(input: Uint8Array, opts: { writtenPitch?: boolean } = {}): Promise<string> {
  let d = input;
  if (String.fromCharCode(...d.slice(0, 5)) === '[NWZ]') d = await inflate(d.subarray(6));
  let cp: TextDecoder;
  try { cp = new TextDecoder('euc-kr'); } catch { cp = new TextDecoder(); }
  const r = new R(d, cp);
  if (r.str() !== '[NoteWorthy ArtWare]') throw new Error('NWC 파일 형식이 아닙니다.');
  r.str(); r.str(); r.str();
  const version = r.u16(); // 0x0114 ... 0x0201
  const v = version >= 0x200 ? 200 : version >= 0x14b ? 175 : version >= 0x146 ? 170 : version >= 0x132 ? 150 : 130;
  if (v < 170) throw new Error('너무 오래된 NWC 버전(1.7 미만)은 지원하지 않습니다. NoteWorthy Composer에서 새 버전으로 저장해 주세요.');
  r.skip(4);
  r.str(); r.str(); r.skip(10);
  r.str(); r.str();                 // title, author
  if (v >= 200) r.str();            // lyricist
  r.str(); r.str(); r.str();        // copyright x2, comment
  r.u8(); r.u8(); r.skip(5); r.u8(); r.skip(1); r.u16();
  r.str(); r.skip(1); r.skip(2);    // margins
  r.skip(32); r.u8();               // group visibility, layering
  if (v >= 200) r.str();            // notation typeface
  r.u16();                          // staff height
  const fonts = v > 170 ? 12 : 10;
  for (let i = 0; i < fonts; i++) { r.str(); r.skip(4); }
  r.u8(); r.u8(); r.u16();
  if (v >= 200) r.skip(1);
  const staves = r.u8(); r.skip(1);

  let out = '!NoteWorthyComposer(2.75)\n';
  let tempoDone = false, timeDone = false;
  for (let si = 0; si < staves; si++) {
    const sName = r.str();
    let sLabel = '';
    if (v >= 200) { sLabel = r.str(); r.str(); }
    r.str();
    let lyrics = 0;
    if (v >= 200) {
      r.skip(27); r.u8(); r.u16(); r.u16(); r.u16(); r.u16(); r.u8(); r.u16(); lyrics = r.u16();
    } else {
      r.skip(11); r.u8(); r.skip(10); r.i8(); r.skip(6); r.u16(); lyrics = r.u16();
    }
    if (lyrics > 0) { r.u16(); r.u16(); }
    for (let i = 0; i < lyrics; i++) {
      const bs = r.u16();
      if (bs > 0) { r.u16(); const start = r.p; r.u16(); for (let c = 0; c < 1000; c++) if (r.str() === '') break; r.p = start + bs; }
    }
    if (lyrics > 0) r.u16();
    r.u16();
    const n = r.u16() - 2;
    const voice: Record<string, string> = { SPO: '소프라노', SOP: '소프라노', SOPRANO: '소프라노', ALTO: '알토', TEN: '테너', TENOR: '테너', BASS: '베이스', BAS: '베이스' };
    const label = voice[sLabel.trim().toUpperCase()] ?? (sName.trim() || `Staff ${si + 1}`);
    out += `|AddStaff|Name:"${label.replace(/"/g, "'")}"\n`;

    let clef = 0, shift = 0;
    let sharps = 0, flats = 0;
    let memo = new Map<number, string>();   // diatonic step -> accidental, valid until the bar
    let clefText = '';
    const emitClef = () => {
      // the app only knows treble and bass; C clefs are written as treble (the step numbers still match)
      clefText = `|Clef|Type:${clef === 1 ? 'Bass' : 'Treble'}\n`;
      out += clefText;
    };
    emitClef();
    let tieAt = -1, tieStep = 0;   // a tie mark waiting for the next note's pitch to confirm it
    const readNote = (): { dur: number; dots: string; pos: string; hidden: boolean; step: number; tied: boolean } | null => {
      const dur = r.u8(); r.skip(1); r.u8(); const b3 = r.u8(); const a0 = r.u8(); const a1 = r.u8();
      const raw = r.i8(); const a2 = r.u8();
      if (a2 & 0x40) r.u8();
      if (a1 & 0x20) return null;       // grace note
      const step = MIDDLE[clef] - raw + (shift === 1 ? 7 : shift === 2 ? -7 : 0);
      const letter = ((step % 7) + 7) % 7;               // C D E F G A B -> 0..6
      const bit = 1 << ((letter + 2) % 7);               // NWC key masks start at A
      const explicit = ['#', 'b', 'n', 'x', 'v', ''][a2 & 7] ?? '';
      let acc = explicit;
      if (!acc) acc = memo.get(step) ?? (sharps & bit ? '#' : flats & bit ? 'b' : '');
      else memo.set(step, acc);
      const shown = acc === 'n' ? '' : acc;
      const pos = step - (clef === 1 ? 22 : 34);
      const dots = a0 & 4 ? ',Dotted' : a0 & 1 ? ',DblDotted' : '';
      // Three attribute flags each mark a note that is followed by the same pitch ~3/4 of the time (a tie or a slur
      // between equal pitches, which sounds the same); the caller only joins notes when the next pitch really is equal.
      const tied = (a0 & 0x10) !== 0 || (a0 & 0x02) !== 0 || (b3 & 0x01) !== 0;
      return { dur, dots, pos: `${shown}${pos}`, hidden: (a0 & 0x80) !== 0, step, tied };
    };
    // chord (10) / chord with a rest (18): a header (duration, dots) followed by one object per member;
    // a member can itself be a chord (hidden helper notes)
    const readChord = (): { dur: number; a0: number; poss: string[] } => {
      const dur = r.u8(); r.skip(1); r.u8(); r.skip(1); const a0 = r.u8(); r.u8(); r.i8(); const a2 = r.u8();
      if (a2 & 0x40) r.u8();
      const count = r.u16();
      const poss: string[] = [];
      for (let m = 0; m < count; m++) {
        const mt = r.u16(); r.u8();
        if (mt === 8) { const nt = readNote(); if (nt && !nt.hidden) poss.push(nt.pos); }
        else if (mt === 9) { r.u8(); r.skip(5); r.u16(); }
        else if (mt === 10 || mt === 18) { const sub = readChord(); if (!(sub.a0 & 0x80)) poss.push(...sub.poss); }
        else throw new Error(`알 수 없는 NWC 화음 항목(${mt})을 만났습니다.`);
      }
      return { dur, a0, poss };
    };
    for (let k = 0; k < n; k++) {
      // some files have a stray byte after certain items: resync when the type is out of range but the next byte starts a valid one
      if ((r.d[r.p] | (r.d[r.p + 1] << 8)) > 18 && (r.d[r.p + 1] | (r.d[r.p + 2] << 8)) <= 18) r.p += 1;
      const t = r.u16(); r.u8();
      switch (t) {
        case 0: clef = r.u16(); shift = opts.writtenPitch ? (r.u16(), 0) : r.u16(); if (clef > 3) clef = 0; emitClef(); break;
        case 1: { flats = r.u8(); r.skip(1); sharps = r.u8(); r.skip(7); memo = new Map(); break; }
        case 2: { const st = r.u8(); r.u8(); memo = new Map(); out += `|Bar|${st === 1 ? 'Style:Double' : st === 2 ? 'Style:SectionClose' : st === 3 ? 'Style:MasterRepeatOpen' : st === 4 ? 'Style:MasterRepeatClose' : ''}\n`; break; }
        case 3: r.u8(); r.u8(); break;
        case 4: r.skip(8); break;
        case 5: { const num = r.u16(); const bits = r.u16(); r.u16(); if (!timeDone) { out += `|TimeSig|Signature:${num}/${2 ** bits}\n`; if (si === 0) timeDone = true; } break; }
        case 6: { r.u8(); r.u8(); const val = r.u16(); r.u8(); r.str(); if (si === 0 && !tempoDone) { tempoDone = true; out += `|Tempo|Tempo:${val}|Base:Quarter\n`; } break; }
        case 7: r.skip(7); break;
        case 8: {
          const nt = readNote();
          if (nt && !nt.hidden) {
            if (tieAt >= 0 && tieStep === nt.step) { out = `${out.slice(0, tieAt)}^${out.slice(tieAt)}`; }
            out += `|Note|Dur:${DUR[nt.dur] ?? '4th'}${nt.dots}|Pos:${nt.pos}\n`;
            tieAt = nt.tied ? out.length - 1 : -1;
            tieStep = nt.step;
          }
          break;
        }
        case 9: { tieAt = -1; const dur = r.u8(); r.skip(5); r.u16(); out += `|Rest|Dur:${DUR[dur] ?? '4th'}\n`; break; }
        case 10: case 18: {
          const ch = readChord();
          tieAt = -1;
          const dots = ch.a0 & 4 ? ',Dotted' : ch.a0 & 1 ? ',DblDotted' : '';
          if (ch.poss.length) out += `|Chord|Dur:${DUR[ch.dur] ?? '4th'}${dots}|Pos:${ch.poss.join(',')}\n`;
          else if (t === 18) out += `|Rest|Dur:${DUR[ch.dur] ?? '4th'}${dots}\n`;
          break;
        }
        case 11: r.skip(3); break;
        case 12: r.u8(); r.u8(); r.u16(); break;
        case 13: r.u8(); r.u8(); r.skip(31); break;
        case 14: r.skip(4); break;
        case 15: case 16: r.skip(3); break;
        case 17: r.u8(); r.u8(); r.u8(); r.str(); break;
        default: throw new Error(`알 수 없는 NWC 항목(${t})을 만났습니다.`);
      }
    }
  }
  return out;
}
