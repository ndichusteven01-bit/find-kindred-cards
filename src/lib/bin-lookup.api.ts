// Client-side API for BIN lookup. Calls the Lovable-hosted backend function via GET
// so successful BIN responses can be cached by the browser / edge path under load.

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

const memoryCache = new Map<string, { expiresAt: number; outcome: BinLookupOutcome }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 12_000;

function getCached(bin: string): BinLookupOutcome | null {
  const cached = memoryCache.get(bin);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    memoryCache.delete(bin);
    return null;
  }
  return cached.outcome;
}

function setCached(bin: string, outcome: BinLookupOutcome) {
  if (outcome.status !== "success") return;
  memoryCache.set(bin, { outcome, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function lookupBin(input: { bin: string }): Promise<BinLookupOutcome> {
  const bin = input.bin.replace(/\D/g, "").slice(0, 8);
  const cached = getCached(bin);
  if (cached) return cached;

  const backendUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!backendUrl || !publishableKey) {
    return { status: "error", message: "Lookup service is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${backendUrl}/functions/v1/bin-lookup?bin=${encodeURIComponent(bin)}`, {
      method: "GET",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as BinLookupOutcome | null;
    if (!res.ok) return { status: "error", message: data?.status === "error" ? data.message : "Lookup failed" };
    const outcome = data ?? { status: "error", message: "No response from server" };
    setCached(bin, outcome);
    return outcome;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DOMException && error.name === "AbortError" ? "Lookup timed out. Please try again." : "Lookup failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
