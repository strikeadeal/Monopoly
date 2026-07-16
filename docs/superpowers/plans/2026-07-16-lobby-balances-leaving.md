# Lobby Characters, Shared Balances, and Room Leaving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move character choice into the lobby, expose all live cash balances on the game screen, and provide a permanent server-confirmed room exit that cannot strand multiplayer state.

**Architecture:** Keep every shared-state change in the pure game reducer and Durable Object. Joining receives a unique provisional character, lobby selection uses the existing revision-checked WebSocket protocol, balances render directly from snapshots, and leaving uses an authenticated idempotent HTTP request that is persisted before the client clears its identity.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Testing Library, Cloudflare Workers and Durable Objects, Playwright.

## Global Constraints

- The Durable Object remains authoritative; clients do not predict balances, character availability, or leave results.
- Landing accepts names and game settings only; every lobby player must explicitly confirm a character before readying.
- A confirmed leave is permanent and revokes reconnect access.
- Mid-game leaving resolves as bankruptcy to the Bank and cannot strand turns, auctions, trades, pauses, or host ownership.
- Preserve the current 2–6 player limit and six-token set.
- Do not add dependencies.
- Use failing tests before each production change.
- Final verification is `npm run check` followed by `npm run test:e2e` against real local Durable Objects.

## File Map

- `packages/game/src/types.ts` — shared player state and command contracts.
- `packages/game/src/engine.ts` — lobby selection, readiness, voluntary leaving, bankruptcy reuse, host transfer, and safe phase advancement.
- `packages/game/src/game.test.ts` — reducer regressions for character and leave semantics.
- `apps/worker/src/session.ts` — public command payload validation and provisional-token selection helper.
- `apps/worker/src/session.test.ts` — protocol boundary and token allocation tests.
- `apps/worker/src/index.ts` — name-only room endpoints, authenticated idempotent leave route, auth revocation, persistence, and broadcasts.
- `apps/web/src/api.ts` — name-only forms, leave request, and local session deletion.
- `apps/web/src/App.tsx` — leave lifecycle and routing ownership.
- `apps/web/src/components/Landing.tsx` — remove pre-join character selection.
- `apps/web/src/components/Lobby.tsx` — lobby character picker, readiness gating, and leave action.
- `apps/web/src/components/LeaveRoom.tsx` — reusable permanent-exit confirmation UI.
- `apps/web/src/components/PlayerBalances.tsx` — snapshot-driven shared cash rail.
- `apps/web/src/components/GameScreen.tsx` — balance rail and leave control integration.
- `apps/web/src/styles.css` — responsive picker, balances, and leave sheet styles.
- `apps/web/src/ui.test.tsx` — component behavior regressions.
- `tests/e2e/multiplayer.spec.ts` — real two-client lobby, balance, leaving, reconnect, and reload coverage.

---

### Task 1: Server-authoritative lobby character selection

**Files:**
- Modify: `packages/game/src/types.ts`
- Modify: `packages/game/src/engine.ts`
- Test: `packages/game/src/game.test.ts`

**Interfaces:**
- Produces: `PlayerState.tokenConfirmed: boolean`.
- Produces: `GameCommand` member `{ type: 'SET_TOKEN'; playerId: string; token: TokenId }`.
- Preserves: `PlayerSeed.token: TokenId` as the unique provisional token assigned before the reducer receives a player.

- [ ] **Step 1: Write failing character-selection reducer tests**

Add tests that use a lobby rather than a started game:

```ts
it('requires every lobby player to confirm a unique token before readying', () => {
  let lobby = createLobby(players[0]!, { mode: 'official' }, 1_000, () => 0);
  lobby = reduceGame(lobby, { type: 'ADD_PLAYER', player: players[1]! }, () => 0);

  expect(lobby.players.map(({ token, tokenConfirmed, ready }) => ({ token, tokenConfirmed, ready }))).toEqual([
    { token: 'rocket', tokenConfirmed: false, ready: false },
    { token: 'key', tokenConfirmed: false, ready: false }
  ]);
  expect(() => reduceGame(lobby, { type: 'SET_READY', playerId: 'p1', ready: true }, () => 0)).toThrow('choose a character first');

  lobby = reduceGame(lobby, { type: 'SET_TOKEN', playerId: 'p1', token: 'coffee' }, () => 0);
  expect(lobby.players[0]).toMatchObject({ token: 'coffee', tokenConfirmed: true, ready: false });
  expect(() => reduceGame(lobby, { type: 'SET_TOKEN', playerId: 'p2', token: 'coffee' }, () => 0)).toThrow('character already used');
});

it('resets readiness when a confirmed lobby character changes', () => {
  let lobby = createLobby(players[0]!, { mode: 'official' }, 1_000, () => 0);
  lobby = reduceGame(lobby, { type: 'SET_TOKEN', playerId: 'p1', token: 'rocket' }, () => 0);
  lobby = reduceGame(lobby, { type: 'SET_READY', playerId: 'p1', ready: true }, () => 0);
  lobby = reduceGame(lobby, { type: 'SET_TOKEN', playerId: 'p1', token: 'coffee' }, () => 0);
  expect(lobby.players[0]).toMatchObject({ token: 'coffee', tokenConfirmed: true, ready: false });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run packages/game/src/game.test.ts`

Expected: TypeScript/Vitest fails because `tokenConfirmed` and `SET_TOKEN` do not exist and readiness currently succeeds without confirmation.

- [ ] **Step 3: Add the shared types and minimal reducer behavior**

Update the contracts:

```ts
export interface PlayerSeed { id: string; name: string; token: TokenId }
export interface PlayerState extends PlayerSeed {
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  doublesStreak: number;
  bankrupt: boolean;
  jailFreeCards: string[];
  ready: boolean;
  tokenConfirmed: boolean;
  connected: boolean;
  joinedAt: number;
}

export type GameCommand =
  | { type: 'ADD_PLAYER'; player: PlayerSeed }
  | { type: 'SET_TOKEN'; playerId: string; token: TokenId }
  | { type: 'SET_READY'; playerId: string; ready: boolean }
```

Insert the `SET_TOKEN` member between the existing `ADD_PLAYER` and `SET_READY` members without changing the remaining command members.

Set `tokenConfirmed: true` for `createGame`, but override it to `false` for the host in `createLobby`; `ADD_PLAYER` sets it to `false`. Add reducer cases:

```ts
case 'SET_TOKEN': {
  if (game.status !== 'lobby') throw new Error('characters can only change in the lobby');
  const player = playerById(game, command.playerId);
  if (game.players.some((candidate) => candidate.id !== player.id && candidate.token === command.token)) {
    throw new Error('character already used');
  }
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
```

Strengthen `START_GAME` to require `tokenConfirmed && ready` for every player.

- [ ] **Step 4: Run the focused reducer suite and verify GREEN**

Run: `npm test -- --run packages/game/src/game.test.ts`

Expected: all game reducer tests pass.

- [ ] **Step 5: Commit the character-state slice**

```bash
git add packages/game/src/types.ts packages/game/src/engine.ts packages/game/src/game.test.ts
git commit -m "Add lobby character confirmation"
```

---

### Task 2: Safe voluntary leaving in the game reducer

**Files:**
- Modify: `packages/game/src/types.ts`
- Modify: `packages/game/src/engine.ts`
- Test: `packages/game/src/game.test.ts`

**Interfaces:**
- Produces: `GameCommand` member `{ type: 'LEAVE_ROOM'; playerId: string; now?: number }` for trusted server use.
- Produces: one centralized `returnPlayerToBank(game, playerId)` path reused by debt bankruptcy and leaving.
- Produces: safe queued-auction behavior at turn/auction boundaries.

- [ ] **Step 1: Write failing lobby and active-game leave tests**

Add focused tests for host transfer, property return, trade cancellation, turn advancement, and winner resolution:

```ts
it('removes a lobby host and transfers hosting to the earliest remaining player', () => {
  let lobby = createLobby(players[0]!, { mode: 'official' }, 1_000, () => 0);
  lobby = reduceGame(lobby, { type: 'ADD_PLAYER', player: players[1]! }, () => 0);
  lobby = reduceGame(lobby, { type: 'LEAVE_ROOM', playerId: 'p1', now: 2_000 }, () => 0);
  expect(lobby.players.map((player) => player.id)).toEqual(['p2']);
  expect(lobby.turnOrder).toEqual(['p2']);
  expect(lobby.hostPlayerId).toBe('p2');
});

it('turns a mid-game exit into bank bankruptcy and immediately declares the last player winner', () => {
  let game = createGame(players, { mode: 'official' }, () => 0);
  game.properties[1] = { ownerId: 'p1', mortgaged: true, buildings: 0 };
  game.players[0]!.cash = 700;
  game = reduceGame(game, { type: 'LEAVE_ROOM', playerId: 'p1', now: 2_000 }, () => 0);
  expect(game.players[0]).toMatchObject({ bankrupt: true, connected: false, cash: 0 });
  expect(game.properties[1]).toEqual({ ownerId: null, mortgaged: false, buildings: 0 });
  expect(game.hostPlayerId).toBe('p2');
  expect(game.phase).toEqual({ type: 'finished', winnerIds: ['p2'], reason: 'bankruptcy' });
});

it('preserves another player turn and services a departed player deed at the next boundary', () => {
  const threePlayers = [...players, { id: 'p3', name: 'Jo', token: 'coffee' as const }];
  let game = createGame(threePlayers, { mode: 'official' }, () => 0);
  game.properties[1]!.ownerId = 'p3';
  game.phase = { type: 'awaiting-end' };
  game = reduceGame(game, { type: 'LEAVE_ROOM', playerId: 'p3', now: 2_000 }, () => 0);
  expect(game.currentPlayerId).toBe('p1');
  expect(game.phase).toEqual({ type: 'awaiting-end' });
  game = reduceGame(game, { type: 'END_TURN', playerId: 'p1' }, () => 0);
  expect(game.phase).toMatchObject({ type: 'auction', spaceIndex: 1, reason: 'bankruptcy' });
});
```

Also add separate tests that prove:

```ts
expect(game.pendingTrade).toBeNull();
expect(game.phase).toMatchObject({ type: 'auction', bidderId: null, bid: 0, passedPlayerIds: [] });
expect(game.phase).toMatchObject({ type: 'paused' });
```

for a leaving trade party, a leaving auction leader, and a host/current player leaving while paused.

- [ ] **Step 2: Run the focused reducer suite and verify RED**

Run: `npm test -- --run packages/game/src/game.test.ts`

Expected: compilation fails because `LEAVE_ROOM` is absent.

- [ ] **Step 3: Extract bank-bankruptcy helpers before adding leave behavior**

Extract the existing `DECLARE_BANKRUPTCY` asset loop into a helper with this contract:

```ts
function returnPlayerToBank(game: GameState, playerId: string) {
  const player = playerById(game, playerId);
  player.bankrupt = true;
  player.connected = false;
  const returnedProperties: number[] = [];
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
```

Add focused helpers with explicit responsibilities:

```ts
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

function normalizeAuctionAfterDeparture(game: GameState, playerId: string, at: number) {
  if (game.phase.type !== 'auction') return;
  if (game.phase.bidderId === playerId) {
    game.phase = { ...game.phase, bidderId: null, bid: 0, passedPlayerIds: [], deadline: at + 15_000 };
    return;
  }
  if (!game.phase.passedPlayerIds.includes(playerId)) game.phase.passedPlayerIds.push(playerId);
}
```

At the top of `nextTurn`, keep the existing last-player winner check, then add:

```ts
if (game.bankruptcyAuctionQueue.length) {
  startBankruptcyAuction(game);
  return;
}
```

Update `DECLARE_BANKRUPTCY` to call `returnPlayerToBank` only for bankruptcy to the Bank. Keep its existing creditor transfer branch intact.

- [ ] **Step 4: Implement the trusted `LEAVE_ROOM` reducer transition**

Add the command type and reducer case. The case must:

```ts
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
  if (game.pendingTrade && [game.pendingTrade.fromPlayerId, game.pendingTrade.toPlayerId].includes(leaving.id)) game.pendingTrade = null;
  game.bankruptcyAuctionQueue.push(...returnPlayerToBank(game, leaving.id));
  game.bankruptcyAuctionQueue = [...new Set(game.bankruptcyAuctionQueue)].sort((a, b) => a - b);
  transferHostAfterDeparture(game, leaving.id);
  addActivity(game, `${leaving.name} left the room.`, 'warning');
  if (finishForLastActivePlayer(game)) break;
  if (game.phase.type === 'auction') normalizeAuctionAfterDeparture(game, leaving.id, command.now ?? now());
  else if (game.currentPlayerId === leaving.id) nextTurn(game);
  break;
}
```

For a paused game, save the wrapper, set `game.phase` to `paused.previous`, run the same normalization, then restore `{ type: 'paused', pausedAt: paused.pausedAt, previous: game.phase }` unless winner evaluation changed status to `finished`. This gives a restarted auction a fresh 15-second deadline from `command.now` while keeping its countdown frozen until resume.

- [ ] **Step 5: Run focused and full reducer tests and verify GREEN**

Run: `npm test -- --run packages/game/src/game.test.ts`

Expected: all leave, bankruptcy, auction, pause, and existing game tests pass.

- [ ] **Step 6: Commit the leave-state slice**

```bash
git add packages/game/src/types.ts packages/game/src/engine.ts packages/game/src/game.test.ts
git commit -m "Add safe permanent room leaving"
```

---

### Task 3: Worker protocol, provisional tokens, and idempotent leave endpoint

**Files:**
- Modify: `apps/worker/src/session.ts`
- Modify: `apps/worker/src/session.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Produces: `firstAvailableToken(state: GameState): TokenId`.
- Produces: validated `SET_TOKEN` payload `{ token: TokenId }`.
- Produces: `POST /api/rooms/:code/leave` body `{ leaveRequestId: string }`.
- Produces: departure receipt key `departure:<tokenHash>:<leaveRequestId>` retained for five minutes.

- [ ] **Step 1: Write failing Worker helper and payload tests**

```ts
it('validates token selection but never exposes leave as a socket command', () => {
  expect(validateClientPayload('SET_TOKEN', { token: 'coffee' })).toEqual({ token: 'coffee' });
  expect(validateClientPayload('SET_TOKEN', { token: 'car' })).toBeNull();
  expect(validateClientPayload('LEAVE_ROOM', {})).toBeNull();
});

it('allocates the first character not held by a lobby player', () => {
  const lobby = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000);
  expect(firstAvailableToken(lobby)).toBe('key');
  lobby.players.push({ ...lobby.players[0]!, id: 'p2', token: 'key' });
  expect(firstAvailableToken(lobby)).toBe('coffee');
});
```

- [ ] **Step 2: Run Worker tests and verify RED**

Run: `npm test -- --run apps/worker/src/session.test.ts`

Expected: imports or assertions fail because `SET_TOKEN` validation and `firstAvailableToken` are absent.

- [ ] **Step 3: Add Worker validation and deterministic token allocation**

In `session.ts`, export the canonical token order and helper:

```ts
export const TOKENS = ['rocket', 'key', 'coffee', 'bolt', 'star', 'globe'] as const;
export function firstAvailableToken(state: GameState): TokenId {
  const used = new Set(state.players.map((player) => player.token));
  const token = TOKENS.find((candidate) => !used.has(candidate));
  if (!token) throw new Error('room is full');
  return token;
}
```

Add `SET_TOKEN` to the command allowlist and `payloadSchemas`, but deliberately leave `LEAVE_ROOM` absent.

- [ ] **Step 4: Change create/join request contracts to names only**

Replace the player schema and Durable Object bodies:

```ts
const playerSchema = z.object({ nickname: z.string().trim().min(1).max(24) });
const createSchema = playerSchema.extend({ settings: settingsSchema });
```

During initialization assign `TOKENS[0]`. During join, call `firstAvailableToken(room.state)` inside the Durable Object immediately before `ADD_PLAYER`. Return the existing session identity shape unchanged.

- [ ] **Step 5: Implement the authenticated idempotent leave route**

Add route matching for `leave`, a `leaveSchema` requiring a UUID-like string of 8–100 characters, and a public forwarder that preserves Authorization. In the Durable Object:

```ts
const tokenHash = await sha256(bearer);
const receiptKey = `departure:${tokenHash}:${leaveRequestId}`;
if (await this.ctx.storage.get(receiptKey)) return json({ ok: true, alreadyLeft: true });
const authEntry = Object.entries(room.auth).find(([, auth]) => auth.tokenHash === tokenHash);
if (!authEntry) return json({ error: 'Reconnect token rejected.' }, 401);
room.state = reduceGame(room.state, { type: 'LEAVE_ROOM', playerId: authEntry[0], now: Date.now() });
delete room.auth[authEntry[0]];
await this.ctx.storage.put(receiptKey, { expiresAt: Date.now() + 300_000 });
```

Persist the room before returning and broadcast exactly one snapshot. If the last lobby member leaves, delete the `room` record but retain only the five-minute departure receipt so `/exists` returns 404 and an identical leave retry still succeeds. Extend alarm cleanup to delete expired receipt keys without recreating a room.

- [ ] **Step 6: Run Worker tests, typecheck, and build**

Run: `npm test -- --run apps/worker/src/session.test.ts && npm run typecheck --workspace @monopoly/worker && npm run build --workspace @monopoly/worker`

Expected: tests pass and both commands exit 0.

- [ ] **Step 7: Commit the Worker protocol slice**

```bash
git add apps/worker/src/session.ts apps/worker/src/session.test.ts apps/worker/src/index.ts
git commit -m "Add lobby tokens and authenticated leave endpoint"
```

---

### Task 4: Landing, lobby picker, and confirmed leave lifecycle

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Landing.tsx`
- Modify: `apps/web/src/components/Lobby.tsx`
- Create: `apps/web/src/components/LeaveRoom.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Produces: `PlayerForm { nickname: string }`.
- Produces: `removeSession(code: string): void`.
- Produces: `leaveRoom(session, leaveRequestId): Promise<void>`.
- Produces: `LeaveRoom` props `{ busy; error; onConfirm; compact? }`.
- Lobby consumes existing `send` with `SET_TOKEN` and receives leave lifecycle props from `App`.

- [ ] **Step 1: Write failing landing, lobby picker, and leave-dialog tests**

Import `Lobby` and `LeaveRoom`, then add:

```tsx
it('collects a name without asking for a character before joining', () => {
  render(<Landing onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
  expect(screen.queryByText('Choose a token')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Rocket' })).toBeNull();
});

it('selects an available character in the lobby before readying', () => {
  const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000, () => 0);
  const send = vi.fn();
  render(<Lobby state={state} playerId="p1" send={send} onLeave={() => undefined} leaving={false} leaveError={null} />);
  expect(screen.getByRole('button', { name: 'I’m ready' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Coffee' }));
  expect(send).toHaveBeenCalledWith({ type: 'SET_TOKEN', token: 'coffee' });
});

it('requires confirmation and reports a failed permanent leave without closing', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('Connection failed.'));
  render(<LeaveRoom busy={false} error="Connection failed." onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
  expect(screen.getByText('This permanently removes you from the room.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Leave permanently' }));
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert')).toHaveTextContent('Connection failed.');
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: old landing picker assertions fail and new component/props are missing.

- [ ] **Step 3: Simplify landing and API contracts**

Change the form contract and requests:

```ts
export interface PlayerForm { nickname: string }
export const leaveRoom = (session: SessionIdentity, leaveRequestId: string) => request<{ ok: true }>(
  `/api/rooms/${session.roomCode}/leave`,
  { method: 'POST', headers: { authorization: `Bearer ${session.reconnectToken}` }, body: JSON.stringify({ leaveRequestId }) }
);
export function removeSession(code: string) { localStorage.removeItem(storageKey(code)); }
```

Remove token imports, state, picker markup, and token submission from `Landing`.

- [ ] **Step 4: Build the reusable confirmation component**

`LeaveRoom.tsx` owns only open/closed UI state. It calls `onConfirm`, stays open while errors are present, disables both actions while busy, and uses a destructive accessible label:

```tsx
export function LeaveRoom({ busy, error, onConfirm, compact = false }: LeaveRoomProps) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={compact ? 'leave-button compact' : 'leave-button'} onClick={() => setOpen(true)}>Leave room</button>
    {open ? <div className="drawer-backdrop"><section className="leave-sheet" role="dialog" aria-labelledby="leave-title">
      <h2 id="leave-title">Leave this room?</h2>
      <p>This permanently removes you from the room.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="action-row">
        <button disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button className="danger-button" disabled={busy} onClick={() => void onConfirm()}>{busy ? 'Leaving…' : 'Leave permanently'}</button>
      </div>
    </section></div> : null}
  </>;
}
```

- [ ] **Step 5: Add the lobby picker and readiness gating**

Render all `tokenNames` keys. Disable a character held by another player, mark the local confirmed token selected, and send `{ type: 'SET_TOKEN', token }`. Disable the ready control when `!me.tokenConfirmed`. Add `LeaveRoom` below the lobby actions.

- [ ] **Step 6: Make `App` own confirmed leaving**

Add `leaving` and `leaveError` state. Keep one request ID across retries until success:

```ts
const leaveRequestId = useRef<string | null>(null);
const leave = async () => {
  if (!session) return;
  setLeaving(true);
  setLeaveError(null);
  leaveRequestId.current ??= crypto.randomUUID();
  try {
    await leaveRoom(session, leaveRequestId.current);
    removeSession(session.roomCode);
    leaveRequestId.current = null;
    setSession(null);
    location.hash = '#/';
  } catch (error) {
    setLeaveError(error instanceof Error ? error.message : 'Could not leave the room.');
  } finally {
    setLeaving(false);
  }
};
```

Pass the lifecycle into both `Lobby` and `GameScreen`. Do not clear the session in the error path.

- [ ] **Step 7: Add responsive picker and sheet styling**

Reuse the existing token-picker visual language in the lobby, add unavailable/selected states, and ensure the confirmation drawer respects safe-area insets and 44px touch targets.

- [ ] **Step 8: Run UI tests and web typecheck**

Run: `npm test -- --run apps/web/src/ui.test.tsx && npm run typecheck --workspace @monopoly/web`

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 9: Commit the client lobby and leave slice**

```bash
git add apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/components/Landing.tsx apps/web/src/components/Lobby.tsx apps/web/src/components/LeaveRoom.tsx apps/web/src/styles.css apps/web/src/ui.test.tsx
git commit -m "Move character choice to lobby and add room leaving"
```

---

### Task 5: Snapshot-driven shared balance rail

**Files:**
- Create: `apps/web/src/components/PlayerBalances.tsx`
- Modify: `apps/web/src/components/GameScreen.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Produces: `PlayerBalances({ state, playerId }: { state: GameState; playerId: string })`.
- Consumes: `state.turnOrder`, `state.players`, and authoritative `player.cash` only.

- [ ] **Step 1: Write failing shared-balance tests**

```tsx
it('shows every player authoritative cash balance on the game screen', () => {
  const state = makeState();
  state.players[0]!.cash = 1325;
  state.players[1]!.cash = 1675;
  render(<GameScreen state={state} {...screenProps} onLeave={() => undefined} leaving={false} leaveError={null} />);
  expect(screen.getByLabelText('Alex, you, current player, $1,325')).toBeInTheDocument();
  expect(screen.getByLabelText('Sam, $1,675')).toBeInTheDocument();
});

it('keeps a bankrupt player visible at zero cash', () => {
  const state = makeState();
  Object.assign(state.players[1]!, { bankrupt: true, cash: 0 });
  render(<GameScreen state={state} {...screenProps} onLeave={() => undefined} leaving={false} leaveError={null} />);
  expect(screen.getByLabelText('Sam, bankrupt, $0')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: accessible balance labels are absent.

- [ ] **Step 3: Implement the focused balance component**

```tsx
export function PlayerBalances({ state, playerId }: { state: GameState; playerId: string }) {
  const ordered = state.turnOrder.map((id) => state.players.find((player) => player.id === id)).filter((player): player is PlayerState => Boolean(player));
  return <section className="player-balances" aria-label="Player balances">
    {ordered.map((player) => {
      const labels = [player.name, player.id === playerId ? 'you' : '', player.id === state.currentPlayerId && state.status === 'playing' ? 'current player' : '', player.bankrupt ? 'bankrupt' : '', money.format(player.cash)].filter(Boolean);
      return <article key={player.id} className={`balance-chip${player.id === playerId ? ' is-me' : ''}${player.id === state.currentPlayerId ? ' is-current' : ''}${player.bankrupt ? ' is-bankrupt' : ''}`} aria-label={labels.join(', ')}>
        <TokenIcon token={player.token} />
        <span>{player.name}</span>
        <strong>{money.format(player.cash)}</strong>
      </article>;
    })}
  </section>;
}
```

Export or duplicate the existing money formatter locally. Render the rail below `status-rail` and above all tab content. Place compact `LeaveRoom` access in the status header without hiding host pause/resume controls.

- [ ] **Step 4: Add no-overflow responsive styling**

Use `display:flex`, `overflow-x:auto`, `scrollbar-width:none`, fixed chip minimum widths, and no page-width expansion. Update the landscape grid so the balance rail spans both columns and the board/actions remain in the next row.

- [ ] **Step 5: Run UI tests, typecheck, and web build**

Run: `npm test -- --run apps/web/src/ui.test.tsx && npm run typecheck --workspace @monopoly/web && npm run build --workspace @monopoly/web`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the balance rail**

```bash
git add apps/web/src/components/PlayerBalances.tsx apps/web/src/components/GameScreen.tsx apps/web/src/styles.css apps/web/src/ui.test.tsx
git commit -m "Show all player balances during games"
```

---

### Task 6: Real multiplayer connectivity regression and full verification

**Files:**
- Modify: `tests/e2e/multiplayer.spec.ts`

**Interfaces:**
- Verifies the public room HTTP API, real local Durable Objects, WebSocket snapshots, browser storage, and two isolated client contexts together.

- [ ] **Step 1: Update the existing Playwright flow and verify it fails before the completed UI path**

Change creation/join steps to pick characters inside the lobby and add explicit balance assertions:

```ts
await host.getByLabel('Your name').fill('Alex');
await host.getByRole('button', { name: 'Create game' }).click();
await host.getByRole('button', { name: 'Rocket' }).click();
await host.getByRole('button', { name: 'I’m ready' }).click();

await guest.getByLabel('Your name').fill('Sam');
await guest.getByRole('button', { name: 'Join game' }).click();
await guest.getByRole('button', { name: 'Key' }).click();
await guest.getByRole('button', { name: 'I’m ready' }).click();

await expect(host.getByLabel('Alex, you, current player, $1,500')).toBeVisible();
await expect(host.getByLabel('Sam, $1,500')).toBeVisible();
await expect(guest.getByLabel('Alex, current player, $1,500')).toBeVisible();
await expect(guest.getByLabel('Sam, you, $1,500')).toBeVisible();
```

Run: `npm run test:e2e -- --grep "two isolated phones"`

Expected before all implementation slices are integrated: failure at the first missing lobby or balance behavior.

- [ ] **Step 2: Extend the flow through permanent leaving**

Capture the guest identity from local storage before leaving. After starting the game, have the guest leave:

```ts
const guestIdentity = await guest.evaluate((code) => localStorage.getItem(`monopoly-party:session:${code}`), roomCode);
await guest.getByRole('button', { name: 'Leave room' }).click();
await guest.getByRole('button', { name: 'Leave permanently' }).click();
await expect(guest.getByText('The board in every pocket.')).toBeVisible();
await expect(host.getByText('Sam, bankrupt')).toBeVisible();
await expect(host.getByText('Alex wins')).toBeVisible();
```

Use `guest.request.post` with the captured reconnect token to prove `/socket-ticket` returns 401 after leaving. Reload the host and assert the same winner plus `Live` connectivity state.

- [ ] **Step 3: Preserve existing movement, reload, and responsive assertions**

Keep the current two-client board count, movement synchronization, no-horizontal-overflow, square-board, card-dismissal, and reload checks. Perform the roll/reload segment before the guest leaves so both active clients still exercise recovery.

- [ ] **Step 4: Run the focused browser test and verify GREEN**

Run: `npm run test:e2e -- --grep "two isolated phones"`

Expected: 1 passed with no browser console or connectivity failures.

- [ ] **Step 5: Run the complete verification gate**

Run: `npm run check`

Expected: lint, strict TypeScript, all Vitest suites, all builds, PWA validation, and service-worker checks exit 0.

Run: `npm run test:e2e`

Expected: every Playwright project passes against real local Durable Objects with no connectivity failures.

- [ ] **Step 6: Inspect the final diff for requirement coverage**

Run: `git status --short && git diff --check && git diff --stat HEAD~5`

Expected: only the planned source, test, style, spec, and plan files are present; `git diff --check` prints nothing.

- [ ] **Step 7: Commit the end-to-end regression**

```bash
git add tests/e2e/multiplayer.spec.ts
git commit -m "Verify lobby balances and leaving end to end"
```
