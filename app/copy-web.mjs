// Copies the published site (repo root) into app/www for the native apps. Only what the pages need; no scripts, screenshots or app/ itself.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = dirname(fileURLToPath(import.meta.url)), ROOT = join(APP, '..'), WWW = join(APP, 'www');
const KEEP = ['index.html', 'guide.html', 'restaurant.html', 'privacy.html', 'about.html', 'changes.html', 'offline.html', 'world.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'css', 'js', 'data', 'img', 'vendor'];
rmSync(WWW, { recursive: true, force: true }); mkdirSync(WWW, { recursive: true });
for (const f of KEEP) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(WWW, f), { recursive: true, filter: s => !/\/data\/osm\/.*streets\.json$/.test(s) });
console.log('copied site into', WWW);
