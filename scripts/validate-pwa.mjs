import { access, readFile } from 'node:fs/promises';

const dist = new URL('../apps/web/dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== '/Monopoly/#/' || manifest.icons?.length < 3) throw new Error('PWA manifest is incomplete.');
await Promise.all(['index.html', 'sw.js', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'].map((file) => access(new URL(file, dist))));
const worker = await readFile(new URL('sw.js', dist), 'utf8');
if (worker.includes('/api/')) throw new Error('Service worker must not cache API traffic.');
console.log(`Validated ${manifest.name}: standalone shell, icons, and API cache exclusion.`);
