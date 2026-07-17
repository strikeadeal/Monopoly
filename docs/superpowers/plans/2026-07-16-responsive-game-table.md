# Responsive Game Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable phone board interaction with an accessible overview-and-browser pattern, fill the game command rail with useful context, and polish secondary workflows without changing game rules or connectivity.

**Architecture:** `GameScreen` owns a responsive compact-board flag and composes focused presentation components. `Board` renders interactive buttons on larger screens and non-interactive visual cells on compact screens. New board-navigation and ledger components consume only `GameState`, board data, and selection callbacks, so they do not send game commands or mutate authoritative state.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Vitest/Testing Library, Playwright, Cloudflare Workers/Durable Objects.

## Global Constraints

- Do not change the game reducer, command protocol, room persistence, or WebSocket behavior.
- Keep the board square outside phone landscape; use the accepted 1.17:1 landscape concept ratio while preserving all ownership, building, mortgage, and token signals.
- Phone primary controls must be at least 44×44 px.
- Compact-board cells must not be pointer or keyboard targets.
- Preserve reduced-motion, focus-visible, safe-area, and standalone PWA behavior.
- Add no runtime dependency.

---

### Task 1: Responsive Board Presentation

**Files:**
- Create: `apps/web/src/useCompactLayout.ts`
- Create: `apps/web/src/components/BoardNavigator.tsx`
- Modify: `apps/web/src/components/Board.tsx`
- Modify: `apps/web/src/components/GameScreen.tsx`
- Modify: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Produces: `useCompactLayout(): boolean`
- Produces: `BoardNavigator({ state, onSelect }: { state: GameState; onSelect: (index: number) => void }): JSX.Element`
- Changes: `Board` accepts `compact?: boolean`

- [ ] **Step 1: Write failing compact-board and navigator tests**

Add tests that render `Board compact`, assert the 40 `data-testid="board-space"` nodes are not buttons, render `BoardNavigator`, assert previous/current/next space controls, open “Browse all spaces,” and select a property.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: FAIL because `BoardNavigator` and compact board behavior do not exist.

- [ ] **Step 3: Implement the responsive hook**

Create a `matchMedia('(max-width: 520px)')` hook that subscribes to `change`, returns the current match, and safely cleans up.

- [ ] **Step 4: Implement compact board cells**

Refactor each board space through a shared content fragment. Render a `<div data-testid="board-space">` when `compact` is true and the current `<button>` otherwise. Preserve classes, styles, token labels, and property-state rendering.

- [ ] **Step 5: Implement neighborhood navigation and board browser**

Render previous/current/next space buttons around `state.currentPlayerId`. Add a dialog sheet containing all 40 spaces. Selecting any space calls `onSelect(index)` and closes the browser.

- [ ] **Step 6: Compose the navigator on the game tab**

Call `useCompactLayout()` in `GameScreen`, pass it to `Board`, and render `BoardNavigator` after the board only for compact layouts.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: PASS.

### Task 2: Contextual Ledger and Header Controls

**Files:**
- Create: `apps/web/src/components/TableLedger.tsx`
- Modify: `apps/web/src/components/LeaveRoom.tsx`
- Modify: `apps/web/src/components/GameScreen.tsx`
- Modify: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Produces: `TableLedger({ state }: { state: GameState }): JSX.Element`
- Changes: compact `LeaveRoom` button retains text for assistive technology and renders a code-native exit icon.

- [ ] **Step 1: Write failing ledger and control tests**

Assert that the game tab shows the latest three activity entries, the compact leave button has accessible name “Leave room,” and both table controls expose icon content without relying on generated CSS text.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: FAIL because the ledger and explicit icon markup do not exist.

- [ ] **Step 3: Implement the ledger**

Render a `section` labelled “Latest at the table,” take `state.activities.slice(0, 3)`, display a tone dot, formatted time, and event text, and provide a useful empty state.

- [ ] **Step 4: Replace prototype header glyphs**

Use inline SVG for pause, resume, and leave. Keep accessible labels on buttons and add `data-tooltip` strings for desktop CSS.

- [ ] **Step 5: Place the ledger in the command rail**

Render `TableLedger` after `TurnActions` or `MovementTurnCard` on the game tab. Keep the turn action first in document and visual order.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: PASS.

### Task 3: Trade and Activity Polish

**Files:**
- Create: `apps/web/src/components/ActivityTimeline.tsx`
- Modify: `apps/web/src/components/GameScreen.tsx`
- Modify: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Produces: `ActivityTimeline({ entries }: { entries: ActivityEntry[] }): JSX.Element`
- Changes: trade deed rows show `Purchase $N` and `Mortgage $N`.

- [ ] **Step 1: Write failing trade and activity tests**

Assert that trade deed labels expose purchase and mortgage values. Render activity entries with the same minute and assert that the visible minute label is shown once while all event text remains.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: FAIL because deed values and grouped timestamps are absent.

- [ ] **Step 3: Add deed values**

For street, railroad, and utility rows, derive `price` and `mortgage` from `PROPERTY_SPACES`; render the values in a secondary line without changing selected values or submitted offers.

- [ ] **Step 4: Implement the activity timeline**

Group consecutive entries by `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`. Render the time once per group and every entry as a semantic list item with its existing tone.

- [ ] **Step 5: Replace the inline activity list**

Use `ActivityTimeline` on the Activity tab.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run apps/web/src/ui.test.tsx`

Expected: PASS.

### Task 4: Responsive Visual System

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `tests/e2e/multiplayer.spec.ts`

**Interfaces:**
- Consumes: `.board.is-compact`, `.board-navigator`, `.board-browser`, `.table-ledger`, `.activity-group`, and explicit table-control SVG markup.
- Produces: responsive rules for phone and desktop without protocol or component API changes.

- [ ] **Step 1: Add failing E2E assertions**

In iPhone portrait, assert compact board cells are not buttons, neighborhood controls exist, board browser opens, every browser row is at least 44 px high, and the page has no horizontal overflow. On desktop, assert board spaces remain buttons and the ledger is visible beneath the turn card.

- [ ] **Step 2: Run Playwright and verify failure**

Run: `npm run test:e2e`

Expected: FAIL on the new compact-board and ledger assertions.

- [ ] **Step 3: Consolidate component rules**

Keep global tokens in one `:root` block. Remove overridden duplicate values where safe. Add:

- 44 px table controls with visible SVGs and pointer-width tooltips.
- Non-interactive compact board cursor behavior.
- Three-column neighborhood strip with a prominent current space.
- Scrollable board-browser rows at least 44 px high.
- Desktop grid rows that place navigation, turn card, and ledger in one right rail.
- Mobile ledger spacing that uses the formerly empty field without covering bottom navigation.
- 44 px trade deed rows and secondary deed values.
- Grouped activity timeline spacing.

- [ ] **Step 4: Run component and E2E tests**

Run: `npm test -- --run apps/web/src/ui.test.tsx && npm run test:e2e`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify only; no expected source changes.

**Interfaces:**
- Consumes the complete responsive game-table implementation.

- [ ] **Step 1: Run repository verification**

Run: `npm run check`

Expected: lint, TypeScript, 76+ Vitest tests, web/game builds, PWA validation, and Worker dry run all pass.

- [ ] **Step 2: Run rendered browser QA**

Start the local Worker on port 8787 and Vite on port 4173. Verify page identity, nonblank content, no framework overlay, clean console, 390×844 and 1280×720 screenshots, board browser interaction, and trade/activity surfaces.

- [ ] **Step 3: Play ten live turns**

Create a two-player room against the real local Durable Object, complete ten turns including any required purchase, rent, card, doubles, debt, or end-turn actions, and confirm synchronized balances, ownership, round, and current player.

- [ ] **Step 4: Verify connectivity**

Confirm `GET /api/health` returns 200, WebSockets upgrade successfully, reload the host room, and verify it returns to “Live” with the same board and no console errors.

- [ ] **Step 5: Review the worktree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended design, component, style, test, spec, and plan files changed.
