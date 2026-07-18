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
});
