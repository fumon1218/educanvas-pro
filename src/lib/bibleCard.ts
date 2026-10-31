/**
 * 성경 구절 카드 그리기
 *  - 'over': 한자 위에 읽는 법을 작게 (그림 카드). 두 번 누르면 괄호 글로 바뀌어 고칠 수 있다.
 *  - 그 밖에는 고칠 수 있는 글 상자.
 */
import { partsToText, type CardBg, type Passage, type RubyPart } from './bibleText';

const FONT = "'Pretendard', 'Noto Sans KR', 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
/** 카드 바탕: 노랑 · 흰색 · 투명 */
export const CARD_BGS: Record<CardBg, string> = { yellow: '#fef3c7', white: '#ffffff', none: '' };
export const CARD_HEAD = '#92400e';

export interface CardOpts { ruby: 'over' | 'paren'; numbers: boolean; bg?: CardBg }

/** 고칠 수 있는 글 (괄호 방식). 첫 줄이 머리 */
export function passagesToText(ref: string, ps: Passage[], o: CardOpts): string {
  const multi = ps.length > 1;
  const blocks = ps.map(p => {
    const body = p.verses.map(v => `${o.numbers ? `${v.n} ` : ''}${partsToText(v.parts, 'paren')}`).join(o.numbers ? '\n' : ' ');
    return multi ? `[${p.version.name}]\n${body}` : body;
  });
  const vname = multi ? '' : ` (${ps[0].version.name})`;
  return `📖 ${ref}${vname}\n${blocks.join('\n\n')}`;
}

interface Tok { t: string; rt?: string; w: number; space?: boolean; num?: boolean }

/** 읽는 법을 위에 작게 단 카드 그림. 화면보다 3배 크게 그려 확대해도 또렷하다 */
export async function renderRubyCard(ref: string, ps: Passage[], o: CardOpts, width = 640): Promise<{ url: string; w: number; h: number }> {
  try { await (document as any).fonts?.ready; } catch { /* 무시 */ }
  const S = 3, PAD = 22, FS = 22, RT = 11, HEAD = 15, LABEL = 12;
  const inner = width - PAD * 2;
  const meas = document.createElement('canvas').getContext('2d')!;
  const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;
  const tw = (s: string, px: number, bold = false) => { meas.font = font(px, bold); return meas.measureText(s).width; };

  type Line = { toks: Tok[]; ruby: boolean };
  type Block = { label?: string; lines: Line[] };
  const blocks: Block[] = [];

  for (const p of ps) {
    const ja = p.version.lang === 'ja';
    const toks: Tok[] = [];
    const pushText = (s: string) => {
      const pieces = ja ? Array.from(s) : s.split(/(\s+)/).filter(Boolean);
      for (const x of pieces) {
        if (/^\s+$/.test(x)) { toks.push({ t: ' ', w: tw(' ', FS), space: true }); continue; }
        const w = tw(x, FS);
        if (w <= inner) { toks.push({ t: x, w }); continue; }
        for (const ch of Array.from(x)) toks.push({ t: ch, w: tw(ch, FS) }); // 아주 긴 낱말은 글자 단위로
      }
    };
    const lines: Line[] = [];
    let cur: Tok[] = [], x = 0, ruby = false;
    const flush = () => { while (cur.length && cur[cur.length - 1].space) cur.pop(); lines.push({ toks: cur, ruby }); cur = []; x = 0; ruby = false; };
    const place = (t: Tok, hasRuby: boolean) => {
      if (t.space && x === 0) return;
      if (x + t.w > inner && cur.length) flush();
      if (t.space && x === 0) return;
      cur.push(t); x += t.w; ruby = ruby || hasRuby;
    };
    p.verses.forEach((v, vi) => {
      if (o.numbers && vi > 0) flush();
      else if (vi > 0) toks.push({ t: ' ', w: tw(' ', FS), space: true });
      if (o.numbers) toks.push({ t: String(v.n), w: tw(String(v.n), 13, true) + 6, num: true });
      for (const part of v.parts as RubyPart[]) {
        if (part.rt) toks.push({ t: part.t, rt: part.rt, w: Math.max(tw(part.t, FS), tw(part.rt, RT)) });
        else pushText(part.t);
      }
      for (const t of toks.splice(0)) place(t, !!t.rt);
    });
    if (cur.length) flush();
    blocks.push({ label: ps.length > 1 ? p.version.name : undefined, lines });
  }

  const LH = FS * 1.45, RH = RT + 3;
  let h = PAD + HEAD * 1.3 + 8;
  for (const b of blocks) {
    if (b.label) h += LABEL + 10;
    for (const l of b.lines) h += LH + (l.ruby ? RH : 0);
    h += 14;
  }
  h += PAD - 14;

  const c = document.createElement('canvas');
  c.width = Math.ceil(width * S); c.height = Math.ceil(h * S);
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const bg = CARD_BGS[o.bg || 'yellow'];
  if (bg) { g.fillStyle = bg; g.beginPath(); (g as any).roundRect ? (g as any).roundRect(0, 0, width, h, 14) : g.rect(0, 0, width, h); g.fill(); }
  g.textBaseline = 'alphabetic';
  let y = PAD + HEAD;
  g.fillStyle = CARD_HEAD; g.font = font(HEAD, true);
  g.fillText(`📖 ${ref}${ps.length === 1 ? ` (${ps[0].version.name})` : ''}`, PAD, y);
  y += HEAD * 0.3 + 8;
  for (const b of blocks) {
    if (b.label) { y += LABEL + 4; g.fillStyle = '#b45309'; g.font = font(LABEL, true); g.fillText(`[${b.label}]`, PAD, y); y += 6; }
    for (const l of b.lines) {
      y += (l.ruby ? RH : 0) + FS * 1.1;
      let x = PAD;
      for (const t of l.toks) {
        if (t.num) { g.fillStyle = '#b45309'; g.font = font(13, true); g.fillText(t.t, x, y - FS * 0.45); x += t.w; continue; }
        if (t.rt) {
          const bw = tw(t.t, FS), rw = tw(t.rt, RT);
          g.fillStyle = '#a16207'; g.font = font(RT);
          g.fillText(t.rt, x + (t.w - rw) / 2, y - FS * 0.95);
          g.fillStyle = '#1e293b'; g.font = font(FS);
          g.fillText(t.t, x + (t.w - bw) / 2, y);
        } else if (!t.space) {
          g.fillStyle = '#1e293b'; g.font = font(FS);
          g.fillText(t.t, x, y);
        }
        x += t.w;
      }
      y += LH - FS * 1.1;
    }
    y += 14;
  }
  return { url: c.toDataURL('image/png'), w: width, h };
}
