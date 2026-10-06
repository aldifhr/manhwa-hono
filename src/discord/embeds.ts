/**
 * Discord embed builder.
 *
 * Ported from app/discord/embeds.py. The field order, emoji and colour per
 * source are kept identical so the ported output is indistinguishable from the
 * Python one in the channel.
 */
import { DEFAULT_COLOR, SOURCE_COLORS, SOURCE_LABELS } from "../config";
import { escapeDiscordMd, truncate } from "../utils/text";

/** Colours: shinigami red, voratoon orange. */
export function colorFor(source: string): number {
  return SOURCE_COLORS[source] ?? DEFAULT_COLOR;
}

export function labelFor(source: string): string {
  return SOURCE_LABELS[source] ?? source ?? "unknown";
}

/** Chapter number for sorting, from a free-form chapter label. */
function chapterSortValue(label: string): number {
  const m = /(\d+(?:\.\d+)?)/.exec(label ?? "");
  return m ? Number.parseFloat(m[1] as string) : 0;
}

/** Render a rating as stars, matching the Python display. */
function ratingStars(rating: number | string | null | undefined): string {
  if (rating === null || rating === undefined || rating === "") return "`No rating`";
  const n = Number(rating);
  if (!Number.isFinite(n)) return "`No rating`";
  const outOf5 = Math.max(0, Math.min(5, n > 5 ? n / 2 : n));
  const full = Math.floor(outOf5);
  const half = outOf5 - full >= 0.5;
  return `${"★".repeat(full)}${half ? "½" : ""}${"☆".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))} \`${n.toFixed(2)}\``;
}

/** Relative time plus an absolute stamp, as Discord renders it. */
function releaseTimestamps(iso: string | null | undefined): string {
  if (!iso) return "`unknown`";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "`unknown`";
  const secs = Math.floor(ms / 1000);
  return `<t:${secs}:R> • <t:${secs}:f>`;
}

/** First couple of sentences of the synopsis. */
function shortSynopsis(text: string | null | undefined, max = 320): string {
  if (!text) return "";
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return `${lastDot(cut, lastStop)}…`;
}

function lastDot(cut: string, idx: number): string {
  return idx > maxFloor(cut) ? cut.slice(0, idx + 1).trim() : cut.trim();
}

function maxFloor(cut: string): number {
  return Math.floor(cut.length * 0.6);
}

export interface EmbedInput {
  title: string;
  chapters: string[];
  chapterUrls: string[];
  seriesUrl?: string;
  source: string;
  cover?: string | null;
  rating?: number | null;
  genres?: string[] | null;
  description?: string | null;
  updatedTime?: string | null;
}

/** One embed for a series, linking every chapter it dropped in this window. */
export function buildEmbed(input: EmbedInput): Record<string, unknown> {
  const {
    title,
    chapters,
    chapterUrls,
    seriesUrl = "",
    source,
    cover = null,
    rating = null,
    genres = null,
    description = "",
    updatedTime = "",
  } = input;

  const label = labelFor(source);
  const color = colorFor(source);
  const genreText = genres && genres.length ? genres.slice(0, 5).join(", ") : null;
  const ratingDisplay = ratingStars(rating);

  // Pair each chapter with its URL, sorted by number ascending.
  const pairs = chapters.map((ch, i) => ({ ch, url: chapterUrls[i] ?? "" }));
  pairs.sort((a, b) => chapterSortValue(a.ch) - chapterSortValue(b.ch));

  const chapterLinks = pairs.map((p) =>
    p.url ? `[ch ${p.ch}](${escapeDiscordMd(p.url)})` : `ch ${p.ch}`,
  );
  const latestUrl = pairs.length > 0 ? (pairs[pairs.length - 1]?.url ?? "") : "";
  const multi = pairs.length > 1;
  const chapterValue = multi ? chapterLinks.join(", ") : (chapterLinks[0] ?? "—");

  const fields: Array<Record<string, unknown>> = [
    { name: "🕐 Released", value: releaseTimestamps(updatedTime), inline: false },
    { name: `📖 Chapter${multi ? "s" : ""}`, value: chapterValue, inline: true },
    { name: "🔗 Source", value: `\`${label}\``, inline: true },
  ];
  if (genreText) {
    fields.push({ name: "🏷️ Genres", value: `\`${genreText}\``, inline: false });
  }
  fields.push({ name: "⭐ Rating", value: ratingDisplay, inline: true });

  const actionParts: string[] = [];
  if (latestUrl) actionParts.push(`[📖 Read Latest](${escapeDiscordMd(latestUrl)})`);
  if (seriesUrl && seriesUrl !== latestUrl) {
    actionParts.push(`[📚 Series Page](${escapeDiscordMd(seriesUrl)})`);
  }
  const actionLine = actionParts.length ? `**Links:** ${actionParts.join(" • ")}` : "";

  const synopsis = shortSynopsis(description);
  let desc = "";
  if (synopsis) desc = synopsis + (actionLine ? `\n${actionLine}` : "");
  else if (actionLine) desc = actionLine;

  const embed: Record<string, unknown> = {
    title: truncate(title, 200) || "Untitled",
    url: seriesUrl || undefined,
    color,
    fields,
    footer: { text: `Source: ${label}` },
    timestamp: new Date().toISOString(),
  };
  if (desc) embed.description = desc;
  if (cover) embed.thumbnail = { url: cover };
  return embed;
}

/** Wrap embeds in the webhook payload shape. */
export function webhookPayload(embeds: Array<Record<string, unknown>>): Record<string, unknown> {
  return { embeds: embeds.slice(0, 10) };
}
