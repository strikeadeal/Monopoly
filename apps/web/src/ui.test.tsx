// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BOARD, createGame } from '@monopoly/game';
import { Board } from './components/Board';
import { Landing } from './components/Landing';

afterEach(cleanup);

describe('mobile game UI', () => {
  it('renders every board space with the current players', () => {
    const state = createGame([
      { id: 'p1', name: 'Alex', token: 'rocket' },
      { id: 'p2', name: 'Sam', token: 'key' }
    ], { mode: 'official' }, () => 0);
    render(<Board state={state} selectedIndex={null} onSelect={() => undefined} />);
    expect(screen.getAllByTestId('board-space')).toHaveLength(BOARD.length);
    expect(screen.getByLabelText('Alex on GO')).toBeInTheDocument();
    expect(screen.getByLabelText('Sam on GO')).toBeInTheDocument();
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
