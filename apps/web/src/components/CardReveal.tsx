import { CARD_BY_ID, type GameState, type LastCardDraw } from '@monopoly/game';

export function CardReveal({ state, draw, onClose }: { state: GameState; draw: LastCardDraw; onClose: () => void }) {
  const card = CARD_BY_ID.get(draw.cardId);
  if (!card) return null;
  const playerName = state.players.find((player) => player.id === draw.playerId)?.name ?? 'A player';
  return <div className="drawer-backdrop" onClick={onClose}>
    <section className="deed-sheet card-sheet" role="dialog" aria-label={`${card.title} card`} onClick={(event) => event.stopPropagation()}>
      <button className="close-button" onClick={onClose} aria-label="Close card">×</button>
      <div className={`deed-band card-band-${draw.deck}`} />
      <span className="eyeline">{draw.deck === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'} · {playerName} drew</span>
      <h2>{card.title}</h2>
      <p className="card-detail">{card.detail}</p>
      <button className="primary-button" onClick={onClose}>Got it</button>
    </section>
  </div>;
}
