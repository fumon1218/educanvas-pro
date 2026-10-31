import Peer, { type DataConnection } from 'peerjs';

/**
 * 학생 화면 보내기: 선생님 화면(지금 슬라이드와 보고 있는 범위)을 학생 기기에 읽기 전용으로 보낸다.
 * 서버 없이 PeerJS(WebRTC)로 직접 보내므로 과금이 없다.
 */
export interface CastView { x: number; y: number; w: number; h: number }

export type CastMessage =
  | { type: 'scene'; sceneId: string; index: number; total: number; name: string; data: string | null; bg: string; origin: { x: number; y: number }; view: CastView; lesson?: string; allowSave?: boolean }
  | { type: 'view'; view: CastView }
  | { type: 'laser'; x: number; y: number }
  | { type: 'poll'; poll: Poll | null }
  | { type: 'end' };

/** 선생님이 묻는 것: O/X 또는 번호 고르기 */
export interface Poll { id: string; kind: 'ox' | 'choice'; n?: number }

/** 학생이 보내는 반응 */
export type StudentMessage =
  | { type: 'hello'; sid: string; name: string }
  | { type: 'hand'; sid: string; name: string; up: boolean }
  | { type: 'answer'; sid: string; name: string; pollId: string; value: string };

export interface StudentState { sid: string; name: string; hand: boolean; handAt: number; answer?: { pollId: string; value: string } }

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
  private poll: Poll | null = null;
  /** 학생 기기 연결 → 학생 번호 */
  private sidOf = new Map<DataConnection, string>();
  students = new Map<string, StudentState>();
  onStudents: (list: StudentState[]) => void = () => {};
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
        this.safeSend(conn, { type: 'poll', poll: this.poll });
      });
      const drop = () => {
        this.conns = this.conns.filter(c => c !== conn);
        this.onCount(this.conns.length);
        const sid = this.sidOf.get(conn);
        this.sidOf.delete(conn);
        if (sid && ![...this.sidOf.values()].includes(sid)) { this.students.delete(sid); this.emitStudents(); }
      };
      conn.on('close', drop);
      conn.on('error', drop);
      // 학생 쪽에서는 손들기·답만 받는다 (화면은 바꿀 수 없음)
      conn.on('data', d => this.onStudentData(conn, d as StudentMessage));
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

  private onStudentData(conn: DataConnection, m: StudentMessage) {
    if (!m || typeof m !== 'object' || typeof (m as any).sid !== 'string') return;
    const sid = m.sid.slice(0, 40);
    const name = String((m as any).name || '').trim().slice(0, 20) || '학생';
    this.sidOf.set(conn, sid);
    const st = this.students.get(sid) ?? { sid, name, hand: false, handAt: 0 };
    st.name = name;
    if (m.type === 'hand') { st.hand = !!m.up; st.handAt = Date.now(); }
    if (m.type === 'answer' && this.poll && m.pollId === this.poll.id) st.answer = { pollId: m.pollId, value: String(m.value).slice(0, 4) };
    this.students.set(sid, st);
    this.emitStudents();
  }

  private emitStudents() { this.onStudents([...this.students.values()]); }

  setPoll(poll: Poll | null) {
    this.poll = poll;
    this.students.forEach(s => { delete s.answer; });
    this.conns.forEach(c => this.safeSend(c, { type: 'poll', poll }));
    this.emitStudents();
  }

  lowerHands(sid?: string) {
    this.students.forEach(s => { if (!sid || s.sid === sid) s.hand = false; });
    this.emitStudents();
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
  /** 연결될 때마다 처음 보낼 인사 (이름) */
  hello?: () => StudentMessage;
}) {
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  let closed = false;
  let ended = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    peer?.destroy();
    peer = new Peer({ debug: 1, config: { iceServers: ICE_SERVERS } });
    peer.on('open', () => {
      const c = peer!.connect(CAST_PREFIX + code, { reliable: true });
      conn = c;
      c.on('open', () => { handlers.onStatus('live'); const h = handlers.hello?.(); if (h) try { c.send(h); } catch { /* 무시 */ } });
      c.on('data', d => {
        const m = d as CastMessage;
        if (m?.type === 'end') { ended = true; handlers.onStatus('ended'); return; }
        handlers.onMessage(m);
      });
      c.on('close', () => { if (!closed && !ended) { handlers.onStatus('waiting'); retry = setTimeout(connect, 4000); } });
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
  return {
    stop: () => { closed = true; clearTimeout(retry); peer?.destroy(); },
    send: (m: StudentMessage) => { try { if (conn?.open) conn.send(m); } catch { /* 무시 */ } },
  };
}
