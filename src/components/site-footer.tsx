import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send, MessageCircle, Mail } from "lucide-react";
import { getSiteSettings, type SiteSettings } from "@/lib/site.api";

export function SiteFooter() {
  const [s, setS] = useState<SiteSettings>({ telegram_url: "", jabber_url: "" });
  useEffect(() => {
    getSiteSettings().then(setS).catch(() => {});
  }, []);

  const iconCls =
    "group inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary hover:shadow-glow";

  return (
    <footer className="mt-6 border-t border-border/60 bg-card/50 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="text-primary">◆</span> BIN Insight · Non-generic lookup
        </p>
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
    </footer>
  );
}
