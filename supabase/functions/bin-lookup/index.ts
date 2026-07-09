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

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  ...CORS,
};

const PROVIDER_TIMEOUT_MS = 2_800;
const ENRICH_TIMEOUT_MS = 2_200;

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    const res = await fetchWithTimeout(p.url(bin), { headers: p.headers }, PROVIDER_TIMEOUT_MS);
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
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error("Missing backend configuration", { hasUrl: Boolean(url), hasKey: Boolean(key) });
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fromCache(bin: string): Promise<BinResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("bin_cache").select("*").eq("bin", bin).maybeSingle();
  if (error || !data) return null;
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
  if (!supabase) return;
  try {
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
  } catch {
    // Cache writes are best-effort. Lookup should still succeed under database pressure.
  }
}

function hasBankContact(r: BinResult): boolean {
  return Boolean(r.bankUrl && r.bankPhone);
}

async function lookup(rawBin: string): Promise<Outcome> {
  const bin = sanitize(rawBin);
  if (bin.length < 6) return { status: "error", message: "Enter at least the first 6 digits of the card." };

  const cached = await fromCache(bin);
  if (cached && hasBankContact(cached)) return { status: "success", data: cached };

  let primary: BinResult | null = cached;
  let primaryRaw: unknown = null;
  let anyReached = false;

  const providerResults = await Promise.all(providers.map((p) => queryProvider(p, bin)));
  for (const { result, raw, hardError } of providerResults) {
    if (!hardError) anyReached = true;
    if (result) {
      primary = primary ? mergeResults(primary, result) : result;
      primaryRaw = primaryRaw ?? raw;
    }
  }
  if (primary) {
    if (primary.bankName && (!primary.bankUrl || !primary.bankPhone)) {
      primary = await enrichBankContact(primary);
    }
    await saveToCache(primary, primaryRaw);
    return { status: "success", data: primary };
  }
  if (!anyReached) return { status: "error", message: "Could not reach any BIN provider. Please try again." };
  return { status: "not_found" };
}

async function enrichBankContact(result: BinResult): Promise<BinResult> {
  const enriched = { ...result };
  if (!enriched.bankUrl && enriched.bankName) {
    enriched.bankUrl = await guessBankWebsite(enriched.bankName, enriched.countryCode);
  }
  if (!enriched.bankPhone && enriched.bankUrl) {
    enriched.bankPhone = await findBankPhone(enriched.bankUrl);
  }
  if (!enriched.bankPhone && enriched.bankName) {
    enriched.bankPhone = await searchBankPhone(enriched.bankName, enriched.countryCode, enriched.bankUrl);
  }
  return enriched;
}

async function guessBankWebsite(bankName: string, countryCode: string | null): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${bankName}${countryCode ? " " + countryCode : ""} official bank website`);
    const candidates = await searchBankWebCandidates(query);
    const res = await fetchWithTimeout(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&no_redirect=1&t=binlookup`, {
      headers: { Accept: "application/json", "User-Agent": "bin-lookup-app" },
    }, ENRICH_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json().catch(() => null) as any;
      if (data?.AbstractURL) candidates.push(data.AbstractURL);
      if (Array.isArray(data?.Results)) for (const r of data.Results) if (r?.FirstURL) candidates.push(r.FirstURL);
      if (Array.isArray(data?.RelatedTopics)) {
        for (const r of data.RelatedTopics) {
          if (r?.FirstURL) candidates.push(r.FirstURL);
          if (Array.isArray(r?.Topics)) for (const t of r.Topics) if (t?.FirstURL) candidates.push(t.FirstURL);
        }
      }
    }
    for (const url of candidates) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (isUsableBankHost(host)) {
          return host;
        }
      } catch { /* skip */ }
    }
    return null;
  } catch {
    return null;
  }
}

async function searchBankWebCandidates(encodedQuery: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; bin-lookup-app)" },
    }, ENRICH_TIMEOUT_MS);
    if (!res.ok) return [];
    const html = await res.text();
    const candidates: string[] = [];
    for (const match of html.matchAll(/class=["']result__a["'][^>]+href=["']([^"']+)/gi)) {
      const decoded = decodeSearchRedirect(match[1]);
      if (decoded) candidates.push(decoded);
    }
    for (const match of html.matchAll(/href=["']([^"']*\/l\/\?uddg=[^"']+)/gi)) {
      const decoded = decodeSearchRedirect(match[1]);
      if (decoded) candidates.push(decoded);
    }
    return [...new Set(candidates)];
  } catch {
    return [];
  }
}

async function searchBankPhone(bankName: string, countryCode: string | null, bankUrl: string | null): Promise<string | null> {
  try {
    const host = bankUrl ? new URL(bankUrl.startsWith("http") ? bankUrl : `https://${bankUrl}`).hostname.replace(/^www\./, "") : "";
    const query = encodeURIComponent(`${bankName}${countryCode ? " " + countryCode : ""}${host ? " " + host : ""} customer service phone contact`);
    const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; bin-lookup-app)" },
    }, ENRICH_TIMEOUT_MS);
    if (!res.ok) return null;
    return extractPhone(await res.text());
  } catch {
    return null;
  }
}

function decodeSearchRedirect(value: string): string | null {
  try {
    const unescaped = value.replaceAll("&amp;", "&");
    const parsed = new URL(unescaped.startsWith("//") ? `https:${unescaped}` : unescaped);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.href;
  } catch {
    return null;
  }
}

function isUsableBankHost(host: string): boolean {
  return Boolean(host && !/duckduckgo|wikipedia|facebook|twitter|x\.com|linkedin|youtube|instagram|bloomberg|crunchbase|apps\.apple|play\.google/i.test(host));
}

function toHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (!isUsableBankHost(parsed.hostname.replace(/^www\./, ""))) return null;
    return `https://${parsed.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

async function findBankPhone(bankUrl: string): Promise<string | null> {
  const base = toHttpsUrl(bankUrl);
  if (!base) return null;
  const urls = [base, `${base}/contact`, `${base}/contact-us`, `${base}/customer-service`, `${base}/support`];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.8", "User-Agent": "bin-lookup-app" },
      }, ENRICH_TIMEOUT_MS);
      if (!res.ok) continue;
      const text = (await res.text()).slice(0, 250_000);
      const telHref = text.match(/href=["']tel:([^"']+)/i)?.[1];
      const tel = cleanPhone(telHref ?? "");
      if (tel) return tel;
      const phone = extractPhone(text);
      if (phone) return phone;
    } catch {
      // Try the next likely contact URL.
    }
  }
  return null;
}

function extractPhone(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const phonePattern = /\+?\d[\d\s().-]{7,}\d/g;
  const matches = [...text.matchAll(phonePattern)];
  const preferred = matches.find((match) => {
    const start = Math.max(0, (match.index ?? 0) - 90);
    const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 90);
    return /phone|tel|call|contact|customer|support|service/i.test(text.slice(start, end));
  });
  return cleanPhone(preferred?.[0] ?? matches[0]?.[0] ?? "");
}

function cleanPhone(value: string): string | null {
  const cleaned = value.replace(/%20/g, " ").replace(/[^+\d().\-\s]/g, " ").replace(/\s+/g, " ").trim();
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  return cleaned;
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
      headers: JSON_HEADERS,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ status: "error", message: e instanceof Error ? e.message : "Server error" }),
      { status: 500, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } },
    );
  }
});
