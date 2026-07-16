# Perth Property Tiles Design

## Goal

Replace the 22 US street names on the Monopoly board with the approved Perth suburb names while preserving the existing board layout, color groups, prices, rents, build costs, mortgages, and gameplay rules.

## Board mapping

The existing street indices remain unchanged.

| Color group | Board indices | New names, in board order |
| --- | --- | --- |
| Brown | 1, 3 | Armadale; Midland |
| Light blue | 6, 8, 9 | Gosnells; Balga; Rockingham |
| Pink | 11, 13, 14 | Cannington; Maddington; Thornlie |
| Orange | 16, 18, 19 | Hillarys; Victoria Park; Bayswater |
| Red | 21, 23, 24 | Maylands; Mount Hawthorn; Scarborough |
| Yellow | 26, 27, 29 | Mount Lawley; Subiaco; Claremont |
| Green | 31, 32, 34 | Applecross; Cottesloe; City Beach |
| Dark blue | 37, 39 | Dalkeith; Peppermint Grove |

## Application behavior

The shared `BOARD` data remains the single source of truth. Updating it will carry the new names into the rendered board, property details, purchase and rent messages, asset lists, auctions, trades, and accessibility labels.

Chance cards that explicitly name a destination street will use the corresponding new name while retaining their existing destination index and effect:

- Boardwalk becomes Peppermint Grove.
- Illinois Avenue becomes Scarborough.
- St. Charles Place becomes Cannington.

Railroads, utilities, corner spaces, taxes, Chance, and Community Chest tiles remain unchanged.

## Presentation

The existing color palette, board geometry, typography, and responsive behavior remain unchanged. Multi-word suburb names use the board's existing wrapping behavior. The current abbreviation helper remains compatible because the new street names do not include the US-specific suffixes it removes.

## Compatibility and tests

No game-state schema, command, API, or persisted property index changes. Existing games continue to identify properties by index.

Tests that assert displayed or stored street names will be updated. Verification will include the shared game tests, web component tests, production build, and a rendered desktop/mobile board check with one property selection interaction.

## Out of scope

- Rebalancing prices, rents, mortgages, or building costs
- Renaming railroads, utilities, taxes, or special spaces
- Restyling the full board or application shell
- Changing gameplay rules or board order
