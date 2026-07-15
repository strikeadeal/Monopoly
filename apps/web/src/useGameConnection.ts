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
  const retries = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    stateRef.current = null;
    setState(null);
    if (!session) { setStatus('offline'); return; }
    let stopped = false;
    let retryTimer = 0;
    let heartbeat = 0;
    const connect = async () => {
      try {
        setStatus(retries.current ? 'reconnecting' : 'connecting');
        const { ticket } = await createTicket(session);
        if (stopped) return;
        const socket = new WebSocket(socketUrl(session, ticket));
        socketRef.current = socket;
        socket.onopen = () => {
          if (stopped) { socket.close(); return; }
          retries.current = 0; setStatus('online'); setError(null);
          heartbeat = window.setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, 25_000);
        };
        socket.onmessage = (event) => {
          if (stopped) return;
          const message = JSON.parse(String(event.data)) as ServerMessage;
          if (message.type === 'snapshot') setState(message.state);
          else if (message.type === 'commandRejected') { setError(message.message); if (message.state) setState(message.state); }
          else if (message.type === 'protocolMismatch') setError('The game was updated. Refresh this page to continue safely.');
        };
        socket.onclose = () => {
          window.clearInterval(heartbeat);
          if (stopped) return;
          setStatus('reconnecting'); retries.current += 1;
          retryTimer = window.setTimeout(connect, Math.min(1_000 * 2 ** retries.current, 15_000));
        };
        socket.onerror = () => socket.close();
      } catch (cause) {
        if (stopped) return;
        setError(cause instanceof Error ? cause.message : 'Connection failed.'); setStatus('reconnecting'); retries.current += 1;
        retryTimer = window.setTimeout(connect, Math.min(1_000 * 2 ** retries.current, 15_000));
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible' && (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED)) void connect(); };
    document.addEventListener('visibilitychange', onVisibility); void connect();
    return () => { stopped = true; window.clearTimeout(retryTimer); window.clearInterval(heartbeat); document.removeEventListener('visibilitychange', onVisibility); const socket = socketRef.current; socket?.close(); if (socketRef.current === socket) socketRef.current = null; };
  }, [session]);

  const send = useCallback((command: Omit<GameCommand, 'playerId'>) => {
    if (!session || socketRef.current?.readyState !== WebSocket.OPEN || !stateRef.current) { setError('Wait for the game to reconnect.'); return; }
    const { type, ...payload } = command;
    socketRef.current.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, commandId: crypto.randomUUID(), expectedRevision: stateRef.current.revision, type, payload }));
  }, [session]);

  return { state, status, error, clearError: () => setError(null), send };
}
