import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';

/* Expected landscape-phone geometry as viewport fractions.
 * These literals mirror the dvh/vw values in apps/web/src/styles.css (the
 * "Accepted landscape concept" block). If a landscape proportion changes there,
 * recompute and update this block in the same commit — do not derive these from
 * the CSS at runtime, or the test becomes tautological. */
const LANDSCAPE_GEOMETRY = {
  board: [0.034, 0.108, 0.447, 0.835],
  actions: [0.497, 0.468, 0.379, 0.372],
  statusHeight: 0.087,
  balancesLeft: 0.497,
  navigatorLeft: 0.497,
  ledgerLeft: 0.497,
  navRight: 0.981,
  navMinHeight: 0.78
} as const;

function projectContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const { baseURL, viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  return {
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(viewport === undefined ? {} : { viewport }),
    ...(screen === undefined ? {} : { screen }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
    ...(isMobile === undefined ? {} : { isMobile }),
    ...(hasTouch === undefined ? {} : { hasTouch })
  };
}

function newProjectContext(browser: Browser, testInfo: TestInfo) {
  return browser.newContext(projectContextOptions(testInfo));
}

test('two isolated phones create, join, start, and recover the same room', async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const hostContext = await newProjectContext(browser, testInfo);
  const guestContext = await newProjectContext(browser, testInfo);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const pageErrors: string[] = [];
  host.on('pageerror', (error) => pageErrors.push(`host: ${error.message}`));
  guest.on('pageerror', (error) => pageErrors.push(`guest: ${error.message}`));

  await host.goto('/#/');
  await host.getByLabel('Your name').fill('Alex');
  await host.getByRole('button', { name: 'Create game' }).click();
  await expect(host.getByRole('heading', { name: 'Bring everyone in.' })).toBeVisible();
  await host.getByRole('button', { name: 'Rocket' }).click();
  await expect(host.getByRole('button', { name: 'Not ready' })).toBeEnabled();
  await host.getByRole('button', { name: 'Not ready' }).click();
  const roomCode = await host.locator('.table-header strong').innerText();
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/u);

  await guest.goto(`/#/join/${roomCode}`);
  await expect(guest.getByLabel('Room code')).toHaveValue(roomCode);
  await guest.getByLabel('Your name').fill('Sam');
  await guest.getByRole('button', { name: 'Join game' }).click();
  await expect(guest.getByRole('heading', { name: 'Bring everyone in.' })).toBeVisible();
  await guest.getByRole('button', { name: 'Key' }).click();
  await expect(guest.getByRole('button', { name: 'Not ready' })).toBeEnabled();
  await guest.getByRole('button', { name: 'Not ready' }).click();

  await expect(host.getByText('Players 2/6')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByLabel('Monopoly board')).toBeVisible();
  await expect(guest.getByLabel('Monopoly board')).toBeVisible();
  await expect(host.getByTestId('board-space')).toHaveCount(40);
  await expect(guest.getByTestId('board-space')).toHaveCount(40);
  await expect(host.getByLabel('Alex, you, current player, $1,500')).toBeVisible();
  await expect(host.getByLabel('Sam, $1,500')).toBeVisible();
  await expect(guest.getByLabel('Alex, current player, $1,500')).toBeVisible();
  await expect(guest.getByLabel('Sam, you, $1,500')).toBeVisible();
  await expect(host.getByRole('region', { name: 'Latest at the table' })).toBeVisible();
  const viewport = host.viewportSize();
  const isLandscapePhone = Boolean(viewport && viewport.width > viewport.height && viewport.height <= 520);
  if (viewport && (viewport.width <= 520 || isLandscapePhone)) {
    await expect(host.locator('button[data-testid="board-space"]')).toHaveCount(28);
    await expect(host.locator('div[data-testid="board-space"]')).toHaveCount(12);
    if (isLandscapePhone) {
      await expect(host.locator('.board-space .space-name-full').first()).toBeVisible();
    } else {
      await expect(host.locator('.board-space .space-name').first()).toBeHidden();
    }
    await expect(host.getByRole('button', { name: 'Current space: GO' })).toBeVisible();
    await host.getByRole('button', { name: 'Open board directory' }).click();
    const boardBrowser = host.getByRole('dialog', { name: 'Browse all board spaces' });
    await expect(boardBrowser).toBeVisible();
    await expect(boardBrowser.getByRole('button')).toHaveCount(41);
    const browserRows = await boardBrowser.locator('ol > li > button').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(Math.min(...browserRows)).toBeGreaterThanOrEqual(44);
    await boardBrowser.getByRole('button', { name: 'Close board browser' }).click();
  } else {
    await expect(host.locator('button[data-testid="board-space"]')).toHaveCount(40);
  }
  const layout = await host.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>('.turn-card')!.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      squareDelta: Math.abs(board.width - board.height),
      boardAspect: board.width / board.height,
      controlsInsidePage: actions.right <= document.documentElement.scrollWidth && actions.bottom <= document.documentElement.scrollHeight
    };
  });
  expect(layout.horizontalOverflow).toBe(false);
  if (isLandscapePhone) {
    expect(layout.boardAspect).toBeGreaterThan(1.14);
    expect(layout.boardAspect).toBeLessThan(1.2);
  } else {
    expect(layout.squareDelta).toBeLessThan(1);
  }
  expect(layout.controlsInsidePage).toBe(true);

  if (isLandscapePhone) {
    const landscape = await host.evaluate(() => {
      window.scrollTo(0, 0);
      const board = document.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
      const turnCard = document.querySelector<HTMLElement>('.turn-card')!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav')!.getBoundingClientRect();
      const labels = [...document.querySelectorAll<HTMLElement>('.board-space .space-name-full')];
      const status = document.querySelector<HTMLElement>('.status-rail')!.getBoundingClientRect();
      const balances = document.querySelector<HTMLElement>('.player-balances')!.getBoundingClientRect();
      const navigator = document.querySelector<HTMLElement>('.board-navigator')!.getBoundingClientRect();
      const ledger = document.querySelector<HTMLElement>('.table-ledger')!.getBoundingClientRect();
      return {
        boardLeftOfActions: board.right <= turnCard.left,
        boardFitsHeight: board.bottom <= innerHeight + 1,
        navIsVerticalRail: nav.width < nav.height,
        navClearOfActions: nav.left >= turnCard.right,
        pageFitsViewport: document.documentElement.scrollHeight <= innerHeight && document.body.scrollHeight <= innerHeight,
        labelOverflow: labels.filter((label) => label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1).map((label) => ({
          text: label.textContent,
          client: [label.clientWidth, label.clientHeight],
          scroll: [label.scrollWidth, label.scrollHeight]
        })),
        awkwardWraps: labels.filter((label) => {
          if (label.textContent?.includes(' ')) return false;
          const range = document.createRange();
          range.selectNodeContents(label);
          return range.getClientRects().length > 1;
        }).map((label) => label.textContent),
        nearbyOverflow: [...document.querySelectorAll<HTMLElement>('.nearby-spaces strong')]
          .filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent),
        geometry: {
          board: [board.left / innerWidth, board.top / innerHeight, board.width / innerWidth, board.height / innerHeight],
          actions: [turnCard.left / innerWidth, turnCard.top / innerHeight, turnCard.width / innerWidth, turnCard.height / innerHeight],
          status: [status.left, status.right, status.height / innerHeight],
          balances: [balances.left / innerWidth, balances.top / innerHeight, balances.height / innerHeight],
          navigator: [navigator.left / innerWidth, navigator.top / innerHeight, navigator.height / innerHeight],
          ledger: [ledger.left / innerWidth, ledger.top / innerHeight, ledger.height / innerHeight],
          nav: [nav.right / innerWidth, nav.top / innerHeight, nav.height / innerHeight]
        }
      };
    });
    expect(landscape.boardLeftOfActions).toBe(true);
    expect(landscape.boardFitsHeight).toBe(true);
    expect(landscape.navIsVerticalRail).toBe(true);
    expect(landscape.navClearOfActions).toBe(true);
    expect(landscape.pageFitsViewport).toBe(true);
    expect(landscape.labelOverflow).toEqual([]);
    expect(landscape.awkwardWraps).toEqual([]);
    expect(landscape.nearbyOverflow).toEqual([]);
    for (const [index, value] of LANDSCAPE_GEOMETRY.board.entries()) expect(landscape.geometry.board[index]).toBeCloseTo(value, 2);
    for (const [index, value] of LANDSCAPE_GEOMETRY.actions.entries()) expect(landscape.geometry.actions[index]).toBeCloseTo(value, 2);
    expect(landscape.geometry.status[0]).toBe(0);
    expect(landscape.geometry.status[1]).toBe(viewport!.width);
    expect(landscape.geometry.status[2]).toBeCloseTo(LANDSCAPE_GEOMETRY.statusHeight, 2);
    expect(landscape.geometry.balances[0]).toBeCloseTo(LANDSCAPE_GEOMETRY.balancesLeft, 2);
    expect(landscape.geometry.navigator[0]).toBeCloseTo(LANDSCAPE_GEOMETRY.navigatorLeft, 2);
    expect(landscape.geometry.ledger[0]).toBeCloseTo(LANDSCAPE_GEOMETRY.ledgerLeft, 2);
    expect(landscape.geometry.nav[0]).toBeCloseTo(LANDSCAPE_GEOMETRY.navRight, 2);
    expect(landscape.geometry.nav[2]).toBeGreaterThan(LANDSCAPE_GEOMETRY.navMinHeight);
    await expect(host.locator('.table-ledger')).toHaveClass(/is-strip/u);
    await expect(host.locator('.bottom-nav button svg')).toHaveCount(4);
    await expect(host.getByRole('button', { name: 'ROLL ◆ ◆' })).toBeInViewport();

    const sectionNav = host.getByRole('navigation', { name: 'Game sections' });
    await sectionNav.getByRole('button', { name: 'Assets', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Your deeds' })).toBeVisible();
    const assetLayout = await host.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.tab-panel')!.getBoundingClientRect();
      return { top: panel.top, bottom: panel.bottom, viewport: innerHeight, scrollY };
    });
    expect(assetLayout.top).toBeGreaterThanOrEqual(0);
    expect(assetLayout.bottom).toBeLessThanOrEqual(assetLayout.viewport + 1);
    expect(assetLayout.scrollY).toBe(0);
    await sectionNav.getByRole('button', { name: 'Game', exact: true }).click();
    await expect(host.getByRole('button', { name: 'ROLL ◆ ◆' })).toBeInViewport();

    await hostContext.setOffline(true);
    await expect(host.getByRole('heading', { name: 'Reconnecting to the table' })).toBeVisible();
    await hostContext.setOffline(false);
    await expect(host.getByText('Live')).toBeVisible({ timeout: 10_000 });
  }

  await host.getByRole('button', { name: 'ROLL ◆ ◆' }).click();
  await expect(host.getByRole('button', { name: 'ROLL ◆ ◆' })).not.toBeVisible();
  await expect(guest.getByText('Alex · playing')).toBeVisible();
  await expect(host.locator('.die')).toHaveCount(2);
  await expect(guest.locator('.die')).toHaveCount(2);
  await expect(host.locator('.board')).toHaveClass(/is-animating/u);
  await expect(guest.locator('.board')).toHaveClass(/is-animating/u);
  await expect(host.getByText('Alex is moving…')).toBeVisible();
  await expect(guest.getByText('Alex is moving…')).toBeVisible();
  await expect(host.getByText('Live')).toBeVisible();
  await expect(guest.getByText('Live')).toBeVisible();

  await guest.reload();
  await expect(guest.getByLabel('Monopoly board')).toBeVisible();
  await expect(guest.getByText('Live')).toBeVisible();
  await expect(guest.locator('.board')).not.toHaveClass(/is-animating/u);
  const guestCardClose = guest.getByRole('button', { name: 'Close card' });
  if (await guestCardClose.isVisible().catch(() => false)) await guestCardClose.click();

  const hostBoardSettled = host.locator('.board:not(.is-animating)');
  const hostCardClose = host.getByRole('button', { name: 'Close card' });
  await Promise.race([
    hostBoardSettled.waitFor({ state: 'visible', timeout: 5_000 }),
    hostCardClose.waitFor({ state: 'visible', timeout: 5_000 }).then(() => hostCardClose.click())
  ]);
  await expect(host.locator('.board')).not.toHaveClass(/is-animating/u, { timeout: 6_000 });
  await expect(host.getByText('Alex is moving…')).not.toBeVisible();
  const hostPosition = await host.locator('.token-1').getAttribute('aria-label');
  const guestPosition = await guest.locator('.token-1').getAttribute('aria-label');
  expect(hostPosition).toBe(guestPosition);
  await expect(host.getByText('Live')).toBeVisible();

  await host.reload();
  await expect(host.getByLabel('Monopoly board')).toBeVisible();
  await expect(host.getByText('Live')).toBeVisible();
  const guestIdentity = await guest.evaluate((code) => JSON.parse(localStorage.getItem(`monopoly-party:session:${code}`) ?? 'null') as { reconnectToken: string }, roomCode);
  await guest.getByRole('button', { name: 'Leave room' }).click();
  await expect(guest.getByRole('dialog', { name: 'Leave this room?' })).toBeVisible();
  await guest.getByRole('button', { name: 'Leave permanently' }).click();
  await expect(guest.getByText('The board in every pocket.')).toBeVisible();
  expect(await guest.evaluate((code) => localStorage.getItem(`monopoly-party:session:${code}`), roomCode)).toBeNull();
  await expect(host.getByLabel('Sam, bankrupt, $0')).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Alex wins' })).toBeVisible();
  const rejectedTicket = await guestContext.request.post(`http://127.0.0.1:8787/api/rooms/${roomCode}/socket-ticket`, { headers: { authorization: `Bearer ${guestIdentity.reconnectToken}` } });
  expect(rejectedTicket.status()).toBe(401);
  await host.reload();
  await expect(host.getByRole('heading', { name: 'Alex wins' })).toBeVisible();
  await expect(host.getByText('Live')).toBeVisible();
  expect(pageErrors).toEqual([]);
  await hostContext.close();
  await guestContext.close();
});

type DebugState = {
  phase: { type: string; spaceIndex?: number };
  properties: Record<number, { ownerId: string | null }>;
  revision: number;
  currentPlayerId: string;
};

async function debugSend(page: Page, command: Record<string, unknown> & { type: string }) {
  await page.evaluate((nextCommand) => {
    const debug = (window as typeof window & {
      __monopolyDebug?: { send: (value: Record<string, unknown> & { type: string }) => void };
    }).__monopolyDebug;
    if (!debug) throw new Error('Monopoly debug bridge is unavailable.');
    debug.send(nextCommand);
  }, command);
}

async function waitForDebugState(page: Page, predicate: (state: DebugState) => boolean) {
  await expect.poll(async () => {
    const state = await page.evaluate(() => {
      const debug = (window as typeof window & {
        __monopolyDebug?: { getState: () => DebugState | null };
      }).__monopolyDebug;
      return debug?.getState() ?? null;
    });
    return Boolean(state && predicate(state));
  }).toBe(true);
}

test('two landscape phones preserve authoritative ownership through reconnect and reload', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-landscape', 'Ownership geometry is specific to the iPhone landscape project.');
  test.setTimeout(90_000);
  const hostContext = await newProjectContext(browser, testInfo);
  const guestContext = await newProjectContext(browser, testInfo);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  for (const [name, page] of [['host', host], ['guest', guest]] as const) {
    page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${name}: ${message.text()}`);
    });
  }

  try {
    await host.goto('/#/');
    await host.getByLabel('Your name').fill('Alex');
    await host.getByRole('button', { name: 'Create game' }).click();
    await host.getByRole('button', { name: 'Rocket' }).click();
    await host.getByRole('button', { name: 'Not ready' }).click();
    const roomCode = await host.locator('.table-header strong').innerText();

    await guest.goto(`/#/join/${roomCode}`);
    await guest.getByLabel('Your name').fill('Sam');
    await guest.getByRole('button', { name: 'Join game' }).click();
    await guest.getByRole('button', { name: 'Key' }).click();
    await guest.getByRole('button', { name: 'Not ready' }).click();
    await expect(host.getByText('Players 2/6')).toBeVisible();
    await host.getByRole('button', { name: 'Start game' }).click();
    await expect(host.getByLabel('Monopoly board')).toBeVisible();
    await expect(guest.getByLabel('Monopoly board')).toBeVisible();

    expect(host.viewportSize()).toEqual(testInfo.project.use.viewport);
    expect(guest.viewportSize()).toEqual(testInfo.project.use.viewport);
    for (const page of [host, guest]) {
      const device = await page.evaluate(() => ({
        screen: { width: screen.width, height: screen.height },
        userAgent: navigator.userAgent,
        deviceScaleFactor: devicePixelRatio,
        hasTouch: 'ontouchstart' in window
      }));
      expect(device.screen).toEqual(testInfo.project.use.screen);
      expect(device.userAgent).toBe(testInfo.project.use.userAgent);
      expect(device.deviceScaleFactor).toBe(testInfo.project.use.deviceScaleFactor);
      expect(device.hasTouch).toBe(testInfo.project.use.hasTouch);
    }

    await debugSend(host, { type: 'ROLL', dice: [1, 2] });
    await waitForDebugState(host, (state) => state.phase.type === 'purchase' && state.phase.spaceIndex === 3);
    await debugSend(host, { type: 'BUY_PROPERTY' });
    await waitForDebugState(host, (state) => Boolean(state.properties[3]?.ownerId));
    await debugSend(host, { type: 'END_TURN' });
    await waitForDebugState(guest, (state) => state.currentPlayerId !== state.properties[3]?.ownerId && state.phase.type === 'awaiting-roll');

    await debugSend(guest, { type: 'ROLL', dice: [1, 5] });
    await waitForDebugState(guest, (state) => state.phase.type === 'purchase' && state.phase.spaceIndex === 6);
    await debugSend(guest, { type: 'BUY_PROPERTY' });
    await waitForDebugState(guest, (state) => Boolean(state.properties[6]?.ownerId));

    for (const page of [host, guest]) {
      await expect(page.getByLabel('Midland, owned by Alex')).toBeVisible();
      await expect(page.getByLabel('Gosnells, owned by Sam')).toBeVisible();
      await expect(page.getByTestId('ownership-bar')).toHaveCount(2);
      await expect(page.locator('[data-testid="ownership-bar"][data-space-index="3"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="ownership-bar"][data-space-index="6"]')).toHaveCount(1);
      const palette = await page.evaluate(() => ({
        bars: [...document.querySelectorAll<HTMLElement>('[data-testid="ownership-bar"]')].map((element) => getComputedStyle(element).backgroundColor),
        balances: [...document.querySelectorAll<HTMLElement>('.balance-token')].map((element) => getComputedStyle(element).backgroundColor)
      }));
      expect(palette.bars).toEqual(palette.balances);
      expect(new Set(palette.bars).size).toBe(2);
    }

    await guest.getByLabel('Midland, owned by Alex').click();
    const deed = guest.getByRole('dialog', { name: 'Midland' });
    await expect(deed).toBeVisible();
    await expect(deed.getByText('Owned by Alex')).toBeVisible();
    await expect(deed.getByText('Purchase $60 · Mortgage $30')).toBeVisible();
    await expect(deed.getByText('Build houses or hotel: $50 each')).toBeVisible();
    for (const [label, rent] of [['Base rent', '$4'], ['1 house', '$20'], ['2 houses', '$60'], ['3 houses', '$180'], ['4 houses', '$320'], ['Hotel', '$450']] as const) {
      const row = deed.locator('.rent-table > div').filter({ hasText: label });
      await expect(row).toContainText(rent);
    }

    const geometry = await guest.evaluate(() => {
      const board = document.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
      const bottomMarker = document.querySelector<HTMLElement>('[data-testid="ownership-bar"][data-space-index="3"]')!.getBoundingClientRect();
      const dialog = document.querySelector<HTMLElement>('.deed-sheet')!.getBoundingClientRect();
      return {
        markerOutsideBoard: bottomMarker.bottom > board.bottom,
        markerInsideViewport: bottomMarker.left >= 0 && bottomMarker.top >= 0 && bottomMarker.right <= innerWidth && bottomMarker.bottom <= innerHeight,
        dialogFits: dialog.left >= 0 && dialog.top >= 0 && dialog.right <= innerWidth && dialog.bottom <= innerHeight,
        documentFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
        bodyFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight
      };
    });
    expect(geometry).toEqual({ markerOutsideBoard: true, markerInsideViewport: true, dialogFits: true, documentFits: true, bodyFits: true });
    await deed.getByRole('button', { name: 'Close property details' }).click();

    await guestContext.setOffline(true);
    await expect(guest.getByRole('heading', { name: 'Reconnecting to the table' })).toBeVisible();
    await guestContext.setOffline(false);
    await expect(guest.getByText('Live')).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByTestId('ownership-bar')).toHaveCount(2);
    await guest.reload();
    await expect(guest.getByText('Live')).toBeVisible();
    await expect(guest.getByLabel('Midland, owned by Alex')).toBeVisible();
    await expect(guest.getByLabel('Gosnells, owned by Sam')).toBeVisible();
    await expect(guest.getByTestId('ownership-bar')).toHaveCount(2);
    await expect(host.getByTestId('ownership-bar')).toHaveCount(2);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
