import { QRCodeSVG } from 'qrcode.react';
import type { GameState } from '@monopoly/game';
import { TokenIcon } from './TokenIcon';

export function Lobby({ state, playerId, send }: { state: GameState; playerId: string; send: (command: Record<string, unknown> & { type: string }) => void }) {
  const me = state.players.find((player) => player.id === playerId)!;
  const roomCode = state.roomCode ?? '';
  const joinUrl = `${location.origin}${location.pathname}#/join/${roomCode}`;
  return <main className="lobby-shell">
    <header className="table-header"><div><span className="eyeline">ROOM</span><strong>{roomCode}</strong></div><div className="rule-note">{state.settings.mode === 'quick' ? `${state.settings.durationMinutes} min quick game` : 'Official rules'}</div></header>
    <section className="invite-panel"><div><h1>Bring everyone in.</h1><p>Scan the code or share room <strong>{roomCode}</strong>.</p></div><QRCodeSVG value={joinUrl} size={126} bgColor="#f8f1df" fgColor="#15241e" /></section>
    <section className="players-list"><h2>Players <span>{state.players.length}/6</span></h2>{state.players.map((player) => <div className="player-row" key={player.id}><span className="player-token"><TokenIcon token={player.token} /></span><span><strong>{player.name}</strong><small>{player.id === state.hostPlayerId ? 'Host' : player.ready ? 'Ready' : 'Getting settled'}</small></span><span className={`ready-dot ${player.ready ? 'ready' : ''}`} /></div>)}</section>
    <div className="lobby-actions"><button className="secondary-button" onClick={() => send({ type: 'SET_READY', ready: !me.ready })}>{me.ready ? 'Not ready' : 'I’m ready'}</button>{playerId === state.hostPlayerId ? <button className="primary-button" disabled={state.players.length < 2 || !state.players.every((player) => player.ready)} onClick={() => send({ type: 'START_GAME' })}>Start game</button> : <p>Waiting for the host to start.</p>}</div>
  </main>;
}
