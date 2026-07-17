// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { COMPACT_LAYOUT_QUERY } from './useCompactLayout';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const makeState = () => createGame([
  { id: 'p1', name: 'Alex', token: 'rocket' },
  { id: 'p2', name: 'Sam', token: 'key' }
], { mode: 'official' }, () => 0);
const screenProps = { playerId: 'p1', status: 'online', error: null, send: () => undefined, clearError: () => undefined, onLeave: () => undefined, leaving: false, leaveError: null };

describe('mobile game UI', () => {
  it('renders every board space with the current players', () => {
    const state = makeState();
    render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getAllByTestId('board-space')).toHaveLength(BOARD.length);
    expect(screen.getByLabelText('Alex on GO')).toBeInTheDocument();
    expect(screen.getByLabelText('Sam on GO')).toBeInTheDocument();
  });

  it('renders compact board spaces as a non-interactive overview', () => {
    const state = makeState();
    render(<Board compact state={state} selectedIndex={null} onSelect={() => undefined} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces).toHaveLength(BOARD.length);
    expect(spaces.every((space) => space.tagName === 'DIV')).toBe(true);
    expect(screen.queryByRole('button', { name: 'GO' })).toBeNull();
  });

  it('offers legible nearby spaces and an all-spaces browser', () => {
    const state = makeState();
    const onSelect = vi.fn();
    render(<BoardNavigator state={state} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Previous space: Peppermint Grove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current space: GO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next space: Armadale' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browse all spaces' }));
    expect(screen.getByRole('dialog', { name: 'Browse all board spaces' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cottesloe, street, available' }));
    expect(onSelect).toHaveBeenCalledWith(32);
    expect(screen.queryByRole('dialog', { name: 'Browse all board spaces' })).toBeNull();
  });

  it('turns the board center into live table status', () => {
    const state = makeState();
    const { container } = render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(container.querySelector('.board-center')).toHaveTextContent('Round 1');
    expect(container.querySelector('.board-center')).toHaveTextContent('Alex');
    expect(container.querySelector('.board-center')).toHaveTextContent('Current turn');
  });

  it('marks the jail, chance, and community chest spaces with icons', () => {
    const state = makeState();
    const { container } = render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(container.querySelectorAll('.space-icon')).toHaveLength(8);
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

  it('renders explicit icons for pause and compact leave controls', () => {
    render(<GameScreen state={makeState()} {...screenProps} />);
    expect(screen.getByRole('button', { name: 'Pause game' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave room' }).querySelector('svg')).toBeInTheDocument();
  });

  it('treats a landscape phone as a compact table', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({ matches: query === COMPACT_LAYOUT_QUERY, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    render(<GameScreen state={makeState()} {...screenProps} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces.every((space) => space.tagName === 'DIV')).toBe(true);
    expect(screen.getByRole('button', { name: 'Browse all spaces' })).toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });

  it('keeps the full table interactive when no compact query matches', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    render(<GameScreen state={makeState()} {...screenProps} />);
    const spaces = screen.getAllByTestId('board-space');
    expect(spaces.every((space) => space.tagName === 'BUTTON')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Browse all spaces' })).toBeNull();
    window.matchMedia = originalMatchMedia;
  });

  it('disables invalid deed actions and explains the first blocker', () => {
    const state = makeState();
    state.properties[39]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: `${BOARD[39]!.name}, owned` }));
    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sell building' })).toBeDisabled();
    expect(screen.getByText('Own the full color group first.')).toBeInTheDocument();
  });

  it('groups deeds by color and shows group completion', () => {
    const state = makeState();
    state.properties[37]!.ownerId = 'p1';
    state.properties[39]!.ownerId = 'p1';
    render(<GameScreen state={state} {...screenProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'My assets' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Reading Railroad, owned' }));
    expect(screen.queryByText('Only streets can be improved.')).not.toBeInTheDocument();
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

  it('offers create and join as the only primary landing actions', () => {
    render(<Landing onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
    expect(screen.getByRole('button', { name: 'Create game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByText('The board in every pocket.')).toBeInTheDocument();
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
