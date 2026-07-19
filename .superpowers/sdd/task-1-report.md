# Task 1 report: Canonical non-street deed economics

## Changed files

- `packages/game/src/data.ts`: exported canonical railroad rents and utility multipliers.
- `packages/game/src/engine.ts`: read railroad and utility rents from the canonical constants.
- `packages/game/src/game.test.ts`: added export and reducer regression coverage for railroad, utility, and Chance multiplier behavior.

## Red / green verification

- Red: `npm test -- packages/game/src/game.test.ts` — 1 expected failure: `RAILROAD_RENTS` was `undefined`; 45 tests passed.
- Green: `npm test -- packages/game/src/game.test.ts` — 46 tests passed.
- Green: `npm run typecheck --workspace @monopoly/game` — completed successfully.

## Commit

Pending commit.

## Self-review

- The exported constants exactly match the required immutable tuple values.
- Railroad rent continues to apply Chance's multiplier to the scheduled base rent.
- Utility Chance cards still override the normal one- or two-utility multiplier.
- No game-state, protocol, command, persisted-shape, or board-type changes were made.

## Concerns

None.
