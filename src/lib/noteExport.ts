/**
 * 노트 내보내기: 한글(hwpx) · 워드(docx)
 *  - 타자로 쓴 글자(양식 칸·글상자), 할 일·기도 제목(☐/☑), 성경 구절 카드를 문서 글로 옮긴다
 *  - '손글씨 포함'을 고르면 슬라이드(쪽)마다 그림을 함께 넣어, 펜으로 쓴 내용도 문서에 남긴다
 * 모두 이 기기 안에서 만든다 (hwp-convert: MIT, docx: MIT).
 */
import * as fabric from 'fabric';
import { loadCanvasData } from './canvasData';
import { drawBackground, isBackgroundId, type CanvasBackground } from './backgrounds';
import { SPACES, spaceOf, type StoredProject } from './projectStore';

const FIELD_LABEL: Record<string, string> = {
  date: '날짜', title: '제목', subject: '과목', preacher: '설교자', service: '예배', passage: '본문',
  place: '장소', attendees: '참석자', decisions: '결정 사항', todo: '할 일', tomorrow: '내일 할 일', prayer: '기도 제목',
};

/** 슬라이드 한 장을 그림으로 (내용에 맞춰 자르고 배경 무늬 포함) */
export async function renderScene(data: string | null, bg: CanvasBackground, maxW = 1400): Promise<{ url: string; w: number; h: number } | null> {
  const el = document.createElement('canvas');
  const sc = new fabric.StaticCanvas(el, { width: 10, height: 10, enableRetinaScaling: false, renderOnAddRemove: false });
  try {
    await loadCanvasData(sc, data);
    const objs = sc.getObjects().filter(o => o.visible !== false);
    if (!objs.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    objs.forEach(o => { const r = o.getBoundingRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.left + r.width); y1 = Math.max(y1, r.top + r.height); });
    const pad = 20, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
    const z = Math.min(maxW / w, 2.5, 6000 / h);
    const W = Math.round(w * z), H = Math.round(h * z);
    sc.setDimensions({ width: W, height: H });
    const vpt: fabric.TMat2D = [z, 0, 0, z, -(x0 - pad) * z, -(y0 - pad) * z];
    sc.setViewportTransform(vpt);
    sc.renderAll();
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    drawBackground(ctx, bg, W, H, vpt as number[], 1, { x: 0, y: 0 });
    ctx.drawImage(sc.getElement(), 0, 0);
    return { url: out.toDataURL('image/jpeg', 0.85), w: W, h: H };
  } catch { return null; } finally { sc.dispose(); }
}

interface Block { kind: 'field' | 'text' | 'check' | 'bible'; label?: string; text: string; lines?: { done: boolean; text: string }[] }

/** 슬라이드의 글자들을 읽는 순서(위→아래, 왼→오)로 */
function blocksOf(data: string | null): Block[] {
  if (!data) return [];
  let objs: any[] = [];
  try { objs = JSON.parse(data).objects || []; } catch { return []; }
  const flat: any[] = [];
  const walk = (list: any[]) => list.forEach(o => { if (o?.objects && o.type?.toLowerCase() === 'group' && !o.isFlash) walk(o.objects); else flat.push(o); });
  walk(objs);
  return flat
    .filter(o => typeof o.text === 'string' && o.text.trim() && !o.isPlaceholder)
    .sort((a, b) => (Math.abs((a.top || 0) - (b.top || 0)) < 12 ? (a.left || 0) - (b.left || 0) : (a.top || 0) - (b.top || 0)))
    .map<Block>(o => {
      if (o.checklist) return {
        kind: 'check', label: o.checklist === 'prayer' ? '기도 제목' : '할 일', text: '',
        lines: String(o.text).split('\n').filter((l: string) => l.replace(/^[☐☑]\s*/, '').trim()).map((l: string) => ({ done: l.startsWith('☑'), text: l.replace(/^[☐☑]\s*/, '') })),
      };
      if (o.bibleRef) return { kind: 'bible', text: String(o.text).replace(/^📖\s*/, '') };
      if (o.field) return { kind: 'field', label: o.fieldLabel || FIELD_LABEL[o.field] || o.field, text: String(o.text) };
      return { kind: 'text', text: String(o.text) };
    });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function collect(p: StoredProject, withInk: boolean) {
  const bgGlobal: CanvasBackground = isBackgroundId(p.canvasBackground) ? (p.canvasBackground as CanvasBackground) : 'blank';
  const slides = [];
  for (const s of p.scenes) {
    const bg = isBackgroundId(s.background) ? (s.background as CanvasBackground) : bgGlobal;
    slides.push({ name: s.name, blocks: blocksOf(s.data), img: withInk ? await renderScene(s.data, bg) : null });
  }
  const meta = [SPACES.find(x => x.id === spaceOf(p))?.label, p.category, p.noteDate || new Date(p.savedAt).toLocaleDateString('ko-KR')].filter(Boolean).join(' · ');
  return { slides, meta };
}

function toHtml(p: StoredProject, c: Awaited<ReturnType<typeof collect>>) {
  let h = `<div style="font-family:'맑은 고딕';"><h1>${esc(p.name)}</h1><p style="color:#64748b">${esc(c.meta)}</p>`;
  c.slides.forEach((s, i) => {
    if (c.slides.length > 1) h += `<h2>${i + 1}. ${esc(s.name)}</h2>`;
    const fields = s.blocks.filter(b => b.kind === 'field');
    if (fields.length) h += `<table style="border-collapse:collapse;width:100%">${fields.map(f => `<tr><td style="border:1px solid #999;background-color:#f1f5f9;padding:4px;width:90px"><b>${esc(f.label!)}</b></td><td style="border:1px solid #999;padding:4px">${esc(f.text)}</td></tr>`).join('')}</table>`;
    for (const b of s.blocks) {
      if (b.kind === 'check') h += `<h3>${esc(b.label!)}</h3>${b.lines!.map(l => `<p>${l.done ? '☑' : '☐'} ${esc(l.text)}</p>`).join('')}`;
      else if (b.kind === 'bible') h += `<p style="background-color:#fef3c7;padding:6px">${esc(b.text).replace(/\n/g, '<br/>')}</p>`;
      else if (b.kind === 'text') h += `<p>${esc(b.text).replace(/\n/g, '<br/>')}</p>`;
    }
    if (s.img) h += `<p><img src="${s.img.url}" width="${Math.min(640, s.img.w)}" /></p>`;
  });
  return h + '</div>';
}

const fileName = (p: StoredProject, ext: string) => `${(p.name || '노트').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.${ext}`;
const download = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

export async function exportNote(p: StoredProject, format: 'hwpx' | 'docx', withInk: boolean): Promise<void> {
  const c = await collect(p, withInk);
  if (format === 'hwpx') {
    const { htmlToHwpx } = await import('hwp-convert');
    const bytes: any = await htmlToHwpx(toHtml(p, c), { title: p.name, creator: '옥쌤보드', page: { size: 'A4', orientation: 'portrait' } } as any);
    download(new Blob([bytes], { type: 'application/hwp+zip' }), fileName(p, 'hwpx'));
    return;
  }
  const d = await import('docx');
  const kids: any[] = [
    new d.Paragraph({ text: p.name, heading: d.HeadingLevel.TITLE }),
    new d.Paragraph({ children: [new d.TextRun({ text: c.meta, color: '64748B' })] }),
  ];
  for (const [i, s] of c.slides.entries()) {
    if (c.slides.length > 1) kids.push(new d.Paragraph({ text: `${i + 1}. ${s.name}`, heading: d.HeadingLevel.HEADING_1 }));
    const fields = s.blocks.filter(b => b.kind === 'field');
    if (fields.length) kids.push(new d.Table({
      width: { size: 100, type: d.WidthType.PERCENTAGE },
      rows: fields.map(f => new d.TableRow({ children: [
        new d.TableCell({ width: { size: 18, type: d.WidthType.PERCENTAGE }, shading: { fill: 'F1F5F9', type: d.ShadingType.CLEAR, color: 'auto' }, children: [new d.Paragraph({ children: [new d.TextRun({ text: f.label!, bold: true })] })] }),
        new d.TableCell({ children: f.text.split('\n').map(t => new d.Paragraph(t)) }),
      ] })),
    }));
    for (const b of s.blocks) {
      if (b.kind === 'check') {
        kids.push(new d.Paragraph({ text: b.label!, heading: d.HeadingLevel.HEADING_2 }));
        b.lines!.forEach(l => kids.push(new d.Paragraph(`${l.done ? '☑' : '☐'} ${l.text}`)));
      } else if (b.kind === 'bible') kids.push(new d.Paragraph({ shading: { fill: 'FEF3C7', type: d.ShadingType.CLEAR, color: 'auto' }, children: b.text.split('\n').map((t, k) => new d.TextRun({ text: t, break: k ? 1 : 0, bold: k === 0 })) }));
      else if (b.kind === 'text') kids.push(new d.Paragraph({ children: b.text.split('\n').map((t, k) => new d.TextRun({ text: t, break: k ? 1 : 0 })) }));
    }
    if (s.img) {
      const w = Math.min(600, s.img.w), h = Math.round(s.img.h * (w / s.img.w));
      const bin = Uint8Array.from(atob(s.img.url.split(',')[1]), ch => ch.charCodeAt(0));
      kids.push(new d.Paragraph({ children: [new d.ImageRun({ type: 'jpg', data: bin, transformation: { width: w, height: h } } as any)] }));
    }
  }
  const doc = new d.Document({ creator: '옥쌤보드', title: p.name, styles: { default: { document: { run: { font: '맑은 고딕', size: 22 } } } }, sections: [{ children: kids }] });
  download(await d.Packer.toBlob(doc), fileName(p, 'docx'));
}
