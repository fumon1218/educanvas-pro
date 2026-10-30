import Peer, { type DataConnection } from 'peerjs';

/**
 * 학생 화면 보내기: 선생님 화면(지금 슬라이드와 보고 있는 범위)을 학생 기기에 읽기 전용으로 보낸다.
 * 서버 없이 PeerJS(WebRTC)로 직접 보내므로 과금이 없다.
 */
export interface CastView { x: number; y: number; w: number; h: number }

export type CastMessage =
  | { type: 'scene'; sceneId: string; index: number; total: number; name: string; data: string | null; bg: string; origin: { x: number; y: number }; view: CastView }
  | { type: 'view'; view: CastView }
  | { type: 'laser'; x: number; y: number }
  | { type: 'end' };

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.nextcloud.com:443' },
];
export const CAST_PREFIX = 'okb-cast-';

/** 헷갈리는 글자(0/O, 1/I/l)를 뺀 6자리 코드 */
export function makeCastCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  buf.forEach(n => { s += chars[n % chars.length]; });
  return s;
}

export function castUrl(code: string) {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('watch', code);
  return u.toString();
}

/** 선생님 쪽 */
export class StudentCaster {
  private peer: Peer | null = null;
  private conns: DataConnection[] = [];
  private last: Extract<CastMessage, { type: 'scene' }> | null = null;
  onCount: (n: number) => void = () => {};
  onStatus: (s: 'connecting' | 'live' | 'error', detail?: string) => void = () => {};

  constructor(public code: string) {}

  start() {
    this.onStatus('connecting');
    const peer = new Peer(CAST_PREFIX + this.code, { debug: 1, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;
    peer.on('open', () => this.onStatus('live'));
    peer.on('connection', conn => {
      conn.on('open', () => {
        this.conns.push(conn);
        this.onCount(this.conns.length);
        if (this.last) this.safeSend(conn, this.last);
      });
      const drop = () => {
        this.conns = this.conns.filter(c => c !== conn);
        this.onCount(this.conns.length);
      };
      conn.on('close', drop);
      conn.on('error', drop);
      // 학생 쪽에서 오는 내용은 받지 않는다 (읽기 전용)
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* 무시 */ } });
    peer.on('error', err => this.onStatus('error', (err as any)?.type));
  }

  private safeSend(conn: DataConnection, msg: CastMessage) {
    try { if (conn.open) conn.send(msg); } catch (e) { console.warn('학생 화면 전송 실패', e); }
  }

  send(msg: CastMessage) {
    if (msg.type === 'scene') this.last = msg;
    else if (msg.type === 'view' && this.last) this.last = { ...this.last, view: msg.view };
    this.conns.forEach(c => this.safeSend(c, msg));
  }

  get count() { return this.conns.length; }

  stop() {
    this.conns.forEach(c => this.safeSend(c, { type: 'end' }));
    setTimeout(() => { try { this.peer?.destroy(); } catch { /* 무시 */ } }, 300);
    this.conns = [];
  }
}

/** 학생 쪽 */
export function watchCast(code: string, handlers: {
  onMessage: (m: CastMessage) => void;
  onStatus: (s: 'connecting' | 'live' | 'waiting' | 'ended' | 'error') => void;
}) {
  let peer: Peer | null = null;
  let closed = false;
  let ended = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    peer?.destroy();
    peer = new Peer({ debug: 1, config: { iceServers: ICE_SERVERS } });
    peer.on('open', () => {
      const conn = peer!.connect(CAST_PREFIX + code, { reliable: true });
      conn.on('open', () => handlers.onStatus('live'));
      conn.on('data', d => {
        const m = d as CastMessage;
        if (m?.type === 'end') { ended = true; handlers.onStatus('ended'); return; }
        handlers.onMessage(m);
      });
      conn.on('close', () => { if (!closed && !ended) { handlers.onStatus('waiting'); retry = setTimeout(connect, 4000); } });
    });
    peer.on('error', err => {
      if (ended) return;
      // 선생님이 아직 시작하지 않았거나 잠시 끊긴 경우: 다시 시도
      if ((err as any)?.type === 'peer-unavailable') handlers.onStatus('waiting');
      else handlers.onStatus('error');
      clearTimeout(retry);
      retry = setTimeout(connect, 4000);
    });
  };
  connect();
  return () => { closed = true; clearTimeout(retry); peer?.destroy(); };
}
