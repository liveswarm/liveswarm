// Liveswarm watch proxy: zero-dependency reverse proxy that injects the overlay into HTML pages.
// Binds 127.0.0.1 only. Streams everything; websocket upgrades are piped through untouched.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';

export const PROXY_BASE_PORT = 7780;

export function snippet(conductor) {
  return `<script>window.__LIVESWARM__={conductor:${JSON.stringify(conductor)},mode:"proxy"}</script>` +
    `<script src="${conductor}/overlay.js" defer></script>`;
}

// Inserts `tag` before </head> (else before <body, else at the end). Holds back only the head of the page.
function injector(tag) {
  let buf = Buffer.alloc(0), done = false;
  const inject = (b, flush) => {
    const low = b.toString('latin1').toLowerCase();
    if (low.includes('__liveswarm__') || low.includes('/overlay.js')) return b;   // page already loads Liveswarm (e.g. @liveswarm/vite)
    let i = low.indexOf('</head>');
    if (i < 0) i = low.indexOf('<body');
    if (i < 0 && flush) {
      if (!/<(!doctype|html|head|body)/.test(low)) return b;   // an HTML fragment, not a document
      i = b.length;
    }
    if (i < 0) return null;
    return Buffer.concat([b.subarray(0, i), Buffer.from(tag), b.subarray(i)]);
  };
  return new Transform({
    transform(chunk, _e, cb) {
      if (done) return cb(null, chunk);
      buf = Buffer.concat([buf, chunk]);
      const out = inject(buf, false);
      if (out) { done = true; buf = null; return cb(null, out); }
      if (buf.length > 4 * 1024 * 1024) { const b = buf; done = true; buf = null; return cb(null, b); }
      cb();
    },
    flush(cb) { if (!done) this.push(inject(buf, true)); cb(); },
  });
}

// True when the request is a top-level page load (not fetch/XHR/htmx/iframe).
function isNavigation(req) {
  const h = req.headers;
  if (h['hx-request'] || h['x-requested-with'] || h['turbo-frame']) return false;
  if (h['sec-fetch-dest']) return h['sec-fetch-dest'] === 'document';
  return /text\/html/i.test(h.accept || '');
}

export function startProxy({ upstream, conductor, port, onNotice = () => {} }) {
  const up = new URL(upstream);
  const isTls = up.protocol === 'https:';
  const upPort = Number(up.port) || (isTls ? 443 : 80);
  const lib = isTls ? https : http;
  const isLocal = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(up.hostname);   // self-signed certs are normal on local dev servers only
  const tag = snippet(conductor);
  const upstreamOrigins = new Set([up.origin]);
  if (up.hostname === 'localhost' || up.hostname === '127.0.0.1') {
    for (const h of ['localhost', '127.0.0.1']) upstreamOrigins.add(`${up.protocol}//${h}:${upPort}`);
  }
  let stripped = false, warnedEnc = false;
  let proxyOrigin = '';
  const sockets = new Set();   // upgraded websocket sockets (not covered by closeAllConnections)
  const track = (...ss) => ss.forEach((x) => { sockets.add(x); x.once('close', () => sockets.delete(x)); });

  // Refuse what a browser on another site could send: a Host that is not this proxy (DNS rebinding)
  // and an Origin from a non-local page (cross-site requests and websocket hijacking). Only after that
  // is the Origin rewritten to the upstream, so the dev server's own checks keep working.
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  const localHost = (h) => { try { return LOCAL.test(new URL('http://' + h).hostname); } catch { return false; } };
  const localOrigin = (o) => { try { const u = new URL(o); return (u.protocol === 'http:' || u.protocol === 'https:') && (LOCAL.test(u.hostname) || u.hostname.endsWith('.localhost')); } catch { return false; } };
  const refused = (req) => !localHost(String(req.headers.host || '')) || (req.headers.origin !== undefined && !localOrigin(String(req.headers.origin)));

  const server = http.createServer((req, res) => {
    if (refused(req)) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('Liveswarm proxy only serves local pages.'); }
    const headers = { ...req.headers, host: up.host, 'accept-encoding': 'identity' };
    if (headers.origin) headers.origin = up.origin;
    if (headers.referer) headers.referer = String(headers.referer).replace(proxyOrigin, up.origin);
    const preq = lib.request({ protocol: up.protocol, hostname: up.hostname, port: upPort, method: req.method, path: req.url, headers, rejectUnauthorized: !isLocal }, (pres) => {
      const h = { ...pres.headers };
      for (const k of ['content-security-policy', 'content-security-policy-report-only']) {
        if (h[k]) { delete h[k]; if (!stripped) { stripped = true; onNotice('stripped the Content-Security-Policy header from the upstream so the overlay can load (dev proxy only)'); } }
      }
      if (typeof h.location === 'string') {
        for (const o of upstreamOrigins) if (h.location.startsWith(o)) { h.location = proxyOrigin + h.location.slice(o.length); break; }
      }
      if (h['set-cookie']) h['set-cookie'] = [].concat(h['set-cookie']).map((c) => c.replace(/;\s*domain=[^;]*/i, ''));
      const enc = String(h['content-encoding'] || '').toLowerCase();
      const dec = enc === 'gzip' || enc === 'x-gzip' ? zlib.createGunzip() : enc === 'br' ? zlib.createBrotliDecompress() : enc === 'deflate' ? zlib.createInflate() : null;
      const htmlType = /text\/html/i.test(h['content-type'] || '') && req.method !== 'HEAD' && ![204, 304].includes(pres.statusCode);
      const isHtml = htmlType && isNavigation(req) && (!enc || enc === 'identity' || dec);
      if (htmlType && enc && enc !== 'identity' && !dec && !warnedEnc) { warnedEnc = true; onNotice(`upstream sent HTML with unsupported content-encoding "${enc}"; overlay not injected`); }
      if (isHtml) { delete h['content-length']; if (dec) delete h['content-encoding']; }
      res.writeHead(pres.statusCode, pres.statusMessage, h);
      pres.on('error', () => res.destroy());
      if (isHtml) {
        const inj = injector(tag);
        inj.on('error', () => res.destroy());
        if (dec) { dec.on('error', () => res.destroy()); pres.pipe(dec).pipe(inj).pipe(res); } else pres.pipe(inj).pipe(res);
      } else pres.pipe(res);
    });
    preq.on('error', (e) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Liveswarm proxy: cannot reach ${up.origin} (${e.code || e.message}). Is your dev server still running?`);
    });
    res.on('close', () => preq.destroy());
    req.pipe(preq);
  });

  // WebSocket (Vite /, Next /_next/webpack-hmr, Astro, ...): forward the raw handshake and pipe bytes.
  server.on('upgrade', (req, socket, head) => {
    if (refused(req)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const s = isTls ? tls.connect({ host: up.hostname, port: upPort, servername: up.hostname, rejectUnauthorized: !isLocal }) : net.connect(upPort, up.hostname);
    track(socket, s);
    const fail = () => { socket.destroy(); s.destroy(); };
    s.on('error', fail); socket.on('error', fail);
    s.once(isTls ? 'secureConnect' : 'connect', () => {
      let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i]; let v = req.rawHeaders[i + 1];
        if (/^host$/i.test(k)) v = up.host; else if (/^origin$/i.test(k)) v = up.origin;
        raw += `${k}: ${v}\r\n`;
      }
      s.write(raw + '\r\n');
      if (head && head.length) s.write(head);
      socket.pipe(s); s.pipe(socket);
    });
  });

  const close = () => new Promise((r) => {
    const t = setTimeout(r, 1000); t.unref();
    server.close(() => { clearTimeout(t); r(); });
    server.closeAllConnections?.();
    for (const x of sockets) x.destroy();
  });

  return new Promise((resolve, reject) => {
    const tryListen = (p, strict) => {
      const onErr = (e) => {
        server.off('listening', onOk);
        if (e.code === 'EADDRINUSE' && !strict && p < PROXY_BASE_PORT + 100) return tryListen(p + 1, false);
        reject(e);
      };
      const onOk = () => {
        server.off('error', onErr);
        const actual = server.address().port;
        proxyOrigin = `http://127.0.0.1:${actual}`;
        resolve({ server, close, port: actual, url: proxyOrigin + '/' });
      };
      server.once('error', onErr); server.once('listening', onOk);
      server.listen(p, '127.0.0.1');
    };
    tryListen(port || PROXY_BASE_PORT, !!port);
  });
}
