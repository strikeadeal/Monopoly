import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOARD, PROPERTY_SPACES, RAILROAD_RENTS, UTILITY_RENT_MULTIPLIERS, auctionsEnabled, getPropertyActionAvailability, netWorth, type GameState, type StreetSpace, type TradeOffer } from '@monopoly/game';
import { Board } from './Board';
import { ActivityTimeline } from './ActivityTimeline';
import { BoardNavigator } from './BoardNavigator';
import { CardReveal } from './CardReveal';
import { DiceRoll } from './Dice';
import { LeaveRoom } from './LeaveRoom';
import { PlayerBalances } from './PlayerBalances';
import { TableLedger } from './TableLedger';
import { useCompactLayout, useLandscapePhone } from '../useCompactLayout';
import { useMoneyAnnouncements } from '../useMoneyAnnouncements';
import { useMovementAnimation } from '../useMovementAnimation';
import { GROUP_COLORS as groupColors, PLAYER_COLORS } from '../theme';

type Sender = (command: Record<string, unknown> & { type: string }) => void;
type GameSection = 'game' | 'assets' | 'trade' | 'activity';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const groupNames: Record<string, string> = { brown: 'Brown', 'light-blue': 'Light blue', pink: 'Pink', orange: 'Orange', red: 'Red', yellow: 'Yellow', green: 'Green', 'dark-blue': 'Dark blue', railroad: 'Train lines', utility: 'Utilities' };
const propertyGroup = (space: (typeof PROPERTY_SPACES)[number]) => space.type === 'street' ? space.color : space.type;

function PauseIcon({ paused }: { paused: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {paused ? <path d="m8 5 11 7-11 7Z" /> : <path d="M8 5v14M16 5v14" />}
  </svg>;
}

function SectionIcon({ section }: { section: GameSection }) {
  if (section === 'game') return <svg data-section-icon="dice" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m8-4.5-8 4.5-8-4.5M12 12v9m-4-11v.01m8-3v.01m1 7v.01m-2 3v.01" /></svg>;
  if (section === 'assets') return <svg data-section-icon="deeds" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v11H4V8Zm3 0V5h10v3M4 12h16M10 12v2h4v-2" /><circle cx="18" cy="18" r="3" /></svg>;
  if (section === 'trade') return <svg data-section-icon="handshake" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 8 4-3 4 2 2-1 8 4-3 5-3 3-7-5-3 1-3-4 3-4Zm7 4 5 4m-7-2 4 3m2-8-3 3-2-1 3-4" /></svg>;
  return <svg data-section-icon="clipboard" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5H5v16h14V5h-2M9 5V3h6v2H9Zm0 5h6M9 14h6M9 18h4" /></svg>;
}

function PropertySheet({ state, index, playerId, send, onClose }: { state: GameState; index: number; playerId: string; send: Sender; onClose: () => void }) {
  const space = BOARD[index]!; const property = state.properties[index]; const mine = property?.ownerId === playerId;
  const owner = property?.ownerId ? state.players.find((player) => player.id === property.ownerId) : undefined;
  const ownerColor = owner ? PLAYER_COLORS[state.turnOrder.indexOf(owner.id)] : undefined;
  const actions = property && mine ? getPropertyActionAvailability(state, playerId, index) : null;
  const propertyAction = actions ? (property?.mortgaged ? actions.unmortgage : actions.mortgage) : null;
  const firstReason = actions
    ? (space.type === 'street' && !actions.build.allowed ? actions.build.reason : !propertyAction?.allowed ? propertyAction?.reason : null)
    : null;
  const rentRows = space.type === 'street'
    ? space.rents.map((rent, count) => ({ label: count === 0 ? 'Base rent' : count === 5 ? 'Hotel' : `${count} house${count > 1 ? 's' : ''}`, value: money.format(rent) }))
    : space.type === 'railroad'
      ? RAILROAD_RENTS.map((rent, count) => ({ label: `${count + 1} train line${count ? 's' : ''}`, value: money.format(rent) }))
      : space.type === 'utility'
        ? UTILITY_RENT_MULTIPLIERS.map((multiplier, count) => ({ label: `${count + 1} utilit${count ? 'ies' : 'y'}`, value: `${multiplier}× dice total` }))
        : [];
  const headingId = `deed-heading-${index}`;
  const deedColor = space.type === 'street' ? (space as StreetSpace).color : space.type;
  return <div className="drawer-backdrop" onClick={onClose}>
    <section className="deed-sheet" role="dialog" aria-labelledby={headingId} onClick={(event) => event.stopPropagation()}>
      <button className="close-button" onClick={onClose} aria-label="Close property details">×</button>
      <div className={`deed-band color-${deedColor}`} />
      <span className="eyeline">{space.type === 'railroad' ? 'train line' : space.type.replace('-', ' ')}</span>
      <h2 id={headingId}>{space.name}</h2>
      {'price' in space ? <p className="deed-price">Purchase {money.format(space.price)} · Mortgage {money.format(space.mortgage)}</p> : null}
      {space.type === 'street' ? <p className="build-cost">Build houses or hotel: {money.format(space.buildCost)} each</p> : null}
      {rentRows.length ? <div className="rent-table">{rentRows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div> : null}
      {property ? <p className="owner-line">
        {owner ? <span className="owner-swatch" aria-hidden="true" style={{ '--owner-color': ownerColor } as CSSProperties} /> : null}
        <span>{owner ? `Owned by ${owner.name}` : 'Available from the Bank'}{property.mortgaged ? ' · Mortgaged' : ''}</span>
      </p> : null}
      {actions ? <><div className="deed-actions">{space.type === 'street' ? <><button disabled={!actions.build.allowed} onClick={() => send({ type: 'BUILD', spaceIndex: index })}>Build</button><button disabled={!actions.sellBuilding.allowed} onClick={() => send({ type: 'SELL_BUILDING', spaceIndex: index })}>Sell building</button></> : null}<button disabled={property?.mortgaged ? !actions.unmortgage.allowed : !actions.mortgage.allowed} onClick={() => send({ type: property?.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', spaceIndex: index })}>{property?.mortgaged ? 'Unmortgage' : 'Mortgage'}</button></div>{firstReason ? <p className="deed-hint">{firstReason}</p> : null}</> : null}
    </section>
  </div>;
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

function DebtCard({ state, playerId, send, onOpenAssets }: { state: GameState; playerId: string; send: Sender; onOpenAssets: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const phase = state.phase;
  const me = state.players.find((player) => player.id === playerId)!;
  if (phase.type !== 'debt') return null;
  if (confirming) return <div className="turn-card debt-card"><span className="eyeline">CONFIRM BANKRUPTCY</span><h2>Hand over everything?</h2><p>Your cash and deeds go to {phase.creditorId ? state.players.find((player) => player.id === phase.creditorId)?.name : 'the Bank'} and you leave the game. This cannot be undone.</p><div className="action-row"><button onClick={() => setConfirming(false)}>Go back</button><button className="danger-button" onClick={() => send({ type: 'DECLARE_BANKRUPTCY' })}>Declare bankruptcy</button></div></div>;
  return <div className="turn-card debt-card"><span className="eyeline">PAYMENT DUE</span><h2>Raise {money.format(phase.amount)}</h2><p>You have {money.format(me.cash)}. Sell buildings, mortgage property, or make a trade.</p><div className="action-row">{me.cash >= phase.amount ? <button className="primary-button" onClick={() => send({ type: 'SETTLE_DEBT' })}>Pay now</button> : <button className="primary-button" onClick={onOpenAssets}>Open assets</button>}<button className="danger-button" onClick={() => setConfirming(true)}>Declare bankruptcy</button></div></div>;
}

function TurnActions({ state, playerId, send, rolling, onOpenAssets, onLeave, leaving }: { state: GameState; playerId: string; send: Sender; rolling: boolean; onOpenAssets: () => void; onLeave: () => void | Promise<void>; leaving: boolean }) {
  const mine = state.currentPlayerId === playerId; const phase = state.phase; const me = state.players.find((player) => player.id === playerId)!;
  if (phase.type === 'paused') return <div className="turn-card"><span className="eyeline">TABLE PAUSED</span><h2>Take a breather.</h2><p>{state.hostPlayerId === playerId ? 'Resume when everyone is ready.' : 'The host will resume the game.'}</p>{state.hostPlayerId === playerId ? <button className="primary-button" onClick={() => send({ type: 'RESUME', now: Date.now() })}>Resume game</button> : null}</div>;
  if (phase.type === 'finished') { const winners = phase.winnerIds.map((id) => state.players.find((player) => player.id === id)); return <div className="turn-card winner-card"><span className="eyeline">GAME OVER</span><h2>{winners.map((player) => player?.name).join(' & ')} wins</h2><p>{phase.reason === 'timer' ? 'Highest net worth when time expired.' : 'Last player standing.'} Final net worth {winners.map((player) => player ? money.format(netWorth(state, player.id)) : '').join(' & ')}.</p><button className="primary-button" disabled={leaving} onClick={() => void onLeave()}>{leaving ? 'Leaving…' : 'Leave the table'}</button></div>; }
  if (!mine && phase.type !== 'auction' && !(phase.type === 'debt' && phase.playerId === playerId)) return <div className="turn-card"><span className="eyeline">UP NEXT</span><h2>{state.players.find((player) => player.id === state.currentPlayerId)?.name} is taking a turn</h2>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<p>Watch the board—your controls will appear here.</p></div>;
  if (phase.type === 'awaiting-roll') return <div className="turn-card"><span className="eyeline">YOUR MOVE</span><h2>{me.inJail ? 'Choose your way out.' : 'Roll the dice.'}</h2>{me.inJail ? <div className="action-row"><button disabled={me.cash < 50} onClick={() => send({ type: 'PAY_JAIL_FINE' })}>Pay $50</button>{me.jailFreeCards.length ? <button onClick={() => send({ type: 'USE_JAIL_CARD' })}>Use card</button> : null}<button className="primary-button" onClick={() => send({ type: 'ROLL' })}>Try doubles</button></div> : <button className="roll-button" onClick={() => send({ type: 'ROLL' })}><span>ROLL</span><i>◆ ◆</i></button>}</div>;
  if (phase.type === 'purchase') { const space = BOARD[phase.spaceIndex] as Extract<(typeof BOARD)[number], { price: number }>; const canAfford = me.cash >= space.price; const auctions = auctionsEnabled(state.settings); return <div className="turn-card purchase-card"><span className="eyeline">AVAILABLE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{space.name}</h2><p>{canAfford ? `Buy for ${money.format(space.price)} or ${auctions ? 'send it to auction' : 'decline and it stays with the Bank'}.` : `It costs ${money.format(space.price)} and you have ${money.format(me.cash)} — ${auctions ? 'send it to auction' : 'decline and it stays with the Bank'}.`}</p><div className="action-row"><button className="primary-button" disabled={!canAfford} onClick={() => send({ type: 'BUY_PROPERTY' })}>Buy</button><button onClick={() => send({ type: 'DECLINE_PROPERTY', now: Date.now() })}>{auctions ? 'Auction' : 'Decline'}</button></div></div>; }
  if (phase.type === 'auction') return <Auction state={state} playerId={playerId} send={send} />;
  if (phase.type === 'debt') return <DebtCard state={state} playerId={playerId} send={send} onOpenAssets={onOpenAssets} />;
  return <div className="turn-card"><span className="eyeline">TURN COMPLETE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{state.lastRoll ? `You rolled ${state.lastRoll[0]} + ${state.lastRoll[1]}.` : 'Everything is settled.'}</h2><button className="primary-button" onClick={() => send({ type: 'END_TURN' })}>{state.rolledDoubles ? 'Roll again' : 'End turn'}</button></div>;
}
function MovementTurnCard({ state, playerName, rolling }: { state: GameState; playerName: string; rolling: boolean }) {
  return <div className="turn-card movement-card"><span className="eyeline">ON THE MOVE</span>{state.lastRoll ? <div className="dice-line"><DiceRoll roll={state.lastRoll} rolling={rolling} /></div> : null}<h2>{playerName} is moving…</h2><p>Follow the token around the board. Landing actions will appear when it settles.</p></div>;
}
function Auction({ state, playerId, send }: { state: GameState; playerId: string; send: Sender }) {
  const phase = state.phase; const [bidText, setBidText] = useState(''); if (phase.type !== 'auction') return null;
  const me = state.players.find((player) => player.id === playerId)!;
  const minBid = phase.bid ? phase.bid + 1 : 10;
  const parsed = Number(bidText);
  const valid = bidText !== '' && Number.isSafeInteger(parsed) && parsed >= minBid && parsed <= me.cash;
  const canCover = me.cash >= minBid;
  return <div className="turn-card auction-card"><span className="eyeline">LIVE AUCTION</span><h2>{BOARD[phase.spaceIndex]!.name}</h2><p className="bid-line"><strong className="bid-value">{phase.bid ? money.format(phase.bid) : 'Opening at $10'}</strong><span>{phase.bidderId ? `${state.players.find((player) => player.id === phase.bidderId)?.name} leads` : 'No bids yet'}</span></p><p className="bid-hint" id="bid-help">{canCover ? `Minimum ${money.format(minBid)} · You have ${money.format(me.cash)}` : `You can't cover the ${money.format(minBid)} minimum — pass.`}</p><div className="bid-controls"><input type="number" inputMode="numeric" min={minBid} max={me.cash} placeholder={String(minBid)} value={bidText} onChange={(event) => setBidText(event.target.value)} aria-label="Bid amount" aria-describedby="bid-help" aria-invalid={bidText !== '' && !valid} /><button className="primary-button" disabled={!valid} onClick={() => send({ type: 'PLACE_BID', amount: parsed, now: Date.now() })}>{valid ? `Bid ${money.format(parsed)}` : 'Bid'}</button><button onClick={() => send({ type: 'PASS_AUCTION' })}>Pass</button></div></div>;
}
function AssetSummary({ state, playerId }: { state: GameState; playerId: string }) {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  return <div className="asset-summary"><div><span>Cash</span><strong>{money.format(player.cash)}</strong></div><div><span>Net worth</span><strong>{money.format(netWorth(state, playerId))}</strong></div></div>;
}
function DeedGroups({ state, playerId, send }: { state: GameState; playerId: string; send?: Sender }) {
  const owned = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === playerId);
  const groups = [...new Set(owned.map(propertyGroup))];
  if (!owned.length) return null;
  return <div className="deed-groups">{groups.map((group) => { const groupOwned = owned.filter((space) => propertyGroup(space) === group); const groupTotal = PROPERTY_SPACES.filter((space) => propertyGroup(space) === group).length; return <section className="deed-group" key={group} style={{ '--group-color': groupColors[group] } as CSSProperties}><header><h3>{groupNames[group]}</h3><span>{groupOwned.length} of {groupTotal} deeds</span></header><div className="deed-list">{groupOwned.map((space) => { const property = state.properties[space.index]!; const statusText = property.mortgaged ? 'Mortgaged' : property.buildings === 5 ? 'Hotel' : property.buildings ? `${property.buildings} houses` : 'Unimproved'; const actions = send ? getPropertyActionAvailability(state, playerId, space.index) : null; const action = actions ? (property.mortgaged ? actions.unmortgage : actions.mortgage) : null; return <article key={space.index}><span className="mini-band" /><div><strong>{space.name}</strong><small>{statusText}</small></div>{send && action ? <button disabled={!action.allowed} title={action.reason} onClick={() => send({ type: property.mortgaged ? 'UNMORTGAGE' : 'MORTGAGE', spaceIndex: space.index })}>{property.mortgaged ? 'Unmortgage' : 'Mortgage'}</button> : null}</article>; })}</div></section>; })}</div>;
}
function Assets({ state, playerId, send }: { state: GameState; playerId: string; send: Sender }) {
  const owned = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === playerId);
  return <section className="tab-panel asset-panel"><AssetSummary state={state} playerId={playerId} /><div className="panel-heading"><h2>Your deeds</h2><span>{owned.length} owned</span></div>{owned.length ? <DeedGroups state={state} playerId={playerId} send={send} /> : <p className="empty-copy">No deeds yet. Your first purchase will appear here.</p>}<p className="bank-stock">Bank stock: {state.bankHouses} houses · {state.bankHotels} hotels</p></section>;
}
function PlayerAssetsSheet({ state, viewPlayerId, onClose }: { state: GameState; viewPlayerId: string; onClose: () => void }) {
  const player = state.players.find((candidate) => candidate.id === viewPlayerId);
  if (!player) return null;
  const owned = PROPERTY_SPACES.filter((space) => state.properties[space.index]?.ownerId === viewPlayerId);
  const color = PLAYER_COLORS[state.turnOrder.indexOf(viewPlayerId)];
  const headingId = `player-assets-${viewPlayerId}`;
  return <div className="drawer-backdrop" onClick={onClose}>
    <section className="deed-sheet player-assets-sheet" role="dialog" aria-labelledby={headingId} onClick={(event) => event.stopPropagation()}>
      <button className="close-button" onClick={onClose} aria-label="Close player assets">×</button>
      <span className="eyeline">PLAYER ASSETS</span>
      <h2 id={headingId}><span className="owner-swatch" aria-hidden="true" style={{ '--owner-color': color } as CSSProperties} />{player.name}{player.bankrupt ? ' · Bankrupt' : ''}</h2>
      <AssetSummary state={state} playerId={viewPlayerId} />
      <div className="panel-heading"><h2>Deeds</h2><span>{owned.length} owned</span></div>
      {owned.length ? <DeedGroups state={state} playerId={viewPlayerId} /> : <p className="empty-copy">{player.name} owns no deeds yet.</p>}
    </section>
  </div>;
}
function Trade({ state, playerId, send }: { state: GameState; playerId: string; send: Sender }) {
  const others = state.players.filter((player) => player.id !== playerId && !player.bankrupt); const [to, setTo] = useState(others[0]?.id ?? ''); const [giveCash, setGiveCash] = useState(0); const [takeCash, setTakeCash] = useState(0); const [give, setGive] = useState<number[]>([]); const [take, setTake] = useState<number[]>([]);
  const pending = state.pendingTrade;
  if (pending?.toPlayerId === playerId) {
    const describe = (cash: number, indexes: number[]) => {
      const parts = [money.format(cash)];
      if (indexes.length) parts.push(indexes.map((index) => BOARD[index]!.name).join(', '));
      return parts.join(' · ');
    };
    return <section className="tab-panel trade-offer"><span className="eyeline">TRADE OFFER</span><h2>{state.players.find((player) => player.id === pending.fromPlayerId)?.name} proposes a deal</h2><dl className="trade-terms"><div><dt>You receive</dt><dd>{describe(pending.offeredCash, pending.offeredProperties)}</dd></div><div><dt>You give</dt><dd>{describe(pending.requestedCash, pending.requestedProperties)}</dd></div></dl><div className="action-row"><button className="primary-button" onClick={() => send({ type: 'RESPOND_TRADE', accept: true })}>Accept</button><button onClick={() => send({ type: 'RESPOND_TRADE', accept: false })}>Decline</button></div></section>;
  }
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

export function GameScreen({ state, playerId, status, error, send, clearError, onLeave, leaving, leaveError, onExit }: { state: GameState; playerId: string; status: string; error: string | null; send: Sender; clearError: () => void; onLeave: () => void | Promise<void>; leaving: boolean; leaveError: string | null; onExit?: () => void }) {
  const [selected, setSelected] = useState<number | null>(null); const [tab, setTab] = useState<GameSection>('game');
  const [dismissedDrawId, setDismissedDrawId] = useState<string | null>(null);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const compact = useCompactLayout();
  const landscapePhone = useLandscapePhone();
  const moneyFeed = useMoneyAnnouncements(state, status);
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
  // A fast "Got it" can dismiss the card before the token reaches its pause,
  // leaving the walk waiting on a close that already happened. Release it.
  const { waitingForCard, resumeAfterCard } = movement;
  useEffect(() => {
    if (waitingForCard && (!lastCard || lastCard.drawId === dismissedDrawId)) resumeAfterCard();
  }, [waitingForCard, lastCard, dismissedDrawId, resumeAfterCard]);
  useEffect(() => {
    if (landscapePhone) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [landscapePhone, tab]);
  const sections: GameSection[] = ['game', 'assets', 'trade', 'activity'];
  return <main className={`game-shell${landscapePhone ? ' is-landscape-phone' : ''}`}>
    <span className="sr-only" aria-live="polite">{movement.announcement}</span>
    <span className="sr-only" aria-live="polite">{moneyFeed.banner?.text ?? ''}</span>
    <header className="status-rail"><div><span className={`status-dot ${status}`} />{status === 'online' ? 'Live' : 'Reconnecting'}</div><strong>{state.phase.type === 'finished' ? 'Game over' : `${current?.name}${current?.id === playerId ? ' · your turn' : ' · playing'}`}</strong><span>{timer ?? `Round ${state.round}`}</span>{state.hostPlayerId === playerId && state.phase.type !== 'finished' ? <button className="table-control" aria-label={state.phase.type === 'paused' ? 'Resume game' : 'Pause game'} data-tooltip={state.phase.type === 'paused' ? 'Resume game' : 'Pause game'} onClick={() => send({ type: state.phase.type === 'paused' ? 'RESUME' : 'PAUSE', now: Date.now() })}><PauseIcon paused={state.phase.type === 'paused'} /></button> : <span />}<LeaveRoom compact busy={leaving} error={leaveError} onConfirm={onLeave} /></header>
    <PlayerBalances state={state} playerId={playerId} onSelect={setViewingPlayerId} />
    {error && status === 'online' ? <div className="toast" role="alert"><span>{error}</span><button onClick={clearError} aria-label="Dismiss message">×</button></div> : null}
    {moneyFeed.banner ? <div className="toast money-toast" key={moneyFeed.banner.id}><span>{moneyFeed.banner.text}</span><button onClick={moneyFeed.dismiss} aria-label="Dismiss announcement">×</button></div> : null}
    {tab === 'game' ? <><Board compact={compact} state={state} selectedIndex={selected} onSelect={setSelected} displayPositions={movement.displayPositions} movingPlayerId={movement.movingPlayerId} tokenMotion={movement.tokenMotion} />{compact ? <BoardNavigator state={state} onSelect={setSelected} /> : null}{movementOverridesActions && movingPlayer ? <MovementTurnCard state={state} playerName={movingPlayer.name} rolling={rolling} /> : <TurnActions state={state} playerId={playerId} send={send} rolling={rolling} onOpenAssets={() => setTab('assets')} onLeave={onLeave} leaving={leaving} />}<TableLedger state={state} variant={landscapePhone ? 'strip' : 'panel'} /></> : null}
    {tab === 'assets' ? <Assets state={state} playerId={playerId} send={send} /> : null}
    {tab === 'trade' ? <Trade state={state} playerId={playerId} send={send} /> : null}
    {tab === 'activity' ? <section className="tab-panel"><h2>Activity</h2><ActivityTimeline entries={state.activities} /></section> : null}
    <nav className="bottom-nav" aria-label="Game sections">{sections.map((item) => { const label = item[0]!.toUpperCase() + item.slice(1); return <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><SectionIcon section={item} /><span>{label}</span></button>; })}</nav>
    {selected !== null ? <PropertySheet state={state} index={selected} playerId={playerId} send={send} onClose={() => setSelected(null)} /> : null}
    {viewingPlayerId !== null ? <PlayerAssetsSheet state={state} viewPlayerId={viewingPlayerId} onClose={() => setViewingPlayerId(null)} /> : null}
    {showCard ? <CardReveal state={state} draw={lastCard} onClose={closeCard} /> : null}
    {status !== 'online' ? <div className="reconnect-sheet"><div className="spinner" /><h2>Reconnecting to the table</h2><p>Your last confirmed board is safe. Controls will return after a fresh server snapshot.</p>{onExit ? <button type="button" className="text-button" onClick={onExit}>Back to home</button> : null}</div> : null}
  </main>;
}
