import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
import liveswarm, { tagSource } from '../index.mjs';

const tag = (code, id = 'x.jsx', rel = 'src/x.jsx') => tagSource(code, { id, rel });
const tags = (out, attr) => [...out.code.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]);
const reparses = (out, id) =>
  parse(out.code, { sourceType: 'module', plugins: id.endsWith('x') && id.includes('tsx') ? ['jsx', 'typescript'] : ['jsx'] });

test('intrinsic gets data-swarm with line range', () => {
  const out = tag('const a = <div>\n  <span>hi</span>\n</div>;');
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:1-3', 'src/x.jsx:2-2']);
  assert.match(out.code, /<div data-swarm="src\/x\.jsx:1-3">/);
  reparses(out, 'x.jsx');
});

test('components and member expressions get data-swarm-site', () => {
  const out = tag('const a = (\n<Button>\n<motion.div a="1"/>\n</Button>\n);');
  assert.match(out.code, /<Button data-swarm-site="src\/x\.jsx:2-4">/);
  assert.match(out.code, /<motion\.div data-swarm-site="src\/x\.jsx:3-3" a="1"\/>/);
  assert.ok(!/data-swarm="/.test(out.code));
});

test('self-closing uses its own line', () => {
  const out = tag('const a = <div>\n<img src="a"\n  alt="b" />\n</div>;');
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:1-4', 'src/x.jsx:2-3']);
});

test('multi-line opening tag: start is the "<" line, end the closing tag line', () => {
  const code = 'const a = (\n  <section\n    id="a"\n    className="b"\n  >\n    text\n  </section>\n);';
  const out = tag(code);
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:2-7']);
  assert.match(out.code, /<section data-swarm="src\/x\.jsx:2-7"\n    id="a"/);
  reparses(out, 'x.jsx');
});

test('fragments and React.Fragment are skipped, children are tagged', () => {
  const code = 'const a = <><p>1</p><React.Fragment><i>2</i></React.Fragment><Fragment><b>3</b></Fragment></>;';
  const out = tag(code);
  assert.ok(!out.code.includes('<> data'));
  assert.ok(!/React\.Fragment data/.test(out.code));
  assert.ok(!/<Fragment data/.test(out.code));
  assert.equal(tags(out, 'data-swarm').length, 3);
  reparses(out, 'x.jsx');
});

test('only-fragment file returns null', () => {
  assert.equal(tag('const a = <><>x</></>;'), null);
});

test('attribute already present is not duplicated (both kinds)', () => {
  const out = tag('const a = <div data-swarm="keep"><Foo data-swarm-site="keep2"><p/></Foo></div>;');
  assert.equal((out.code.match(/data-swarm="/g) || []).length, 2); // div keep + p
  assert.equal((out.code.match(/data-swarm-site=/g) || []).length, 1);
  assert.match(out.code, /data-swarm="keep"/);
});

test('conditional and mapped JSX', () => {
  const code = 'const a = (\n<ul>\n{xs.map((x) => (\n<li key={x}>{x}</li>\n))}\n{c ? <b>y</b> : <i>n</i>}\n{c && <Foo />}\n</ul>\n);';
  const out = tag(code);
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:2-8', 'src/x.jsx:4-4', 'src/x.jsx:6-6', 'src/x.jsx:6-6']);
  assert.deepEqual(tags(out, 'data-swarm-site'), ['src/x.jsx:7-7']);
  reparses(out, 'x.jsx');
});

test('nested JSX inside attribute expressions is tagged', () => {
  const out = tag('const a = <Foo icon={<svg><path d="M0"/></svg>} />;');
  assert.equal(tags(out, 'data-swarm').length, 2);
  assert.equal(tags(out, 'data-swarm-site').length, 1);
});

test('TSX: generics arrow, type assertions, generic components', () => {
  const code = [
    'const id = <T,>(x: T) => x;',
    'const n = <number>(5 as unknown);',
    'export function C<T>(p: { v: T }) {',
    '  const el = <List<string> items={["a"]}>',
    '    <li>{String(p.v)}</li>',
    '  </List>;',
    '  return <div>{el}{(p.v as unknown) as string}</div>;',
    '}',
  ].join('\n');
  // `<number>(...)` assertion is invalid in TSX; keep to valid syntax:
  const valid = code.replace('const n = <number>(5 as unknown);', 'const n = (5 as unknown) as number;');
  const out = tag(valid, 'x.tsx', 'src/x.tsx');
  assert.ok(out, 'tsx parsed');
  assert.match(out.code, /<List<string> data-swarm-site="src\/x\.tsx:4-6" items=/);
  assert.match(out.code, /<li data-swarm="src\/x\.tsx:5-5">/);
  assert.match(out.code, /<div data-swarm="src\/x\.tsx:7-7">/);
  assert.match(out.code, /const id = <T,>\(x: T\) => x;/);
  parse(out.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
});

test('.jsx does not accept TS syntax; parse error returns null', () => {
  assert.equal(tag('const a: number = <div/>;', 'x.jsx'), null);
  assert.equal(tag('const a = <div>', 'x.jsx'), null);
});

test('no JSX returns null', () => {
  assert.equal(tag('export const a = 1;'), null);
});

test('sourcemap is produced and hires', () => {
  const out = tag('const a = <div>\n<p/>\n</div>;');
  assert.equal(out.map.version, 3);
  assert.deepEqual(out.map.sources, ['x.jsx']);
  assert.ok(out.map.mappings.length > 10);
});

test('line numbers with CRLF and unicode', () => {
  const out = tag('const s = "é😀";\r\nconst a = <div>\r\n<p/>\r\n</div>;');
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:2-4', 'src/x.jsx:3-3']);
});

test('plugin shape and transform filtering', async () => {
  const [tagger, html] = liveswarm({ conductor: 'http://127.0.0.1:9999/' });
  assert.equal(tagger.enforce, 'pre');
  assert.equal(tagger.apply, 'serve');
  assert.equal(html.apply, 'serve');
  tagger.configResolved({ root: process.cwd() });
  const src = 'const a = <div/>;';
  assert.equal(tagger.transform(src, '/proj/node_modules/x/a.jsx'), null);
  assert.equal(tagger.transform(src, '/proj/a.js'), null);
  const r = tagger.transform(src, `${process.cwd()}/src/a.jsx?t=123`);
  assert.match(r.code, /data-swarm="src\/a\.jsx:1-1"/);
  const tagsOut = html.transformIndexHtml();
  assert.equal(tagsOut[0].children, `window.__LIVESWARM__={root:${JSON.stringify(process.cwd())},conductor:"http://127.0.0.1:9999"}`);
  assert.equal(tagsOut[1].attrs.src, 'http://127.0.0.1:9999/overlay.js');
});

test('include/exclude options', () => {
  const [tagger] = liveswarm({ exclude: ['legacy/'] });
  tagger.configResolved({ root: '/r' });
  assert.equal(tagger.transform('const a=<p/>;', '/r/src/legacy/a.jsx'), null);
  assert.ok(tagger.transform('const a=<p/>;', '/r/src/a.jsx'));
});

// ---- fixes from adversarial review ----
test('decorators and accessor fields still get tagged (jsx and tsx)', () => {
  for (const [code, id] of [
    ['class A { @p x=1 }; const a=<div/>', '/a/x.tsx'],
    ['@dec export class A {}; const a=<div/>', '/a/x.tsx'],
    ['class Q{ accessor y=1}; const a=<div/>', '/a/x.tsx'],
    ['@dec class A {}; const a=<div/>', '/a/x.jsx'],
    ['class Q{ accessor y=1}; const a=<div/>', '/a/x.jsx'],
  ]) {
    const out = tagSource(code, { id, rel: 'x' });
    assert.ok(out, code);
    assert.match(out.code, /<div data-swarm="x:1-1"/);
  }
});

test('unparseable file warns once and returns null', () => {
  const orig = console.warn;
  const msgs = [];
  console.warn = (m) => msgs.push(m);
  try {
    assert.equal(tagSource('const a = <div>', { id: '/warn/once.jsx', rel: 'once.jsx' }), null);
    assert.equal(tagSource('const a = <div>', { id: '/warn/once.jsx', rel: 'once.jsx' }), null);
  } finally {
    console.warn = orig;
  }
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /liveswarm/);
});

test('components spreading props into Fragment are not given data-swarm-site', () => {
  const code = `const Wrap = (props) => <Fragment {...props} />;
function W2(p) { return <React.Fragment {...p}>x</React.Fragment>; }
export default function E() { return <div><Wrap><i/></Wrap><W2/><Other/></div>; }`;
  const out = tag(code);
  assert.ok(!/<Wrap data-swarm-site/.test(out.code));
  assert.ok(!/<W2 data-swarm-site/.test(out.code));
  assert.match(out.code, /<Other data-swarm-site=/);
  assert.match(out.code, /<i data-swarm=/);
});

test('line numbers ignore U+2028, U+2029 and lone CR', () => {
  const out = tag('// a\u2028b\u2029c\rd\nconst a = <div>\n</div>;');
  assert.deepEqual(tags(out, 'data-swarm'), ['src/x.jsx:2-3']);
});

test('files outside the Vite root are not tagged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-root-'));
  const real = fs.realpathSync.native(root);
  const [tagger] = liveswarm();
  tagger.configResolved({ root });
  const code = 'const a = <div/>;';
  const inside = tagger.transform(code, path.join(real, 'src/A.jsx'));
  assert.match(inside.code, /data-swarm="src\/A\.jsx:1-1"/);
  assert.equal(tagger.transform(code, path.join(path.dirname(real), 'outside/Out.jsx')), null);
  assert.equal(tagger.transform(code, '/@fs' + path.join(path.dirname(real), 'outside/Out.jsx')), null);
});

test('keepInBuild: tagger applies in build only when enabled; html injection stays serve-only', () => {
  const build = { command: 'build', mode: 'production' };
  const serve = { command: 'serve', mode: 'development' };
  const applies = (plugin, env) => (typeof plugin.apply === 'function' ? plugin.apply({}, env) : plugin.apply === env.command);
  const [tOff, hOff] = liveswarm();
  const [tOn, hOn] = liveswarm({ keepInBuild: true });
  assert.equal(applies(tOff, serve), true);
  assert.equal(applies(tOff, build), false, 'default: no tagging in build');
  assert.equal(applies(tOn, serve), true);
  assert.equal(applies(tOn, build), true, 'keepInBuild: tagging in build');
  for (const h of [hOff, hOn]) {
    assert.equal(applies(h, serve), true);
    assert.equal(applies(h, build), false, 'conductor script never injected in build');
  }
});
