// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_LAYOUT_QUERY, useCompactLayout } from './useCompactLayout';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Listener = () => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const media = {
    matches,
    addEventListener: vi.fn((_: string, listener: Listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_: string, listener: Listener) => listeners.delete(listener))
  };
  const matchMedia = vi.fn().mockReturnValue(media);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    media,
    setMatches(next: boolean) { media.matches = next; listeners.forEach((listener) => listener()); }
  };
}

describe('useCompactLayout', () => {
  it('covers portrait phones and landscape touch phones in one query', () => {
    expect(COMPACT_LAYOUT_QUERY).toBe('(max-width: 520px), (orientation: landscape) and (max-height: 520px) and (pointer: coarse)');
    const { matchMedia } = mockMatchMedia(false);
    renderHook(() => useCompactLayout());
    expect(matchMedia).toHaveBeenCalledWith(COMPACT_LAYOUT_QUERY);
  });

  it('reports compact when the media query matches, like a phone held sideways', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useCompactLayout());
    expect(result.current).toBe(true);
  });

  it('reports a full table on desktop viewports', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useCompactLayout());
    expect(result.current).toBe(false);
  });

  it('follows rotation changes and unsubscribes on unmount', () => {
    const mock = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => useCompactLayout());
    expect(result.current).toBe(false);
    act(() => mock.setMatches(true));
    expect(result.current).toBe(true);
    act(() => mock.setMatches(false));
    expect(result.current).toBe(false);
    unmount();
    expect(mock.media.removeEventListener).toHaveBeenCalled();
  });
});
