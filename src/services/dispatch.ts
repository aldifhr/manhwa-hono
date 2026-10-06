/**
 * Dispatch: group, claim, send, record.
 *
 * Ported from app/cron/dispatch_mod.py.
 *
 * Grouping happens BEFORE the send: a series that dropped three chapters in
 * the window becomes ONE embed listing three chapters, not three embeds. That
 * is what keeps the channel readable on a batch-release day.
 */
import type { Env } from "../config";
import { getLogger } from "../logger";
import { chapterWebhook, sendEmbeds } from "../discord/client";
import { buildEmbed } from "../discord/embeds";
import {
  alreadyDispatched,
  claimForDispatch,
  parkFailedDispatch,
  recordDispatchHistory,
  releaseClaims,
} from "../services/claim";
import { fcfsKey, slugifyTitleKey } from "../utils/text";
import type { ScrapedItem } from "../collectors/common";

const logger = getLogger("cron:dispatch");

export interface DispatchStats {
  sent: number;
  embeds: number;
  skipped: number;
  failed: number;
}

/** One embed's worth of work: every chapter a series dropped in this window. */
interface Group {
  titleKey: string;
  title: string;
  source: string;
  seriesUrl: string;
  cover: string | null;
  rating: number | null;
  genres: string[];
  description: string;
  updatedTime: string;
  chapters: string[];
  chapterUrls: string[];
  items: ScrapedItem[];
}

/**
 * Collapse items into one group per (title_key, source).
 *
 * Grouping is per source so the embed colour and label stay truthful; a series
 * carried by two sources produces two groups, and FCFS dedupe upstream means
 * only the first one has anything left to send.
 */
export function groupItems(items: ScrapedItem[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const it of items) {
    const tk = slugifyTitleKey(it.title_key || it.title);
    const key = `${tk}|${it.source}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        titleKey: tk,
        title: it.title,
        source: it.source,
        seriesUrl: it.series_url,
        cover: it.cover,
        rating: it.rating,
        genres: it.genres,
        description: it.description,
        updatedTime: it.release_date || it.updated_time,
        chapters: [],
        chapterUrls: [],
        items: [],
      };
      byKey.set(key, g);
    }
    g.chapters.push(it.chapter);
    g.chapterUrls.push(it.chapter_url || it.url);
    g.items.push(it);
    // Prefer the newest timestamp and the richest metadata across the group.
    if ((it.release_date || it.updated_time) > g.updatedTime) {
      g.updatedTime = it.release_date || it.updated_time;
    }
    if (!g.cover && it.cover) g.cover = it.cover;
    if (g.rating === null && it.rating !== null) g.rating = it.rating;
    if (g.genres.length === 0 && it.genres.length > 0) g.genres = it.genres;
    if (!g.description && it.description) g.description = it.description;
  }
  return [...byKey.values()];
}

/**
 * Send whitelisted groups to Discord.
 *
 * `items` MUST already be whitelist-filtered by the caller — this function does
 * not re-check, because the claim/ledger dance below is what protects against
 * duplicates and doing the check twice invites the two from drifting apart.
 * See collectors/index.ts:filterWhitelisted.
 */
export async function dispatch(
  env: Env,
  items: ScrapedItem[],
  opts: { dryRun?: boolean } = {},
): Promise<DispatchStats> {
  const stats: DispatchStats = { sent: 0, embeds: 0, skipped: 0, failed: 0 };
  if (items.length === 0) return stats;

  // A dry run must work without a webhook: its whole purpose is to preview what
  // a live run WOULD send, and refusing to preview until the delivery target is
  // configured makes it useless during setup and debugging.
  const webhook = chapterWebhook(env);
  if (!webhook && !opts.dryRun) {
    logger.error("dispatch: no DISCORD_WEBHOOK_URL configured");
    return stats;
  }

  const groups = groupItems(items);

  // Drop anything already in the permanent ledger before touching Discord.
  const allKeys = groups.map((g) => fcfsKey(g.title, g.chapters[g.chapters.length - 1] ?? ""));
  const done = await alreadyDispatched(env, allKeys);

  for (const g of groups) {
    // Use the newest chapter as the group's identity for dedupe: if the newest
    // chapter is already recorded, the group has nothing new to say.
    const newest = g.chapters[g.chapters.length - 1] ?? "";
    const groupKey = fcfsKey(g.title, newest);
    if (done.has(groupKey)) {
      stats.skipped++;
      continue;
    }

    if (opts.dryRun) {
      stats.sent++;
      stats.embeds++;
      continue;
    }

    // Claim every chapter in the group so a concurrent tick cannot take them.
    const claim = await claimForDispatch(
      env,
      g.items.map((it) => ({
        titleKey: g.titleKey,
        title: it.title,
        chapter: it.chapter,
        source: it.source,
        channelId: "webhook",
      })),
      "webhook",
    );

    if (claim.claimed.length === 0 && claim.skipped > 0) {
      stats.skipped++;
      continue;
    }

    const embed = buildEmbed({
      title: g.title,
      chapters: g.chapters,
      chapterUrls: g.chapterUrls,
      seriesUrl: g.seriesUrl,
      source: g.source,
      cover: g.cover,
      rating: g.rating,
      genres: g.genres,
      description: g.description,
      updatedTime: g.updatedTime,
    });

    const res = opts.dryRun
      ? { ok: true, status: 0, errorCode: "", errorMessage: "" }
      : await sendEmbeds(webhook as string, [embed]);

    if (res.ok) {
      // A dry run must not touch the ledger — otherwise previewing a run would
      // consume the very chapters it was previewing, and the real run after it
      // would find nothing to send.
      if (!opts.dryRun) {
        await recordDispatchHistory(
          env,
          g.items.map((it) => ({
            chapterUrl: it.chapter_url || it.url,
            titleKey: g.titleKey,
            source: g.source,
            chapterTitle: it.chapter,
            cover: it.cover,
            seriesUrl: it.series_url,
          })),
        );
      }
      stats.sent++;
      stats.embeds++;
    } else {
      stats.failed++;
      // Park the whole group so a transient Discord failure is not lost.
      for (const it of g.items) {
        await parkFailedDispatch(env, {
          chapterUrl: it.chapter_url || it.url,
          titleKey: g.titleKey,
          source: g.source,
          chapterTitle: it.chapter,
          cover: it.cover,
          seriesUrl: it.series_url,
          errorCode: res.errorCode,
          errorMessage: res.errorMessage,
        });
      }
      logger.warn("dispatch send failed", {
        title: g.title,
        code: res.errorCode,
        status: res.status,
      });
    }

    // Release regardless: on success the ledger now covers it, on failure the
    // parked row does. Holding the claim would block the retry path.
    await releaseClaims(env, claim.claimed);
  }

  logger.info("dispatch done", { ...stats, groups: groups.length });
  return stats;
}
