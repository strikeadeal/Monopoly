export const PROTOCOL_VERSION = 1;

export type TokenId = 'rocket' | 'key' | 'coffee' | 'bolt' | 'star' | 'globe';
export type ColorGroup = 'brown' | 'light-blue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'dark-blue';
export type PropertyKind = 'street' | 'railroad' | 'utility';

export interface BaseSpace { index: number; name: string; type: string }
export interface StreetSpace extends BaseSpace {
  type: 'street'; color: ColorGroup; price: number; mortgage: number; buildCost: number; rents: [number, number, number, number, number, number];
}
export interface RailroadSpace extends BaseSpace { type: 'railroad'; price: 200; mortgage: 100 }
export interface UtilitySpace extends BaseSpace { type: 'utility'; price: 150; mortgage: 75 }
export interface TaxSpace extends BaseSpace { type: 'tax'; amount: number }
export interface CardSpace extends BaseSpace { type: 'chance' | 'community-chest' }
export interface CornerSpace extends BaseSpace { type: 'go' | 'jail' | 'free-parking' | 'go-to-jail' }
export type BoardSpace = StreetSpace | RailroadSpace | UtilitySpace | TaxSpace | CardSpace | CornerSpace;

export type CardEffect =
  | { type: 'money-bank'; amount: number }
  | { type: 'money-players'; amount: number }
  | { type: 'move-to'; index: number; collectGo: boolean }
  | { type: 'move-nearest'; kind: 'railroad' | 'utility'; rentMultiplier: number }
  | { type: 'move-relative'; spaces: number }
  | { type: 'repairs'; house: number; hotel: number }
  | { type: 'jail' }
  | { type: 'jail-free' };

export interface GameCard { id: string; deck: 'chance' | 'community-chest'; title: string; detail: string; effect: CardEffect }
export interface PlayerSeed { id: string; name: string; token: TokenId }
export interface PlayerState extends PlayerSeed {
  cash: number; position: number; inJail: boolean; jailTurns: number; doublesStreak: number; bankrupt: boolean; jailFreeCards: string[]; ready: boolean; tokenConfirmed: boolean; connected: boolean; joinedAt: number;
}
export interface PropertyState { ownerId: string | null; mortgaged: boolean; buildings: 0 | 1 | 2 | 3 | 4 | 5 }
export interface ActivityEntry { id: string; at: number; text: string; tone?: 'money' | 'warning' | 'success' }
export interface GameSettings { mode: 'official' | 'quick'; durationMinutes?: 45 | 60 | 90 }
export interface TradeOffer { id: string; fromPlayerId: string; toPlayerId: string; offeredCash: number; requestedCash: number; offeredProperties: number[]; requestedProperties: number[]; offeredJailCards: string[]; requestedJailCards: string[] }
export interface LastCardDraw { drawId: string; cardId: string; deck: 'chance' | 'community-chest'; playerId: string }
export type MovementSegment =
  | { kind: 'steps'; reason: 'roll' | 'card'; positions: number[] }
  | { kind: 'direct'; reason: 'jail'; destination: number };
export interface MovementEvent {
  id: string;
  playerId: string;
  startPosition: number;
  segments: MovementSegment[];
  pauseForCardAfterSegment: number | null;
}

export type GamePhase =
  | { type: 'lobby' }
  | { type: 'awaiting-roll' }
  | { type: 'purchase'; spaceIndex: number; playerId: string }
  | { type: 'auction'; spaceIndex: number; bidderId: string | null; bid: number; passedPlayerIds: string[]; deadline: number; reason: 'property' | 'building' | 'bankruptcy' }
  | { type: 'debt'; playerId: string; creditorId: string | null; amount: number; reason: string }
  | { type: 'awaiting-end' }
  | { type: 'paused'; pausedAt: number; previous: Exclude<GamePhase, { type: 'paused' }> }
  | { type: 'finished'; winnerIds: string[]; reason: 'bankruptcy' | 'timer' };

export interface GameState {
  roomCode?: string;
  revision: number;
  status: 'lobby' | 'playing' | 'finished';
  hostPlayerId: string;
  players: PlayerState[];
  settings: GameSettings;
  phase: GamePhase;
  currentPlayerId: string;
  turnOrder: string[];
  turnIndex: number;
  round: number;
  timerEndsAt: number | null;
  timerExpired: boolean;
  lastRoll: [number, number] | null;
  rolledDoubles: boolean;
  lastCard: LastCardDraw | null;
  lastMovement?: MovementEvent | null;
  properties: Record<number, PropertyState>;
  bankHouses: number;
  bankHotels: number;
  chanceDeck: string[];
  communityChestDeck: string[];
  heldCardIds: string[];
  activities: ActivityEntry[];
  pendingTrade: TradeOffer | null;
  bankruptcyAuctionQueue: number[];
  pendingDebtMovement: { playerId: string; spaces: number } | null;
}

export type GameCommand =
  | { type: 'ADD_PLAYER'; player: PlayerSeed }
  | { type: 'SET_TOKEN'; playerId: string; token: TokenId }
  | { type: 'SET_READY'; playerId: string; ready: boolean }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'ROLL'; playerId: string; dice?: [number, number] }
  | { type: 'BUY_PROPERTY'; playerId: string }
  | { type: 'DECLINE_PROPERTY'; playerId: string; now?: number }
  | { type: 'PLACE_BID'; playerId: string; amount: number; now?: number }
  | { type: 'PASS_AUCTION'; playerId: string }
  | { type: 'CLOSE_AUCTION'; now?: number }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'PAY_JAIL_FINE'; playerId: string }
  | { type: 'USE_JAIL_CARD'; playerId: string }
  | { type: 'BUILD'; playerId: string; spaceIndex: number }
  | { type: 'SELL_BUILDING'; playerId: string; spaceIndex: number }
  | { type: 'MORTGAGE'; playerId: string; spaceIndex: number }
  | { type: 'UNMORTGAGE'; playerId: string; spaceIndex: number }
  | { type: 'SETTLE_DEBT'; playerId: string }
  | { type: 'PROPOSE_TRADE'; playerId: string; offer: TradeOffer }
  | { type: 'RESPOND_TRADE'; playerId: string; accept: boolean }
  | { type: 'DECLARE_BANKRUPTCY'; playerId: string }
  | { type: 'PAUSE'; playerId: string; now?: number }
  | { type: 'RESUME'; playerId: string; now?: number }
  | { type: 'TICK'; now?: number };

export interface CommandEnvelope { protocolVersion: number; commandId: string; expectedRevision: number; type: GameCommand['type']; payload: Record<string, unknown> & { playerId?: string } }
export type ServerMessage =
  | { type: 'hello'; protocolVersion: number; playerId: string }
  | { type: 'snapshot'; protocolVersion: number; state: GameState }
  | { type: 'commandAccepted'; commandId: string; revision: number }
  | { type: 'commandRejected'; commandId: string; code: string; message: string; state?: GameState }
  | { type: 'presence'; playerId: string; connected: boolean }
  | { type: 'protocolMismatch'; expected: number }
  | { type: 'pong'; at: number };
