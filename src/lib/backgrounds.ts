/**
 * 판서판 배경(수업 템플릿). 화면과 녹화 영상에 같은 그림을 그린다.
 * 무늬는 판서 좌표에 붙어 있어서 화면을 옮기거나 확대하면 같이 움직인다.
 */
export type CanvasBackground =
  | 'blank' | 'grid' | 'dot' | 'lined' | 'staff' | 'manuscript' | 'english' | 'coord' | 'dark' | 'chalk';

export const BACKGROUND_LIST: { id: CanvasBackground; label: string; hint: string }[] = [
  { id: 'blank', label: '흰 화면', hint: '아무 무늬 없음' },
  { id: 'grid', label: '모눈', hint: '도형·표 그리기' },
  { id: 'dot', label: '점 모눈', hint: '자유 배치' },
  { id: 'lined', label: '줄 노트', hint: '글쓰기' },
  { id: 'manuscript', label: '원고지', hint: '국어 쓰기' },
  { id: 'english', label: '영어 4선', hint: '알파벳 쓰기' },
  { id: 'staff', label: '오선지', hint: '음악' },
  { id: 'coord', label: '좌표평면', hint: '수학 그래프' },
  { id: 'dark', label: '칠판(검정)', hint: '어두운 화면' },
  { id: 'chalk', label: '칠판(초록)', hint: '교실 칠판' },
];

export const isDarkBackground = (bg: CanvasBackground | undefined) => bg === 'dark' || bg === 'chalk';

export const backgroundColor = (bg: CanvasBackground | undefined) =>
  bg === 'dark' ? '#1a202c' : bg === 'chalk' ? '#23432f' : '#ffffff';

export const isBackgroundId = (v: unknown): v is CanvasBackground =>
  typeof v === 'string' && BACKGROUND_LIST.some(b => b.id === v);

/**
 * 배경을 그린다.
 * @param vpt 판서 화면의 viewportTransform [zoom,0,0,zoom,panX,panY] (CSS px)
 * @param scale CSS px → ctx px 배율 (화면 해상도, 녹화 배율)
 * @param origin 좌표평면의 원점 (판서 좌표)
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D, bg: CanvasBackground, W: number, H: number, vpt: number[], scale: number,
  origin: { x: number; y: number } = { x: 0, y: 0 },
) {
  ctx.save();
  ctx.fillStyle = backgroundColor(bg);
  ctx.fillRect(0, 0, W, H);
  const z = (vpt[0] || 1) * scale;
  const px = (vpt[4] || 0) * scale, py = (vpt[5] || 0) * scale;
  /** 판서 좌표 → 화면 좌표 */
  const sx = (x: number) => x * z + px;
  const sy = (y: number) => y * z + py;
  /** 화면에 보이는 판서 좌표 범위 */
  const wx0 = -px / z, wx1 = (W - px) / z, wy0 = -py / z, wy1 = (H - py) / z;
  const lw = Math.max(1, scale);

  const hLines = (period: number, offsets: number[], style: (i: number) => [string, number, number[]?]) => {
    const start = Math.floor(wy0 / period) - 1, end = Math.ceil(wy1 / period) + 1;
    if ((end - start) * offsets.length > 4000) return;
    offsets.forEach((off, i) => {
      const [color, width, dash] = style(i);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash ?? []);
      ctx.beginPath();
      for (let k = start; k <= end; k++) {
        const y = Math.round(sy(k * period + off)) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
  };

  switch (bg) {
    case 'grid':
    case 'coord': {
      const step = 40 * z;
      if (step < 5) break;
      ctx.strokeStyle = bg === 'coord' ? '#dbe3ee' : '#e5e7eb';
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let x = ((px % step) + step) % step; x < W; x += step) { const X = Math.round(x) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
      for (let y = ((py % step) + step) % step; y < H; y += step) { const Y = Math.round(y) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
      ctx.stroke();
      if (bg === 'coord') {
        const ox = sx(origin.x), oy = sy(origin.y);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(0, oy); ctx.lineTo(W, oy);
        ctx.moveTo(ox, 0); ctx.lineTo(ox, H);
        ctx.stroke();
        // 눈금 숫자
        if (step >= 22) {
          ctx.fillStyle = '#64748b';
          ctx.font = `${Math.round(12 * scale)}px Pretendard, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const n0 = Math.ceil((wx0 - origin.x) / 40), n1 = Math.floor((wx1 - origin.x) / 40);
          for (let n = n0; n <= n1; n++) if (n) ctx.fillText(String(n), sx(origin.x + n * 40), oy + 4 * scale);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          const m0 = Math.ceil((wy0 - origin.y) / 40), m1 = Math.floor((wy1 - origin.y) / 40);
          for (let n = m0; n <= m1; n++) if (n) ctx.fillText(String(-n), ox - 5 * scale, sy(origin.y + n * 40));
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('0', ox - 5 * scale, oy + 4 * scale);
        }
      }
      break;
    }
    case 'dot': {
      const step = 24 * z;
      if (step < 5) break;
      ctx.fillStyle = '#d1d5db';
      const r = 1.5 * scale;
      const ox = ((px % step) + step) % step, oy = ((py % step) + step) % step;
      for (let x = ox; x < W; x += step) for (let y = oy; y < H; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'lined': {
      if (36 * z < 5) break;
      hLines(36, [0], () => ['#cbd5e1', lw]);
      // 왼쪽 여백 빨간 줄
      const mx = sx(80);
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H); ctx.stroke();
      break;
    }
    case 'staff': {
      // 오선 하나: 줄 간격 14, 다음 오선까지 120
      if (14 * z < 2.5) break;
      hLines(120, [30, 44, 58, 72, 86], () => ['#94a3b8', lw]);
      break;
    }
    case 'english': {
      // 4선: 위 점선·가운데 점선은 연하게, 기준선(3번째)은 빨강
      if (16 * z < 3) break;
      hLines(110, [30, 50, 70, 90], i => (i === 2 ? ['#f87171', 1.4 * lw] : i === 1 ? ['#94a3b8', lw, [6 * scale, 5 * scale]] : ['#94a3b8', lw]));
      break;
    }
    case 'manuscript': {
      // 원고지: 칸 40, 줄 사이 띄움 14
      const cell = 40, gap = 14, period = cell + gap;
      if (cell * z < 8) break;
      ctx.strokeStyle = '#86b7a0';
      ctx.lineWidth = lw;
      ctx.beginPath();
      const r0 = Math.floor(wy0 / period) - 1, r1 = Math.ceil(wy1 / period) + 1;
      const c0 = Math.floor(wx0 / cell) - 1, c1 = Math.ceil(wx1 / cell) + 1;
      if ((r1 - r0) * (c1 - c0) < 20000) {
        for (let r = r0; r <= r1; r++) {
          const top = sy(r * period + gap), bot = sy(r * period + gap + cell);
          ctx.moveTo(0, top); ctx.lineTo(W, top);
          ctx.moveTo(0, bot); ctx.lineTo(W, bot);
          for (let c = c0; c <= c1; c++) { const x = sx(c * cell); ctx.moveTo(x, top); ctx.lineTo(x, bot); }
        }
      }
      ctx.stroke();
      break;
    }
    case 'chalk': {
      // 칠판 질감: 아주 옅은 얼룩
      const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
  ctx.restore();
}
