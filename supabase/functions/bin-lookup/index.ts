// Edge function: BIN lookup with cache + multi-provider fallback.
// Called from the static frontend via https://<project>.functions.supabase.co/bin-lookup
// Public endpoint (verify_jwt=false) — safe: read-only cache + third-party BIN APIs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

interface BinResult {
  bin: string;
  scheme: string | null;
  brand: string | null;
  cardType: string | null;
  category: string | null;
  bankName: string | null;
  bankUrl: string | null;
  bankPhone: string | null;
  countryName: string | null;
  countryCode: string | null;
  countryEmoji: string | null;
  currency: string | null;
  prepaid: boolean | null;
  commercial: boolean | null;
  source: "cache" | "api";
}

type Outcome =
  | { status: "success"; data: BinResult }
  | { status: "not_found" }
  | { status: "error"; message: string };

function titleCase(v: unknown): string | null {
  if (v == null) return null;
  return String(v).toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || null;
}
function emojiFromAlpha2(a: string | null | undefined): string | null {
  if (!a || a.length !== 2) return null;
  return String.fromCodePoint(...a.toUpperCase().split("").map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)));
}
function hasData(r: BinResult): boolean {
  return Boolean(r.scheme || r.brand || r.bankName || r.countryName || r.cardType);
}
function sanitize(input: string): string {
  return (input || "").replace(/\D/g, "").slice(0, 8);
}

interface Provider {
  name: string;
  url: (bin: string) => string;
  headers?: Record<string, string>;
  parse: (bin: string, raw: unknown) => BinResult | null;
}

function parseBinlist(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object") return null;
  const country = r.country ?? {};
  const bank = r.bank ?? {};
  const alpha2: string | null = country.alpha2 ?? country.code ?? null;
  const out: BinResult = {
    bin,
    scheme: titleCase(r.scheme),
    brand: r.brand ?? null,
    cardType: titleCase(r.type),
    category: titleCase(r.category ?? r.tier),
    bankName: bank.name ?? null,
    bankUrl: bank.url ?? null,
    bankPhone: bank.phone ?? null,
    countryName: country.name ?? null,
    countryCode: alpha2,
    countryEmoji: country.emoji ?? emojiFromAlpha2(alpha2),
    currency: country.currency ?? null,
    prepaid: typeof r.prepaid === "boolean" ? r.prepaid : null,
    commercial: null,
    source: "api",
  };
  return hasData(out) ? out : null;
}
function parseHandyApi(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object" || r.Status !== "SUCCESS") return null;
  const country = r.Country ?? {};
  const alpha2: string | null = country.A2 ?? null;
  const out: BinResult = {
    bin,
    scheme: titleCase(r.Scheme),
    brand: titleCase(r.Scheme),
    cardType: titleCase(r.Type),
    category: titleCase(r.CardTier),
    bankName: titleCase(r.Issuer),
    bankUrl: null,
    bankPhone: null,
    countryName: country.Name ?? null,
    countryCode: alpha2,
    countryEmoji: emojiFromAlpha2(alpha2),
    currency: null,
    prepaid: null,
    commercial: null,
    source: "api",
  };
  return hasData(out) ? out : null;
}
function parseAntipublic(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object" || !r.brand) return null;
  const alpha2: string | null = r.country ?? null;
  const currencies: string[] = Array.isArray(r.country_currencies) ? r.country_currencies : [];
  const out: BinResult = {
    bin,
    scheme: titleCase(r.brand),
    brand: titleCase(r.brand),
    cardType: titleCase(r.type),
    category: titleCase(r.level),
    bankName: titleCase(r.bank),
    bankUrl: null,
    bankPhone: null,
    countryName: titleCase(r.country_name),
    countryCode: alpha2,
    countryEmoji: r.country_flag ?? emojiFromAlpha2(alpha2),
    currency: currencies[0] ?? null,
    prepaid: null,
    commercial: null,
    source: "api",
  };
  return hasData(out) ? out : null;
}

const providers: Provider[] = [
  {
    name: "antipublic",
    url: (b) => `https://bins.antipublic.cc/bins/${encodeURIComponent(b)}`,
    headers: { Accept: "application/json" },
    parse: parseAntipublic,
  },
  {
    name: "handyapi",
    url: (b) => `https://data.handyapi.com/bin/${encodeURIComponent(b)}`,
    headers: { Accept: "application/json", "User-Agent": "bin-lookup-app" },
    parse: parseHandyApi,
  },
  {
    name: "binlist",
    url: (b) => `https://lookup.binlist.net/${encodeURIComponent(b)}`,
    headers: { Accept: "application/json", "Accept-Version": "3" },
    parse: parseBinlist,
  },
];

async function queryProvider(p: Provider, bin: string): Promise<{ result: BinResult | null; raw: unknown; hardError: boolean }> {
  try {
    const res = await fetch(p.url(bin), { headers: p.headers });
    if (res.status === 404) return { result: null, raw: null, hardError: false };
    if (!res.ok) return { result: null, raw: null, hardError: true };
    const raw = await res.json();
    return { result: p.parse(bin, raw), raw, hardError: false };
  } catch {
    return { result: null, raw: null, hardError: true };
  }
}

function mergeResults(primary: BinResult, extra: BinResult | null): BinResult {
  if (!extra) return primary;
  const merged = { ...primary };
  (Object.keys(extra) as (keyof BinResult)[]).forEach((k) => {
    if ((merged[k] === null || merged[k] === undefined) && (extra as any)[k] != null) {
      (merged as any)[k] = (extra as any)[k];
    }
  });
  return merged;
}

function getSupabase() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fromCache(bin: string): Promise<BinResult | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("bin_cache").select("*").eq("bin", bin).maybeSingle();
  if (error || !data) return null;
  supabase.from("bin_cache").update({ lookups: (data.lookups ?? 1) + 1 }).eq("bin", bin).then(() => {});
  return {
    bin: data.bin,
    scheme: data.scheme,
    brand: data.brand,
    cardType: data.card_type,
    category: data.category,
    bankName: data.bank_name,
    bankUrl: data.bank_url,
    bankPhone: data.bank_phone,
    countryName: data.country_name,
    countryCode: data.country_code,
    countryEmoji: data.country_emoji,
    currency: data.currency,
    prepaid: data.prepaid,
    commercial: data.commercial,
    source: "cache",
  };
}

async function saveToCache(r: BinResult, raw: unknown): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("bin_cache").upsert(
    {
      bin: r.bin,
      scheme: r.scheme,
      brand: r.brand,
      card_type: r.cardType,
      category: r.category,
      bank_name: r.bankName,
      bank_url: r.bankUrl,
      bank_phone: r.bankPhone,
      country_name: r.countryName,
      country_code: r.countryCode,
      country_emoji: r.countryEmoji,
      currency: r.currency,
      prepaid: r.prepaid,
      commercial: r.commercial,
      raw: (raw ?? null) as any,
    },
    { onConflict: "bin" },
  );
}

async function lookup(rawBin: string): Promise<Outcome> {
  const bin = sanitize(rawBin);
  if (bin.length < 6) return { status: "error", message: "Enter at least the first 6 digits of the card." };

  const cached = await fromCache(bin);
  if (cached) return { status: "success", data: cached };

  let primary: BinResult | null = null;
  let primaryRaw: unknown = null;
  let anyReached = false;
  for (const p of providers) {
    const { result, raw, hardError } = await queryProvider(p, bin);
    if (!hardError) anyReached = true;
    if (result) {
      primary = primary ? mergeResults(primary, result) : result;
      primaryRaw = primaryRaw ?? raw;
      // Keep querying remaining providers if we're still missing bank website or phone
      if (primary.bankUrl && primary.bankPhone) break;
    }
  }
  if (primary) {
    if (!primary.bankUrl && primary.bankName) {
      primary.bankUrl = await guessBankWebsite(primary.bankName, primary.countryCode);
    }
    await saveToCache(primary, primaryRaw);
    return { status: "success", data: primary };
  }
  if (!anyReached) return { status: "error", message: "Could not reach any BIN provider. Please try again." };
  return { status: "not_found" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    let bin = "";
    if (req.method === "GET") {
      bin = new URL(req.url).searchParams.get("bin") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      bin = String(body?.bin ?? "");
    }
    const outcome = await lookup(bin);
    return new Response(JSON.stringify(outcome), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ status: "error", message: e instanceof Error ? e.message : "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
