import { describe, expect, it } from 'vitest';
import {
  BOARD,
  CHANCE_CARDS,
  COMMUNITY_CHEST_CARDS,
  PROPERTY_SPACES,
  createGame,
  reduceGame,
  type GameCommand,
  type PlayerSeed
} from './index';

const players: PlayerSeed[] = [
  { id: 'p1', name: 'Alex', token: 'rocket' },
  { id: 'p2', name: 'Sam', token: 'key' }
];

describe('canonical North American game data', () => {
  it('contains the complete board and both 16-card decks', () => {
    expect(BOARD).toHaveLength(40);
    expect(BOARD.filter((space) => space.type === 'street')).toHaveLength(22);
    expect(BOARD.filter((space) => space.type === 'railroad')).toHaveLength(4);
    expect(BOARD.filter((space) => space.type === 'utility')).toHaveLength(2);
    expect(PROPERTY_SPACES).toHaveLength(28);
    expect(CHANCE_CARDS).toHaveLength(16);
    expect(COMMUNITY_CHEST_CARDS).toHaveLength(16);
  });

  it('preserves the endpoint deed values', () => {
    expect(BOARD[1]).toMatchObject({ name: 'Mediterranean Avenue', price: 60, mortgage: 30, rents: [2, 10, 30, 90, 160, 250] });
    expect(BOARD[39]).toMatchObject({ name: 'Boardwalk', price: 400, mortgage: 200, rents: [50, 200, 600, 1400, 1700, 2000] });
  });

  it('preserves every street purchase, mortgage, building, and rent value', () => {
    const signature = BOARD.filter((space) => space.type === 'street').map((space) => [space.index, space.price, space.mortgage, space.buildCost, ...space.rents]);
    expect(signature).toEqual([
      [1,60,30,50,2,10,30,90,160,250], [3,60,30,50,4,20,60,180,320,450],
      [6,100,50,50,6,30,90,270,400,550], [8,100,50,50,6,30,90,270,400,550], [9,120,60,50,8,40,100,300,450,600],
      [11,140,70,100,10,50,150,450,625,750], [13,140,70,100,10,50,150,450,625,750], [14,160,80,100,12,60,180,500,700,900],
      [16,180,90,100,14,70,200,550,750,950], [18,180,90,100,14,70,200,550,750,950], [19,200,100,100,16,80,220,600,800,1000],
      [21,220,110,150,18,90,250,700,875,1050], [23,220,110,150,18,90,250,700,875,1050], [24,240,120,150,20,100,300,750,925,1100],
      [26,260,130,150,22,110,330,800,975,1150], [27,260,130,150,22,110,330,800,975,1150], [29,280,140,150,24,120,360,850,1025,1200],
      [31,300,150,200,26,130,390,900,1100,1275], [32,300,150,200,26,130,390,900,1100,1275], [34,320,160,200,28,150,450,1000,1200,1400],
      [37,350,175,200,35,175,500,1100,1300,1500], [39,400,200,200,50,200,600,1400,1700,2000]
    ]);
  });
});

describe('authoritative game reducer', () => {
  it('starts every player with $1,500 and waits for the first roll', () => {
    const game = createGame(players, { mode: 'official' }, () => 0);
    expect(game.players.every((player) => player.cash === 1500)).toBe(true);
    expect(game.phase).toEqual({ type: 'awaiting-roll' });
    expect(game.currentPlayerId).toBe('p1');
  });

  it('moves, pays GO, and offers unowned property for purchase', () => {
    const game = createGame(players, { mode: 'official' }, () => 0);
    const command: GameCommand = { type: 'ROLL', playerId: 'p1', dice: [1, 2] };
    const next = reduceGame(game, command, () => 0);
    expect(next.players[0]).toMatchObject({ position: 3, cash: 1500 });
    expect(next.phase).toEqual({ type: 'purchase', spaceIndex: 3, playerId: 'p1' });
  });

  it('buys a property and automatically charges its rent', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    game = reduceGame(game, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    game = reduceGame(game, { type: 'BUY_PROPERTY', playerId: 'p1' }, () => 0);
    game = reduceGame(game, { type: 'END_TURN', playerId: 'p1' }, () => 0);
    game = reduceGame(game, { type: 'ROLL', playerId: 'p2', dice: [1, 2] }, () => 0);
    expect(game.players.find((player) => player.id === 'p1')?.cash).toBe(1444);
    expect(game.players.find((player) => player.id === 'p2')?.cash).toBe(1496);
  });

  it('rejects commands from a player who does not own the turn', () => {
    const game = createGame(players, { mode: 'official' }, () => 0);
    expect(() => reduceGame(game, { type: 'ROLL', playerId: 'p2', dice: [2, 3] }, () => 0)).toThrow('not your turn');
  });

  it('lets a debtor raise funds and settle the exact outstanding payment', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    game.players[0]!.cash = 10;
    game.properties[39]!.ownerId = 'p1';
    game = reduceGame(game, { type: 'ROLL', playerId: 'p1', dice: [2, 2] }, () => 0);
    expect(game.phase).toMatchObject({ type: 'debt', amount: 200, creditorId: null });
    game = reduceGame(game, { type: 'MORTGAGE', playerId: 'p1', spaceIndex: 39 }, () => 0);
    game = reduceGame(game, { type: 'SETTLE_DEBT', playerId: 'p1' }, () => 0);
    expect(game.players[0]!.cash).toBe(10);
    expect(game.phase).toEqual({ type: 'awaiting-end' });
  });

  it('returns buildings to bank inventory when a player goes bankrupt to the Bank', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    game.properties[1] = { ownerId: 'p1', mortgaged: false, buildings: 4 };
    game.bankHouses = 28;
    game.players[0]!.cash = 0;
    game.phase = { type: 'debt', playerId: 'p1', creditorId: null, amount: 200, reason: 'tax' };
    game = reduceGame(game, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' }, () => 0);
    expect(game.bankHouses).toBe(32);
    expect(game.properties[1]).toEqual({ ownerId: null, mortgaged: false, buildings: 0 });
  });

  it('charges the recipient ten percent when a mortgaged deed changes hands', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    game.properties[1] = { ownerId: 'p1', mortgaged: true, buildings: 0 };
    const offer = {
      id: 'trade-1', fromPlayerId: 'p1', toPlayerId: 'p2', offeredCash: 0, requestedCash: 0,
      offeredProperties: [1], requestedProperties: [], offeredJailCards: [], requestedJailCards: []
    };
    game = reduceGame(game, { type: 'PROPOSE_TRADE', playerId: 'p1', offer }, () => 0);
    game = reduceGame(game, { type: 'RESPOND_TRADE', playerId: 'p2', accept: true }, () => 0);
    expect(game.players[1]!.cash).toBe(1497);
    expect(game.properties[1]!.ownerId).toBe('p2');
  });

  it('freezes a quick-game clock while the host pauses play', () => {
    let game = createGame(players, { mode: 'quick', durationMinutes: 45 }, () => 0, 0);
    const originalEnd = game.timerEndsAt!;
    game = reduceGame(game, { type: 'PAUSE', playerId: 'p1', now: 1_000 }, () => 0);
    game = reduceGame(game, { type: 'TICK', now: originalEnd + 10_000 }, () => 0);
    expect(game.timerExpired).toBe(false);
    game = reduceGame(game, { type: 'RESUME', playerId: 'p1', now: 61_000 }, () => 0);
    expect(game.timerEndsAt).toBe(originalEnd + 60_000);
    expect(game.phase).toEqual({ type: 'awaiting-roll' });
  });

  it('uses a server roll-off after every quick-game value tie-breaker is exhausted', () => {
    let game = createGame(players, { mode: 'quick', durationMinutes: 45 }, () => 0, 0);
    game.currentPlayerId = 'p2'; game.turnIndex = 1; game.phase = { type: 'awaiting-end' }; game.timerExpired = true;
    const values = [0, 0, 0.999, 0.999]; let cursor = 0;
    game = reduceGame(game, { type: 'END_TURN', playerId: 'p2' }, () => values[cursor++] ?? 0);
    expect(game.phase).toEqual({ type: 'finished', winnerIds: ['p2'], reason: 'timer' });
  });

  it('auctions every deed returned by a bankruptcy to the Bank', () => {
    const threePlayers = [...players, { id: 'p3', name: 'Jo', token: 'coffee' }];
    let game = createGame(threePlayers, { mode: 'official' }, () => 0);
    game.properties[1]!.ownerId = 'p1'; game.properties[3]!.ownerId = 'p1'; game.players[0]!.cash = 0;
    game.phase = { type: 'debt', playerId: 'p1', creditorId: null, amount: 200, reason: 'tax' };
    game = reduceGame(game, { type: 'DECLARE_BANKRUPTCY', playerId: 'p1' }, () => 0);
    expect(game.phase).toMatchObject({ type: 'auction', spaceIndex: 1, reason: 'bankruptcy' });
    game = reduceGame(game, { type: 'PLACE_BID', playerId: 'p2', amount: 10, now: 0 }, () => 0);
    game = reduceGame(game, { type: 'PASS_AUCTION', playerId: 'p3' }, () => 0);
    expect(game.phase).toMatchObject({ type: 'auction', spaceIndex: 3, reason: 'bankruptcy' });
    game = reduceGame(game, { type: 'PLACE_BID', playerId: 'p3', amount: 12, now: 0 }, () => 0);
    game = reduceGame(game, { type: 'PASS_AUCTION', playerId: 'p2' }, () => 0);
    expect(game.properties[1]!.ownerId).toBe('p2');
    expect(game.properties[3]!.ownerId).toBe('p3');
    expect(game.phase).toEqual({ type: 'awaiting-roll' });
    expect(game.currentPlayerId).toBe('p2');
  });

  it('continues the third failed Jail roll after its mandatory fine is raised', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    Object.assign(game.players[0]!, { position: 10, inJail: true, jailTurns: 2, cash: 0 });
    game.properties[39]!.ownerId = 'p1';
    game = reduceGame(game, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    expect(game.phase).toMatchObject({ type: 'debt', amount: 50 });
    game = reduceGame(game, { type: 'MORTGAGE', playerId: 'p1', spaceIndex: 39 }, () => 0);
    game = reduceGame(game, { type: 'SETTLE_DEBT', playerId: 'p1' }, () => 0);
    expect(game.players[0]).toMatchObject({ position: 13, inJail: false, cash: 150 });
    expect(game.phase).toMatchObject({ type: 'purchase', spaceIndex: 13 });
  });

  it('rejects malformed trade values and fractional auction bids', () => {
    let game = createGame(players, { mode: 'official' }, () => 0);
    const badOffer = { id: 'bad', fromPlayerId: 'p1', toPlayerId: 'p2', offeredCash: -50, requestedCash: 0, offeredProperties: [], requestedProperties: [], offeredJailCards: [], requestedJailCards: [] };
    expect(() => reduceGame(game, { type: 'PROPOSE_TRADE', playerId: 'p1', offer: badOffer }, () => 0)).toThrow('invalid trade');
    game = reduceGame(game, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    game = reduceGame(game, { type: 'DECLINE_PROPERTY', playerId: 'p1', now: 0 }, () => 0);
    expect(() => reduceGame(game, { type: 'PLACE_BID', playerId: 'p2', amount: 10.5, now: 0 }, () => 0)).toThrow('invalid bid');
  });
});
