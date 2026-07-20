# Monopoly Party

A server-authoritative, installable Monopoly game for 2–6 friends playing from their own phones. The web client is deployed to GitHub Pages and every room is coordinated by one Cloudflare Durable Object.

Production URL: <https://strikeadeal.github.io/Monopoly/>

## Architecture

- `apps/web` — React/Vite iPhone-first PWA. Hash routes keep shared room links compatible with GitHub Pages.
- `apps/worker` — Cloudflare Worker gateway and SQLite-backed `GameRoom` Durable Object. Reconnect tokens are exchanged for one-use 30-second WebSocket tickets.
- `packages/game` — canonical 40-space board, 28 deeds, both 16-card decks, net-worth rules, and the pure deterministic reducer used by the server.

The Durable Object is authoritative. Accepted commands are revision-checked and idempotent, persisted before a complete snapshot is broadcast, and retained in a 200-command replay window. Clients never predict a roll or mutate their confirmed board while disconnected.

## Local development

Requires Node.js 24+.

```bash
npm ci
npm run dev --workspace @monopoly/worker -- --port 8787
VITE_API_BASE=http://127.0.0.1:8787 npm run dev --workspace @monopoly/web -- --host 127.0.0.1 --port 4173
```

Run the verification suites with:

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run check` covers linting, strict TypeScript, reducer and protocol tests, Worker/web builds, manifest icons, service-worker generation, and API cache exclusion. Playwright starts real local Durable Objects and tests separate browser contexts at iPhone portrait, iPhone landscape, and desktop sizes.

## Rules implemented

- $1,500 starting cash, $200 for passing GO, $200 Income Tax, and $100 Luxury Tax.
- Automatic rent, color-group double rent, railroad scaling, utilities, doubles, three-doubles Jail, Jail cards/fines, and third-turn mandatory payment.
- Auctions (on by default; the host can turn them off at creation or in the lobby) with a 15-second opening window, 10-second bid resets, $10 opening bid, typed bids of at least $1 over the leader, early close after all non-leaders pass, and deed auctions after bankruptcy to the Bank. With auctions off, declined and returned deeds stay with the Bank.
- 32-house and 12-hotel bank inventory, even building and selling, half-price building sales, complete-group and mortgage restrictions.
- Mortgages, 10% unmortgage/transfer interest, cash/deed/Jail-card trades, debt resolution, creditor bankruptcy transfers, bank bankruptcy, and last-solvent-player victory.
- Optional 45/60/90-minute quick games that finish the current round and rank full official net worth, then cash, unmortgaged property, and a server roll-off.
- Host pause/resume with a frozen quick-game clock and automatic host transfer after 60 seconds offline.

The optional auctions-off toggle is the only house rule; there is no Free Parking jackpot. Card text is paraphrased while preserving the official effect and value.

## Deployment

Pull requests run CI. A push to `main` deploys `monopoly-game-api` first, reads the account’s `workers.dev` subdomain, injects that HTTPS endpoint into Vite, builds with base `/Monopoly/`, validates the PWA, and publishes the static artifact through GitHub Pages Actions.

Repository configuration required:

- Variable: `CLOUDFLARE_ACCOUNT_ID`
- Secret: `CLOUDFLARE_API_TOKEN`
- GitHub Pages source: **GitHub Actions**

The Cloudflare token needs Workers/Durable Objects deployment access and permission to read the account Workers subdomain.

## Sources

- [Hasbro Monopoly instructions](https://instructions.hasbro.com/en-gb/instruction/monopoly-game)
- [Hasbro C1009 rulebook](https://instructions.hasbro.com/api/download/C1009_en-gb_monopoly-game.pdf)
- [Cross-checked title-deed values](https://www.monopolyland.com/how-to-make-your-own-monopoly-game/)
- [Hasbro Community Chest refresh announcement](https://newsroom.hasbro.com/news-releases/news-release-details/monopoly-hosts-its-first-ever-star-studded-charity-classic-game)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/)

## Notice

This is an unofficial fan project and is not affiliated with or endorsed by Hasbro. It uses original interface styling, original code-native tokens, paraphrased card copy, and no Hasbro logos or character artwork.
