import type { TokenId } from '@monopoly/game';

export const tokenNames: Record<TokenId, string> = { rocket: 'Rocket', key: 'Key', coffee: 'Coffee', bolt: 'Bolt', star: 'Star', globe: 'Globe' };
const paths: Record<TokenId, string> = {
  rocket: 'M12 2c3 2 5 5 5 9l-3 3-2 7-2-7-3-3c0-4 2-7 5-9Zm-5 13-3 3 4-1m9-2 3 3-4-1',
  key: 'M14 4a5 5 0 1 0 3 9l5 5-2 2-2-2-2 2-3-3 2-2',
  coffee: 'M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Zm12 2h2a3 3 0 0 1 0 6h-2M8 4v2m4-2v2',
  bolt: 'm13 2-8 12h7l-1 8 8-12h-7l1-8Z',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-9-10h18M12 2c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10Z'
};

export function TokenIcon({ token, size = 20 }: { token: string; size?: number }) {
  const safe = (token in paths ? token : 'star') as TokenId;
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[safe]} /></svg>;
}
