# Lobby Characters, Shared Balances, and Room Leaving Design

## Goal

Make character selection part of the room lobby, show every player's live cash balance on the main game screen, and let a player permanently leave a room without stranding the authoritative multiplayer session.

## Existing System and Root Causes

Monopoly Party has a server-authoritative React client, Cloudflare Worker gateway, Durable Object room, and pure game reducer.

- `Landing` currently collects a token before room creation or joining, and both public room endpoints require it. The lobby can only display the token already chosen.
- `GameScreen` exposes only the local player's cash in the My assets tab. No shared balance component exists.
- `App` renders an active session whenever a stored room identity exists. There is no authenticated leave operation, session deletion helper, or game-screen navigation back to landing.

The existing WebSocket reconnect path and server snapshots are otherwise healthy; the relevant baseline has 47 passing tests.

## Product Requirements

### Character selection

- Landing collects a nickname and, for room creation, game settings. It does not display or submit a character picker.
- The server assigns each new room member the first available character as a temporary unique placeholder. Server assignment prevents two simultaneous joins from receiving the same character.
- A new `tokenConfirmed` player-state field is initially `false` in a lobby. The lobby renders all six characters, marks characters held by another player unavailable, and lets a player confirm or change their own character.
- Character changes use a server-authoritative `SET_TOKEN` command. The reducer accepts it only while the room is in lobby status and rejects a character held by another player.
- A successful selection sets `tokenConfirmed` to `true` and resets that player's ready state to `false`. A player cannot become ready until their character is confirmed.
- The host follows the same selection and readiness rules as guests. A game can start only when every player has confirmed a character and is ready.
- Character availability updates from the same complete snapshots already broadcast to every connected client.

### Shared balances

- `GameScreen` renders a compact balance rail immediately below the status header and above the current tab content.
- The rail includes every player in turn order, including bankrupt players, with their token, name, and authoritative cash balance.
- The current player and local player have distinguishable accessible labels; bankrupt players remain visible with a bankrupt state and a zero balance.
- On narrow screens the rail scrolls horizontally rather than shrinking content or causing page-level horizontal overflow. It remains visible on Game, My assets, Trade, and Activity tabs.
- Balances come directly from each received `GameState` snapshot. The client does not predict transfers or keep a separate balance cache.

### Permanent room leaving

- Lobby and game screens expose a Leave room control. Activating it opens a confirmation sheet that clearly states the exit is permanent.
- Cancelling closes the sheet without changing room or client state.
- Confirming calls an authenticated HTTP leave endpoint using the stored reconnect token. The client remains in the room and shows progress until the server confirms success.
- The Durable Object persists the updated room before returning success and broadcasts the resulting snapshot to remaining sockets.
- Only after success does the client delete the stored identity, close its WebSocket through normal React cleanup, reset application session state, and navigate to `#/`.
- A failed request leaves the player in the room and presents a retryable error. It must not clear credentials or pretend the player left.
- The server deletes the leaver's authentication record, so old reconnect credentials and newly requested socket tickets are rejected after a confirmed leave.

## Authoritative Leave Semantics

### Lobby

- Remove the player from `players` and `turnOrder`, releasing their character immediately.
- If the host leaves and players remain, transfer host ownership immediately to the earliest joined remaining player.
- If the last lobby player leaves, delete the room's stored state. Later join or reconnect requests return room-not-found or unauthorized responses.

### Active or finished game

- Keep the departed player in the historical player list, set `connected` to `false`, and mark them bankrupt. This preserves board, activity, and winner history while removing them from all active-player decisions.
- Treat the departure as voluntary bankruptcy to the Bank: set cash to zero; return buildings to bank inventory; return Jail cards to their decks; return deeds unmortgaged to the Bank; and queue returned deeds for mandatory bank auctions.
- Cancel a pending trade if the leaver is either party.
- Remove the leaver from auction eligibility. If they lead the current auction, restart that auction at its opening state and deadline for the remaining solvent players; otherwise record them as no longer participating. A one-player remainder ends the game before another auction begins.
- If the leaver owns the current turn or an exclusive purchase/debt/end-turn phase, abandon that phase, service queued bankruptcy auctions, then advance to the next solvent player.
- If another player owns the current phase, preserve that phase and service the queued bankruptcy auctions at the next safe phase boundary. Auction-queue handling is centralized so returned deeds cannot be skipped.
- A paused game stays paused. The saved underlying phase is normalized using the same rules, and the replacement host can resume it safely.
- If the host leaves, immediately transfer host ownership to the earliest joined connected solvent player, falling back to the earliest joined solvent player when all remaining players are temporarily disconnected.
- When only one solvent player remains, finish immediately with that player as winner and do not start or continue property auctions.
- Leaving an already finished game revokes membership and marks presence disconnected without changing the recorded winner.

## Architecture and Interfaces

### Game package

- Extend `PlayerState` with `tokenConfirmed: boolean`.
- Add `SET_TOKEN` and `LEAVE_ROOM` reducer commands. `LEAVE_ROOM` is invoked by the trusted Durable Object leave endpoint, not accepted from arbitrary WebSocket payloads.
- Extract the existing bankruptcy-to-Bank work into focused helpers used by both debt bankruptcy and voluntary leaving.
- Centralize safe phase advancement and queued bank-auction handling so the same rules apply after bankruptcy and leaving.

### Worker and Durable Object

- Public route: `POST /api/rooms/:code/leave` with the reconnect token in the Authorization header and a client-generated `leaveRequestId` in the JSON body.
- Internal Durable Object route: `POST /leave`, receiving the forwarded bearer credential.
- Authenticate by reconnect-token hash, apply the trusted leave transition, delete the auth record, store a departure receipt keyed by token hash and `leaveRequestId`, persist, then broadcast.
- Keep `SET_TOKEN` in the validated WebSocket command allowlist and payload schemas. Do not add `LEAVE_ROOM` to that client command allowlist.
- Joining no longer accepts a token. Token placeholder allocation happens inside the Durable Object transaction against current room state.

### Web client

- Change `PlayerForm` to nickname only and remove token state and markup from `Landing`.
- Add session deletion and authenticated `leaveRoom` API helpers.
- `App` owns the leave lifecycle because it owns session persistence and routing. It passes an async leave callback and state into both lobby and game views.
- Add a reusable lobby character picker and a reusable leave confirmation sheet.
- Add a focused `PlayerBalances` component to `GameScreen`.

## Error Handling and Concurrency

- Simultaneous character requests are serialized by the Durable Object and reducer revision checks. The loser receives the normal rejected-command message and latest snapshot.
- Simultaneous join allocation reads the current persisted room state before assigning the first free character.
- Leave requests are idempotent: retrying the same `leaveRequestId` and token after a lost response matches a five-minute departure receipt and returns success without applying the transition twice. A different request ID with a revoked token remains unauthorized. Receipts are keyed by token hash rather than plaintext reconnect token; a last-player lobby exit may retain only this short-lived receipt after deleting the room record.
- The leave UI disables duplicate confirmation submissions.
- Remaining clients rely on the authoritative broadcast and existing reconnect loop; no separate presence mutation is performed in the browser.
- A socket close racing a successful HTTP leave cannot restore membership because the authentication record is already revoked and close handling only updates presence for players still represented by the room.

## Testing and Verification

### Automated tests

- Reducer tests cover placeholder confirmation, duplicate-character rejection, readiness gating, character-change readiness reset, lobby removal, host transfer, voluntary bankruptcy assets, current-turn and non-current-turn exits, auction-leader exit, paused exit, pending-trade cancellation, and immediate winner resolution.
- Worker/session tests cover payload validation and prove `LEAVE_ROOM` cannot be sent over the public WebSocket command protocol.
- Web UI tests cover removal of the landing picker, lobby picker availability and selection, shared live balances, bankrupt balance display, leave confirmation/cancel/progress/error behavior, and local session removal only after server success.
- Existing reducer, Worker, UI, build, lint, typecheck, and PWA validation suites remain green.

### Browser connectivity test

A Playwright test uses isolated host and guest browser contexts against real local Durable Objects and verifies:

1. Host creates and guest joins using names only.
2. Both pick different characters in the lobby, become ready, and start.
3. Both screens show both authoritative $1,500 balances.
4. A gameplay cash change is broadcast and displayed consistently.
5. One player confirms Leave room and reaches landing only after the server response.
6. The remaining player receives the updated snapshot and winner state without reconnecting.
7. The departed player's old reconnect credential is rejected.
8. Reloading the remaining browser restores the same authoritative room without connectivity errors.

Run `npm run check` followed by `npm run test:e2e` as the final verification gate.

## Out of Scope

- Temporarily hiding a game while retaining room membership.
- Rejoining a room under the identity of a player who permanently left.
- Spectator mode, replacement players, or mid-game character changes.
- Changing net-worth visibility; this feature exposes live cash balances only.
