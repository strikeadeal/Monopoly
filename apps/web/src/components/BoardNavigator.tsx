import { useState, type CSSProperties } from 'react';
import { BOARD, type GameState, type StreetSpace } from '@monopoly/game';
import { GROUP_COLORS as colors, SPACE_FALLBACK_COLOR } from '../theme';

const typeLabel = (type: string) => type.replaceAll('-', ' ');

function DirectoryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M8 4v16M16 4v16M4 8h16M4 16h16" /><rect x="8" y="8" width="8" height="8" /></svg>;
}

export function BoardNavigator({ state, onSelect }: { state: GameState; onSelect: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId) ?? state.players[0];
  const position = currentPlayer?.position ?? 0;
  const nearby = [
    { label: 'Previous', index: (position + BOARD.length - 1) % BOARD.length },
    { label: 'Current', index: position },
    { label: 'Next', index: (position + 1) % BOARD.length }
  ];
  const select = (index: number) => { setOpen(false); onSelect(index); };

  return <section className="board-navigator" aria-label="Nearby board spaces">
    <div className="nearby-spaces">
      {nearby.map(({ label, index }) => {
        const space = BOARD[index]!;
        const color = space.type === 'street' ? colors[(space as StreetSpace).color] : SPACE_FALLBACK_COLOR;
        return <button
          type="button"
          className={`${label === 'Current' ? 'is-current' : ''}${label === 'Current' && space.name.length > 6 ? ' is-long' : ''}`}
          key={label}
          onClick={() => onSelect(index)}
          aria-label={`${label} space: ${space.name}`}
          style={{ '--space-accent': color } as CSSProperties}
        >
          <small>{label}</small>
          <strong>{space.name}</strong>
        </button>;
      })}
    </div>
    <button type="button" className="browse-board-button" aria-label="Open board directory" onClick={() => setOpen(true)}><DirectoryIcon /><span>All spaces</span></button>
    {open ? <div className="drawer-backdrop" onClick={() => setOpen(false)}>
      <section className="deed-sheet board-browser" role="dialog" aria-label="Browse all board spaces" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="close-button" onClick={() => setOpen(false)} aria-label="Close board browser">×</button>
        <span className="eyeline">BOARD DIRECTORY</span>
        <h2>All spaces</h2>
        <ol>
          {BOARD.map((space) => {
            const property = state.properties[space.index];
            const owner = property?.ownerId ? state.players.find((player) => player.id === property.ownerId)?.name : null;
            const availability = owner ? `owned by ${owner}` : 'available';
            const color = space.type === 'street' ? colors[(space as StreetSpace).color] : SPACE_FALLBACK_COLOR;
            return <li key={space.index}>
              <button
                type="button"
                onClick={() => select(space.index)}
                aria-label={`${space.name}, ${typeLabel(space.type)}, ${availability}`}
                style={{ '--space-accent': color } as CSSProperties}
              >
                <span>{String(space.index).padStart(2, '0')}</span>
                <strong>{space.name}</strong>
                <small>{typeLabel(space.type)} · {availability}</small>
              </button>
            </li>;
          })}
        </ol>
      </section>
    </div> : null}
  </section>;
}
