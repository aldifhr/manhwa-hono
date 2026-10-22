import { baseRssItemSchema } from "@manhwa-scanner/shared";
import { rewriteCoverUrl } from "@/lib/utils";

// Frontend extends shared base with cover rewrite + url fallbacks (single source stays in shared)
export const rssItemSchema = baseRssItemSchema.transform((d: any) => ({
  ...d,
  cover: d.cover ? rewriteCoverUrl(d.cover) : null,
  url: d.url ?? d.chapterUrl ?? undefined,
  chapterUrl: d.chapterUrl ?? undefined,
  seriesUrl: d.seriesUrl ?? undefined,
}));
