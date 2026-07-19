import { BOARD, type GameState, type StreetSpace } from '@monopoly/game';
import { Fragment, type CSSProperties } from 'react';
import { SpaceIcon } from './SpaceIcon';
import { TokenIcon } from './TokenIcon';
import type { TokenMotion } from '../useMovementAnimation';
import { GROUP_COLORS as colors, PLAYER_COLORS } from '../theme';
function coordinates(index: number) {
  if (index <= 10) return { row: 11, col: 11 - index };
  if (index <= 20) return { row: 21 - index, col: 1 };
  if (index <= 30) return { row: 1, col: index - 19 };
  return { row: index - 29, col: 11 };
}
function edge(index: number) {
  if (index <= 10) return 'bottom';
  if (index <= 20) return 'left';
  if (index <= 30) return 'top';
  return 'right';
}
const shortName = (name: string) => name.replace('Community Chest', 'Chest').replace('Free Parking', 'Free').replace('Just Visiting', 'Visit');

export function Board({ state, selectedIndex, onSelect, displayPositions = {}, movingPlayerId = null, tokenMotion = null, compact = false }: { state: GameState; selectedIndex: number | null; onSelect: (index: number) => void; displayPositions?: Record<string, number>; movingPlayerId?: string | null; tokenMotion?: TokenMotion; compact?: boolean }) {
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  return <div className={`board${compact ? ' is-compact' : ''}${movingPlayerId ? ' is-animating' : ''}`} aria-label="Monopoly board" aria-busy={Boolean(movingPlayerId)}>
    <div className="board-center" aria-hidden="true"><small>Round {state.round}</small><span>{current?.name}</span><strong>Current turn</strong>{state.lastRoll ? <em>{state.lastRoll[0]} + {state.lastRoll[1]}</em> : null}<i>MONOPOLY PARTY</i></div>
    {BOARD.map((space) => {
      const { row, col } = coordinates(space.index);
      const property = state.properties[space.index];
      const owner = property?.ownerId ? state.players.find((player) => player.id === property.ownerId) : undefined;
      const ownerColor = owner ? PLAYER_COLORS[state.turnOrder.indexOf(owner.id)] : undefined;
      const streetColor = space.type === 'street' ? colors[(space as StreetSpace).color] : undefined;
      const players = state.players.filter((player) => !player.bankrupt && (displayPositions[player.id] ?? player.position) === space.index);
      const className = `board-space edge-${edge(space.index)} ${space.index % 10 === 0 ? 'is-corner' : ''} ${selectedIndex === space.index ? 'is-selected' : ''} ${property?.mortgaged ? 'is-mortgaged' : ''} ${players.length ? 'has-player' : ''} ${players.some((player) => player.id === state.currentPlayerId) ? 'is-current-space' : ''}`;
      const style = { '--row': row, '--col': col, '--street': streetColor ?? '#d8d1bd' } as CSSProperties;
      const label = `${space.name}${owner ? `, owned by ${owner.name}` : ''}`;
      const ownable = space.type === 'street' || space.type === 'railroad' || space.type === 'utility';
      const content = <>
        {space.type === 'street' ? <span className="property-band" /> : null}
        {space.type !== 'street' ? <span className="space-icon"><SpaceIcon type={space.type} name={space.name} /></span> : null}
        <span className="space-name space-name-full" aria-hidden="true">{compact ? space.name : shortName(space.name)}</span>
        {property?.buildings ? <span className="buildings">{property.buildings === 5 ? '◆' : '▪'.repeat(property.buildings)}</span> : null}
        <span className="space-tokens">{players.map((player) => <span key={player.id} className={`token token-${state.players.indexOf(player) + 1} ${player.id === movingPlayerId && tokenMotion ? `is-${tokenMotion}` : ''}`} style={{ '--player-color': PLAYER_COLORS[state.turnOrder.indexOf(player.id)] } as CSSProperties} aria-label={`${player.name} on ${space.name}`}><TokenIcon token={player.token} size={12} /></span>)}</span>
      </>;
      const boardSpace = compact && !ownable
        ? <div data-testid="board-space" className={className} style={style} aria-label={label}>{content}</div>
        : <button type="button" data-testid="board-space" onClick={() => onSelect(space.index)} className={className} style={style} aria-label={label}>{content}</button>;
      return <Fragment key={space.index}>
        {owner ? <span
          className={`ownership-bar edge-${edge(space.index)}`}
          data-testid="ownership-bar"
          data-owner-id={owner.id}
          data-space-index={space.index}
          aria-hidden="true"
          style={{ '--row': row, '--col': col, '--owner-color': ownerColor, pointerEvents: 'none' } as CSSProperties}
        /> : null}
        {boardSpace}
      </Fragment>;
    })}
  </div>;
}
