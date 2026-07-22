import { describe, expect, it } from 'vitest';
import { friendlyError } from './errorCopy';

describe('friendlyError', () => {
  it('rewrites known engine phrases into table copy', () => {
    expect(friendlyError('not enough cash')).toBe('You do not have enough cash for that.');
    expect(friendlyError('not your turn')).toBe('It is not your turn yet.');
    expect(friendlyError('invalid bid')).toBe('That bid is too low or more than your cash.');
  });

  it('replaces raw browser network errors with connection copy', () => {
    expect(friendlyError('Failed to fetch')).toBe('No connection right now. Retrying automatically.');
    expect(friendlyError('NetworkError when attempting to fetch resource.')).toBe('No connection right now. Retrying automatically.');
  });

  it('turns unknown messages into sentences instead of exposing raw strings', () => {
    expect(friendlyError('deck is empty')).toBe('Deck is empty.');
    expect(friendlyError('The game changed on another device.')).toBe('The game changed on another device.');
    expect(friendlyError('   ')).toBe('Something went wrong. Try again.');
  });

  it('explains room and seat availability in table copy', () => {
    expect(friendlyError('room is unavailable')).toBe("That table can't take new players — the game has already started or the room is full.");
    expect(friendlyError('Room not found or expired.')).toBe("That room code doesn't match an open table. Check the code or start a new game.");
    expect(friendlyError('Reconnect token rejected.')).toBe('Your seat at that table is no longer available.');
  });
});
