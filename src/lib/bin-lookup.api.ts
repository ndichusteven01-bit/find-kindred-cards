// Client-side API for BIN lookup. Calls the Lovable-hosted edge function.
// No server functions, no Vercel runtime — pure static frontend calling HTTPS.
import { supabase } from "@/integrations/supabase/client";

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

export async function lookupBin(input: { bin: string }): Promise<BinLookupOutcome> {
  const { data, error } = await supabase.functions.invoke<BinLookupOutcome>("bin-lookup", {
    body: { bin: input.bin },
  });
  if (error) return { status: "error", message: error.message || "Lookup failed" };
  return data ?? { status: "error", message: "No response from server" };
}
