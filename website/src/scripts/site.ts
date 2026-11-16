/** Small page behaviours: theme, copy, stars, video, email, and starting the hero build. */
import { site } from '../config';
import { track } from './track';

const root = document.documentElement;
const $$ = <T extends Element>(sel: string, el: ParentNode = document) => Array.from(el.querySelectorAll<T>(sel));

/* ---- analytics: loaded only on a deployed build, never on localhost ---- */
const local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.host) || location.protocol === 'file:';
if (import.meta.env.PROD && site.analytics === 'vercel' && !local) {
  import('@vercel/analytics').then((m) => m.inject()).catch(() => {});
}
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLElement>('[data-track]');
  if (a) track(a.dataset.track as 'github_click', a.dataset.where ? { where: a.dataset.where } : undefined);
});

/* ---- copy the install command ---- */
$$<HTMLElement>('[data-install]').forEach((box) => {
  const btn = box.querySelector<HTMLButtonElement>('[data-copy]')!;
  const label = box.querySelector<HTMLElement>('[data-copy-label]')!;
  const status = box.querySelector<HTMLElement>('[data-copy-status]')!;
  const code = box.querySelector<HTMLElement>('[data-cmd]')!;
  let timer = 0;
  const show = (text: string, said: string, done: boolean) => {
    label.textContent = text;
    status.textContent = said;
    btn.classList.toggle('is-done', done);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = 'Copy';
      status.textContent = '';
      btn.classList.remove('is-done');
    }, 2200);
  };
  btn.addEventListener('click', async () => {
    track('install_copy', { where: box.dataset.where || '' });
    try {
      await navigator.clipboard.writeText(site.install);
      show('Copied', 'Install command copied.', true);
    } catch {
      /* No clipboard access: select the command so one keypress copies it. */
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      show('Selected', 'Command selected. Press Control or Command C to copy.', false);
    }
  });
});

/* ---- live star count: shown only when GitHub really returns one ---- */
function showStars(n: number) {
  const text = n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  $$<HTMLElement>('[data-stars]').forEach((el) => {
    el.textContent = text;
    el.hidden = false;
    el.setAttribute('aria-label', `${n} stars`);
  });
}
async function loadStars() {
  try {
    const cached = sessionStorage.getItem('stars');
    if (cached) {
      const { n, at } = JSON.parse(cached);
      if (Date.now() - at < 10 * 60 * 1000 && Number.isFinite(n)) return showStars(n);
    }
  } catch {}
  try {
    const res = await fetch(site.starsApi, { headers: { accept: 'application/vnd.github+json' } });
    if (!res.ok) return; /* repo missing, private or rate-limited: no number */
    const n = (await res.json()).stargazers_count;
    if (typeof n !== 'number' || n < 0) return;
    showStars(n);
    try {
      sessionStorage.setItem('stars', JSON.stringify({ n, at: Date.now() }));
    } catch {}
  } catch {}
}
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
idle(loadStars);

/* ---- the real run: poster first, a silent loop while it is on screen, the full cut on request ---- */
const demo = document.querySelector<HTMLElement>('[data-demo]');
if (demo) {
  const video = demo.querySelector<HTMLVideoElement>('video')!;
  const playBtn = demo.querySelector<HTMLButtonElement>('[data-video-play]')!;
  const playLabel = demo.querySelector<HTMLElement>('[data-play-label]')!;
  const reel = document.querySelector<HTMLElement>('#demo-reel');
  const parts = reel ? [...reel.querySelectorAll<HTMLButtonElement>('[data-seek]')] : [];
  const phone = matchMedia('(max-width: 720px)');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saver = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
  const pick = (list: string | undefined) => {
    const all = (list || '').split(',').filter(Boolean);
    return all.find((src) => !src.endsWith('.webm') || video.canPlayType('video/webm; codecs="vp9"') !== '') || all[all.length - 1];
  };
  const src = (kind: 'loop' | 'full' | 'poster') => {
    const key = (phone.matches ? 'tall' : 'wide') + kind[0].toUpperCase() + kind.slice(1);
    return kind === 'poster' ? demo.dataset[key]! : pick(demo.dataset[key]);
  };
  let mode: 'idle' | 'loop' | 'full' = 'idle';
  let near = false;
  let seen = false;
  let tracked = false;

  /* Take over from the plain <video controls> that visitors without JavaScript get. */
  video.querySelectorAll('source').forEach((el) => el.remove());
  video.controls = false;
  video.muted = true;
  playBtn.hidden = false;
  playBtn.setAttribute('aria-label', 'Watch the full run, 1 minute 9 seconds');
  demo.classList.add('is-ready');

  const showPoster = () => {
    if (near) video.poster = src('poster');
  };
  const loop = () => {
    if (mode === 'full' || calm || saver) return;
    if (mode !== 'loop') {
      mode = 'loop';
      video.loop = true;
      video.muted = true;
      video.src = src('loop');
    }
    video.play().catch(() => {});
  };
  const mark = () => {
    if (!reel) return;
    const t = mode === 'full' ? video.currentTime : -1;
    for (const b of parts) {
      const at = Number(b.dataset.seek);
      const to = Number(b.dataset.until);
      const done = t < 0 ? 0 : Math.min(1, Math.max(0, (t - at) / (to - at)));
      b.style.setProperty('--p', done.toFixed(4));
      b.classList.toggle('is-on', t >= at && t < to);
    }
  };
  const full = (at = 0) => {
    const fresh = mode !== 'full';
    mode = 'full';
    demo.classList.add('is-full');
    playBtn.hidden = true;
    video.loop = false;
    video.controls = true;
    if (fresh) {
      video.src = src('full');
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (at > 0) video.currentTime = at;
        },
        { once: true },
      );
    } else video.currentTime = at;
    video.play().catch(() => {});
    if (!tracked) {
      tracked = true;
      track('video_play', { cut: phone.matches ? 'tall' : 'wide' });
    }
  };

  new IntersectionObserver(
    (entries, io) => {
      if (entries.some((e) => e.isIntersecting)) {
        near = true;
        showPoster();
        io.disconnect();
      }
    },
    { rootMargin: '700px 0px' },
  ).observe(demo);
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        seen = e.isIntersecting;
        if (mode === 'full') continue;
        if (seen) loop();
        else if (!video.paused) video.pause();
      }
    },
    { threshold: 0.25 },
  ).observe(demo);

  playBtn.addEventListener('click', () => full(0));
  parts.forEach((b) => b.addEventListener('click', () => full(Number(b.dataset.seek))));
  video.addEventListener('timeupdate', mark);
  video.addEventListener('seeked', mark);
  video.addEventListener('ended', () => {
    if (mode !== 'full') return;
    playLabel.textContent = 'Watch it again';
    playBtn.hidden = false;
    video.controls = false;
  });
  /* Turning a phone or resizing across the breakpoint swaps wide and tall, unless the full cut is playing. */
  phone.addEventListener('change', () => {
    if (mode === 'full') return;
    showPoster();
    if (mode === 'loop') {
      mode = 'idle';
      if (seen) loop();
    }
  });
}

/* ---- the small loop in the phone frame: loads in view, respects reduced motion and data saver ---- */
$$<HTMLVideoElement>('[data-loop-video]').forEach((v) => {
  const saver = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          if (!v.poster) v.poster = v.dataset.poster!;
          if (calm || saver) continue;
          if (!v.src) v.src = v.dataset.src!;
          v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }
    },
    { rootMargin: '200px 0px' },
  ).observe(v);
});

/* ---- the before/after loop only runs while it is on screen ---- */
$$<HTMLElement>('[data-loop]').forEach((el) => {
  new IntersectionObserver((entries) => {
    for (const e of entries) el.classList.toggle('is-paused', !e.isIntersecting);
  }).observe(el);
});

/* ---- email: one field, one endpoint ---- */
$$<HTMLFormElement>('[data-email]').forEach((form) => {
  const status = form.querySelector<HTMLElement>('[data-email-status]')!;
  const input = form.querySelector<HTMLInputElement>('input[type=email]')!;
  const button = form.querySelector<HTMLButtonElement>('button')!;
  const say = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  };
  form.noValidate = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say('That does not look like an email address. Check it and try again.', true);
      input.focus();
      return;
    }
    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      /* The list is not connected yet. Say so rather than pretend; nothing is sent or stored. */
      say('Thanks! The list is not switched on yet, so nothing was saved. Check back at launch.');
      return;
    }
    button.disabled = true;
    say('Adding you…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(String(res.status));
      track('email_submit');
      form.reset();
      say('Thanks! You are on the list.');
    } catch {
      say('That did not go through. Check your connection and try again.', true);
    } finally {
      button.disabled = false;
    }
  });
});

/* ---- the hero build ---- */
const replay = document.querySelector<HTMLButtonElement>('[data-replay]');
let player: Promise<typeof import('./player')> | null = null;
const loadPlayer = () => (player ??= import('./player'));

function standDown() {
  clearTimeout((window as unknown as { __lswFailsafe?: number }).__lswFailsafe);
  root.classList.remove('build');
  if (replay) {
    replay.textContent = 'Play the build';
    replay.hidden = false;
  }
}
replay?.addEventListener('click', () => {
  track('replay_click');
  loadPlayer()
    .then((m) => m.play({ replay }))
    .catch(standDown);
});

if (root.classList.contains('build')) {
  if (scrollY > 80 || location.hash.length > 1) {
    /* Opened part-way down (a link to a section, or a restored scroll position): show the finished page. */
    standDown();
  } else {
    /* Let the text paint first, then fetch the player. */
    requestAnimationFrame(() =>
      setTimeout(() => {
        loadPlayer()
          .then((m) => m.play({ replay }))
          .catch(standDown);
      }, 0),
    );
  }
} else if (replay) {
  /* Reduced motion (or the build is switched off): the page is already finished, and playing it is a choice. */
  replay.textContent = 'Play the build';
  replay.hidden = false;
}
