import { useEffect, useRef, useState } from 'react';
import type { GameCommand, GameSettings } from '@monopoly/game';
import { createRoom, joinRoom, leaveRoom, listSessions, readSession, removeSession, storeSession, type PlayerForm, type SessionIdentity } from './api';
import { friendlyError } from './errorCopy';
import { useGameConnection } from './useGameConnection';
import { GameScreen } from './components/GameScreen';
import { Landing } from './components/Landing';
import { Lobby } from './components/Lobby';

function routeCode() { return location.hash.match(/^#\/(?:join|room)\/([A-Z2-9]{6})$/u)?.[1] ?? null; }
export default function App() {
  const [code, setCode] = useState<string | null>(() => routeCode());
  const [session, setSession] = useState<SessionIdentity | null>(() => { const initial = routeCode(); return initial ? readSession(initial) : null; });
  const [busy, setBusy] = useState(false); const [entryError, setEntryError] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [leaving, setLeaving] = useState(false); const [leaveError, setLeaveError] = useState<string | null>(null); const leaveRequestId = useRef<string | null>(null);
  const connection = useGameConnection(session);
  useEffect(() => {
    const update = () => {
      const next = routeCode();
      setCode(next);
      // Keep the live session object stable while we stay in the same room so the socket is not torn down.
      setSession((previous) => (next && previous?.roomCode === next ? previous : next ? readSession(next) : null));
    };
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { const ready = () => setUpdateReady(true); addEventListener('monopoly:update-ready', ready); return () => removeEventListener('monopoly:update-ready', ready); }, []);
  useEffect(() => {
    if (connection.status !== 'rejected' || !session) return;
    removeSession(session.roomCode);
    setSession(null);
    setEntryError('That table is no longer available. Join a new room or start one.');
    location.hash = '#/';
  }, [connection.status, session]);
  const complete = (identity: SessionIdentity) => { storeSession(identity); setSession(identity); location.hash = `#/room/${identity.roomCode}`; };
  const create = async (player: PlayerForm, settings: GameSettings) => { setBusy(true); setEntryError(null); try { complete(await createRoom(player, settings)); } catch (error) { setEntryError(friendlyError(error instanceof Error ? error.message : 'Could not create game.')); } finally { setBusy(false); } };
  const join = async (code: string, player: PlayerForm) => { setBusy(true); setEntryError(null); try { complete(await joinRoom(code, player)); } catch (error) { setEntryError(friendlyError(error instanceof Error ? error.message : 'Could not join game.')); } finally { setBusy(false); } };
  const leave = async () => {
    if (!session) return;
    setLeaving(true); setLeaveError(null); leaveRequestId.current ??= crypto.randomUUID();
    try {
      await leaveRoom(session, leaveRequestId.current); removeSession(session.roomCode); leaveRequestId.current = null; setSession(null); location.hash = '#/';
    } catch (error) { setLeaveError(error instanceof Error ? error.message : 'Could not leave the room.'); }
    finally { setLeaving(false); }
  };
  const exitToHome = () => { setSession(null); location.hash = '#/'; };
  if (!session) return <Landing key={code ?? 'landing'} initialRoomCode={code ?? ''} onCreate={(player, settings) => void create(player, settings)} onJoin={(joinCode, player) => void join(joinCode, player)} busy={busy} error={entryError} updateReady={updateReady} onUpdate={() => window.dispatchEvent(new Event('monopoly:apply-update'))} resumeSessions={listSessions()} onResume={(roomCode) => { setEntryError(null); location.hash = `#/room/${roomCode}`; }} />;
  if (!connection.state) return <main className="loading-shell"><div className="brand-mark">MP</div><div className="spinner" /><h1>Finding your table…</h1><p>{connection.error ?? 'Connecting securely to the room.'}</p><button type="button" className="text-button" onClick={exitToHome}>Back to home</button></main>;
  const send = (command: Record<string, unknown> & { type: string }) => connection.send(command as Omit<GameCommand, 'playerId'>);
  return connection.state.status === 'lobby' ? <Lobby state={connection.state} playerId={session.playerId} send={send} onLeave={leave} leaving={leaving} leaveError={leaveError} /> : <GameScreen state={connection.state} playerId={session.playerId} status={connection.status} error={connection.error} clearError={connection.clearError} send={send} onLeave={leave} leaving={leaving} leaveError={leaveError} onExit={exitToHome} />;
}
