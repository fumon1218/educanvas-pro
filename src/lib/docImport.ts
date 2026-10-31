/**
 * 문서 파일 → 쪽 그림 변환기.
 *
 * PDF·한글(hwp/hwpx)·워드(docx/doc)·파워포인트(pptx)·엑셀(xlsx/xls/csv/ods)·
 * 키노트·페이지스·넘버스를 모두 같은 모양('쪽 묶음')으로 바꾼다.
 * 그래서 PDF와 똑같이 쪽 범위를 고르고, 한 슬라이드에 이어 붙이거나 쪽마다 슬라이드로 넣을 수 있다.
 *
 * 모든 변환은 이 기기의 브라우저 안에서만 한다(파일이 서버로 가지 않음, 무료).
 * 데스크톱 프로그램에서는 맥의 키노트·페이지스·넘버스(또는 LibreOffice)로 PDF를 만들어 더 정확하게 넣는다.
 */

export interface PageSource {
  /** 사람이 읽는 종류 이름 (예: '한글 문서') */
  kind: string;
  numPages: number;
  /** i는 1부터. 가로 폭이 maxW 이하인 JPEG data URL */
  render: (i: number, maxW: number) => Promise<string>;
  destroy?: () => void;
  /** 변환이 원본과 다를 수 있을 때 알려 줄 말 */
  note?: string;
  /** 고화질 확대용 원본 (PDF·한글만: 확대하면 원본에서 다시 그린다) */
  hd?: { kind: 'pdf' | 'hwp'; data: ArrayBuffer };
}

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '');

export const PDF_EXT = ['pdf'];
export const HWP_EXT = ['hwp', 'hwpx'];
export const WORD_EXT = ['docx', 'docm', 'dotx', 'doc'];
export const SLIDE_EXT = ['pptx', 'ppsx', 'pptm', 'ppt'];
export const SHEET_EXT = ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'];
export const IWORK_EXT = ['key', 'pages', 'numbers'];
export const DOC_EXTS = [...PDF_EXT, ...HWP_EXT, ...WORD_EXT, ...SLIDE_EXT, ...SHEET_EXT, ...IWORK_EXT, 'odt', 'odp', 'rtf'];
/** 파일 고르기 창의 accept 값 */
export const DOC_ACCEPT = DOC_EXTS.map(e => '.' + e).join(',');

export const isDocumentFile = (f: File) => f.type === 'application/pdf' || DOC_EXTS.includes(ext(f.name));
/** PDF가 아닌 문서인가 */
export const isOfficeFile = (f: File) => isDocumentFile(f) && ext(f.name) !== 'pdf' && f.type !== 'application/pdf';

export class DocImportError extends Error {
  constructor(message: string, public hint?: string) { super(message); }
}

// ---------------------------------------------------------------------------
// 공통 도구
// ---------------------------------------------------------------------------

const toJpeg = (c: HTMLCanvasElement, maxW: number) => {
  if (c.width <= maxW) return c.toDataURL('image/jpeg', 0.88);
  const s = maxW / c.width;
  const o = document.createElement('canvas');
  o.width = Math.round(c.width * s); o.height = Math.round(c.height * s);
  const ctx = o.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, o.width, o.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL('image/jpeg', 0.88);
};

/** 화면 밖에 그려 둘 상자 (레이아웃 계산이 되도록 실제 문서에 붙인다) */
const offscreen = (width?: number) => {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;${width ? `width:${width}px;` : ''}background:#fff;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);
  return host;
};

/** HTML 요소를 그림으로 */
const rasterize = async (node: HTMLElement, scale: number) => {
  const { toCanvas } = await import('html-to-image');
  return toCanvas(node, { pixelRatio: scale, backgroundColor: '#ffffff', skipFonts: true, cacheBust: false });
};

const waitImages = async (root: HTMLElement) => {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = () => r(null); setTimeout(r, 4000); })));
};

const KFONT = `'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif`;

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function pdfSource(data: ArrayBuffer, kind = 'PDF'): Promise<PageSource> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const hdCopy = data.slice(0); // pdf.js가 원본 버퍼를 가져가므로 고화질용 사본을 남긴다
  let doc;
  try { doc = await pdfjs.getDocument({ data }).promise; }
  catch (e: any) {
    if (e?.name === 'PasswordException') throw new DocImportError('암호가 걸린 PDF입니다.', '암호를 풀고 저장한 뒤 다시 넣어 주세요.');
    throw new DocImportError('PDF를 열지 못했습니다.', '손상된 파일일 수 있습니다.');
  }
  return {
    kind,
    numPages: doc.numPages,
    hd: { kind: 'pdf', data: hdCopy },
    render: async (i, maxW) => {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2.2, maxW / base.width) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
      page.cleanup();
      return c.toDataURL('image/jpeg', 0.85);
    },
    destroy: () => { void doc.destroy(); },
  };
}

// ---------------------------------------------------------------------------
// 한글 (hwp, hwpx) — @rhwp/core (MIT, Rust+WebAssembly)
// ---------------------------------------------------------------------------

let rhwpReady: Promise<any> | null = null;
/** 고화질 확대에서도 같은 한글 엔진을 쓴다 */
export const loadRhwpModule = () => loadRhwp();
const loadRhwp = () => {
  if (!rhwpReady) {
    rhwpReady = (async () => {
      let mctx: CanvasRenderingContext2D | null = null; let last = '';
      (globalThis as any).measureTextWidth = (font: string, text: string) => {
        if (!mctx) mctx = document.createElement('canvas').getContext('2d');
        if (font !== last) { mctx!.font = font; last = font; }
        return mctx!.measureText(text).width;
      };
      const [mod, wasm] = await Promise.all([import('@rhwp/core'), import('@rhwp/core/rhwp_bg.wasm?url')]);
      await mod.default({ module_or_path: wasm.default });
      return mod;
    })();
    rhwpReady.catch(() => { rhwpReady = null; });
  }
  return rhwpReady;
};

async function hwpSource(data: ArrayBuffer): Promise<PageSource> {
  const mod = await loadRhwp();
  let doc: any;
  try { doc = new mod.HwpDocument(new Uint8Array(data)); }
  catch (e: any) {
    const msg = String(e?.message || e || '');
    if (/암호|password|encrypt/i.test(msg)) throw new DocImportError('암호가 걸린 한글 문서입니다.', '한글에서 암호를 풀고 저장한 뒤 넣어 주세요.');
    if (/배포|distribut/i.test(msg)) throw new DocImportError('배포용(보안) 한글 문서는 열 수 없습니다.', '한글에서 PDF로 저장한 뒤 넣어 주세요.');
    throw new DocImportError('한글 문서를 읽지 못했습니다.', '한글에서 PDF로 저장한 뒤 넣으면 확실합니다.');
  }
  const n = doc.pageCount();
  if (!n) throw new DocImportError('한글 문서에 쪽이 없습니다.');
  return {
    kind: '한글 문서',
    numPages: n,
    hd: { kind: 'hwp', data },
    render: async (i, maxW) => {
      const c = document.createElement('canvas');
      doc.renderPageToCanvas(i - 1, c, 1);
      const scale = Math.min(2.5, maxW / Math.max(1, c.width));
      if (Math.abs(scale - 1) > 0.05) doc.renderPageToCanvas(i - 1, c, scale);
      // 투명 배경을 흰 종이로
      const o = document.createElement('canvas');
      o.width = c.width; o.height = c.height;
      const ctx = o.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, o.width, o.height);
      ctx.drawImage(c, 0, 0);
      return toJpeg(o, maxW);
    },
    destroy: () => { try { doc.free?.(); } catch { /* 무시 */ } },
    note: '한글 전용 글꼴은 비슷한 글꼴로 바뀌어 줄 바꿈이 조금 다를 수 있습니다.',
  };
}

// ---------------------------------------------------------------------------
// 워드 (docx) — docx-preview, (doc) — 본문 글자만
// ---------------------------------------------------------------------------

async function docxSource(data: ArrayBuffer): Promise<PageSource> {
  const { renderAsync } = await import('docx-preview');
  const host = offscreen();
  const style = document.createElement('div');
  host.appendChild(style);
  const body = document.createElement('div');
  host.appendChild(body);
  try {
    await renderAsync(data, body, style, {
      inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      ignoreWidth: false, ignoreHeight: false, renderHeaders: true, renderFooters: true,
      renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: true,
    } as any);
  } catch {
    host.remove();
    throw new DocImportError('워드 문서를 읽지 못했습니다.', '워드에서 PDF로 저장한 뒤 넣으면 확실합니다.');
  }
  const sections = Array.from(body.querySelectorAll<HTMLElement>('section.docx'));
  if (!sections.length) { host.remove(); throw new DocImportError('워드 문서에 내용이 없습니다.'); }
  sections.forEach(p => { p.style.margin = '0'; p.style.boxShadow = 'none'; });
  await waitImages(body);
  // 워드가 쪽 나눔 위치를 저장하지 않은 문서는 한 구역이 길게 나온다 → 종이 높이에 맞춰 문단 사이에서 나눈다
  type Piece = { sec: HTMLElement; y0: number; y1: number; padTop: number; pageH: number };
  const pieces: Piece[] = [];
  for (const sec of sections) {
    const W = sec.offsetWidth || 794;
    const pageH = parseFloat(getComputedStyle(sec).minHeight) || Math.round(W * 1.414);
    const H = sec.scrollHeight;
    const cs = getComputedStyle(sec);
    const padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
    if (H <= pageH * 1.04) { pieces.push({ sec, y0: 0, y1: H, padTop: 0, pageH }); continue; }
    const top = sec.getBoundingClientRect().top;
    const blocks = Array.from(sec.querySelectorAll<HTMLElement>(':scope > article > *, :scope > *:not(article):not(header):not(footer)'))
      .map(el => { const r = el.getBoundingClientRect(); return { a: r.top - top, b: r.bottom - top }; })
      .filter(x => x.b > x.a);
    let y0 = 0;
    while (y0 < H - padBottom - 2) {
      const room = (y0 === 0 ? pageH : pageH - padTop) - padBottom;
      let cut = y0 + room;
      if (cut < H - padBottom) {
        // 넘치는 첫 덩어리 앞에서 자른다 (덩어리가 너무 크면 그냥 자른다)
        const over = blocks.find(x => x.a >= y0 + 1 && x.b > cut);
        if (over && over.a > y0 + room * 0.3) cut = over.a;
      } else cut = H;
      pieces.push({ sec, y0, y1: cut, padTop: y0 === 0 ? 0 : padTop, pageH });
      y0 = cut;
    }
  }
  const cache = new Map<HTMLElement, { c: HTMLCanvasElement; s: number }>();
  return {
    kind: '워드 문서',
    numPages: pieces.length,
    render: async (i, maxW) => {
      const pc = pieces[i - 1];
      const W = pc.sec.offsetWidth || 794;
      const s = Math.min(2, maxW / W);
      let got = cache.get(pc.sec);
      if (!got || got.s !== s) {
        sections.forEach(x => { x.style.display = x === pc.sec ? '' : 'none'; });
        got = { c: await rasterize(pc.sec, s), s };
        cache.clear(); cache.set(pc.sec, got);
      }
      const k = got.c.width / W;
      const out = document.createElement('canvas');
      out.width = got.c.width; out.height = Math.round(Math.max(pc.pageH, pc.y1 - pc.y0 + pc.padTop) * k);
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(got.c, 0, Math.round(pc.y0 * k), out.width, Math.round((pc.y1 - pc.y0) * k), 0, Math.round(pc.padTop * k), out.width, Math.round((pc.y1 - pc.y0) * k));
      return toJpeg(out, maxW);
    },
    destroy: () => { cache.clear(); host.remove(); },
    note: '복잡한 도형·글상자는 원본과 조금 다를 수 있습니다.',
  };
}

/** 옛 워드(.doc): 본문 글자를 꺼내 A4 쪽으로 다시 짠다 (그림·서식은 빠짐) */
async function docSource(data: ArrayBuffer): Promise<PageSource> {
  const CFB = await import('cfb');
  let text = '';
  try {
    const cfb = CFB.read(new Uint8Array(data), { type: 'array' });
    const wd = CFB.find(cfb, 'WordDocument');
    if (!wd?.content) throw new Error('no WordDocument');
    const w = toU8(wd.content);
    const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
    const flags = dv.getUint16(0x0A, true);
    if (flags & 0x0100) throw new DocImportError('암호가 걸린 워드 문서입니다.', '워드에서 암호를 풀고 저장한 뒤 넣어 주세요.');
    const tbl = CFB.find(cfb, (flags & 0x0200) ? '1Table' : '0Table');
    if (!tbl?.content) throw new Error('no table stream');
    const t = toU8(tbl.content);
    const tv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const fcClx = dv.getUint32(0x01A2, true), lcbClx = dv.getUint32(0x01A6, true);
    let p = fcClx; const end = fcClx + lcbClx;
    while (p < end && t[p] === 0x01) p += 3 + tv.getUint16(p + 1, true); // Prc 건너뛰기
    if (t[p] !== 0x02) throw new Error('no piece table');
    const lcb = tv.getUint32(p + 1, true); p += 5;
    const n = (lcb - 4) / 12;
    const cps: number[] = [];
    for (let i = 0; i <= n; i++) cps.push(tv.getUint32(p + i * 4, true));
    const pcdBase = p + (n + 1) * 4;
    const dec1252 = new TextDecoder('windows-1252');
    const dec16 = new TextDecoder('utf-16le');
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const fcRaw = tv.getUint32(pcdBase + i * 8 + 2, true);
      const len = cps[i + 1] - cps[i];
      if (fcRaw & 0x40000000) { const fc = (fcRaw & ~0x40000000) / 2; parts.push(dec1252.decode(w.subarray(fc, fc + len))); }
      else parts.push(dec16.decode(w.subarray(fcRaw, fcRaw + len * 2)));
    }
    text = parts.join('');
  } catch (e) {
    if (e instanceof DocImportError) throw e;
    throw new DocImportError('옛 워드(.doc) 문서를 읽지 못했습니다.', '워드에서 .docx나 PDF로 저장한 뒤 넣어 주세요.');
  }
  // 필드 코드(0x13 코드 0x14 결과 0x15)는 결과만 남기고, 특수 문자를 정리
  text = text.replace(/\u0013[^\u0014\u0015]*\u0014?([^\u0015]*)\u0015/g, '$1')
    .replace(/[\u0001\u0008\u0013-\u0015]/g, '')
    .replace(/\u0007/g, '\t').replace(/\u000b|\u000c/g, '\n').replace(/\r/g, '\n');
  const paras = text.split('\n').map(s => s.replace(/\t+$/g, '')).filter((s, i, a) => s.trim() || (a[i - 1] ?? '').trim());
  return textPages(paras, '워드 문서(.doc)', '옛 워드 형식은 글자만 옮겨집니다. 그림·표 모양까지 필요하면 워드에서 .docx나 PDF로 저장해 넣어 주세요.');
}

const toU8 = (c: any): Uint8Array => c instanceof Uint8Array ? c : new Uint8Array(c);

/** 글자 문단들을 A4 쪽 그림으로 (doc 등) */
function textPages(paras: string[], kind: string, note: string): PageSource {
  const W = 794, H = 1123, PAD = 76, LH = 26, FS = 16;
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = `${FS}px ${KFONT}`;
  const lines: string[] = [];
  for (const para of paras) {
    if (!para.trim()) { lines.push(''); continue; }
    let cur = '';
    for (const ch of Array.from(para.replace(/\t/g, '    '))) {
      if (m.measureText(cur + ch).width > W - PAD * 2) { lines.push(cur); cur = ch; } else cur += ch;
    }
    lines.push(cur);
  }
  const per = Math.floor((H - PAD * 2) / LH);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  if (!pages.length) throw new DocImportError('문서에서 글자를 찾지 못했습니다.');
  return {
    kind, numPages: pages.length, note,
    render: async (i, maxW) => {
      const s = Math.min(2, maxW / W);
      const c = document.createElement('canvas');
      c.width = Math.round(W * s); c.height = Math.round(H * s);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.scale(s, s); ctx.fillStyle = '#111'; ctx.font = `${FS}px ${KFONT}`; ctx.textBaseline = 'top';
      pages[i - 1].forEach((ln, k) => ctx.fillText(ln, PAD, PAD + k * LH));
      return toJpeg(c, maxW);
    },
  };
}

// ---------------------------------------------------------------------------
// 파워포인트 (pptx) — pptx-preview
// ---------------------------------------------------------------------------

async function pptxSource(data: ArrayBuffer): Promise<PageSource> {
  const { init } = await import('pptx-preview');
  // 슬라이드 크기(비율)를 먼저 읽는다
  const JSZip = (await import('jszip')).default;
  let ratio = 16 / 9;
  try {
    const zip = await JSZip.loadAsync(data);
    const pres = await zip.file('ppt/presentation.xml')?.async('string');
    const m = pres?.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    if (m) ratio = Number(m[1]) / Number(m[2]);
  } catch { throw new DocImportError('파워포인트 파일을 읽지 못했습니다.', '파워포인트에서 PDF로 저장한 뒤 넣어 주세요.'); }
  const W = 1280, H = Math.round(W / ratio);
  const host = offscreen(W);
  const box = document.createElement('div');
  box.style.cssText = `width:${W}px;height:${H}px;`;
  host.appendChild(box);
  const viewer: any = init(box, { width: W, height: H, mode: 'slide' });
  try { await viewer.preview(data); }
  catch { viewer.destroy?.(); host.remove(); throw new DocImportError('파워포인트 파일을 읽지 못했습니다.', '파워포인트에서 PDF로 저장한 뒤 넣어 주세요.'); }
  const n = viewer.slideCount || 0;
  if (!n) { viewer.destroy?.(); host.remove(); throw new DocImportError('슬라이드가 없는 파일입니다.'); }
  // 보기 화면의 넘김 단추·쪽 번호는 그림에 넣지 않는다
  const hideChrome = () => host.querySelectorAll<HTMLElement>('[class*="pagination"],[class*="pre-button"],[class*="next-button"],[class*="pptx-preview-slide-wrapper-button"]').forEach(el => { el.style.display = 'none'; });
  return {
    kind: '파워포인트',
    numPages: n,
    render: async (i, maxW) => {
      viewer.renderSingleSlide(i - 1);
      hideChrome();
      await waitImages(host);
      await new Promise(r => setTimeout(r, 60));
      const slide = (host.querySelector<HTMLElement>('.pptx-preview-slide-wrapper') || box);
      const c = await rasterize(slide, Math.min(2, maxW / W));
      return toJpeg(c, maxW);
    },
    destroy: () => { try { viewer.destroy?.(); } catch { /* 무시 */ } host.remove(); },
    note: '애니메이션은 빠지고, 일부 도형·글꼴은 원본과 조금 다를 수 있습니다.',
  };
}

// ---------------------------------------------------------------------------
// 엑셀·넘버스 (xlsx, xls, csv, ods, numbers) — SheetJS
// ---------------------------------------------------------------------------

async function sheetSource(data: ArrayBuffer, kind = '엑셀'): Promise<PageSource> {
  const XLSX = await import('xlsx');
  let wb: any;
  try { wb = XLSX.read(new Uint8Array(data), { type: 'array', cellStyles: true, cellDates: true, dense: false }); }
  catch (e: any) {
    if (/password|encrypt/i.test(String(e?.message))) throw new DocImportError('암호가 걸린 파일입니다.', '암호를 풀고 저장한 뒤 넣어 주세요.');
    throw new DocImportError(`${kind} 파일을 읽지 못했습니다.`, 'PDF로 저장한 뒤 넣으면 확실합니다.');
  }
  type Page = { sheet: string; r0: number; r1: number; c0: number; c1: number };
  const ROWS = 32, MAXC = 12;
  const pages: Page[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws?.['!ref']) continue;
    const rg = XLSX.utils.decode_range(ws['!ref']);
    for (let c0 = rg.s.c; c0 <= rg.e.c; c0 += MAXC)
      for (let r0 = rg.s.r; r0 <= rg.e.r; r0 += ROWS)
        pages.push({ sheet: name, r0, r1: Math.min(rg.e.r, r0 + ROWS - 1), c0, c1: Math.min(rg.e.c, c0 + MAXC - 1) });
  }
  if (!pages.length) throw new DocImportError('표에 내용이 없습니다.');
  const multi = wb.SheetNames.length > 1;
  return {
    kind, numPages: pages.length,
    note: '표의 값과 칸 합치기는 옮겨지고, 색·차트는 빠집니다. 한 쪽에 32줄·12칸씩 나뉩니다.',
    render: async (i, maxW) => {
      const pg = pages[i - 1];
      const ws = wb.Sheets[pg.sheet];
      const colsInfo: any[] = ws['!cols'] || [];
      const merges: any[] = ws['!merges'] || [];
      const m = document.createElement('canvas').getContext('2d')!;
      const FS = 15, RH = 30, HEAD = 26, TOP = multi ? 40 : 0;
      m.font = `${FS}px ${KFONT}`;
      const cellText = (r: number, c: number) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) return '';
        return String(cell.w ?? (cell.v instanceof Date ? cell.v.toLocaleDateString('ko-KR') : cell.v ?? ''));
      };
      // 칸 너비: 파일에 정해진 너비 또는 글자 길이
      const widths: number[] = [];
      for (let c = pg.c0; c <= pg.c1; c++) {
        const wch = colsInfo[c]?.wpx ? colsInfo[c].wpx : colsInfo[c]?.wch ? colsInfo[c].wch * 8 : 0;
        let w = wch || 70;
        if (!wch) for (let r = pg.r0; r <= pg.r1; r++) w = Math.max(w, Math.min(320, m.measureText(cellText(r, c)).width + 18));
        widths.push(Math.round(w));
      }
      const W = HEAD + widths.reduce((a, b) => a + b, 0);
      const H = TOP + HEAD + (pg.r1 - pg.r0 + 1) * RH;
      const s = Math.min(2, maxW / W, 4000 / H);
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(W * s)); cv.height = Math.max(1, Math.round(H * s));
      const ctx = cv.getContext('2d')!;
      ctx.scale(s, s);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      if (multi) { ctx.fillStyle = '#334155'; ctx.font = `bold 18px ${KFONT}`; ctx.textBaseline = 'middle'; ctx.fillText(`▦ ${pg.sheet}`, 6, TOP / 2); }
      const xs = [HEAD]; widths.forEach(w => xs.push(xs[xs.length - 1] + w));
      const yOf = (r: number) => TOP + HEAD + (r - pg.r0) * RH;
      // 머리 (A, B, C … / 1, 2, 3 …)
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, TOP, W, HEAD); ctx.fillRect(0, TOP, HEAD, H - TOP);
      ctx.fillStyle = '#64748b'; ctx.font = `12px ${KFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let c = pg.c0; c <= pg.c1; c++) ctx.fillText(XLSX.utils.encode_col(c), (xs[c - pg.c0] + xs[c - pg.c0 + 1]) / 2, TOP + HEAD / 2);
      for (let r = pg.r0; r <= pg.r1; r++) ctx.fillText(String(r + 1), HEAD / 2, yOf(r) + RH / 2);
      // 격자
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
      ctx.beginPath();
      xs.forEach(x => { ctx.moveTo(x + 0.5, TOP); ctx.lineTo(x + 0.5, H); });
      for (let r = pg.r0; r <= pg.r1 + 1; r++) { const y = yOf(r) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.moveTo(0, TOP + 0.5); ctx.lineTo(W, TOP + 0.5);
      ctx.stroke();
      // 합친 칸
      const covered = new Set<string>();
      const mergeOf = new Map<string, any>();
      for (const mg of merges) {
        if (mg.e.r < pg.r0 || mg.s.r > pg.r1 || mg.e.c < pg.c0 || mg.s.c > pg.c1) continue;
        mergeOf.set(`${Math.max(mg.s.r, pg.r0)},${Math.max(mg.s.c, pg.c0)}`, mg);
        for (let r = mg.s.r; r <= mg.e.r; r++) for (let c = mg.s.c; c <= mg.e.c; c++) covered.add(`${r},${c}`);
      }
      ctx.font = `${FS}px ${KFONT}`; ctx.fillStyle = '#0f172a'; ctx.textBaseline = 'middle';
      for (let r = pg.r0; r <= pg.r1; r++) for (let c = pg.c0; c <= pg.c1; c++) {
        const mg = mergeOf.get(`${r},${c}`);
        if (!mg && covered.has(`${r},${c}`)) continue;
        const x0 = xs[c - pg.c0], y0 = yOf(r);
        let x1 = xs[c - pg.c0 + 1], y1 = y0 + RH;
        if (mg) {
          x1 = xs[Math.min(mg.e.c, pg.c1) - pg.c0 + 1]; y1 = yOf(Math.min(mg.e.r, pg.r1)) + RH;
          ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1);
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0); ctx.fillStyle = '#0f172a';
        }
        const raw = ws[XLSX.utils.encode_cell({ r: mg ? mg.s.r : r, c: mg ? mg.s.c : c })];
        let t = cellText(mg ? mg.s.r : r, mg ? mg.s.c : c);
        if (!t) continue;
        const room = x1 - x0 - 10;
        while (t.length > 1 && ctx.measureText(t).width > room) t = t.slice(0, -2) + '…';
        const num = raw?.t === 'n';
        ctx.textAlign = mg ? 'center' : num ? 'right' : 'left';
        ctx.fillText(t, mg ? (x0 + x1) / 2 : num ? x1 - 5 : x0 + 5, (y0 + y1) / 2);
      }
      return toJpeg(cv, maxW);
    },
  };
}

// ---------------------------------------------------------------------------
// 키노트·페이지스·넘버스 (Apple iWork)
// ---------------------------------------------------------------------------

async function iworkSource(file: File, data: ArrayBuffer): Promise<PageSource> {
  const e = ext(file.name);
  const app = e === 'key' ? '키노트' : e === 'pages' ? '페이지스' : '넘버스';
  const how = `${app}에서 [파일 → 다음으로 내보내기 → PDF]로 저장해 넣으면 모든 ${e === 'key' ? '슬라이드' : '쪽'}가 그대로 들어갑니다.`;
  // 넘버스는 표 값을 직접 읽을 수 있다
  if (e === 'numbers') {
    try { const s = await sheetSource(data, '넘버스'); return s; } catch { /* 아래 미리보기로 */ }
  }
  const JSZip = (await import('jszip')).default;
  let zip: any;
  try { zip = await JSZip.loadAsync(data); }
  catch { throw new DocImportError(`${app} 파일을 열지 못했습니다.`, how); }
  // 예전 형식: 안에 PDF 미리보기가 통째로 들어 있다
  const pdf = zip.file(/(^|\/)QuickLook\/Preview\.pdf$/i)[0];
  if (pdf) {
    const src = await pdfSource(await pdf.async('arraybuffer'), app);
    return src;
  }
  // 지금 형식: 첫 쪽 미리보기 그림만 들어 있다
  const pick = zip.file(/(^|\/)preview\.jpg$/i)[0] || zip.file(/(^|\/)preview-web\.jpg$/i)[0] || zip.file(/QuickLook\/Thumbnail\.jpg$/i)[0];
  if (!pick) throw new DocImportError(`${app} 파일에서 내용을 찾지 못했습니다.`, how);
  const blob = new Blob([await pick.async('arraybuffer')], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  return {
    kind: app, numPages: 1,
    note: `브라우저에서는 ${app}의 첫 ${e === 'key' ? '슬라이드' : '쪽'} 미리보기만 넣을 수 있습니다. ${how} (옥쌤보드 데스크톱에서는 자동으로 됩니다)`,
    render: async (_i, maxW) => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
      return toJpeg(c, maxW);
    },
    destroy: () => URL.revokeObjectURL(url),
  };
}

// ---------------------------------------------------------------------------
// 데스크톱 프로그램: 컴퓨터에 깔린 앱으로 PDF 만들기
// ---------------------------------------------------------------------------

const desktopConvert = () => (window as any).okssamDesktop?.convertToPdf as undefined | ((name: string, data: ArrayBuffer) => Promise<{ ok: boolean; pdf?: ArrayBuffer; error?: string; via?: string }>);

/** 데스크톱에서 먼저 정확한 변환(키노트·페이지스·넘버스·LibreOffice)을 시도할 형식 */
const NATIVE_FIRST = ['key', 'pages', 'numbers', 'ppt', 'doc', 'odp', 'odt', 'rtf'];

// ---------------------------------------------------------------------------
// 입구
// ---------------------------------------------------------------------------

export async function openDocument(file: File, onStatus?: (s: string) => void): Promise<PageSource> {
  const e = ext(file.name);
  const data = await file.arrayBuffer();
  if (e === 'pdf' || file.type === 'application/pdf') return pdfSource(data);

  const native = desktopConvert();
  if (native && NATIVE_FIRST.includes(e)) {
    onStatus?.('컴퓨터의 프로그램으로 PDF를 만드는 중…');
    try {
      const r = await native(file.name, data.slice(0));
      if (r?.ok && r.pdf) return pdfSource(r.pdf, KIND_OF[e] || '문서');
    } catch { /* 아래 방식으로 */ }
  }

  onStatus?.(HWP_EXT.includes(e) && !rhwpReady
    ? '한글 문서 엔진을 처음 한 번 받는 중… (약 4MB, 다음부터는 바로 열립니다)'
    : `${KIND_OF[e] || '문서'}를 여는 중…`);
  try {
    return await openInBrowser(file, e, data);
  } catch (err) {
    // 브라우저 방식이 실패하면 데스크톱에서는 컴퓨터의 프로그램으로 한 번 더
    if (native && !NATIVE_FIRST.includes(e)) {
      onStatus?.('컴퓨터의 프로그램으로 PDF를 만드는 중…');
      try {
        const r = await native(file.name, data.slice(0));
        if (r?.ok && r.pdf) return pdfSource(r.pdf, KIND_OF[e] || '문서');
      } catch { /* 처음 오류를 알린다 */ }
    }
    throw err;
  }
}

async function openInBrowser(file: File, e: string, data: ArrayBuffer): Promise<PageSource> {
  if (HWP_EXT.includes(e)) return hwpSource(data);
  if (e === 'doc') {
    // 이름만 .doc인 docx·rtf·hwp도 있다 → 내용으로 판단
    const head = new Uint8Array(data.slice(0, 8));
    if (head[0] === 0x50 && head[1] === 0x4b) return docxSource(data);
    return docSource(data);
  }
  if (WORD_EXT.includes(e)) return docxSource(data);
  if (e === 'ppt') throw new DocImportError('옛 파워포인트(.ppt) 형식은 브라우저에서 열 수 없습니다.', '파워포인트·키노트에서 .pptx나 PDF로 저장해 넣어 주세요. (옥쌤보드 데스크톱에서는 키노트나 파워포인트가 있으면 자동으로 됩니다)');
  if (SLIDE_EXT.includes(e)) return pptxSource(data);
  if (SHEET_EXT.includes(e)) return sheetSource(data, e === 'csv' || e === 'tsv' ? 'CSV 표' : e === 'ods' ? '스프레드시트' : '엑셀');
  if (IWORK_EXT.includes(e)) return iworkSource(file, data);
  if (e === 'odt' || e === 'odp' || e === 'rtf') throw new DocImportError('이 형식은 브라우저에서 열 수 없습니다.', 'PDF로 저장해 넣어 주세요.');
  throw new DocImportError('넣을 수 없는 파일 형식입니다.');
}

const KIND_OF: Record<string, string> = {
  hwp: '한글 문서', hwpx: '한글 문서', docx: '워드 문서', docm: '워드 문서', dotx: '워드 문서', doc: '워드 문서',
  pptx: '파워포인트', ppsx: '파워포인트', pptm: '파워포인트', ppt: '파워포인트',
  xlsx: '엑셀', xlsm: '엑셀', xls: '엑셀', xlsb: '엑셀', ods: '스프레드시트', csv: 'CSV 표', tsv: '표',
  key: '키노트', pages: '페이지스', numbers: '넘버스', odt: '문서', odp: '발표 자료', rtf: '문서',
};
