/**
 * 개별화교육계획 → 옥쌤보드 노트(쪽 그림)
 * 작성 도구(iframe)의 계획서 HTML을 쪽 나눔(.pb)마다 A4 폭으로 그리고, 길면 A4 높이로 잘라 쪽 그림을 만든다.
 */
import { toCanvas } from 'html-to-image';

const A4_W = 794, A4_H = 1123; // 96dpi A4
const SCALE = 1.6;              // 확대해도 읽히게 (아이폰 캔버스 한도 안)

export async function iepToPages(frame: HTMLIFrameElement, onStatus?: (s: string) => void): Promise<{ name: string; pages: string[] } | null> {
  const win = frame.contentWindow as any;
  const doc = frame.contentDocument;
  const exp = win?.OKS_IEP?.exportPlan?.();
  if (!doc || !exp) return null;
  const body = String(exp.html).replace(/^<div class="docwrap">/, '').replace(/<\/div>\s*$/, '');
  const parts = body.split('<div class="pb"></div>').filter(p => p.trim());
  const host = doc.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;width:${A4_W}px;z-index:-1;opacity:1;pointer-events:none;background:#fff`;
  doc.body.appendChild(host);
  const pages: string[] = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      onStatus?.(`계획서 ${i + 1}/${parts.length}부분 그리는 중…`);
      host.innerHTML = `<div class="docwrap" style="background:#fff;padding:48px 44px;width:${A4_W}px;box-sizing:border-box">${parts[i]}</div>`;
      const el = host.firstElementChild as HTMLElement;
      await new Promise(r => setTimeout(r, 30));
      const c = await toCanvas(el, { pixelRatio: SCALE, backgroundColor: '#ffffff', width: A4_W, height: el.scrollHeight, cacheBust: false });
      // A4 높이로 자르기
      const pageH = Math.round(A4_H * SCALE);
      for (let y = 0; y < c.height; y += pageH) {
        const h = Math.min(pageH, c.height - y);
        if (h < 40 * SCALE && y > 0) break; // 거의 빈 꼬리는 버림
        const pc = document.createElement('canvas');
        pc.width = c.width; pc.height = pageH;
        const g = pc.getContext('2d')!;
        g.fillStyle = '#fff'; g.fillRect(0, 0, pc.width, pc.height);
        g.drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
        pages.push(pc.toDataURL('image/jpeg', 0.9));
      }
    }
  } finally { host.remove(); }
  return { name: exp.name, pages };
}
