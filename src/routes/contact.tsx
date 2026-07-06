import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2, Send, ArrowLeft, CheckCircle2 } from "lucide-react";
import { submitContactMessage } from "@/lib/site.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — BIN Insight" },
      { name: "description", content: "Reach the BIN Insight team for general questions or advertising inquiries." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [category, setCategory] = useState<"general" | "advertisement">("general");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await submitContactMessage({ category, name, email, message });
      setDone(true);
      setName(""); setEmail(""); setMessage("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.25em] text-primary">Direct line</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Contact the team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reach us for support or to run an advertisement on BIN Insight.
            </p>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <h2 className="font-display text-lg font-semibold">Message received</h2>
              <p className="text-sm text-muted-foreground">The admin will get back to you shortly.</p>
              <Button variant="outline" size="sm" onClick={() => setDone(false)}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["general", "advertisement"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`rounded-lg border px-4 py-3 text-sm font-medium capitalize transition-all ${
                        category === c
                          ? "border-primary bg-primary/10 text-primary shadow-glow"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
              </Field>
              <Field label="Message">
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} required />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">{message.length}/2000</p>
              </Field>

              {err && <p className="text-sm text-destructive">{err}</p>}

              <Button type="submit" disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send message
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
