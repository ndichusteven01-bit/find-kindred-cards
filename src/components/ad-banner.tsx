import { useEffect, useState } from "react";
import { listBanners, type AdBanner } from "@/lib/banners.api";

export function AdBanner() {
  const [banners, setBanners] = useState<AdBanner[]>([]);

  useEffect(() => {
    listBanners()
      .then((b) => setBanners(b.filter((x) => x.active && x.image_url)))
      .catch(() => {});
  }, []);

  if (banners.length === 0) return null;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {banners.map((b) => (
        <BannerTile key={b.id} banner={b} />
      ))}
    </div>
  );
}

function BannerTile({ banner }: { banner: AdBanner }) {
  const bg = banner.background_color ?? "#1f2937";
  const img = (
    <img
      src={banner.image_url!}
      alt={banner.label || `Banner ${banner.slot}`}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
  const inner = (
    <div
      className="flex h-[72px] w-full items-center justify-center overflow-hidden rounded-md border border-white/10 shadow-sm transition-transform hover:scale-[1.01]"
      style={{ background: bg }}
    >
      {img}
    </div>
  );
  if (banner.link_url) {
    return (
      <a href={banner.link_url} target="_blank" rel="noopener noreferrer sponsored" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}
