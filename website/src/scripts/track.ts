/**
 * The one place analytics goes through. Today it forwards to Vercel Web Analytics
 * (cookieless). To change provider, change this function; callers stay the same.
 *
 * `window.va` is the queue @vercel/analytics sets up when it is injected (see site.ts); this
 * sends the same message its own `track()` does. When analytics is not loaded, nothing is sent.
 */
export type TrackEvent = 'install_copy' | 'github_click' | 'video_play' | 'replay_click';

type Va = (kind: 'event', payload: { name: string; data?: Record<string, string> }) => void;

export function track(event: TrackEvent, data?: Record<string, string>): void {
  try {
    const va = (window as unknown as { va?: Va }).va;
    if (va) va('event', data ? { name: event, data } : { name: event });
  } catch {
    /* analytics must never break the page */
  }
}
