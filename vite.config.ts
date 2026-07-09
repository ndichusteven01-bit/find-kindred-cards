// SPA build: serves a prerendered index.html shell on both Lovable and Vercel.
// All backend logic lives on the Lovable backend (Supabase + Edge Functions);
// the frontend calls it via HTTPS through @supabase/supabase-js. There is no
// app-internal server logic, so we skip nitro's worker wrapping — the vite
// preview server used by the SPA prerender step is incompatible with the
// cloudflare-module handler and crashes with "Cannot set property ip" /
// "Cannot destructure property 'req'" when the wrapped fetcher is invoked
// with a plain Node Request.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: {
      enabled: true,
      prerender: { outputPath: "/index.html" },
    },
  },
});
