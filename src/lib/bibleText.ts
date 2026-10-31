/**
 * 성경 본문 불러오기 — 선생님의 성경 앱(global-bible-pro)이 올려 둔 본문 파일을 그대로 쓴다.
 *  - 번역본마다 한 파일(약 1.5~2.6MB)을 처음 한 번만 받고, 그 뒤에는 이 기기에 보관한 것을 쓴다.
 *  - 국한문·일본어의 한자 읽는 법(<ruby>)은 조각(RubyPart)으로 돌려주어
 *    카드에서 '위에 작게' 또는 '괄호로' 보여 줄 수 있게 한다.
 */

export interface BibleVersion { id: string; name: string; lang: 'ko' | 'en' | 'ja'; file: string; ruby?: boolean }

export const BIBLE_VERSIONS: BibleVersion[] = [
  { id: 'KRV', name: '개역한글', lang: 'ko', file: 'krv_fixed_v3' },
  { id: 'KRVCH', name: '국한문개역', lang: 'ko', file: 'krvch', ruby: true },
  { id: 'NKRV', name: '개역개정', lang: 'ko', file: 'nkrv' },
  { id: 'RNKSV', name: '새번역', lang: 'ko', file: 'rnksv' },
  { id: 'SKV', name: '신개역', lang: 'ko', file: 'skv' },
  { id: 'KJVK', name: '흠정역', lang: 'ko', file: 'kjvk' },
  { id: 'KKJV', name: '한글KJV', lang: 'ko', file: 'kkjv' },
  { id: 'KTB', name: '바른성경', lang: 'ko', file: 'ktb' },
  { id: 'KB', name: '우리말성경', lang: 'ko', file: 'kb' },
  { id: 'EB', name: '쉬운성경', lang: 'ko', file: 'eb' },
  { id: 'TKV', name: '현대어성경', lang: 'ko', file: 'tkv' },
  { id: 'KLB', name: '현대인의성경', lang: 'ko', file: 'klb' },
  { id: 'CTB', name: '공동번역', lang: 'ko', file: 'ctb' },
  { id: 'ESV', name: 'ESV', lang: 'en', file: 'esv' },
  { id: 'NIV', name: 'NIV', lang: 'en', file: 'niv' },
  { id: 'NLT', name: 'NLT', lang: 'en', file: 'nlt' },
  { id: 'NKJV', name: 'NKJV', lang: 'en', file: 'nkjv' },
  { id: 'KJV', name: 'KJV', lang: 'en', file: 'kjv' },
  { id: 'JOU', name: '口語訳', lang: 'ja', file: 'jou', ruby: true },
];
export const versionById = (id: string) => BIBLE_VERSIONS.find(v => v.id === id);

/** 성경 앱이 올라가 있는 곳 (옥쌤보드와 같은 주소라 바로 받을 수 있다) */
export const BIBLE_BASE = 'https://fumon1218.github.io/global-bible-pro/data/bible/';
const CACHE = 'okssam-bible-v1';

type BibleJson = { book: Record<string, { chapter: Record<string, { verse: Record<string, { text: string }> }> }> };
const mem = new Map<string, Promise<BibleJson>>();

/** 이 번역본을 이미 받아 두었는가 */
export async function isDownloaded(v: BibleVersion): Promise<boolean> {
  if (mem.has(v.file)) return true;
  try { return !!(await (await caches.open(CACHE)).match(BIBLE_BASE + v.file + '.json')); } catch { return false; }
}

async function fetchJson(file: string): Promise<BibleJson> {
  const url = BIBLE_BASE + file + '.json';
  let cache: Cache | null = null;
  try { cache = await caches.open(CACHE); } catch { /* Cache Storage를 못 쓰는 곳 */ }
  const hit = cache ? await cache.match(url) : undefined;
  if (hit) return hit.json();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`성경 본문을 받지 못했습니다 (${res.status})`);
  if (cache) { try { await cache.put(url, res.clone()); } catch { /* 저장 공간 부족 — 이번만 쓴다 */ } }
  return res.json();
}

export function loadVersion(v: BibleVersion): Promise<BibleJson> {
  let p = mem.get(v.file);
  if (!p) {
    p = fetchJson(v.file);
    p.catch(() => mem.delete(v.file));
    mem.set(v.file, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// 본문 정리
// ---------------------------------------------------------------------------

/** 글자 조각: 한자에 읽는 법(rt)이 붙어 있으면 rt가 있다 */
export interface RubyPart { t: string; rt?: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, k) => {
  if (k[0] === '#') { const n = k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[k.toLowerCase()] ?? m;
});

/** 국한문 '하늘공.가운데중' → '공중' (뜻·음에서 음만) */
const koreanSound = (rt: string) => rt.split('.').map(s => s.replace(/_/g, '').trim().slice(-1)).join('');

/** 일본어 '賜わ' + 'たまわ' → 賜(たま)わ — 끝의 같은 가나(오쿠리가나)는 밖으로 */
function splitOkurigana(base: string, rt: string): RubyPart[] {
  let i = 0;
  while (i < base.length - 1 && i < rt.length - 1 && base[base.length - 1 - i] === rt[rt.length - 1 - i] && /[぀-ゟ]/.test(base[base.length - 1 - i])) i++;
  if (!i) return [{ t: base, rt }];
  return [{ t: base.slice(0, -i), rt: rt.slice(0, -i) }, { t: base.slice(-i) }];
}

/** 성경 앱의 HTML 본문 → 글자 조각 (각주·소제목·표시는 뺀다) */
export function cleanVerse(html: string, v: BibleVersion): RubyPart[] {
  let s = html
    .replace(/<sup[\s\S]*?<\/sup>/gi, '')          // 각주
    .replace(/<div[\s\S]*?<\/div>/gi, '')          // 소제목
    .replace(/<p>\s*<u>\d+<\/u>[\s\S]*$/i, '')     // 다음 절이 붙어 들어간 경우
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<TS>([\s\S]*?)<Ts>/g, '$1 ');
  const parts: RubyPart[] = [];
  const re = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/gi;
  const plain = (x: string) => decode(x.replace(/<[^>]*>/g, ''));
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ t: plain(s.slice(last, m.index)) });
    const base = plain(m[1]), rt = plain(m[2]);
    if (!rt) parts.push({ t: base });
    else if (v.lang === 'ko') parts.push({ t: base, rt: koreanSound(rt) });
    else parts.push(...splitOkurigana(base, rt));
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ t: plain(s.slice(last)) });
  // 문단 표시(○)와 겹친 빈칸 정리
  const out: RubyPart[] = [];
  for (const p of parts) {
    if (!p.rt) {
      p.t = p.t.replace(/○\s*/g, '').replace(/\s+/g, ' ');
      if (!p.t) continue;
      const prev = out[out.length - 1];
      if (prev && !prev.rt) { prev.t += p.t; continue; }
    }
    out.push(p);
  }
  if (out.length) {
    if (!out[0].rt) out[0].t = out[0].t.trimStart();
    const z = out[out.length - 1];
    if (!z.rt) z.t = z.t.trimEnd();
  }
  return out.filter(p => p.t);
}

/** 글자 조각 → 글. 'paren'이면 太初(태초), 'plain'이면 한자만 */
export const partsToText = (parts: RubyPart[], mode: 'paren' | 'plain' = 'paren') =>
  parts.map(p => (p.rt && mode === 'paren' ? `${p.t}(${p.rt})` : p.t)).join('');

// ---------------------------------------------------------------------------
// 구절 가져오기
// ---------------------------------------------------------------------------

export interface VerseRange { bookNo: number; chap: number; from?: number; to?: number }
export interface Passage { version: BibleVersion; verses: { n: number; parts: RubyPart[] }[]; bookName?: string }

export async function chapterCount(v: BibleVersion, bookNo: number) {
  const j = await loadVersion(v);
  return Object.keys(j.book[String(bookNo)]?.chapter || {}).length;
}

export async function getPassage(v: BibleVersion, r: VerseRange): Promise<Passage> {
  const j = await loadVersion(v);
  const b: any = j.book[String(r.bookNo)];
  const ch = b?.chapter?.[String(r.chap)];
  if (!ch) return { version: v, verses: [] };
  const nums = Object.keys(ch.verse).map(Number).filter(n => n > 0).sort((a, b2) => a - b2);
  const from = r.from ?? nums[0], to = r.to ?? (r.from != null ? r.from : nums[nums.length - 1]);
  const verses = nums.filter(n => n >= from && n <= to).map(n => ({ n, parts: cleanVerse(ch.verse[String(n)].text || '', v) })).filter(x => x.parts.length);
  return { version: v, verses, bookName: b?.info?.name };
}

/** 카드 머리에 쓰는 구절 이름: '로마서 8:28-30' */
export const refLabel = (bookName: string, r: VerseRange) =>
  `${bookName} ${r.chap}${r.from != null ? `:${r.from}${r.to != null && r.to !== r.from ? `-${r.to}` : ''}` : '장'}`;

// ---------------------------------------------------------------------------
// 고른 번역본·표시 방식 기억
// ---------------------------------------------------------------------------

const PREF = 'okssam_bible_pref';
export interface BiblePref { versions: string[]; ruby: 'over' | 'paren'; numbers: boolean }
export const getBiblePref = (): BiblePref => {
  try { return { versions: ['KRV'], ruby: 'over', numbers: true, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; }
  catch { return { versions: ['KRV'], ruby: 'over', numbers: true }; }
};
export const setBiblePref = (p: BiblePref) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* 무시 */ } };
