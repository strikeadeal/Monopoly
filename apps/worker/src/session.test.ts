import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, createLobby } from '@monopoly/game';
import { RoomSession, authoritativePayload, createSocketTicket, firstAvailableToken, validateClientPayload, validateSocketTicket } from './session';

const state = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1000);
state.players[0]!.tokenConfirmed = true;

describe('RoomSession', () => {
  it('rejects stale revisions with the latest snapshot', () => {
    const session = new RoomSession(state);
    const result = session.execute({ protocolVersion: PROTOCOL_VERSION, commandId: 'one', expectedRevision: 9, type: 'SET_READY', payload: { playerId: 'p1', ready: true } });
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION', state: { revision: 0 } });
  });

  it('returns the first result for a duplicate command id', () => {
    const session = new RoomSession(state);
    const command = { protocolVersion: PROTOCOL_VERSION, commandId: 'same', expectedRevision: 0, type: 'SET_READY' as const, payload: { playerId: 'p1', ready: true } };
    const first = session.execute(command);
    const duplicate = session.execute(command);
    expect(first).toEqual(duplicate);
    expect(session.state.revision).toBe(1);
  });

  it('does not roll state back when an older successful command is replayed', () => {
    const session = new RoomSession(state);
    const first = session.execute({ protocolVersion: PROTOCOL_VERSION, commandId: 'first-command', expectedRevision: 0, type: 'SET_READY', payload: { playerId: 'p1', ready: false } });
    expect(first.ok).toBe(true);
    const second = session.execute({ protocolVersion: PROTOCOL_VERSION, commandId: 'second-command', expectedRevision: 1, type: 'SET_READY', payload: { playerId: 'p1', ready: true } });
    expect(second.ok).toBe(true);

    const replay = session.execute({ protocolVersion: PROTOCOL_VERSION, commandId: 'first-command', expectedRevision: 0, type: 'SET_READY', payload: { playerId: 'p1', ready: false } });

    expect(replay.ok).toBe(true);
    expect(replay.ok && replay.state.revision).toBe(second.ok ? second.state.revision : -1);
    expect(replay.ok && replay.state.players[0]?.ready).toBe(true);
    expect(session.state.players[0]?.ready).toBe(true);
  });

  it('rejects a mismatched protocol without changing state', () => {
    const session = new RoomSession(state);
    const result = session.execute({ protocolVersion: 99, commandId: 'bad', expectedRevision: 0, type: 'SET_READY', payload: { playerId: 'p1', ready: true } });
    expect(result).toMatchObject({ ok: false, code: 'PROTOCOL_MISMATCH' });
    expect(session.state.revision).toBe(0);
  });
});

describe('one-use socket tickets', () => {
  it('accepts a valid ticket once and rejects it after consumption or expiry', async () => {
    const secret = 'player-secret';
    const ticket = await createSocketTicket(secret, 'p1', 1_000);
    expect(await validateSocketTicket(ticket, secret, 1_010)).toEqual({ playerId: 'p1' });
    expect(await validateSocketTicket(ticket, secret, 1_010)).toBeNull();
    const expired = await createSocketTicket(secret, 'p1', 2_000);
    expect(await validateSocketTicket(expired, secret, 2_031)).toBeNull();
  });
});

describe('client command authority', () => {
  it('validates token selection but never exposes leave as a socket command', () => {
    expect(validateClientPayload('SET_TOKEN', { token: 'coffee' })).toEqual({ token: 'coffee' });
    expect(validateClientPayload('SET_TOKEN', { token: 'car' })).toBeNull();
    expect(validateClientPayload('LEAVE_ROOM', {})).toBeNull();
  });

  it('allocates the first character not held by a lobby player', () => {
    const lobby = createLobby({ id: 'p1', name: 'Alex', token: 'rocket' }, { mode: 'official' }, 1_000);
    expect(firstAvailableToken(lobby)).toBe('key');
    lobby.players.push({ ...lobby.players[0]!, id: 'p2', token: 'key' });
    expect(firstAvailableToken(lobby)).toBe('coffee');
  });

  it('discards client dice and replaces client clocks', () => {
    expect(authoritativePayload('ROLL', { dice: [6, 6], now: 1 }, 'p1', 5_000)).toEqual({ playerId: 'p1' });
    expect(authoritativePayload('PLACE_BID', { amount: 20, now: 1 }, 'p1', 5_000)).toEqual({ amount: 20, playerId: 'p1', now: 5_000 });
  });

  it('rejects malformed payload fields before the reducer', () => {
    expect(validateClientPayload('SET_READY', { ready: 'yes' })).toBeNull();
    expect(validateClientPayload('BUILD', { spaceIndex: 41 })).toBeNull();
    expect(validateClientPayload('ROLL', { dice: [6, 6] })).toEqual({});
  });
});
