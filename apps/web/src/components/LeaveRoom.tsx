import { useState } from 'react';

interface LeaveRoomProps {
  busy: boolean;
  error: string | null;
  onConfirm: () => void | Promise<void>;
  compact?: boolean;
}

export function LeaveRoom({ busy, error, onConfirm, compact = false }: LeaveRoomProps) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`leave-button${compact ? ' compact' : ''}`} onClick={() => setOpen(true)}>Leave room</button>
    {open ? <div className="drawer-backdrop" onClick={() => { if (!busy) setOpen(false); }}><section className="leave-sheet" role="dialog" aria-labelledby="leave-title" onClick={(event) => event.stopPropagation()}>
      <span className="eyeline">PERMANENT EXIT</span>
      <h2 id="leave-title">Leave this room?</h2>
      <p>This permanently removes you from the room.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="action-row">
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="danger-button" disabled={busy} onClick={() => void onConfirm()}>{busy ? 'Leaving…' : 'Leave permanently'}</button>
      </div>
    </section></div> : null}
  </>;
}
