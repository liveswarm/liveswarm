import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async () => {
  const plugins = [react()];
  if (process.env.LIVESWARM !== "off") {
    try {
      const { default: liveswarm } = await import("../../liveswarm/vite-plugin/index.mjs");
      plugins.unshift(liveswarm());
    } catch (err) {
      console.warn("[nocturne] Liveswarm plugin not loaded:", err && err.message ? err.message : err);
    }
  }
  // hmr.overlay off: a half-finished edit must never cover the filmed page with Vite's red error screen.
  return { plugins, server: { host: "127.0.0.1", port: Number(process.env.NOCTURNE_PORT) || 5175, strictPort: true, hmr: { overlay: false } } };
});
