import { useEffect, useState } from 'react';

const QUERY = '(max-width: 520px)';

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia?.(QUERY).matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return undefined;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return compact;
}
