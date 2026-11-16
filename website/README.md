# Liveswarm website

The launch site for Liveswarm. One static page, built with Astro, black theme only. The hero is the
demo: a swarm of named agent cursors builds the page in front of the visitor.

Live at https://liveswarm.dev, deployed with `vercel deploy --prod` from this folder (the Vercel
project is not connected to GitHub, so a push does not deploy). Repo and domain are set in `src/config.ts`.

## Run it

```sh
npm install
npm run dev        # http://127.0.0.1:4321
```

```sh
npm run build      # static site in dist/
npm run preview    # serve dist/
npm run budget     # check the script and timeline weight budgets (after a build)
npm run og         # re-render public/og.png from the Nocturne footage (needs ffmpeg and Chrome)
```

Needs Node 22.12 or newer. Astro is pinned to version 6 because Astro 7 needs Node 22.23.4+,
which this machine did not have. `npm audit` flags Astro 6 for issues in server rendering, image
optimisation and the Windows dev server; this site is static HTML and uses none of those. When
Node is updated, `npm install astro@latest` clears the warnings.

Useful while working: add `?nobuild` to the URL to see the finished page without the animation.
`node tools/look.mjs <base-url> '<json list of shots>'` takes screenshots in a real Chrome with
pointer, scroll and key input (see the top of the file).

## How the hero works

- The finished page is plain HTML. A small inline script in `src/layouts/Base.astro` adds
  `html.build` before first paint, but only when JavaScript is on, reduced motion is off, and the
  page is opened at the top. CSS then hides every `[data-b]` element until it is built. The
  headline, subhead and install command are never hidden.
- `src/scripts/player.ts` loads after the text has painted and plays
  `public/build-timeline.json`. Each event moves one agent's cursor to its `target` (a CSS
  selector), plays the verb for its tool, and reveals the element.
- Every `[data-scene]` element is a scene. Scenes on screen at the start play on the clock (about
  15 seconds). Scenes further down wait: their agent parks at the bottom edge of the window and
  builds the scene when it scrolls into view.
- Skip (button or Escape) jumps to the finished page. Replay is in the caption under the hero.
- Reduced motion: no build, finished page, and a "Play the build" button instead.
- Phones (720px and under) get a short version: at most three cursors, the first screen plus one
  section. The rest of the page is simply there.
- The tab being hidden pauses it. Nothing in the cursor layer takes clicks or focus.

### Replacing the timeline with a real run

`public/build-timeline.json` uses the event shape the Liveswarm engine emits (see
`../liveswarm/CONTRACT.md`) plus one extra field, `target`. To swap in a recorded run, replace the
`events` array. No code changes are needed:

- `agent.start` / `agent.stop` create and merge cursors. Colours follow spawn order.
- `tool.post` with tool `Edit` or `MultiEdit` is a selection sweep; `Write` is a ghost box that
  fills in; any edit whose `file` is a stylesheet is a paint sweep; `Bash` (`tool.pre` then
  `tool.post`) is the terminal pill; `Read`/`Grep` (`tool.pre`) is a small glance chip.
- Only the first-screen events use `t`. If they run longer than 13.5 seconds they are scaled down.
- Elements a scene never targets are revealed when that scene finishes, so a timeline cannot leave
  part of the page hidden.

Markup hooks: `data-b` (hidden until built; values `type`, `drop`, `wipe` pick the reveal),
`data-paint` (grey until a stylesheet edit paints it), `data-scene` (a section that builds as one).

Until a real recording is swapped in, the caption under the hero says the build is a scripted
preview. Change that line in `src/components/Hero.astro` (and the last FAQ answer) when it is real.

## Look, light and motion

The page is black and lit from above: one soft light over the hero and over the last call to
action, panels with a fine edge that is brighter at the top, and a hairline of light between
sections. Buttons are white. Colour belongs to the agents (and to the mark).

There are only two kinds of motion, and neither reacts to the visitor's pointer:

- The build in the hero. While it plays, each agent lights the hero's blueprint grid under it in
  its own colour (`.lsw-lights` in `src/scripts/player.ts` and `src/styles/swarm.css`). The lights
  exist only in the hero and are removed when the build ends.
- The "With Liveswarm" card: a 12-second CSS loop in which three agents build a small coffee cart
  page (`src/components/BeforeAfter.astro`). It pauses off screen and is a still frame under
  reduced motion.

The recorded run under the hero and the clip in the phone frame are video, described under
"Media" below.

The five use-case tiles are still mockups drawn in HTML and CSS (`src/components/UseCases.astro`).
They carry no "Soon" tags by the founder's choice; the first FAQ answer says plainly what works
today, so keep that answer current.

## Things to switch on at launch

| What | Where | Today |
| --- | --- | --- |
| Repo, domain, install command, sponsor link | `src/config.ts` | Repo public, domain live, install line tested from GitHub. Sponsor link not set up yet |
| Star count | fetched from the GitHub API in `src/scripts/site.ts` | No number is shown while the repo is missing, private or rate-limited |
| Analytics | `PUBLIC_ANALYTICS`, `src/scripts/track.ts` | Vercel Web Analytics, loaded only on a deployed build. Events: `install_copy`, `github_click`, `video_play`, `replay_click` |
| Demo video | `demo` in `src/config.ts`, files in `public/media/` | The real "Nocturne" session (13 agents, 117 edits, 4 min 38 s), cut as described under "Media" |
| Company name | `company` in `src/config.ts` | Luven Technologies LLC, shown in the footer |

There is no email list or waitlist on the site. The last call to action is the install line and
a "Star on GitHub" button; the contact address in the footer is `contact` in `src/config.ts`.

## Media and fonts

All footage is one real Claude Code session: the main agent and twelve subagents building an
invented hotel page called Nocturne. It is a timelapse, so it is labelled "Real Claude Code
session, sped up" wherever it plays (`demo.label` in `src/config.ts`). Never call it live or
real-time. The masters are `../liveswarm/media/nocturne-wide.mp4` and `nocturne-vertical.mp4`
(69 seconds each); the clips below are cut from them with ffmpeg, H.264, no audio, faststart.

| File in `public/media/` | What | Where it plays |
| --- | --- | --- |
| `nocturne-loop.mp4` (1600x900, 14.5 s, 1.1 MB) | Silent loop: the full swarm over the title, a few built sections, then the split from a black screen, joined so it loops cleanly. The split (0:01 to 0:19 of the master) is played 2.3 times faster here | "Real run, real agents", while idle, desktop and tablet |
| `nocturne-full.webm` / `.mp4` (1920x1080, 69 s, 6.3 / 8.8 MB) | The whole cut | Same player, after "Watch the full run" or a click on one of the three parts |
| `nocturne-tall-loop.mp4` (720x1280, 10 s, 0.7 MB) | The same loop from the vertical master | Same player on phones (720px and under) |
| `nocturne-tall.mp4` (720x1280, 69 s, 7.5 MB) | The whole vertical cut | Same player on phones, after a tap |
| `nocturne-share.mp4` (720x1280, 8 s, 1.2 MB) | 0:20.6 to 0:28.6 of the vertical master | The phone frame under "Record and share" |
| `nocturne-poster.jpg`, `nocturne-tall-poster.jpg`, `nocturne-share-poster.jpg` | Still frames (0:19.4, 0:19.4, 0:21) | Shown first, and instead of the loops under reduced motion or data saver |

How it loads (`src/scripts/site.ts`): nothing is fetched until the player is near the screen, then
only the poster. The idle loop starts when a quarter of the player is visible and pauses when it
leaves. The full cut is fetched only when the visitor asks for it. With reduced motion or data
saver there is no loop, just the poster and the button. Without JavaScript it is a plain video
with controls. The parts row under the player (`demo.parts`) seeks the full cut, and its times
and speeds come from `../liveswarm/media/nocturne-timeline.json`.

To re-cut, see the ffmpeg commands in the handover note or adapt these:

```sh
# the idle loop
ffmpeg -i nocturne-wide.mp4 -filter_complex "[0:v]trim=19.4:25.9,setpts=PTS-STARTPTS,fade=t=out:st=6.1:d=0.4[b];[0:v]trim=1.0:19.4,setpts=(PTS-STARTPTS)/2.3,fade=t=in:st=0:d=0.3[a];[b][a]concat=n=2:v=1,fps=30,scale=1600:900:flags=lanczos[v]" -map "[v]" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -an -movflags +faststart nocturne-loop.mp4
# the full cut
ffmpeg -i nocturne-wide.mp4 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -an -movflags +faststart nocturne-full.mp4
ffmpeg -i nocturne-wide.mp4 -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -an nocturne-full.webm
```

The earlier "Oriel" clips are in `archive/oriel/` and are not shipped. `archive/` also holds a
WebM of the loop that came out larger than the MP4. Both folders are safe to delete, as are
`src/scripts/sky.ts`, `src/scripts/swarm.ts` (the removed background flock) and
`src/pages/og.astro`.

"What it costs you" (`src/components/Cost.astro`) shows measured numbers only, taken from
`../liveswarm/docs/overhead.md`. Change a figure there only when it has been measured again.

Fonts are self-hosted in `public/fonts/` (Funnel Display, Funnel Sans, JetBrains Mono; all under
the SIL Open Font License).
