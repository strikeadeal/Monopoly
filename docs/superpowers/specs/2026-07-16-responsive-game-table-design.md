# Responsive Game Table Design

## Purpose

Make the Monopoly Party game screen feel like a deliberate, professional PWA on phones and desktop without changing the authoritative game rules or network protocol.

The game must preserve the recognizable full-board overview while moving detailed property reading and actions into interfaces that remain legible and comfortably tappable.

## Approved Direction

Use a hybrid game table:

- The full board remains the visual anchor.
- On phone-sized screens, the compact board becomes an overview rather than the primary property picker.
- A contextual neighborhood strip exposes the previous, current, and next spaces with full-size controls.
- A board browser provides access to all 40 spaces in a legible sheet.
- A contextual ledger fills the unused area beside or below the turn controls with the latest table events.
- Desktop keeps the board and command rail side by side.

The visual signature is a banker’s ledger placed on a felt game table: warm deed paper, restrained ruby and brass accents, compact tabular money, and clear physical layers.

## Interaction Requirements

### Compact board

- At viewports up to 520 px wide, or landscape touch viewports up to 520 px tall, board spaces are visual cells and are not keyboard or pointer targets.
- Tokens, ownership, mortgages, buildings, property colors, and current position remain visible on the board.
- The board remains square and never causes horizontal overflow.

### Neighborhood strip

- Show the current player’s previous, current, and next spaces.
- Each space control is at least 44 px high.
- Selecting a space opens the existing property/details sheet.
- Include a “Browse all spaces” control.

### Board browser

- Open as a modal bottom sheet.
- List all 40 spaces in board order.
- Every row is at least 44 px high and includes the name, space kind, ownership state, and property color where applicable.
- Selecting a row closes the browser and opens the existing space details.

### Game ledger

- Show the latest three activity entries on the game tab.
- Use compact time, tone marker, and event text.
- On desktop it occupies the unused command rail beneath the turn card.
- On phones it follows the turn card without forcing the primary turn action below the fold.

### Header controls

- Pause/resume and leave controls must have 44 px targets.
- Use recognizable code-native icons.
- Preserve accessible labels and add visible tooltips at desktop pointer widths.
- The leave control must not appear as an empty circle.

### Trade

- Property selection rows must be at least 44 px high.
- Include purchase price or mortgage value beside each deed.
- Keep the trade summary and submit action visually prominent at the end of the form.
- Preserve current cash validation and server-authoritative submission.

### Activity

- Reduce repeated timeline chrome.
- Group adjacent events under a displayed minute label while preserving every authoritative activity entry.
- Keep semantic list markup and tone differences.

## Responsive Layout

### Phone

```text
┌ status / player / round / controls ┐
├ player balances                    ┤
├ compact full-board overview        ┤
├ previous | current | next          ┤
├ primary turn action                ┤
├ latest table events                ┤
└ fixed game navigation              ┘
```

### Phone landscape

```text
┌ status / player / round / controls ───────────────┐┌───┐
├ compact board   ┬ player balances                 ┤│ n │
│ (sticky,        ├ previous | current | next       ┤│ a │
│ height-sized,   ├ primary turn action             ┤│ v │
│ read-only)      └ latest table events (scrolls)   ┘└───┘
```

The board stays pinned to the left at the viewport height while the action
column scrolls beside it. Game navigation becomes a fixed vertical rail on
the right edge so no vertical space is spent on a bottom bar.

### Desktop

```text
┌ status and balances across the table              ┐
├ full board                   ┬ navigation           ┤
│                              ├ primary turn action  │
│                              └ latest table events  │
└────────────────────────────────────────────────────┘
```

## Accessibility

- Primary touch targets are at least 44×44 px.
- Compact-board visual cells are removed from the tab order.
- Modal sheets use a dialog role and accessible name.
- Existing focus-visible styling remains.
- Reduced-motion behavior remains unchanged.
- Color is never the only signal for selected, owned, current, or disabled state.

## Verification

- Add component tests for compact board semantics, neighborhood navigation, board browser selection, ledger rendering, trade values, and activity time grouping.
- Update E2E checks for the mobile overview and board browser.
- Run lint, TypeScript, Vitest, production builds, PWA validation, Worker dry run, and Playwright on iPhone portrait, iPhone landscape, and desktop.
- Play ten live turns against the local Durable Object and verify reload/reconnect, console health, and API health.

