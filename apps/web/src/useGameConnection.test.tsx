// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, createGame } from '@monopoly/game';
import { useGameConnection } from './useGameConnection';
import { ApiError, createTicket } from './api';

vi.mock('./api', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    createTicket: vi.fn(async () => ({ ticket: 'test-ticket' })),
    socketUrl: () => 'ws://table.test/socket'
  };
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  emitCloseEvent = true;
  changeReadyStateOnClose = true;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    if (this.changeReadyStateOnClose) this.readyState = FakeWebSocket.CLOSED;
    if (this.emitCloseEvent) this.onclose?.(new CloseEvent('close'));
  }
}

const session = { roomCode: 'TABLE1', playerId: 'p1', reconnectToken: 'secret' };
const state = createGame([
  { id: 'p1', name: 'Alex', token: 'rocket' },
  { id: 'p2', name: 'Sam', token: 'key' }
], { mode: 'official' }, () => 0);
const snapshot = () => ({ type: 'snapshot' as const, protocolVersion: PROTOCOL_VERSION, state });

async function flushConnection() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return FakeWebSocket.instances.at(-1)!;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useGameConnection', () => {
  it('does not report online until the open socket supplies a fresh snapshot', async () => {
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();

    act(() => socket.open());
    expect(result.current.status).toBe('connecting');
    expect(result.current.state).toBeNull();

    act(() => socket.message(snapshot()));
    expect(result.current.status).toBe('online');
    expect(result.current.state).toEqual(state);
  });

  it('stamps rapid commands with consecutive revisions so a client never conflicts with itself', async () => {
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    act(() => { result.current.send({ type: 'ROLL' }); result.current.send({ type: 'END_TURN' }); });
    const sent = socket.sent.filter((raw) => raw !== 'ping').map((raw) => JSON.parse(raw) as { commandId: string; expectedRevision: number });
    expect(sent.map((command) => command.expectedRevision)).toEqual([state.revision, state.revision + 1]);

    // Once both are acknowledged, a later command uses the advanced revision.
    act(() => sent.forEach((command, index) => socket.message({ type: 'commandAccepted', commandId: command.commandId, revision: state.revision + index + 1 })));
    act(() => result.current.send({ type: 'END_TURN' }));
    const latest = JSON.parse(socket.sent.at(-1)!) as { expectedRevision: number };
    expect(latest.expectedRevision).toBe(state.revision + 2);
  });

  it('blocks commands between reconnecting and receiving the replacement snapshot', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const first = await flushConnection();
    act(() => { first.open(); first.message(snapshot()); });

    act(() => first.close());
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    const replacement = await flushConnection();
    act(() => replacement.open());
    act(() => result.current.send({ type: 'ROLL' }));

    expect(result.current.status).toBe('reconnecting');
    expect(result.current.error).toBe('Wait for the game to reconnect.');
    expect(replacement.sent).toEqual([]);
  });

  it('pings every 15 seconds and reconnects when no pong arrives within 8 seconds', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(socket.sent).toEqual(['ping']);
    await act(async () => vi.advanceTimersByTimeAsync(8_000));

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(result.current.status).toBe('reconnecting');
  });

  it('cancels the liveness deadline when the server responds', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    act(() => socket.message({ type: 'pong', at: Date.now() }));
    await act(async () => vi.advanceTimersByTimeAsync(8_000));

    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    expect(result.current.status).toBe('online');
  });

  it('closes on an offline event and reconnects immediately when the browser comes online', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const first = await flushConnection();
    act(() => { first.open(); first.message(snapshot()); });

    act(() => window.dispatchEvent(new Event('offline')));
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(result.current.status).toBe('reconnecting');

    act(() => window.dispatchEvent(new Event('online')));
    const replacement = await flushConnection();
    expect(replacement).not.toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('keeps bounded reconnect attempts as a fallback when the browser misses the online event', async () => {
    vi.useFakeTimers();
    renderHook(() => useGameConnection(session));
    const first = await flushConnection();
    act(() => { first.open(); first.message(snapshot()); });
    first.emitCloseEvent = false;
    first.changeReadyStateOnClose = false;

    act(() => window.dispatchEvent(new Event('offline')));
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    const replacement = await flushConnection();

    expect(replacement).not.toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('ignores a delayed close callback from the socket replaced after going offline', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const first = await flushConnection();
    act(() => { first.open(); first.message(snapshot()); });
    first.emitCloseEvent = false;
    first.changeReadyStateOnClose = false;

    act(() => window.dispatchEvent(new Event('offline')));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    const replacement = await flushConnection();
    act(() => { replacement.open(); replacement.message(snapshot()); });
    act(() => first.onclose?.(new CloseEvent('close')));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));

    expect(result.current.status).toBe('online');
    expect(replacement.sent).toEqual(['ping']);
  });

  it('probes a half-open socket on foreground and rebuilds it when no pong arrives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const first = await flushConnection();
    act(() => { first.open(); first.message(snapshot()); });
    first.emitCloseEvent = false;
    first.changeReadyStateOnClose = false;

    await act(async () => vi.advanceTimersByTimeAsync(6_000));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(first.sent).toEqual(['ping']);
    expect(result.current.status).toBe('online');

    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    const replacement = await flushConnection();
    expect(replacement).not.toBe(first);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe('reconnecting');
  });

  it('keeps a live socket when the foreground probe is answered', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    await act(async () => vi.advanceTimersByTimeAsync(6_000));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(socket.sent).toEqual(['ping']);
    act(() => socket.message({ type: 'pong', at: Date.now() }));
    await act(async () => vi.advanceTimersByTimeAsync(4_000));

    expect(result.current.status).toBe('online');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('never probes a socket that just delivered a message', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(socket.sent).toEqual([]);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.status).toBe('online');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('never steps back to an older snapshot revision', async () => {
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message({ ...snapshot(), state: { ...state, revision: 5 } }); });
    expect(result.current.state?.revision).toBe(5);

    act(() => socket.message({ ...snapshot(), state: { ...state, revision: 4 } }));
    expect(result.current.state?.revision).toBe(5);

    act(() => socket.message({ ...snapshot(), state: { ...state, revision: 5 } }));
    expect(result.current.state?.revision).toBe(5);
    expect(result.current.status).toBe('online');

    act(() => socket.message({ type: 'commandRejected', commandId: 'c1', code: 'ILLEGAL_ACTION', message: 'not your turn', state: { ...state, revision: 3 } }));
    expect(result.current.state?.revision).toBe(5);
  });

  it('resyncs quietly from a stale-revision rejection with softer copy', async () => {
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    act(() => socket.message({ type: 'commandRejected', commandId: 'c2', code: 'STALE_REVISION', message: 'The game changed on another device.', state: { ...state, revision: 7 } }));

    expect(result.current.state?.revision).toBe(7);
    expect(result.current.error).toBe('The table moved on — showing the latest board. Try again.');
  });

  it('requests a resync and heals when an acknowledged revision outruns the rendered snapshot', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });
    expect(result.current.state?.revision).toBe(0);

    // The command is acknowledged but its snapshot frame is lost.
    act(() => socket.message({ type: 'commandAccepted', commandId: 'c1', revision: 1 }));
    expect(socket.sent).not.toContain('resync');

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(socket.sent).toContain('resync');
    expect(result.current.state?.revision).toBe(0);

    // The server answers the resync with the missing snapshot and the gap closes.
    act(() => socket.message({ ...snapshot(), state: { ...state, revision: 1 } }));
    expect(result.current.state?.revision).toBe(1);
    socket.sent.length = 0;
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(socket.sent).not.toContain('resync');
  });

  it('requests a resync when a heartbeat pong reveals a newer server revision', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    // Both the accept and its snapshot were lost; the next pong exposes the gap.
    act(() => socket.message({ type: 'pong', at: Date.now(), revision: 3 }));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(socket.sent).toContain('resync');
    expect(result.current.state?.revision).toBe(0);
  });

  it('never requests a resync when the snapshot follows its acknowledgement', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameConnection(session));
    const socket = await flushConnection();
    act(() => { socket.open(); socket.message(snapshot()); });

    act(() => {
      socket.message({ type: 'commandAccepted', commandId: 'c1', revision: 1 });
      socket.message({ ...snapshot(), state: { ...state, revision: 1 } });
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(socket.sent).not.toContain('resync');
    expect(result.current.state?.revision).toBe(1);
  });

  it('stops retrying and reports a rejected seat when the ticket is refused', async () => {
    vi.useFakeTimers();
    vi.mocked(createTicket).mockClear();
    vi.mocked(createTicket).mockRejectedValueOnce(new ApiError('Reconnect token rejected.', 401));
    const { result } = renderHook(() => useGameConnection(session));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.status).toBe('rejected');
    expect(result.current.error).toBe('Your seat at that table is no longer available.');
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(vi.mocked(createTicket)).toHaveBeenCalledTimes(1);
  });

  it('treats a vanished room as terminal but keeps retrying plain network failures', async () => {
    vi.useFakeTimers();
    vi.mocked(createTicket).mockRejectedValueOnce(new ApiError('Room not found or expired.', 404));
    const { result, unmount } = renderHook(() => useGameConnection(session));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.status).toBe('rejected');
    unmount();

    vi.mocked(createTicket).mockRejectedValueOnce(new Error('Failed to fetch'));
    const second = renderHook(() => useGameConnection(session));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(second.result.current.status).toBe('reconnecting');
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    await flushConnection();
    expect(FakeWebSocket.instances.length).toBeGreaterThan(0);
  });
});
