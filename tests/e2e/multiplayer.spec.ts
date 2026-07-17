import { expect, test } from '@playwright/test';

test('two isolated phones create, join, start, and recover the same room', async ({ browser }) => {
  test.setTimeout(60_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
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
    await expect(host.locator('button[data-testid="board-space"]')).toHaveCount(0);
    if (isLandscapePhone) {
      await expect(host.locator('.board-space .space-name').first()).toBeVisible();
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
      controlsInsidePage: actions.right <= document.documentElement.scrollWidth && actions.bottom <= document.documentElement.scrollHeight
    };
  });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.squareDelta).toBeLessThan(1);
  expect(layout.controlsInsidePage).toBe(true);

  if (isLandscapePhone) {
    const landscape = await host.evaluate(() => {
      window.scrollTo(0, 0);
      const board = document.querySelector<HTMLElement>('.board')!.getBoundingClientRect();
      const turnCard = document.querySelector<HTMLElement>('.turn-card')!.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>('.bottom-nav')!.getBoundingClientRect();
      const labels = [...document.querySelectorAll<HTMLElement>('.board-space .space-name')];
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
          .map((label) => label.textContent)
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
