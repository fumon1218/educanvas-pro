/**
 * 수업 녹화: 판서 캔버스 + 레이저 + (가림막·스포트라이트) + 카메라 작은 화면을
 * 하나의 녹화용 캔버스에 합성하고, 마이크 소리와 함께 MediaRecorder로 녹화한다.
 * 모든 처리는 브라우저 안에서만 이루어지며 파일은 사용자의 컴퓨터에 저장된다.
 */
export interface RecorderSources {
  container: HTMLElement;
  getLayers: () => (HTMLCanvasElement | null | undefined)[];
  getBackground: () => { color: string; pattern: 'none' | 'grid' | 'dot'; vpt: number[] };
  drawOverlays?: (ctx: CanvasRenderingContext2D, w: number, h: number, scale: number) => void;
}

export interface RecorderOptions {
  mic: boolean;
  camera: boolean;
}

export interface Chapter {
  at: number; // 녹화 시작 후 경과(ms, 일시정지 제외)
  label: string;
}

export interface RecordingResult {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: 'webm' | 'mp4';
  durationMs: number;
  chapters: Chapter[];
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
];

export const isRecordingSupported = () =>
  typeof window !== 'undefined' && 'MediaRecorder' in window && !!HTMLCanvasElement.prototype.captureStream;

export const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
};

export class LessonRecorder {
  private out = document.createElement('canvas');
  private ctx = this.out.getContext('2d')!;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private streams: MediaStream[] = [];
  private camVideo: HTMLVideoElement | null = null;
  private activeMs = 0;
  private resumedAt = 0;
  private chapters: Chapter[] = [];
  private mimeType = '';
  state: 'idle' | 'recording' | 'paused' = 'idle';

  constructor(private sources: RecorderSources) {}

  elapsed() {
    return this.activeMs + (this.state === 'recording' ? performance.now() - this.resumedAt : 0);
  }

  mark(label: string) {
    if (this.state === 'idle') return;
    const at = this.elapsed();
    const last = this.chapters[this.chapters.length - 1];
    if (last && last.label === label) return;
    if (last && at - last.at < 1500) last.label = label; // 빠르게 넘긴 경우 마지막 것만
    else this.chapters.push({ at, label });
  }

  async start(opts: RecorderOptions, firstLabel: string) {
    const { container } = this.sources;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = Math.round(container.clientWidth * dpr);
    let h = Math.round(container.clientHeight * dpr);
    const maxW = 1920;
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    this.out.width = w - (w % 2);
    this.out.height = h - (h % 2);

    // 마이크·카메라 (권한을 거절하면 해당 항목 없이 녹화)
    let audioTrack: MediaStreamTrack | null = null;
    if (opts.mic) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        this.streams.push(s);
        audioTrack = s.getAudioTracks()[0] || null;
      } catch (err) {
        console.warn('마이크를 사용할 수 없습니다', err);
        throw new Error('mic');
      }
    }
    if (opts.camera) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        this.streams.push(s);
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.srcObject = s;
        await v.play().catch(() => {});
        this.camVideo = v;
      } catch (err) {
        console.warn('카메라를 사용할 수 없습니다', err);
        this.camVideo = null;
      }
    }

    this.drawFrame();
    this.timer = setInterval(() => this.drawFrame(), 1000 / 30);

    const canvasStream = this.out.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    const stream = new MediaStream(tracks);
    this.streams.push(canvasStream);

    this.mimeType = MIME_CANDIDATES.find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.recorder = new MediaRecorder(stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
    });
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start(1000);
    this.state = 'recording';
    this.activeMs = 0;
    this.resumedAt = performance.now();
    this.chapters = [{ at: 0, label: firstLabel }];
  }

  pause() {
    if (this.state !== 'recording' || !this.recorder) return;
    this.recorder.pause();
    this.activeMs += performance.now() - this.resumedAt;
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused' || !this.recorder) return;
    this.recorder.resume();
    this.resumedAt = performance.now();
    this.state = 'recording';
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) { reject(new Error('not-recording')); return; }
      const durationMs = this.elapsed();
      rec.onstop = async () => {
        const type = this.mimeType.split(';')[0] || rec.mimeType.split(';')[0] || 'video/webm';
        let blob = new Blob(this.chunks, { type });
        this.cleanup();
        // 브라우저가 만든 WEBM에는 길이 정보가 없어 일부 플레이어에서 넘겨 보기가 안 되므로 길이를 써 넣는다
        if (type.includes('webm')) {
          try {
            const { default: fixWebmDuration } = await import('fix-webm-duration');
            blob = await fixWebmDuration(blob, durationMs, { logger: false });
          } catch (err) {
            console.warn('영상 길이 정보를 넣지 못했습니다', err);
          }
        }
        resolve({
          blob,
          url: URL.createObjectURL(blob),
          mimeType: type,
          extension: type.includes('mp4') ? 'mp4' : 'webm',
          durationMs,
          chapters: this.chapters,
        });
      };
      rec.onerror = e => { this.cleanup(); reject(e); };
      if (rec.state !== 'inactive') rec.stop();
    });
  }

  cancel() {
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch { /* 무시 */ }
    this.cleanup();
  }

  private cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    this.streams = [];
    this.camVideo = null;
    this.recorder = null;
    this.state = 'idle';
  }

  private drawFrame() {
    const { ctx, out } = this;
    const W = out.width, H = out.height;
    const cw = this.sources.container.clientWidth || 1;
    const scale = W / cw;
    const bg = this.sources.getBackground();

    // 배경
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    if (bg.pattern !== 'none') {
      const zoom = bg.vpt[0] || 1;
      const step = (bg.pattern === 'grid' ? 40 : 24) * zoom * scale;
      if (step > 4) {
        const ox = ((bg.vpt[4] || 0) * scale) % step;
        const oy = ((bg.vpt[5] || 0) * scale) % step;
        if (bg.pattern === 'grid') {
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = Math.max(1, scale);
          ctx.beginPath();
          for (let x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
          for (let y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
          ctx.stroke();
        } else {
          ctx.fillStyle = '#d1d5db';
          const r = 1.5 * scale;
          for (let x = ox + step / 2; x < W; x += step) {
            for (let y = oy + step / 2; y < H; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
          }
        }
      }
    }

    // 판서 캔버스 (완성된 선 + 그리는 중인 선) + 레이저
    for (const layer of this.sources.getLayers()) {
      if (layer && layer.width > 0 && layer.height > 0) ctx.drawImage(layer, 0, 0, W, H);
    }

    // 가림막·스포트라이트
    this.sources.drawOverlays?.(ctx, W, H, scale);

    // 카메라 (오른쪽 아래 작은 화면)
    const v = this.camVideo;
    if (v && v.videoWidth > 0) {
      const cwid = Math.round(W * 0.2);
      const chei = Math.round(cwid * (v.videoHeight / v.videoWidth));
      const m = Math.round(16 * scale);
      const x = W - cwid - m, y = H - chei - m;
      const r = 14 * scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, cwid, chei, r);
      ctx.clip();
      ctx.drawImage(v, x, y, cwid, chei);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.roundRect(x, y, cwid, chei, r);
      ctx.stroke();
    }
  }
}
