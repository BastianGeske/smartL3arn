// Mirrors the root web assets into www/ for Capacitor.
// The root files remain the single source of truth (shared with the Electron build).
import { mkdirSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'build'), { recursive: true });

for (const f of ['index.html', 'style.css', 'app.js']) {
  copyFileSync(join(root, f), join(www, f));
}
copyFileSync(join(root, 'build', 'icon.png'), join(www, 'build', 'icon.png'));

console.log('Copied web assets to www/');
