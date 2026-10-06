/**
 * Shared collector helpers.
 *
 * A "scraped item" is the flat shape the whole pipeline speaks. Every source
 * collector normalises into it, so nothing downstream needs to know which site
 * a chapter came from.
 */
import { freshWindowHours, type Env, type SourceKey } from "../config";
import { getLogger } from "../logger";

const logger = getLogger("cron:collectors");

export interface ScrapedItem {
  title: string;
  title_key: string;
  chapter: string;
  chapter_num: number;
  url: string;
  chapter_url: string;
  source: SourceKey;
  cover: string | null;
  series_url: string;
  origin: string;
  updated_time: string;
  release_date: string;
  rating: number | null;
  genres: string[];
  description: string;
  type: string;
}

export interface CollectorContext {
  env: Env;
  /** Latest chapter already sent per (title_key, source) — skip anything at or below. */
  latestSent: Map<string, number>;
  /** Sources in cooldown. */
  disabled: Set<string>;
}

/**
 * The `latest_sent_chapter` ceiling.
 *
 * Without it, a source that reports its full chapter list re-offers old
 * chapters every cycle. The ceiling is a floor on what is worth collecting, so
 * a series whose newest sent chapter is 120 does not re-scrape 1..119.
 */
export function ceilingFor(
  latestSent: Map<string, number>,
  titleKey: string,
  source: string,
): number {
  return latestSent.get(`${titleKey}|${source}`) ?? 0;
}

/** Parse a chapter number out of a source value. Returns 0 when unusable. */
export function chapterNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export interface HealthOutcome {
  status: string;
  response_time_ms: number;
  successes_today: number;
  failures_today: number;
  consecutive_failures: number;
  last_error: string | null;
  last_success_at: string | null;
  last_checked_at: string;
}

/** Classify a failure into the status vocabulary the dashboard already knows. */
export function classifyFailure(err: string, prevConsecutive: number): HealthOutcome {
  const text = err.toLowerCase();
  let status = "DEGRADED";
  if (/(429|rate limit|too many requests)/.test(text)) status = "RATE_LIMITED";
  else if (/(403|forbidden|cloudflare|blocked)/.test(text)) status = "BLOCKED";
  else if (/(timeout|timed out|connection)/.test(text)) status = "DOWN";

  return {
    status,
    response_time_ms: 0,
    successes_today: 0,
    failures_today: 1,
    consecutive_failures: prevConsecutive + 1,
    last_error: err.slice(0, 300),
    last_success_at: null,
    last_checked_at: new Date().toISOString(),
  };
}

export function healthyOutcome(responseTimeMs: number): HealthOutcome {
  return {
    status: "HEALTHY",
    response_time_ms: responseTimeMs,
    successes_today: 1,
    failures_today: 0,
    consecutive_failures: 0,
    last_error: null,
    last_success_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };
}

/** True when a timestamp is inside the freshness window. */
export function isFresh(env: Env, iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= Date.now() - freshWindowHours(env) * 3600 * 1000;
}

export { logger };
