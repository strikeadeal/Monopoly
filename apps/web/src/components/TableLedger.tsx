import type { GameState } from '@monopoly/game';

export function TableLedger({ state }: { state: GameState }) {
  const entries = state.activities.slice(0, 3);
  return <section className="table-ledger" aria-label="Latest at the table">
    <header>
      <h2>Latest at the table</h2>
      <span>{state.round > 0 ? `Round ${state.round}` : 'Lobby'}</span>
    </header>
    {entries.length ? <ol>
      {entries.map((entry) => <li key={entry.id} className={entry.tone}>
        <span className="ledger-marker" />
        <time>{new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
        <p>{entry.text}</p>
      </li>)}
    </ol> : <p className="empty-copy">Rolls, purchases, and payments will appear here.</p>}
  </section>;
}
