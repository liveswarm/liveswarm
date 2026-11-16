/**
 * Everything that changes when the repo, domain or providers go live is here.
 * The GitHub repo is public. The domain is not registered yet.
 */
const repo = 'liveswarm/liveswarm';

export const site = {
  name: 'Liveswarm',
  /** Planned domain. Used for canonical and Open Graph URLs only. */
  url: 'https://liveswarm.dev',
  repo,
  repoUrl: `https://github.com/${repo}`,
  starsApi: `https://api.github.com/repos/${repo}`,
  sponsorUrl: 'https://github.com/sponsors/liveswarm',
  /** The install line shown on the page. */
  install: 'claude plugin install liveswarm --marketplace liveswarm/liveswarm',
  title: 'Liveswarm: watch your AI build it',
  description:
    'Every AI agent becomes a named cursor on the app it is building. Watch Claude Code and its subagents split up the work and put your app together, live. Free and open source.',
  /** The company behind Liveswarm, shown in the footer. */
  company: 'Luven Technologies LLC',
  /** Contact address, shown in the footer. */
  contact: 'everest@luven.ai',
  /**
   * The recorded run in "Real run, real agents": one real Claude Code session building an invented
   * hotel page called Nocturne. It is a timelapse, so `label` is shown wherever the footage plays.
   * Clips are cut from ../liveswarm/media/nocturne-*.mp4 (see README, "Media").
   */
  demo: {
    label: 'Real Claude Code session, sped up',
    summary: 'thirteen named agent cursors build a hotel page called Nocturne from a black screen.',
    length: '1:09',
    /** Desktop and tablets: the wide cut. `loop` plays silently until the visitor asks for `full`. */
    wide: {
      loop: ['/media/nocturne-loop.mp4'],
      full: ['/media/nocturne-full.webm', '/media/nocturne-full.mp4'],
      poster: '/media/nocturne-poster.jpg',
      width: 1920,
      height: 1080,
    },
    /** Phones (720px and under): the tall cut. */
    tall: {
      loop: ['/media/nocturne-tall-loop.mp4'],
      full: ['/media/nocturne-tall.mp4'],
      poster: '/media/nocturne-tall-poster.jpg',
      width: 720,
      height: 1280,
    },
    /** Real numbers from the session (the same ones on the video's end card). */
    tally: [
      { value: '13', label: 'agents' },
      { value: '117', label: 'edits' },
      { value: '4 min 38 s', label: 'of real time' },
    ],
    /** The three parts of the 69-second cut, in seconds of video. The last one ends on the count. */
    parts: [
      { at: 0, to: 19, time: '0:00', title: 'The split', speed: 'Real speed' },
      { at: 19, to: 44, time: '0:19', title: 'The build', speed: 'Sped up 5 to 30 times' },
      { at: 44, to: 69, time: '0:44', title: 'The finished page', speed: 'Real speed, then the end card' },
    ],
    /** The agents, in the order they appear, with the colours they have in the recording. */
    cast: [
      { label: 'main', hue: 268 },
      { label: 'Night sky', hue: 24 },
      { label: 'Hero', hue: 176 },
      { label: 'Nav', hue: 84 },
      { label: 'Arrival', hue: 336 },
      { label: 'Rooms', hue: 222 },
      { label: 'Star program', hue: 134 },
      { label: 'Dining', hue: 304 },
      { label: 'Rituals', hue: 52 },
      { label: 'The drive', hue: 157.5 },
      { label: 'Field notes', hue: 295 },
      { label: 'Booking', hue: 72.5 },
      { label: 'Footer', hue: 210 },
    ],
    /** The tall clip in the phone frame under "Record and share". */
    share: { src: '/media/nocturne-share.mp4', poster: '/media/nocturne-share-poster.jpg' },
  },
  /** 'vercel' loads Vercel Web Analytics on deployed builds. Anything else sends no events. */
  analytics: (import.meta.env.PUBLIC_ANALYTICS as string | undefined) ?? 'vercel',
};
