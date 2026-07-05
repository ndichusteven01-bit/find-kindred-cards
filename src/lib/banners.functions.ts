import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdBanner {
  id: string;
  slot: number;
  label: string;
  image_url: string | null;
  link_url: string | null;
  background_color: string;
  text_color: string;
  active: boolean;
}

export const listBanners = createServerFn({ method: "GET" }).handler(async (): Promise<AdBanner[]> => {
  const { getPublicSupabase } = await import("./supabase-public.server");
  const { data, error } = await getPublicSupabase()
    .from("ad_banners")
    .select("id, slot, label, image_url, link_url, background_color, text_color, active")
    .order("slot", { ascending: true });
  if (error) return [];
  return (data ?? []) as AdBanner[];
});

export const listAllBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdBanner[]> => {
    const { data } = await context.supabase
      .from("ad_banners")
      .select("id, slot, label, image_url, link_url, background_color, text_color, active")
      .order("slot", { ascending: true });
    return (data ?? []) as AdBanner[];
  });

export const upsertBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<AdBanner> & { slot: number }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ad_banners")
      .upsert(
        {
          slot: data.slot,
          label: data.label ?? "",
          image_url: data.image_url ?? null,
          link_url: data.link_url ?? null,
          background_color: data.background_color ?? "#111827",
          text_color: data.text_color ?? "#ffffff",
          active: data.active ?? true,
        },
        { onConflict: "slot" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slot: number }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ad_banners")
      .update({ image_url: null, link_url: null, label: "", active: false })
      .eq("slot", data.slot);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Bootstrap: promote the current signed-in user to admin if no admin exists yet.
// Uses a SECURITY DEFINER RPC so no service role key is needed.
export const claimAdminIfEmpty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_admin_if_empty");
    if (error) throw new Error(error.message);
    return { claimed: !!data };
  });

export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ admin: boolean }> => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { admin: !!data };
  });
