// mapper — snake→camel, single place for BE↔FE field renames
export function mapWhitelist(r: unknown) {
  const x = r as Record<string, unknown>;
  return {
    ...x,
    titleKey: (x.title_key as string) ?? (x.titleKey as string),
    seriesUrl: (x.series_url as string) ?? (x.seriesUrl as string),
    canonicalTitleKey:
      (x.canonical_title_key as string) ?? (x.canonicalTitleKey as string),
  };
}
export function mapHistory(r: unknown) {
  return r as Record<string, unknown>;
}
export function mapRss(r: unknown) {
  const x = r as Record<string, unknown>;
  const rawTk = (x.title_key as string) ?? (x.titleKey as string);
  const fallbackTk = rawTk ?? (x.title ? String(x.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) : "");
  const rawCl = (x.chapter_label as string) ?? (x.chapterLabel as string) ?? (x.chapter as string);
  const rawCn = (x.chapter_number as number) ?? (x.chapterNumber as number);
  return {
    ...x,
    titleKey: fallbackTk,
    chapterLabel: rawCl ?? (rawCn != null ? `Chapter ${rawCn}` : undefined),
    chapterNumber: rawCn,
    chapterUrl: (x.chapter_url as string) ?? (x.chapterUrl as string) ?? (x.url as string),
    seriesUrl: (x.series_url as string) ?? (x.seriesUrl as string) ?? (x.url as string) ?? "",
    isWhitelisted:
      (x.is_whitelisted as boolean) ?? (x.isWhitelisted as boolean),
    type: (x.format as string) ?? (x.type as string),
    format: (x.format as string) ?? (x.type as string),
    origin: (x.country as string) ?? (x.origin as string),
    country: (x.country as string) ?? (x.origin as string),
  };
}
export function mapExcluded(r: unknown) {
  const x = r as Record<string, unknown>;
  return {
    ...x,
    titleKey:
      (x.title_key as string) ??
      (x.titleKey as string) ??
      (x.id as string) ??
      "",
  };
}
