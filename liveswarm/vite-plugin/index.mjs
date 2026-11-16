// @liveswarm/vite: dev-only source tagger + overlay injector.
// Option keepInBuild (default false) also tags during `vite build`; the conductor script is never injected in a build.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';

const DEFAULT_CONDUCTOR = 'http://127.0.0.1:7777';
const FILE_RE = /\.[jt]sx$/;

/** Static attribute-name lookup on an opening element. */
function hasAttr(opening, name) {
  return opening.attributes.some(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
}

/** Classify an element name: 'intrinsic' | 'component' | 'skip'. */
function classify(nameNode) {
  if (nameNode.type === 'JSXIdentifier') {
    const n = nameNode.name;
    if (n === 'Fragment') return 'skip';
    return /^[a-z]/.test(n) ? 'intrinsic' : 'component';
  }
  if (nameNode.type === 'JSXMemberExpression') {
    if (nameNode.property.name === 'Fragment') return 'skip';
    return 'component';
  }
  return 'skip'; // JSXNamespacedName (svg:rect style) is left alone
}

/** Recursive AST walker with an ancestor stack: visit(node, ancestors). */
function walk(node, visit, anc = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, anc);
  anc.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, anc);
    } else if (v && typeof v.type === 'string') {
      walk(v, visit, anc);
    }
  }
  anc.pop();
}

/** Parser plugin sets tried in order (decorators-legacy and decorators cannot be combined). */
function pluginSets(isTs) {
  const base = isTs ? ['jsx', 'typescript'] : ['jsx'];
  return [
    [...base, 'decorators-legacy', 'decoratorAutoAccessors', 'explicitResourceManagement'],
    [...base, ['decorators', { decoratorsBeforeExport: true }], 'decoratorAutoAccessors', 'explicitResourceManagement'],
    base,
  ];
}

const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[liveswarm] ${msg}`);
}

/** Line number (1-based) for an offset; lines are separated by \n only (CRLF safe, ignores U+2028/2029/lone CR). */
function lineTable(code) {
  const nl = [];
  for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) nl.push(i);
  return (off) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < off) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

/** Name of the nearest enclosing component-ish function/variable for a node, or null. */
function enclosingName(anc) {
  for (let i = anc.length - 1; i >= 0; i--) {
    const n = anc[i];
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) return n.id.name;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') return n.id.name;
  }
  return null;
}

function rootName(nameNode) {
  return nameNode.type === 'JSXMemberExpression' ? rootName(nameNode.object) : nameNode.name;
}

/**
 * Tag JSX in `code`. Returns {code, map} or null (parse error / nothing to tag).
 * @param {string} code
 * @param {{id: string, rel: string}} opts  id = file path (decides jsx vs tsx), rel = POSIX path for the tag
 */
export function tagSource(code, { id, rel }) {
  const isTs = /\.tsx$/.test(id);
  let ast;
  let firstErr;
  for (const plugins of pluginSets(isTs)) {
    try {
      ast = parse(code, { sourceType: 'module', plugins, errorRecovery: false });
      break;
    } catch (e) {
      firstErr ??= e;
    }
  }
  if (!ast) {
    warnOnce(id, `could not parse ${rel}; its elements will not be tagged (${firstErr && firstErr.message})`);
    return null;
  }
  const lineOf = lineTable(code);
  const s = new MagicString(code);
  const safeRel = rel.replace(/"/g, '&quot;');

  // Pass 1: components defined in this file that spread props onto a Fragment would make React warn
  // about the injected data-swarm-site prop, so uses of them are not tagged.
  const noSite = new Set();
  walk(ast.program, (node, anc) => {
    if (node.type !== 'JSXElement') return;
    const op = node.openingElement;
    if (classify(op.name) !== 'skip' || op.name.type === 'JSXNamespacedName') return;
    if (!op.attributes.some((a) => a.type === 'JSXSpreadAttribute')) return;
    const name = enclosingName(anc);
    if (name) noSite.add(name);
  });

  let changed = false;
  walk(ast.program, (node) => {
    if (node.type !== 'JSXElement') return;
    const opening = node.openingElement;
    const kind = classify(opening.name);
    if (kind === 'skip') return;
    if (kind === 'component' && noSite.has(rootName(opening.name))) return;
    const attr = kind === 'intrinsic' ? 'data-swarm' : 'data-swarm-site';
    if (hasAttr(opening, attr)) return;
    const typeArgs = opening.typeParameters || opening.typeArguments;
    const pos = typeArgs ? typeArgs.end : opening.name.end;
    s.appendLeft(pos, ` ${attr}="${safeRel}:${lineOf(node.start)}-${lineOf(Math.max(node.start, node.end - 1))}"`);
    changed = true;
  });
  if (!changed) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true, source: id, includeContent: true }) };
}

function matches(list, rel) {
  return list.some((p) => (p instanceof RegExp ? p.test(rel) : rel.includes(String(p))));
}

function safeReal(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export default function liveswarm(options = {}) {
  const conductor = (options.conductor || process.env.LIVESWARM_CONDUCTOR || (process.env.LIVESWARM_PORT ? `http://127.0.0.1:${process.env.LIVESWARM_PORT}` : DEFAULT_CONDUCTOR)).replace(/\/+$/, '');
  const include = [].concat(options.include || []);
  const exclude = [].concat(options.exclude || []);
  const keepInBuild = options.keepInBuild === true;
  let root = '';

  const tagger = {
    name: 'liveswarm:tagger',
    enforce: 'pre',
    apply: keepInBuild ? () => true : 'serve',
    configResolved(config) {
      root = safeReal(config.root);
    },
    transform(code, rawId) {
      const id = rawId.split('?')[0];
      if (!FILE_RE.test(id) || id.includes('/node_modules/') || id.startsWith('\0')) return null;
      let file = id;
      if (file.startsWith('/@fs/')) file = file.slice(4);
      if (!path.isAbsolute(file)) file = path.join(root, file);
      const rel = path.relative(root, safeReal(file)).split(path.sep).join('/');
      // Files outside the Vite root cannot be matched by the overlay (root + "/" + rel), so skip them.
      if (rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
      if (include.length && !matches(include, rel)) return null;
      if (exclude.length && matches(exclude, rel)) return null;
      return tagSource(code, { id, rel });
    },
  };

  const html = {
    name: 'liveswarm:html',
    apply: 'serve',
    transformIndexHtml() {
      const cfg = `window.__LIVESWARM__={root:${JSON.stringify(root)},conductor:${JSON.stringify(conductor)}}`.replace(/</g, '\\u003c');
      return [
        { tag: 'script', children: cfg, injectTo: 'head-prepend' },
        { tag: 'script', attrs: { src: `${conductor}/overlay.js`, defer: true }, injectTo: 'head-prepend' },
      ];
    },
  };

  return [tagger, html];
}
