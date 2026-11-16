import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async () => {
  const plugins = [react()];
  if (process.env.LIVESWARM !== "off") {
    try {
      const { default: liveswarm } = await import("../vite-plugin/index.mjs");
      plugins.unshift(liveswarm());
    } catch (err) {
      console.warn("[demo-app] Liveswarm plugin not loaded:", err && err.message ? err.message : err);
    }
  }
  return { plugins, server: { host: "127.0.0.1", port: 5173, strictPort: true } };
});
