/* Scripted ~25 s multi-agent session, played through Liveswarm.ingest with the CONTRACT.md Event shape.
   Loaded only when the URL has ?scenario. Sets window.__scenarioDone = true at the end and records
   window.__scenarioExpect (what each edit should land on) for the verification script. */
(function () {
  var R = '/demo/', seq = 0, sess = 'demo-session';
  var MAIN = { id: 'main', type: 'main', label: 'main', parent: null };
  var A1 = { id: 'a1', type: 'frontend-dev', label: 'Hero copy', parent: 'main' };
  var A2 = { id: 'a2', type: 'frontend-dev', label: 'Pricing cards', parent: 'main' };
  var A3 = { id: 'a3', type: 'general-purpose', label: 'general-purpose', parent: 'main' };
  var A3b = { id: 'a3', type: 'general-purpose', label: 'Theme & footer', parent: 'main' };
  var uid = 0;
  function ev(kind, agent, extra) {
    var e = { v: 1, seq: ++seq, ts: Date.now(), session: sess, kind: kind, agent: agent };
    for (var k in extra) e[k] = extra[k];
    window.Liveswarm.ingest(e);
  }
  function tid() { return 'toolu_' + (++uid); }
  var expect = (window.__scenarioExpect = []);
  function $(s) { return document.querySelector(s); }
  /* tool helpers -------------------------------------------------------- */
  function edit(agent, file, range, add, rem, hmr, o) {
    o = o || {}; var id = tid(), tool = o.tool || 'Edit', path = R + file;
    var pre = function () { ev('tool.pre', agent, { tool: tool, toolUseId: id, file: path, summary: file.split('/').pop() }); };
    var post = function () {
      ev('tool.post', agent, { tool: tool, toolUseId: id, file: path, range: range, added: add, removed: rem, summary: file.split('/').pop(), ok: true });
      if (hmr) setTimeout(hmr, 70);
    };
    if (o.postFirst) { post(); setTimeout(pre, 50); } else { pre(); setTimeout(post, o.gap == null ? 450 : o.gap); }
    if (o.expect !== false) expect.push({ agent: agent.id, file: file, range: range, key: o.key || null, kind: o.kindExpect || null });
  }
  function bash(agent, cmd, ms, fail) {
    var id = tid();
    ev('tool.pre', agent, { tool: 'Bash', toolUseId: id, summary: '$ ' + cmd });
    setTimeout(function () {
      ev(fail ? 'tool.fail' : 'tool.post', agent, { tool: 'Bash', toolUseId: id, summary: '$ ' + cmd, ok: !fail });
    }, ms);
  }
  function read(agent, file, tool) {
    var id = tid(), path = R + file;
    ev('tool.pre', agent, { tool: tool || 'Read', toolUseId: id, file: path, summary: (tool === 'Grep' ? 'searching ' : 'reading ') + file.split('/').pop() });
    setTimeout(function () { ev('tool.post', agent, { tool: tool || 'Read', toolUseId: id, file: path, ok: true }); }, 200);
  }
  function spawn(agent, desc) {
    var id = tid();
    ev('tool.pre', MAIN, { tool: 'Agent', toolUseId: id, summary: desc });
    setTimeout(function () { ev('tool.post', MAIN, { tool: 'Agent', toolUseId: id, summary: desc, ok: true }); }, 60);
  }
  /* fake HMR ------------------------------------------------------------ */
  function setText(sel, t) { return function () { var e = $(sel); if (e) e.textContent = t; }; }
  var ACCENT = ['#4b3df2', '#0f9d8a', '#e4572e'];
  /* timeline ------------------------------------------------------------ */
  var T = [];
  function at(ms, fn) { T.push([ms, fn]); }

  at(300, function () { ev('session.start', MAIN, {}); });
  at(900, function () { read(MAIN, 'src/App.jsx'); });
  at(1700, function () { spawn(A1, 'Hero copy'); setTimeout(function () { ev('agent.start', A1, {}); }, 200); });
  at(2000, function () { spawn(A2, 'Pricing cards'); setTimeout(function () { ev('agent.start', A2, {}); }, 200); });
  at(2300, function () { spawn(A3, 'Theme & footer'); setTimeout(function () { ev('agent.start', A3, {}); }, 200); });
  at(3100, function () { ev('agent.update', A3b, {}); });

  at(3400, function () { edit(A1, 'src/components/Hero.jsx', [8, 12], 2, 1, setText('#h1', 'Ship interfaces your whole team can feel.'), { key: 'Hero.jsx:8-12' }); });
  at(3900, function () { edit(A2, 'src/components/Pricing.jsx', [10, 24], 6, 2, null, { key: 'Pricing.jsx:10-24' }); }); // below the fold: edge pointer
  at(4500, function () {
    edit(A3, 'src/theme.css', [1, 4], 3, 1, function () { document.documentElement.style.setProperty('--accent', ACCENT[1]); }, { expect: false });
  });
  at(5900, function () { edit(A1, 'src/components/Hero.jsx', [19, 21], 4, 2, setText('#cta-demo', 'See it in action'), { key: 'Hero.jsx:19-21' }); });
  at(6900, function () {
    var id = tid(); // not-yet-mounted component: ghost box in the dock
    var path = R + 'src/components/Testimonial.jsx';
    ev('tool.pre', A2, { tool: 'Write', toolUseId: id, file: path, summary: 'Testimonial.jsx' });
    setTimeout(function () { ev('tool.post', A2, { tool: 'Write', toolUseId: id, file: path, range: [1, 42], added: 42, removed: 0, summary: 'Testimonial.jsx', ok: true }); }, 500);
    expect.push({ agent: 'a2', file: 'src/components/Testimonial.jsx', kind: 'dock' });
  });
  at(7600, function () { bash(A3, 'npm run build', 1800, false); });
  at(7900, function () { read(A1, 'src/components/Features.jsx', 'Grep'); });
  at(9100, function () { edit(MAIN, 'src/components/Nav.jsx', [15, 20], 1, 1, setText('#cta-nav', 'Start for free'), { key: 'Nav.jsx:15-20' }); });
  at(10200, function () { bash(A2, 'npm test -- pricing', 1500, true); });

  /* burst: 8 quick edits by one agent -> compression + merging */
  at(11200, function () {
    var plan = [['src/components/FeatureCard.jsx', [8, 10], '#features .card:nth-child(1) h3', 'Live previews'],
      ['src/components/FeatureCard.jsx', [11, 13], '#features .card:nth-child(1) p', 'Edit once, see it everywhere, instantly.'],
      ['src/components/FeatureCard.jsx', [3, 6], '#features .card:nth-child(1) .ico', null],
      ['src/components/Hero.jsx', [13, 15], '#lede', 'Lumen turns design intent into production components, with the polish of a launch.'],
      ['src/components/Hero.jsx', [14, 14], '#lede', 'Lumen turns design intent into production components with launch-day polish.'],
      ['src/components/FeatureCard.jsx', [8, 10], '#features .card:nth-child(2) h3', 'Design tokens, synced'],
      ['src/components/FeatureCard.jsx', [11, 13], '#features .card:nth-child(2) p', 'One source of truth for colour, type and space.'],
      ['src/components/FeatureCard.jsx', [8, 10], '#features .card:nth-child(3) h3', 'Ship with confidence']];
    plan.forEach(function (p, i) {
      setTimeout(function () { edit(A1, p[0], p[1], 1 + (i % 3), i % 2, p[3] ? setText(p[2], p[3]) : null, { gap: 90, expect: false }); }, i * 240);
    });
    expect.push({ agent: 'a1', file: 'burst', kind: 'burst' });
  });

  /* Post arrives before Pre */
  at(14400, function () { edit(A3, 'src/components/Hero.jsx', [24, 38], 3, 1, function () { var v = $('#visual'); if (v) v.style.filter = 'saturate(1.15)'; }, { postFirst: true, key: 'Hero.jsx:24-38' }); });
  at(15300, function () { ev('agent.update', { id: 'a1', type: 'frontend-dev', label: 'Hero & features polish', parent: 'main' }, {}); });
  at(16100, function () { edit(A1, 'src/components/Features.jsx', [1, 50], 18, 4, null, { tool: 'Write', key: 'Features.jsx:4-50', kindExpect: 'write' }); });
  at(17000, function () { window.scrollTo({ top: document.getElementById('pricing').offsetTop - 80, behavior: 'smooth' }); });
  at(18600, function () { edit(A2, 'src/components/Pricing.jsx', [25, 39], 5, 3, setText('#pricing .plan.pop .price', '$29'), { key: 'Pricing.jsx:25-39' }); });
  at(19900, function () { edit(A2, 'src/components/Pricing.jsx', [40, 56], 2, 1, setText('#pricing .plan:last-child .price', '$99'), { key: 'Pricing.jsx:40-56' }); });
  at(20700, function () { edit(A3, 'src/components/Footer.jsx', [3, 20], 4, 2, setText('footer span', 'Lumen Labs, 2026. Made with care.'), { key: 'Footer.jsx:3-20' }); });
  at(21700, function () { ev('agent.stop', A3b, {}); });
  at(22300, function () { ev('agent.stop', A2, {}); });
  at(22900, function () { ev('agent.stop', { id: 'a1', type: 'frontend-dev', label: 'Hero & features polish', parent: 'main' }, {}); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  at(24300, function () { edit(MAIN, 'src/components/Nav.jsx', [6, 9], 1, 0, null, { key: 'Nav.jsx:6-9' }); });
  at(25500, function () { ev('turn.end', MAIN, {}); });
  at(28500, function () { window.__scenarioDone = true; });

  window.__scenarioStart = Date.now();
  T.forEach(function (t) { setTimeout(t[1], t[0]); });
})();
