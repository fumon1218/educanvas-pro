/**
 * 교양 · 따라 쓰기 종이
 *  한자·천자문·사자성어는 네모 칸에, 영어·스페인어는 영어 4선에, 일본어는 밑줄 칸에,
 *  특수교육법은 줄 공책에 흐린 글씨를 깔아 두고 그 위에 펜으로 따라 쓴다.
 *  종이는 잠긴 배경 그림(쪽 번호 달림)이라 [쪽 넘기기]·[내보내기]가 공책과 똑같이 된다.
 */
import * as fabric from 'fabric';
import { serializeCanvas } from '../canvasData';
import { PAPER_W, PAPER_H } from '../templates';
import { GRAMMAR_ITEMS } from './grammar';
import { loadStudyData, type StudyData } from './studyData';

export type TraceDeck = 'saja' | 'cheonja' | 'hanja' | 'en' | 'grammar' | 'ja' | 'es' | 'esw' | 'law';
type Kind = 'char' | 'phrase' | 'word' | 'sentence' | 'text';

export interface TraceDeckDef { id: TraceDeck; label: string; kind: Kind; /** 한 쪽에 들어가는 개수 (법 조문은 길이에 따라 다름) */ perPage: number; items: (d: StudyData) => any[] }
export const TRACE_DECKS: TraceDeckDef[] = [
  { id: 'hanja', label: '한자 1800', kind: 'char', perPage: 12, items: d => d.hanja },
  { id: 'cheonja', label: '천자문', kind: 'phrase', perPage: 9, items: d => d.cheonja },
  { id: 'saja', label: '사자성어', kind: 'phrase', perPage: 9, items: d => d.saja },
  { id: 'en', label: '영어 단어', kind: 'word', perPage: 9, items: d => d.en },
  { id: 'esw', label: '스페인어 단어', kind: 'word', perPage: 9, items: d => d.esw },
  { id: 'grammar', label: '영문법 예문', kind: 'sentence', perPage: 5, items: () => GRAMMAR_ITEMS },
  { id: 'es', label: '스페인어 문장', kind: 'sentence', perPage: 5, items: d => d.es },
  { id: 'ja', label: '일본어 문장', kind: 'sentence', perPage: 5, items: d => d.ja },
  { id: 'law', label: '특수교육법', kind: 'text', perPage: 2, items: d => d.law },
];
export const traceDeckDef = (id: string) => TRACE_DECKS.find(d => d.id === id);
/** 한 노트에 만드는 쪽 수 한도 (노트 파일이 너무 커지지 않게) */
export const TRACE_MAX_PAGES = 8;

/** 'accuse      어큐스' → 낱말 · 한글 발음 */
const splitWord = (w: string) => { const [word, ...rest] = String(w).split(/\s{2,}/); return { word: word.trim(), pron: rest.join(' ').trim() }; };

/** 항목 미리 보기 글자 */
export const tracePreview = (deck: TraceDeck, x: any): string => {
  switch (deck) {
    case 'hanja': return x.c;
    case 'cheonja': case 'saja': return x.h;
    case 'en': case 'esw': return splitWord(x.w).word;
    case 'grammar': return x.en;
    case 'es': case 'ja': return x.t;
    case 'law': return `${x.no}(${x.t})`;
  }
};

export interface TraceOpts {
  deck: TraceDeck;
  /** 이 항목들만 (카드 학습에서 거른 목록) */
  ids?: string[];
  /** 1부터 */
  start?: number;
  count?: number;
  /** 외운 것 빼기 */
  todoOnly?: boolean;
}

const KNOWN_KEY = 'okssam_culture_known';
const knownIds = (deck: string): Set<string> => { try { return new Set((JSON.parse(localStorage.getItem(KNOWN_KEY) || '{}') || {})[deck] || []); } catch { return new Set(); } };

/** 고른 범위의 항목 */
export function traceItems(data: StudyData, o: TraceOpts): any[] {
  const def = traceDeckDef(o.deck);
  if (!def) return [];
  const all = def.items(data);
  if (o.ids) { const want = new Set(o.ids); return all.filter((x: any) => want.has(x.id)); }
  const known = o.todoOnly ? knownIds(o.deck) : null;
  const from = Math.max(0, (o.start || 1) - 1);
  return all.slice(from).filter((x: any) => !known || !known.has(x.id)).slice(0, Math.max(1, o.count || def.perPage));
}

// ---------------------------------------------------------------------------
// 그리기 (A4 세로 1240 × 1754)
// ---------------------------------------------------------------------------
const SANS = "'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const SERIF = "'Noto Serif KR', 'Noto Serif CJK KR', 'Noto Serif JP', 'Source Han Serif K', 'AppleMyungjo', 'Batang', 'Hiragino Mincho ProN', serif";
const LATIN = "'Helvetica Neue', Arial, 'Pretendard', sans-serif";
const JA = "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic', 'Meiryo', 'Pretendard', sans-serif";
const M = 90, X1 = PAPER_W - M, W = X1 - M;
const TOP = 140, BOTTOM = PAPER_H - 70;
/** 따라 쓰기 글씨 진하기: 첫째 · 둘째 · 셋째 */
const TRACE = ['#a3acb9', '#cfd5dd', '#e5e9ee'];
const INK = '#1e293b', SUB = '#64748b', GUIDE = '#94a3b8', FAINT = '#e2e8f0';

type G = CanvasRenderingContext2D;
interface Row { h: number; draw: (c: G, y: number) => void }

const font = (c: G, size: number, fam: string, bold = false) => { c.font = `${bold ? 'bold ' : ''}${size}px ${fam}`; };
const hline = (c: G, x0: number, x1: number, y: number, color: string, w = 1.5, dash?: number[]) => { c.save(); c.strokeStyle = color; c.lineWidth = w; if (dash) c.setLineDash(dash); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.restore(); };
/** 글이 너비를 넘으면 … */
const fit = (c: G, t: string, w: number) => { if (c.measureText(t).width <= w) return t; let s = t; while (s.length > 1 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };

/** 네모 칸 (가운데 십자 점선) */
function square(c: G, x: number, y: number, s: number) {
  c.save();
  c.strokeStyle = FAINT; c.lineWidth = 1.2; c.setLineDash([6, 6]);
  c.beginPath(); c.moveTo(x + s / 2, y + 4); c.lineTo(x + s / 2, y + s - 4); c.moveTo(x + 4, y + s / 2); c.lineTo(x + s - 4, y + s / 2); c.stroke();
  c.restore();
  c.strokeStyle = GUIDE; c.lineWidth = 1.5; c.strokeRect(x, y, s, s);
}
function charIn(c: G, ch: string, x: number, y: number, s: number, color: string, k = 0.78) {
  font(c, Math.round(s * k), SERIF);
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(ch, x + s / 2, y + s / 2 + s * 0.03);
  c.textAlign = 'left';
}

/** 영어 4선 (위·가운데 점선·바닥선 빨강·아래) */
function fourLines(c: G, x0: number, x1: number, y: number, gap: number) {
  hline(c, x0, x1, y, '#cbd5e1');
  hline(c, x0, x1, y + gap, '#dbe3ec', 1.2, [8, 7]);
  hline(c, x0, x1, y + gap * 2, '#fca5a5', 1.8);
  hline(c, x0, x1, y + gap * 3, '#cbd5e1');
}

/** 4선에 맞는 글자 크기: 소문자 키(x)가 한 칸, 긴 글자(l)는 맨 윗줄을 넘지 않게 */
function latinSize(c: G, gap: number): number {
  font(c, 100, LATIN);
  const xh = c.measureText('x').actualBoundingBoxAscent || 52;
  const asc = c.measureText('l').actualBoundingBoxAscent || 72;
  return Math.floor(Math.min(100 * gap * 1.02 / xh, 100 * gap * 1.95 / asc));
}

/** 글을 너비에 맞게 줄 나누기 (띄어쓰기 단위, 너무 긴 낱말은 글자 단위) */
function wrap(c: G, text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const tok of para.split(/(\s+)/)) {
      if (!tok) continue;
      const next = cur + tok;
      if (c.measureText(next).width <= w) { cur = next; continue; }
      if (cur.trim()) out.push(cur.trimEnd());
      cur = tok.trimStart();
      while (c.measureText(cur).width > w) {
        let i = cur.length;
        while (i > 1 && c.measureText(cur.slice(0, i)).width > w) i--;
        out.push(cur.slice(0, i)); cur = cur.slice(i);
      }
    }
    out.push(cur.trimEnd());
  }
  return out;
}

function rowsFor(deck: TraceDeck, items: any[], hanjaHun: Map<string, string>, c: G): Row[] {
  const def = traceDeckDef(deck)!;
  const rows: Row[] = [];
  if (def.kind === 'char') {
    const info = 170, s = 110, gap = 18;
    for (const x of items) rows.push({
      h: s + gap,
      draw: (g, y) => {
        g.strokeStyle = GUIDE; g.lineWidth = 1.5; g.strokeRect(M, y, info, s);
        g.fillStyle = '#f8fafc'; g.fillRect(M + 1, y + 1, info - 2, s - 2);
        font(g, 58, SERIF); g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(x.c, M + info / 2, y + 44);
        font(g, 21, SANS, true); g.fillStyle = SUB; g.fillText(fit(g, `${x.hun} ${x.e}`, info - 12), M + info / 2, y + 92);
        g.textAlign = 'left';
        for (let i = 0; i < 8; i++) {
          const bx = M + info + i * s;
          square(g, bx, y, s);
          if (i < 3) charIn(g, x.c, bx, y, s, TRACE[i]);
        }
      },
    });
  } else if (def.kind === 'phrase') {
    const s = 88, head = 34, gap = 18;
    for (const x of items) {
      const chars = Array.from(String(x.h)).slice(0, 4);
      const reading = Array.from(String(x.r || ''));
      rows.push({
        h: head + s + 22 + gap,
        draw: (g, y) => {
          font(g, 22, SANS, true); g.fillStyle = INK; g.textBaseline = 'alphabetic';
          const lead = `${x.h}  ${x.r}`;
          g.fillText(lead, M, y + 24);
          const lw = g.measureText(lead).width;
          font(g, 20, SANS); g.fillStyle = SUB;
          g.fillText(fit(g, `· ${x.m}`, W - lw - 16), M + lw + 14, y + 24);
          for (let i = 0; i < 12; i++) {
            const bx = M + i * s, by = y + head;
            square(g, bx, by, s);
            const k = Math.floor(i / 4), ch = chars[i % 4];
            if (k < 2 && ch) charIn(g, ch, bx, by, s, TRACE[k]);
            // 첫 묶음 아래에 음(또는 훈음)
            if (k === 0 && ch) {
              const hun = x.hun?.[i % 4] || (hanjaHun.get(ch) ? `${hanjaHun.get(ch)} ${reading[i % 4] || ''}` : reading[i % 4] || '');
              font(g, 15, SANS); g.fillStyle = SUB; g.textAlign = 'center'; g.textBaseline = 'top';
              g.fillText(fit(g, hun, s - 4), bx + s / 2, by + s + 4);
              g.textAlign = 'left';
            }
          }
        },
      });
    }
  } else if (def.kind === 'word') {
    const G4 = 36, head = 30, gap = 26;
    for (const x of items) {
      const { word, pron } = splitWord(x.w);
      const meaning = [pron, x.k || x.d || ''].filter(Boolean).join(' · ');
      rows.push({
        h: head + G4 * 3 + gap,
        draw: (g, y) => {
          font(g, 21, SANS, true); g.fillStyle = INK; g.textBaseline = 'alphabetic';
          g.fillText(word, M, y + 22);
          const ww = g.measureText(word).width;
          font(g, 19, SANS); g.fillStyle = SUB;
          g.fillText(fit(g, `· ${meaning}`, W - ww - 16), M + ww + 12, y + 22);
          const top = y + head;
          fourLines(g, M, X1, top, G4);
          // 바닥선에 맞춰 흐린 글씨를 두세 번 (나머지는 빈칸)
          let fs = latinSize(g, G4);
          font(g, fs, LATIN);
          let w1 = g.measureText(word).width;
          if (w1 > W * 0.6) { fs = Math.floor(fs * (W * 0.6) / w1); font(g, fs, LATIN); w1 = g.measureText(word).width; }
          const copies = Math.max(1, Math.min(3, Math.floor((W * 0.68) / (w1 + 44))));
          g.textBaseline = 'alphabetic';
          for (let i = 0; i < copies; i++) { g.fillStyle = TRACE[Math.min(i, 2)]; g.fillText(word, M + 10 + i * (w1 + 44), top + G4 * 2); }
        },
      });
    }
  } else if (def.kind === 'sentence') {
    const ja = deck === 'ja';
    const G4 = 32, head = 30, gap = 30, band = G4 * 3;
    for (const x of items) {
      const text = String(deck === 'grammar' ? x.en : x.t);
      const meaning = deck === 'grammar' ? x.ko : x.k;
      const sub = deck === 'ja' ? [x.kana, x.p].filter(Boolean).join(' · ') : deck === 'es' ? x.p : x.lesson;
      rows.push({
        h: head + band + 16 + band + gap,
        draw: (g, y) => {
          font(g, 21, SANS, true); g.fillStyle = INK; g.textBaseline = 'alphabetic';
          g.fillText(fit(g, meaning || '', W * 0.6), M, y + 22);
          const mw = Math.min(g.measureText(meaning || '').width, W * 0.6);
          if (sub) { font(g, 18, SANS); g.fillStyle = SUB; g.fillText(fit(g, `· ${sub}`, W - mw - 16), M + mw + 12, y + 22); }
          const b1 = y + head, b2 = b1 + band + 16;
          for (const b of [b1, b2]) {
            if (ja) { hline(g, M, X1, b + band, '#cbd5e1', 1.8); hline(g, M, X1, b + 6, '#eef2f6', 1.2, [8, 7]); }
            else fourLines(g, M, X1, b, G4);
          }
          // 위 줄: 흐린 글씨 따라 쓰기 · 아래 줄: 보고 쓰기
          let fs = ja ? 64 : latinSize(g, G4);
          const fam = ja ? JA : LATIN;
          font(g, fs, fam);
          const tw = g.measureText(text).width;
          if (tw > W - 20) { fs = Math.floor(fs * (W - 20) / tw); font(g, fs, fam); }
          g.fillStyle = TRACE[0]; g.textBaseline = 'alphabetic';
          g.fillText(text, M + 10, ja ? b1 + band - 12 : b1 + G4 * 2);
        },
      });
    }
  } else {
    // 특수교육법: 조문을 줄 공책에 흐리게 (줄마다 한 줄)
    const LH = 62, fs = 30;
    font(c, fs, SANS);
    for (const x of items) {
      rows.push({
        h: LH,
        draw: (g, y) => {
          hline(g, M, X1, y + LH - 8, '#e2e8f0', 1.5);
          font(g, 26, SANS, true); g.fillStyle = INK; g.textBaseline = 'alphabetic';
          const head = `${x.no} (${x.t})`;
          g.fillText(head, M, y + LH - 18);
          const hw = g.measureText(head).width;
          font(g, 19, SANS); g.fillStyle = SUB; g.fillText(fit(g, x.ch || '', W - hw - 20), M + hw + 14, y + LH - 18);
        },
      });
      for (const ln of wrap(c, x.x, W - 10)) rows.push({
        h: LH,
        draw: (g, y) => { hline(g, M, X1, y + LH - 8, '#e2e8f0', 1.5); font(g, fs, SANS); g.fillStyle = TRACE[0]; g.textBaseline = 'alphabetic'; g.fillText(ln, M + 6, y + LH - 18); },
      });
      rows.push({ h: LH, draw: (g, y) => hline(g, M, X1, y + LH - 8, '#e2e8f0', 1.5) });
    }
  }
  return rows;
}

/** 줄들을 쪽으로 나눈다 */
function paginate(rows: Row[]): Row[][] {
  const pages: Row[][] = [];
  let cur: Row[] = [], h = 0;
  for (const r of rows) {
    if (h + r.h > BOTTOM - TOP && cur.length) { pages.push(cur); cur = []; h = 0; }
    cur.push(r); h += r.h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function drawPage(rows: Row[], title: string, no: number, total: number): string {
  const el = document.createElement('canvas');
  el.width = PAPER_W; el.height = PAPER_H;
  const c = el.getContext('2d')!;
  c.fillStyle = '#fff'; c.fillRect(0, 0, PAPER_W, PAPER_H);
  // 머리: 제목 · 이름 · 날짜 · 쪽
  c.fillStyle = '#e11d48'; c.fillRect(M, 66, 8, 36);
  font(c, 32, SANS, true); c.fillStyle = INK; c.textBaseline = 'middle'; c.fillText(title, M + 22, 85);
  font(c, 20, SANS); c.fillStyle = SUB; c.textAlign = 'right';
  c.fillText(`이름 ____________   날짜 ________   ${no} / ${total}`, X1, 86);
  c.textAlign = 'left';
  hline(c, M, X1, 124, '#cbd5e1', 2);
  let y = TOP;
  for (const r of rows) { r.draw(c, y); y += r.h; }
  return el.toDataURL('image/png');
}

/** 따라 쓰기 노트 (첫 슬라이드 데이터 · 이름) */
export async function buildTraceScene(o: TraceOpts, width: number): Promise<{ data: string; name: string; pages: number; items: number; cut: number }> {
  const data = await loadStudyData();
  const def = traceDeckDef(o.deck);
  if (!def) throw new Error('학습 자료를 찾을 수 없습니다.');
  const items = traceItems(data, o);
  if (!items.length) throw new Error('따라 쓸 항목이 없습니다.');
  try { await (document as any).fonts?.ready; } catch { /* 무시 */ }
  const hanjaHun = new Map<string, string>(data.hanja.map(h => [h.c, h.hun]));
  const meas = document.createElement('canvas').getContext('2d')!;
  let pages = paginate(rowsFor(o.deck, items, hanjaHun, meas));
  // 쪽 수 한도: 넘치면 앞에서부터 한도만큼
  let used = items.length;
  if (pages.length > TRACE_MAX_PAGES) {
    pages = pages.slice(0, TRACE_MAX_PAGES);
    if (def.kind !== 'text') used = pages.reduce((n, p) => n + p.length, 0);
    else { used = 0; let left = pages.reduce((n, p) => n + p.length, 0); const ctx = meas; font(ctx, 30, SANS); for (const x of items) { const need = wrap(ctx, x.x, W - 10).length + 2; if (need > left) break; left -= need; used++; } used = Math.max(1, used); }
  }
  const first = items[0], last = items[used - 1];
  const num = (x: any) => def.items(data).indexOf(x) + 1;
  const range = used === 1 ? `${num(first)}` : `${num(first)}~${num(last)}`;
  const title = `${def.label} 따라 쓰기`;

  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height: 800, enableRetinaScaling: false });
  const pageW = Math.min(Math.max(400, width - 100), 1000);
  const k = pageW / PAPER_W, left = (width - pageW) / 2;
  const notebook = def.kind === 'char' || def.kind === 'phrase' ? 'grid' : 'lined';
  for (let i = 0; i < pages.length; i++) {
    const img = await fabric.FabricImage.fromURL(drawPage(pages[i], title, i + 1, pages.length));
    img.scale(k);
    img.set({
      originX: 'left', originY: 'top', left, top: 40 + i * (PAPER_H * k + 40), selectable: false, evented: false,
      lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
      shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.18)', blur: 20, offsetX: 0, offsetY: 5 }),
    });
    Object.assign(img as any, { id: Math.random().toString(36).slice(2, 11), locked: true, isBackground: true, pageNo: i + 1, notebook });
    sc.add(img);
  }
  const out = serializeCanvas(sc);
  sc.dispose();
  return { data: out, name: `${title} · ${range}`, pages: pages.length, items: used, cut: items.length - used };
}
