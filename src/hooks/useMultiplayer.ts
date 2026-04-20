import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

export type CursorData = {
  id: string; // peer id
  name: string;
  x: number;
  y: number;
  color: string;
};

export type SyncData = {
  type: 'draw' | 'cursor' | 'clear' | 'delete' | 'sync_request' | 'sync_response' | 'state';
  payload: any;
};

export const useMultiplayer = (userName: string, userColor: string) => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorData>>({});
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const peerRef = useRef<Peer | null>(null);
  const hostConnRef = useRef<DataConnection | null>(null);
  const clientConnsRef = useRef<DataConnection[]>([]);
  
  const onReceiveDataRef = useRef<(data: SyncData) => void>(() => {});

  const broadcast = useCallback((data: SyncData, excludePeerId?: string) => {
    if (isHost) {
      clientConnsRef.current.forEach(conn => {
        if (conn.peer !== excludePeerId) {
          conn.send(data);
        }
      });
    } else if (hostConnRef.current) {
      hostConnRef.current.send(data);
    }
  }, [isHost]);

  const handleData = useCallback((data: SyncData, sourcePeerId: string) => {
    if (data.type === 'cursor') {
      setCursors(prev => ({
         ...prev,
         [data.payload.id]: data.payload
      }));
    }
    
    // Broadcast to others if I'm host (Relay)
    if (isHost && data.type !== 'sync_request' && data.type !== 'sync_response' && data.type !== 'cursor') {
      broadcast(data, sourcePeerId);
    } else if (isHost && data.type === 'cursor') {
      // Throttle cursor broadcast or just send? WebRTC is fast, let's just forward it
      broadcast(data, sourcePeerId);
    }

    onReceiveDataRef.current(data);
  }, [isHost, broadcast]);

  const createRoom = useCallback(async () => {
    setStatus('connecting');
    const newRoomId = 'edu-' + Math.random().toString(36).substr(2, 6);
    
    // Force peer generation with our custom prefix
    const peer = new Peer(newRoomId, {
      debug: 1
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      setRoomId(id);
      setIsHost(true);
      setStatus('connected');
    });

    peer.on('connection', (conn) => {
      clientConnsRef.current.push(conn);
      setPeers(prev => [...prev, conn.peer]);
      
      conn.on('data', (data) => {
        handleData(data as SyncData, conn.peer);
      });
      
      conn.on('close', () => {
        clientConnsRef.current = clientConnsRef.current.filter(c => c.peer !== conn.peer);
        setPeers(prev => prev.filter(p => p !== conn.peer));
        setCursors(prev => {
           const newCursors = {...prev};
           delete newCursors[conn.peer];
           return newCursors;
        });
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS Host Error:', err);
      setStatus('error');
    });
  }, [handleData]);

  const joinRoom = useCallback((targetRoomId: string) => {
    setStatus('connecting');
    const peer = new Peer({ debug: 1 });
    peerRef.current = peer;

    peer.on('open', (id) => {
      const conn = peer.connect(targetRoomId);
      hostConnRef.current = conn;
      
      conn.on('open', () => {
        setRoomId(targetRoomId);
        setIsHost(false);
        setStatus('connected');
        // Request initial state from host
        conn.send({ type: 'sync_request' });
      });

      conn.on('data', (data) => {
        handleData(data as SyncData, targetRoomId);
      });

      conn.on('close', () => {
        setStatus('disconnected');
        setRoomId(null);
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS Client Error:', err);
      setStatus('error');
    });
  }, [handleData]);

  const leaveRoom = useCallback(() => {
    peerRef.current?.destroy();
    setRoomId(null);
    setIsHost(false);
    setStatus('disconnected');
    setPeers([]);
    setCursors({});
    clientConnsRef.current = [];
    hostConnRef.current = null;
  }, []);

  return {
    roomId,
    isHost,
    peers,
    cursors,
    status,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcast,
    onReceiveData: (callback: (data: SyncData) => void) => {
      onReceiveDataRef.current = callback;
    },
    myPeerId: peerRef.current?.id
  };
};
