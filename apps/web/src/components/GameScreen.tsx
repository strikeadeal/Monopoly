import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOARD, PROPERTY_SPACES, getPropertyActionAvailability, netWorth, type GameState, type StreetSpace, type TradeOffer } from '@monopoly/game';
import { Board } from './Board';
import { ActivityTimeline } from './ActivityTimeline';
import { BoardNavigator } from './BoardNavigator';
import { CardReveal } from './CardReveal';
import { DiceRoll } from './Dice';
import { LeaveRoom } from './LeaveRoom';
import { PlayerBalances } from './PlayerBalances';
import { TableLedger } from './TableLedger';
import { useCompactLayout, useLandscapePhone } from '../useCompactLayout';
import { useMovementAnimation } from '../useMovementAnimation';

type Sender = (command: Record<string, unknown> & { type: string }) => void;
type GameSection = 'game' | 'assets' | 'trade' | 'activity';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const groupNames: Record<string, string> = { brown: 'Brown', 'light-blue': 'Light blue', pink: 'Pink', orange: 'Orange', red: 'Red', yellow: 'Yellow', green: 'Green', 'dark-blue': 'Dark blue', railroad: 'Railroads', utility: 'Utilities' };
const groupColors: Record<string, string> = { brown: '#8b5a3c', 'light-blue': '#63b8d5', pink: '#cf5b9d', orange: '#e98a32', red: '#c9423b', yellow: '#e0bd3d', green: '#438d64', 'dark-blue': '#315b92', railroad: '#5b625e', utility: '#b08a45' };
const propertyGroup = (space: (typeof PROPERTY_SPACES)[number]) => space.type === 'street' ? space.color : space.type;

function PauseIcon({ paused }: { paused: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {paused ? <path d="m8 5 11 7-11 7Z" /> : <path d="M8 5v14M16 5v14" />}
  </svg>;
}

function SectionIcon({ section }: { section: GameSection }) {
  if (section === 'game') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l3 6-2 8-4-3h-4l-4 3-2-8 3-6Zm1 5v4m-2-2h4m6-1v.01m2 3v.01" /></svg>;
  if (section === 'assets') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5V3Zm11 0v4h3M8 11h8M8 15h8" /></svg>;
  if (section === 'trade') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 4-4v3h9a3 3 0 0 1 3 3M20 16l-4 4v-3H7a3 3 0 0 1-3-3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14M7 5v.01M7 12v.01M7 19v.01" /></svg>;
}

function PropertySheet({ state, index, playerId, send, onClose }: { state: GameState; index: number; playerId: string; send: Sender; onClose: () => void }) {
  const space = BOARD[index]!; const property = state.properties[index]; const mine = property?.ownerId === playerId;
  const actions = property && mine ? getPropertyActionAvailability(state, playerId, index) : null;
  const propertyAction = actions ? (property?.mortgaged ? actions.unmortgage : actions.mortgage) : null;
  const firstReason = actions
    ? (space.type === 'street' && !actions.build.allowed ? actions.build.reason : !propertyAction?.allowed ? propertyAction?.reason : null)
    : null;
  return <div className="drawer-backdrop" onClick={onClose}><section className="deed-sheet" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={onClose} aria-label="Close property details">×</button><div className={`deed-band color-${space.type === 'street' ? (space as StreetSpace).color : 'utility'}`} /><span className="eyeline">{space.type.replace('-', ' ')}</span><h2>{space.name}</h2>{'price' in space ? <p className="deed-price">Purchase {money.format(space.price)} · Mortgage {money.format(space.mortgage)}</p> : null}{space.type === 'street' ? <div className="rent-table">{space.rents.map((rent, count) => <div key={count}><span>{count === 0 ? 'Base rent' : count === 5 ? 'Hotel' : `${count} house${count > 1 ? 's' : ''}`}</span><strong>{money.format(rent)}</strong></div>)}</div> : null}{property ? <p className="owner-line">{property.ownerId ? `Owned by ${state.players.find((player) => player.id === property.ownerId)?.name}` : 'Available from the Bank'}{property.mortgaged ? ' · Mortgaged' : ''}</p> : null}{actions ? <><div className="deed-actions">{space.type === 'street' ? <><button disabled={!actions.build.allowed} onClick={() => send({ type: 'BUILD', spaceIndex: index })}>Build</button><button disabled={!actions.sellBuilding.allowed} onClick={() => send({ type: 'SELL_BUILDING', spaceIndex: index })}>Sell building</button></> : null}<button disabled={property?.mortgaged ? !actions.unmortgage.allowed : !actions.mortgage.allowed} onClick={() => send({ type: property?.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', spaceIndex: index })}>{property?.mortgaged ? 'Unmortgage' : 'Mortgage'}</button></div>{firstReason ? <p className="deed-hint">{firstReason}</p> : null}</> : null}</section></div>;
}

function useDiceAnimation(lastRoll: GameState['lastRoll']) {
  const [rolling, setRolling] = useState(false);
  const previous = useRef<{ seeded: boolean; roll: GameState['lastRoll'] }>({ seeded: false, roll: null });
  useEffect(() => {
    const wasNull = previous.current.roll === null;
    const seeded = previous.current.seeded;
    previous.current = { seeded: true, roll: lastRoll };
    if (!seeded || !wasNull || !lastRoll) return undefined;
    setRolling(true);
    const timer = window.setTimeout(() => setRolling(false), 700);
    return () => window.clearTimeout(timer);
  }, [lastRoll]);
  return rolling;
}

function TurnActions({ state, playerId, send, rolling }: { state: GameState; playerId: string; send: Sender; rolling: boolean }) {
  const mine = state.currentPlayerId === playerId; const phase = state.phase; const me = state.players.find((player) => player.id === playerId)!;
  if (phase.type === 'paused') return <div className="turn-card"><span className="eyeline">TABLE PAUSED</span><h2>Take a breather.</h2><p>{state.hostPlayerId === playerId ? 'Resume when everyone is ready.' : 'The host will resume the game.'}</p>{state.hostPlayerId === playerId ? <button className="primary-button" onClick={() => send({ type: 'RESUME', now: Date.now() })}>Resume game</button> : null}</div>;
  if (phase.type === 'finished') return <div className="turn-card winner-card"><span className="eyeline">GAME OVER</span><h2>{phase.winnerIds.map((id) => state.players.find((player) => player.id === id)?.name).join(' & ')} wins</h2><p>{phase.reason === 'timer' ? 'Highest net worth when time expired.' : 'Last player standing.'}</p></div>;
  if (!mine && phase.type !== 'auction' && !(phase.type === 'debt' && phase.playerId === playerId)) return <div className="turn-card"><span className="eyeline">UP NEXT</span><h2>{state.players.find((player) => player.id === state.currentPlayerId)?.name} is taking a turn</h2>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<p>Watch the board—your controls will appear here.</p></div>;
  if (phase.type === 'awaiting-roll') return <div className="turn-card"><span className="eyeline">YOUR MOVE</span><h2>{me.inJail ? 'Choose your way out.' : 'Roll the dice.'}</h2>{me.inJail ? <div className="action-row"><button onClick={() => send({ type: 'PAY_JAIL_FINE' })}>Pay $50</button>{me.jailFreeCards.length ? <button onClick={() => send({ type: 'USE_JAIL_CARD' })}>Use card</button> : null}<button className="primary-button" onClick={() => send({ type: 'ROLL' })}>Try doubles</button></div> : <button className="roll-button" onClick={() => send({ type: 'ROLL' })}><span>ROLL</span><i>◆ ◆</i></button>}</div>;
  if (phase.type === 'purchase') { const space = BOARD[phase.spaceIndex] as Extract<(typeof BOARD)[number], { price: number }>; return <div className="turn-card"><span className="eyeline">AVAILABLE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{space.name}</h2><p>Buy for {money.format(space.price)} or open it to the table.</p><div className="action-row"><button className="primary-button" onClick={() => send({ type: 'BUY_PROPERTY' })}>Buy</button><button onClick={() => send({ type: 'DECLINE_PROPERTY', now: Date.now() })}>Auction</button></div></div>; }
  if (phase.type === 'auction') return <Auction state={state} send={send} />;
  if (phase.type === 'debt') return <div className="turn-card debt-card"><span className="eyeline">PAYMENT DUE</span><h2>Raise {money.format(phase.amount)}</h2><p>You have {money.format(me.cash)}. Sell buildings, mortgage property, or make a trade.</p><div className="action-row">{me.cash >= phase.amount ? <button className="primary-button" onClick={() => send({ type: 'SETTLE_DEBT' })}>Pay now</button> : null}<button className="danger-button" onClick={() => send({ type: 'DECLARE_BANKRUPTCY' })}>Declare bankruptcy</button></div></div>;
  return <div className="turn-card"><span className="eyeline">TURN COMPLETE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{state.lastRoll ? `You rolled ${state.lastRoll[0]} + ${state.lastRoll[1]}.` : 'Everything is settled.'}</h2><button className="primary-button" onClick={() => send({ type: 'END_TURN' })}>{state.rolledDoubles ? 'Roll again' : 'End turn'}</button></div>;
}
function MovementTurnCard({ state, playerName, rolling }: { state: GameState; playerName: string; rolling: boolean }) {
  return <div className="turn-card movement-card"><span className="eyeline">ON THE MOVE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{playerName} is moving…</h2><p>Follow the token around the board. Landing actions will appear when it settles.</p></div>;
}
function Auction({ state, send }: { state: GameState; send: Sender }) {
  const phase = state.phase; const [bid, setBid] = useState(10); if (phase.type !== 'auction') return null;
  return <div className="turn-card auction-card"><span className="eyeline">LIVE AUCTION</span><h2>{BOARD[phase.spaceIndex]!.name}</h2><p className="bid-value">{phase.bid ? money.format(phase.bid) : 'Opening at $10'}</p><p>{phase.bidderId ? `${state.players.find((player) => player.id === phase.bidderId)?.name} leads` : 'No bids yet'}</p><div className="bid-controls"><input type="number" min={phase.bid ? phase.bid + 1 : 10} value={bid} onChange={(event) => setBid(Number(event.target.value))} aria-label="Bid amount" /><button className="primary-button" onClick={() => send({ type: 'PLACE_BID', amount: bid, now: Date.now() })}>Bid</button><button onClick={() => send({ type: 'PASS_AUCTION' })}>Pass</button></div></div>;
}
function Assets({ state, playerId, send }: { state: GameState; playerId: string; send: Sender }) {
  const me = state.players.find((player) => player.id === playerId)!; const owned = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === playerId);
  const groups = [...new Set(owned.map(propertyGroup))];
  return <section className="tab-panel asset-panel"><div className="asset-summary"><div><span>Cash</span><strong>{money.format(me.cash)}</strong></div><div><span>Net worth</span><strong>{money.format(netWorth(state, playerId))}</strong></div></div><div className="panel-heading"><h2>Your deeds</h2><span>{owned.length} owned</span></div>{owned.length ? <div className="deed-groups">{groups.map((group) => { const groupOwned = owned.filter((space) => propertyGroup(space) === group); const groupTotal = PROPERTY_SPACES.filter((space) => propertyGroup(space) === group).length; return <section className="deed-group" key={group} style={{ '--group-color': groupColors[group] } as CSSProperties}><header><h3>{groupNames[group]}</h3><span>{groupOwned.length} of {groupTotal} deeds</span></header><div className="deed-list">{groupOwned.map((space) => { const property = state.properties[space.index]!; const actions = getPropertyActionAvailability(state, playerId, space.index); const action = property.mortgaged ? actions.unmortgage : actions.mortgage; return <article key={space.index}><span className="mini-band" /><div><strong>{space.name}</strong><small>{property.mortgaged ? 'Mortgaged' : property.buildings === 5 ? 'Hotel' : property.buildings ? `${property.buildings} houses` : 'Unimproved'}</small></div><button disabled={!action.allowed} title={action.reason} onClick={() => send({ type: property.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', spaceIndex: space.index })}>{property.mortgaged ? 'Unmortgage' : 'Mortgage'}</button></article>; })}</div></section>; })}</div> : <p className="empty-copy">No deeds yet. Your first purchase will appear here.</p>}<p className="bank-stock">Bank stock: {state.bankHouses} houses · {state.bankHotels} hotels</p></section>;
}
function Trade({ state, playerId, send }: { state: GameState; playerId: string; send: Sender }) {
  const others = state.players.filter((player) => player.id !== playerId && !player.bankrupt); const [to, setTo] = useState(others[0]?.id ?? ''); const [giveCash, setGiveCash] = useState(0); const [takeCash, setTakeCash] = useState(0); const [give, setGive] = useState<number[]>([]); const [take, setTake] = useState<number[]>([]);
  const pending = state.pendingTrade;
  if (pending?.toPlayerId === playerId) return <section className="tab-panel trade-offer"><span className="eyeline">TRADE OFFER</span><h2>{state.players.find((player) => player.id === pending.fromPlayerId)?.name} proposes a deal</h2><p>They offer {money.format(pending.offeredCash)} and {pending.offeredProperties.length} deed(s) for {money.format(pending.requestedCash)} and {pending.requestedProperties.length} deed(s).</p><div className="action-row"><button className="primary-button" onClick={() => send({ type: 'RESPOND_TRADE', accept: true })}>Accept</button><button onClick={() => send({ type: 'RESPOND_TRADE', accept: false })}>Decline</button></div></section>;
  const mine = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === playerId);
  const theirs = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === to);
  const submit = () => { const offer: TradeOffer = { id: crypto.randomUUID(), fromPlayerId: playerId, toPlayerId: to, offeredCash: giveCash, requestedCash: takeCash, offeredProperties: give, requestedProperties: take, offeredJailCards: [], requestedJailCards: [] }; send({ type: 'PROPOSE_TRADE', offer }); };
  const me = state.players.find((player) => player.id === playerId)!;
  const theirCash = state.players.find((player) => player.id === to)?.cash ?? 0;
  const validCash = Number.isSafeInteger(giveCash) && giveCash >= 0 && giveCash <= me.cash
    && Number.isSafeInteger(takeCash) && takeCash >= 0 && takeCash <= theirCash;
  const deedSelector = (spaces: typeof PROPERTY_SPACES, values: number[], setter: (next: number[]) => void) => <div className="trade-deeds">{spaces.length ? spaces.map((space) => { const selected = values.includes(space.index); const group = propertyGroup(space); return <label key={space.index} style={{ '--group-color': groupColors[group] } as CSSProperties}><input type="checkbox" aria-label={space.name} checked={selected} onChange={() => setter(selected ? values.filter((index) => index !== space.index) : [...values, space.index])} /><span className="trade-deed-band" /><span><strong>{space.name}</strong><small>Purchase {money.format(space.price)} · Mortgage {money.format(space.mortgage)}</small></span></label>; }) : <p>No deeds available.</p>}</div>;
  return <section className="tab-panel trade-panel"><div className="panel-heading"><h2>Make a trade</h2><label>Trade with<select value={to} onChange={(event) => { setTo(event.target.value); setGive([]); setTake([]); }}>{others.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label></div><div className="trade-sides"><section className="trade-side"><h3>You give</h3><label>Cash<input type="number" min="0" max={me.cash} value={giveCash} onChange={(event) => setGiveCash(Number(event.target.value))} /></label>{deedSelector(mine, give, setGive)}</section><section className="trade-side receive"><h3>You receive</h3><label>Cash<input type="number" min="0" value={takeCash} onChange={(event) => setTakeCash(Number(event.target.value))} /></label>{deedSelector(theirs, take, setTake)}</section></div><p className="trade-summary">You give {money.format(giveCash)} and {give.length} deeds. You receive {money.format(takeCash)} and {take.length} deeds.</p>{!validCash ? <p className="form-error">The offer exceeds an available cash balance.</p> : null}<button className="primary-button trade-submit" disabled={!to || Boolean(pending) || !validCash} onClick={submit}>{pending ? 'Offer pending' : 'Send offer'}</button></section>;
}

export function GameScreen({ state, playerId, status, error, send, clearError, onLeave, leaving, leaveError }: { state: GameState; playerId: string; status: string; error: string | null; send: Sender; clearError: () => void; onLeave: () => void | Promise<void>; leaving: boolean; leaveError: string | null }) {
  const [selected, setSelected] = useState<number | null>(null); const [tab, setTab] = useState<GameSection>('game');
  const [dismissedDrawId, setDismissedDrawId] = useState<string | null>(null);
  const compact = useCompactLayout();
  const landscapePhone = useLandscapePhone();
  const rolling = useDiceAnimation(state.lastRoll);
  const movement = useMovementAnimation(state);
  const lastCard = state.lastCard ?? null;
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => { if (!state.timerEndsAt) return; const interval = window.setInterval(() => setClockNow(Date.now()), 15_000); return () => window.clearInterval(interval); }, [state.timerEndsAt]);
  const current = state.players.find((player) => player.id === state.currentPlayerId); const displayNow = state.phase.type === 'paused' ? state.phase.pausedAt : clockNow; const ends = state.timerEndsAt ? Math.max(0, state.timerEndsAt - displayNow) : null;
  const timer = useMemo(() => ends === null ? null : `${Math.floor(ends / 3_600_000)}:${String(Math.floor((ends % 3_600_000) / 60_000)).padStart(2, '0')}`, [ends]);
  const movingPlayer = movement.movingPlayerId ? state.players.find((player) => player.id === movement.movingPlayerId) : null;
  const movementOverridesActions = movement.isPresenting && state.phase.type !== 'paused' && state.phase.type !== 'finished';
  const showCard = lastCard && lastCard.drawId !== dismissedDrawId && (!movement.isPresenting || movement.waitingForCard);
  const closeCard = () => { if (!lastCard) return; setDismissedDrawId(lastCard.drawId); movement.resumeAfterCard(); };
  useEffect(() => {
    if (landscapePhone) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [landscapePhone, tab]);
  const sections: GameSection[] = ['game', 'assets', 'trade', 'activity'];
  return <main className={`game-shell${landscapePhone ? ' is-landscape-phone' : ''}`}>
    <span className="sr-only" aria-live="polite">{movement.announcement}</span>
    <header className="status-rail"><div><span className={`status-dot ${status}`} />{status === 'online' ? 'Live' : 'Reconnecting'}</div><strong>{current?.name}{current?.id === playerId ? ' · your turn' : ' · playing'}</strong><span>{timer ?? `Round ${state.round}`}</span>{state.hostPlayerId === playerId && state.phase.type !== 'finished' ? <button className="table-control" aria-label={state.phase.type === 'paused' ? 'Resume game' : 'Pause game'} data-tooltip={state.phase.type === 'paused' ? 'Resume game' : 'Pause game'} onClick={() => send({ type: state.phase.type === 'paused' ? 'RESUME' : 'PAUSE', now: Date.now() })}><PauseIcon paused={state.phase.type === 'paused'} /></button> : <span />}<LeaveRoom compact busy={leaving} error={leaveError} onConfirm={onLeave} /></header>
    <PlayerBalances state={state} playerId={playerId} />
    {error ? <div className="toast" role="alert"><span>{error}</span><button onClick={clearError}>×</button></div> : null}
    {tab === 'game' ? <><Board compact={compact} state={state} selectedIndex={selected} onSelect={setSelected} displayPositions={movement.displayPositions} movingPlayerId={movement.movingPlayerId} tokenMotion={movement.tokenMotion} />{compact ? <BoardNavigator state={state} onSelect={setSelected} /> : null}{movementOverridesActions && movingPlayer ? <MovementTurnCard state={state} playerName={movingPlayer.name} rolling={rolling} /> : <TurnActions state={state} playerId={playerId} send={send} rolling={rolling} />}<TableLedger state={state} variant={landscapePhone ? 'strip' : 'panel'} /></> : null}
    {tab === 'assets' ? <Assets state={state} playerId={playerId} send={send} /> : null}
    {tab === 'trade' ? <Trade state={state} playerId={playerId} send={send} /> : null}
    {tab === 'activity' ? <section className="tab-panel"><h2>Activity</h2><ActivityTimeline entries={state.activities} /></section> : null}
    <nav className="bottom-nav" aria-label="Game sections">{sections.map((item) => { const label = item[0]!.toUpperCase() + item.slice(1); return <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><SectionIcon section={item} /><span>{label}</span></button>; })}</nav>
    {selected !== null ? <PropertySheet state={state} index={selected} playerId={playerId} send={send} onClose={() => setSelected(null)} /> : null}
    {showCard ? <CardReveal state={state} draw={lastCard} onClose={closeCard} /> : null}
    {status !== 'online' ? <div className="reconnect-sheet"><div className="spinner" /><h2>Reconnecting to the table</h2><p>Your last confirmed board is safe. Controls will return after a fresh server snapshot.</p></div> : null}
  </main>;
}
