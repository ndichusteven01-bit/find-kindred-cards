// SPA-only build for Vercel: no nitro/server, prerenders index.html shell.
// All backend logic lives on the Lovable backend (Supabase + Edge Functions).
// The frontend calls it over HTTPS via @supabase/supabase-js.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: {
      enabled: true,
    },
  },
});
