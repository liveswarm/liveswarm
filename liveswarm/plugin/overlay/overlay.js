/*! Liveswarm overlay 0.1.0 - multiplayer-style cursors for Claude Code agents. Zero dependencies. */
(function () {
  'use strict';
  if (window.Liveswarm) return;
  var win = window, doc = document;

  /* ------------------------------------------------------------------ utils */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var now = function () { return performance.now(); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var base = function (p) { return String(p || '').split(/[\\/]/).pop(); };
  var mqRM = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = function () { return !!(mqRM && mqRM.matches); };
  var D = function (ms) { return RM() ? ms * 0.45 : ms; };
  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function play(el, kf, opts) {
    try { return el.animate(kf, opts).finished.catch(function () {}); } catch (e) { return Promise.resolve(); }
  }
  function vp() { return { w: doc.documentElement.clientWidth || win.innerWidth, h: win.innerHeight }; }

  /* ----------------------------------------------------------------- colour */
  function oklch(L, C, H) {
    var hr = H * Math.PI / 180, A = C * Math.cos(hr), B = C * Math.sin(hr);
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    var m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    var s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    var rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
    return rgb.map(function (v) {
      v = clamp(v, 0, 1);
      v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return Math.round(clamp(v, 0, 1) * 255);
    });
  }
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  var rgbs = function (c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; };
  var MAIN_HUE = 268;
  var SUB_HUES = [24, 176, 84, 336, 222, 134, 304, 52];
  function makeColor(idx) {
    var hue = idx === 0 ? MAIN_HUE : (idx - 1 < SUB_HUES.length ? SUB_HUES[idx - 1] : ((idx * 137.5) % 360));
    var base_ = oklch(0.71, 0.19, hue), deep = oklch(0.5, 0.17, hue), soft = oklch(0.85, 0.1, hue);
    return { hue: hue, rgb: base_, base: rgbs(base_), deep: rgbs(deep), soft: rgbs(soft) };
  }

  /* ------------------------------------------------------------------ state */
  var S;
  var raf = 0, epoch = 0, anon = 0, clockTimer = 0;
  function freshState() {
    return {
      agents: new Map(), tomb: new Map(), beats: new Map(), dock: new Map(), tethers: [],
      edits: 0, dropped: 0, events: 0, landings: [], errors: [], connected: false, connecting: false,
      t0: 0, tEnd: 0, lastEv: 0, colorIdx: 0, mut: [], lastMut: 0, ended: false, sid: '', restored: false
    };
  }
  S = freshState();
  var lastMutGlobal = 0; // survives reset
  var connState = { connected: false, connecting: false, replay: false };

  /* ------------------------------------------------------------------ mount */
  var host, root, L = {}, ctx, canvasDpr = 1;
  var CSS = [
    ':host{all:initial}*{box-sizing:border-box}',
    '.root{position:fixed;inset:0;overflow:hidden;pointer-events:none;contain:layout paint style;',
    'font:500 12px/1.2 ui-sans-serif,system-ui,-apple-system,"SF Pro Text","Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#fff}',
    '.root>*{pointer-events:none}',
    'canvas.trail,svg.teth{position:absolute;left:0;top:0;width:100%;height:100%}',
    '.fxl,.curs{position:absolute;inset:0}',
    /* cursor */
    '.cur{position:absolute;left:0;top:0;will-change:transform}',
    '.fx0{position:absolute;left:0;top:0;opacity:0;transform-origin:0 0}',
    '.drift{position:absolute;left:0;top:0;animation:drift var(--dd,7s) ease-in-out var(--dl,0s) infinite}',
    '@keyframes drift{0%,100%{transform:translate(0,0)}30%{transform:translate(2.4px,-2px)}62%{transform:translate(-1.8px,2.4px)}}',
    '.ptr{position:absolute;left:-1.5px;top:-1.5px;width:22px;height:26px;overflow:visible;transform-origin:2px 2px;',
    'filter:drop-shadow(0 1px 1px rgba(12,10,30,.22)) drop-shadow(0 5px 9px rgba(12,10,30,.2))}',
    '.stack{position:absolute;left:14px;top:18px;display:flex;flex-direction:column;align-items:flex-start;gap:5px;white-space:nowrap;transition:transform .28s cubic-bezier(.2,.8,.2,1)}',
    '.stack .chip{max-width:min(320px,72vw);overflow:hidden;text-overflow:ellipsis}',
    '.anch{position:absolute;left:0;top:0;width:0;height:0}',
    '.cur.fx-x .stack{left:auto;right:14px;align-items:flex-end}',
    '.cur.fx-y .stack{top:auto;bottom:18px;flex-direction:column-reverse}',
    '.pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 10px 0 8px;border-radius:11px;background:var(--cd);color:#fff;',
    'font-weight:600;font-size:11.5px;letter-spacing:.006em;box-shadow:0 0 0 1px rgba(255,255,255,.5),0 6px 14px -2px rgba(10,10,30,.28),0 1px 2px rgba(10,10,30,.3);transform-origin:0 0}',
    '.pill .pd{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.92);flex:none}',
    '.cur.working .pd{animation:pdp 1s ease-in-out infinite}',
    '@keyframes pdp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}',
    '.nm{max-width:min(210px,46vw);overflow:hidden;text-overflow:ellipsis;display:inline-block}',
    /* terminal pill */
    '.cur.edge .stack{opacity:0;transition:opacity .35s}.cur.edge .ptr{opacity:.5;transition:opacity .35s}.cur .stack,.cur .ptr{transition:opacity .35s}',
    '.term{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 11px 0 9px;border-radius:8px;background:rgba(13,14,20,.9);color:#e9ebf2;',
    'font:500 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 8px 20px -4px rgba(8,8,20,.4);',
    'backdrop-filter:blur(8px)}',
    '.term .st{width:7px;height:7px;border-radius:50%;background:#8b91a1;flex:none;transition:background .2s}',
    '.term.run .st{animation:pdp .9s ease-in-out infinite;background:#e9b44c}',
    '.term.ok .st{background:#3ddc97}.term.bad .st{background:#ff6b7a}',
    '.term .tx{max-width:min(300px,calc(100vw - 64px));overflow:hidden;text-overflow:ellipsis}',
    /* chips */
    '.chip{position:absolute;left:0;top:0;display:inline-flex;align-items:center;gap:8px;height:26px;padding:0 12px 0 10px;border-radius:13px;',
    'background:rgba(15,16,23,.88);backdrop-filter:blur(10px) saturate(1.4);color:#f3f4f8;font-size:12px;font-weight:600;white-space:nowrap;',
    'box-shadow:0 0 0 1px rgba(255,255,255,.1),0 10px 26px -6px rgba(8,8,20,.45),0 1px 2px rgba(0,0,0,.3)}',
    '.stack .chip{position:static}',
    '.chip .sw{width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;box-shadow:0 0 8px var(--c)}',
    '.chip .add{color:#6ee7a8;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}',
    '.chip .del{color:#ff8f9b;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}',
    '.chip .meta{color:rgba(255,255,255,.55);font-weight:500}',
    '.chip.dim{height:22px;background:rgba(22,23,31,.72);color:rgba(255,255,255,.82);font-weight:500;font-size:11.5px;padding:0 10px 0 8px}',
    '.chip.bad{background:rgba(70,16,26,.9)}',
    '.sel{position:absolute;border-radius:4px}',
    '.box{position:absolute}',
    '.rip{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:1.5px solid var(--c)}',
    /* dock */
    '.dock{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:flex-end;max-width:calc(100% - 28px)}',
    '.dock .chip{position:relative}',
    '.dock .chip.ghost{height:36px;padding:0 14px 0 11px;background:rgba(15,16,23,.5);box-shadow:none;border:1.5px dashed var(--c);',
    'animation:ghost 1.8s ease-in-out infinite}',
    '@keyframes ghost{0%,100%{background:rgba(15,16,23,.5)}50%{background:rgba(15,16,23,.72)}}',
    '@media (max-width:640px){.dock{bottom:56px}}',
    /* hud */
    '.hud{position:absolute;left:14px;bottom:14px;display:flex;align-items:center;gap:10px;height:30px;padding:0 14px 0 12px;border-radius:15px;',
    'background:rgba(15,16,23,.8);backdrop-filter:blur(14px) saturate(1.5);color:rgba(255,255,255,.88);font-size:11.5px;font-weight:550;',
    'box-shadow:0 0 0 1px rgba(255,255,255,.09),0 12px 30px -8px rgba(8,8,20,.5);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.hud .cd{width:7px;height:7px;border-radius:50%;background:#7b8091;flex:none}',
    '.hud.live .cd{background:#3ddc97;box-shadow:0 0 0 0 rgba(61,220,151,.5);animation:live 2.4s ease-out infinite}',
    '.hud.conn .cd{background:#e9b44c;animation:pdp 1.1s ease-in-out infinite}',
    '.hud.replay .cd{background:#a99bff}',
    '@keyframes live{0%{box-shadow:0 0 0 0 rgba(61,220,151,.5)}70%,100%{box-shadow:0 0 0 7px rgba(61,220,151,0)}}',
    '.hud .sep{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.28)}',
    '.hud .sws{display:inline-flex}.hud .sws i{width:9px;height:9px;border-radius:50%;margin-left:-3px;box-shadow:0 0 0 1.5px rgba(15,16,23,1)}.hud .sws i:first-child{margin-left:0}',
    '.hud .m{color:rgba(255,255,255,.55);font-weight:500}',
    '@media (prefers-reduced-motion:reduce){.stack{transition:none}.drift,.hud.live .cd,.cur.working .pd,.dock .chip.ghost{animation:none}}'
  ].join('');

  function mount() {
    if (host) return;
    host = doc.createElement('liveswarm-overlay');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;display:block!important;contain:layout style!important;';
    root = host.attachShadow({ mode: 'closed' });
    var st = h('style'); st.textContent = CSS; root.appendChild(st);
    var r = h('div', 'root'); root.appendChild(r);
    L.trail = h('canvas', 'trail'); r.appendChild(L.trail);
    L.teth = svgEl('svg', { 'class': 'teth' }); r.appendChild(L.teth);
    L.dock = h('div', 'dock'); r.appendChild(L.dock);
    L.fx = h('div', 'fxl'); r.appendChild(L.fx);
    L.cur = h('div', 'curs'); r.appendChild(L.cur);
    L.chips = h('div', 'fxl'); r.appendChild(L.chips);
    L.hud = h('div', 'hud'); r.appendChild(L.hud);
    L.hCd = h('span', 'cd'); L.hSt = h('span', '', 'offline'); L.hSep1 = h('span', 'sep');
    L.hSws = h('span', 'sws'); L.hAg = h('span', '', '0 agents'); L.hSep2 = h('span', 'sep');
    L.hEd = h('span', '', '0 edits'); L.hSep3 = h('span', 'sep'); L.hTm = h('span', 'm', '0:00');
    [L.hCd, L.hSt, L.hSep1, L.hSws, L.hAg, L.hSep2, L.hEd, L.hSep3, L.hTm].forEach(function (e) { L.hud.appendChild(e); });
    ctx = L.trail.getContext('2d');
    sizeCanvas();
    (doc.documentElement || doc).appendChild(host);
    /* top layer: position:fixed is then relative to the real viewport even if <html> has a transform/filter */
    try { if (host.showPopover) { host.setAttribute('popover', 'manual'); host.showPopover(); } } catch (e) {}
    win.addEventListener('resize', sizeCanvas, { passive: true });
    doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
    hudRender();
  }
  function sizeCanvas() {
    var v = vp(); canvasDpr = Math.min(win.devicePixelRatio || 1, 2);
    L.trail.width = Math.round(v.w * canvasDpr); L.trail.height = Math.round(v.h * canvasDpr);
    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    S.agents.forEach(function (a) {
      if (a.dead) return;
      var nx = clamp(a.x, 6, Math.max(6, v.w - 10)), ny = clamp(a.y, 6, Math.max(6, v.h - 10));
      if (nx !== a.x || ny !== a.y) { a.x = nx; a.y = ny; if (a.move) { a.move.x = clamp(a.move.x, 6, Math.max(6, v.w - 10)); a.move.y = clamp(a.move.y, 6, Math.max(6, v.h - 10)); } place(a); }
      updateFlip(a);
    });
    declutter();
  }
  /* page scroll: effects anchored to page content follow it */
  function onScroll() {
    if (!host) return;
    var x = win.scrollX || 0, y = win.scrollY || 0;
    [L.fx, L.chips].forEach(function (layer) {
      var kids = layer.children;
      for (var i = kids.length - 1; i >= 0; i--) {
        var w = kids[i]; if (w._sx == null) continue;
        if (!w.firstChild) { w.remove(); continue; }
        w.style.transform = 'translate(' + (w._sx - x) + 'px,' + (w._sy - y) + 'px)';
      }
    });
  }
  function anchored(layer, el) {
    var w = h('div', 'anch'); w._sx = win.scrollX || 0; w._sy = win.scrollY || 0;
    w.appendChild(el); layer.appendChild(w);
    if (layer.childElementCount > 40) { var kids = layer.children; for (var i = kids.length - 1; i >= 0; i--) if (kids[i]._sx != null && !kids[i].firstChild) kids[i].remove(); }
    return el;
  }

  /* -------------------------------------------------------------------- HUD */
  var hudCache = {};
  function setTxt(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
  function hudRender() {
    if (!host) return;
    var rep = !!connState.replay, live = connState.connected && !rep, cls = 'hud ' + (rep ? 'replay' : live ? 'live' : connState.connecting ? 'conn' : '');
    if (hudCache.cls !== cls) { hudCache.cls = cls; L.hud.className = cls; }
    setTxt(L.hSt, 'st', rep ? 'replay' : live ? 'live' : connState.connecting ? 'connecting' : 'offline');
    var n = S.agents.size;
    setTxt(L.hAg, 'ag', n + (n === 1 ? ' agent' : ' agents'));
    setTxt(L.hEd, 'ed', S.edits + (S.edits === 1 ? ' edit' : ' edits'));
    var ids = [];
    S.agents.forEach(function (a) { ids.push(a.id + a.col.base); });
    var key = ids.join('|');
    if (hudCache.sw !== key) {
      hudCache.sw = key; L.hSws.textContent = '';
      var i = 0;
      S.agents.forEach(function (a) { if (i++ < 6) { var d = h('i'); d.style.background = a.col.base; L.hSws.appendChild(d); } });
    }
    L.hSws.style.display = n ? '' : 'none';
    var el = S.t0 ? Math.max(0, Math.floor(((S.tEnd || Date.now()) - S.t0) / 1000)) : 0;
    setTxt(L.hTm, 'tm', Math.floor(el / 60) + ':' + ('0' + (el % 60)).slice(-2));
  }
  function startClock() {
    if (!S.t0) S.t0 = Date.now();
    S.tEnd = 0;
    if (!clockTimer) clockTimer = setInterval(hudRender, 1000);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = 0; } }

  /* ------------------------------------------------------------- DOM settle */
  var mo, LOAD_T = Date.now();
  function observe() {
    if (mo || !win.MutationObserver) return;
    mo = new MutationObserver(function (recs) {
      var t = Date.now(); lastMutGlobal = t; S.lastMut = t;
      var wideObs = untagged();
      for (var i = 0; i < recs.length && S.mut.length < 240; i++) {
        var rc = recs[i], n = rc.target; if (!n) continue;
        /* untagged pages: an insertion is attributed to the inserted elements (the precise change), not to the container they went into */
        if (wideObs && rc.type === 'childList' && rc.addedNodes && rc.addedNodes.length) {
          var pushed = 0;
          for (var j = 0; j < rc.addedNodes.length && pushed < 6; j++) { var an = rc.addedNodes[j]; if (an.nodeType === 1 && an !== host) { S.mut.push({ t: t, el: an }); pushed++; } }
          if (pushed) continue;
        }
        var el = n.nodeType === 1 ? n : n.parentElement; if (el && el !== host) S.mut.push({ t: t, el: el });
      }
      if (S.mut.length > 200) S.mut = S.mut.filter(function (m) { return t - m.t < 5000; });
    });
    mo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  }
  /* A page without source tags gets a wider window: a framework rebuild (Next, Astro, a slow HMR) can land its
     DOM change a second or two after the Post, so wait for the first change before falling back to the dock. */
  var untagged = function () { return !doc.querySelector('[data-swarm],[data-swarm-site]'); };
  function settleWait(t0) {
    var wide = untagged();
    return new Promise(function (res) {
      (function chk() {
        var n = Date.now(), seen = lastMutGlobal >= t0 - 700, last = Math.max(lastMutGlobal, t0), quiet = n - last;
        if (!wide) { if (quiet >= 150 || n - t0 >= 1200) return res(); return setTimeout(chk, clamp(150 - quiet, 20, 150)); }
        if (n - t0 >= (seen ? 2400 : 2200)) return res();
        if (seen && quiet >= 220) return res();
        setTimeout(chk, 40);
      })();
    });
  }

  /* --------------------------------------------------------------- resolver */
  var CFG = function () { return win.__LIVESWARM__ || {}; };
  function tagged(file) {
    var rootDir = String(CFG().root || '').replace(/\/+$/, ''), out = [];
    if (typeof file !== 'string' || !file) return out;
    var els = doc.querySelectorAll('[data-swarm],[data-swarm-site]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      for (var k = 0; k < 2; k++) {
        var v = el.getAttribute(k ? 'data-swarm-site' : 'data-swarm'); if (!v) continue;
        var m = /^(.*):(\d+)(?:-(\d+))?$/.exec(v); if (!m) continue;
        if (file === rootDir + '/' + m[1] || file.slice(-(m[1].length + 1)) === '/' + m[1])
          out.push({ el: el, rel: m[1], s: +m[2], e: +(m[3] || m[2]), attr: v });
      }
    }
    return out;
  }
  /* element rect clipped by overflow ancestors (null if invisible / fully clipped) */
  function visibleRect(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    var L0 = r.left, T0 = r.top, R0 = r.right, B0 = r.bottom, curPos = '', n = 0;
    try {
      curPos = win.getComputedStyle(el).position;
      for (var an = el.parentElement; an && an !== doc.body && an !== doc.documentElement && n < 40; an = an.parentElement, n++) {
        if (curPos === 'fixed') break;
        var cs = win.getComputedStyle(an), ap = cs.position;
        if (curPos === 'absolute' && ap === 'static') continue;
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          var ar = an.getBoundingClientRect();
          if (cs.overflowX !== 'visible') { L0 = Math.max(L0, ar.left); R0 = Math.min(R0, ar.right); }
          if (cs.overflowY !== 'visible') { T0 = Math.max(T0, ar.top); B0 = Math.min(B0, ar.bottom); }
        }
        curPos = ap;
      }
    } catch (e) {}
    if (R0 - L0 < 2 || B0 - T0 < 2) return null;
    return { left: L0, top: T0, right: R0, bottom: B0, width: R0 - L0, height: B0 - T0 };
  }
  function clipVp(r) {
    var v = vp(), x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0), x1 = Math.min(r.right, v.w), y1 = Math.min(r.bottom, v.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  var onScreen = function (c) { var r = c.r || c.clip; return c.clip.w >= Math.min(24, r.width * 0.5) && c.clip.h >= Math.min(14, r.height * 0.5) && c.clip.w >= 2 && c.clip.h >= 2; };
  function annotate(list) {
    var out = [];
    list.forEach(function (c) {
      var r = visibleRect(c.el); if (!r) return;
      c.r = r; c.clip = clipVp(r); c.on = onScreen(c); c.area = r.width * r.height; out.push(c);
    });
    return out;
  }
  function best(list, small) {
    var on = list.filter(function (c) { return c.on; }); if (on.length) list = on;
    return list.slice().sort(function (a, b) { return small ? (a.area - b.area) || ((a.e - a.s) - (b.e - b.s)) : (b.area - a.area); })[0];
  }
  function mutBox(since, wide, young) {
    var v = vp(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0, noisy = null;
    if (wide && !young) { /* elements that were already churning before the edit and keep going after it (clocks, carousels) are not the edit */
      var cnt = new Map(), post = new Set();
      S.mut.forEach(function (m) { if (m.t >= since - 1300 && m.t < since) cnt.set(m.el, (cnt.get(m.el) || 0) + 1); else if (m.t >= since) post.add(m.el); });
      noisy = new Set(); cnt.forEach(function (c, el) { if (c >= 3 && post.has(el)) noisy.add(el); });
    }
    S.mut.forEach(function (m) {
      if (m.t < since || !m.el.isConnected || m.el === doc.documentElement || m.el === doc.body || (noisy && noisy.has(m.el))) return;
      var r = visibleRect(m.el); if (!r || r.width * r.height > (wide ? 0.85 : 0.6) * v.w * v.h) return;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); n++;
    });
    return n ? { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 } : null;
  }
  function resolveLanding(file, range, since, kind) {
    var cands = file ? annotate(tagged(file)) : [], pick = null, res = null;
    if (cands.length && range && kind !== 'write') {
      var ov = cands.filter(function (c) { return c.s <= range[1] && c.e >= range[0]; });
      if (ov.length) { pick = best(ov, true); res = 'tag-range'; }
    }
    if (!pick && cands.length) { pick = best(cands, false); res = 'tag-root'; }
    if (pick) return { resolver: res, el: pick.el, r: pick.r, clip: pick.clip, off: !pick.on, s: pick.s, e: pick.e, key: pick.attr };
    var wide = untagged(), young = wide && since - LOAD_T < 2500, /* initial render churn is not an edit: no look-back, no noise filter */
      bb = mutBox(since - (young ? 0 : wide ? 700 : 300), wide, young);
    if (bb) { var c = { clip: clipVp(bb), r: bb }; return { resolver: 'mutation', r: bb, clip: c.clip, off: !onScreen(c), s: 0, e: 0, key: null }; }
    return { resolver: 'dock', hidden: !!(file && tagged(file).length) };
  }
  function guess(file, isCss) {
    var v = vp();
    if (isCss) { var sb = siblingComponent(file); if (!sb) return { x: v.w * 0.16, y: v.h * 0.32 }; file = sb; }
    if (!file) return null;
    var c = annotate(tagged(file)); if (!c.length) return null;
    var p = best(c, false);
    if (!p.on) return edgePoint(p.r);
    return { x: p.clip.x + p.clip.w * 0.5, y: p.clip.y + Math.min(p.clip.h * 0.4, 80) };
  }
  function edgePoint(r) {
    var v = vp(), m = 22, tx = r.left + r.width / 2, ty = r.top + r.height / 2, cx = v.w / 2, cy = v.h / 2;
    var dx = tx - cx, dy = ty - cy, s = Math.min(dx ? (cx - m) / Math.abs(dx) : 1e9, dy ? (cy - m) / Math.abs(dy) : 1e9);
    if (!isFinite(s) || s > 1) s = 1;
    var x = clamp(cx + dx * s, m, v.w - m), y = clamp(cy + dy * s, m, v.h - m);
    var side = Math.abs(dy) * v.w > Math.abs(dx) * v.h ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');
    return { x: x, y: y, side: side };
  }

  /* ----------------------------------------------------------------- agents */
  var POINTER = 'M0 0 L0 17.2 L4.5 13.1 L7.5 19.9 L10.4 18.6 L7.4 11.9 L13.6 11.7 Z';
  function buildCursor(a) {
    var c = h('div', 'cur'); c.style.setProperty('--c', a.col.base); c.style.setProperty('--cd', a.col.deep);
    var fx0 = h('div', 'fx0'), dr = h('div', 'drift');
    dr.style.setProperty('--dd', (6 + (a.idx % 5) * 0.9).toFixed(1) + 's'); dr.style.setProperty('--dl', (-a.idx * 1.7).toFixed(1) + 's');
    var svg = svgEl('svg', { 'class': 'ptr', viewBox: '0 0 14 20' });
    var p = svgEl('path', { d: POINTER, fill: a.col.base, stroke: '#fff', 'stroke-width': '1.6', 'stroke-linejoin': 'round' });
    svg.appendChild(p);
    var stack = h('div', 'stack'), pill = h('div', 'pill'), pd = h('i', 'pd'), nm = h('span', 'nm', a.label);
    pill.appendChild(pd); pill.appendChild(nm); stack.appendChild(pill);
    dr.appendChild(svg); dr.appendChild(stack); fx0.appendChild(dr); c.appendChild(fx0);
    a.cur = c; a.fx0 = fx0; a.ptr = svg; a.pill = pill; a.nm = nm; a.stack = stack;
    L.cur.appendChild(c); place(a);
    a.pillW = pill.offsetWidth; a.stackH = stack.offsetHeight || 22;
  }
  /* re-measure the label stack (pill + terminal/glance chips) so edge-flip and declutter know its real size */
  function measure(a) {
    if (a.dead) return;
    a.pillW = a.stack.offsetWidth || a.pillW; a.stackH = a.stack.offsetHeight || a.stackH;
    updateFlip(a); declutter();
  }
  /* keep the labels of crowded agents from sitting on top of each other (vertical nudge only) */
  var declutterAt = 0, declutterTm = 0;
  function declutter() {
    var n = now();
    if (n - declutterAt < 60) { if (!declutterTm) declutterTm = setTimeout(function () { declutterTm = 0; declutter(); }, 80); return; }
    declutterAt = n;
    if (!host) { S.agents.forEach(function (a) { if (a.dy || a.dx) { a.dy = 0; a.dx = 0; a.stack.style.transform = ''; } }); return; }
    var v = vp(), placed = [], list = [];
    S.agents.forEach(function (a) { if (!a.dead) list.push(a); });
    list.sort(function (p, q) { return p.idx - q.idx; });
    list.forEach(function (a) {
      var w = a.pillW || 120, hh = a.stackH || 22, x0 = a.fxX ? a.x - 14 - w : a.x + 14, y0 = a.fxY ? a.y - 18 - hh : a.y + 18;
      var cx = clamp(x0, 4, Math.max(4, v.w - w - 4)), dx = cx - x0; x0 = cx;
      var step = hh + 4, best = 0, ok = false;
      for (var i = 0; i < 49 && !ok; i++) {
        var dy = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step, yy = y0 + dy;
        if (yy < 4 || yy + hh > v.h - 4) continue;
        var hit = placed.some(function (q) { return x0 < q.x + q.w + 4 && x0 + w + 4 > q.x && yy < q.y + q.h + 2 && yy + hh + 2 > q.y; });
        if (!hit) { best = dy; ok = true; }
      }
      placed.push({ x: x0, y: y0 + best, w: w, h: hh });
      dx = Math.round(dx);
      if (best !== (a.dy || 0) || dx !== (a.dx || 0)) { a.dy = best; a.dx = dx; a.stack.style.transform = best || dx ? 'translate(' + dx + 'px,' + best + 'px)' : ''; }
    });
  }
  function place(a) {
    a.cur.style.transform = 'translate3d(' + a.x.toFixed(2) + 'px,' + a.y.toFixed(2) + 'px,0)';
    /* a cursor parked at the viewport edge (working off screen) stays quiet: faint pointer, no label,
       so many off-screen agents never pile their name pills along one edge */
    var w = win.innerWidth, hh = win.innerHeight, e = a.id !== 'main' && (a.y < 30 || a.y > hh - 30 || a.x < 26 || a.x > w - 26);
    if (e !== !!a.atEdge) { a.atEdge = e; a.cur.classList.toggle('edge', e); }
  }
  function updateFlip(a) {
    var v = vp(), w = a.pillW || 120, ro = a.x + 14 + w + 10 > v.w, lo = a.x - 14 - w - 10 < 0, fx = ro && (!lo || a.x > v.w / 2), fy = a.y > v.h - Math.max(104, (a.stackH || 22) + 30);
    if (fx !== a.fxX) { a.fxX = fx; a.cur.classList.toggle('fx-x', fx); }
    if (fy !== a.fxY) { a.fxY = fy; a.cur.classList.toggle('fx-y', fy); }
  }
  function setLabel(a, label, animate) {
    if (!label || label === a.label) return;
    a.label = label; a.nm.textContent = label; measure(a);
    if (animate && !RM()) {
      play(a.nm, [{ opacity: 0, transform: 'translateY(4px)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      play(a.pill, [{ transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    }
    hudRender();
  }
  function restPos(p, i) {
    var v = vp(), ang = (-68 + i * 52) * Math.PI / 180, d = 130 + (i % 2) * 34;
    return { x: clamp(p.x + Math.cos(ang) * d, 28, v.w - 28), y: clamp(p.y + Math.sin(ang) * d, 28, v.h - 90) };
  }
  function ensureAgent(info, spawn) {
    info = info || { id: 'main', type: 'main', label: 'main', parent: null };
    var id = info.id != null && info.id !== '' ? String(info.id) : 'main', a = S.agents.get(id);
    if (info.id !== id) info = Object.assign({}, info, { id: id });
    if (a) return a;
    var tb = S.tomb.get(id); if (tb && Date.now() - tb < 60000) return null;
    mount();
    var parent = null;
    if (info.parent && info.parent !== id) parent = S.agents.get(info.parent) || ensureAgent({ id: info.parent, type: info.parent === 'main' ? 'main' : 'agent', label: info.parent, parent: null }, false);
    var v = vp(), idx = id === 'main' ? 0 : (info.idx > 0 ? (S.colorIdx = Math.max(S.colorIdx, info.idx | 0), info.idx | 0) : (S.colorIdx = Math.max(S.colorIdx, 0) + 1));
    if (id === 'main') S.colorIdx = Math.max(S.colorIdx, 0);
    a = { id: id, type: info.type || id, label: info.label || info.type || id, parent: parent ? parent.id : (info.parent || null), idx: idx,
      col: makeColor(idx), x: v.w * 0.5, y: v.h * 0.3, move: null, queue: [], parked: [], waiting: false, dy: 0, running: false, trail: [], dead: false, kids: 0, bend: idx % 2 ? 1 : -1 };
    S.agents.set(id, a);
    buildCursor(a);
    if (parent && spawn !== false) { a.x = parent.x; a.y = parent.y; place(a); a.queue.push({ kind: 'split', parent: parent }); }
    else {
      if (parent) { var rp = restPos(parent, parent.kids++); a.x = rp.x; a.y = rp.y; }
      else if (id !== 'main') { var k = S.agents.size; a.x = v.w * (0.3 + 0.14 * (k % 4)); a.y = v.h * (0.34 + 0.1 * (k % 3)); }
      if (isFinite(info.x) && isFinite(info.y) && info.x !== null && info.y !== null) { a.x = clamp(+info.x, 6, Math.max(6, v.w - 10)); a.y = clamp(+info.y, 6, Math.max(6, v.h - 10)); }
      place(a); a.queue.push({ kind: 'appear' });
    }
    updateFlip(a); declutter(); hudRender(); pump(a);
    return a;
  }

  /* --------------------------------------------------------------- movement */
  var easeIO = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeO = function (t) { return 1 - Math.pow(1 - t, 3); };
  function ensureLoop() { if (!raf) raf = requestAnimationFrame(tick); }
  function moveTo(a, x, y, o) {
    o = o || {};
    if (a.move) { var old = a.move; a.move = null; old.res(); }
    var sx = a.x, sy = a.y, dx = x - sx, dy = y - sy, dist = Math.hypot(dx, dy);
    if (dist < 1.5) { a.x = x; a.y = y; place(a); return Promise.resolve(); }
    var rm = RM(), f = o.f || 1;
    var dur = o.dur != null ? o.dur : (rm ? 170 : clamp(280 + dist * 0.5, 320, 820) / f);
    var k = (rm || o.straight) ? 0 : Math.min(dist * 0.2, 110) * a.bend * (dist < 60 ? 0.3 : 1);
    var cx = (sx + x) / 2 + (-dy / dist) * k, cy = (sy + y) / 2 + (dx / dist) * k;
    var ease = o.ease === 'out' ? easeO : easeIO;
    return new Promise(function (res) {
      a.move = { sx: sx, sy: sy, cx: cx, cy: cy, x: x, y: y, t0: now(), dur: Math.max(60, dur), ease: ease, res: res };
      ensureLoop();
    });
  }
  var TL = 440;
  function tick(n) {
    raf = 0; var act = false, movedAny = false;
    S.agents.forEach(function (a) {
      var m = a.move; if (!m) return;
      act = true;
      var t = Math.min(1, (n - m.t0) / m.dur), e = m.ease(t), u = 1 - e;
      a.x = u * u * m.sx + 2 * u * e * m.cx + e * e * m.x; a.y = u * u * m.sy + 2 * u * e * m.cy + e * e * m.y;
      place(a); updateFlip(a); movedAny = true;
      if (!RM()) a.trail.push({ x: a.x, y: a.y, t: n });
      if (t >= 1) { a.move = null; m.res(); }
    });
    if (movedAny) declutter();
    if (S.tethers.length) { act = true; updateTethers(Date.now()); }
    var tr = drawTrails(n);
    if (act || tr) raf = requestAnimationFrame(tick);
  }
  var trailDirty = false;
  function drawTrails(n) {
    var any = false, v = vp();
    if (trailDirty) ctx.clearRect(0, 0, v.w, v.h);
    S.agents.forEach(function (a) {
      var tr = a.trail; while (tr.length && n - tr[0].t > TL) tr.shift();
      if (!tr.length) return;
      any = true;
      if (tr.length < 2) return;
      ctx.lineCap = 'butt';
      for (var i = 1; i < tr.length; i++) {
        var q = tr[i], p = tr[i - 1], k = 1 - (n - q.t) / TL; if (k <= 0) continue;
        ctx.strokeStyle = rgba(a.col.rgb, (0.5 * k * k).toFixed(3)); ctx.lineWidth = 0.6 + 3.4 * k * k;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    });
    trailDirty = any;
    return any;
  }
  function addTether(from, to, dur, col) {
    var p = svgEl('path', { fill: 'none', stroke: col.base, 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-dasharray': '1 5' });
    L.teth.appendChild(p);
    S.tethers.push({ p: p, from: from, to: to, t0: Date.now(), dur: dur });
    ensureLoop();
  }
  function updateTethers(t) {
    S.tethers = S.tethers.filter(function (th) {
      var k = (t - th.t0) / th.dur;
      if (k >= 1 || th.from.dead || th.to.dead) { th.p.remove(); return false; }
      var x1 = th.from.x, y1 = th.from.y, x2 = th.to.x, y2 = th.to.y, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, bend = Math.min(d * 0.18, 40);
      th.p.setAttribute('d', 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + (mx - dy / d * bend).toFixed(1) + ' ' + (my + dx / d * bend).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1));
      th.p.setAttribute('stroke-opacity', (0.75 * (1 - k) * Math.min(1, k * 8)).toFixed(3));
      return true;
    });
  }

  /* ---------------------------------------------------------- effect helpers */
  function fxAdd(el, fixed) {
    if (fixed) L.fx.appendChild(el); else anchored(L.fx, el);
    while (L.fx.childElementCount > 70) L.fx.firstElementChild.remove();
    return el;
  }
  function ripple(x, y, col, big) {
    if (RM()) return;
    var r = h('div', 'rip'); r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.setProperty('--c', col.base);
    fxAdd(r);
    play(r, [{ transform: 'scale(.25)', opacity: 0.85 }, { transform: 'scale(' + (big ? 1.7 : 1) + ')', opacity: 0 }], { duration: big ? 780 : 520, easing: 'cubic-bezier(.2,.7,.3,1)' }).then(function () { r.remove(); });
  }
  function press(a) {
    if (RM()) return;
    play(a.ptr, [{ transform: 'scale(1)' }, { transform: 'scale(.82)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }
  function chipEl(o) {
    var c = h('div', 'chip' + (o.cls ? ' ' + o.cls : ''));
    c.style.setProperty('--c', o.col.base);
    if (!o.noDot) c.appendChild(h('i', 'sw'));
    if (o.arrow) c.appendChild(h('span', 'meta', o.arrow));
    if (o.add != null) c.appendChild(h('span', 'add', '+' + o.add));
    if (o.del != null) c.appendChild(h('span', 'del', '−' + o.del));
    if (o.name) c.appendChild(h('span', '', o.name));
    if (o.meta) c.appendChild(h('span', 'meta', o.meta));
    return c;
  }
  /* pop a chip anchored above (or below) a rect; lives `life` ms */
  function popChip(o, anchor, life, below) {
    var c = anchored(L.chips, chipEl(o)), v = vp(), w = c.offsetWidth;
    var x = clamp(anchor.x, 8, Math.max(8, v.w - w - 8));
    var y = below || anchor.y - 34 < 8 ? anchor.y + anchor.h + 8 : anchor.y - 34;
    y = clamp(y, 8, v.h - 34);
    c.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    var inn = RM() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate(' + x + 'px,' + (y + 7) + 'px) scale(.94)' }, { opacity: 1, transform: 'translate(' + x + 'px,' + y + 'px) scale(1)' }];
    play(c, inn, { duration: D(260), easing: 'cubic-bezier(.2,.9,.3,1.15)' }).then(function () {
      return sleep(life);
    }).then(function () {
      return play(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in' });
    }).then(function () { c.remove(); });
    c.style.opacity = 0; setTimeout(function () { c.style.opacity = ''; }, 0);
    return c;
  }
  function fadeRm(el, delay, dur) {
    sleep(delay).then(function () { return play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dur || 400, easing: 'ease-in' }); }).then(function () { el.remove(); });
  }

  /* ---------------------------------------------------------------- pacing */
  var MAXQ = 8;
  var waitsPost = function (k) { return k === 'edit' || k === 'write' || k === 'css'; };
  var readyBeat = function (x) { return !waitsPost(x.kind) || !!x.post; };
  function foldInto(t, x) {
    t.added += x.added; t.removed += x.removed; t.count += x.count; x.done = true;
    if (x.range) t.range = t.range ? [Math.min(t.range[0], x.range[0]), Math.max(t.range[1], x.range[1])] : x.range;
  }
  /* bound the display lag: merge, then drop, old finished beats once the queue is long */
  function compact(a) {
    var q = a.queue, b = q[0];
    if (!b) return;
    if (q.length >= 4 && !b.running && isEditKind(b.kind) && b.post && b.post.kind === 'tool.post') {
      while (q.length > 1) {
        var nx = q[1];
        if (nx.kind === b.kind && nx.file === b.file && nx.post && nx.post.kind === 'tool.post') { foldInto(b, nx); q.splice(1, 1); } else break;
      }
    }
    if (q.length <= MAXQ) return;
    var seen = {}, i, x, k;
    for (i = 0; i < q.length; i++) {
      x = q[i];
      if (!isEditKind(x.kind) || !x.post || x.post.kind !== 'tool.post' || x.running) continue;
      k = x.kind + '|' + (x.file || x.summary);
      if (!seen[k]) { seen[k] = x; continue; }
      foldInto(seen[k], x); q.splice(i--, 1);
    }
    for (i = 0; q.length > MAXQ && i < q.length;) {
      x = q[i];
      if ((x.kind === 'glance' || (x.post && (isEditKind(x.kind) || x.kind === 'bash'))) && !x.running) { x.done = true; q.splice(i, 1); S.dropped++; } else i++;
    }
  }
  function setWorking(a) { if (!a.dead) a.cur.classList.toggle('working', a.waiting || a.parked.length > 0); }
  function pump(a) {
    if (a.running) return;
    a.running = true;
    (async function () {
      try {
        while (a.queue.length && !a.dead) {
          compact(a);
          var b = a.queue[0];
          /* a call whose Post has not arrived must not block finished work behind it: park it */
          if (waitsPost(b.kind) && !b.post && a.queue.some(function (x) { return x !== b && readyBeat(x); })) { parkBeat(a, b); a.queue.shift(); continue; }
          var f = a.queue.length <= 5 ? 1 : Math.min(4, 1 + (a.queue.length - 5) * 0.65);
          b.running = true;
          try { await runBeat(a, b, f); } catch (e) { S.errors.push(String(e && e.stack || e)); }
          b.running = false;
          if (!b.parked) b.done = true;
          var ix = a.queue.indexOf(b); if (ix >= 0) a.queue.splice(ix, 1);
        }
      } finally { a.running = false; }
    })();
  }
  function parkBeat(a, b) {
    b.parked = true; a.parked.push(b);
    while (a.parked.length > 30) { var o = a.parked.shift(); o.parked = false; o.done = true; }
    setWorking(a);
  }
  var isEditKind = function (k) { return k === 'edit' || k === 'write' || k === 'css'; };
  async function runBeat(a, b, f) {
    switch (b.kind) {
      case 'appear': return doAppear(a);
      case 'split': return doSplit(a, b);
      case 'merge': return doMerge(a, f);
      case 'bash': return doBash(a, b, f);
      case 'glance': return doGlance(a, b, f);
      default: return doEdit(a, b, f);
    }
  }
  function waitPost(b, ms) {
    return new Promise(function (res) {
      if (b.post) return res();
      var tm = setTimeout(function () { b.wake = null; res(); }, ms);
      b.wake = function () { clearTimeout(tm); b.wake = null; res(); };
    });
  }

  /* ---------------------------------------------------------- lifecycle beats */
  async function doAppear(a) {
    a.fx0.style.opacity = 1;
    if (!RM()) { play(a.fx0, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' }); ripple(a.x, a.y, a.col, true); }
    await sleep(D(260));
  }
  async function doSplit(a, b) {
    var p = b.parent; a.x = p.x; a.y = p.y; place(a);
    var rp = restPos(p, p.kids++);
    a.fx0.style.opacity = 1;
    if (!RM()) { play(a.fx0, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.15)' }); ripple(p.x, p.y, a.col, false); }
    if (!RM()) addTether(p, a, 1000, a.col);
    await moveTo(a, rp.x, rp.y, { dur: D(760) });
    press(a);
  }
  async function doMerge(a, f) {
    var p = a.parent && S.agents.get(a.parent);
    if (p && !p.dead) {
      if (!RM()) addTether(a, p, 800, a.col);
      await moveTo(a, p.x, p.y, { dur: D(640) / f });
    }
    if (!RM()) { play(a.fx0, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.35)' }], { duration: 300, easing: 'ease-in' }); if (p) { ripple(a.x, a.y, a.col, false); } }
    else play(a.fx0, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
    await sleep(D(300));
    a.dead = true; a.cur.remove(); S.agents.delete(a.id); S.tomb.set(a.id, Date.now());
    hudRender();
  }

  /* ------------------------------------------------------------------ edits */
  function failFx(a, b) {
    var col = { base: '#ff6b7a' };
    ripple(a.x, a.y, col, false);
    var c = chipEl({ col: col, name: base(b.file || ''), meta: b.tool + ' failed', cls: 'bad dim' });
    c.style.position = 'static'; a.stack.appendChild(c); measure(a);
    play(c, [{ opacity: 0, transform: 'translateX(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
    if (!RM()) play(a.ptr, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 320 });
    return sleep(D(700)).then(function () { return play(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }); }).then(function () { c.remove(); measure(a); });
  }
  function bandOf(rect, kind, s, e, range) {
    var w = Math.min(rect.w, 520), x = rect.x, y = rect.y, hh = rect.h;
    if (rect.h > 70 && kind !== 'write') {
      var span = Math.max(1, e - s + 1), a0 = range ? clamp((range[0] - s) / span, 0, 1) : 0, a1 = range ? clamp((range[1] - s + 1) / span, 0, 1) : 0.2;
      hh = clamp((a1 - a0) * rect.h, 24, Math.min(rect.h, 120)); y = rect.y + clamp(a0 * rect.h, 0, rect.h - hh);
    }
    return { x: x, y: y, w: w, h: hh };
  }
  async function doEdit(a, b, f) {
    var epochAt = epoch, cdisp = a.cur;
    if (!b.post) {
      a.waiting = true; setWorking(a);
      if (!b.guessed) { b.guessed = true; var g = guess(b.file, b.kind === 'css'); if (g) moveTo(a, g.x, g.y, { f: f }); }
      await waitPost(b, 600000); /* woken by the Post, by finished work queued behind us, or by reset */
      a.waiting = false;
      if (a.dead || epochAt !== epoch) { setWorking(a); return; }
      if (!b.post) { parkBeat(a, b); return; }
    }
    setWorking(a);
    if (b.post.kind === 'tool.fail') return failFx(a, b);
    var wasMoving = !!a.move;
    await settleWait(b.postAt);
    if (a.dead || epochAt !== epoch) return;
    var rec = { t: Date.now(), agent: a.id, label: a.label, tool: b.tool, file: b.file, kind: b.kind, range: b.range, added: b.added, removed: b.removed,
      merged: b.count, resolver: null, offscreen: false, elKey: null, rect: null, band: null, cursor: null, edge: null };
    var ml = b.count > 1 ? '×' + b.count : null;
    var name = base(b.file || b.summary || '');
    if (b.kind === 'css') {
      /* A stylesheet has no element of its own; land on the component it sits next to
         (Rooms.css or Rooms.module.css -> Rooms.jsx) and keep the paint inside that section. */
      var sib = siblingComponent(b.file), SL = sib ? resolveLanding(sib, null, b.postAt, 'write') : null;
      if (SL && SL.resolver !== 'dock' && SL.off) { rec.resolver = 'paint-edge'; await verbEdge(a, b, f, SL, rec, ml, name); }
      else if (SL && SL.resolver !== 'dock') {
        rec.resolver = 'paint-section'; rec.elKey = SL.key;
        var pc = SL.clip; rec.rect = { x: pc.x, y: pc.y, w: pc.w, h: pc.h };
        await verbPaint(a, b, f, ml, name, pc);
      } else if (untagged()) {
        /* no tags and nothing visibly changed (a stylesheet swap): do not guess a section, say it on the dock */
        rec.resolver = 'dock'; b.hidden = false; await verbDock(a, b, f, rec, ml, name);
      } else {
        rec.resolver = 'paint'; var v = vp(); rec.rect = { x: 0, y: 0, w: v.w, h: v.h };
        await verbPaint(a, b, f, ml, name, null);
      }
    } else {
      var Ld = resolveLanding(b.file, b.range, b.postAt, b.kind);
      rec.resolver = Ld.resolver;
      if (Ld.resolver === 'dock') { b.hidden = !!Ld.hidden; await verbDock(a, b, f, rec, ml, name); }
      else if (Ld.off) await verbEdge(a, b, f, Ld, rec, ml, name);
      else {
        var rc = Ld.clip; rec.rect = { x: rc.x, y: rc.y, w: rc.w, h: rc.h }; rec.elKey = Ld.key;
        if (b.kind === 'write') await verbBloom(a, b, f, rc, ml, name);
        else {
          /* a mutation box has no line mapping: sweep the top of what changed instead of a bogus line band */
          rec.band = Ld.resolver === 'mutation' ? { x: rc.x, y: rc.y, w: Math.min(rc.w, 520), h: Math.min(rc.h, 150) } : bandOf(rc, b.kind, Ld.s, Ld.e, b.range);
          await verbSweep(a, b, f, rc, rec.band, wasMoving, ml, name);
        }
      }
    }
    if (a.dead || epochAt !== epoch) return;
    rec.cursor = { x: a.x, y: a.y };
    S.landings.push(rec);
  }
  async function verbSweep(a, b, f, rc, band, cont, ml, name) {
    var sx = band.x + Math.min(10, band.w * 0.2), sy = band.y + band.h / 2;
    await moveTo(a, sx, sy, { f: f, ease: cont ? 'out' : 'io' });
    press(a); ripple(sx, sy, a.col, false);
    var col = a.col;
    var ctxBox = null;
    if (band.h < rc.h - 4 || band.w < rc.w - 4) {
      ctxBox = fxAdd(h('div', 'box'));
      var cs = ctxBox.style; cs.left = rc.x + 'px'; cs.top = rc.y + 'px'; cs.width = rc.w + 'px'; cs.height = rc.h + 'px';
      cs.border = '1px dashed ' + rgba(col.rgb, 0.45); cs.borderRadius = '8px';
      play(ctxBox, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      fadeRm(ctxBox, 1250 / f, 350);
    }
    var sel = fxAdd(h('div', 'sel')), st = sel.style;
    st.left = band.x + 'px'; st.top = band.y + 'px'; st.width = band.w + 'px'; st.height = band.h + 'px';
    st.background = rgba(col.rgb, 0.2); st.boxShadow = 'inset 0 0 0 1px ' + rgba(col.rgb, 0.6) + ', 0 0 24px ' + rgba(col.rgb, 0.22);
    var dur = D(400) / Math.min(f, 2.5), ex = band.x + band.w - Math.min(12, band.w * 0.15), ey = sy + (band.h > 40 ? band.h * 0.18 : 0);
    var kf = RM() ? [{ opacity: 0 }, { opacity: 1 }] : [{ clipPath: 'inset(0 100% 0 0 round 4px)' }, { clipPath: 'inset(0 0% 0 0 round 4px)' }];
    await Promise.all([moveTo(a, ex, ey, { dur: dur, ease: 'out', straight: true }), play(sel, kf, { duration: dur, easing: 'cubic-bezier(.33,1,.68,1)' })]);
    var add = b.added, del = b.removed;
    popChip({ col: col, add: add, del: del, name: name, meta: ml }, band, 1300 / Math.min(f, 2.2));
    fadeRm(sel, 900 / f, 450);
    await sleep(D(150) / f);
  }
  async function verbBloom(a, b, f, rc, ml, name) {
    var tx = rc.x + rc.w * 0.5, ty = rc.y + Math.min(rc.h * 0.5, 60);
    await moveTo(a, tx, ty, { f: f });
    press(a);
    var col = a.col, bx = fxAdd(h('div', 'box')), s = bx.style;
    s.left = rc.x + 'px'; s.top = rc.y + 'px'; s.width = rc.w + 'px'; s.height = rc.h + 'px'; s.borderRadius = '10px';
    s.border = '1.5px solid ' + rgba(col.rgb, 0.9); s.background = rgba(col.rgb, 0.06); s.boxShadow = '0 0 0 5px ' + rgba(col.rgb, 0.14) + ', 0 14px 44px ' + rgba(col.rgb, 0.3);
    var life = 1200 / Math.min(f, 2.5);
    play(bx, RM() ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }] : [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 1, offset: 0.65 }, { opacity: 0, transform: 'scale(1.006)' }], { duration: life, easing: 'cubic-bezier(.2,.8,.2,1)' }).then(function () { bx.remove(); });
    if (!RM()) {
      var ring = fxAdd(h('div', 'box')), rs = ring.style;
      rs.left = rc.x + 'px'; rs.top = rc.y + 'px'; rs.width = rc.w + 'px'; rs.height = rc.h + 'px'; rs.borderRadius = '10px'; rs.border = '2px solid ' + rgba(col.rgb, 0.7);
      play(ring, [{ opacity: 0.8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(' + (1 + Math.min(0.1, 60 / Math.max(rc.w, 1))) + ')' }], { duration: life * 0.8, easing: 'cubic-bezier(.2,.7,.3,1)' }).then(function () { ring.remove(); });
    }
    popChip({ col: col, add: b.added || null, name: name, meta: (b.added ? '' : 'wrote ') + (ml || '') }, rc, 1100 / Math.min(f, 2.2));
    await sleep(D(520) / f);
  }
  /* Rooms.css, Rooms.module.scss ... -> the component file next to it that has tags on the page */
  function siblingComponent(file) {
    if (typeof file !== 'string') return null;
    var stem = file.replace(/(\.module)?\.(css|scss|sass|less|styl|pcss)$/i, '');
    if (stem === file) return null;
    var exts = ['.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte'];
    for (var i = 0; i < exts.length; i++) if (tagged(stem + exts[i]).length) return stem + exts[i];
    return null;
  }
  async function verbPaint(a, b, f, ml, name, rc) {
    /* rc: the section the stylesheet belongs to (paint stays inside it); null: a faint full-view pass */
    var v = vp(), col = a.col, box = rc || { x: 0, y: 0, w: v.w, h: v.h }, strong = !!rc && (rc.w * rc.h) < 0.4 * v.w * v.h;
    var x0 = box.x + box.w * 0.12, y0 = box.y + Math.min(box.h * 0.3, 140), x1 = box.x + box.w * 0.84, y1 = box.y + Math.min(box.h * 0.55, 260);
    await moveTo(a, x0, y0, { f: f });
    press(a);
    var dur = D(900) / Math.min(f, 2.5);
    var clip = fxAdd(h('div', 'box'), true), cs = clip.style;
    cs.cssText = 'position:absolute;overflow:hidden;border-radius:10px;left:' + box.x + 'px;top:' + box.y + 'px;width:' + box.w + 'px;height:' + box.h + 'px';
    var tint = h('div', 'box'); tint.style.cssText = 'position:absolute;inset:0;background:' + rgba(col.rgb, strong ? 0.06 : 0.025);
    clip.appendChild(tint);
    play(tint, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: dur * 1.7 });
    if (!RM()) {
      var band = h('div', 'box'), bs = band.style, k = strong ? 1 : 0.4;
      bs.cssText = 'position:absolute;left:0;top:-10%;width:44%;height:120%';
      bs.background = 'linear-gradient(100deg,transparent 0%,' + rgba(col.rgb, 0.0) + ' 8%,' + rgba(col.rgb, 0.16 * k) + ' 55%,' + rgba(col.rgb, 0.22 * k) + ' 62%,transparent 100%)';
      clip.appendChild(band);
      play(band, [{ transform: 'translateX(-70%) skewX(-12deg)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { transform: 'translateX(' + (100 / 0.44 + 5) + '%) skewX(-12deg)', opacity: 0 }], { duration: dur * 1.15, easing: 'cubic-bezier(.45,.05,.3,1)' });
    }
    setTimeout(function () { clip.remove(); }, dur * 1.8 + 50);
    await moveTo(a, x1, y1, { dur: dur, ease: 'io' });
    popChip({ col: col, add: b.added, del: b.removed, name: name, meta: ml || 'styles' }, { x: x1 - 40, y: y1 - 10, w: 60, h: 20 }, 1200 / Math.min(f, 2.2));
    await sleep(D(120) / f);
  }
  async function verbEdge(a, b, f, Ld, rec, ml, name) {
    var ep = edgePoint(Ld.r); rec.offscreen = true; rec.edge = ep.side; rec.rect = { x: Ld.clip.x, y: Ld.clip.y, w: Ld.clip.w, h: Ld.clip.h }; rec.elKey = Ld.key;
    await moveTo(a, ep.x, ep.y, { f: f });
    press(a); ripple(ep.x, ep.y, a.col, true);
    var col = a.col, v = vp(), g = fxAdd(h('div', 'box'), true), gs = g.style, hz = ep.side === 'left' || ep.side === 'right';
    var gx = ep.side === 'left' ? 0 : ep.side === 'right' ? v.w - 120 : ep.x - 120, gy = ep.side === 'up' ? 0 : ep.side === 'down' ? v.h - 120 : ep.y - 120;
    gs.left = gx + 'px'; gs.top = gy + 'px'; gs.width = (hz ? 120 : 240) + 'px'; gs.height = (hz ? 240 : 120) + 'px';
    var at = { left: 'to right', right: 'to left', up: 'to bottom', down: 'to top' }[ep.side];
    gs.background = 'radial-gradient(closest-side,' + rgba(col.rgb, 0.35) + ',transparent)';
    gs.transform = 'translate(' + (ep.side === 'left' ? '-45%' : ep.side === 'right' ? '45%' : '0') + ',' + (ep.side === 'up' ? '-45%' : ep.side === 'down' ? '45%' : '0') + ')';
    play(g, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 1500 / Math.min(f, 2.5) }).then(function () { g.remove(); });
    var arrow = { up: '↑', down: '↓', left: '←', right: '→' }[ep.side];
    var anchor = { x: ep.x + (a.fxX ? -150 : 14), y: ep.y + (a.fxY ? -43 : 28), w: 10, h: 10 };
    popChip({ col: col, arrow: arrow, add: b.kind === 'write' ? (b.added || null) : b.added, del: b.kind === 'write' ? null : b.removed, name: name, meta: ml || 'off-screen' }, anchor, 1500 / Math.min(f, 2.2), !a.fxY);
    await sleep(D(260) / f);
  }
  function dockChip(file, a, b) {
    var key = file || b.summary || 'file', d = S.dock.get(key), ghost = b.kind === 'write';
    if (!d) {
      var el = chipEl({ col: a.col, name: base(key), add: ghost ? null : b.added, del: ghost ? null : b.removed, meta: ghost ? (b.hidden ? 'new · hidden' : 'new · not mounted') : (b.hidden ? 'mounted · hidden' : null), cls: ghost ? 'ghost' : '' });
      if (!ghost) { el.firstChild.style.background = a.col.base; }
      L.dock.appendChild(el);
      d = { el: el, tm: 0 }; S.dock.set(key, d);
      while (S.dock.size > 4) { var k0 = S.dock.keys().next().value, o = S.dock.get(k0); o.el.remove(); clearTimeout(o.tm); S.dock.delete(k0); }
    }
    clearTimeout(d.tm);
    d.tm = setTimeout(function () {
      play(d.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).then(function () { d.el.remove(); S.dock.delete(key); });
    }, 7500);
    return d.el;
  }
  async function verbDock(a, b, f, rec, ml, name) {
    var el = dockChip(b.file, a, b), r0 = el.getBoundingClientRect();
    play(el, RM() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(12px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: D(380), easing: 'cubic-bezier(.2,.9,.3,1.15)' });
    var tx = r0.left + Math.min(14, r0.width * 0.1), ty = r0.top + r0.height / 2; /* point at the swatch end so the label stays readable */
    await moveTo(a, tx, ty, { f: f });
    press(a); ripple(tx, ty, a.col, false);
    var r1 = el.getBoundingClientRect(); rec.rect = { x: r1.left, y: r1.top, w: r1.width, h: r1.height };
    await sleep(D(420) / f);
  }

  /* ------------------------------------------------------------------- bash */
  async function doBash(a, b, f) {
    var ev = b.pre || b.post, cmd = (ev && ev.summary) || '$ …';
    if (cmd.charAt(0) !== '$') cmd = '$ ' + cmd;
    var t = h('div', 'term run'); t.appendChild(h('i', 'st')); t.appendChild(h('span', 'tx', cmd));
    a.stack.appendChild(t); measure(a);
    play(t, RM() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-4px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: D(240), easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    if (!b.post) {
      /* long-running command: the pill keeps spinning, but the queue is not held */
      b.detached = true;
      finishBash(a, b, t, f, cmd).catch(function (e) { S.errors.push(String(e && e.stack || e)); });
      await sleep(D(240));
      return;
    }
    await finishBash(a, b, t, f, cmd);
  }
  async function finishBash(a, b, t, f, cmd) {
    var epochAt = epoch;
    if (!b.post) await waitPost(b, 120000);
    if (!b.post || a.dead || epochAt !== epoch) { t.remove(); measure(a); return; }
    var bad = b.post.kind === 'tool.fail' || b.post.ok === false;
    t.className = 'term ' + (bad ? 'bad' : 'ok');
    var tx = t.querySelector('.tx'); tx.textContent = (bad ? '✕ ' : '✓ ') + cmd;
    var glow = bad ? '255,107,122' : '61,220,151';
    if (!RM()) {
      play(t, [{ boxShadow: '0 0 0 1px rgba(255,255,255,.1),0 0 0 0 rgba(' + glow + ',.6),0 8px 20px -4px rgba(8,8,20,.4)' }, { boxShadow: '0 0 0 1px rgba(' + glow + ',.8),0 0 0 9px rgba(' + glow + ',0),0 8px 28px -2px rgba(' + glow + ',.4)' }], { duration: 720, easing: 'ease-out' });
      if (bad) play(t, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 420 });
    }
    measure(a);
    await sleep(D(bad ? 1150 : 850) / f);
    await play(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 });
    t.remove(); measure(a);
  }

  /* ----------------------------------------------------------------- glance */
  async function doGlance(a, b, f) {
    var ev = b.pre || b.post, label = (ev && ev.summary) || (b.tool.toLowerCase() + ' ' + base(b.file || ''));
    var c = chipEl({ col: a.col, name: label, cls: 'dim' });
    a.stack.appendChild(c); measure(a);
    play(c, [{ opacity: 0, transform: 'translateX(-3px)' }, { opacity: 1, transform: 'none' }], { duration: D(220), easing: 'ease-out' });
    if (b.file) {
      var cs = annotate(tagged(b.file)), p = cs.length && best(cs, false);
      if (p && p.on) {
        var bx = fxAdd(h('div', 'box')), s = bx.style;
        s.left = p.clip.x + 'px'; s.top = p.clip.y + 'px'; s.width = p.clip.w + 'px'; s.height = p.clip.h + 'px'; s.borderRadius = '8px'; s.border = '1px dotted ' + rgba(a.col.rgb, 0.55);
        play(bx, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 950 / Math.min(f, 2.5) }).then(function () { bx.remove(); });
        var tx = p.clip.x + p.clip.w / 2, ty = p.clip.y + p.clip.h / 2, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1, k = Math.min(70, d * 0.25) / d;
        await moveTo(a, a.x + dx * k, a.y + dy * k, { dur: D(420) / f });
      }
    }
    await sleep(D(520) / f);
    await play(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    c.remove(); measure(a);
  }

  /* ----------------------------------------------------------------- events */
  var EDIT_RE = /^(Edit|MultiEdit|Write|NotebookEdit)$/, GLANCE_RE = /^(Read|Grep|Glob|LS|NotebookRead)$/;
  var CSS_RE = /\.(css|scss|sass|less|styl|pcss)$/i;
  function classify(ev) {
    var t = ev.tool || '';
    if (EDIT_RE.test(t)) return CSS_RE.test(ev.file || '') ? 'css' : (t === 'Write' ? 'write' : 'edit');
    if (t === 'Bash') return 'bash';
    if (t === 'Agent' || t === 'Task' || !t) return null;
    return 'glance';
  }
  function applyPost(b, ev) {
    b.post = ev; b.postAt = Date.now(); b.file = b.file || ev.file || null;
    b.range = ev.range ? ev.range.slice() : null; b.added = ev.added | 0; b.removed = ev.removed | 0;
    if (b.parked && b.agent) { /* a late Post for a parked call: it lands now, whenever it arrives */
      b.parked = false; var pi = b.agent.parked.indexOf(b); if (pi >= 0) b.agent.parked.splice(pi, 1);
      if (!b.agent.dead) b.agent.queue.push(b);
    }
    if (b.wake) b.wake();
  }
  /* tolerate malformed fields: only well-typed values reach the beats */
  function cleanEv(ev) {
    var o = {}, k; for (k in ev) o[k] = ev[k];
    o.tool = typeof ev.tool === 'string' ? ev.tool : '';
    o.file = typeof ev.file === 'string' && ev.file ? ev.file : null;
    o.summary = ev.summary == null ? undefined : String(ev.summary);
    o.toolUseId = ev.toolUseId == null || ev.toolUseId === '' ? undefined : String(ev.toolUseId);
    var r = ev.range;
    o.range = Array.isArray(r) && r.length >= 2 && isFinite(+r[0]) && isFinite(+r[1]) && r[0] !== null && r[1] !== null ? [+r[0], +r[1]] : null;
    return o;
  }
  function onTool(ev) {
    ev = cleanEv(ev);
    var info = ev.agent && typeof ev.agent === 'object' ? ev.agent : { id: 'main', type: 'main', label: 'main', parent: null };
    var kind = classify(ev);
    if (kind === null && ev.kind === 'tool.post' && info.id === 'main') { /* Agent spawn: visuals driven by agent.start */ }
    var a = ensureAgent(info, true); if (!a) return; a.restored = false; if (kind === null) return;
    var id = ev.toolUseId || ('anon' + (++anon)), b = S.beats.get(id);
    if (ev.kind === 'tool.pre') {
      if (b) return; // late Pre after Post
      endStaleBash(a, ev.ts);
      b = { id: id, kind: kind, tool: ev.tool, file: ev.file || null, summary: ev.summary, pre: ev, post: null, postAt: 0, count: 1, added: 0, removed: 0, range: null, done: false, wake: null, agent: a };
      S.beats.set(id, b); a.queue.push(b);
    } else {
      if (ev.kind === 'tool.post' && isEditKind(kind)) { S.edits++; hudRender(); }
      if (!b) {
        b = { id: id, kind: kind, tool: ev.tool, file: ev.file || null, summary: ev.summary, pre: null, post: null, postAt: 0, count: 1, added: 0, removed: 0, range: null, done: false, wake: null, agent: a };
        S.beats.set(id, b); applyPost(b, ev); a.queue.push(b);
      } else if (!b.done || b.detached) { if (!b.post) applyPost(b, ev); }
    }
    /* finished work queued behind a call that is still waiting for its Post wakes the waiter so it parks */
    var hd = a.queue[0];
    if (hd && hd !== b && hd.wake && !hd.post && readyBeat(b)) hd.wake();
    compact(a);
    if (S.beats.size > 500) { var k0 = S.beats.keys().next().value; S.beats.delete(k0); }
    pump(a);
  }
  /* A Bash call that never gets a Post (denied by permissions, interrupted) would spin forever.
     The agent has clearly moved on when it starts a later tool call (parallel calls arrive within
     ~1.5 s of each other, so those are left alone) or when it stops: retire the pill quietly. */
  function endStaleBash(a, at) {
    var t = typeof at === 'number' ? at : Date.now();
    S.beats.forEach(function (b) {
      if (b.agent === a && b.kind === 'bash' && b.detached && !b.post && b.wake &&
          (at === Infinity || !b.pre || typeof b.pre.ts !== 'number' || t - b.pre.ts > 1500)) b.wake();
    });
  }
  function ingest(ev) {
    if (!ev || typeof ev !== 'object') return;
    try {
      mount(); observe();
      var k = ev.kind, evSid = typeof ev.session === 'string' ? ev.session : '';
      /* one overlay shows one Claude session: a hello or session.start from another session starts clean,
         any other event stamped with a different session id is stale and ignored */
      if (evSid && S.sid && evSid !== S.sid) {
        if (k === 'hello' || k === 'session.start') { reset(); mount(); observe(); } else return;
      }
      S.events++; S.lastEv = Date.now();
      if (!S.sid && evSid) S.sid = evSid;
      if (k === 'hello') {
        var list = (ev.agents || []).slice().sort(function (x, y) { return (x.parent ? 1 : 0) - (y.parent ? 1 : 0); });
        list.forEach(function (ag) { var ea = ensureAgent(ag, false); if (ea) ea.restored = false; });
        if (S.restored) {
          var alive = {}; list.forEach(function (ag) { alive[ag.id] = 1; });
          Array.from(S.agents.values()).forEach(function (ra) { if (ra.restored && ra.id !== 'main' && !alive[ra.id]) dropAgent(ra); });
        }
        S.restored = false; scheduleSave();
        return;
      }
      if (!S.t0 || k === 'session.start') { if (k === 'session.start' && S.ended) { S.ended = false; S.t0 = 0; } startClock(); }
      if (k === 'session.start') { S.ended = false; ensureAgent({ id: 'main', type: 'main', label: 'main', parent: null }, false); host.style.opacity = ''; }
      else if (k === 'session.end') { S.ended = true; S.tEnd = Date.now(); stopClock(); }
      else if (k === 'turn.end') { var ta = ev.agent && S.agents.get(ev.agent.id || 'main'); if (ta) endStaleBash(ta, Infinity); }
      else if (k === 'agent.start') {
        var ex = S.agents.get(ev.agent && ev.agent.id);
        if (ex) { setLabel(ex, ev.agent.label, true); } else ensureAgent(ev.agent, true);
      } else if (k === 'agent.update') {
        var ag = ev.agent && S.agents.get(ev.agent.id);
        if (ag) { setLabel(ag, ev.agent.label, true); if (ev.agent.parent) ag.parent = ev.agent.parent; }
        else if (ev.agent) ensureAgent(ev.agent, true);
      } else if (k === 'agent.stop') {
        var as = ev.agent && S.agents.get(ev.agent.id);
        if (as && as.id !== 'main') { endStaleBash(as, Infinity); as.queue.push({ kind: 'merge' }); pump(as); }
      } else if (k === 'tool.pre' || k === 'tool.post' || k === 'tool.fail') onTool(ev);
      hudRender(); scheduleSave();
    } catch (e) { S.errors.push(String(e && e.stack || e)); }
  }
  function dropAgent(a) {
    a.dead = true; a.queue.length = 0; if (a.move) { var m = a.move; a.move = null; m.res(); }
    S.agents.delete(a.id); S.tomb.set(a.id, Date.now());
    play(a.cur, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }).then(function () { a.cur.remove(); declutter(); });
    hudRender();
  }
  function reset() {
    epoch++;
    S.beats.forEach(function (b) { if (b.wake) b.wake(); });
    S.agents.forEach(function (a) { a.dead = true; a.queue.length = 0; if (a.move) { var m = a.move; a.move = null; m.res(); } a.cur.remove(); });
    S.dock.forEach(function (d) { clearTimeout(d.tm); });
    if (host) { L.fx.textContent = ''; L.chips.textContent = ''; L.dock.textContent = ''; L.teth.textContent = ''; var v = vp(); ctx.clearRect(0, 0, v.w, v.h); }
    stopClock(); clearStore();
    S = freshState(); hudCache.sw = null;
    hudRender();
  }
  function snapshot() {
    var ags = [], busy = false;
    S.agents.forEach(function (a) {
      if (a.queue.length || a.running || a.move) busy = true;
      ags.push({ id: a.id, label: a.label, parent: a.parent, type: a.type, color: a.col.base, x: a.x, y: a.y, queue: a.queue.length, parked: a.parked.length, busy: a.running, hue: a.col.hue });
    });
    return { version: '0.1.0', connected: connState.connected, connecting: connState.connecting, events: S.events, edits: S.edits, dropped: S.dropped, parked: ags.reduce(function (n, g) { return n + g.parked; }, 0), agents: ags,
      landings: S.landings.slice(), idle: !busy, dock: Array.from(S.dock.keys()), errors: S.errors.slice(), elapsed: S.t0 ? ((S.tEnd || Date.now()) - S.t0) : 0,
      hud: mountedHud() };
  }
  function mountedHud() { return host ? { state: hudCache.st, agents: hudCache.ag, edits: hudCache.ed, time: hudCache.tm } : null; }

  /* ------------------------------------------------------------- connection */
  var es = null, retry = 0, retryTm = 0;
  /* replay mode: events come only through Liveswarm.ingest(); nothing is ever fetched from a conductor */
  function replayMode() { var c = CFG(); return c.mode === 'replay' || c.conductor === null; }
  function conductor() {
    if (replayMode()) return null;
    var c = CFG().conductor;
    if (c) return String(c).replace(/\/+$/, '');
    try { var s = doc.currentScript || doc.querySelector('script[src$="overlay.js"]'); if (s && s.src) return new URL(s.src).origin; } catch (e) {}
    return null;
  }
  function connect() {
    if (replayMode()) { connState.replay = true; connState.connected = false; connState.connecting = false; hudRender(); return; }
    var url = conductor(); if (!url || !win.EventSource) return;
    clearTimeout(retryTm);
    connState.connecting = true; hudRender();
    try { es = new EventSource(url + '/stream'); } catch (e) { return scheduleRetry(); }
    es.onopen = function () { retry = 0; connState.connected = true; connState.connecting = false; hudRender(); };
    es.addEventListener('swarm', function (m) { try { ingest(JSON.parse(m.data)); } catch (e) {} });
    es.onerror = function () {
      connState.connected = false; connState.connecting = false; hudRender();
      if (es.readyState === 2) { try { es.close(); } catch (e) {} es = null; scheduleRetry(); }
    };
  }
  function scheduleRetry() {
    connState.connected = false; connState.connecting = false; hudRender();
    var d = Math.min(15000, 1000 * Math.pow(2, retry++));
    clearTimeout(retryTm); retryTm = setTimeout(connect, d);
  }

  /* ------------------------------------------------------------ persistence */
  /* A full page reload (frameworks without HMR) must not reset the show: agents, labels, positions and counters
     live in sessionStorage, keyed by the Claude session id, and come back on load. The conductor hello then
     confirms who is still alive. */
  var KEY = 'liveswarm:v1:', saveTm = 0, STALE = 45 * 60 * 1000;
  function store() { try { return win.sessionStorage; } catch (e) { return null; } }
  function persistOn() { return !replayMode() && CFG().persist !== false && !!store(); }
  function scheduleSave() { if (!saveTm && persistOn()) saveTm = setTimeout(function () { saveTm = 0; save(); }, 350); }
  function save() {
    if (!persistOn() || !host) return;
    if (saveTm) { clearTimeout(saveTm); saveTm = 0; }
    if (!S.agents.size && !S.edits) return;
    var sid = S.sid || 'default', ags = [];
    S.agents.forEach(function (a) { if (!a.dead) ags.push({ id: a.id, type: a.type, label: a.label, parent: a.parent, idx: a.idx, x: Math.round(a.move ? a.move.x : a.x), y: Math.round(a.move ? a.move.y : a.y) }); });
    try {
      store().setItem(KEY + sid, JSON.stringify({ sid: sid, ts: S.lastEv || Date.now(), edits: S.edits, events: S.events, t0: S.t0, tEnd: S.tEnd, ended: S.ended, colorIdx: S.colorIdx, agents: ags }));
      store().setItem(KEY + 'last', sid);
    } catch (e) {}
  }
  function clearStore() {
    var st = store(); if (!st) return;
    try { var sid = S.sid || 'default'; st.removeItem(KEY + sid); if (st.getItem(KEY + 'last') === sid) st.removeItem(KEY + 'last'); } catch (e) {}
  }
  function restore() {
    if (!persistOn() || S.agents.size) return;
    var rec = null;
    try { var st = store(), last = st.getItem(KEY + 'last'); rec = last && JSON.parse(st.getItem(KEY + last) || 'null'); } catch (e) { rec = null; }
    if (!rec || !rec.agents || !rec.agents.length || Date.now() - rec.ts > STALE) return;
    S.sid = rec.sid === 'default' ? '' : String(rec.sid); S.edits = rec.edits | 0; S.events = rec.events | 0; S.colorIdx = rec.colorIdx | 0;
    S.lastEv = +rec.ts || 0; S.t0 = +rec.t0 || 0; S.ended = !!rec.ended; S.tEnd = S.ended ? (+rec.tEnd || 0) : 0; S.restored = true;
    var list = rec.agents.slice().sort(function (x, y) { return (x.parent ? 1 : 0) - (y.parent ? 1 : 0); });
    list.forEach(function (ag) { var a = ensureAgent(ag, false); if (a) a.restored = true; });
    if (S.t0 && !S.ended) startClock();
    hudRender();
  }
  win.addEventListener('pagehide', save);
  doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') save(); });

  /* ------------------------------------------------------------------- boot */
  win.Liveswarm = {
    version: '0.1.0',
    ingest: ingest,
    reset: reset,
    get state() { return snapshot(); }
  };
  function boot() { mount(); observe(); restore(); connect(); }
  if (doc.documentElement) boot(); else doc.addEventListener('DOMContentLoaded', boot);
})();
