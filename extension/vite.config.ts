import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import chromeManifest from "./manifest.json";
import firefoxManifest from "./manifest.firefox.json";

export default defineConfig(({ mode }) => {
  const isFirefox = mode === "firefox";
  return {
    plugins: [
      react(),
      crx({
        manifest: (isFirefox ? firefoxManifest : chromeManifest) as never,
        browser: isFirefox ? "firefox" : "chrome",
      }),
    ],
    build: {
      outDir: isFirefox ? "dist-firefox" : "dist-chrome",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: { port: 5173 },
    },
  };
});
