/**
 * 노트에 넣는 달력 (월간·주간) — 우리나라 공휴일 표시
 *  - 2026년 공휴일·대체공휴일·임시공휴일은 선생님의 일정 앱(edu-scheduler-premium) 표를 그대로 쓴다.
 *  - 다른 해는 무료 공휴일 API(Nager.Date, 키 필요 없음)로 채우고 이 기기에 보관한다.
 *  - 인터넷이 안 되면 날짜가 정해진 국경일·공휴일만 표시한다.
 */

export type HolidayMap = Record<string, string>; // '2026-10-03' → '개천절'

const KR_HOLIDAYS_STATIC: HolidayMap = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절', '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일(개천절)',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};
const STATIC_YEARS = new Set([2026]);

/** 날짜가 정해진 국경일·공휴일 (인터넷이 안 될 때) */
const FIXED: [string, string][] = [
  ['01-01', '신정'], ['03-01', '삼일절'], ['05-05', '어린이날'], ['06-06', '현충일'], ['07-17', '제헌절'],
  ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '성탄절'],
];
const NAME_KO: Record<string, string> = { 'Christmas Day': '성탄절', "New Year's Day": '신정' };

export const dkey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const fixedOf = (y: number): HolidayMap => Object.fromEntries(FIXED.filter(([md]) => md !== '07-17' || y >= 2026).map(([md, n]) => [`${y}-${md}`, n]));

const mem = new Map<number, Promise<HolidayMap>>();
export function holidaysOf(y: number): Promise<HolidayMap> {
  if (STATIC_YEARS.has(y)) return Promise.resolve(KR_HOLIDAYS_STATIC);
  let p = mem.get(y);
  if (p) return p;
  p = (async () => {
    const key = `okssam_holidays_KR_${y}`;
    try { const c = localStorage.getItem(key); if (c) return JSON.parse(c) as HolidayMap; } catch { /* 무시 */ }
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/KR`);
      if (!res.ok) throw new Error(String(res.status));
      const list: { date: string; localName: string; name: string }[] = await res.json();
      const map: HolidayMap = { ...fixedOf(y) };
      for (const h of list) map[h.date] = map[h.date] || NAME_KO[h.name] || h.localName || h.name;
      try { localStorage.setItem(key, JSON.stringify(map)); } catch { /* 무시 */ }
      return map;
    } catch {
      mem.delete(y); // 다음에 다시 시도
      return fixedOf(y);
    }
  })();
  mem.set(y, p);
  return p;
}

// ---------------------------------------------------------------------------
// 그리기
// ---------------------------------------------------------------------------

const FONT = "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const RED = '#dc2626', BLUE = '#2563eb', INK = '#1e293b', LINE = '#cbd5e1', SOFT = '#94a3b8';

export interface CalOpts { mondayFirst?: boolean }
export interface CalImage { url: string; w: number; h: number; label: string }

const S = 2.5;
function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
  const g = c.getContext('2d')!;
  g.scale(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  return { c, g };
}
const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;
function fitText(g: CanvasRenderingContext2D, s: string, maxW: number) {
  if (g.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
const colorOf = (dow: number, holiday: boolean) => (holiday || dow === 0 ? RED : dow === 6 ? BLUE : INK);

/** 월간 달력 (칸은 비워 두어 펜·글로 적는다) */
export async function renderMonth(y: number, m: number, o: CalOpts = {}): Promise<CalImage> {
  try { await (document as any).fonts?.ready; } catch { /* 무시 */ }
  const hol = { ...(await holidaysOf(y)) };
  const W = 1000, P = 24, HEAD = 64, WH = 34;
  const first = new Date(y, m - 1, 1).getDay();
  const lead = o.mondayFirst ? (first + 6) % 7 : first;
  const days = new Date(y, m, 0).getDate();
  const rows = Math.ceil((lead + days) / 7);
  const CH = rows > 5 ? 112 : 132;
  const cw = (W - P * 2) / 7;
  const H = P + HEAD + WH + rows * CH + P;
  const { c, g } = makeCanvas(W, H);
  g.textBaseline = 'alphabetic';
  // 머리: 2026년 11월
  g.fillStyle = INK; g.font = font(34, true);
  g.fillText(`${y}년 ${m}월`, P, P + 40);
  const tw = g.measureText(`${y}년 ${m}월`).width;
  g.fillStyle = SOFT; g.font = font(15, true);
  g.fillText(new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase(), P + tw + 14, P + 40);
  // 요일
  const order = o.mondayFirst ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const top = P + HEAD;
  g.fillStyle = '#f1f5f9'; g.fillRect(P, top, W - P * 2, WH);
  order.forEach((dow, i) => {
    g.fillStyle = colorOf(dow, false); g.font = font(15, true);
    const t = WD[dow];
    g.fillText(t, P + cw * i + cw / 2 - g.measureText(t).width / 2, top + 23);
  });
  // 칸
  const gy = top + WH;
  for (let r = 0; r < rows; r++) for (let i = 0; i < 7; i++) {
    const d = r * 7 + i - lead + 1;
    const x = P + cw * i, yy = gy + r * CH;
    if (d < 1 || d > days) { g.fillStyle = '#f8fafc'; g.fillRect(x, yy, cw, CH); continue; }
    const dow = order[i];
    const name = hol[dkey(y, m, d)];
    g.fillStyle = colorOf(dow, !!name); g.font = font(18, true);
    g.fillText(String(d), x + 9, yy + 25);
    if (name) {
      g.font = font(12, true); g.fillStyle = RED;
      g.fillText(fitText(g, name, cw - 14), x + 9, yy + 43);
    }
  }
  // 선
  g.strokeStyle = LINE; g.lineWidth = 1;
  g.beginPath();
  for (let r = 0; r <= rows; r++) { g.moveTo(P, gy + r * CH); g.lineTo(W - P, gy + r * CH); }
  for (let i = 0; i <= 7; i++) { g.moveTo(P + cw * i, top); g.lineTo(P + cw * i, gy + rows * CH); }
  g.moveTo(P, top); g.lineTo(W - P, top);
  g.stroke();
  return { url: c.toDataURL('image/png'), w: W, h: H, label: `${y}년 ${m}월 달력` };
}

/** 그 주의 첫날 */
export function weekStart(date: Date, mondayFirst = false) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = mondayFirst ? (d.getDay() + 6) % 7 : d.getDay();
  d.setDate(d.getDate() - back);
  return d;
}

/** 주간 계획표: 하루 한 줄씩 (날짜·요일·공휴일 + 적는 칸) */
export async function renderWeek(start: Date, o: CalOpts = {}): Promise<CalImage> {
  try { await (document as any).fonts?.ready; } catch { /* 무시 */ }
  const ds = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const years = [...new Set(ds.map(d => d.getFullYear()))];
  const hol: HolidayMap = Object.assign({}, ...(await Promise.all(years.map(holidaysOf))));
  const W = 1000, P = 24, HEAD = 64, RH = 104, LW = 150;
  const H = P + HEAD + RH * 7 + P;
  const { c, g } = makeCanvas(W, H);
  const a = ds[0], z = ds[6];
  const title = `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}일 – ${z.getMonth() + 1}월 ${z.getDate()}일`;
  g.fillStyle = INK; g.font = font(28, true); g.fillText(title, P, P + 38);
  const top = P + HEAD;
  ds.forEach((d, i) => {
    const yy = top + i * RH;
    const name = hol[dkey(d.getFullYear(), d.getMonth() + 1, d.getDate())];
    const col = colorOf(d.getDay(), !!name);
    g.fillStyle = name || d.getDay() === 0 ? '#fef2f2' : d.getDay() === 6 ? '#eff6ff' : '#f8fafc';
    g.fillRect(P, yy, LW, RH);
    g.fillStyle = col; g.font = font(30, true); g.fillText(String(d.getDate()), P + 14, yy + 42);
    g.font = font(15, true); g.fillText(`${WD[d.getDay()]}요일`, P + 14 + g.measureText(String(d.getDate())).width * 2 + 10, yy + 40);
    g.font = font(12); g.fillStyle = SOFT; g.fillText(`${d.getMonth() + 1}월`, P + 14, yy + 62);
    if (name) { g.font = font(13, true); g.fillStyle = RED; g.fillText(fitText(g, name, LW - 24), P + 14, yy + 84); }
    // 적는 줄
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 1; g.setLineDash([3, 4]);
    g.beginPath();
    for (let k = 1; k < 3; k++) { g.moveTo(P + LW + 12, yy + (RH / 3) * k); g.lineTo(W - P - 12, yy + (RH / 3) * k); }
    g.stroke(); g.setLineDash([]);
  });
  g.strokeStyle = LINE; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= 7; i++) { g.moveTo(P, top + i * RH); g.lineTo(W - P, top + i * RH); }
  g.moveTo(P, top); g.lineTo(P, top + RH * 7); g.moveTo(P + LW, top); g.lineTo(P + LW, top + RH * 7); g.moveTo(W - P, top); g.lineTo(W - P, top + RH * 7);
  g.stroke();
  return { url: c.toDataURL('image/png'), w: W, h: H, label: `${a.getMonth() + 1}/${a.getDate()} 주간 계획` };
}
