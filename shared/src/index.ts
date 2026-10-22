// Shared contract — single source truth FE↔BE
// Re-export openapi.json + typed helpers. Run `pnpm --filter @manhwa-scanner/shared generate` to refresh zod.

export const API_PREFIX = "/api/v1" as const;

// Keep in sync with apps/backend/openapi.json#info.version
export const OPENAPI_VERSION = "0.1.0";

// TitleKey = canonical slug, Source = scraper origin
export type Source = "shinigami" | "voratoon";

/** Every configured source, in display order. Single source of truth for the
 *  filter chips and any other place that needs to enumerate sources. */
export const SOURCES: Source[] = ["shinigami", "voratoon"];
export type Origin = "KR" | "CN" | "JP";

export interface WhitelistItem {
  titleKey: string;
  title: string;
  source: Source;
  cover: string | null;
  origin: Origin | null;
  type: string | null;
  rating?: string | number | null;
}

export interface ExcludedTitleItem {
  titleKey: string;
  title?: string | null;
  source: Source | "all";
  cover?: string | null;
  seriesUrl?: string | null;
}

// Re-export raw openapi for tooling (orval / openapi-typescript)
import openapi from "../openapi.json" with { type: "json" };
export { openapi };
export default openapi;

export * from "./schemas";
