// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD, createGame, createLobby, reduceGame } from '@monopoly/game';
import { Board } from './components/Board';
import { GameScreen } from './components/GameScreen';
import { Landing } from './components/Landing';
import { LeaveRoom } from './components/LeaveRoom';
import { Lobby } from './components/Lobby';

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

  it('does not replay a completed movement trace on a fresh mount', () => {
    const initial = makeState();
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    render(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Baltic Avenue')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Alex on Mediterranean Avenue')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByLabelText('Alex on Community Chest')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(140));
    expect(screen.getByLabelText('Alex on Baltic Avenue')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Alex on Oriental Avenue')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(420));
    expect(screen.getByLabelText('Alex on Income Tax')).toBeInTheDocument();
    expect(screen.getByText('You rolled 3 + 4.')).toBeInTheDocument();
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
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    rerender(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Baltic Avenue')).toBeInTheDocument();
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
    expect(screen.getByLabelText('Alex on Baltic Avenue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
  });

  it('rejects a malformed trace that skips an intermediate square', () => {
    const initial = makeState();
    const { rerender } = render(<GameScreen state={initial} {...screenProps} />);
    const state = reduceGame(initial, { type: 'ROLL', playerId: 'p1', dice: [1, 2] }, () => 0);
    state.lastMovement!.segments = [{ kind: 'steps', reason: 'roll', positions: [2, 3] }];
    rerender(<GameScreen state={state} {...screenProps} />);
    expect(screen.getByLabelText('Alex on Baltic Avenue')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'I’m ready' })).toBeDisabled();
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
});
