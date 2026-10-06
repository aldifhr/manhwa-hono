/**
 * Retry parked sends.
 *
 * Ported from app/services/dispatch/retry.py, INCLUDING the whitelist gate.
 *
 * WHY THE GATE EXISTS: a row in failed_dispatches can outlive the whitelist
 * entry that produced it — the operator unsubscribes while a send is parked.
 * Without a whitelist check this path re-sends whatever is parked, so a removed
 * series keeps notifying on every retry pass, forever. That was a real bug in
 * the Python version.
 *
 * It also fails CLOSED: if the whitelist cannot be loaded, the pass is skipped
 * entirely. Without it, a live subscription is indistinguishable from a
 * cancelled one, and sending to a cancelled one is the bug.
 *
 * The match is cross-source on the title, the same rule
 * collectors/index.ts:filterWhitelisted uses, so retry and normal dispatch
 * agree on what "subscribed" means.
 */
import { RETRY_BACKOFF_MS, type Env } from "../config";
import { getLogger } from "../logger";
import { chapterWebhook, sendEmbeds } from "../discord/client";
import { buildEmbed } from "../discord/embeds";
import {
  parkFailedDispatch,
  recordDispatchHistory,
  resolveFailedDispatch,
} from "./claim";
import { slugifyTitleKey } from "../utils/text";

const logger = getLogger("services:retry");

const MAX_RETRIES = 5;

interface ParkedRow {
  chapter_url: string;
  title_key: string | null;
  source: string | null;
  chapter_title: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  updated_at: string;
}

export interface RetryStats {
  retried: number;
  resent: number;
  skippedUnsubscribed: number;
  skippedPermanent: number;
  skippedWindow: number;
  stillFailed: number;
}

/** Load the set of whitelisted title keys (cross-source). */
async function loadWhitelistTitles(env: Env): Promise<Set<string> | null> {
  try {
    const res = await env.DB.prepare(`SELECT title_key FROM whitelist`).all<{
      title_key: string;
    }>();
    const out = new Set<string>();
    for (const r of res.results ?? []) {
      const tk = slugifyTitleKey(r.title_key ?? "");
      if (tk) out.add(tk);
    }
    return out;
  } catch (err) {
    logger.error("retry: whitelist load failed, skipping pass", {
      err: String(err).slice(0, 160),
    });
    return null;
  }
}

/** Exponential-ish backoff, capped. */
function backoffMs(retryCount: number): number {
  return RETRY_BACKOFF_MS * Math.min(2 ** retryCount, 8);
}

export async function retryFailedDispatches(env: Env): Promise<RetryStats> {
  const stats: RetryStats = {
    retried: 0,
    resent: 0,
    skippedUnsubscribed: 0,
    skippedPermanent: 0,
    skippedWindow: 0,
    stillFailed: 0,
  };

  const webhook = chapterWebhook(env);
  if (!webhook) return stats;

  const res = await env.DB.prepare(
    `SELECT chapter_url, title_key, source, chapter_title, error_code, error_message,
            retry_count, updated_at
       FROM failed_dispatches
      WHERE status = 'failed'
      ORDER BY updated_at ASC
      LIMIT 100`,
  ).all<ParkedRow>();
  const rows = res.results ?? [];
  if (rows.length === 0) return stats;

  // ── Whitelist gate. Fail CLOSED. ──
  const wlTitles = await loadWhitelistTitles(env);
  if (wlTitles === null) {
    stats.stillFailed = rows.length;
    return stats;
  }

  const now = Date.now();

  for (const row of rows) {
    const url = row.chapter_url;
    if (!url) continue;

    // A parked row can outlive its subscription — drop it rather than
    // resurrect a series the operator removed.
    const tk = slugifyTitleKey(row.title_key ?? "");
    if (!tk || !wlTitles.has(tk)) {
      await resolveFailedDispatch(env, url, "Series no longer whitelisted");
      stats.skippedUnsubscribed++;
      continue;
    }

    // Permanent failures are not worth retrying.
    const code = row.error_code ?? "";
    if (code.startsWith("HTTP_4") && code !== "HTTP_429") {
      await resolveFailedDispatch(env, url, `Permanent failure: ${code}`);
      stats.skippedPermanent++;
      continue;
    }

    if (row.retry_count >= MAX_RETRIES) {
      await resolveFailedDispatch(env, url, `Gave up after ${MAX_RETRIES} attempts`);
      stats.skippedPermanent++;
      continue;
    }

    // Backoff window — a row retried too recently is left alone.
    const updatedMs = Date.parse(row.updated_at);
    if (Number.isFinite(updatedMs) && now - updatedMs < backoffMs(row.retry_count)) {
      stats.skippedWindow++;
      continue;
    }

    stats.retried++;

    const embed = buildEmbed({
      title: row.title_key?.replace(/-/g, " ") ?? "Untitled",
      chapters: [String(row.chapter_title ?? "")],
      chapterUrls: [url],
      source: row.source ?? "",
      seriesUrl: "",
      updatedTime: "",
    });

    const send = await sendEmbeds(webhook, [embed]);
    if (send.ok) {
      await recordDispatchHistory(env, [
        {
          chapterUrl: url,
          titleKey: tk,
          source: row.source ?? "",
          chapterTitle: String(row.chapter_title ?? ""),
          cover: null,
          seriesUrl: null,
        },
      ]);
      await resolveFailedDispatch(env, url, "Retried successfully");
      stats.resent++;
    } else {
      await parkFailedDispatch(env, {
        chapterUrl: url,
        titleKey: tk,
        source: row.source ?? "",
        chapterTitle: String(row.chapter_title ?? ""),
        cover: null,
        seriesUrl: null,
        errorCode: send.errorCode,
        errorMessage: send.errorMessage,
      });
      // parkFailedDispatch upserts; bump the attempt counter explicitly.
      await env.DB.prepare(
        `UPDATE failed_dispatches SET retry_count = retry_count + 1 WHERE chapter_url = ?1`,
      )
        .bind(url)
        .run();
      stats.stillFailed++;
    }
  }

  logger.info("retry_failed completed", { ...stats });
  return stats;
}
