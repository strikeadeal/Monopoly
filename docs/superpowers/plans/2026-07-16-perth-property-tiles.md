# Perth Property Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every US street tile and street-specific Chance label with the approved Perth suburb mapping without changing property economics or game behavior.

**Architecture:** Keep `packages/game/src/data.ts` as the shared source of truth and preserve all property indices and numeric values. Protect the complete mapping with a focused data test, then update the one web accessibility assertion that directly names a street.

**Tech Stack:** TypeScript, React, Vitest, Vite

## Global Constraints

- Preserve all 40 board indices and all existing prices, rents, mortgages, build costs, colors, and gameplay rules.
- Orange is Hillarys, Victoria Park, and Bayswater; Red retains Scarborough.
- Rename only streets and street-specific Chance card copy.
- Do not change railroads, utilities, taxes, special spaces, schemas, commands, APIs, or persisted property indices.

---

### Task 1: Protect and implement the Perth street mapping

**Files:**
- Modify: `packages/game/src/game.test.ts`
- Modify: `packages/game/src/data.ts`

**Interfaces:**
- Consumes: exported `BOARD: BoardSpace[]` and `CHANCE_CARDS: GameCard[]`
- Produces: the approved street names at the existing board indices and matching Chance display copy

- [ ] **Step 1: Replace the legacy single-property assertion with a failing full mapping test**

Add an assertion that filters `BOARD` to street spaces and compares `[index, name, color]` tuples against all 22 approved entries. Add assertions that cards `ch-boardwalk`, `ch-illinois`, and `ch-charles` have titles/details naming Peppermint Grove, Scarborough, and Cannington while retaining indices 39, 24, and 11.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- packages/game/src/game.test.ts`

Expected: FAIL because the board still contains names such as `Mediterranean Avenue` and the three Chance cards still contain US street names.

- [ ] **Step 3: Apply the approved names in shared data**

Replace only the `name` argument of each `street(...)` call in `packages/game/src/data.ts` using the table in the design spec. Change the three street-specific Chance card titles/details to the corresponding destination names. Keep card IDs, effects, indices, colors, and every numeric value unchanged.

- [ ] **Step 4: Run the focused game test and verify it passes**

Run: `npm test -- packages/game/src/game.test.ts`

Expected: PASS with the complete mapping and Chance copy assertions satisfied.

### Task 2: Update the rendered board assertion

**Files:**
- Modify: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Consumes: `BOARD` through the rendered `Board` component
- Produces: an accessibility regression assertion for the renamed index 1 tile

- [ ] **Step 1: Update the expected accessible player-position label**

Change `Alex on Mediterranean Avenue` to `Alex on Armadale`. This is an expectation-only update because Task 1 already changes the rendered source data.

- [ ] **Step 2: Run the web component test**

Run: `npm test -- apps/web/src/ui.test.tsx`

Expected: PASS, proving the new street name reaches the board token accessibility label.

### Task 3: Verify the complete change

**Files:**
- Verify: `packages/game/src/data.ts`
- Verify: `packages/game/src/game.test.ts`
- Verify: `apps/web/src/ui.test.tsx`

**Interfaces:**
- Consumes: the completed board data and tests
- Produces: repository-wide evidence that the rename is compatible and renderable

- [ ] **Step 1: Confirm no legacy US street names remain in product code**

Run `rg` for every replaced US street name under `packages` and `apps`. Expected: no matches except intentional historical documentation, if any.

- [ ] **Step 2: Run all automated tests**

Run: `npm test`

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 with game, worker, and web TypeScript/Vite builds completing.

- [ ] **Step 4: Render and inspect the board**

Start the existing web development server, load the game board, and inspect desktop and mobile layouts. Select a renamed property and confirm its details show the same name. Check for clipping, overlap, runtime overlays, and relevant console warnings/errors.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git diff -- packages/game/src/data.ts packages/game/src/game.test.ts apps/web/src/ui.test.tsx`

Expected: no whitespace errors and only the approved names, Chance copy, and associated assertions changed.
