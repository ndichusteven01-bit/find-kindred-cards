// Client-side site + contact API — talks directly to the Lovable backend (Supabase).
import { supabase } from "@/integrations/supabase/client";

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

export async function getSiteSettings(): Promise<SiteSettings> {
  const { data } = await supabase
    .from("site_settings")
    .select("telegram_url, jabber_url")
    .eq("id", 1)
    .maybeSingle();
  return {
    telegram_url: data?.telegram_url ?? "",
    jabber_url: data?.jabber_url ?? "",
  };
}

export async function updateSiteSettings(input: SiteSettings): Promise<void> {
  const payload = {
    telegram_url: String(input.telegram_url ?? "").slice(0, 500),
    jabber_url: String(input.jabber_url ?? "").slice(0, 500),
  };
  const { error } = await supabase
    .from("site_settings")
    .upsert({ id: 1, ...payload }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function submitContactMessage(input: {
  category: string;
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const cat = input.category === "advertisement" ? "advertisement" : "general";
  const name = String(input.name ?? "").trim().slice(0, 100);
  const email = String(input.email ?? "").trim().slice(0, 255);
  const message = String(input.message ?? "").trim().slice(0, 2000);
  if (!name) throw new Error("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
  if (!message) throw new Error("Message is required");
  const { error } = await supabase
    .from("contact_messages")
    .insert({ category: cat, name, email, message });
  if (error) throw new Error(error.message);
}

export async function listContactMessages(): Promise<ContactMessage[]> {
  const { data } = await supabase
    .from("contact_messages")
    .select("id, category, name, email, message, read, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as ContactMessage[];
}

export async function deleteContactMessage(id: string): Promise<void> {
  await supabase.from("contact_messages").delete().eq("id", id);
}
