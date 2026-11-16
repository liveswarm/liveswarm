// Renders public/og.png (1200x630): a real frame of the recorded Nocturne session, the named cursors
// crowding over the title, kept in the centre, with the Liveswarm name on it (tools/og-card.html).
// Usage: `npm run og [path/to/nocturne-wide.mp4]`. Needs ffmpeg and Chrome. No dev server needed.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const master = process.argv[2] || resolve(root, '../liveswarm/media/nocturne-wide.mp4');
mkdirSync(resolve(root, 'review'), { recursive: true });
// 0:19.4 is the frame where all 13 cursors sit above the styled title. Scale to 80%, then crop so the
// title and the swarm together are centred.
execFileSync(
  'ffmpeg',
  ['-v', 'error', '-y', '-ss', '19.4', '-i', master, '-frames:v', '1', '-vf', 'scale=1536:864:flags=lanczos,crop=1200:630:40:52', resolve(root, 'review/og-frame.png')],
  { stdio: 'inherit' },
);
const shots = [{ name: 'og', path: '/og-card.html', w: 1200, h: 630, wait: 900 }];
execFileSync('node', ['tools/look.mjs', pathToFileURL(here).href, JSON.stringify(shots)], { stdio: 'inherit', cwd: root });
copyFileSync(resolve(root, 'review/v2-og.png'), resolve(root, 'public/og.png'));
console.log('Wrote public/og.png');
