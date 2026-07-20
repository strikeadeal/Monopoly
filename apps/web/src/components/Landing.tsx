import { useState, type FormEvent } from 'react';
import type { GameSettings } from '@monopoly/game';
import type { PlayerForm } from '../api';

export function Landing({ onCreate, onJoin, busy, error, initialRoomCode = '', updateReady = false, onUpdate }: { onCreate: (player: PlayerForm, settings: GameSettings) => void; onJoin: (code: string, player: PlayerForm) => void; busy: boolean; error: string | null; initialRoomCode?: string; updateReady?: boolean; onUpdate?: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [showInstall, setShowInstall] = useState(false);
  const [nickname, setNickname] = useState(''); const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [gameMode, setGameMode] = useState<'official' | 'quick'>('official'); const [duration, setDuration] = useState<45 | 60 | 90>(60);
  const [auctions, setAuctions] = useState(true);
  const submit = (event: FormEvent) => {
    event.preventDefault(); const player = { nickname: nickname.trim() };
    if (!player.nickname) return;
    if (mode === 'create') onCreate(player, gameMode === 'quick' ? { mode: 'quick', durationMinutes: duration, auctions } : { mode: 'official', auctions });
    else onJoin(roomCode.trim().toUpperCase(), player);
  };
  return <main className="landing-shell">
    <header className="brand"><span className="brand-mark">MP</span><span>Monopoly Party</span></header>
    <section className="landing-copy"><h1>The board in every pocket.</h1><p>Start a room, pull in your friends, and let the bank run itself.</p></section>
    <form className="join-panel" onSubmit={submit}>
      <div className="mode-switch" aria-label="Choose create or join">
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create</button>
        <button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Join</button>
      </div>
      {mode === 'join' ? <label>Room code<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/[^a-z0-9]/giu, '').slice(0, 6))} placeholder="ABC234" autoCapitalize="characters" required minLength={6} /></label> : null}
      <label>Your name<input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 24))} placeholder="How friends know you" required /></label>
      {mode === 'create' ? <div className="game-options"><label>Rules<select value={gameMode} onChange={(event) => setGameMode(event.target.value as 'official' | 'quick')}><option value="official">Official</option><option value="quick">Quick</option></select></label>{gameMode === 'quick' ? <label>Time<select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 45 | 60 | 90)}><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label> : null}<label>Auctions<select value={auctions ? 'on' : 'off'} onChange={(event) => setAuctions(event.target.value === 'on')}><option value="on">On</option><option value="off">Off</option></select></label></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" disabled={busy}>{busy ? 'Setting the table…' : mode === 'create' ? 'Create game' : 'Join game'}</button>
    </form>
    <footer><button type="button" className="text-button" onClick={() => setShowInstall(true)}>Install on iPhone</button><span>Unofficial fan project. Not affiliated with Hasbro.</span></footer>
    {updateReady ? <aside className="update-banner" role="status"><span>A fresh version is ready.</span><button type="button" onClick={onUpdate}>Update now</button></aside> : null}
    {showInstall ? <div className="drawer-backdrop" onClick={() => setShowInstall(false)}><section className="install-sheet" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setShowInstall(false)} aria-label="Close install guide">×</button><span className="eyeline">IPHONE &amp; IPAD</span><h2>Put the board on your Home Screen</h2><ol><li>Open this page in Safari.</li><li>Tap the Share button in Safari’s toolbar.</li><li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li></ol><p>The app shell opens from your Home Screen. Live games still need an internet connection.</p></section></div> : null}
  </main>;
}
