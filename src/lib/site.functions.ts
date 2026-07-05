import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SiteSettings {
  telegram_url: string;
  jabber_url: string;
}

export interface ContactMessage {
  id: string;
  category: "general" | "advertisement";
  name: string;
  email: string;
  message: string;
  read: boolean;
  created_at: string;
}

export const getSiteSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteSettings> => {
    const { getPublicSupabase } = await import("./supabase-public.server");
    const { data } = await getPublicSupabase()
      .from("site_settings")
      .select("telegram_url, jabber_url")
      .eq("id", 1)
      .maybeSingle();
    return {
      telegram_url: data?.telegram_url ?? "",
      jabber_url: data?.jabber_url ?? "",
    };
  },
);

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SiteSettings) => ({
    telegram_url: String(data.telegram_url ?? "").slice(0, 500),
    jabber_url: String(data.jabber_url ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("site_settings")
      .upsert({ id: 1, ...data }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: { category: string; name: string; email: string; message: string }) => {
    const cat = data.category === "advertisement" ? "advertisement" : "general";
    const name = String(data.name ?? "").trim().slice(0, 100);
    const email = String(data.email ?? "").trim().slice(0, 255);
    const message = String(data.message ?? "").trim().slice(0, 2000);
    if (!name) throw new Error("Name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
    if (!message) throw new Error("Message is required");
    return { category: cat as "general" | "advertisement", name, email, message };
  })
  .handler(async ({ data }) => {
    const { getPublicSupabase } = await import("./supabase-public.server");
    const { error } = await getPublicSupabase().from("contact_messages").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactMessage[]> => {
    const { data } = await context.supabase
      .from("contact_messages")
      .select("id, category, name, email, message, read, created_at")
      .order("created_at", { ascending: false });
    return (data ?? []) as ContactMessage[];
  });

export const deleteContactMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await context.supabase.from("contact_messages").delete().eq("id", data.id);
    return { ok: true };
  });
