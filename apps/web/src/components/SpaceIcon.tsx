export function SpaceIcon({ type, name = '', size = 12 }: { type: string; name?: string; size?: number }) {
  let paths: string[];
  if (type === 'go') paths = ['M22 17H2', 'M7 12 2 17l5 5'];
  else if (type === 'jail') paths = ['M4 4h16v16H4V4Z', 'M8 4v16M12 4v16M16 4v16'];
  else if (type === 'free-parking') paths = ['M5 13h14l-1.5-5h-11L5 13Z', 'M4 13v4h2m12 0h2v-4', 'M8 17h8', 'M8 8l2-3h4l2 3'];
  else if (type === 'go-to-jail') paths = ['M3 13h10', 'm-3-3 3 3-3 3', 'M15 5h6v14h-6', 'M18 5v14'];
  else if (type === 'chance') paths = ['M8.8 9.3a3.2 3.2 0 1 1 5 2.6c-1.2.8-1.8 1.6-1.8 2.9', 'M12 18.4v.01'];
  else if (type === 'community-chest') paths = ['M4 11h16v8H4v-8Z', 'M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3', 'M10 11h4v3h-4v-3Z'];
  else if (type === 'railroad') paths = ['M7 4h10v9H7V4Z', 'M5 16h14', 'M8 13l-3 5m11-5 3 5', 'M9 8h6', 'M9 18h6'];
  else if (type === 'utility' && name === 'Water Works') paths = ['M5 8h8V5h5', 'M9 8v4', 'M6 12h6', 'M15 15c0 2 1.3 4 3 4s3-2 3-4c0-1.4-3-5-3-5s-3 3.6-3 5Z'];
  else if (type === 'utility') paths = ['M9 16h6', 'M10 19h4', 'M8 10a4 4 0 1 1 8 0c0 2-2 2.8-2 6h-4c0-3.2-2-4-2-6Z'];
  else if (type === 'tax' && name === 'Luxury Tax') paths = ['M7 10h10l3 8H4l3-8Z', 'M9 10a3 3 0 1 1 6 0', 'M10 18v2h4v-2'];
  else if (type === 'tax') paths = ['M12 4 20 12 12 20 4 12 12 4Z'];
  else return null;
  return <svg data-space-icon={type} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths.map((path) => <path key={path} d={path} />)}</svg>;
}
