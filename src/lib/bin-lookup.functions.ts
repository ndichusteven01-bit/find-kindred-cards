import { createServerFn } from "@tanstack/react-start";

import type { BinLookupOutcome, BinResult } from "./bin-lookup.server";

export type { BinLookupOutcome, BinResult };

// Cache-first BIN lookup exposed to the client as a typed RPC.
// The heavy lifting lives in BinLookupService (server-only).
export const lookupBin = createServerFn({ method: "GET" })
  .inputValidator((data: { bin: string }) => {
    if (!data || typeof data.bin !== "string") {
      throw new Error("A BIN is required");
    }
    return { bin: data.bin };
  })
  .handler(async ({ data }): Promise<BinLookupOutcome> => {
    const { BinLookupService } = await import("./bin-lookup.server");
    const service = new BinLookupService();
    return service.lookup(data.bin);
  });
