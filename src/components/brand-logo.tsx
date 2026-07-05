// Small scheme/brand logo mapping. Uses the open-source svg-credit-card-payment-icons
// set served over jsDelivr so we don't ship binary assets.

const BASE = "https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@main/flat";

const MAP: Record<string, string> = {
  visa: "visa.svg",
  "visa electron": "visa.svg",
  mastercard: "mastercard.svg",
  "master card": "mastercard.svg",
  maestro: "maestro.svg",
  amex: "amex.svg",
  "american express": "amex.svg",
  discover: "discover.svg",
  diners: "diners.svg",
  "diners club": "diners.svg",
  jcb: "jcb.svg",
  unionpay: "unionpay.svg",
  "china unionpay": "unionpay.svg",
  elo: "elo.svg",
  hipercard: "hipercard.svg",
  hiper: "hipercard.svg",
  mir: "mir.svg",
  "rupay": "rupay.svg",
};

export function schemeLogoUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return MAP[key] ? `${BASE}/${MAP[key]}` : null;
}

export function BrandLogo({ name, className }: { name: string | null | undefined; className?: string }) {
  const url = schemeLogoUrl(name);
  if (!url || !name) return <span className="font-semibold">{name || "—"}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={url}
        alt={`${name} logo`}
        className={className ?? "h-6 w-9 rounded-sm border border-border bg-white object-contain p-0.5 shadow-sm"}
        loading="lazy"
      />
      <span className="font-semibold uppercase tracking-wide">{name}</span>
    </span>
  );
}
