import { createFileRoute } from "@tanstack/react-router";

import { AdBanner } from "@/components/ad-banner";
import { BinLookup } from "@/components/bin-lookup";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/")({
  head: () => ({
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "BIN Lookup",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Free BIN/IIN lookup tool. Identify the issuing bank, scheme, brand, card type, country and currency behind any card BIN.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdBanner />
      <main className="flex-1 py-6">
        <BinLookup />
      </main>
      <SiteFooter />
    </div>
  );
}
