import { BOARD, CARD_BY_ID, CHANCE_CARDS, COMMUNITY_CHEST_CARDS, PROPERTY_SPACES } from './data';
import type { BoardSpace, GameCard, GameCommand, GamePhase, GameSettings, GameState, PlayerSeed, PlayerState, PropertyState, StreetSpace, TradeOffer } from './types';

export type RandomSource = () => number;
const now = () => Date.now();
const clone = <T>(value: T): T => structuredClone(value);
const activePlayers = (game: GameState) => game.players.filter((player) => !player.bankrupt);
const playerById = (game: GameState, id: string) => {
  const player = game.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error('player not found');
  return player;
};
const propertyAt = (game: GameState, index: number) => {
  const property = game.properties[index];
  if (!property) throw new Error('not a property');
  return property;
};
const addActivity = (game: GameState, text: string, tone?: 'money' | 'warning' | 'success') => {
  game.activities.unshift({ id: `${game.revision}-${game.activities.length}-${text}`, at: now(), text, ...(tone ? { tone } : {}) });
  game.activities = game.activities.slice(0, 100);
};
const shuffled = (ids: string[], random: RandomSource) => {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
};
const roll = (random: RandomSource): [number, number] => [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1];
const propertySpace = (index: number) => {
  const space = BOARD[index];
  if (!space || !['street', 'railroad', 'utility'].includes(space.type)) throw new Error('not a property');
  return space as Extract<BoardSpace, { type: 'street' | 'railroad' | 'utility' }>;
};
const ownsGroup = (game: GameState, ownerId: string, color: StreetSpace['color']) => {
  const group = BOARD.filter((space): space is StreetSpace => space.type === 'street' && space.color === color);
  return group.every((space) => game.properties[space.index]?.ownerId === ownerId);
};
const relativePath = (start: number, spaces: number) => Array.from(
  { length: Math.abs(spaces) },
  (_, index) => (start + Math.sign(spaces) * (index + 1) + 40) % 40
);
const clockwisePath = (start: number, destination: number) => relativePath(start, (destination - start + 40) % 40);
const addStepMovement = (game: GameState, positions: number[]) => {
  if (positions.length && game.lastMovement) game.lastMovement.segments.push({ kind: 'steps', reason: 'card', positions });
};

export function createGame(players: PlayerSeed[], settings: GameSettings, random: RandomSource = Math.random, startedAt = now()): GameState {
  if (players.length < 2 || players.length > 6) throw new Error('games require 2–6 players');
  const statePlayers: PlayerState[] = players.map((player, index) => ({
    ...player, cash: 1500, position: 0, inJail: false, jailTurns: 0, doublesStreak: 0, bankrupt: false, jailFreeCards: [], ready: true, tokenConfirmed: true, connected: true, joinedAt: startedAt + index
  }));
  return {
    revision: 0, status: 'playing', hostPlayerId: players[0]!.id, players: statePlayers, settings,
    phase: { type: 'awaiting-roll' }, currentPlayerId: players[0]!.id, turnOrder: players.map((player) => player.id), turnIndex: 0, round: 1,
    timerEndsAt: settings.mode === 'quick' ? startedAt + (settings.durationMinutes ?? 60) * 60_000 : null, timerExpired: false,
    lastRoll: null, rolledDoubles: false, lastCard: null, lastMovement: null,
    properties: Object.fromEntries(PROPERTY_SPACES.map((space) => [space.index, { ownerId: null, mortgaged: false, buildings: 0 } satisfies PropertyState])),
    bankHouses: 32, bankHotels: 12,
    chanceDeck: shuffled(CHANCE_CARDS.map((card) => card.id), random), communityChestDeck: shuffled(COMMUNITY_CHEST_CARDS.map((card) => card.id), random), heldCardIds: [],
    activities: [{ id: 'start', at: startedAt, text: `${players[0]!.name} takes the first turn.` }], pendingTrade: null, bankruptcyAuctionQueue: [], pendingDebtMovement: null
  };
}

export function createLobby(host: PlayerSeed, settings: GameSettings, createdAt = now(), random: RandomSource = Math.random): GameState {
  const base = createGame([host, { id: '__seat__', name: 'Reserved seat', token: 'key' }], settings, random, createdAt);
  base.players = [base.players[0]!];
  base.turnOrder = [host.id];
  base.status = 'lobby';
  base.phase = { type: 'lobby' };
  base.players[0]!.ready = false;
  base.players[0]!.tokenConfirmed = false;
  base.activities = [{ id: 'room-created', at: createdAt, text: `${host.name} created the room.` }];
  return base;
}

function movePlayer(game: GameState, player: PlayerState, destination: number, collectGo: boolean, rentMultiplier = 1, random: RandomSource = Math.random, movementPath: number[] = []) {
  if (collectGo && destination <= player.position && destination !== player.position) {
    player.cash += 200;
    addActivity(game, `${player.name} passed GO and collected $200.`, 'money');
  }
  addStepMovement(game, movementPath);
  player.position = destination;
  resolveSpace(game, player, rentMultiplier, random);
}

function sendToJail(game: GameState, player: PlayerState) {
  if (game.lastMovement) game.lastMovement.segments.push({ kind: 'direct', reason: 'jail', destination: 10 });
  player.position = 10;
  player.inJail = true;
  player.jailTurns = 0;
  player.doublesStreak = 0;
  game.rolledDoubles = false;
  game.phase = { type: 'awaiting-end' };
  addActivity(game, `${player.name} went to Jail.`, 'warning');
}

function charge(game: GameState, payer: PlayerState, amount: number, creditorId: string | null, reason: string) {
  if (amount <= 0) return true;
  if (payer.cash < amount) {
    game.phase = { type: 'debt', playerId: payer.id, creditorId, amount, reason };
    addActivity(game, `${payer.name} must raise $${amount} for ${reason}.`, 'warning');
    return false;
  }
  payer.cash -= amount;
  if (creditorId) playerById(game, creditorId).cash += amount;
  addActivity(game, `${payer.name} paid $${amount}${creditorId ? ` to ${playerById(game, creditorId).name}` : ''} for ${reason}.`, 'money');
  return true;
}

function rentFor(game: GameState, space: Extract<BoardSpace, { type: 'street' | 'railroad' | 'utility' }>, ownerId: string, multiplier: number) {
  const property = propertyAt(game, space.index);
  if (property.mortgaged) return 0;
  if (space.type === 'street') {
    const base = space.rents[property.buildings] ?? space.rents[0];
    return property.buildings === 0 && ownsGroup(game, ownerId, space.color) ? base * 2 * multiplier : base * multiplier;
  }
  if (space.type === 'railroad') {
    const count = BOARD.filter((item) => item.type === 'railroad' && game.properties[item.index]?.ownerId === ownerId && !game.properties[item.index]?.mortgaged).length;
    return 25 * 2 ** Math.max(0, count - 1) * multiplier;
  }
  const count = BOARD.filter((item) => item.type === 'utility' && game.properties[item.index]?.ownerId === ownerId && !game.properties[item.index]?.mortgaged).length;
  return (game.lastRoll?.reduce((sum, die) => sum + die, 0) ?? 7) * (multiplier !== 1 ? multiplier : count === 2 ? 10 : 4);
}

function drawCard(game: GameState, player: PlayerState, deckName: 'chance' | 'community-chest', random: RandomSource) {
  const deck = deckName === 'chance' ? game.chanceDeck : game.communityChestDeck;
  const id = deck.shift();
  if (!id) throw new Error('deck is empty');
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error('unknown card');
  addActivity(game, `${player.name} drew “${card.title}” — ${card.detail}`);
  game.lastCard = { drawId: `${game.revision}:${card.id}`, cardId: card.id, deck: card.deck, playerId: player.id };
  if (game.lastMovement && game.lastMovement.segments.length) game.lastMovement.pauseForCardAfterSegment = game.lastMovement.segments.length - 1;
  applyCard(game, player, card, random);
  if (card.effect.type !== 'jail-free') deck.push(id);
}

function applyCard(game: GameState, player: PlayerState, card: GameCard, random: RandomSource) {
  const effect = card.effect;
  if (effect.type === 'money-bank') {
    if (effect.amount >= 0) player.cash += effect.amount;
    else charge(game, player, -effect.amount, null, card.title);
  } else if (effect.type === 'money-players') {
    for (const other of activePlayers(game).filter((candidate) => candidate.id !== player.id)) {
      if (effect.amount >= 0) charge(game, other, effect.amount, player.id, card.title);
      else charge(game, player, -effect.amount, other.id, card.title);
      if (game.phase.type === 'debt') break;
    }
  } else if (effect.type === 'move-to') {
    movePlayer(game, player, effect.index, effect.collectGo, 1, random, clockwisePath(player.position, effect.index));
  } else if (effect.type === 'move-relative') {
    const path = relativePath(player.position, effect.spaces);
    movePlayer(game, player, path.at(-1) ?? player.position, false, 1, random, path);
  } else if (effect.type === 'move-nearest') {
    let destination = (player.position + 1) % 40;
    while (BOARD[destination]?.type !== effect.kind) destination = (destination + 1) % 40;
    movePlayer(game, player, destination, destination <= player.position, effect.rentMultiplier, random, clockwisePath(player.position, destination));
  } else if (effect.type === 'repairs') {
    const owned = Object.entries(game.properties).filter(([, property]) => property.ownerId === player.id);
    const amount = owned.reduce((sum, [, property]) => sum + (property.buildings === 5 ? effect.hotel : property.buildings * effect.house), 0);
    charge(game, player, amount, null, card.title);
  } else if (effect.type === 'jail') sendToJail(game, player);
  else {
    player.jailFreeCards.push(card.id);
    game.heldCardIds.push(card.id);
  }
}

function resolveSpace(game: GameState, player: PlayerState, rentMultiplier: number, random: RandomSource) {
  const space = BOARD[player.position]!;
  if (space.type === 'street' || space.type === 'railroad' || space.type === 'utility') {
    const property = propertyAt(game, space.index);
    if (!property.ownerId) game.phase = { type: 'purchase', spaceIndex: space.index, playerId: player.id };
    else if (property.ownerId === player.id || property.mortgaged) game.phase = { type: 'awaiting-end' };
    else {
      charge(game, player, rentFor(game, space, property.ownerId, rentMultiplier), property.ownerId, `rent on ${space.name}`);
      if (game.phase.type !== 'debt') game.phase = { type: 'awaiting-end' };
    }
  } else if (space.type === 'tax') {
    charge(game, player, space.amount, null, space.name);
    if (game.phase.type !== 'debt') game.phase = { type: 'awaiting-end' };
  } else if (space.type === 'chance' || space.type === 'community-chest') {
    game.phase = { type: 'awaiting-end' };
    drawCard(game, player, space.type, random);
  } else if (space.type === 'go-to-jail') sendToJail(game, player);
  else game.phase = { type: 'awaiting-end' };
}

function ensureTurn(game: GameState, playerId: string) {
  if (game.currentPlayerId !== playerId) throw new Error('not your turn');
}
function canManageAssets(game: GameState, playerId: string) {
  if (game.status !== 'playing') throw new Error('game is not active');
  if (game.phase.type === 'auction' || game.phase.type === 'purchase' || game.phase.type === 'finished' || game.phase.type === 'paused') throw new Error('asset action is not available now');
  if (game.phase.type === 'debt' && game.phase.playerId !== playerId) throw new Error('another player is resolving debt');
}
function transferHostAfterDeparture(game: GameState, playerId: string) {
  if (game.hostPlayerId !== playerId) return;
  const solvent = activePlayers(game).sort((a, b) => a.joinedAt - b.joinedAt);
  const replacement = solvent.find((player) => player.connected) ?? solvent[0];
  if (replacement) game.hostPlayerId = replacement.id;
}
function finishForLastActivePlayer(game: GameState) {
  const solvent = activePlayers(game);
  if (solvent.length !== 1) return false;
  game.status = 'finished';
  game.phase = { type: 'finished', winnerIds: [solvent[0]!.id], reason: 'bankruptcy' };
  game.bankruptcyAuctionQueue = [];
  return true;
}
function returnPlayerToBank(game: GameState, playerId: string) {
  const player = playerById(game, playerId);
  const returnedProperties: number[] = [];
  player.bankrupt = true;
  player.connected = false;
  for (const [indexText, property] of Object.entries(game.properties)) {
    if (property.ownerId !== player.id) continue;
    const index = Number(indexText);
    const space = propertySpace(index);
    if (space.type === 'street' && property.buildings > 0) {
      if (property.buildings === 5) game.bankHotels += 1;
      else game.bankHouses += property.buildings;
      property.buildings = 0;
    }
    property.ownerId = null;
    property.mortgaged = false;
    returnedProperties.push(index);
  }
  for (const cardId of player.jailFreeCards) {
    const card = CARD_BY_ID.get(cardId);
    if (card) (card.deck === 'chance' ? game.chanceDeck : game.communityChestDeck).push(cardId);
    game.heldCardIds = game.heldCardIds.filter((id) => id !== cardId);
  }
  player.cash = 0;
  player.jailFreeCards = [];
  return returnedProperties.sort((a, b) => a - b);
}
function normalizeAuctionAfterDeparture(game: GameState, playerId: string, at: number) {
  if (game.phase.type !== 'auction') return;
  if (game.phase.bidderId === playerId) {
    game.phase = { ...game.phase, bidderId: null, bid: 0, passedPlayerIds: [], deadline: at + 15_000 };
  } else if (!game.phase.passedPlayerIds.includes(playerId)) game.phase.passedPlayerIds.push(playerId);
}
function nextTurn(game: GameState) {
  if (activePlayers(game).length === 1) {
    game.status = 'finished';
    game.phase = { type: 'finished', winnerIds: [activePlayers(game)[0]!.id], reason: 'bankruptcy' };
    return;
  }
  if (game.bankruptcyAuctionQueue.length) { startBankruptcyAuction(game); return; }
  let next = game.turnIndex;
  do next = (next + 1) % game.turnOrder.length; while (playerById(game, game.turnOrder[next]!).bankrupt);
  if (next <= game.turnIndex) game.round += 1;
  game.turnIndex = next;
  game.currentPlayerId = game.turnOrder[next]!;
  game.lastRoll = null;
  game.lastCard = null;
  game.lastMovement = null;
  game.rolledDoubles = false;
  game.phase = { type: 'awaiting-roll' };
}
function closeAuction(game: GameState) {
  if (game.phase.type !== 'auction') throw new Error('no auction is active');
  const phase = game.phase;
  const space = propertySpace(phase.spaceIndex);
  if (phase.bidderId) {
    const bidder = playerById(game, phase.bidderId);
    if (bidder.cash < phase.bid) throw new Error('winning bidder cannot pay');
    bidder.cash -= phase.bid;
    propertyAt(game, phase.spaceIndex).ownerId = bidder.id;
    addActivity(game, `${bidder.name} won ${space.name} for $${phase.bid}.`, 'success');
  } else addActivity(game, `${space.name} stayed with the Bank.`);
  if (phase.reason === 'bankruptcy') {
    if (game.bankruptcyAuctionQueue.length) startBankruptcyAuction(game);
    else nextTurn(game);
  } else if (playerById(game, game.currentPlayerId).bankrupt) nextTurn(game);
  else game.phase = { type: 'awaiting-end' };
}
function startBankruptcyAuction(game: GameState) {
  const spaceIndex = game.bankruptcyAuctionQueue.shift();
  if (spaceIndex === undefined) { nextTurn(game); return; }
  game.phase = { type: 'auction', spaceIndex, bidderId: null, bid: 0, passedPlayerIds: [], deadline: now() + 15_000, reason: 'bankruptcy' };
}
function groupSpaces(space: StreetSpace) {
  return BOARD.filter((candidate): candidate is StreetSpace => candidate.type === 'street' && candidate.color === space.color);
}
function buildingIsEven(game: GameState, space: StreetSpace, direction: 1 | -1) {
  const values = groupSpaces(space).map((item) => game.properties[item.index]!.buildings);
  const current = game.properties[space.index]!.buildings;
  return direction === 1 ? current === Math.min(...values) : current === Math.max(...values);
}
export function netWorth(game: GameState, playerId: string) {
  const player = playerById(game, playerId);
  return player.cash + Object.entries(game.properties).reduce((sum, [index, property]) => {
    if (property.ownerId !== playerId) return sum;
    const space = propertySpace(Number(index));
    const land = property.mortgaged ? space.mortgage : space.price;
    const buildings = space.type === 'street' ? property.buildings * space.buildCost : 0;
    return sum + land + buildings;
  }, 0);
}
function finishTimed(game: GameState, random: RandomSource) {
  const ranked = activePlayers(game).map((player) => ({
    id: player.id,
    worth: netWorth(game, player.id),
    cash: player.cash,
    unmortgagedProperty: Object.entries(game.properties).reduce((sum, [index, property]) => property.ownerId === player.id && !property.mortgaged ? sum + propertySpace(Number(index)).price : sum, 0)
  })).sort((a, b) => b.worth - a.worth || b.cash - a.cash || b.unmortgagedProperty - a.unmortgagedProperty);
  const top = ranked[0]!;
  let winners = ranked.filter((item) => item.worth === top.worth && item.cash === top.cash && item.unmortgagedProperty === top.unmortgagedProperty).map((item) => item.id);
  while (winners.length > 1) {
    const results = winners.map((id) => ({ id, total: roll(random).reduce((sum, die) => sum + die, 0) }));
    const high = Math.max(...results.map((result) => result.total));
    winners = results.filter((result) => result.total === high).map((result) => result.id);
  }
  game.status = 'finished';
  game.phase = { type: 'finished', winnerIds: winners, reason: 'timer' };
}
function validateTrade(game: GameState, offer: TradeOffer) {
  const from = playerById(game, offer.fromPlayerId);
  const to = playerById(game, offer.toPlayerId);
  const hasDuplicates = (list: readonly unknown[]) => new Set<unknown>(list).size !== list.length;
  if (from.id === to.id || !Number.isSafeInteger(offer.offeredCash) || !Number.isSafeInteger(offer.requestedCash) || offer.offeredCash < 0 || offer.requestedCash < 0 || [offer.offeredProperties, offer.requestedProperties, offer.offeredJailCards, offer.requestedJailCards].some(hasDuplicates)) throw new Error('invalid trade');
  if (from.cash < offer.offeredCash || to.cash < offer.requestedCash) throw new Error('trade cash is unavailable');
  for (const index of offer.offeredProperties) if (propertyAt(game, index).ownerId !== from.id) throw new Error('offered property is unavailable');
  for (const index of offer.requestedProperties) if (propertyAt(game, index).ownerId !== to.id) throw new Error('requested property is unavailable');
  for (const cardId of offer.offeredJailCards) if (!from.jailFreeCards.includes(cardId)) throw new Error('offered Jail card is unavailable');
  for (const cardId of offer.requestedJailCards) if (!to.jailFreeCards.includes(cardId)) throw new Error('requested Jail card is unavailable');
  for (const index of [...offer.offeredProperties, ...offer.requestedProperties]) {
    const space = propertySpace(index);
    if (space.type === 'street' && groupSpaces(space).some((item) => game.properties[item.index]!.buildings > 0)) throw new Error('sell buildings before trading this color group');
  }
  const toInterest = offer.offeredProperties.reduce((sum, index) => sum + (propertyAt(game, index).mortgaged ? Math.ceil(propertySpace(index).mortgage * 0.1) : 0), 0);
  const fromInterest = offer.requestedProperties.reduce((sum, index) => sum + (propertyAt(game, index).mortgaged ? Math.ceil(propertySpace(index).mortgage * 0.1) : 0), 0);
  if (to.cash + offer.offeredCash - offer.requestedCash < toInterest || from.cash + offer.requestedCash - offer.offeredCash < fromInterest) throw new Error('mortgage transfer interest is unavailable');
}

export function reduceGame(input: GameState, command: GameCommand, random: RandomSource = Math.random): GameState {
  const game = clone(input);
  if (game.phase.type === 'paused' && command.type !== 'RESUME' && command.type !== 'TICK' && command.type !== 'LEAVE_ROOM') throw new Error('game is paused');
  switch (command.type) {
    case 'ADD_PLAYER': {
      if (game.status !== 'lobby' || game.players.length >= 6) throw new Error('room is unavailable');
      if (game.players.some((player) => player.id === command.player.id || player.token === command.player.token)) throw new Error('player or token already used');
      game.players.push({ ...command.player, cash: 1500, position: 0, inJail: false, jailTurns: 0, doublesStreak: 0, bankrupt: false, jailFreeCards: [], ready: false, tokenConfirmed: false, connected: true, joinedAt: now() });
      game.turnOrder.push(command.player.id);
      addActivity(game, `${command.player.name} joined the room.`);
      break;
    }
    case 'SET_TOKEN': {
      if (game.status !== 'lobby') throw new Error('characters can only change in the lobby');
      const player = playerById(game, command.playerId);
      if (game.players.some((candidate) => candidate.id !== player.id && candidate.token === command.token)) throw new Error('character already used');
      player.token = command.token;
      player.tokenConfirmed = true;
      player.ready = false;
      break;
    }
    case 'SET_READY': {
      const player = playerById(game, command.playerId);
      if (command.ready && !player.tokenConfirmed) throw new Error('choose a character first');
      player.ready = command.ready;
      break;
    }
    case 'START_GAME': {
      if (game.hostPlayerId !== command.playerId) throw new Error('only the host can start');
      if (game.players.length < 2 || !game.players.every((player) => player.tokenConfirmed && player.ready)) throw new Error('2–6 ready players are required');
      game.status = 'playing'; game.phase = { type: 'awaiting-roll' }; game.timerEndsAt = game.settings.mode === 'quick' ? now() + (game.settings.durationMinutes ?? 60) * 60_000 : null;
      break;
    }
    case 'ROLL': {
      ensureTurn(game, command.playerId);
      if (game.phase.type !== 'awaiting-roll') throw new Error('cannot roll now');
      const player = playerById(game, command.playerId);
      const dice = command.dice ?? roll(random);
      game.lastRoll = dice;
      game.lastCard = null;
      game.lastMovement = {
        id: `${game.revision + 1}:${player.id}:roll`, playerId: player.id, startPosition: player.position,
        segments: [], pauseForCardAfterSegment: null
      };
      const doubles = dice[0] === dice[1];
      if (player.inJail) {
        if (!doubles) {
          player.jailTurns += 1;
          if (player.jailTurns < 3) { game.phase = { type: 'awaiting-end' }; addActivity(game, `${player.name} remains in Jail.`); break; }
          if (!charge(game, player, 50, null, 'mandatory Jail fine')) { game.pendingDebtMovement = { playerId: player.id, spaces: dice[0] + dice[1] }; break; }
        }
        player.inJail = false; player.jailTurns = 0; game.rolledDoubles = false;
      } else {
        player.doublesStreak = doubles ? player.doublesStreak + 1 : 0;
        if (player.doublesStreak === 3) { sendToJail(game, player); break; }
        game.rolledDoubles = doubles;
      }
      const total = dice[0] + dice[1];
      const oldPosition = player.position;
      const destination = (oldPosition + total) % 40;
      if (destination < oldPosition) { player.cash += 200; addActivity(game, `${player.name} passed GO and collected $200.`, 'money'); }
      game.lastMovement.segments.push({ kind: 'steps', reason: 'roll', positions: relativePath(oldPosition, total) });
      player.position = destination;
      addActivity(game, `${player.name} rolled ${dice[0]} + ${dice[1]} and landed on ${BOARD[destination]!.name}.`);
      resolveSpace(game, player, 1, random);
      break;
    }
    case 'BUY_PROPERTY': {
      ensureTurn(game, command.playerId);
      if (game.phase.type !== 'purchase' || game.phase.playerId !== command.playerId) throw new Error('no property is offered');
      const space = propertySpace(game.phase.spaceIndex);
      const player = playerById(game, command.playerId);
      if (player.cash < space.price) throw new Error('not enough cash');
      player.cash -= space.price; propertyAt(game, space.index).ownerId = player.id; game.phase = { type: 'awaiting-end' };
      addActivity(game, `${player.name} bought ${space.name} for $${space.price}.`, 'success');
      break;
    }
    case 'DECLINE_PROPERTY': {
      ensureTurn(game, command.playerId);
      if (game.phase.type !== 'purchase') throw new Error('no property is offered');
      game.phase = { type: 'auction', spaceIndex: game.phase.spaceIndex, bidderId: null, bid: 0, passedPlayerIds: [], deadline: (command.now ?? now()) + 15_000, reason: 'property' };
      break;
    }
    case 'PLACE_BID': {
      if (game.phase.type !== 'auction') throw new Error('no auction is active');
      const player = playerById(game, command.playerId);
      const minimum = game.phase.bid === 0 ? 10 : game.phase.bid + 1;
      if (!Number.isSafeInteger(command.amount) || command.amount < minimum || command.amount > player.cash) throw new Error('invalid bid');
      game.phase.bid = command.amount; game.phase.bidderId = player.id; game.phase.passedPlayerIds = []; game.phase.deadline = (command.now ?? now()) + 10_000;
      addActivity(game, `${player.name} bid $${command.amount}.`);
      break;
    }
    case 'PASS_AUCTION': {
      if (game.phase.type !== 'auction') throw new Error('no auction is active');
      if (!game.phase.passedPlayerIds.includes(command.playerId)) game.phase.passedPlayerIds.push(command.playerId);
      const leaderId = game.phase.bidderId;
      const contenders = activePlayers(game).filter((player) => player.id !== leaderId);
      if (contenders.every((player) => game.phase.type === 'auction' && game.phase.passedPlayerIds.includes(player.id))) closeAuction(game);
      break;
    }
    case 'CLOSE_AUCTION': if (game.phase.type !== 'auction' || (command.now ?? now()) < game.phase.deadline) throw new Error('auction is still active'); else closeAuction(game); break;
    case 'END_TURN': {
      ensureTurn(game, command.playerId);
      if (game.phase.type !== 'awaiting-end') throw new Error('turn cannot end now');
      const current = playerById(game, command.playerId);
      if (game.rolledDoubles && !current.inJail) { game.phase = { type: 'awaiting-roll' }; game.lastRoll = null; game.lastCard = null; game.lastMovement = null; }
      else nextTurn(game);
      if (game.timerExpired && game.turnIndex === 0) finishTimed(game, random);
      break;
    }
    case 'PAY_JAIL_FINE': {
      ensureTurn(game, command.playerId); const player = playerById(game, command.playerId);
      if (!player.inJail || game.phase.type !== 'awaiting-roll') throw new Error('jail fine is unavailable');
      if (charge(game, player, 50, null, 'Jail fine')) { player.inJail = false; player.jailTurns = 0; }
      break;
    }
    case 'USE_JAIL_CARD': {
      ensureTurn(game, command.playerId); const player = playerById(game, command.playerId); const cardId = player.jailFreeCards.shift();
      if (!player.inJail || !cardId) throw new Error('jail card is unavailable');
      player.inJail = false; player.jailTurns = 0; game.heldCardIds = game.heldCardIds.filter((id) => id !== cardId);
      const card = CARD_BY_ID.get(cardId)!; (card.deck === 'chance' ? game.chanceDeck : game.communityChestDeck).push(cardId);
      break;
    }
    case 'BUILD': {
      canManageAssets(game, command.playerId); const space = propertySpace(command.spaceIndex); const property = propertyAt(game, command.spaceIndex); const player = playerById(game, command.playerId);
      if (space.type !== 'street' || property.ownerId !== player.id || !ownsGroup(game, player.id, space.color)) throw new Error('complete this color group first');
      if (groupSpaces(space).some((item) => game.properties[item.index]!.mortgaged) || !buildingIsEven(game, space, 1) || property.buildings === 5) throw new Error('cannot build here');
      if (player.cash < space.buildCost) throw new Error('not enough cash');
      if (property.buildings < 4) { if (game.bankHouses < 1) throw new Error('no houses remain'); game.bankHouses -= 1; }
      else { if (game.bankHotels < 1) throw new Error('no hotels remain'); game.bankHotels -= 1; game.bankHouses += 4; }
      player.cash -= space.buildCost; property.buildings = (property.buildings + 1) as PropertyState['buildings'];
      addActivity(game, `${player.name} improved ${space.name}.`, 'success'); break;
    }
    case 'SELL_BUILDING': {
      canManageAssets(game, command.playerId); const space = propertySpace(command.spaceIndex); const property = propertyAt(game, command.spaceIndex); const player = playerById(game, command.playerId);
      if (space.type !== 'street' || property.ownerId !== player.id || property.buildings === 0 || !buildingIsEven(game, space, -1)) throw new Error('cannot sell this building');
      if (property.buildings === 5) { if (game.bankHouses < 4) throw new Error('not enough houses to break hotel'); game.bankHotels += 1; game.bankHouses -= 4; }
      else game.bankHouses += 1;
      property.buildings = (property.buildings - 1) as PropertyState['buildings']; player.cash += space.buildCost / 2; break;
    }
    case 'MORTGAGE': {
      canManageAssets(game, command.playerId); const space = propertySpace(command.spaceIndex); const property = propertyAt(game, command.spaceIndex); const player = playerById(game, command.playerId);
      if (property.ownerId !== player.id || property.mortgaged) throw new Error('property cannot be mortgaged');
      if (space.type === 'street' && groupSpaces(space).some((item) => game.properties[item.index]!.buildings > 0)) throw new Error('sell buildings first');
      property.mortgaged = true; player.cash += space.mortgage; break;
    }
    case 'UNMORTGAGE': {
      canManageAssets(game, command.playerId); const space = propertySpace(command.spaceIndex); const property = propertyAt(game, command.spaceIndex); const player = playerById(game, command.playerId); const cost = Math.ceil(space.mortgage * 1.1);
      if (property.ownerId !== player.id || !property.mortgaged || player.cash < cost) throw new Error('property cannot be unmortgaged');
      property.mortgaged = false; player.cash -= cost; break;
    }
    case 'SETTLE_DEBT': {
      if (game.phase.type !== 'debt' || game.phase.playerId !== command.playerId) throw new Error('no debt is awaiting payment');
      const debt = game.phase;
      const player = playerById(game, command.playerId);
      if (player.cash < debt.amount) throw new Error('not enough cash to settle debt');
      player.cash -= debt.amount;
      if (debt.creditorId) playerById(game, debt.creditorId).cash += debt.amount;
      addActivity(game, `${player.name} settled $${debt.amount} for ${debt.reason}.`, 'money');
      const pendingMovement = game.pendingDebtMovement;
      game.pendingDebtMovement = null;
      if (pendingMovement?.playerId === player.id) {
        player.inJail = false; player.jailTurns = 0;
        player.position = (player.position + pendingMovement.spaces) % 40;
        addActivity(game, `${player.name} left Jail and landed on ${BOARD[player.position]!.name}.`);
        resolveSpace(game, player, 1, random);
      } else game.phase = { type: 'awaiting-end' };
      break;
    }
    case 'PROPOSE_TRADE': validateTrade(game, command.offer); if (command.offer.fromPlayerId !== command.playerId) throw new Error('invalid trade owner'); game.pendingTrade = clone(command.offer); break;
    case 'RESPOND_TRADE': {
      const offer = game.pendingTrade; if (!offer || offer.toPlayerId !== command.playerId) throw new Error('trade is unavailable');
      if (command.accept) {
        validateTrade(game, offer); const from = playerById(game, offer.fromPlayerId); const to = playerById(game, offer.toPlayerId);
        from.cash += offer.requestedCash - offer.offeredCash; to.cash += offer.offeredCash - offer.requestedCash;
        const toInterest = offer.offeredProperties.reduce((sum, index) => sum + (propertyAt(game, index).mortgaged ? Math.ceil(propertySpace(index).mortgage * 0.1) : 0), 0);
        const fromInterest = offer.requestedProperties.reduce((sum, index) => sum + (propertyAt(game, index).mortgaged ? Math.ceil(propertySpace(index).mortgage * 0.1) : 0), 0);
        to.cash -= toInterest; from.cash -= fromInterest;
        for (const index of offer.offeredProperties) propertyAt(game, index).ownerId = to.id;
        for (const index of offer.requestedProperties) propertyAt(game, index).ownerId = from.id;
        for (const id of offer.offeredJailCards) { from.jailFreeCards = from.jailFreeCards.filter((item) => item !== id); to.jailFreeCards.push(id); }
        for (const id of offer.requestedJailCards) { to.jailFreeCards = to.jailFreeCards.filter((item) => item !== id); from.jailFreeCards.push(id); }
        addActivity(game, `${from.name} and ${to.name} completed a trade.`, 'success');
      }
      game.pendingTrade = null; break;
    }
    case 'DECLARE_BANKRUPTCY': {
      if (game.phase.type !== 'debt' || game.phase.playerId !== command.playerId) throw new Error('bankruptcy is unavailable');
      const debtor = playerById(game, command.playerId); const creditorId = game.phase.creditorId; debtor.bankrupt = true;
      if (game.pendingDebtMovement?.playerId === debtor.id) game.pendingDebtMovement = null;
      if (!creditorId) {
        const returnedProperties = returnPlayerToBank(game, debtor.id);
        addActivity(game, `${debtor.name} is bankrupt.`, 'warning');
        if (returnedProperties.length) { game.bankruptcyAuctionQueue = returnedProperties; startBankruptcyAuction(game); }
        else nextTurn(game);
        break;
      }
      let buildingRefund = 0;
      let mortgageInterest = 0;
      for (const [indexText, property] of Object.entries(game.properties)) if (property.ownerId === debtor.id) {
        const space = propertySpace(Number(indexText));
        if (space.type === 'street' && property.buildings > 0) {
          buildingRefund += property.buildings * space.buildCost / 2;
          if (property.buildings === 5) game.bankHotels += 1;
          else game.bankHouses += property.buildings;
          property.buildings = 0;
        }
        property.ownerId = creditorId;
        if (property.mortgaged) mortgageInterest += Math.ceil(space.mortgage * 0.1);
      }
      const creditor = playerById(game, creditorId);
      creditor.cash += debtor.cash + buildingRefund;
      creditor.cash = Math.max(0, creditor.cash - mortgageInterest);
      creditor.jailFreeCards.push(...debtor.jailFreeCards);
      debtor.cash = 0; debtor.jailFreeCards = [];
      addActivity(game, `${debtor.name} is bankrupt.`, 'warning');
      nextTurn(game);
      break;
    }
    case 'LEAVE_ROOM': {
      const leaving = playerById(game, command.playerId);
      if (game.status === 'lobby') {
        game.players = game.players.filter((player) => player.id !== leaving.id);
        game.turnOrder = game.turnOrder.filter((id) => id !== leaving.id);
        transferHostAfterDeparture(game, leaving.id);
        break;
      }
      if (game.status === 'finished') {
        leaving.connected = false;
        leaving.bankrupt = true;
        transferHostAfterDeparture(game, leaving.id);
        break;
      }
      const paused = game.phase.type === 'paused' ? game.phase : null;
      if (paused) game.phase = paused.previous;
      if (game.pendingTrade && [game.pendingTrade.fromPlayerId, game.pendingTrade.toPlayerId].includes(leaving.id)) game.pendingTrade = null;
      if (game.pendingDebtMovement?.playerId === leaving.id) game.pendingDebtMovement = null;
      game.bankruptcyAuctionQueue.push(...returnPlayerToBank(game, leaving.id));
      game.bankruptcyAuctionQueue = [...new Set(game.bankruptcyAuctionQueue)].sort((a, b) => a - b);
      transferHostAfterDeparture(game, leaving.id);
      addActivity(game, `${leaving.name} left the room.`, 'warning');
      if (!finishForLastActivePlayer(game)) {
        if (game.phase.type === 'auction') normalizeAuctionAfterDeparture(game, leaving.id, command.now ?? now());
        else if (game.currentPlayerId === leaving.id) nextTurn(game);
        if (paused && game.status === 'playing') game.phase = { type: 'paused', pausedAt: paused.pausedAt, previous: game.phase as Exclude<GamePhase, { type: 'paused' }> };
      }
      break;
    }
    case 'PAUSE': if (game.hostPlayerId !== command.playerId || game.phase.type === 'paused' || game.phase.type === 'finished') throw new Error('cannot pause'); else game.phase = { type: 'paused', pausedAt: command.now ?? now(), previous: game.phase }; break;
    case 'RESUME': {
      if (game.hostPlayerId !== command.playerId || game.phase.type !== 'paused') throw new Error('cannot resume');
      const paused = game.phase;
      if (game.timerEndsAt) game.timerEndsAt += Math.max(0, (command.now ?? now()) - paused.pausedAt);
      game.phase = paused.previous;
      break;
    }
    case 'TICK': {
      const tickNow = command.now ?? now();
      if (game.phase.type === 'paused') break;
      if (game.phase.type === 'auction' && tickNow >= game.phase.deadline) closeAuction(game);
      if (game.timerEndsAt && tickNow >= game.timerEndsAt) game.timerExpired = true;
      break;
    }
  }
  if (command.type === 'ROLL' && game.lastMovement?.segments.length === 0) game.lastMovement = null;
  game.revision += 1;
  return game;
}
