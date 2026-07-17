import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type GameCommand, type GameState, type ServerMessage } from '@monopoly/game';
import { createTicket, socketUrl, type SessionIdentity } from './api';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export function useGameConnection(session: SessionIdentity | null) {
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(session ? 'connecting' : 'offline');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const syncedSocketRef = useRef<WebSocket | null>(null);
  const retries = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    stateRef.current = null;
    syncedSocketRef.current = null;
    setState(null);
    if (!session) { setStatus('offline'); return; }
    let stopped = false;
    let retryTimer = 0;
    let heartbeat = 0;
    let pongDeadline = 0;
    let connecting = false;

    const clearRetry = () => { window.clearTimeout(retryTimer); retryTimer = 0; };
    const clearHeartbeat = () => {
      window.clearInterval(heartbeat);
      window.clearTimeout(pongDeadline);
      heartbeat = 0;
      pongDeadline = 0;
    };
    const scheduleReconnect = () => {
      if (stopped || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        void connect();
      }, Math.min(1_000 * 2 ** retries.current, 15_000));
    };
    const connect = async () => {
      if (stopped || connecting) return;
      const existing = socketRef.current;
      if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) return;
      connecting = true;
      clearRetry();
      try {
        setStatus(retries.current || stateRef.current ? 'reconnecting' : 'connecting');
        const { ticket } = await createTicket(session);
        if (stopped) { connecting = false; return; }
        const socket = new WebSocket(socketUrl(session, ticket));
        socketRef.current = socket;
        syncedSocketRef.current = null;
        connecting = false;
        socket.onopen = () => {
          if (stopped) { socket.close(); return; }
          clearHeartbeat();
          heartbeat = window.setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) return;
            socket.send('ping');
            window.clearTimeout(pongDeadline);
            pongDeadline = window.setTimeout(() => socket.close(), 8_000);
          }, 15_000);
        };
        socket.onmessage = (event) => {
          if (stopped || socket !== socketRef.current) return;
          let message: ServerMessage;
          try { message = JSON.parse(String(event.data)) as ServerMessage; }
          catch { setError('The table sent an unreadable update. Reconnecting safely.'); socket.close(); return; }
          if (message.type === 'snapshot') {
            stateRef.current = message.state;
            setState(message.state);
            syncedSocketRef.current = socket;
            retries.current = 0;
            setStatus('online');
            setError(null);
          } else if (message.type === 'pong') {
            window.clearTimeout(pongDeadline);
            pongDeadline = 0;
          } else if (message.type === 'commandRejected') {
            setError(message.message);
            if (message.state) { stateRef.current = message.state; setState(message.state); }
          } else if (message.type === 'protocolMismatch') setError('The game was updated. Refresh this page to continue safely.');
        };
        socket.onclose = () => {
          if (socketRef.current !== socket) return;
          clearHeartbeat();
          socketRef.current = null;
          if (syncedSocketRef.current === socket) syncedSocketRef.current = null;
          if (stopped) return;
          setStatus('reconnecting'); retries.current += 1;
          scheduleReconnect();
        };
        socket.onerror = () => socket.close();
      } catch (cause) {
        connecting = false;
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : 'Connection failed.'); setStatus('reconnecting'); retries.current += 1;
        scheduleReconnect();
      }
    };
    const reconnectNow = () => {
      clearRetry();
      const socket = socketRef.current;
      if (!socket || socket.readyState === WebSocket.CLOSED) void connect();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') reconnectNow(); };
    const onOffline = () => {
      clearRetry();
      syncedSocketRef.current = null;
      setStatus('reconnecting');
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      scheduleReconnect();
    };
    const onOnline = () => reconnectNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    void connect();
    return () => {
      stopped = true;
      clearRetry();
      clearHeartbeat();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      const socket = socketRef.current;
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
      if (syncedSocketRef.current === socket) syncedSocketRef.current = null;
    };
  }, [session]);

  const send = useCallback((command: Omit<GameCommand, 'playerId'>) => {
    const socket = socketRef.current;
    if (!session || socket?.readyState !== WebSocket.OPEN || syncedSocketRef.current !== socket || !stateRef.current) { setError('Wait for the game to reconnect.'); return; }
    const { type, ...payload } = command;
    socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, commandId: crypto.randomUUID(), expectedRevision: stateRef.current.revision, type, payload }));
  }, [session]);

  return { state, status, error, clearError: () => setError(null), send };
}
