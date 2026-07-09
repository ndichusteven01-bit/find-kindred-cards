// SPA build: serves a prerendered index.html shell on both Lovable (Worker) and Vercel (static).
// All backend logic lives on the Lovable backend (Supabase + Edge Functions).
// The frontend calls it over HTTPS via @supabase/supabase-js.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    spa: {
      enabled: true,
      prerender: { outputPath: "/index.html" },
    },
  },
  plugins: [
    // Nitro emits the worker as `dist/server/index.mjs`, but TanStack's preview
    // server plugin (used during SPA prerender) resolves the server entry by
    // input basename → `dist/server/server.js`. Copy/alias it so the preview
    // server can boot for the prerender crawl step.
    {
      name: "alias-nitro-server-entry-for-prerender",
      apply: "build",
      async closeBundle() {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const src = path.resolve("dist/server/index.mjs");
        const dest = path.resolve("dist/server/server.js");
        try {
          await fs.copyFile(src, dest);
        } catch {
          // Ignore: this hook fires per-environment; the file only exists
          // after nitro finishes the ssr build.
        }
      },
    },
  ],
});
