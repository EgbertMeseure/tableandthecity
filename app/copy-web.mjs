// Copies the published site (repo root) into app/www for the native apps. Only what the pages need; no scripts, screenshots or app/ itself.
// Photos are NOT bundled: js/media.js loads them from https://img.tableandthecity.com/ (Cloudflare R2, mirrors the repo img/ paths).
// Bundled from img/: the small UI assets media.js never rewrites (icons, brand, og*, share-card, CREDITS.json) plus img/world
// (1.8 MB globe textures; world.js falls back to the in-app copy when offline). This keeps the AAB/APK small (was ~118 MB).
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = dirname(fileURLToPath(import.meta.url)), ROOT = join(APP, '..'), WWW = join(APP, 'www');
const KEEP = ['index.html', 'guide.html', 'restaurant.html', 'privatechef.html', 'privacy.html', 'about.html', 'changes.html', 'invite.html', 'offline.html', 'world.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'css', 'js', 'data', 'vendor'];
const IMG_KEEP = /^(icons|brand|world|og[^/]*|share-card[^/]*|CREDITS\.json)$/;   // entries directly under img/
const skip = s => /\/data\/osm\/.*streets\.json$/.test(s);
rmSync(WWW, { recursive: true, force: true }); mkdirSync(WWW, { recursive: true });
for (const f of KEEP) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(WWW, f), { recursive: true, filter: s => !skip(s) });
mkdirSync(join(WWW, 'img'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'img'))) if (IMG_KEEP.test(f)) cpSync(join(ROOT, 'img', f), join(WWW, 'img', f), { recursive: true });
console.log('copied site into', WWW, '(photos load from img.tableandthecity.com)');
