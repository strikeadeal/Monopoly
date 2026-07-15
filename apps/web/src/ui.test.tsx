// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BOARD, createGame } from '@monopoly/game';
import { Board } from './components/Board';
import { GameScreen } from './components/GameScreen';
import { Landing } from './components/Landing';

afterEach(cleanup);

const makeState = () => createGame([
  { id: 'p1', name: 'Alex', token: 'rocket' },
  { id: 'p2', name: 'Sam', token: 'key' }
], { mode: 'official' }, () => 0);
const screenProps = { playerId: 'p1', status: 'online', error: null, send: () => undefined, clearError: () => undefined };

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

  it('opens a shared room link directly in join mode', () => {
    render(<Landing initialRoomCode="ABC234" onCreate={() => undefined} onJoin={() => undefined} busy={false} error={null} />);
    expect(screen.getByLabelText('Room code')).toHaveValue('ABC234');
    expect(screen.getByRole('button', { name: 'Join game' })).toBeInTheDocument();
  });
});
