import type { GameState, PlayerState } from '@monopoly/game';
import type { CSSProperties } from 'react';
import { PLAYER_COLORS } from '../theme';
import { TokenIcon } from './TokenIcon';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function PlayerBalances({ state, playerId }: { state: GameState; playerId: string }) {
  const ordered = state.turnOrder.map((id) => state.players.find((player) => player.id === id)).filter((player): player is PlayerState => Boolean(player));
  return <section className="player-balances" aria-label="Player balances">
    {ordered.map((player) => {
      const labels = [player.name, player.id === playerId ? 'you' : '', player.id === state.currentPlayerId && state.status === 'playing' ? 'current player' : '', player.bankrupt ? 'bankrupt' : '', money.format(player.cash)].filter(Boolean);
      const color = PLAYER_COLORS[state.turnOrder.indexOf(player.id)];
      return <article key={player.id} className={`balance-chip${player.id === playerId ? ' is-me' : ''}${player.id === state.currentPlayerId ? ' is-current' : ''}${player.bankrupt ? ' is-bankrupt' : ''}`} aria-label={labels.join(', ')}>
        <span className="balance-token" style={{ '--player-color': color } as CSSProperties}><TokenIcon token={player.token} size={16} /></span>
        <span><strong>{player.name}</strong><small>{money.format(player.cash)}</small></span>
      </article>;
    })}
  </section>;
}
