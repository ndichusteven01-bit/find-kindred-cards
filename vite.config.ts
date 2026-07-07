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
  vite: {
    ssr: {
      noExternal: true,
    },
    environments: {
      server: {
        resolve: {
          noExternal: true,
        },
      },
    },
  },
});
