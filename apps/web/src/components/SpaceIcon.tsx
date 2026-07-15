const paths: Partial<Record<string, string>> = {
  jail: 'M4 4h16v16H4V4Zm4 0v16m4-16v16m4-16v16',
  'go-to-jail': 'M2.5 12h8m-3-3 3 3-3 3M14 5h7.5v14H14V5Zm3.75 0v14',
  chance: 'M8.8 9.3a3.2 3.2 0 1 1 5 2.6c-1.2.8-1.8 1.6-1.8 2.9M12 18.4v.01',
  'community-chest': 'M4 11h16v8H4v-8Zm0 0V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M10 11h4v3h-4v-3'
};

export function SpaceIcon({ type, size = 12 }: { type: string; size?: number }) {
  const path = paths[type];
  if (!path) return null;
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}
