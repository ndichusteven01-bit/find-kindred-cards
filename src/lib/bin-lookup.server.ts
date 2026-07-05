// BinLookupService
// -----------------
// Mirrors a classic Laravel service class. It resolves a BIN by:
//   1. Checking the local cache (bin_cache table) first.
//   2. Falling back to configurable third-party BIN APIs when not cached.
//   3. Persisting successful lookups so future searches are instant.
//
// Multiple providers are tried in order for resilience — if one is rate
// limited or blocks the request (e.g. 403), the next provider is attempted.
//
// A custom provider can be forced via environment variables:
//   BIN_API_URL         e.g. https://your-provider.com/bin/{bin}
//   BIN_API_KEY         optional key for providers that require one
//   BIN_API_KEY_HEADER  optional header name the key is sent under
//
// This file is server-only (*.server.ts) and is never shipped to the browser.

export interface BinResult {
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

export type BinLookupOutcome =
  | { status: "success"; data: BinResult }
  | { status: "not_found" }
  | { status: "error"; message: string };

function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function emojiFromAlpha2(alpha2: string | null | undefined): string | null {
  if (!alpha2 || alpha2.length !== 2) return null;
  const codePoints = alpha2
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

interface Provider {
  name: string;
  url: (bin: string) => string;
  headers?: Record<string, string>;
  parse: (bin: string, raw: any) => BinResult | null;
}

// --- Provider-specific normalizers -----------------------------------------

// binlist.net compatible shape (also used as the generic fallback parser).
function parseBinlist(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object") return null;
  const country = r.country ?? {};
  const bank = r.bank ?? {};
  const alpha2: string | null = country.alpha2 ?? country.code ?? null;
  const result: BinResult = {
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
  return hasData(result) ? result : null;
}

// data.handyapi.com/bin/{bin}
function parseHandyApi(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object" || r.Status !== "SUCCESS") return null;
  const country = r.Country ?? {};
  const alpha2: string | null = country.A2 ?? null;
  const result: BinResult = {
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
  return hasData(result) ? result : null;
}

// bins.antipublic.cc/bins/{bin}
function parseAntipublic(bin: string, r: any): BinResult | null {
  if (!r || typeof r !== "object" || !r.brand) return null;
  const alpha2: string | null = r.country ?? null;
  const currencies: string[] = Array.isArray(r.country_currencies) ? r.country_currencies : [];
  const result: BinResult = {
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
  return hasData(result) ? result : null;
}

function hasData(r: BinResult): boolean {
  return Boolean(r.scheme || r.brand || r.bankName || r.countryName || r.cardType);
}

function normalizeBankSearchName(value: string): string {
  return value
    .replace(/\b(A\/S|AS|S\.A\.|SA|N\.A\.|NA|PLC|LLC|LTD|LIMITED|INC|CORP|CORPORATION)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s&.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "friendly-card-finder/1.0",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; FriendlyCardFinder/1.0)",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function firstPhoneFromHtml(html: string | null): string | null {
  if (!html) return null;
  const telLink = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  if (telLink) return decodeURIComponent(telLink).replace(/^\+?00/, "+").trim();

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const phone = text.match(/(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,14}\d/);
  return phone?.[0]?.trim() ?? null;
}

function wikidataStringValue(entity: any, property: string): string | null {
  const value = entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function lookupBankContact(bankName: string | null, countryName: string | null): Promise<{
  website: string | null;
  phone: string | null;
}> {
  if (!bankName) return { website: null, phone: null };
  const normalized = normalizeBankSearchName(bankName);
  if (!normalized) return { website: null, phone: null };

  const queries = Array.from(new Set([`${normalized} ${countryName ?? ""}`.trim(), normalized]));
  for (const query of queries) {
    const search = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=3`,
    );
    const entityId = search?.search?.[0]?.id;
    if (!entityId) continue;

    const entityData = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`);
    const entity = entityData?.entities?.[entityId];
    const website = normalizeWebsite(wikidataStringValue(entity, "P856"));
    let phone = wikidataStringValue(entity, "P1329");
    if (!phone && website) {
      phone = firstPhoneFromHtml(await fetchText(website));
      if (!phone) phone = firstPhoneFromHtml(await fetchText(new URL("/kontakt/", website).toString()));
      if (!phone) phone = firstPhoneFromHtml(await fetchText(new URL("/contact/", website).toString()));
    }
    if (website || phone) return { website, phone };
  }

  return { website: null, phone: null };
}

async function enrichBankContact(result: BinResult): Promise<BinResult> {
  if (result.bankUrl && result.bankPhone) return result;
  const contact = await lookupBankContact(result.bankName, result.countryName);
  return {
    ...result,
    bankUrl: result.bankUrl ?? contact.website,
    bankPhone: result.bankPhone ?? contact.phone,
  };
}

// Merge fields from a secondary result into the primary (fills gaps only).
function mergeResults(primary: BinResult, extra: BinResult | null): BinResult {
  if (!extra) return primary;
  const merged = { ...primary };
  (Object.keys(extra) as (keyof BinResult)[]).forEach((key) => {
    if ((merged[key] === null || merged[key] === undefined) && extra[key] != null) {
      (merged as any)[key] = extra[key];
    }
  });
  return merged;
}

export class BinLookupService {
  private get customUrl(): string {
    return process.env.BIN_API_URL || "";
  }
  private get apiKey(): string {
    return process.env.BIN_API_KEY || "";
  }
  private get apiKeyHeader(): string {
    return process.env.BIN_API_KEY_HEADER || "";
  }

  /** Ordered provider chain. A custom BIN_API_URL is tried first when set. */
  private get providers(): Provider[] {
    const list: Provider[] = [];

    if (this.customUrl) {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (this.apiKey && this.apiKeyHeader) headers[this.apiKeyHeader] = this.apiKey;
      else if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
      list.push({
        name: "custom",
        url: (bin) => this.customUrl.replace("{bin}", encodeURIComponent(bin)),
        headers,
        parse: parseBinlist,
      });
    }

    list.push(
      {
        name: "antipublic",
        url: (bin) => `https://bins.antipublic.cc/bins/${encodeURIComponent(bin)}`,
        headers: { Accept: "application/json" },
        parse: parseAntipublic,
      },
      {
        name: "handyapi",
        url: (bin) => `https://data.handyapi.com/bin/${encodeURIComponent(bin)}`,
        headers: { Accept: "application/json", "User-Agent": "bin-lookup-app" },
        parse: parseHandyApi,
      },
      {
        name: "binlist",
        url: (bin) => `https://lookup.binlist.net/${encodeURIComponent(bin)}`,
        headers: { Accept: "application/json", "Accept-Version": "3" },
        parse: parseBinlist,
      },
    );

    return list;
  }

  static sanitize(input: string): string {
    return (input || "").replace(/\D/g, "").slice(0, 8);
  }

  private async fromCache(bin: string): Promise<BinResult | null> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("bin_cache")
      .select("*")
      .eq("bin", bin)
      .maybeSingle();
    if (error || !data) return null;

    void supabaseAdmin
      .from("bin_cache")
      .update({ lookups: (data.lookups ?? 1) + 1 })
      .eq("bin", bin);

    const cached: BinResult = {
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
    const enriched = await enrichBankContact(cached);
    if (enriched.bankUrl !== cached.bankUrl || enriched.bankPhone !== cached.bankPhone) {
      void supabaseAdmin
        .from("bin_cache")
        .update({ bank_url: enriched.bankUrl, bank_phone: enriched.bankPhone })
        .eq("bin", bin);
    }

    return enriched;
  }

  private async saveToCache(result: BinResult, raw: unknown): Promise<void> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bin_cache").upsert(
      {
        bin: result.bin,
        scheme: result.scheme,
        brand: result.brand,
        card_type: result.cardType,
        category: result.category,
        bank_name: result.bankName,
        bank_url: result.bankUrl,
        bank_phone: result.bankPhone,
        country_name: result.countryName,
        country_code: result.countryCode,
        country_emoji: result.countryEmoji,
        currency: result.currency,
        prepaid: result.prepaid,
        commercial: result.commercial,
        raw: (raw ?? null) as any,
      },
      { onConflict: "bin" },
    );
  }

  /** Query one provider. */
  private async queryProvider(
    provider: Provider,
    bin: string,
  ): Promise<{ result: BinResult | null; raw: unknown; hardError: boolean }> {
    try {
      const res = await fetch(provider.url(bin), { headers: provider.headers });
      if (res.status === 404) return { result: null, raw: null, hardError: false };
      if (!res.ok) return { result: null, raw: null, hardError: true };
      const raw = await res.json();
      return { result: provider.parse(bin, raw), raw, hardError: false };
    } catch {
      return { result: null, raw: null, hardError: true };
    }
  }

  /** Try providers in order, fill gaps from a secondary hit, then cache. */
  private async fromProviders(bin: string): Promise<BinLookupOutcome> {
    let primary: BinResult | null = null;
    let primaryRaw: unknown = null;
    let anyReached = false;

    for (const provider of this.providers) {
      const { result, raw, hardError } = await this.queryProvider(provider, bin);
      if (!hardError) anyReached = true;
      if (result) {
        if (!primary) {
          primary = result;
          primaryRaw = raw;
        } else {
          primary = mergeResults(primary, result);
        }
        // First good hit is enough for a fast response.
        break;
      }
    }

    if (primary) {
      primary = await enrichBankContact(primary);
      await this.saveToCache(primary, primaryRaw);
      return { status: "success", data: primary };
    }

    if (!anyReached) {
      return { status: "error", message: "Could not reach any BIN provider. Please try again." };
    }
    return { status: "not_found" };
  }

  async lookup(rawInput: string): Promise<BinLookupOutcome> {
    const bin = BinLookupService.sanitize(rawInput);
    if (bin.length < 6) {
      return { status: "error", message: "Enter at least the first 6 digits of the card." };
    }

    const cached = await this.fromCache(bin);
    if (cached) return { status: "success", data: cached };

    return this.fromProviders(bin);
  }
}
