import { BOARD, type GameState, type StreetSpace } from '@monopoly/game';
import type { CSSProperties } from 'react';
import { TokenIcon } from './TokenIcon';

const colors: Record<string, string> = { brown: '#8b5a3c', 'light-blue': '#63b8d5', pink: '#cf5b9d', orange: '#e98a32', red: '#c9423b', yellow: '#e0bd3d', green: '#438d64', 'dark-blue': '#315b92' };
function coordinates(index: number) {
  if (index <= 10) return { row: 11, col: 11 - index };
  if (index <= 20) return { row: 21 - index, col: 1 };
  if (index <= 30) return { row: 1, col: index - 19 };
  return { row: index - 29, col: 11 };
}
const shortName = (name: string) => name.replace(' Avenue', '').replace(' Railroad', ' RR').replace('Community Chest', 'Chest').replace('Free Parking', 'Free').replace('Just Visiting', 'Visit');

export function Board({ state, selectedIndex, onSelect }: { state: GameState; selectedIndex: number | null; onSelect: (index: number) => void }) {
  return <div className="board" aria-label="Monopoly board">
    <div className="board-center" aria-hidden="true"><span>MONOPOLY</span><small>PARTY</small></div>
    {BOARD.map((space) => {
      const { row, col } = coordinates(space.index);
      const property = state.properties[space.index];
      const streetColor = space.type === 'street' ? colors[(space as StreetSpace).color] : undefined;
      const players = state.players.filter((player) => !player.bankrupt && player.position === space.index);
      return <button
        type="button" data-testid="board-space" key={space.index} onClick={() => onSelect(space.index)}
        className={`board-space ${selectedIndex === space.index ? 'is-selected' : ''} ${property?.mortgaged ? 'is-mortgaged' : ''}`}
        style={{ '--row': row, '--col': col, '--street': streetColor ?? '#d8d1bd' } as CSSProperties}
        aria-label={`${space.name}${property?.ownerId ? ', owned' : ''}`}
      >
        {space.type === 'street' ? <span className="property-band" /> : null}
        <span className="space-name">{shortName(space.name)}</span>
        {property?.buildings ? <span className="buildings">{property.buildings === 5 ? '◆' : '▪'.repeat(property.buildings)}</span> : null}
        <span className="space-tokens">{players.map((player) => <span key={player.id} className={`token token-${state.players.indexOf(player) + 1}`} aria-label={`${player.name} on ${space.name}`}><TokenIcon token={player.token} size={12} /></span>)}</span>
      </button>;
    })}
  </div>;
}
