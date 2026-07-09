import { useState, type FormEvent } from "react";
import { Search, Loader2, Database, Zap, AlertCircle, SearchX } from "lucide-react";

import { lookupBin, type BinResult } from "@/lib/bin-lookup.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo } from "@/components/brand-logo";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: BinResult }
  | { status: "not_found"; bin: string }
  | { status: "error"; message: string };

const FIELDS: { key: keyof BinResult; label: string }[] = [
  { key: "bin", label: "BIN / IIN" },
  { key: "scheme", label: "Scheme" },
  { key: "brand", label: "Brand" },
  { key: "cardType", label: "Card Type" },
  { key: "category", label: "Category / Level" },
  { key: "bankName", label: "Issuing Bank" },
  { key: "bankUrl", label: "Bank Website" },
  { key: "bankPhone", label: "Bank Phone" },
  { key: "countryName", label: "Country" },
  { key: "countryCode", label: "Country Code" },
  { key: "currency", label: "Currency" },
];

const LEFT_FIELDS = FIELDS.slice(0, Math.ceil(FIELDS.length / 2));
const RIGHT_FIELDS = FIELDS.slice(Math.ceil(FIELDS.length / 2));


function display(field: keyof BinResult, data: BinResult | null): React.ReactNode {
  if (!data) return <span className="text-muted-foreground/70">Waiting for lookup</span>;
  const v = data[field];
  if (field === "scheme" || field === "brand") {
    if (!v) return <Muted>Not published</Muted>;
    return <BrandLogo name={String(v)} />;
  }
  if (field === "countryName") {
    const flagCode = /^[a-z]{2}$/i.test(data.countryCode ?? "") ? data.countryCode!.toLowerCase() : null;
    const flag = data.countryEmoji;
    const name = data.countryName;
    if (!name) return <Muted>Not published</Muted>;
    return (
      <span className="inline-flex items-center gap-3">
        {flagCode ? (
          <span
            aria-label={`${name} flag`}
            className={`fi fi-${flagCode} block h-[26px] w-9 rounded-sm border border-border object-cover shadow-sm`}
          />
        ) : (
          <span className="text-2xl leading-none">{flag ?? "🏳️"}</span>
        )}
        <span className="font-semibold uppercase tracking-wide">{name}</span>
      </span>
    );
  }
  if (field === "bankUrl" && typeof v === "string" && v) {
    const href = v.startsWith("http") ? v : `https://${v}`;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {v}
      </a>
    );
  }
  if ((field === "bankUrl" || field === "bankPhone") && (v === null || v === undefined || v === "")) {
    return <Muted>Issuer contact search unavailable</Muted>;
  }
  if (v === null || v === undefined || v === "") return <Muted>Not published</Muted>;
  return String(v);
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground/70 italic">{children}</span>;
}

export function BinLookup() {
  const [bin, setBin] = useState("");
  const [view, setView] = useState<ViewState>({ status: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = bin.replace(/\D/g, "");
    if (cleaned.length < 6) {
      setView({ status: "error", message: "Enter at least the first 6 digits of the card." });
      return;
    }
    setView({ status: "loading" });
    try {
      const outcome = await lookupBin({ bin: cleaned });
      if (outcome.status === "success") setView({ status: "success", data: outcome.data });
      else if (outcome.status === "not_found") setView({ status: "not_found", bin: cleaned });
      else setView({ status: "error", message: outcome.message });
    } catch {
      setView({ status: "error", message: "Something went wrong. Please try again." });
    }
  }

  const data = view.status === "success" ? view.data : null;
  const isLoading = view.status === "loading";

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6">
      {/* Input - centered, compact */}
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-glow sm:flex-row"
      >
        <Input
          inputMode="numeric"
          autoComplete="off"
          placeholder="Enter first 6 digits (e.g. 457173)"
          value={bin}
          onChange={(e) => setBin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-12 flex-1 text-base tracking-widest"
          aria-label="Card BIN"
        />
        <Button type="submit" disabled={isLoading} className="h-12 gap-2 px-6 text-base">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isLoading ? "Checking…" : "Check BIN"}
        </Button>
      </form>

      {/* Status bar */}
      <div className="mx-auto mt-6 flex w-full max-w-4xl items-center justify-between text-sm">
        <h2 className="font-display text-lg font-semibold">Lookup results</h2>
        {data && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              data.source === "cache"
                ? "bg-secondary text-secondary-foreground"
                : "bg-gradient-accent text-primary-foreground"
            }`}
          >
            {data.source === "cache" ? (
              <><Database className="h-3.5 w-3.5" /> Cached</>
            ) : (
              <><Zap className="h-3.5 w-3.5" /> Live</>
            )}
          </span>
        )}
      </div>

      {/* Error / not found */}
      {view.status === "error" && (
        <div className="mx-auto mt-3 flex w-full max-w-4xl items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {view.message}
        </div>
      )}
      {view.status === "not_found" && (
        <div className="mx-auto mt-3 flex w-full max-w-4xl items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <SearchX className="h-4 w-4" /> No records for BIN {view.bin}.
        </div>
      )}

      {/* Results table - centered, wider than input, styled, two-column layout */}
      <div className="mx-auto mt-3 w-full max-w-4xl overflow-hidden rounded-lg border-2 border-[#4a7a8c] bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0 bg-[#4a7a8c] hover:bg-[#4a7a8c]">
              <TableHead className="w-[140px] border-r border-white/20 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">
                Category
              </TableHead>
              <TableHead className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">
                Information
              </TableHead>
              <TableHead className="w-[140px] border-r border-white/20 px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">
                Category
              </TableHead>
              <TableHead className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-white">
                Information
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: Math.max(LEFT_FIELDS.length, RIGHT_FIELDS.length) }, (_, i) => {
              const left = LEFT_FIELDS[i];
              const right = RIGHT_FIELDS[i];
              return (
                <TableRow
                  key={i}
                  className={`border-b border-[#c9d9e0] last:border-b-0 ${
                    i % 2 === 0 ? "bg-[#eaf1f4] hover:bg-[#dfe9ee]" : "bg-white hover:bg-[#f4f8fa]"
                  }`}
                >
                  <th
                    scope="row"
                    className="border-r border-[#c9d9e0] px-2 py-2 text-left text-xs font-semibold text-[#2c4a56]"
                  >
                    {left?.label ?? ""}
                  </th>
                  <TableCell className="border-r border-[#2c4a56]/20 px-2 py-2 text-left text-xs font-medium text-foreground">
                    {isLoading ? (
                      <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted" />
                    ) : left ? (
                      display(left.key, data)
                    ) : null}
                  </TableCell>
                  <th
                    scope="row"
                    className="border-r border-[#c9d9e0] px-2 py-2 text-left text-xs font-semibold text-[#2c4a56]"
                  >
                    {right?.label ?? ""}
                  </th>
                  <TableCell className="px-2 py-2 text-left text-xs font-medium text-foreground">
                    {isLoading ? (
                      <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted" />
                    ) : right ? (
                      display(right.key, data)
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

