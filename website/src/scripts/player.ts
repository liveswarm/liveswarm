/**
 * The hero build player.
 *
 * It reads public/build-timeline.json (the same event shape the real Liveswarm engine emits,
 * plus `target`, a CSS selector on this page) and plays it: one cursor per agent, each move
 * tied to an event, each event revealing the element it targets.
 *
 * How a flat timeline becomes a page that builds as you scroll:
 *  - Every [data-scene] element is a scene. Scenes on screen at the start play on the clock,
 *    using each event's `t`. That is the first-screen sequence.
 *  - Events for scenes further down wait. Their agent parks at the bottom edge of the window
 *    (as the real overlay does for off-screen work) and builds the scene when it scrolls into view.
 *  - Edit = selection sweep + chip. Write = dashed ghost box that fills in. An edit to a
 *    stylesheet = paint sweep. Bash = terminal pill that turns green. Read/Grep = a small glance.
 *  - Anything a scene never targets is revealed when that scene finishes, so no timeline can
 *    leave content hidden.
 *
 * It only ever adds its own layers (pointer-events: none, aria-hidden). The page underneath is
 * finished HTML; `html.build` plus [data-b] hides parts of it until they are built.
 */

type AgentRef = { id: string; label?: string; parent?: string | null };
type Ev = {
  t: number;
  kind: string;
  agent?: AgentRef;
  tool?: string;
  target?: string;
  added?: number;
  removed?: number;
  file?: string;
  summary?: string;
};
type Opts = { replay: HTMLButtonElement | null };
type Beat = () => Promise<void>;
type Rect = { x: number; y: number; w: number; h: number };
type Move = { sx: number; sy: number; cx: number; cy: number; x: number; y: number; t0: number; dur: number; ease: (t: number) => number; res: () => void };
type Agent = {
  id: string;
  hue: number;
  idx: number;
  el: HTMLElement;
  fx0: HTMLElement;
  ptr: SVGElement;
  stack: HTMLElement;
  light: HTMLElement | null;
  lgrid: HTMLElement | null;
  lit: boolean;
  x: number;
  y: number;
  w: number;
  edge: boolean;
  parked: boolean;
  move: Move | null;
  q: Beat[];
  busy: boolean;
  dead: boolean;
  stopReq: boolean;
  parent: Agent | null;
  kids: number;
  bend: number;
  trail: { x: number; y: number; t: number }[];
  term: HTMLElement | null;
};
type Scene = { el: Element; evs: Ev[]; state: 0 | 1 | 2; left: number; live: boolean };

const TIMELINE_URL = '/build-timeline.json';
const HUES = [268, 24, 176, 84, 336, 222, 134, 304, 52];
const POINTER = 'M0 0 L0 17.2 L4.5 13.1 L7.5 19.9 L10.4 18.6 L7.4 11.9 L13.6 11.7 Z';
const EDIT = /^(Edit|MultiEdit|Write|NotebookEdit)$/;
const GLANCE = /^(Read|Grep|Glob|LS)$/;
const STYLE = /\.(css|scss|sass|less|styl|pcss)$/i;
const FIRST_SCREEN_MS = 13500;
const TRAIL_MS = 440;
const SPRING = 'cubic-bezier(.2,.9,.3,1.15)';

const root = document.documentElement;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeO = (t: number) => 1 - Math.pow(1 - t, 3);
const base = (p?: string) => String(p || '').split(/[\\/]/).pop() || '';
const never = new Promise<never>(() => {});

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

let timeline: Ev[] | null = null;
let current: { stop: () => void } | null = null;
let token = 0;

const able = () =>
  !!(window.CSS && CSS.supports && CSS.supports('color', 'oklch(0.5 0.1 100)') && 'IntersectionObserver' in window && 'animate' in root);

async function loadTimeline(): Promise<Ev[]> {
  const res = await fetch(TIMELINE_URL);
  if (!res.ok) throw new Error('timeline ' + res.status);
  const data = await res.json();
  const list: unknown = Array.isArray(data) ? data : data.events;
  if (!Array.isArray(list)) throw new Error('timeline has no events');
  return (list as Ev[]).filter((e) => e && typeof e.t === 'number' && typeof e.kind === 'string').sort((a, b) => a.t - b.t);
}

function showFinished(opts: Opts, label: string) {
  root.classList.remove('build');
  document.querySelectorAll('[data-b-on]').forEach((e) => e.removeAttribute('data-b-on'));
  document.querySelectorAll('[data-painted]').forEach((e) => e.removeAttribute('data-painted'));
  if (opts.replay) {
    opts.replay.textContent = label;
    opts.replay.hidden = false;
  }
}

/** Start (or restart) the build. Safe to call again while one is playing. */
export async function play(opts: Opts): Promise<void> {
  const mine = ++token;
  clearTimeout((window as unknown as { __lswFailsafe?: number }).__lswFailsafe);
  current?.stop();
  current = null;
  if (!able()) return showFinished(opts, 'Play the build');

  document.querySelectorAll('[data-b-on]').forEach((e) => e.removeAttribute('data-b-on'));
  document.querySelectorAll('[data-painted]').forEach((e) => e.removeAttribute('data-painted'));
  root.classList.add('build');
  if (opts.replay) opts.replay.hidden = true;
  if (scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

  try {
    timeline ??= await loadTimeline();
    /* Positions are measured from the page, so wait for the fonts that set them (briefly). */
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
  } catch {
    if (mine === token) showFinished(opts, 'Play the build');
    return;
  }
  if (mine !== token) return;
  current = start(timeline, opts);
}

function start(all: Ev[], opts: Opts): { stop: () => void } {
  const compact = matchMedia('(max-width: 720px)').matches;
  let alive = true;

  /* ------------------------------------------------------------ layers */
  const layer = h('div', 'lsw-root');
  layer.setAttribute('aria-hidden', 'true');
  const trail = document.createElement('canvas');
  trail.className = 'lsw-trail';
  const ctx = trail.getContext('2d')!;
  const teth = svg('svg', { class: 'lsw-teth' });
  const doc = h('div', 'lsw-doc');
  const fxl = h('div', 'lsw-fxl');
  const curs = h('div', 'lsw-fxl');
  const edge = h('div', 'lsw-edge');
  doc.append(fxl, curs);
  layer.append(trail, teth, doc, edge);

  const bar = h('div', 'lsw-ui');
  const hud = h('div', 'lsw-hud live');
  hud.setAttribute('aria-hidden', 'true');
  const hSt = h('span', '', 'live');
  const hSws = h('span', 'sws');
  const hAg = h('span', '', '0 agents');
  const hEd = h('span', '', '0 edits');
  const hTm = h('span', 'm', '0:00');
  hud.append(h('i', 'cd'), hSt, h('i', 'sep'), hSws, hAg, h('i', 'sep'), hEd, h('i', 'sep'), hTm);
  const skip = h('button', 'lsw-skip') as HTMLButtonElement;
  skip.type = 'button';
  skip.append('Skip', h('kbd', '', 'esc'));
  skip.setAttribute('aria-label', 'Skip the build animation');
  bar.append(hud, skip);
  document.body.append(layer);
  /* Skip sits early in the tab order, right after the skip-to-content link. */
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) skipLink.after(bar);
  else document.body.prepend(bar);

  let cw = 0;
  let ch = 0;
  function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = root.clientWidth;
    ch = innerHeight;
    trail.width = Math.round(cw * dpr);
    trail.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();

  /* ------------------------------------------------------------- light */
  /* In the hero, each agent lights the blueprint grid under it in its own colour. The light follows
     the agents, never the visitor's pointer, and it is gone when the build is done. */
  const GRID = 56;
  const LIGHT = compact ? 300 : 440;
  const heroEl = document.querySelector<HTMLElement>('.hero');
  const lights = heroEl ? h('div', 'lsw-lights') : null;
  const lbox = { x: 0, y: 0, w: 0, h: 0, ox: 0 };
  let lightRo: ResizeObserver | null = null;
  function sizeLights() {
    if (!lights || !heroEl) return;
    const r = lights.getBoundingClientRect();
    lbox.x = r.left + scrollX;
    lbox.y = r.top + scrollY;
    lbox.w = r.width;
    lbox.h = r.height;
    /* pin the hero grid to whole pixels so the coloured lines sit exactly on the white ones */
    lbox.ox = ((Math.round((r.width - GRID) / 2) % GRID) + GRID) % GRID;
    heroEl.style.setProperty('--gx', lbox.ox + 'px');
  }
  if (lights && heroEl) {
    lights.setAttribute('aria-hidden', 'true');
    lights.style.setProperty('--ls', LIGHT + 'px');
    heroEl.prepend(lights);
    sizeLights();
    if ('ResizeObserver' in window) {
      lightRo = new ResizeObserver(() => {
        sizeLights();
        for (const a of agents.values()) lightAt(a);
      });
      lightRo.observe(lights);
    }
  }
  function lightAt(a: Agent) {
    if (!a.light || !a.lgrid) return;
    const on =
      !a.edge && !a.dead &&
      a.x > lbox.x - 60 && a.x < lbox.x + lbox.w + 60 &&
      a.y > lbox.y - 60 && a.y < lbox.y + lbox.h + 60;
    if (on !== a.lit) {
      a.lit = on;
      a.light.classList.toggle('on', on);
    }
    if (!on) return;
    const lx = Math.round(a.x - lbox.x - LIGHT / 2);
    const ly = Math.round(a.y - lbox.y - LIGHT / 2);
    a.light.style.transform = `translate3d(${lx}px,${ly}px,0)`;
    /* the grid inside the light is shifted back by the same amount, so its lines stay on the page grid */
    const gx = ((((lbox.ox - lx) % GRID) + GRID) % GRID) - GRID;
    const gy = (((-ly % GRID) + GRID) % GRID) - GRID;
    a.lgrid.style.transform = `translate3d(${gx}px,${gy}px,0)`;
  }

  /* ------------------------------------------------------------- clock */
  /* One rAF loop drives everything timed, so a hidden tab (no frames) pauses the whole show. */
  let vt = 0;
  let lastN = 0;
  let raf = 0;
  let elapsed = 0;
  let busy = 0;
  let clockPending = 0;
  let timers: { at: number; fn: () => void }[] = [];
  let tweens: { t0: number; dur: number; fn: (p: number) => void; done: () => void }[] = [];
  const anims = new Set<Animation>();
  const typing = new Set<() => void>();

  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      timers.push({ at: vt + ms, fn: res });
      kick();
    });
  const tween = (dur: number, fn: (p: number) => void) =>
    new Promise<void>((res) => {
      tweens.push({ t0: vt, dur: Math.max(1, dur), fn, done: res });
      kick();
    });
  function anim(el: Element, kf: Keyframe[], o: KeyframeAnimationOptions): Promise<void> {
    let a: Animation;
    try {
      a = el.animate(kf, o);
    } catch {
      return Promise.resolve();
    }
    anims.add(a);
    return a.finished.then(
      () => void anims.delete(a),
      () => {
        anims.delete(a);
        return never; /* cancelled by Skip: whoever was waiting simply never continues */
      },
    );
  }
  function kick() {
    if (!raf && alive) {
      lastN = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function tick(n: number) {
    raf = 0;
    if (!alive) return;
    const dt = clamp(n - lastN, 0, 64);
    lastN = n;
    vt += dt;
    if (busy > 0 || clockPending > 0) elapsed += dt;

    if (timers.length) {
      const due = timers.filter((t) => t.at <= vt);
      if (due.length) {
        timers = timers.filter((t) => t.at > vt);
        for (const t of due) t.fn();
      }
    }
    if (tweens.length) {
      const cur = tweens;
      tweens = [];
      for (const tw of cur) {
        const p = Math.min(1, (vt - tw.t0) / tw.dur);
        tw.fn(p);
        if (p < 1) tweens.push(tw);
        else tw.done();
      }
    }
    let moving = false;
    for (const a of agents.values()) {
      const m = a.move;
      if (!m) continue;
      moving = true;
      const t = Math.min(1, (vt - m.t0) / m.dur);
      const e = m.ease(t);
      const u = 1 - e;
      a.x = u * u * m.sx + 2 * u * e * m.cx + e * e * m.x;
      a.y = u * u * m.sy + 2 * u * e * m.cy + e * e * m.y;
      place(a);
      flip(a);
      const v = vpos(a);
      a.trail.push({ x: v.x, y: v.y, t: vt });
      if (t >= 1) {
        a.move = null;
        m.res();
      }
    }
    const th = drawTethers();
    const tr = drawTrails();
    hudTime();
    if (timers.length || tweens.length || moving || th || tr || busy > 0 || clockPending > 0) raf = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ agents */
  const agents = new Map<string, Agent>();
  const waiters = new Map<string, ((a: Agent) => void)[]>();
  const pending = new Map<string, number>(); /* waiting (off-screen) beats per agent */
  /* Every agent in the timeline, in spawn order. Colour follows this, so an agent keeps its colour in the short version too. */
  const castOrder: string[] = [];
  for (const e of all) {
    const id = e.agent?.id;
    if (e.kind === 'agent.start' && id && id !== 'main' && !castOrder.includes(id)) castOrder.push(id);
  }
  let colorIdx = 0;
  let spawned = 0;
  let edits = 0;

  const vpos = (a: Agent) => (a.edge ? { x: a.x, y: a.y } : { x: a.x - scrollX, y: a.y - scrollY });
  const docPos = (a: Agent) => (a.edge ? { x: a.x + scrollX, y: a.y + scrollY } : { x: a.x, y: a.y });
  const place = (a: Agent) => {
    a.el.style.transform = `translate3d(${a.x.toFixed(2)}px,${a.y.toFixed(2)}px,0)`;
    if (a.light) lightAt(a);
  };
  function flip(a: Agent) {
    const v = vpos(a);
    const w = a.w || 110;
    const over = v.x + 14 + w + 10 > cw;
    a.el.classList.toggle('fx-x', over && v.x > cw / 2);
    /* Near the bottom of the window the label stack sits above the pointer, so a chip or command is never cut off. */
    a.el.classList.toggle('fx-y', !a.edge && v.y > ch - 84 && v.y < ch + 40);
  }
  const measure = (a: Agent) => {
    a.w = a.stack.offsetWidth || a.w;
    flip(a);
  };
  function toEdge(a: Agent) {
    if (a.edge) return;
    a.x = clamp(a.x - scrollX, -60, cw + 60);
    a.y = clamp(a.y - scrollY, -60, ch + 60);
    a.edge = true;
    edge.append(a.el);
    place(a);
  }
  function toDoc(a: Agent) {
    if (!a.edge) return;
    a.x += scrollX;
    a.y += scrollY;
    a.edge = false;
    a.parked = false;
    a.el.classList.remove('parked');
    curs.append(a.el);
    place(a);
  }
  function homePos(): { x: number; y: number } {
    const el = document.querySelector('.home-cursor');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.left || r.top) return { x: r.left + scrollX, y: r.top + scrollY };
    }
    return { x: cw * 0.5 + scrollX, y: ch * 0.3 + scrollY };
  }

  function makeAgent(info: AgentRef, parent: Agent | null): Agent {
    const known = info.id === 'main' ? 0 : castOrder.indexOf(info.id) + 1;
    const idx = info.id === 'main' ? 0 : known > 0 ? known : castOrder.length + ++colorIdx;
    const hue = idx < HUES.length ? HUES[idx] : (idx * 137.5) % 360;
    const el = h('div', 'lsw-cur');
    el.style.setProperty('--h', String(hue));
    const fx0 = h('div', 'lsw-fx0');
    fx0.style.opacity = '0';
    const drift = h('div', 'lsw-drift');
    drift.style.setProperty('--dd', (6 + (idx % 5) * 0.9).toFixed(1) + 's');
    drift.style.setProperty('--dl', (-idx * 1.7).toFixed(1) + 's');
    const ptr = svg('svg', { class: 'lsw-ptr', viewBox: '0 0 14 20' });
    ptr.append(svg('path', { d: POINTER }));
    const stack = h('div', 'lsw-stack');
    const pill = h('div', 'lsw-pill');
    pill.append(h('i', 'pd'), h('span', 'nm', info.label || info.id), h('span', 'ar', '↓'));
    stack.append(pill);
    drift.append(ptr, stack);
    fx0.append(drift);
    el.append(fx0);
    curs.append(el);
    let light: HTMLElement | null = null;
    let lgrid: HTMLElement | null = null;
    if (lights) {
      light = h('div', 'lsw-light');
      light.style.setProperty('--h', String(hue));
      lgrid = h('i');
      light.append(lgrid);
      lights.append(light);
    }
    const hp = homePos();
    const a: Agent = {
      id: info.id, hue, idx, el, fx0, ptr, stack, light, lgrid, lit: false,
      x: hp.x, y: hp.y, w: 0, edge: false, parked: false, move: null, q: [], busy: false, dead: false,
      stopReq: false, parent, kids: 0, bend: idx % 2 ? 1 : -1, trail: [], term: null,
    };
    agents.set(a.id, a);
    place(a);
    a.w = stack.offsetWidth;
    return a;
  }

  function spawn(info: AgentRef): Agent {
    const had = agents.get(info.id);
    if (had) return had;
    const parent = info.id === 'main' ? null : agents.get(info.parent || 'main') || agents.get('main') || null;
    const a = makeAgent(info, parent && !parent.dead ? parent : null);
    spawned++;
    hudRender();
    enqueue(a, a.parent ? split(a, a.parent) : appear(a));
    waiters.get(a.id)?.forEach((fn) => fn(a));
    waiters.delete(a.id);
    return a;
  }

  function moveTo(a: Agent, x: number, y: number, o: { dur?: number; ease?: 'out' | 'io'; straight?: boolean; f?: number } = {}): Promise<void> {
    if (a.move) {
      const old = a.move;
      a.move = null;
      old.res();
    }
    const sx = a.x;
    const sy = a.y;
    const dx = x - sx;
    const dy = y - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) {
      a.x = x;
      a.y = y;
      place(a);
      return Promise.resolve();
    }
    const dur = o.dur ?? clamp(280 + dist * 0.5, 320, 820) / (o.f || 1);
    const k = o.straight ? 0 : Math.min(dist * 0.2, 110) * a.bend * (dist < 60 ? 0.3 : 1);
    const cx = (sx + x) / 2 + (-dy / dist) * k;
    const cy = (sy + y) / 2 + (dx / dist) * k;
    return new Promise<void>((res) => {
      a.move = { sx, sy, cx, cy, x, y, t0: vt, dur: Math.max(60, dur), ease: o.ease === 'out' ? easeO : easeIO, res };
      kick();
    });
  }

  function enqueue(a: Agent, b: Beat) {
    a.q.push(b);
    pump(a);
  }
  async function pump(a: Agent) {
    if (a.busy || a.dead) return;
    a.busy = true;
    busy++;
    kick();
    while (a.q.length && !a.dead && alive) {
      const b = a.q.shift()!;
      try {
        await b();
      } catch {
        /* one bad beat must not stop the show */
      }
    }
    a.busy = false;
    busy--;
    if (!alive) return;
    settle(a);
    check();
  }
  /** What an agent does when it runs out of beats: wait at the edge for off-screen work, or go home. */
  function settle(a: Agent) {
    if (a.dead || a.busy || a.q.length) return;
    if (a.id === 'main') {
      /* The main agent rests beside the headline between jobs. */
      const hp = homePos();
      if (!finishing && Math.hypot(a.x - hp.x, a.y - hp.y) > 6) enqueue(a, goHome(a));
      return;
    }
    if ((pending.get(a.id) || 0) > 0) {
      if (!a.parked) enqueue(a, park(a));
    } else if (a.stopReq) {
      a.stopReq = false;
      enqueue(a, merge(a));
    }
  }

  /* -------------------------------------------------------- small effects */
  function drawTrails(): boolean {
    let any = false;
    ctx.clearRect(0, 0, cw, ch);
    for (const a of agents.values()) {
      const tr = a.trail;
      while (tr.length && vt - tr[0].t > TRAIL_MS) tr.shift();
      if (!tr.length) continue;
      any = true;
      for (let i = 1; i < tr.length; i++) {
        const q = tr[i];
        const p = tr[i - 1];
        const k = 1 - (vt - q.t) / TRAIL_MS;
        if (k <= 0) continue;
        ctx.strokeStyle = `oklch(0.71 0.19 ${a.hue} / ${(0.5 * k * k).toFixed(3)})`;
        ctx.lineWidth = 0.6 + 3.4 * k * k;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
    return any;
  }
  let tethers: { p: SVGElement; from: Agent; to: Agent; t0: number; dur: number }[] = [];
  function tether(from: Agent, to: Agent, dur: number, hue: number) {
    const p = svg('path', { fill: 'none', stroke: `oklch(0.71 0.19 ${hue})`, 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-dasharray': '1 5' });
    teth.append(p);
    tethers.push({ p, from, to, t0: vt, dur });
    kick();
  }
  function drawTethers(): boolean {
    if (!tethers.length) return false;
    tethers = tethers.filter((th) => {
      const k = (vt - th.t0) / th.dur;
      if (k >= 1 || th.from.dead || th.to.dead) {
        th.p.remove();
        return false;
      }
      const a = vpos(th.from);
      const b = vpos(th.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const bend = Math.min(d * 0.18, 40);
      const mx = (a.x + b.x) / 2 - (dy / d) * bend;
      const my = (a.y + b.y) / 2 + (dx / d) * bend;
      th.p.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      th.p.setAttribute('stroke-opacity', (0.75 * (1 - k) * Math.min(1, k * 8)).toFixed(3));
      return true;
    });
    return tethers.length > 0;
  }
  function ripple(x: number, y: number, a: Agent, big = false) {
    const r = h('div', 'lsw-rip');
    r.style.setProperty('--h', String(a.hue));
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    fxl.append(r);
    anim(r, [{ transform: 'scale(.25)', opacity: 0.85 }, { transform: `scale(${big ? 1.7 : 1})`, opacity: 0 }], { duration: big ? 780 : 520, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).then(() => r.remove());
  }
  const press = (a: Agent) => void anim(a.ptr, [{ transform: 'scale(1)' }, { transform: 'scale(.82)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  function box(cls: string, r: Rect, a: Agent): HTMLElement {
    const b = h('div', cls);
    b.style.setProperty('--h', String(a.hue));
    b.style.cssText += `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
    fxl.append(b);
    return b;
  }
  const fade = (el: Element, delay: number, dur: number) =>
    void sleep(delay)
      .then(() => anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' }))
      .then(() => el.remove());
  function chip(a: Agent, o: { add?: number; del?: number; name?: string; meta?: string; mid?: boolean }, r: Rect, life: number) {
    const c = h('div', 'lsw-chip');
    c.style.setProperty('--h', String(a.hue));
    c.append(h('i', 'sw'));
    if (o.add != null) c.append(h('span', 'add', '+' + o.add));
    if (o.del != null) c.append(h('span', 'del', '−' + o.del));
    if (o.name) c.append(h('span', '', o.name));
    if (o.meta) c.append(h('span', 'meta', o.meta));
    fxl.append(c);
    const w = c.offsetWidth;
    const x = clamp(o.mid ? r.x + (r.w - w) / 2 : r.x, 8, Math.max(8, cw - w - 8));
    let y = r.y - 34;
    if (y < scrollY + 8) y = r.y + r.h + 8;
    c.style.transform = `translate(${x}px,${y}px)`;
    anim(c, [{ opacity: 0, transform: `translate(${x}px,${y + 7}px) scale(.94)` }, { opacity: 1, transform: `translate(${x}px,${y}px) scale(1)` }], { duration: 260, easing: SPRING })
      .then(() => sleep(life))
      .then(() => anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' }))
      .then(() => c.remove());
  }

  /* -------------------------------------------------------- revealing the page */
  const isHidden = (el: Element) => el.hasAttribute('data-b') && !el.hasAttribute('data-b-on');
  const sceneEl = (el: Element) => el.closest('[data-scene]');
  function paintNow(el: Element) {
    if (el.hasAttribute('data-paint')) el.setAttribute('data-painted', '');
    el.querySelectorAll('[data-paint]').forEach((e) => e.setAttribute('data-painted', ''));
  }
  /** Show everything in a scene at once (no cursor, no animation). */
  function instant(scene: Element) {
    for (const e of [scene, ...scene.querySelectorAll('[data-b],[data-paint]')]) {
      if (e !== scene && sceneEl(e) !== scene) continue; /* a nested scene looks after itself */
      if (e.hasAttribute('data-b')) e.setAttribute('data-b-on', '');
      if (e.hasAttribute('data-paint')) e.setAttribute('data-painted', '');
    }
  }
  /** Fade in whatever a finished scene never targeted. */
  function sweep(scene: Element) {
    for (const e of [scene, ...scene.querySelectorAll('[data-b]')]) {
      if (e !== scene && sceneEl(e) !== scene) continue;
      if (!isHidden(e)) continue;
      e.setAttribute('data-b-on', '');
      anim(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    }
    if (scene.hasAttribute('data-paint')) scene.setAttribute('data-painted', '');
    scene.querySelectorAll('[data-paint]').forEach((e) => {
      if (sceneEl(e) === scene) e.setAttribute('data-painted', '');
    });
  }
  /** Text types in: the unseen remainder stays in the layout (hidden), so nothing shifts. */
  function typeText(el: Element, dur: number): Promise<void> {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts: { node: Text; full: string; rest: HTMLElement }[] = [];
    let total = 0;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!n.data.trim()) continue;
      parts.push({ node: n, full: n.data, rest: h('span', 'lsw-rest') });
      total += n.data.length;
    }
    if (!total) return Promise.resolve();
    for (const p of parts) {
      p.rest.textContent = p.full;
      p.node.data = '';
      p.node.after(p.rest);
    }
    const restore = () => {
      for (const p of parts) {
        p.node.data = p.full;
        p.rest.remove();
      }
      typing.delete(restore);
    };
    typing.add(restore);
    return tween(dur, (p) => {
      let left = Math.round(p * total);
      for (const part of parts) {
        const k = clamp(left, 0, part.full.length);
        left -= k;
        if (part.node.data.length !== k) {
          part.node.data = part.full.slice(0, k);
          part.rest.textContent = part.full.slice(k);
        }
      }
    }).then(restore);
  }
  /** Reveal an element and any still-hidden pieces inside it, each in its own way. */
  function reveal(el: Element, dur: number): Promise<void> {
    const items = [el, ...el.querySelectorAll('[data-b]')].filter(isHidden);
    if (!items.length) return Promise.resolve();
    const step = Math.min(90, 520 / items.length);
    const jobs = items.map((it, i) =>
      sleep(i * step).then(() => {
        it.setAttribute('data-b-on', '');
        const how = it.getAttribute('data-b');
        if (how === 'type') return typeText(it, clamp((it.textContent || '').length * 13, 300, 900));
        if (how === 'drop')
          return anim(it, [{ opacity: 0, transform: 'translateY(-16px) scale(.975)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
        if (how === 'wipe')
          return anim(it, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: Math.max(dur, 520), easing: 'cubic-bezier(.33,1,.68,1)' });
        return anim(it, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      }),
    );
    return Promise.all(jobs).then(() => {});
  }

  function rectOf(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }
  /** The lines of text inside an element, so an edit can select the words like a real selection. */
  function lineRects(el: Element): Rect[] {
    const found: Rect[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n as Text).data.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 1 && r.height > 1) found.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
      }
    }
    found.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines: Rect[] = [];
    for (const r of found) {
      const l = lines[lines.length - 1];
      if (l && Math.abs(l.y + l.h / 2 - (r.y + r.h / 2)) < Math.min(l.h, r.h) * 0.5) {
        const x0 = Math.min(l.x, r.x);
        const y0 = Math.min(l.y, r.y);
        l.w = Math.max(l.x + l.w, r.x + r.w) - x0;
        l.h = Math.max(l.y + l.h, r.y + r.h) - y0;
        l.x = x0;
        l.y = y0;
      } else lines.push({ ...r });
    }
    /* Tight line spacing makes neighbouring boxes overlap: meet in the middle instead. */
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1];
      const b = lines[i];
      if (b.y < a.y + a.h) {
        const mid = (a.y + a.h + b.y) / 2;
        const bottom = b.y + b.h;
        a.h = mid - a.y;
        b.y = mid;
        b.h = bottom - mid;
      }
    }
    return lines.map((l) => ({ x: l.x - 5, y: l.y, w: l.w + 10, h: l.h }));
  }

  /* --------------------------------------------------------------- beats */
  const appear = (a: Agent): Beat => async () => {
    a.fx0.style.opacity = '1';
    anim(a.fx0, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    ripple(a.x, a.y, a, true);
    await sleep(260);
  };
  const split = (a: Agent, p: Agent): Beat => async () => {
    const pp = docPos(p);
    a.x = pp.x;
    a.y = pp.y;
    place(a);
    const i = p.kids++;
    const ang = ((-68 + i * 52) * Math.PI) / 180;
    const d = (compact ? 78 : 130) + (i % 2) * (compact ? 22 : 34);
    const rx = clamp(pp.x + Math.cos(ang) * d, 28, cw - 28);
    const ry = clamp(pp.y + Math.sin(ang) * d, scrollY + 28, scrollY + ch - 90);
    a.fx0.style.opacity = '1';
    anim(a.fx0, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, easing: SPRING });
    ripple(pp.x, pp.y, a);
    tether(p, a, 1000, a.hue);
    await moveTo(a, rx, ry, { dur: 760 });
    press(a);
  };
  /** Wait at the bottom edge of the window for work that is further down the page. */
  const park = (a: Agent): Beat => async () => {
    a.parked = true;
    toEdge(a);
    const s = slot(a);
    await moveTo(a, s.x, s.y);
    a.el.classList.add('parked');
    measure(a);
  };
  const merge = (a: Agent): Beat => async () => {
    toDoc(a);
    const p = a.parent && !a.parent.dead ? a.parent : null;
    if (p) {
      const pp = docPos(p);
      /* If the parent is far off screen, fly to just past the edge rather than across the whole page. */
      const ty = clamp(pp.y, scrollY - 90, scrollY + ch + 90);
      tether(a, p, 800, a.hue);
      await moveTo(a, pp.x, ty, { dur: 640 });
    }
    anim(a.fx0, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.35)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    ripple(a.x, a.y, a);
    await sleep(300);
    a.dead = true;
    a.el.remove();
    lightAt(a);
  };
  const goHome = (a: Agent): Beat => async () => {
    toDoc(a);
    await sleep(380);
    if (a.q.length) return; /* new work arrived: skip the trip */
    const hp = homePos();
    await moveTo(a, hp.x, hp.y);
  };

  async function edit(a: Agent, e: Ev, el: Element, f: number) {
    let lines = lineRects(el);
    if (!lines.length || lines.length > 8) {
      const r = rectOf(el);
      lines = [{ x: r.x, y: r.y, w: Math.min(r.w, 1100), h: Math.min(r.h, 280) }];
    }
    const first = lines[0];
    const last = lines[lines.length - 1];
    const sx = first.x + Math.min(10, first.w * 0.2);
    const sy = first.y + first.h / 2;
    await moveTo(a, sx, sy, { f });
    press(a);
    ripple(sx, sy, a);
    const total = lines.reduce((n, l) => n + l.w, 0);
    const dur = clamp(260 + total * 0.3, 380, 760) / f;
    const ex = last.x + last.w - Math.min(12, last.w * 0.15);
    const ey = last.y + last.h / 2 + (lines.length === 1 && last.h > 40 ? Math.min(last.h * 0.18, 30) : 0);
    let at = 0;
    const sweeps = lines.map((l) => {
      const sel = box('lsw-sel', l, a);
      const d = (dur * l.w) / total;
      const job = anim(sel, [{ clipPath: 'inset(0 100% 0 0 round 4px)' }, { clipPath: 'inset(0 0% 0 0 round 4px)' }], { duration: d, delay: at, easing: 'cubic-bezier(.33,1,.68,1)', fill: 'backwards' });
      at += d;
      fade(sel, dur + 650 / f, 420);
      return job;
    });
    await Promise.all([moveTo(a, ex, ey, { dur, ease: 'out', straight: lines.length === 1 }), ...sweeps, reveal(el, dur)]);
    chip(a, { add: e.added ?? 0, del: e.removed ?? 0, name: base(e.file) }, first, 1300 / f);
    await sleep(160 / f);
  }
  async function write(a: Agent, e: Ev, el: Element, f: number) {
    const r = rectOf(el);
    await moveTo(a, r.x + r.w * 0.5, r.y + Math.min(r.h * 0.5, 64), { f });
    press(a);
    const g = box('lsw-ghost', r, a);
    if (r.y - scrollY < 34) g.classList.add('low');
    g.append(h('span', 'tab', base(e.file)));
    await anim(g, [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 220 / f, easing: 'cubic-bezier(.2,.8,.2,1)' });
    await sleep(150 / f);
    await reveal(el, 460 / f);
    chip(a, { add: e.added ?? undefined, name: base(e.file), mid: true }, r, 1150 / f);
    fade(g, 240 / f, 420);
    await sleep(180 / f);
  }
  async function paint(a: Agent, e: Ev, el: Element, f: number) {
    let r = rectOf(el);
    const top = Math.max(r.y, scrollY);
    const bot = Math.min(r.y + r.h, scrollY + ch);
    if (bot - top > 80) r = { x: r.x, y: top, w: r.w, h: bot - top }; /* paint the part you can see */
    const x1 = r.x + r.w * 0.82;
    const y1 = r.y + r.h * 0.6;
    await moveTo(a, r.x + r.w * 0.14, r.y + r.h * 0.3, { f });
    press(a);
    const dur = 900 / f;
    const wrap = box('lsw-paint', r, a);
    const tint = h('i', 'tint');
    const band = h('i', 'band');
    wrap.append(tint, band);
    anim(tint, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: dur * 1.7, fill: 'forwards' }).then(() => wrap.remove());
    anim(
      band,
      [
        { transform: 'translateX(-80%) skewX(-12deg)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.8 },
        { transform: 'translateX(230%) skewX(-12deg)', opacity: 0 },
      ],
      { duration: dur * 1.15, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' },
    );
    sleep(dur * 0.42).then(() => paintNow(el));
    await moveTo(a, x1, y1, { dur, ease: 'io' });
    chip(a, { add: e.added ?? 0, del: e.removed ?? 0, name: base(e.file), meta: 'styles' }, { x: x1 - 40, y: y1 - 10, w: 60, h: 20 }, 1200 / f);
    await sleep(140 / f);
  }
  /** One edit event: travel, play the verb for its tool, reveal its target. */
  const editBeat = (a: Agent, e: Ev, el: Element, f: number, done: () => void): Beat => async () => {
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        /* Not rendered at this size (for example a phone-only link): just make sure it is shown. */
        reveal(el, 0);
        paintNow(el);
        return;
      }
      toDoc(a);
      if (STYLE.test(e.file || '')) await paint(a, e, el, f);
      else if (e.tool === 'Write') await write(a, e, el, f);
      else await edit(a, e, el, f);
      edits++;
      hudRender();
    } finally {
      done();
    }
  };
  const cmdOf = (e: Ev) => {
    const c = e.summary || '$ …';
    return c.charAt(0) === '$' ? c : '$ ' + c;
  };
  const bashStart = (a: Agent, e: Ev): Beat => async () => {
    const t = h('div', 'lsw-term run');
    t.append(h('i', 'st'), h('span', 'tx', cmdOf(e)));
    a.stack.append(t);
    a.term = t;
    measure(a);
    await anim(t, [{ opacity: 0, transform: 'translateY(-4px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: SPRING });
  };
  const bashEnd = (a: Agent, e: Ev): Beat => async () => {
    if (!a.term) {
      await bashStart(a, e)();
      await sleep(600);
    }
    const t = a.term!;
    a.term = null;
    t.className = 'lsw-term ok';
    t.lastChild!.textContent = '✓ ' + cmdOf(e);
    measure(a);
    anim(t, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    await sleep(1050);
    await anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    t.remove();
    measure(a);
  };
  const glance = (a: Agent, e: Ev): Beat => async () => {
    const c = h('div', 'lsw-chip dim');
    c.style.setProperty('--h', String(a.hue));
    c.append(h('i', 'sw'), h('span', '', e.summary || (e.tool || 'reading').toLowerCase() + ' ' + base(e.file)));
    a.stack.append(c);
    measure(a);
    anim(c, [{ opacity: 0, transform: 'translateX(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    await sleep(720);
    await anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
    c.remove();
    measure(a);
  };

  /* ------------------------------------------------------- scenes and the clock */
  const scenes = new Map<Element, Scene>();
  for (const el of document.querySelectorAll('[data-scene]')) {
    scenes.set(el, { el, evs: [], state: 0, left: 0, live: el.getBoundingClientRect().top < innerHeight * 0.9 });
  }
  const targetOf = new Map<Ev, { el: Element; sc: Scene | null }>();
  const idOf = (e: Ev) => e.agent?.id || 'main';
  for (const e of all) {
    if (e.kind !== 'tool.post' || !EDIT.test(e.tool || '') || !e.target) continue;
    let el: Element | null = null;
    try {
      el = document.querySelector(e.target);
    } catch {}
    if (!el) continue;
    const s = sceneEl(el);
    targetOf.set(e, { el, sc: (s && scenes.get(s)) || null });
  }

  /* Phones get the short version: the first screen and the next scene, with at most three cursors. */
  let evs = all;
  if (compact) {
    const kept = new Set<Scene>();
    let extra = 0;
    for (const sc of scenes.values()) {
      const has = all.some((e) => targetOf.get(e)?.sc === sc);
      const nested = [...kept].some((k) => k.el !== sc.el && k.el.contains(sc.el));
      if (sc.live || (has && nested)) kept.add(sc);
      else if (has && extra < 1) {
        kept.add(sc);
        extra++;
      }
    }
    const order: string[] = [];
    for (const e of all) if (e.kind === 'agent.start' && idOf(e) !== 'main') order.push(idOf(e));
    const works = (id: string, live: boolean) => all.some((e) => idOf(e) === id && targetOf.get(e)?.sc && kept.has(targetOf.get(e)!.sc!) && targetOf.get(e)!.sc!.live === live);
    const keep = order.filter((id) => works(id, true)).slice(0, 2);
    for (const id of order) if (keep.length < 2 && !keep.includes(id) && works(id, false)) keep.push(id);
    const remap = new Map<string, string>();
    let rr = 0;
    evs = [];
    for (const e of all) {
      const id = idOf(e);
      const own = id === 'main' || keep.includes(id);
      const tg = targetOf.get(e);
      if (tg) {
        if (!tg.sc || !kept.has(tg.sc)) continue;
        if (own || !keep.length) evs.push(e);
        else {
          if (!remap.has(id)) remap.set(id, keep[rr++ % keep.length]);
          const copy = { ...e, agent: { id: remap.get(id)! } };
          targetOf.set(copy, tg);
          evs.push(copy);
        }
      } else if (own) evs.push(e);
    }
    for (const sc of scenes.values()) if (!kept.has(sc)) sc.state = 2;
  }

  const clock: Ev[] = [];
  const starts = new Set<string>();
  for (const e of evs) {
    const id = idOf(e);
    if (e.kind === 'agent.start') {
      if (id !== 'main') {
        starts.add(id);
        clock.push(e);
      }
    } else if (e.kind === 'agent.stop') clock.push(e);
    else if (e.kind === 'tool.pre' || e.kind === 'tool.post') {
      const tool = e.tool || '';
      const tg = targetOf.get(e);
      if (tg) {
        if (!tg.sc || tg.sc.live) {
          clock.push(e);
          if (tg.sc) tg.sc.left++;
        } else {
          tg.sc.evs.push(e);
          tg.sc.left++;
          pending.set(id, (pending.get(id) || 0) + 1);
        }
      } else if (tool === 'Bash' || (GLANCE.test(tool) && e.kind === 'tool.pre')) clock.push(e);
    }
  }
  /* Where waiting agents line up along the bottom edge, in the order they were spawned. */
  const slots = [...pending.keys()].sort((a, b) => [...starts].indexOf(a) - [...starts].indexOf(b));
  function slot(a: Agent): { x: number; y: number } {
    const k = Math.max(0, slots.indexOf(a.id));
    const n = slots.length;
    const left = compact ? 28 : Math.min(bar.getBoundingClientRect().right + 44, cw * 0.4);
    const right = cw - (compact ? 120 : 130);
    /* One row with the counter: pointer on top, name pill level with the counter pill. */
    return { x: left + (right - left) * (n < 2 ? (compact ? 1 : 0.5) : k / (n - 1)), y: ch - (compact ? 104 : 58) };
  }

  let liveLeft = 0; /* clock beats still to finish */
  let topDone = false;
  let finishing = false;
  const sceneBeatDone = (sc: Scene | null) => {
    if (!sc) return;
    sc.left--;
    if (sc.left <= 0 && sc.state !== 2 && (!sc.live || clockPending === 0)) {
      sweep(sc.el);
      sc.state = 2;
    }
  };

  function dispatch(e: Ev) {
    const id = idOf(e);
    if (e.kind === 'agent.start') return void spawn(e.agent!);
    const a = agents.get(id) || spawn({ id, label: e.agent?.label, parent: 'main' });
    if (a.dead) {
      sceneBeatDone(targetOf.get(e)?.sc || null);
      return;
    }
    if (e.kind === 'agent.stop') {
      a.stopReq = true;
      return settle(a);
    }
    const tg = targetOf.get(e);
    liveLeft++;
    const done = () => {
      liveLeft--;
    };
    if (tg) enqueue(a, editBeat(a, e, tg.el, 1, () => (done(), sceneBeatDone(tg.sc))));
    else {
      const beat = e.tool === 'Bash' ? (e.kind === 'tool.pre' ? bashStart(a, e) : bashEnd(a, e)) : glance(a, e);
      enqueue(a, () => beat().finally(done));
    }
  }

  const ready = (id: string, e: Ev): Promise<Agent> => {
    const a = agents.get(id);
    if (a) return Promise.resolve(a);
    if (!starts.has(id) || clockPending === 0) return Promise.resolve(spawn({ id, label: e.agent?.label, parent: 'main' }));
    return new Promise((res) => {
      const list = waiters.get(id) || [];
      list.push(res);
      waiters.set(id, list);
    });
  };
  async function playScene(sc: Scene) {
    if (sc.state !== 0) return;
    sc.state = 1;
    io.unobserve(sc.el);
    for (const e of sc.evs) {
      const id = idOf(e);
      const a = await ready(id, e);
      if (!alive) return;
      const done = () => {
        pending.set(id, (pending.get(id) || 1) - 1);
        sceneBeatDone(sc);
      };
      if (a.dead) done();
      else enqueue(a, editBeat(a, e, targetOf.get(e)!.el, 1.25, done));
    }
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const sc = scenes.get(en.target);
        if (en.isIntersecting && sc) playScene(sc);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );

  /** Moves the show on: first screen finished, then everything finished. */
  function check() {
    if (!alive || finishing) return;
    if (!topDone && clockPending === 0 && liveLeft === 0) {
      topDone = true;
      for (const sc of scenes.values()) {
        if (sc.live && sc.state !== 2) {
          sweep(sc.el);
          sc.state = 2;
        }
      }
      /* A timeline with no agent.stop still ends: everyone is free to go once their work is done. */
      for (const a of agents.values()) {
        if (a.id !== 'main' && !a.dead) {
          a.stopReq = true;
          settle(a);
        }
      }
      if (opts.replay) {
        opts.replay.textContent = 'Replay ↺';
        opts.replay.hidden = false;
      }
    }
    if (!topDone) return;
    for (const sc of scenes.values()) if (sc.state !== 2) return;
    for (const a of agents.values()) if (a.id !== 'main' && (!a.dead || a.busy)) return;
    const main = agents.get('main');
    if (main && (main.busy || main.q.length)) return;
    finishing = true;
    const done = () => end(true);
    if (main && !main.dead) enqueue(main, () => goHome(main)().then(done));
    else done();
  }

  /* ----------------------------------------------------------------- HUD */
  let lastSec = -1;
  function hudRender() {
    hAg.textContent = spawned + (spawned === 1 ? ' agent' : ' agents');
    hEd.textContent = edits + (edits === 1 ? ' edit' : ' edits');
    if (hSws.childElementCount !== Math.min(spawned, 6)) {
      hSws.textContent = '';
      let i = 0;
      for (const a of agents.values()) {
        if (i++ >= 6) break;
        const d = h('i');
        d.style.setProperty('--h', String(a.hue));
        hSws.append(d);
      }
    }
  }
  function hudTime() {
    const s = Math.floor(elapsed / 1000);
    if (s === lastSec) return;
    lastSec = s;
    hTm.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* -------------------------------------------------------------- lifecycle */
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') end(false);
  };
  const onVis = () => {
    for (const a of anims) {
      try {
        document.hidden ? a.pause() : a.play();
      } catch {}
    }
    if (!document.hidden) kick();
  };
  const onResize = () => {
    sizeCanvas();
    for (const a of agents.values()) {
      if (a.parked && !a.move && !a.dead) {
        const s = slot(a);
        a.x = s.x;
        a.y = s.y;
        place(a);
      }
      if (!a.dead) flip(a);
    }
  };
  skip.addEventListener('click', () => end(false));
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize, { passive: true });

  /** Natural finish (main is home, everything built) or Skip (jump to the finished page). */
  function end(natural: boolean) {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    for (const a of anims) {
      try {
        a.cancel();
      } catch {}
    }
    anims.clear();
    for (const restore of [...typing]) restore();
    timers = [];
    tweens = [];
    layer.remove();
    skip.remove();
    lightRo?.disconnect();
    if (lights) {
      lights.classList.add('out');
      setTimeout(() => lights.remove(), 800);
    }
    heroEl?.style.removeProperty('--gx');
    if (natural) {
      hud.classList.remove('live');
      hSt.textContent = 'done';
      setTimeout(() => bar.classList.add('gone'), 2600);
      setTimeout(() => bar.remove(), 3300);
    } else bar.remove();
    showFinished(opts, 'Replay ↺');
    if (current === handle) current = null;
  }

  /* ------------------------------------------------------------------- go */
  for (const sc of scenes.values()) {
    if (sc.state === 2) instant(sc.el); /* left out of the short version */
    else if (!sc.live) {
      if (sc.evs.length) io.observe(sc.el);
      else {
        instant(sc.el); /* nothing in the timeline builds it */
        sc.state = 2;
      }
    }
  }
  const last = clock.length ? clock[clock.length - 1].t : 0;
  const scale = last > FIRST_SCREEN_MS ? FIRST_SCREEN_MS / last : 1;
  clockPending = clock.length;
  spawn({ id: 'main', label: 'main' });
  for (const e of clock) {
    sleep(350 + e.t * scale).then(() => {
      clockPending--;
      dispatch(e);
      if (clockPending === 0) check();
    });
  }
  if (!clock.length) sleep(400).then(check);

  const handle = { stop: () => end(false) };
  return handle;
}
