import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllBanners,
  upsertBanner,
  deleteBanner,
  claimAdminIfEmpty,
  isCurrentUserAdmin,
  type AdBanner,
} from "@/lib/banners.api";
import {
  getSiteSettings,
  updateSiteSettings,
  listContactMessages,
  deleteContactMessage,
  type SiteSettings,
  type ContactMessage,
} from "@/lib/site.api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LogOut, Save, Loader2, Trash2, Send, MessageCircle, Mail } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Banners" }] }),
  component: AdminPage,
});

function AdminPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [banners, setBanners] = useState<AdBanner[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings>({ telegram_url: "", jabber_url: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [messages, setMessages] = useState<ContactMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          nav({ to: "/auth" });
          return;
        }
        try { await claimAdminIfEmpty(); } catch {}
        const { admin } = await isCurrentUserAdmin();
        if (cancelled) return;
        setIsAdmin(admin);
        if (admin) {
          const b = await listAllBanners();
          if (cancelled) return;
          const filled: AdBanner[] = Array.from({ length: 6 }, (_, i) => {
            const found = b.find((x) => x.slot === i + 1);
            return (
              found ?? {
                id: "",
                slot: i + 1,
                label: "",
                image_url: null,
                link_url: null,
                background_color: "#1f2937",
                text_color: "#ffffff",
                active: true,
              }
            );
          });
          setBanners(filled);
          const [s, m] = await Promise.all([getSiteSettings(), listContactMessages().catch(() => [] as ContactMessage[])]);
          if (cancelled) return;
          setSettings(s);
          setMessages(m);
        }
      } catch {
        if (!cancelled) setError("Admin panel could not load. Please sign out and sign in again.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [nav]);

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await updateSiteSettings(settings);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm("Delete this message?")) return;
    await deleteContactMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleSave(b: AdBanner) {
    if (b.image_url && !/\.gif(\?|#|$)/i.test(b.image_url)) {
      alert("Ad image URL must be an animated .gif");
      return;
    }
    setSaving(b.slot);
    try {
      await upsertBanner(b);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(slot: number) {
    if (!confirm(`Delete banner in slot ${slot}?`)) return;
    setSaving(slot);
    try {
      await deleteBanner(slot);
      update(slot, { image_url: null, link_url: null, label: "", active: false });
    } finally {
      setSaving(null);
    }
  }

  function update(slot: number, patch: Partial<AdBanner>) {
    setBanners((prev) => prev.map((b) => (b.slot === slot ? { ...b, ...patch } : b)));
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold">{error ? "Admin unavailable" : "Not authorized"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "An admin already exists. Ask them to grant you access."}
          </p>
          <Link to="/" className="mt-4 inline-block text-primary hover:underline">Back home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-display text-xl font-semibold">Banner Admin</h1>
            <p className="text-sm text-muted-foreground">Edit the top ad slots shown on the homepage.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">View site</Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
            >
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {banners.map((b) => (
            <div key={b.slot} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
                  Slot {b.slot}
                </span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Active
                  <Switch checked={b.active} onCheckedChange={(v) => update(b.slot, { active: v })} />
                </label>
              </div>

              {/* Preview */}
              <div
                className="mb-3 flex h-[72px] items-center justify-center overflow-hidden rounded-md border border-border/60"
                style={{ background: b.background_color }}
              >
                {b.image_url ? (
                  <img src={b.image_url} alt={b.label} className="h-full w-full object-cover" />
                ) : (
                  <span className="px-4 text-center font-display text-lg font-bold uppercase tracking-wider" style={{ color: b.text_color }}>
                    {b.label || `Ad Slot ${b.slot}`}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <LabeledInput label="Label (alt text)" value={b.label} onChange={(v) => update(b.slot, { label: v })} />
                <LabeledInput
                  label="GIF URL (must end in .gif)"
                  placeholder="https://example.com/banner.gif"
                  value={b.image_url ?? ""}
                  onChange={(v) => update(b.slot, { image_url: v || null })}
                />
                <LabeledInput
                  label="Click-through link"
                  placeholder="https://advertiser.com"
                  value={b.link_url ?? ""}
                  onChange={(v) => update(b.slot, { link_url: v || null })}
                />
                <LabeledInput label="Background" value={b.background_color} onChange={(v) => update(b.slot, { background_color: v })} type="color-hex" />
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => handleSave(b)}
                  disabled={saving === b.slot}
                  className="flex-1"
                  size="sm"
                >
                  {saving === b.slot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button
                  onClick={() => handleDelete(b.slot)}
                  disabled={saving === b.slot}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Site settings — social links */}
        <section className="mt-8 rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-1 font-display text-lg font-semibold">Footer links</h2>
          <p className="mb-4 text-xs text-muted-foreground">Direct links shown in the site footer.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <LabeledInput
              label={"Telegram URL"}
              placeholder="https://t.me/yourhandle"
              value={settings.telegram_url}
              onChange={(v) => setSettings((s) => ({ ...s, telegram_url: v }))}
            />
            <LabeledInput
              label={"Jabber / XMPP"}
              placeholder="xmpp:you@server.tld"
              value={settings.jabber_url}
              onChange={(v) => setSettings((s) => ({ ...s, jabber_url: v }))}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={handleSaveSettings} disabled={savingSettings} size="sm">
              {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save footer links
            </Button>
            <div className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Send className="h-4 w-4" /> <MessageCircle className="h-4 w-4" /> <Mail className="h-4 w-4" />
            </div>
          </div>
        </section>

        {/* Contact messages */}
        <section className="mt-6 rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-4 font-display text-lg font-semibold">Contact messages ({messages.length})</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className="rounded-lg border border-border/60 bg-background p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          m.category === "advertisement"
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {m.category}
                      </span>
                      <span className="text-sm font-semibold">{m.name}</span>
                      <a href={`mailto:${m.email}`} className="text-xs text-primary hover:underline">
                        {m.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <time className="text-[11px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </time>
                      <button
                        onClick={() => handleDeleteMessage(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{m.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, type, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: "color-hex"; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {type === "color-hex" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
        </div>
      ) : (
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9" />
      )}
    </label>
  );
}
