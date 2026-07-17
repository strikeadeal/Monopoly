// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, createGame } from '@monopoly/game';
import { useGameConnection } from './useGameConnection';

vi.mock('./api', () => ({
  createTicket: vi.fn(async () => ({ ticket: 'test-ticket' })),
  socketUrl: () => 'ws://table.test/socket'
}));

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
});
