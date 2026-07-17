import { useEffect, useState } from 'react';

// Keep in sync with the compact media queries in styles.css.
export const COMPACT_LAYOUT_QUERY =
  '(max-width: 520px), (orientation: landscape) and (max-height: 520px) and (pointer: coarse)';

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia?.(COMPACT_LAYOUT_QUERY).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_LAYOUT_QUERY);
    if (!media) return undefined;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return compact;
}
