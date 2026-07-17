import { useEffect, useState } from 'react';

// Keep in sync with the compact media queries in styles.css.
export const COMPACT_LAYOUT_QUERY =
  '(max-width: 520px), (orientation: landscape) and (max-height: 520px) and (pointer: coarse)';
export const LANDSCAPE_PHONE_QUERY =
  '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useCompactLayout() {
  return useMediaQuery(COMPACT_LAYOUT_QUERY);
}

export function useLandscapePhone() {
  return useMediaQuery(LANDSCAPE_PHONE_QUERY);
}
