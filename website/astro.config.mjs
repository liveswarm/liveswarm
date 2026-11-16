import { defineConfig } from 'astro/config';

// Static output: deploys to Vercel (or any static host) with no adapter.
export default defineConfig({
  site: 'https://liveswarm.dev',
  output: 'static',
  devToolbar: { enabled: false },
  build: {
    // One HTML response carries the styles, so text paints without waiting on a second request.
    inlineStylesheets: 'always',
  },
  server: { host: '127.0.0.1', port: 4321 },
});
