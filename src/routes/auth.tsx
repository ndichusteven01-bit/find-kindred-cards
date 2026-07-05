import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Admin sign in" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = mode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

      if (error) {
        setError(error.message);
        return;
      }

      if (!data.session) {
        setError("Account created. Please confirm your email, then sign in.");
        return;
      }

      nav({ to: "/admin" });
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-card">
        <h1 className="text-xl font-semibold">{mode === "signin" ? "Admin sign in" : "Create admin"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The first account created becomes the admin.
        </p>
        <div className="mt-4 space-y-2">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-4 w-full">
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
