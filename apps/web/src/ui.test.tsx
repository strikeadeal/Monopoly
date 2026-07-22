// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD, createGame, createLobby, reduceGame } from '@monopoly/game';
import { ActivityTimeline } from './components/ActivityTimeline';
import { Board } from './components/Board';
import { BoardNavigator } from './components/BoardNavigator';
import { GameScreen } from './components/GameScreen';
import { Landing } from './components/Landing';
import { LeaveRoom } from './components/LeaveRoom';
import { Lobby } from './components/Lobby';
import { TableLedger } from './components/TableLedger';
import { COMPACT_LAYOUT_QUERY, LANDSCAPE_PHONE_QUERY } from './useCompactLayout';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const makeState = () => createGame([
  { id: 'p1', name: 'Alex', token: 'rocket' },
  { id: 'p2', name: 'Sam', token: 'key' }
], { mode: 'official' }, () => 0);
const playerColors = ['#447760', '#b64c45', '#406a98', '#b38643', '#785782', '#39433e'];
const screenProps = { playerId: 'p1', status: 'online', error: null, send: () => undefined, clearError: () => undefined, onLeave: () => undefined, leaving: false, leaveError: null };

describe('mobile game UI', () => {
  it('renders every board space with the current players', () => {
    const state = makeState();
    render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getAllByTestId('board-space')).toHaveLength(BOARD.length);
    expect(screen.getByLabelText('Alex on GO')).toBeInTheDocument();
    expect(screen.getByLabelText('Sam on GO')).toBeInTheDocument();
  });

  it('makes only ownable compact board spaces directly interactive', () => {
    const state = makeState();
    const onSelect = vi.fn();
    render(<Board compact state={state} selectedIndex={null} onSelect={onSelect} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces).toHaveLength(BOARD.length);
    expect(spaces.filter((space) => space.tagName === 'BUTTON')).toHaveLength(28);
    expect(spaces.filter((space) => space.tagName === 'DIV')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Armadale' }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', { name: 'GO' })).toBeNull();
  });

  it('keeps the full 40-space label set available for the landscape board', () => {
    const state = makeState();
    const { container } = render(<Board compact state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect([...container.querySelectorAll('.space-name-full')].map((label) => label.textContent)).toEqual(BOARD.map((space) => space.name));
  });

  it('marks each board edge so landscape property bands follow the board perimeter', () => {
    const state = makeState();
    render(<Board compact state={state} selectedIndex={null} onSelect={() => undefined} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces[1]).toHaveClass('edge-bottom');
    expect(spaces[11]).toHaveClass('edge-left');
    expect(spaces[21]).toHaveClass('edge-top');
    expect(spaces[31]).toHaveClass('edge-right');
  });

  it('uses the turn order palette for balances, board tokens, and ownership markers', () => {
    const state = createGame([
      { id: 'p1', name: 'Alex', token: 'rocket' },
      { id: 'p2', name: 'Sam', token: 'key' },
      { id: 'p3', name: 'Jo', token: 'coffee' },
      { id: 'p4', name: 'Mia', token: 'bolt' },
      { id: 'p5', name: 'Lee', token: 'star' },
      { id: 'p6', name: 'Rae', token: 'globe' }
    ], { mode: 'official' }, () => 0);
    state.turnOrder = ['p2', 'p1', 'p3', 'p4', 'p5', 'p6'];
    state.properties[1]!.ownerId = 'p2';
    render(<GameScreen state={state} {...screenProps} />);

    state.turnOrder.forEach((id, seat) => {
      const player = state.players.find((candidate) => candidate.id === id)!;
      expect(screen.getByLabelText(new RegExp(`^${player.name},`)).querySelector('.balance-token')).toHaveStyle(`--player-color: ${playerColors[seat]}`);
      expect(screen.getByLabelText(`${player.name} on GO`)).toHaveStyle(`--player-color: ${playerColors[seat]}`);
    });
    expect(screen.getByTestId('ownership-bar')).toHaveStyle(`--owner-color: ${playerColors[0]}`);
  });

  it('renders separate ownership markers on all four board edges', () => {
    const state = makeState();
    for (const index of [1, 11, 21, 31]) state.properties[index]!.ownerId = 'p1';
    render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    const markers = screen.getAllByTestId('ownership-bar');
    expect(markers).toHaveLength(4);
    for (const [index, edge] of [[1, 'bottom'], [11, 'left'], [21, 'top'], [31, 'right']] as const) {
      const marker = markers.find((candidate) => candidate.getAttribute('data-space-index') === String(index));
      expect(marker).toHaveClass(`edge-${edge}`);
      expect(marker).toHaveAttribute('data-owner-id', 'p1');
      expect(marker).toHaveAttribute('aria-hidden', 'true');
      expect(marker).toHaveStyle('--owner-color: #447760');
    }
  });

  it('updates owner names and markers across transfer, mortgage, and return to the Bank', () => {
    const state = makeState();
    state.properties[1]!.ownerId = 'p1';
    const { rerender } = render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Armadale, owned by Alex' })).toBeInTheDocument();
    expect(screen.getByTestId('ownership-bar')).toHaveAttribute('data-owner-id', 'p1');

    const transferred = structuredClone(state);
    transferred.properties[1]!.ownerId = 'p2';
    rerender(<Board state={transferred} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Armadale, owned by Sam' })).toBeInTheDocument();
    expect(screen.getByTestId('ownership-bar')).toHaveAttribute('data-owner-id', 'p2');
    expect(screen.getByTestId('ownership-bar')).toHaveStyle('--owner-color: #b64c45');

    const mortgaged = structuredClone(transferred);
    mortgaged.properties[1]!.mortgaged = true;
    rerender(<Board state={mortgaged} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getByTestId('ownership-bar')).toBeInTheDocument();

    const bankOwned = structuredClone(mortgaged);
    bankOwned.properties[1] = { ownerId: null, mortgaged: false, buildings: 0 };
    rerender(<Board state={bankOwned} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.queryByTestId('ownership-bar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Armadale' })).toBeInTheDocument();
  });

  it('offers legible nearby spaces and an all-spaces browser', () => {
    const state = makeState();
    const onSelect = vi.fn();
    render(<BoardNavigator state={state} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Previous space: Peppermint Grove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current space: GO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next space: Armadale' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open board directory' }));
    expect(screen.getByRole('dialog', { name: 'Browse all board spaces' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cottesloe, street, available' }));
    expect(onSelect).toHaveBeenCalledWith(32);
    expect(screen.queryByRole('dialog', { name: 'Browse all board spaces' })).toBeNull();
  });

  it('adapts the current-space treatment for long property names', () => {
    const state = makeState();
    state.players[0]!.position = 5;
    render(<BoardNavigator state={state} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Current space: Fremantle Line' })).toHaveClass('is-long');
  });

  it('turns the board center into live table status', () => {
    const state = makeState();
    const { container } = render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(container.querySelector('.board-center')).toHaveTextContent('Round 1');
    expect(container.querySelector('.board-center')).toHaveTextContent('Alex');
    expect(container.querySelector('.board-center')).toHaveTextContent('Current turn');
  });

  it('gives every non-street board space its concept icon', () => {
    const state = makeState();
    const { container } = render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    const expectedTypes = BOARD.filter((space) => space.type !== 'street').map((space) => space.type);
    expect([...container.querySelectorAll('[data-space-icon]')].map((icon) => icon.getAttribute('data-space-icon'))).toEqual(expectedTypes);
    expect(screen.getAllByTestId('board-space')).toHaveLength(BOARD.length);
  });

  it('shows the rolled dice without replaying the animation on a fresh mount', () => {
    const state = makeState();
    state.lastRoll = [3, 4];
    state.phase = { type: 'awaiting-end' };
    const { container } = render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByRole('img', { name: 'Rolled 3 and 4' })).toBeInTheDocument();
    expect(container.querySelectorAll('.die')).toHaveLength(2);
    expect(container.querySelector('.die.is-rolling')).toBeNull();
  });

  it('shows every player authoritative cash balance on the game screen', () => {
    const state = makeState();
    state.players[0]!.cash = 1325;
    state.players[1]!.cash = 1675;
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex, you, current player, $1,325')).toBeInTheDocument();
    expect(screen.getByLabelText('Sam, $1,675')).toBeInTheDocument();
  });

  it('keeps a bankrupt player visible at zero cash', () => {
    const state = makeState();
    Object.assign(state.players[1]!, { bankrupt: true, cash: 0 });
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Sam, bankrupt, $0')).toBeInTheDocument();
  });

  it('does not replay a completed movement trace on a fresh mount', () => {
    const initial = makeState();
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Midland')).toBeInTheDocument();
    expect(screen.queryByText('Alex is moving…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
  });

  it('walks through every rolled square before revealing landing controls', async () => {
    vi.useFakeTimers();
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);

    expect(screen.getByText('Alex is moving…')).toBeInTheDocument();
    expect(screen.getByLabelText('Alex on GO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buy' })).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(screen.getByLabelText('Alex on Armadale')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByLabelText('Alex on Community Chest')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByLabelText('Alex on Midland')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buy' })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
  });

  it('pauses on a card square and resumes card movement after dismissal', async () => {
    vi.useFakeTimers();
    const initial = makeState();
    initial.chanceDeck = ['ch-back-3', ...initial.chanceDeck.filter((id) => id !== 'ch-back-3')];
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [3, 4] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);

    await act(async () => vi.advanceTimersByTimeAsync(1_580));
    expect(screen.getByLabelText('Alex on Chance')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'A small detour card' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Got it' })); });
    expect(screen.getByLabelText('Alex on Gosnells')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(420));
    expect(screen.getByLabelText('Alex on Income Tax')).toBeInTheDocument();
    expect(screen.getByText('You rolled 3 + 4.')).toBeInTheDocument();
  });

  it('announces the rolled landing instead of the card destination', async () => {
    vi.useFakeTimers();
    const initial = makeState();
    initial.chanceDeck = ['ch-utility', ...initial.chanceDeck.filter((id) => id !== 'ch-utility')];
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [3, 4] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);
    await act(async () => vi.advanceTimersByTimeAsync(1_580));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(screen.getByText('Alex rolled 3 and 4 and landed on Chance.')).toBeInTheDocument();
  });

  it('shows every player balance on the game screen', () => {
    render(<GameScreen state={makeState()} {...screenProps} />);
    expect(screen.getByLabelText('Alex, you, current player, $1,500')).toBeInTheDocument();
    expect(screen.getByLabelText('Sam, $1,500')).toBeInTheDocument();
  });

  it('shows the latest three authoritative table events', () => {
    const state = makeState();
    state.activities = [
      { id: '4', at: 4, text: 'Fourth event.' },
      { id: '3', at: 3, text: 'Third event.' },
      { id: '2', at: 2, text: 'Second event.' },
      { id: '1', at: 1, text: 'First event.' }
    ];
    render(<TableLedger state={state} />);
    expect(screen.getByRole('region', { name: 'Latest at the table' })).toBeInTheDocument();
    expect(screen.getByText('Fourth event.')).toBeInTheDocument();
    expect(screen.getByText('Third event.')).toBeInTheDocument();
    expect(screen.getByText('Second event.')).toBeInTheDocument();
    expect(screen.queryByText('First event.')).toBeNull();
  });

  it('collapses the table ledger to the latest event in the landscape strip', () => {
    const state = makeState();
    state.activities = [
      { id: '2', at: 2, text: 'Latest event.', tone: 'success' },
      { id: '1', at: 1, text: 'Earlier event.' }
    ];
    const { container } = render(<TableLedger state={state} variant="strip" />);
    expect(container.querySelector('.table-ledger.is-strip')).toBeInTheDocument();
    expect(screen.getByText('Latest event.')).toBeInTheDocument();
    expect(screen.queryByText('Earlier event.')).toBeNull();
  });

  it('renders explicit icons for pause and compact leave controls', () => {
    render(<GameScreen state={makeState()} {...screenProps} />);
    expect(screen.getByRole('button', { name: 'Pause game' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave room' }).querySelector('svg')).toBeInTheDocument();
  });

  it('treats a landscape phone as a compact table', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === COMPACT_LAYOUT_QUERY || query === LANDSCAPE_PHONE_QUERY, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia);
    const { container } = render(<GameScreen state={makeState()} {...screenProps} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces.filter((space) => space.tagName === 'BUTTON')).toHaveLength(28);
    expect(spaces.filter((space) => space.tagName === 'DIV')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Armadale' }));
    expect(screen.getByRole('dialog', { name: 'Armadale' })).toBeInTheDocument();
    expect(container.querySelector('.game-shell.is-landscape-phone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open board directory' })).toBeInTheDocument();
    expect(container.querySelector('.table-ledger.is-strip')).toBeInTheDocument();
    for (const [name, icon] of [['Game', 'dice'], ['Assets', 'deeds'], ['Trade', 'handshake'], ['Activity', 'clipboard']] as const) {
      expect(screen.getByRole('button', { name }).querySelector('svg')).toHaveAttribute('data-section-icon', icon);
    }
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('keeps the full table interactive when no compact query matches', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia);
    render(<GameScreen state={makeState()} {...screenProps} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces.every((space) => space.tagName === 'BUTTON')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Open board directory' })).toBeNull();
  });

  it('disables invalid deed actions and explains the first blocker', () => {
    const state = makeState();
    state.properties[39]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: `${BOARD[39]!.name}, owned by Alex` }));
    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sell building' })).toBeDisabled();
    expect(screen.getByText('Own the full color group first.')).toBeInTheDocument();
  });

  it('groups deeds by color and shows group completion', () => {
    const state = makeState();
    state.properties[37]!.ownerId = 'p1';
    state.properties[39]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assets' }));
    expect(screen.getByRole('heading', { name: 'Dark blue' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 deeds')).toBeInTheDocument();
  });

  it('separates both sides of a trade and summarizes the offer', () => {
    const state = makeState();
    state.properties[37]!.ownerId = 'p2';
    state.properties[39]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trade' }));
    expect(screen.getByRole('heading', { name: 'You give' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'You receive' })).toBeInTheDocument();
    expect(screen.getByText('You give $0 and 0 deeds. You receive $0 and 0 deeds.')).toBeInTheDocument();
    expect(screen.getByText('Purchase $400 · Mortgage $200')).toBeInTheDocument();
    expect(screen.getByText('Purchase $350 · Mortgage $175')).toBeInTheDocument();
  });

  it('shows a minute label once for adjacent activity events', () => {
    const firstMinute = new Date(2026, 0, 1, 10, 15, 5).getTime();
    const nextMinute = new Date(2026, 0, 1, 10, 16, 5).getTime();
    const firstLabel = new Date(firstMinute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    render(<ActivityTimeline entries={[
      { id: 'a', at: firstMinute, text: 'Alex rolled.' },
      { id: 'b', at: firstMinute + 20_000, text: 'Alex bought a deed.', tone: 'success' },
      { id: 'c', at: nextMinute, text: 'Sam rolled.' }
    ]} />);
    expect(screen.getAllByText(firstLabel)).toHaveLength(1);
    expect(screen.getByText('Alex rolled.')).toBeInTheDocument();
    expect(screen.getByText('Alex bought a deed.')).toBeInTheDocument();
    expect(screen.getByText('Sam rolled.')).toBeInTheDocument();
  });

  it('rejects negative and fractional trade cash before submission', () => {
    render(<GameScreen state={makeState()} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trade' }));
    const [giveCash] = screen.getAllByRole('spinbutton', { name: 'Cash' });
    fireEvent.change(giveCash!, { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: 'Send offer' })).toBeDisabled();
    fireEvent.change(giveCash!, { target: { value: '1.5' } });
    expect(screen.getByRole('button', { name: 'Send offer' })).toBeDisabled();
  });

  it('does not show street-building guidance for a railroad', () => {
    const state = makeState();
    state.properties[5]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fremantle Line, owned by Alex' }));
    expect(screen.queryByText('Only streets can be improved.')).not.toBeInTheDocument();
  });

  it('shows the street build cost and complete rent schedule in an accessible deed dialog', () => {
    render(<GameScreen state={makeState()} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Peppermint Grove' }));
    const dialog = screen.getByRole('dialog', { name: 'Peppermint Grove' });
    expect(dialog).toHaveTextContent('Purchase $400 · Mortgage $200');
    expect(dialog).toHaveTextContent('Build houses or hotel: $200 each');
    expect([...dialog.querySelectorAll('.rent-table > div')].map((row) => row.textContent)).toEqual([
      'Base rent$50', '1 house$200', '2 houses$600', '3 houses$1,400', '4 houses$1,700', 'Hotel$2,000'
    ]);
    expect(dialog).toHaveTextContent('Available from the Bank');
  });

  it('shows the complete train-line and utility rent schedules', () => {
    const { rerender } = render(<GameScreen state={makeState()} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fremantle Line' }));
    let dialog = screen.getByRole('dialog', { name: 'Fremantle Line' });
    expect(dialog).toHaveTextContent('Purchase $200 · Mortgage $100');
    expect([...dialog.querySelectorAll('.rent-table > div')].map((row) => row.textContent)).toEqual([
      '1 train line$25', '2 train lines$50', '3 train lines$100', '4 train lines$200'
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Close property details' }));
    rerender(<GameScreen state={makeState()} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Electric Company' }));
    dialog = screen.getByRole('dialog', { name: 'Electric Company' });
    expect(dialog).toHaveTextContent('Purchase $150 · Mortgage $75');
    expect([...dialog.querySelectorAll('.rent-table > div')].map((row) => row.textContent)).toEqual([
      '1 utility4× dice total', '2 utilities10× dice total'
    ]);
  });

  it('shows the owner swatch and keeps deed actions exclusive to the local owner', () => {
    const mine = makeState();
    mine.properties[1]!.ownerId = 'p1';
    mine.properties[1]!.mortgaged = true;
    const { rerender } = render(<GameScreen state={mine} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Armadale, owned by Alex' }));
    let dialog = screen.getByRole('dialog', { name: 'Armadale' });
    expect(dialog.querySelector('.owner-swatch')).toHaveStyle('--owner-color: #447760');
    expect(dialog).toHaveTextContent('Owned by Alex · Mortgaged');
    expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sell building' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmortgage' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close property details' }));
    const theirs = makeState();
    theirs.properties[1]!.ownerId = 'p2';
    rerender(<GameScreen state={theirs} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Armadale, owned by Sam' }));
    dialog = screen.getByRole('dialog', { name: 'Armadale' });
    expect(dialog.querySelector('.owner-swatch')).toHaveStyle('--owner-color: #b64c45');
    expect(dialog).toHaveTextContent('Owned by Sam');
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sell building' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mortgage' })).toBeNull();
  });

  it('uses a lift and drop when moving directly to Jail', async () => {
    vi.useFakeTimers();
    const initial = makeState();
    initial.players[0]!.position = 28;
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 1] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);

    await act(async () => vi.advanceTimersByTimeAsync(880));
    expect(screen.getByLabelText('Alex on Go To Jail')).toHaveClass('is-direct-out');
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByLabelText('Alex on Jail / Just Visiting')).toHaveClass('is-direct-in');
    await act(async () => vi.advanceTimersByTimeAsync(220));
    expect(screen.getByRole('button', { name: 'End turn' })).toBeInTheDocument();
  });

  it('skips movement delays when reduced motion is requested', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Midland')).toBeInTheDocument();
    expect(screen.queryByText('Alex is moving…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });

  it('fast-forwards to the authoritative position when a trace is cleared', () => {
    vi.useFakeTimers();
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const moving = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    rerender(<GameScreen state={moving} {...screenProps} />);
    expect(screen.getByLabelText('Alex on GO')).toBeInTheDocument();
    const superseding = structuredClone(moving);
    superseding.lastMovement = null;
    rerender(<GameScreen state={superseding} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Midland')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
  });

  it('rejects a malformed trace that skips an intermediate square', () => {
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    state.lastMovement!.segments = [{ kind: 'steps', reason: 'roll', positions: [2, 3] }];
    rerender(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Midland')).toBeInTheDocument();
    expect(screen.queryByText('Alex is moving…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
  });

  it('reveals a drawn card to the table and dismisses it locally', () => {
    const state = makeState();
    state.phase = { type: 'awaiting-end' };
    state.lastCard = { drawId: '4:ch-dividend', cardId: 'ch-dividend', deck: 'chance', playerId: 'p1' };
    render(<GameScreen state={state} {...screenProps} />);
    const dialog = screen.getByRole('dialog', { name: 'Dividend card' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Collect $50 from the Bank.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog', { name: 'Dividend card' })).toBeNull();
  });

  it('disables buying a property the player cannot afford and says why', () => {
    const state = makeState();
    state.players[0]!.cash = 40;
    state.phase = { type: 'purchase', spaceIndex: 39, playerId: 'p1' };
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByRole('button', { name: 'Buy' })).toBeDisabled();
    expect(screen.getByText('It costs $400 and you have $40 — send it to auction.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auction' })).toBeEnabled();
  });

  it('requires an explicit confirmation before declaring bankruptcy', () => {
    const state = makeState();
    state.players[0]!.cash = 40;
    state.phase = { type: 'debt', playerId: 'p1', creditorId: 'p2', amount: 600, reason: 'rent' };
    const send = vi.fn();
    render(<GameScreen state={state} {...screenProps} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Declare bankruptcy' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Hand over everything?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByText('Raise $600')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Declare bankruptcy' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Declare bankruptcy' }).at(-1)!);
    expect(send).toHaveBeenCalledWith({ type: 'DECLARE_BANKRUPTCY' });
  });

  it('routes an indebted player to their assets when they cannot pay outright', () => {
    const state = makeState();
    state.players[0]!.cash = 40;
    state.phase = { type: 'debt', playerId: 'p1', creditorId: 'p2', amount: 600, reason: 'rent' };
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open assets' }));
    expect(screen.getByRole('heading', { name: 'Your deeds' })).toBeInTheDocument();
  });

  it('gives the finished table a clear exit and a game-over status', () => {
    const state = makeState();
    state.phase = { type: 'finished', winnerIds: ['p1'], reason: 'bankruptcy' };
    const onLeave = vi.fn();
    render(<GameScreen state={state} {...screenProps} onLeave={onLeave} />);
    expect(screen.getByText('Game over')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave the table' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('describes an incoming trade offer from the receiver point of view', () => {
    const state = makeState();
    state.properties[5]!.ownerId = 'p2';
    state.pendingTrade = { id: 't1', fromPlayerId: 'p2', toPlayerId: 'p1', offeredCash: 0, requestedCash: 1075, offeredProperties: [5], requestedProperties: [], offeredJailCards: [], requestedJailCards: [] };
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trade' }));
    expect(screen.getByText('You receive')).toBeInTheDocument();
    expect(screen.getByText('$0 · Fremantle Line')).toBeInTheDocument();
    expect(screen.getByText('You give')).toBeInTheDocument();
    expect(screen.getByText('$1,075')).toBeInTheDocument();
  });

  it('opens a read-only assets sheet when a player balance chip is tapped', () => {
    const state = makeState();
    state.properties[6]!.ownerId = 'p2';
    state.properties[8]!.ownerId = 'p2';
    state.properties[8]!.mortgaged = true;
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^Sam, / }));
    const dialog = screen.getByRole('dialog', { name: /Sam/ });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Gosnells')).toBeInTheDocument();
    expect(within(dialog).getByText('Balga')).toBeInTheDocument();
    expect(within(dialog).getByText('Mortgaged')).toBeInTheDocument();
    expect(within(dialog).getByText('Net worth')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Mortgage|Unmortgage/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close player assets' }));
    expect(screen.queryByRole('dialog', { name: /Sam/ })).toBeNull();
  });

  it('announces new money events with a banner that auto-dismisses', () => {
    vi.useFakeTimers();
    const state = makeState();
    state.activities = [{ id: 'old-money', at: 1, text: 'Alex passed GO and collected $200.', tone: 'money' }, ...state.activities];
    const { rerender, container } = render(<GameScreen state={state} {...screenProps} />);
    expect(container.querySelector('.money-toast')).toBeNull();
    const next = structuredClone(state);
    next.activities = [{ id: 'new-money', at: 2, text: 'Alex paid $50 to Sam for rent on Subiaco.', tone: 'money' }, ...next.activities];
    rerender(<GameScreen state={next} {...screenProps} />);
    expect(container.querySelector('.money-toast')).toHaveTextContent('Alex paid $50 to Sam for rent on Subiaco.');
    expect([...container.querySelectorAll('.sr-only[aria-live="polite"]')].some((region) => region.textContent === 'Alex paid $50 to Sam for rent on Subiaco.')).toBe(true);
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(container.querySelector('.money-toast')).toBeNull();
  });

  it('shows queued money events one at a time', () => {
    vi.useFakeTimers();
    const state = makeState();
    const { rerender, container } = render(<GameScreen state={state} {...screenProps} />);
    const next = structuredClone(state);
    next.activities = [
      { id: 'm2', at: 3, text: 'Alex passed GO and collected $200.', tone: 'money' },
      { id: 'm1', at: 2, text: 'Sam paid $28 to Alex for rent on Subiaco.', tone: 'money' },
      ...next.activities
    ];
    rerender(<GameScreen state={next} {...screenProps} />);
    expect(container.querySelector('.money-toast')).toHaveTextContent('Sam paid $28 to Alex for rent on Subiaco.');
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(container.querySelector('.money-toast')).toHaveTextContent('Alex passed GO and collected $200.');
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(container.querySelector('.money-toast')).toBeNull();
  });

  it('requires a typed auction bid within the minimum and available cash', () => {
    const state = makeState();
    state.players[0]!.cash = 300;
    state.phase = { type: 'auction', spaceIndex: 1, bidderId: null, bid: 0, passedPlayerIds: [], deadline: Date.now() + 15_000, reason: 'property' };
    const send = vi.fn();
    render(<GameScreen state={state} {...screenProps} send={send} />);
    expect(screen.getByText('Minimum $10 · You have $300')).toBeInTheDocument();
    const input = screen.getByLabelText('Bid amount');
    const bidButton = screen.getByRole('button', { name: 'Bid' });
    expect(bidButton).toBeDisabled();
    fireEvent.change(input, { target: { value: '5' } });
    expect(screen.getByRole('button', { name: 'Bid' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '400' } });
    expect(screen.getByRole('button', { name: 'Bid' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '50' } });
    const readyButton = screen.getByRole('button', { name: 'Bid $50' });
    expect(readyButton).toBeEnabled();
    fireEvent.click(readyButton);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLACE_BID', amount: 50 }));
  });

  it('tells a player who cannot cover the minimum bid to pass', () => {
    const state = makeState();
    state.players[0]!.cash = 4;
    state.phase = { type: 'auction', spaceIndex: 1, bidderId: null, bid: 0, passedPlayerIds: [], deadline: Date.now() + 15_000, reason: 'property' };
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByText("You can't cover the $10 minimum — pass.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeEnabled();
  });

  it('offers a plain decline instead of an auction when auctions are off', () => {
    const state = createGame([
      { id: 'p1', name: 'Alex', token: 'rocket' },
      { id: 'p2', name: 'Sam', token: 'key' }
    ], { mode: 'official', auctions: false }, () => 0);
    state.phase = { type: 'purchase', spaceIndex: 39, playerId: 'p1' };
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByText('Buy for $400 or decline and it stays with the Bank.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Auction' })).toBeNull();
  });

  it('surfaces connection errors inside the lobby instead of dropping them silently', () => {
    const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000, () => 0);
    const clearError = vi.fn();
    render(<Lobby state={state} playerId="p1" send={() => undefined} onLeave={() => undefined} leaving={false} leaveError={null} error="Wait for the game to reconnect." clearError={clearError} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Wait for the game to reconnect.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(clearError).toHaveBeenCalledOnce();
  });

  it('lets only the lobby host toggle auctions and shows the setting to everyone', () => {
    const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000, () => 0);
    state.players.push({ ...state.players[0]!, id: 'p2', name: 'Sam', token: 'key' });
    const send = vi.fn();
    const { rerender } = render(<Lobby state={state} playerId="p1" send={send} onLeave={() => undefined} leaving={false} leaveError={null} />);
    const toggle = screen.getByRole('button', { name: 'Auctions on' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(send).toHaveBeenCalledWith({ type: 'SET_AUCTIONS', enabled: false });
    rerender(<Lobby state={state} playerId="p2" send={send} onLeave={() => undefined} leaving={false} leaveError={null} />);
    expect(screen.queryByRole('button', { name: /Auctions/ })).toBeNull();
    expect(screen.getByText('Official rules · Auctions on')).toBeInTheDocument();
  });

  it('creates a room with auctions turned off from the landing options', () => {
    const onCreate = vi.fn();
    render(<Landing onCreate={onCreate} onJoin={() => undefined} busy={false} error={null} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('Auctions'), { target: { value: 'off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
    expect(onCreate).toHaveBeenCalledWith({ nickname: 'Alex' }, { mode: 'official', auctions: false });
  });

  it('offers create and join as the only primary landing actions', () => {
    render(<Landing onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
    expect(screen.getByRole('button', { name: 'Create game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByText('The board in every pocket.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rejoin your table')).toBeNull();
  });

  it('offers to rejoin the newest stored tables from the landing screen', () => {
    const onResume = vi.fn();
    const stored = [{ roomCode: 'AAA111' }, { roomCode: 'BBB222' }, { roomCode: 'CCC333' }, { roomCode: 'DDD444' }];
    render(<Landing onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} resumeSessions={stored} onResume={onResume} />);
    const card = screen.getByLabelText('Rejoin your table');
    expect(within(card).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(within(card).getByRole('button', { name: 'Return to room AAA111' }));
    expect(onResume).toHaveBeenCalledWith('AAA111');
  });

  it('lets a disconnected player back out of the reconnect overlay without leaving', () => {
    const onExit = vi.fn();
    render(<GameScreen state={makeState()} {...screenProps} status="reconnecting" onExit={onExit} />);
    expect(screen.getByText('Reconnecting to the table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('collects a name without asking for a character before joining', () => {
    render(<Landing onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
    expect(screen.queryByText('Choose a token')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rocket' })).toBeNull();
  });

  it('selects an available character in the lobby before readying', () => {
    const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000, () => 0);
    const send = vi.fn();
    render(<Lobby state={state} playerId="p1" send={send} onLeave={() => undefined} leaving={false} leaveError={null} />);
    expect(screen.getByRole('button', { name: 'Not ready' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Coffee' }));
    expect(send).toHaveBeenCalledWith({ type: 'SET_TOKEN', token: 'coffee' });
  });

  it('requires confirmation and reports a failed permanent leave without closing', () => {
    const onConfirm = vi.fn();
    render(<LeaveRoom busy={false} error="Connection failed." onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(screen.getByText('This permanently removes you from the room.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave permanently' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection failed.');
  });

  it('opens a shared room link directly in join mode', () => {
    render(<Landing initialRoomCode="ABC234" onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
    expect(screen.getByLabelText('Room code')).toHaveValue('ABC234');
    expect(screen.getByRole('button', { name: 'Join game' })).toBeInTheDocument();
  });

  it('offers explicit invite and readiness controls in the lobby', () => {
    const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 0, () => 0);
    state.roomCode = 'ABC234';
    render(<Lobby state={state} playerId="p1" send={() => undefined} onLeave={() => undefined} leaving={false} leaveError={null} />);
    expect(screen.getByRole('button', { name: 'Copy invite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share invite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not ready' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not report a copied invite when the clipboard is unavailable', async () => {
    const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 0, () => 0);
    state.roomCode = 'ABC234';
    render(<Lobby state={state} playerId="p1" send={() => undefined} onLeave={() => undefined} leaving={false} leaveError={null} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite' })); });
    expect(screen.getByRole('button', { name: 'Copy unavailable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite copied' })).not.toBeInTheDocument();
  });
});
