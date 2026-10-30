import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Peer, { DataConnection } from 'peerjs';

export type CursorData = {
  id: string; // peer id
  name: string;
  x: number;
  y: number;
  color: string;
  sceneId?: string;
};

export type SyncData =
  | { type: 'cursor'; payload: CursorData }
  | { type: 'sync_request'; payload?: undefined }
  /** 슬라이드 하나의 내용 */
  | { type: 'scene'; payload: { sceneId: string; name?: string; data: string | null } }
  /** 슬라이드 전체 목록과 내용 (참가 직후, 슬라이드 추가·삭제 시) */
  | { type: 'full'; payload: { scenes: { id: string; name: string; data: string | null }[] } };

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.nextcloud.com:443' },
];

const CURSOR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const NAME_KEY = 'educanvas_user_name';

function loadName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export const useMultiplayer = () => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorData>>({});
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [userName, setUserNameState] = useState<string>(loadName);
  const userColor = useMemo(() => CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)], []);

  const peerRef = useRef<Peer | null>(null);
  const hostConnRef = useRef<DataConnection | null>(null);
  const clientConnsRef = useRef<DataConnection[]>([]);
  const connTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 이벤트 핸들러가 항상 최신 상태를 보도록 ref로 관리 (방장 중계 오류 수정)
  const isHostRef = useRef(false);
  const onReceiveDataRef = useRef<(data: SyncData, fromPeerId: string) => void>(() => {});

  useEffect(() => () => {
    if (connTimeoutRef.current) clearTimeout(connTimeoutRef.current);
    peerRef.current?.destroy();
  }, []);

  const setUserName = useCallback((name: string) => {
    setUserNameState(name);
    try { localStorage.setItem(NAME_KEY, name); } catch { /* 저장 불가 환경 무시 */ }
  }, []);

  const safeSend = (conn: DataConnection, data: SyncData) => {
    try {
      if (conn.open) conn.send(data);
    } catch (err) {
      console.warn('전송 실패', err);
    }
  };

  /** 방장은 모든 참가자에게, 참가자는 방장에게 보낸다 (방장이 다른 참가자에게 중계) */
  const broadcast = useCallback((data: SyncData, excludePeerId?: string) => {
    if (isHostRef.current) {
      clientConnsRef.current.forEach(conn => { if (conn.peer !== excludePeerId) safeSend(conn, data); });
    } else if (hostConnRef.current) {
      safeSend(hostConnRef.current, data);
    }
  }, []);

  const sendTo = useCallback((peerId: string, data: SyncData) => {
    const conn = clientConnsRef.current.find(c => c.peer === peerId);
    if (conn) safeSend(conn, data);
  }, []);

  const handleData = useCallback((data: SyncData, sourcePeerId: string) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'cursor') {
      setCursors(prev => ({ ...prev, [data.payload.id]: data.payload }));
    }
    if (isHostRef.current && data.type !== 'sync_request') {
      broadcast(data, sourcePeerId);
    }
    onReceiveDataRef.current(data, sourcePeerId);
  }, [broadcast]);

  const resetState = () => {
    setRoomId(null);
    setIsHost(false);
    isHostRef.current = false;
    setPeers([]);
    setCursors({});
    setMyPeerId(null);
    clientConnsRef.current = [];
    hostConnRef.current = null;
  };

  const createRoom = useCallback(() => {
    peerRef.current?.destroy();
    setStatus('connecting');
    setErrorDetail(null);
    const newRoomId = 'edu-' + Math.random().toString(36).slice(2, 8);
    const peer = new Peer(newRoomId, { debug: 1, config: { iceServers: ICE_SERVERS } });
    peerRef.current = peer;

    peer.on('open', id => {
      isHostRef.current = true;
      setIsHost(true);
      setRoomId(id);
      setMyPeerId(id);
      setStatus('connected');
    });

    peer.on('connection', conn => {
      conn.on('open', () => {
        clientConnsRef.current.push(conn);
        setPeers(prev => [...prev, conn.peer]);
      });
      conn.on('data', data => handleData(data as SyncData, conn.peer));
      conn.on('close', () => {
        clientConnsRef.current = clientConnsRef.current.filter(c => c.peer !== conn.peer);
        setPeers(prev => prev.filter(p => p !== conn.peer));
        setCursors(prev => {
          const next = { ...prev };
          delete next[conn.peer];
          return next;
        });
      });
    });

    peer.on('disconnected', () => peer.reconnect());
    peer.on('error', err => {
      console.error('PeerJS 방장 오류:', err);
      setErrorDetail((err as any).type);
      setStatus('error');
    });
  }, [handleData]);

  const joinRoom = useCallback((targetRoomId: string) => {
    peerRef.current?.destroy();
    setStatus('connecting');
    setErrorDetail(null);
    const peer = new Peer({ debug: 1, config: { iceServers: ICE_SERVERS } });
    peerRef.current = peer;

    peer.on('open', id => {
      setMyPeerId(id);
      const conn = peer.connect(targetRoomId, { reliable: true });
      hostConnRef.current = conn;
      let connected = false;
      connTimeoutRef.current = setTimeout(() => {
        if (!connected) {
          setErrorDetail('timeout');
          setStatus('error');
          peer.destroy();
        }
      }, 20000);

      conn.on('open', () => {
        connected = true;
        if (connTimeoutRef.current) clearTimeout(connTimeoutRef.current);
        isHostRef.current = false;
        setIsHost(false);
        setRoomId(targetRoomId);
        setStatus('connected');
        safeSend(conn, { type: 'sync_request' });
      });
      conn.on('data', data => handleData(data as SyncData, targetRoomId));
      conn.on('close', () => {
        resetState();
        setStatus('disconnected');
      });
    });

    peer.on('error', err => {
      console.error('PeerJS 참가자 오류:', err);
      setErrorDetail((err as any).type);
      setStatus('error');
    });
  }, [handleData]);

  const leaveRoom = useCallback(() => {
    if (connTimeoutRef.current) clearTimeout(connTimeoutRef.current);
    peerRef.current?.destroy();
    peerRef.current = null;
    resetState();
    setStatus('disconnected');
    setErrorDetail(null);
  }, []);

  const onReceiveData = useCallback((callback: (data: SyncData, fromPeerId: string) => void) => {
    onReceiveDataRef.current = callback;
  }, []);

  return {
    roomId,
    isHost,
    peers,
    cursors,
    status,
    errorDetail,
    myPeerId,
    userName,
    setUserName,
    userColor,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcast,
    sendTo,
    onReceiveData,
  };
};

export type Multiplayer = ReturnType<typeof useMultiplayer>;
