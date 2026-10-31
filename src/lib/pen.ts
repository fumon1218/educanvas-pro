import * as fabric from 'fabric';
import { getStroke } from 'perfect-freehand';

/**
 * 애플 펜슬(그리고 다른 스타일러스) 지원
 * - 필압: 펜을 세게 누르면 굵게, 살짝 대면 가늘게 (perfect-freehand, MIT)
 * - 펜을 쓰기 시작하면 손가락은 화면 이동·확대만 (손바닥·손가락으로 잘못 그어지지 않게)
 * 설정은 이 기기에 저장한다.
 */

export interface PenSettings {
  /** 펜 필압으로 굵기 바꾸기 */
  pressure: boolean;
  /** 펜이 있으면 손가락으로는 그리지 않고 화면만 옮기기 */
  fingerPans: boolean;
}
const KEY = 'okssam_pen_settings';
export const getPenSettings = (): PenSettings => {
  try { return { pressure: true, fingerPans: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { pressure: true, fingerPans: true }; }
};
export const setPenSettings = (s: Partial<PenSettings>) => {
  const next = { ...getPenSettings(), ...s };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent('okssam:pen-settings', { detail: next }));
  return next;
};

/** 판서 화면이 받은 마지막 포인터 (Fabric은 마우스 이벤트로 그리므로 펜 종류·필압을 따로 기억) */
export const lastPointer: { ev: PointerEvent | null } = { ev: null };
export const notePointer = (e: PointerEvent) => { lastPointer.ev = e; };
const penEvent = (): PointerEvent | null => (lastPointer.ev && lastPointer.ev.pointerType === 'pen' ? lastPointer.ev : null);

const avg = (a: number, b: number) => (a + b) / 2;
/** perfect-freehand 윤곽점 → SVG 경로 (부드러운 곡선) */
export function outlineToSvgPath(points: number[][]): string {
  const len = points.length;
  if (len < 4) return '';
  let a = points[0], b = points[1];
  const c = points[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i]; b = points[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return d + 'Z';
}

const strokeOptions = (width: number, last: boolean) => ({
  size: Math.max(2, width * 1.5),
  thinning: 0.62,
  smoothing: 0.55,
  streamline: 0.4,
  simulatePressure: false,
  last,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
});

/**
 * 펜으로 그릴 때만 필압 선을 만들고, 마우스·손가락은 원래 붓(PencilBrush) 그대로.
 * 결과는 채운 경로(fabric.Path)로 저장되어 지우개·실행 취소·공유가 그대로 된다.
 */
export class PressureBrush extends fabric.PencilBrush {
  pressureEnabled = true;
  private pts: number[][] = [];
  private active = false;

  onMouseDown(pointer: fabric.Point, ev: any) {
    const e = penEvent();
    this.active = !!(this.pressureEnabled && e);
    if (!this.active) return super.onMouseDown(pointer, ev);
    this.pts = [[pointer.x, pointer.y, e!.pressure || 0.5]];
    this.renderLive();
  }

  onMouseMove(pointer: fabric.Point, ev: any) {
    if (!this.active) return super.onMouseMove(pointer, ev);
    const e = penEvent();
    // 사이사이 놓친 펜 위치(coalesced)까지 모아 매끄럽게
    const extra = e && typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (extra.length > 1) {
      const inv = fabric.util.invertTransform(this.canvas.viewportTransform);
      const rect = this.canvas.upperCanvasEl.getBoundingClientRect();
      for (const ce of extra) {
        const p = fabric.util.transformPoint(new fabric.Point(ce.clientX - rect.left, ce.clientY - rect.top), inv);
        this.pts.push([p.x, p.y, ce.pressure || 0.5]);
      }
    } else this.pts.push([pointer.x, pointer.y, e?.pressure || 0.5]);
    this.renderLive();
  }

  onMouseUp(ev: any) {
    if (!this.active) return super.onMouseUp(ev);
    this.active = false;
    const ctx = this.canvas.contextTop;
    this.canvas.clearContext(ctx);
    if (this.pts.length === 0) return false;
    if (this.pts.length === 1) { const [x, y, p] = this.pts[0]; this.pts.push([x + 0.5, y + 0.5, p]); }
    const d = outlineToSvgPath(getStroke(this.pts, strokeOptions(this.width, true)));
    this.pts = [];
    if (!d) return false;
    const path = new fabric.Path(d, {
      fill: this.color,
      stroke: null,
      strokeWidth: 0,
      objectCaching: true,
    } as any);
    (path as any).isPressureInk = true;
    this.canvas.add(path);
    this.canvas.fire('path:created', { path });
    this.canvas.requestRenderAll();
    return false;
  }

  private renderLive() {
    const ctx = this.canvas.contextTop;
    this.canvas.clearContext(ctx);
    const outline = getStroke(this.pts, strokeOptions(this.width, false));
    if (outline.length < 3) return;
    ctx.save();
    const v = this.canvas.viewportTransform;
    const r = this.canvas.getRetinaScaling();
    ctx.setTransform(v[0] * r, v[1] * r, v[2] * r, v[3] * r, v[4] * r, v[5] * r);
    ctx.fillStyle = this.color;
    ctx.fill(new Path2D(outlineToSvgPath(outline)));
    ctx.restore();
  }
}
