// Checks the brief's weight budgets against the built site. Run `npm run build` first.
//   demo script + timeline: under about 80 KB gzipped
//   timeline JSON: under 50 KB
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
if (!existsSync(dist)) {
  console.error('No dist/ folder. Run `npm run build` first.');
  process.exit(1);
}
const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

const scripts = readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.js'));
let scriptTotal = 0;
for (const f of scripts) {
  const size = gz(join(dist, '_astro', f));
  scriptTotal += size;
  console.log(`  ${f.padEnd(58)} ${kb(size)} gzipped`);
}
const timelineFile = join(dist, 'build-timeline.json');
const timelineRaw = readFileSync(timelineFile).length;
const timelineGz = gz(timelineFile);
const html = gz(join(dist, 'index.html'));

console.log(`\n  All scripts                 ${kb(scriptTotal)} gzipped`);
console.log(`  Timeline JSON               ${kb(timelineRaw)} raw, ${kb(timelineGz)} gzipped`);
console.log(`  Scripts + timeline          ${kb(scriptTotal + timelineGz)} gzipped (budget 80 KB)`);
console.log(`  index.html (styles inlined) ${kb(html)} gzipped`);

let failed = false;
if (scriptTotal + timelineGz > 80 * 1024) {
  console.error('\n  OVER BUDGET: scripts + timeline exceed 80 KB gzipped.');
  failed = true;
}
if (timelineRaw > 50 * 1024) {
  console.error('\n  OVER BUDGET: timeline JSON exceeds 50 KB.');
  failed = true;
}
process.exit(failed ? 1 : 0);
