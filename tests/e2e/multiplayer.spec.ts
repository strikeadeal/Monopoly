import { expect, test } from '@playwright/test';

test('two isolated phones create, join, start, and recover the same room', async ({ browser }) => {
  test.setTimeout(60_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/#/');
  await host.getByLabel('Your name').fill('Alex');
  await host.getByRole('button', { name: 'Create game' }).click();
  await expect(host.getByRole('heading', { name: 'Bring everyone in.' })).toBeVisible();
  const roomCode = await host.locator('.table-header strong').innerText();
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/u);

  await guest.goto(`/#/join/${roomCode}`);
  await expect(guest.getByLabel('Room code')).toHaveValue(roomCode);
  await guest.getByLabel('Your name').fill('Sam');
  await guest.getByRole('button', { name: 'Key' }).click();
  await guest.getByRole('button', { name: 'Join game' }).click();
  await expect(guest.getByRole('heading', { name: 'Bring everyone in.' })).toBeVisible();
  await guest.getByRole('button', { name: 'I’m ready' }).click();

  await expect(host.getByText('Players 2/6')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByLabel('Monopoly board')).toBeVisible();
  await expect(guest.getByLabel('Monopoly board')).toBeVisible();
  await expect(host.getByTestId('board-space')).toHaveCount(40);
  await expect(guest.getByTestId('board-space')).toHaveCount(40);
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
  await hostContext.close();
  await guestContext.close();
});
