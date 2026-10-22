import { z } from "zod";

// Dual-naming helper: backend may send snake or camel (migration period)
function dual<T extends z.ZodTypeAny>(snake: string, camel: string, base: T) {
  return z
    .object({ [snake]: base.optional(), [camel]: base.optional() })
    .transform(
      (o) =>
        (o as Record<string, unknown>)[snake] ??
        (o as Record<string, unknown>)[camel]
    );
}

export const excludedTitleSchema = z
  .object({
    id: z.string().nullable().optional(),
    title_key: z.string().min(1).nullable().optional(),
    titleKey: z.string().min(1).nullable().optional(),
    title: z.string().nullable().optional(),
    source: z.enum(["shinigami", "voratoon"]).nullable().optional(),
    created_at: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    cover: z.string().nullable().optional(),
    series_url: z.string().url().nullable().optional(),
    seriesUrl: z.string().url().nullable().optional(),
  })
  .passthrough()
  .transform((r) => ({
    id:
      (r.title_key as string) ||
      (r.titleKey as string) ||
      (r.id as string) ||
      "",
    titleKey:
      (r.title_key as string) ||
      (r.titleKey as string) ||
      (r.id as string) ||
      "",
    title: (r.title as string | null) ?? null,
    // Exclude rows always name one concrete source; backend rejects 'all'.
    source: (r.source as "shinigami" | "voratoon") ?? "shinigami",
    createdAt:
      (r.created_at as string | null) || (r.createdAt as string | null) || null,
    cover: (r.cover as string | null) ?? null,
    seriesUrl:
      (r.series_url as string | null) || (r.seriesUrl as string | null) || null,
  }));

export const whitelistSchema = z
  .object({
    title_key: z.string().min(1).optional(),
    titleKey: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    source: z.enum(["shinigami", "voratoon"]).optional(),
    cover: z.string().nullable().optional(),
    series_url: z.string().url().nullable().optional(),
    seriesUrl: z.string().url().nullable().optional(),
  })
  .passthrough()
  .transform((r) => ({
    ...r,
    titleKey: (r.title_key as string) ?? (r.titleKey as string) ?? "",
    seriesUrl: (r.series_url as string) ?? (r.seriesUrl as string) ?? "",
  }));

// Shared base RSS schema — snake→camel + lenient fields (single source, no cover rewrite here)
// Frontend extends with rewriteCoverUrl transform.
const SNAKE_TO_CAMEL: Record<string, string> = {
  title_key: "titleKey",
  canonical_title_key: "canonicalTitleKey",
  chapter_label: "chapterLabel",
  chapter_number: "chapterNumber",
  chapter_url: "chapterUrl",
  series_url: "seriesUrl",
  is_sent: "isSent",
  is_whitelisted: "isWhitelisted",
  created_at: "createdAt",
  sent_at: "sentAt",
  updated_at: "updatedAt",
};
const camelizeKeys = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>))
    out[SNAKE_TO_CAMEL[k] ?? k] = v;
  return out;
};
const strOrNum = z.union([z.string(), z.number()]);
const strictBoolean = z
  .union([
    z.boolean(),
    z.literal("true"),
    z.literal("false"),
    z.literal(0),
    z.literal(1),
  ])
  .nullish()
  .catch(undefined);

export const baseRssItemSchema = z.preprocess(
  camelizeKeys,
  z.object({
    id: z.string().nullish().catch(() => undefined),
    title: z.string().catch(""),
    titleKey: z
      .string()
      .nullish()
      .catch(() => undefined),
    canonicalTitleKey: z
      .string()
      .nullish()
      .catch(() => undefined),
    isSent: z
      .preprocess(
        (v) =>
          v === "true" || v === 1 ? true : v === "false" || v === 0 ? false : v,
        strictBoolean
      )
      .nullish()
      .catch(() => undefined),
    chapter: z
      .string()
      .nullish()
      .catch(() => undefined),
    chapterLabel: z
      .string()
      .nullish()
      .catch(() => undefined),
    chapterNumber: z
      .union([z.null(), z.coerce.number()])
      .nullish()
      .catch(() => undefined),
    url: z
      .string()
      .nullish()
      .catch(() => undefined),
    chapterUrl: z
      .string()
      .nullish()
      .catch(() => undefined),
    source: z.string().catch(""),
    cover: z
      .string()
      .nullish()
      .catch(() => undefined),
    origin: z
      .string()
      .nullish()
      .catch(() => undefined),
    // The backend sends the content format (manhwa / manhua / manga) as
    // `format`; `country` is the separate, currently-NULL column. Without this
    // field Zod strips it at the proxy boundary and the country flag has no
    // signal to fall back to.
    format: z
      .string()
      .nullish()
      .catch(() => undefined),
    // Also sent by the backend and read by the frontend; Zod strips any key
    // that is not declared, so every consumed field has to be listed here.
    country: z
      .string()
      .nullish()
      .catch(() => undefined),
    latestUpdated: z
      .string()
      .nullish()
      .catch(() => undefined),
    sources: z.array(z.string()).catch([]),
    type: z
      .string()
      .nullish()
      .catch(() => undefined),
    seriesUrl: z
      .string()
      .nullish()
      .catch(() => undefined),
    rating: strOrNum.nullish().catch(() => undefined),
    genres: z.array(z.string()).catch([]),
    description: z
      .string()
      .nullish()
      .catch(() => undefined),
    isWhitelisted: z
      .preprocess(
        (v) =>
          v === "true" || v === 1 ? true : v === "false" || v === 0 ? false : v,
        strictBoolean
      )
      .nullish()
      .catch(() => undefined),
    createdAt: z
      .string()
      .nullish()
      .catch(() => undefined),
    sentAt: z
      .string()
      .nullish()
      .catch(() => undefined),
    lastCheckedChapter: z
      .union([z.null(), z.coerce.number()])
      .nullish()
      .catch(() => undefined),
    latestSentChapter: z
      .union([z.null(), z.coerce.number()])
      .nullish()
      .catch(() => undefined),
    latestChapter: z
      .union([z.null(), z.coerce.number()])
      .nullish()
      .catch(() => undefined),
  })
);

// Backward compat — minimal rssItemSchema now points to base (cover rewrite applied in frontend)
export const rssItemSchema = baseRssItemSchema;

export type ExcludedTitleParsed = z.infer<typeof excludedTitleSchema>;
