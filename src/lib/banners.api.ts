// Client-side banners API — talks directly to the Lovable backend (Supabase) via HTTPS.
// RLS enforces admin vs public access; no backend logic runs in the frontend.
import { supabase } from "@/integrations/supabase/client";

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

const SELECT = "id, slot, label, image_url, link_url, background_color, text_color, active";

export async function listBanners(): Promise<AdBanner[]> {
  const { data, error } = await supabase
    .from("ad_banners")
    .select(SELECT)
    .order("slot", { ascending: true });
  if (error) return [];
  return (data ?? []) as AdBanner[];
}

export async function listAllBanners(): Promise<AdBanner[]> {
  const { data } = await supabase
    .from("ad_banners")
    .select(SELECT)
    .order("slot", { ascending: true });
  return (data ?? []) as AdBanner[];
}

export async function upsertBanner(banner: Partial<AdBanner> & { slot: number }): Promise<void> {
  const { error } = await supabase.from("ad_banners").upsert(
    {
      slot: banner.slot,
      label: banner.label ?? "",
      image_url: banner.image_url ?? null,
      link_url: banner.link_url ?? null,
      background_color: banner.background_color ?? "#111827",
      text_color: banner.text_color ?? "#ffffff",
      active: banner.active ?? true,
    },
    { onConflict: "slot" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteBanner(slot: number): Promise<void> {
  const { error } = await supabase
    .from("ad_banners")
    .update({ image_url: null, link_url: null, label: "", active: false })
    .eq("slot", slot);
  if (error) throw new Error(error.message);
}

export async function claimAdminIfEmpty(): Promise<{ claimed: boolean }> {
  const { data, error } = await supabase.rpc("claim_admin_if_empty");
  if (error) throw new Error(error.message);
  return { claimed: !!data };
}

export async function isCurrentUserAdmin(): Promise<{ admin: boolean }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { admin: false };
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  return { admin: !!data };
}
