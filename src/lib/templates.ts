/**
 * 노트 양식 (공간별)
 *  수업: 빈 슬라이드 · 줄 공책 · 모눈 공책
 *  학생: 스터디 플래너 · 코넬 공부 노트 · 줄 공책 (+ 오답 노트)
 *  설교: 설교 노트 (날짜·설교자·본문·제목 / 대지 1·2·3 / 적용 / 기도 제목)
 *  업무: 회의록 (일시·장소·참석자·안건 / 논의 / 결정 사항 / 할 일) · 업무 일지
 *
 * 양식은 '종이'(잠긴 배경 그림, 세로로 이어 붙임) + 타자로 채우는 칸(글상자) + 체크 목록으로 만든다.
 * 종이는 쪽 번호(pageNo)를 달아 PDF처럼 PageDown·쪽 번호로 넘기고, [+ 쪽]으로 늘린다.
 */
import * as fabric from 'fabric';
import { serializeCanvas } from './canvasData';
import type { Space } from './projectStore';

export type PaperStyle = 'lined' | 'grid' | 'blank' | 'cornell' | 'sermon' | 'meeting' | 'worklog' | 'planner';
export interface TemplateDef { id: string; space: Space; label: string; desc: string; paper?: PaperStyle; name: (d: Date) => string }

const md = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
export const TEMPLATES: TemplateDef[] = [
  { id: 'blank', space: 'lesson', label: '빈 슬라이드', desc: '지금까지처럼 무한 캔버스 슬라이드', name: () => '새 수업' },
  { id: 'lined', space: 'lesson', label: '줄 공책', desc: '세로로 이어지는 줄 공책 · 판서 노트', paper: 'lined', name: d => `판서 노트 · ${md(d)}` },
  { id: 'grid', space: 'lesson', label: '모눈 공책', desc: '수학·도형 풀이용', paper: 'grid', name: d => `모눈 노트 · ${md(d)}` },
  { id: 'planner', space: 'student', label: '스터디 플래너', desc: '날짜·D-day·목표, 할 일 체크, 10분 타임테이블, 총 공부 시간', paper: 'planner', name: d => `스터디 플래너 · ${md(d)}` },
  { id: 'cornell', space: 'student', label: '코넬 공부 노트', desc: '왼쪽 키워드·질문, 오른쪽 필기, 아래 요약', paper: 'cornell', name: d => `공부 노트 · ${md(d)}` },
  { id: 'lined', space: 'student', label: '줄 공책', desc: '자유롭게 쓰는 공책', paper: 'lined', name: d => `공책 · ${md(d)}` },
  { id: 'sermon', space: 'sermon', label: '설교 노트', desc: '날짜·설교자·예배·본문·제목 칸 + 자유롭게 쓰는 줄 공간', paper: 'sermon', name: d => `설교 노트 · ${md(d)}` },
  { id: 'lined', space: 'sermon', label: '줄 공책', desc: '자유 묵상·성경 공부', paper: 'lined', name: d => `묵상 노트 · ${md(d)}` },
  { id: 'meeting', space: 'work', label: '회의록', desc: '일시·참석자·안건, 논의, 결정 사항, 할 일', paper: 'meeting', name: d => `회의록 · ${md(d)}` },
  { id: 'worklog', space: 'work', label: '업무 일지', desc: '오늘 할 일, 한 일, 내일 할 일, 메모', paper: 'worklog', name: d => `업무 일지 · ${md(d)}` },
  { id: 'lined', space: 'work', label: '줄 공책', desc: '자유 메모', paper: 'lined', name: d => `업무 메모 · ${md(d)}` },
];
export const templatesFor = (space: Space) => TEMPLATES.filter(t => t.space === space);

// ---------------------------------------------------------------------------
// 종이 그리기 (A4 세로, 1240 × 1754 px)
// ---------------------------------------------------------------------------

export const PAPER_W = 1240, PAPER_H = 1754;
const KFONT = "'Pretendard', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const M = 90; // 바깥 여백

type Field = { key: string; label?: string; x: number; y: number; w: number; h: number; ph: string; size?: number; checklist?: 'todo' | 'prayer'; first?: boolean };
interface Layout { draw: (c: CanvasRenderingContext2D) => void; fields: Field[] }

const line = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color = '#cbd5e1', w = 2) => { c.strokeStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
const label = (c: CanvasRenderingContext2D, t: string, x: number, y: number, size = 26, color = '#64748b', bold = true) => { c.fillStyle = color; c.font = `${bold ? 'bold ' : ''}${size}px ${KFONT}`; c.textBaseline = 'top'; c.fillText(t, x, y); };
const ruled = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, gap = 56) => { for (let y = y0 + gap; y < y1; y += gap) line(c, x0, y, x1, y, '#e2e8f0', 2); };
const box = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => { c.strokeStyle = '#cbd5e1'; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 14); c.stroke(); };
/** 머리 칸: [이름표 | 쓰는 곳] 여러 개 */
const headerRow = (c: CanvasRenderingContext2D, y: number, cells: { t: string; w: number }[], h = 74) => {
  let x = M;
  const W = PAPER_W - M * 2;
  box(c, M, y, W, h);
  cells.forEach((cell, i) => {
    const cw = W * cell.w;
    c.fillStyle = '#f1f5f9'; c.fillRect(x + 2, y + 2, 120, h - 4);
    label(c, cell.t, x + 18, y + h / 2 - 14, 26);
    if (i > 0) line(c, x, y, x, y + h);
    line(c, x + 122, y, x + 122, y + h, '#e2e8f0');
    x += cw;
  });
};
const headerFields = (y: number, cells: { t: string; w: number; key: string; ph: string }[], h = 74): Field[] => {
  let x = M;
  const W = PAPER_W - M * 2;
  return cells.map(cell => { const cw = W * cell.w; const f = { key: cell.key, label: cell.t, x: x + 136, y: y + 16, w: cw - 150, h: h - 24, ph: cell.ph }; x += cw; return f; });
};
const section = (c: CanvasRenderingContext2D, t: string, y: number, h: number, color = '#4f46e5') => {
  c.fillStyle = color; c.fillRect(M, y, 8, 34);
  label(c, t, M + 22, y + 2, 30, '#1e293b');
  ruled(c, M, y + 44, PAPER_W - M, y + h);
};

function layoutOf(style: PaperStyle, first: boolean): Layout {
  const W = PAPER_W - M * 2;
  switch (style) {
    case 'lined': return { draw: c => { line(c, M + 70, 60, M + 70, PAPER_H - 60, '#fca5a5', 2); ruled(c, 0, 80, PAPER_W, PAPER_H - 60, 64); }, fields: [] };
    case 'grid': return { draw: c => { for (let x = 40; x < PAPER_W; x += 40) line(c, x, 40, x, PAPER_H - 40, '#e2e8f0', 1.5); for (let y = 40; y < PAPER_H; y += 40) line(c, 40, y, PAPER_W - 40, y, '#e2e8f0', 1.5); }, fields: [] };
    case 'blank': return { draw: () => {}, fields: [] };
    case 'cornell': {
      const top = first ? 200 : 80, cue = M + W * 0.3, sumY = PAPER_H - 360;
      return {
        draw: c => {
          if (first) headerRow(c, 80, [{ t: '과목', w: 0.35 }, { t: '주제', w: 0.45 }, { t: '날짜', w: 0.2 }]);
          line(c, cue, top, cue, sumY, '#94a3b8', 3);
          line(c, M, sumY, PAPER_W - M, sumY, '#94a3b8', 3);
          label(c, '키워드 · 질문', M + 6, top + 10, 24, '#94a3b8');
          label(c, '필기', cue + 20, top + 10, 24, '#94a3b8');
          label(c, '요약 (오늘 배운 것 한두 줄)', M + 6, sumY + 14, 24, '#94a3b8');
          ruled(c, cue + 10, top + 40, PAPER_W - M, sumY, 60);
          ruled(c, M, sumY + 40, PAPER_W - M, PAPER_H - 80, 60);
        },
        fields: first ? headerFields(80, [{ t: '과목', w: 0.35, key: 'subject', ph: '예: 생명과학' }, { t: '주제', w: 0.45, key: 'title', ph: '단원·주제' }, { t: '날짜', w: 0.2, key: 'date', ph: '' }]) : [],
      };
    }
    case 'sermon': {
      if (!first) return layoutOf('lined', false);
      const y0 = 80;
      return {
        draw: c => {
          label(c, '설교 노트', M, y0 - 6, 40, '#1e293b');
          headerRow(c, y0 + 60, [{ t: '날짜', w: 0.34 }, { t: '설교자', w: 0.33 }, { t: '예배', w: 0.33 }]);
          headerRow(c, y0 + 134, [{ t: '본문', w: 1 }]);
          headerRow(c, y0 + 208, [{ t: '제목', w: 1 }]);
          // 아래는 자유롭게 쓰는 줄 공간 (대지·적용·기도 제목 칸 없음)
          ruled(c, M, 330, PAPER_W - M, PAPER_H - 60, 56);
        },
        fields: [
          ...headerFields(y0 + 60, [{ t: '날짜', w: 0.34, key: 'date', ph: '' }, { t: '설교자', w: 0.33, key: 'preacher', ph: '설교자' }, { t: '예배', w: 0.33, key: 'service', ph: '주일 오전' }]),
          ...headerFields(y0 + 134, [{ t: '본문', w: 1, key: 'passage', ph: '예: 로마서 8:28-30' }]),
          ...headerFields(y0 + 208, [{ t: '제목', w: 1, key: 'title', ph: '설교 제목' }]),
        ],
      };
    }
    case 'meeting': {
      if (!first) return layoutOf('lined', false);
      const y0 = 80;
      return {
        draw: c => {
          label(c, '회의록', M, y0 - 6, 40, '#1e293b');
          headerRow(c, y0 + 60, [{ t: '일시', w: 0.5 }, { t: '장소', w: 0.5 }]);
          headerRow(c, y0 + 134, [{ t: '참석자', w: 1 }]);
          headerRow(c, y0 + 208, [{ t: '안건', w: 1 }]);
          section(c, '논의 내용', 380, 560);
          section(c, '결정 사항', 960, 300, '#059669');
          section(c, '할 일 (담당 @이름 · 기한 ~11/5)', 1280, 400, '#dc2626');
        },
        fields: [
          ...headerFields(y0 + 60, [{ t: '일시', w: 0.5, key: 'date', ph: '' }, { t: '장소', w: 0.5, key: 'place', ph: '장소' }]),
          ...headerFields(y0 + 134, [{ t: '참석자', w: 1, key: 'attendees', ph: '참석자' }]),
          ...headerFields(y0 + 208, [{ t: '안건', w: 1, key: 'title', ph: '안건' }]),
          { key: 'decisions', label: '결정 사항', x: M + 10, y: 1010, w: W - 20, h: 230, ph: '결정한 내용을 적으세요' },
          { key: 'todo', x: M + 10, y: 1330, w: W - 20, h: 330, ph: '', checklist: 'todo' },
        ],
      };
    }
    case 'planner': {
      // 한 쪽 = 하루. [+ 쪽]을 누르면 다음 날 쪽이 같은 모양으로 붙는다
      const y0 = 70, colR = M + W * 0.5 + 16, tTop = 340, HOURS = 19, rowH = 64; // 6시 ~ 24시
      const tW = PAPER_W - M - colR, hourW = 64, cellW = (tW - hourW) / 6;
      const tBottom = tTop + 44 + HOURS * rowH;
      const leftR = M + W * 0.5 - 16;
      return {
        draw: c => {
          label(c, '스터디 플래너', M, y0 - 6, 40, '#1e293b');
          headerRow(c, y0 + 60, [{ t: '날짜', w: 0.6 }, { t: 'D-day', w: 0.4 }]);
          headerRow(c, y0 + 134, [{ t: '목표', w: 1 }]);
          // 왼쪽: 할 일
          c.fillStyle = '#4f46e5'; c.fillRect(M, tTop, 8, 34);
          label(c, '오늘 할 일 · 과목', M + 22, tTop + 2, 28, '#1e293b');
          ruled(c, M, tTop + 44, leftR, 1270, 56);
          // 왼쪽 아래: 총 공부 시간, 한 줄 평가
          box(c, M, 1300, leftR - M, 110);
          label(c, '총 공부 시간', M + 20, 1320, 24, '#64748b');
          c.fillStyle = '#64748b'; c.font = `bold 34px ${KFONT}`; c.textBaseline = 'top';
          c.fillText('시간          분', leftR - 290, 1350);
          box(c, M, 1430, leftR - M, tBottom - 1430);
          label(c, '오늘의 한 줄 (잘한 점 · 아쉬운 점)', M + 20, 1446, 22, '#94a3b8');
          ruled(c, M + 10, 1470, leftR - 10, tBottom - 10, 56);
          // 오른쪽: 10분 타임테이블
          label(c, '타임테이블 (10분 칸에 색칠)', colR, tTop + 4, 24, '#64748b');
          const gy = tTop + 44;
          c.fillStyle = '#f8fafc'; c.fillRect(colR, gy, hourW, HOURS * rowH);
          for (let h = 0; h < HOURS; h++) {
            const hr = (6 + h) % 24 || 24;
            label(c, String(hr === 24 ? 24 : hr), colR + 14, gy + h * rowH + rowH / 2 - 13, 24, hr >= 12 && hr < 18 ? '#475569' : '#64748b');
          }
          for (let h = 0; h <= HOURS; h++) line(c, colR, gy + h * rowH, PAPER_W - M, gy + h * rowH, '#cbd5e1', 2);
          for (let k = 0; k <= 6; k++) line(c, colR + hourW + cellW * k, gy, colR + hourW + cellW * k, gy + HOURS * rowH, k === 3 ? '#cbd5e1' : '#e2e8f0', k === 3 ? 2 : 1.5);
          line(c, colR, gy, colR, gy + HOURS * rowH, '#cbd5e1', 2);
          line(c, PAPER_W - M, gy, PAPER_W - M, gy + HOURS * rowH, '#cbd5e1', 2);
        },
        fields: [
          ...headerFields(y0 + 60, [{ t: '날짜', w: 0.6, key: 'date', ph: '' }, { t: 'D-day', w: 0.4, key: 'dday', ph: '' }]),
          ...headerFields(y0 + 134, [{ t: '목표', w: 1, key: 'goal', ph: '' }]),
          { key: 'todo', x: M + 10, y: tTop + 54, w: leftR - M - 20, h: 860, ph: '', checklist: 'todo' },
          { key: 'total', label: '총 공부 시간', x: M + 20, y: 1352, w: 200, h: 44, ph: '' },
        ],
      };
    }
    case 'worklog': {
      if (!first) return layoutOf('lined', false);
      const y0 = 80;
      return {
        draw: c => {
          label(c, '업무 일지', M, y0 - 6, 40, '#1e293b');
          headerRow(c, y0 + 60, [{ t: '날짜', w: 1 }]);
          section(c, '오늘 할 일', 240, 440, '#dc2626');
          section(c, '한 일 · 진행 상황', 700, 420);
          section(c, '내일 할 일', 1140, 280, '#d97706');
          section(c, '메모', 1440, 240, '#64748b');
        },
        fields: [
          ...headerFields(y0 + 60, [{ t: '날짜', w: 1, key: 'date', ph: '' }]),
          { key: 'todo', x: M + 10, y: 290, w: W - 20, h: 370, ph: '', checklist: 'todo' },
          { key: 'tomorrow', x: M + 10, y: 1190, w: W - 20, h: 220, ph: '', checklist: 'todo' },
        ],
      };
    }
  }
}

const paperCache = new Map<string, string>();
/** 종이 그림 (data URL) */
export function paperImage(style: PaperStyle, first: boolean): string {
  const k = `${style}|${first}`;
  const hit = paperCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = PAPER_W; c.height = PAPER_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PAPER_W, PAPER_H);
  layoutOf(style, first).draw(ctx);
  const url = c.toDataURL('image/png');
  paperCache.set(k, url);
  return url;
}

const newId = () => Math.random().toString(36).slice(2, 11);
const todayText = (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;

/** 체크 목록 글상자 (할 일·기도 제목): 줄마다 ☐/☑ */
export function makeChecklist(kind: 'todo' | 'prayer', left: number, top: number, width: number, fontSize: number, text = '☐ ') {
  const t = new fabric.Textbox(text, {
    left, top, width, originX: 'left', originY: 'top', fontSize, lineHeight: 1.35,
    fill: '#0f172a', fontFamily: KFONT, splitByGrapheme: false,
  });
  (t as any).id = newId();
  (t as any).checklist = kind;
  return t;
}

/** 쪽 하나(종이 + 칸들)를 캔버스에 놓는다 */
async function addPaper(sc: fabric.StaticCanvas | fabric.Canvas, style: PaperStyle, first: boolean, pageNo: number, left: number, top: number, pageW: number, date: Date) {
  const img = await fabric.FabricImage.fromURL(paperImage(style, first));
  const k = pageW / PAPER_W;
  img.scale(k);
  img.set({
    originX: 'left', originY: 'top', left, top, selectable: false, evented: false,
    lockMovementX: true, lockMovementY: true, lockRotation: true, lockScalingX: true, lockScalingY: true,
    shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.18)', blur: 20, offsetX: 0, offsetY: 5 }),
  });
  Object.assign(img as any, { id: newId(), locked: true, isBackground: true, pageNo, notebook: style });
  sc.add(img);
  for (const f of layoutOf(style, first).fields) {
    const fs = Math.round((f.size || 30) * k * 10) / 10;
    if (f.checklist) {
      sc.add(makeChecklist(f.checklist, left + f.x * k, top + f.y * k, f.w * k, fs));
      continue;
    }
    // 칸은 비워 둔다 (날짜만 오늘로). 펜으로 쓰거나, 선택 도구로 칸을 두 번 눌러 타자로 적는다
    // 설교 노트는 날짜도 비워 둔다 (자유롭게 쓰기). 플래너의 다음 쪽은 다른 날이므로 비워 둔다
    const isDate = f.key === 'date' && style !== 'sermon' && (first || style !== 'planner');
    const t = new fabric.Textbox(isDate ? todayText(date) : '', {
      left: left + f.x * k, top: top + f.y * k, width: f.w * k, originX: 'left', originY: 'top', fontSize: fs,
      fill: '#0f172a', fontFamily: KFONT,
    });
    Object.assign(t as any, { id: newId(), field: f.key, fieldLabel: f.label });
    sc.add(t);
  }
  return img.getScaledHeight();
}

/** 양식으로 새 노트의 첫 슬라이드 데이터 */
export async function buildTemplateScene(t: TemplateDef, width: number, date = new Date()): Promise<string | null> {
  if (!t.paper) return null;
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width, height: 800, enableRetinaScaling: false });
  const pageW = Math.min(Math.max(400, width - 100), 1000);
  await addPaper(sc, t.paper, true, 1, (width - pageW) / 2, 40, pageW, date);
  const out = serializeCanvas(sc);
  sc.dispose();
  return out;
}

/** 공책 슬라이드에 쪽 하나를 아래에 더한다 (같은 종이, 머리 칸 없이). 새 쪽 번호를 돌려준다 */
export async function appendPaper(canvas: fabric.Canvas): Promise<number | null> {
  const pages = canvas.getObjects().filter((o: any) => o.notebook && o.pageNo != null).sort((a: any, b: any) => a.top - b.top) as any[];
  const last = pages[pages.length - 1];
  if (!last) return null;
  const style: PaperStyle = last.notebook === 'sermon' || last.notebook === 'meeting' || last.notebook === 'worklog' ? 'lined' : last.notebook;
  const pageW = last.getScaledWidth();
  const top = last.top + last.getScaledHeight() + 32;
  const pageNo = Math.max(...pages.map(p => p.pageNo)) + 1;
  const before = canvas.getObjects().length;
  await addPaper(canvas, style, false, pageNo, last.left, top, pageW, new Date());
  // 새 종이는 맨 뒤(다른 판서 아래)로
  const added = canvas.getObjects().slice(before);
  added.filter((o: any) => o.isBackground).forEach(o => canvas.sendObjectToBack(o));
  canvas.requestRenderAll();
  return pageNo;
}

// ---------------------------------------------------------------------------
// 성경 구절
// ---------------------------------------------------------------------------

export const BOOKS: [string, string[], string][] = [
  ['창세기', ['창', '창세기'], 'gen'], ['출애굽기', ['출', '출애굽기'], 'exo'], ['레위기', ['레', '레위기'], 'lev'], ['민수기', ['민', '민수기'], 'num'], ['신명기', ['신', '신명기'], 'deu'],
  ['여호수아', ['수', '여호수아'], 'jos'], ['사사기', ['삿', '사사기'], 'jdg'], ['룻기', ['룻', '룻기'], 'rut'], ['사무엘상', ['삼상', '사무엘상'], '1sa'], ['사무엘하', ['삼하', '사무엘하'], '2sa'],
  ['열왕기상', ['왕상', '열왕기상'], '1ki'], ['열왕기하', ['왕하', '열왕기하'], '2ki'], ['역대상', ['대상', '역대상'], '1ch'], ['역대하', ['대하', '역대하'], '2ch'], ['에스라', ['스', '에스라'], 'ezr'],
  ['느헤미야', ['느', '느헤미야'], 'neh'], ['에스더', ['에', '에스더'], 'est'], ['욥기', ['욥', '욥기'], 'job'], ['시편', ['시', '시편'], 'psa'], ['잠언', ['잠', '잠언'], 'pro'],
  ['전도서', ['전', '전도서'], 'ecc'], ['아가', ['아', '아가'], 'sng'], ['이사야', ['사', '이사야'], 'isa'], ['예레미야', ['렘', '예레미야'], 'jer'], ['예레미야애가', ['애', '예레미야애가'], 'lam'],
  ['에스겔', ['겔', '에스겔'], 'ezk'], ['다니엘', ['단', '다니엘'], 'dan'], ['호세아', ['호', '호세아'], 'hos'], ['요엘', ['욜', '요엘'], 'jol'], ['아모스', ['암', '아모스'], 'amo'],
  ['오바댜', ['옵', '오바댜'], 'oba'], ['요나', ['욘', '요나'], 'jnh'], ['미가', ['미', '미가'], 'mic'], ['나훔', ['나', '나훔'], 'nam'], ['하박국', ['합', '하박국'], 'hab'],
  ['스바냐', ['습', '스바냐'], 'zep'], ['학개', ['학', '학개'], 'hag'], ['스가랴', ['슥', '스가랴'], 'zec'], ['말라기', ['말', '말라기'], 'mal'],
  ['마태복음', ['마', '마태복음', '마태'], 'mat'], ['마가복음', ['막', '마가복음', '마가'], 'mrk'], ['누가복음', ['눅', '누가복음', '누가'], 'luk'], ['요한복음', ['요', '요한복음'], 'jhn'], ['사도행전', ['행', '사도행전'], 'act'],
  ['로마서', ['롬', '로마서'], 'rom'], ['고린도전서', ['고전', '고린도전서'], '1co'], ['고린도후서', ['고후', '고린도후서'], '2co'], ['갈라디아서', ['갈', '갈라디아서'], 'gal'], ['에베소서', ['엡', '에베소서'], 'eph'],
  ['빌립보서', ['빌', '빌립보서'], 'php'], ['골로새서', ['골', '골로새서'], 'col'], ['데살로니가전서', ['살전', '데살로니가전서'], '1th'], ['데살로니가후서', ['살후', '데살로니가후서'], '2th'], ['디모데전서', ['딤전', '디모데전서'], '1ti'],
  ['디모데후서', ['딤후', '디모데후서'], '2ti'], ['디도서', ['딛', '디도서'], 'tit'], ['빌레몬서', ['몬', '빌레몬서'], 'phm'], ['히브리서', ['히', '히브리서'], 'heb'], ['야고보서', ['약', '야고보서'], 'jas'],
  ['베드로전서', ['벧전', '베드로전서'], '1pe'], ['베드로후서', ['벧후', '베드로후서'], '2pe'], ['요한일서', ['요일', '요한일서', '요한1서'], '1jn'], ['요한이서', ['요이', '요한이서', '요한2서'], '2jn'], ['요한삼서', ['요삼', '요한삼서', '요한3서'], '3jn'],
  ['유다서', ['유', '유다서'], 'jud'], ['요한계시록', ['계', '요한계시록', '계시록'], 'rev'],
];

/** '롬 8:28-30', '로마서 8장 28절' → { book: '로마서', code: 'rom', chap: 8, ref: '로마서 8:28-30' } */
export function parseBibleRef(input: string): { book: string; code: string; chap: number; ref: string; bookNo: number; from?: number; to?: number } | null {
  const s = input.trim().replace(/\s+/g, ' ');
  const m = s.match(/^([1-3]?\s?[가-힣]+)\s*(\d+)\s*(?:장|:)?\s*(\d+)?\s*(?:절)?\s*(?:[-~]\s*(\d+)\s*(?:절)?)?$/);
  if (!m) return null;
  const name = m[1].replace(/\s/g, '');
  const hit = BOOKS.find(([full, abbr]) => full === name || abbr.includes(name));
  if (!hit) return null;
  const chap = Number(m[2]);
  const ref = `${hit[0]} ${chap}${m[3] ? `:${m[3]}${m[4] ? `-${m[4]}` : ''}` : '장'}`;
  return { book: hit[0], code: hit[2], chap, ref, bookNo: BOOKS.indexOf(hit) + 1, from: m[3] ? Number(m[3]) : undefined, to: m[4] ? Number(m[4]) : undefined };
}

/** 대한성서공회 성경 읽기 페이지 (개역개정) */
export const bibleUrl = (code: string, chap: number) => `https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=${code}&chap=${chap}`;
