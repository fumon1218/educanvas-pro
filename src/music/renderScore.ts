/**
 * 악보(Score)를 SVG 그림으로 그린다. 음표·쉼표·꼬리 모양은 옥쌤 악보 사보앱(glyphs.tsx)과 같은 그림을 쓴다.
 * 오선 간격은 20px이고 한 오선의 선은 y = 60, 80, 100, 120, 140 이다.
 */
import { TPQ, durationTicks, pitchToY, expandRepeats, type Score, type ScoreItem, type Pitch, type Clef } from './score';

const RX = 11, RY = 7.6, SLANT = -22;
const INK = '#1e293b';

function ringPath(rx: number, ry: number, irx: number, iry: number, innerRotDeg: number): string {
  const phi = (innerRotDeg * Math.PI) / 180;
  const sx = irx * Math.cos(phi), sy = irx * Math.sin(phi);
  const f = (n: number) => n.toFixed(2);
  return `M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z M ${f(sx)} ${f(sy)} A ${irx} ${iry} ${innerRotDeg} 1 0 ${f(-sx)} ${f(-sy)} A ${irx} ${iry} ${innerRotDeg} 1 0 ${f(sx)} ${f(sy)} Z`;
}
const HALF_RING = ringPath(RX, RY, 8.6, 3.7, -14);
const WHOLE_RING = ringPath(13.5, 8.6, 5.4, 7.2, -62);

function flagPath(sx: number, sy: number, dir: 1 | -1): string {
  const p = (dx: number, dy: number) => `${(sx + dx).toFixed(1)} ${(sy + dir * dy).toFixed(1)}`;
  return `M ${p(-1, 0)} C ${p(1, 7)}, ${p(17, 11)}, ${p(12, 29)} C ${p(13, 18)}, ${p(5, 12)}, ${p(-1, 11)} Z`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function head(x: number, y: number, base: string): string {
  if (base === 'whole') return `<path d="${WHOLE_RING}" fill-rule="evenodd" fill="${INK}" transform="translate(${x} ${y})"/>`;
  if (base === 'half') return `<path d="${HALF_RING}" fill-rule="evenodd" fill="${INK}" transform="translate(${x} ${y}) rotate(${SLANT})"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="${INK}" transform="rotate(${SLANT} ${x} ${y})"/>`;
}

function rest(x: number, base: string): string {
  const st = `fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"`;
  if (base === 'whole') return `<rect x="${x - 12}" y="80" width="24" height="10" fill="${INK}"/>`;
  if (base === 'half') return `<rect x="${x - 12}" y="90" width="24" height="10" fill="${INK}"/>`;
  if (base === 'quarter') return `<path d="M ${x - 5} 72 L ${x + 5} 88 L ${x - 5} 102 L ${x + 4} 114 C ${x - 7} 111, ${x - 9} 124, ${x + 1} 128" stroke-width="4.6" ${st}/>`;
  const n = base === 'eighth' ? 1 : base === 'sixteenth' ? 2 : 3;
  const top = 88, gap = 17, bottom = top + (n - 1) * gap + 30;
  let s = `<line x1="${x + 6 - (n - 1) * 3}" y1="${top - 2}" x2="${x - 4 - (n - 1) * 3 - 3}" y2="${bottom + 12}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  for (let i = 0; i < n; i++) {
    const cx = x - 6 - i * 3, cy = top + i * gap;
    s += `<circle cx="${cx}" cy="${cy}" r="4" fill="${INK}"/><path d="M ${cx} ${cy} C ${cx + 5} ${cy + 3}, ${cx + 10} ${cy}, ${cx + 12} ${cy - 6}" stroke-width="2.6" ${st}/>`;
  }
  return s;
}

function ledgers(x: number, y: number): string {
  let s = '';
  for (let ly = 40; ly >= y - 1; ly -= 20) s += `<line x1="${x - 17}" y1="${ly}" x2="${x + 17}" y2="${ly}" stroke="${INK}" stroke-width="1.6"/>`;
  for (let ly = 160; ly <= y + 1; ly += 20) s += `<line x1="${x - 17}" y1="${ly}" x2="${x + 17}" y2="${ly}" stroke="${INK}" stroke-width="1.6"/>`;
  return s;
}

const ACC = { sharp: '♯', flat: '♭', natural: '♮' } as const;
const SYM_FONT = `'Noto Music','Bravura Text','Segoe UI Symbol','Apple Symbols','DejaVu Sans',serif`;

function noteItem(it: ScoreItem, x: number, clef: Clef): string {
  const base = it.duration.base;
  const pitches: Pitch[] = [it.pitch!, ...(it.also ?? [])];
  const ys = pitches.map(p => pitchToY(p, clef));
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  const up = avg > 100;
  let s = '';
  const top = Math.min(...ys), bottom = Math.max(...ys);
  s += ledgers(x, top < 60 ? top : bottom);
  if (top < 60 && bottom > 140) s += ledgers(x, bottom);
  // 2도 화음은 머리를 옆으로 비킨다
  const sorted = ys.map((y, i) => ({ y, i })).sort((a, b) => b.y - a.y);
  const offsetFor = new Map<number, number>();
  sorted.forEach((n, k) => {
    const prev = sorted[k - 1];
    const clash = prev && Math.abs(prev.y - n.y) === 10 && !offsetFor.get(prev.i);
    offsetFor.set(n.i, clash ? (up ? 2 * RX - 2 : -(2 * RX - 2)) : 0);
  });
  pitches.forEach((p, i) => {
    const y = ys[i];
    const hx = x + (offsetFor.get(i) || 0);
    s += head(hx, y, base);
    const show = i === 0 ? it.show : undefined;
    if (show) s += `<text x="${hx - 26}" y="${y + 9}" font-size="30" font-family="${SYM_FONT}" fill="${INK}" text-anchor="middle">${ACC[show]}</text>`;
    if (it.duration.dotted) s += `<circle cx="${hx + 20}" cy="${y % 20 === 0 ? y - 6 : y}" r="3.2" fill="${INK}"/>`;
  });
  if (base !== 'whole') {
    const stemX = up ? x + RX - 1.2 : x - RX + 1.2;
    const from = up ? bottom : top;
    const tip = up ? Math.min(top - 70, 100) : Math.max(bottom + 70, 100);
    s += `<line x1="${stemX}" y1="${from}" x2="${stemX}" y2="${tip}" stroke="${INK}" stroke-width="2.2"/>`;
    const flags = base === 'eighth' ? 1 : base === 'sixteenth' ? 2 : base === 'thirtysecond' ? 3 : 0;
    for (let i = 0; i < flags; i++) s += `<path d="${flagPath(stemX, tip + (up ? 1 : -1) * i * 12, up ? 1 : -1)}" fill="${INK}"/>`;
  }
  if (it.duration.tuplet) s += `<text x="${x}" y="${up ? top - 80 : bottom + 90}" font-size="15" font-style="italic" text-anchor="middle" fill="${INK}">3</text>`;
  return s;
}

const SHARP_STEPS: [string, number][] = [['F', 5], ['C', 5], ['G', 5], ['D', 5], ['A', 4], ['E', 5], ['B', 4]];
const FLAT_STEPS: [string, number][] = [['B', 4], ['E', 5], ['A', 4], ['D', 5], ['G', 4], ['C', 5], ['F', 4]];

function keySig(x: number, fifths: number, clef: Clef): { svg: string; width: number } {
  if (!fifths) return { svg: '', width: 0 };
  const list = fifths > 0 ? SHARP_STEPS : FLAT_STEPS;
  const shift = clef === 'bass' ? -2 : 0;
  let s = '';
  const n = Math.min(7, Math.abs(fifths));
  for (let i = 0; i < n; i++) {
    const [step, oct] = list[i];
    const y = pitchToY({ step: step as Pitch['step'], octave: oct + shift, alter: 0 }, clef);
    s += `<text x="${x + i * 14}" y="${y + (fifths > 0 ? 10 : 6)}" font-size="${fifths > 0 ? 30 : 32}" font-family="${SYM_FONT}" fill="${INK}">${fifths > 0 ? '♯' : '♭'}</text>`;
  }
  return { svg: s, width: n * 14 + 8 };
}

function timeSig(x: number, meter: string): string {
  const [a, b] = meter.split('/');
  const t = (v: string, y: number) => `<text x="${x}" y="${y}" font-size="44" font-weight="700" font-family="Georgia,'Times New Roman',serif" text-anchor="middle" fill="${INK}">${esc(v)}</text>`;
  return t(a, 96) + t(b, 136);
}

function clefGlyph(x: number, clef: Clef): string {
  return clef === 'bass'
    ? `<text x="${x}" y="124" font-size="100" font-family="${SYM_FONT}" fill="${INK}">𝄢</text>`
    : `<text x="${x}" y="148" font-size="170" font-family="${SYM_FONT}" fill="${INK}">𝄞</text>`;
}

export interface MeasureBox { m: number; x: number; y: number; w: number; h: number }
export interface RenderedScore {
  svg: string;
  width: number;
  height: number;
  /** 이 페이지에 있는 마디의 위치 (SVG 좌표) — 연주 따라가기 표시에 쓴다 */
  boxes: MeasureBox[];
}

const measureTicks = (items: ScoreItem[]) => items.reduce((a, it) => a + durationTicks(it.duration), 0);

/** 음표 시작 시점들 사이의 간격: 짧은 음표도 붙지 않도록 로그 비율로 넓힌다 */
const spacingWeight = (ticks: number) => 1 + Math.log2(1 + ticks / (TPQ / 4));

interface Layout {
  W: number; perLine: number; nMeasures: number; lines: number; lineStarts: number[];
  STAFF_H: number; STAFF_GAP: number; SYS_GAP: number; MARGIN: number; systemH: number;
}

function layoutOf(score: Score, opts: { perLine?: number; width?: number }): Layout {
  const parts = score.parts.filter(p => p.measures.length > 0);
  const nMeasures = Math.max(...parts.map(p => p.measures.length), 0);
  const W = opts.width ?? 1400;
  // 마디마다 필요한 너비를 재서, 줄이 찰 때까지 마디를 채운다 (악보 프로그램의 줄 나눔 방식)
  const natural: number[] = [];
  for (let m = 0; m < nMeasures; m++) {
    const set = new Set<number>([0]);
    let total = TPQ;
    parts.forEach(p => { let t = 0; (p.measures[m]?.items ?? []).forEach(it => { set.add(t); t += durationTicks(it.duration); }); total = Math.max(total, t); });
    const arr = [...set].sort((x, y) => x - y);
    natural.push((arr.reduce((acc, t, i) => acc + spacingWeight((i + 1 < arr.length ? arr[i + 1] : total) - t), 0) + 1.2) * 17);
  }
  const maxPer = Math.max(1, opts.perLine ?? 8);
  const lineStarts: number[] = [];
  const firstHeader = 104 + 110 + 44, header = 104 + 110;
  let m = 0;
  while (m < nMeasures) {
    lineStarts.push(m);
    const avail = W - 60 - (lineStarts.length === 1 ? firstHeader : header);
    let used = 0, k = 0;
    while (m < nMeasures && k < maxPer && (k === 0 || used + natural[m] <= avail)) { used += natural[m]; m++; k++; }
  }
  const perLine = maxPer;
  const multi = parts.length > 1;
  const STAFF_H = multi ? 180 : 200, STAFF_GAP = multi ? 12 : 20, SYS_GAP = multi ? 34 : 40, MARGIN = 30;
  return {
    W, perLine, nMeasures, lines: lineStarts.length, lineStarts,
    STAFF_H, STAFF_GAP, SYS_GAP, MARGIN, systemH: parts.length * STAFF_H + (parts.length - 1) * STAFF_GAP,
  };
}

/** 한 페이지(여러 줄)를 그린다 */
function renderLines(score: Score, L: Layout, lineFrom: number, lineTo: number, header: string | null, footer: string | null): RenderedScore {
  const parts = score.parts.filter(p => p.measures.length > 0);
  const { W, nMeasures, STAFF_H, STAFF_GAP, SYS_GAP, MARGIN, systemH } = L;
  const titleH = header ? 70 : 24;
  const nLines = lineTo - lineFrom;
  const H = titleH + nLines * systemH + (nLines - 1) * SYS_GAP + MARGIN + (footer ? 20 : 0);

  // 박자표가 바뀌는 마디
  const meterAt: (string | undefined)[] = [];
  let curMeter = `${score.beats}/${score.beatType}`;
  for (let m = 0; m < nMeasures; m++) {
    const changed = parts.map(p => p.measures[m]?.meter).find(Boolean);
    if (changed && changed !== curMeter) { meterAt[m] = changed; curMeter = changed; }
  }

  let body = '';
  const boxes: MeasureBox[] = [];
  if (header) body += `<text x="${W / 2}" y="46" font-size="30" font-weight="700" text-anchor="middle" font-family="'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif" fill="${INK}">${esc(header)}</text>`;
  if (header && score.tempo) body += `<text x="${MARGIN + 6}" y="${titleH - 6}" font-size="15" font-family="'Pretendard','Noto Sans KR',sans-serif" fill="#475569">♩ = ${Math.round(score.tempo)}</text>`;
  if (footer) body += `<text x="${W - MARGIN}" y="${H - 10}" font-size="14" text-anchor="end" font-family="'Pretendard','Noto Sans KR',sans-serif" fill="#94a3b8">${esc(footer)}</text>`;

  const keyW = keySig(0, score.fifths, 'treble').width;
  const CLEF_W = 104;
  for (let line = lineFrom; line < lineTo; line++) {
    const m0 = L.lineStarts[line];
    const m1 = line + 1 < L.lineStarts.length ? L.lineStarts[line + 1] : nMeasures;
    const sysTop = titleH + (line - lineFrom) * (systemH + SYS_GAP);
    const showTime = line === 0;
    const headerW = CLEF_W + keyW + (showTime ? 44 : 6);
    const x0 = MARGIN, x1 = W - MARGIN;
    const avail = x1 - (x0 + headerW);

    // 각 마디의 음표 시작 시점(모든 파트 합집합)과 간격 가중치
    const onsetsOf = (m: number) => {
      const set = new Set<number>([0]);
      let total = TPQ;
      parts.forEach(p => {
        let t = 0;
        (p.measures[m]?.items ?? []).forEach(it => { set.add(t); t += durationTicks(it.duration); });
        total = Math.max(total, t);
      });
      const arr = [...set].sort((a, b) => a - b);
      const weights = arr.map((t, i) => spacingWeight((i + 1 < arr.length ? arr[i + 1] : total) - t));
      return { arr, weights, total };
    };
    const info = Array.from({ length: m1 - m0 }, (_, i) => onsetsOf(m0 + i));
    // 줄이 짧게 끝나는 마지막 줄은 남는 자리를 비워 둔다
    const fullW = info.map((inf, i) => inf.weights.reduce((a, b) => a + b, 0) + 1.2 + (meterAt[m0 + i] ? 2 : 0));
    const lineUnits = fullW.reduce((a, b) => a + b, 0);
    // 마지막 줄이 짧으면 끝까지 늘이지 않는다
    const isLast = line === L.lineStarts.length - 1;
    const unitsForFullLine = isLast && lineUnits * 17 < avail * 0.7 ? avail / 26 : lineUnits;
    const unit = avail / unitsForFullLine;
    const mx: number[] = [x0 + headerW];
    fullW.forEach((w, i) => mx.push(mx[i] + w * unit));
    const lineEnd = mx[mx.length - 1];
    for (let m = m0; m < m1; m++) {
      boxes.push({ m, x: mx[m - m0], y: sysTop + 36, w: mx[m - m0 + 1] - mx[m - m0], h: (parts.length - 1) * (STAFF_H + STAFF_GAP) + 128 });
    }

    parts.forEach((part, pi) => {
      const top = sysTop + pi * (STAFF_H + STAFF_GAP);
      let g = '';
      for (let i = 0; i < 5; i++) g += `<line x1="${x0}" y1="${60 + i * 20}" x2="${lineEnd}" y2="${60 + i * 20}" stroke="${INK}" stroke-width="1.4"/>`;
      g += clefGlyph(x0 + 8, part.clef);
      g += keySig(x0 + CLEF_W, score.fifths, part.clef).svg;
      if (showTime) g += timeSig(x0 + CLEF_W + keyW + 18, `${score.beats}/${score.beatType}`);
      if (part.name && parts.length > 1) g += `<text x="${x0}" y="34" font-size="13" font-family="'Pretendard','Noto Sans KR',sans-serif" fill="#64748b">${esc(part.name)}</text>`;

      for (let m = m0; m < m1; m++) {
        const meas = part.measures[m];
        const inf = info[m - m0];
        const left = mx[m - m0], right = mx[m - m0 + 1];
        let innerLeft = left + 0.6 * unit;
        if (meterAt[m]) { g += timeSig(left + 22, meterAt[m]!); innerLeft += 2 * unit; }
        if (m === 0 && part.leadingRepeat) g += `<circle cx="${left + 12}" cy="90" r="3" fill="${INK}"/><circle cx="${left + 12}" cy="110" r="3" fill="${INK}"/>`;
        // 시작 시점 → x
        const xAt = new Map<number, number>();
        let cx = innerLeft + 8;
        inf.arr.forEach((t, i) => { xAt.set(t, cx); cx += inf.weights[i] * unit; });
        if (meas) {
          let t = 0;
          const xs: number[] = [];
          meas.items.forEach(it => {
            const x = xAt.get(t) ?? innerLeft;
            xs.push(x);
            if (it.kind === 'rest') g += rest(x, it.duration.base);
            else if (it.pitch) g += noteItem(it, x, part.clef);
            if (it.lyric && it.lyric !== '_') g += `<text x="${x}" y="186" font-size="17" text-anchor="middle" font-family="'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif" fill="${INK}">${esc(it.lyric)}</text>`;
            t += durationTicks(it.duration);
          });
          meas.items.forEach((it, i) => {
            if (!it.tieNext || !it.pitch) return;
            const y = pitchToY(it.pitch, part.clef);
            const xa = xs[i] + 8, xb = i + 1 < xs.length ? xs[i + 1] - 8 : right - 4;
            const dy = y > 100 ? 14 : -14;
            g += `<path d="M ${xa} ${y + dy * 0.6} Q ${(xa + xb) / 2} ${y + dy * 1.8} ${xb} ${y + dy * 0.6}" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
          });
          meas.chords?.forEach(c => {
            const cxx = innerLeft + ((right - innerLeft) * c.beat * TPQ) / Math.max(inf.total, 1);
            g += `<text x="${cxx}" y="26" font-size="18" font-weight="600" font-family="Georgia,serif" fill="${INK}">${esc(c.text)}</text>`;
          });
        }
        const end = meas?.end;
        if (end === 'final') g += `<line x1="${right - 8}" y1="60" x2="${right - 8}" y2="140" stroke="${INK}" stroke-width="1.6"/><rect x="${right - 5}" y="60" width="6" height="80" fill="${INK}"/>`;
        else if (end === 'double') g += `<line x1="${right - 6}" y1="60" x2="${right - 6}" y2="140" stroke="${INK}" stroke-width="1.6"/><line x1="${right}" y1="60" x2="${right}" y2="140" stroke="${INK}" stroke-width="1.6"/>`;
        else if (end === 'repeat_end') g += `<circle cx="${right - 16}" cy="90" r="3" fill="${INK}"/><circle cx="${right - 16}" cy="110" r="3" fill="${INK}"/><line x1="${right - 8}" y1="60" x2="${right - 8}" y2="140" stroke="${INK}" stroke-width="1.6"/><rect x="${right - 5}" y="60" width="6" height="80" fill="${INK}"/>`;
        else if (end === 'repeat_start') g += `<rect x="${right - 5}" y="60" width="6" height="80" fill="${INK}"/><line x1="${right + 3}" y1="60" x2="${right + 3}" y2="140" stroke="${INK}" stroke-width="1.6"/><circle cx="${right + 11}" cy="90" r="3" fill="${INK}"/><circle cx="${right + 11}" cy="110" r="3" fill="${INK}"/>`;
        else g += `<line x1="${right}" y1="60" x2="${right}" y2="140" stroke="${INK}" stroke-width="1.6"/>`;
      }
      body += `<g transform="translate(0 ${top})">${g}</g>`;
    });
    const yTop = sysTop + 60, yBot = sysTop + (parts.length - 1) * (STAFF_H + STAFF_GAP) + 140;
    body += `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBot}" stroke="${INK}" stroke-width="${parts.length > 1 ? 2.4 : 1.6}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width: W, height: H, boxes };
}

/** 악보 전체를 한 장으로 */
export function renderScoreSvg(score: Score, opts: { title?: string; perLine?: number; width?: number } = {}): RenderedScore {
  // (한 장짜리)
  const L = layoutOf(score, opts);
  return renderLines(score, L, 0, L.lines, opts.title ?? null, null);
}

/** 화면(16:9)에 읽기 좋게 여러 페이지로 나눈다 — 페이지마다 슬라이드 한 장 */
export function renderScorePages(score: Score, opts: { title?: string; perLine?: number; width?: number; maxHeight?: number } = {}): RenderedScore[] {
  const L = layoutOf(score, opts);
  const maxH = opts.maxHeight ?? Math.round(L.W * 0.8);
  const perPage = Math.max(1, Math.floor((maxH - 70 - L.MARGIN + L.SYS_GAP) / (L.systemH + L.SYS_GAP)));
  const nPages = Math.max(1, Math.ceil(L.lines / perPage));
  const pages: RenderedScore[] = [];
  for (let i = 0; i < nPages; i++) {
    const from = i * perPage, to = Math.min(L.lines, from + perPage);
    pages.push(renderLines(score, L, from, to, i === 0 ? opts.title ?? null : null, nPages > 1 ? `${opts.title ? opts.title + ' · ' : ''}${i + 1} / ${nPages}` : null));
  }
  return pages;
}

/** 연주 시간(초, 원래 빠르기) → 마디 번호. 도돌이표를 펼친 순서대로 */
export function measureTimeline(score: Score): { t: number; m: number }[] {
  const part = score.parts.find(p => !p.percussion && p.measures.length > 0);
  if (!part) return [];
  const spt = 60 / (score.tempo || 100) / TPQ;
  const out: { t: number; m: number }[] = [];
  let tick = 0;
  for (const meas of expandRepeats(part)) {
    out.push({ t: tick * spt, m: part.measures.indexOf(meas) });
    tick += meas.items.reduce((a, it) => a + durationTicks(it.duration), 0);
  }
  return out;
}

export function measureAt(timeline: { t: number; m: number }[], sec: number): number {
  let lo = 0, hi = timeline.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (timeline[mid].t <= sec + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans < 0 ? (timeline[0]?.m ?? -1) : timeline[ans].m;
}
