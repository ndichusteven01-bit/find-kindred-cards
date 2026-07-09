import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { getSiteSettings, type SiteSettings } from "@/lib/site.api";

export function SiteFooter() {
  const [s, setS] = useState<SiteSettings>({ telegram_url: "", jabber_url: "" });
  useEffect(() => {
    getSiteSettings().then(setS).catch(() => {});
  }, []);

  const iconCls =
    "group inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary hover:shadow-glow";

  return (
    <footer className="mt-8 border-t border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-primary shadow-sm">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">BIN Insight</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Bank card intelligence with issuer, country, scheme and contact details.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <nav className="flex items-center gap-4 text-sm text-muted-foreground" aria-label="Footer">
            <Link to="/" className="transition-colors hover:text-primary">
              Lookup
            </Link>
            <Link to="/contact" className="transition-colors hover:text-primary">
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-2">
          {s.telegram_url && (
            <a
              href={s.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              title="Telegram"
              className={iconCls}
            >
              <Send className="h-4 w-4" />
            </a>
          )}
          {s.jabber_url && (
            <a
              href={s.jabber_url.startsWith("xmpp:") ? s.jabber_url : `xmpp:${s.jabber_url}`}
              aria-label="Jabber"
              title="Jabber / XMPP"
              className={iconCls}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
          <Link to="/contact" aria-label="Contact us" title="Contact us" className={iconCls}>
            <Mail className="h-4 w-4" />
          </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
