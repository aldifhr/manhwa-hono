/**
 * Hono application.
 *
 * Routes are deliberately thin: each one validates input, calls one service
 * function, and returns. Business logic lives in the services so the cron
 * triggers and the HTTP API cannot drift apart.
 */
import { Hono } from "hono";
import type { Env } from "../config";
import { SOURCE_KEYS } from "../config";
import { getLogger } from "../logger";
import { runDispatchPass, runFetchPass } from "../cron/pipeline";
import {
  deleteWhitelist,
  getRecentChapters,
  loadWhitelist,
  upsertWhitelist,
} from "../storage/db";
import { slugifyTitleKey } from "../utils/text";

const logger = getLogger("api");

export const app = new Hono<{ Bindings: Env }>();

/** Constant-time-ish bearer check for the mutating routes. */
function authorized(env: Env, header: string | undefined): boolean {
  const expected = (env.MONITOR_AUTH_TOKEN ?? "").trim();
  if (!expected) return false; // unconfigured => closed, not open
  const token = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token.length !== expected.length) return false;
  // Compare every char so the length check is not the only defence.
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

app.get("/", (c) =>
  c.json({
    name: "manhwa-hono",
    version: "0.1.0",
    sources: SOURCE_KEYS,
  }),
);

app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ status: "healthy", db: "ok" });
  } catch (err) {
    return c.json({ status: "unhealthy", db: String(err).slice(0, 200) }, 503);
  }
});

// ── Whitelist ────────────────────────────────────────────────────────────────

app.get("/api/v1/whitelist", async (c) => {
  const rows = await loadWhitelist(c.env);
  return c.json({ total: rows.length, results: rows });
});

app.post("/api/v1/whitelist", async (c) => {
  if (!authorized(c.env, c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let body: { title?: string; title_key?: string; source?: string; series_url?: string; url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const source = String(body.source ?? "").trim().toLowerCase();
  if (!SOURCE_KEYS.includes(source as never)) {
    return c.json({ error: "invalid_source", allowed: SOURCE_KEYS }, 422);
  }

  const titleKey = slugifyTitleKey(body.title_key || body.title || "");
  if (!titleKey) return c.json({ error: "title_required" }, 422);

  await upsertWhitelist(c.env, {
    title_key: titleKey,
    title: body.title ?? null,
    source,
    series_url: body.series_url ?? null,
    url: body.url ?? null,
  });
  logger.info("whitelist added", { title_key: titleKey, source });
  return c.json({ ok: true, title_key: titleKey, source }, 201);
});

app.delete("/api/v1/whitelist/:titleKey/:source", async (c) => {
  if (!authorized(c.env, c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const titleKey = slugifyTitleKey(c.req.param("titleKey"));
  const source = c.req.param("source");
  const removed = await deleteWhitelist(c.env, titleKey, source);
  return c.json({ ok: true, removed });
});

// ── Chapters ─────────────────────────────────────────────────────────────────

app.get("/api/v1/chapters", async (c) => {
  const hours = Number.parseInt(c.req.query("hours") ?? "24", 10);
  const rows = await getRecentChapters(c.env, Number.isFinite(hours) ? hours : 24);
  return c.json({ total: rows.length, results: rows });
});

// ── Pipeline ─────────────────────────────────────────────────────────────────

app.post("/api/v1/cron/fetch", async (c) => {
  if (!authorized(c.env, c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const source = c.req.query("source") ?? null;
  const stats = await runFetchPass(c.env, source);
  return c.json(stats);
});

app.post("/api/v1/cron/dispatch", async (c) => {
  if (!authorized(c.env, c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const dryRun = c.req.query("dry_run") === "true";
  const stats = await runDispatchPass(c.env, dryRun);
  return c.json(stats);
});

/** One-shot: fetch then dispatch. Handy for a manual catch-up run. */
app.post("/api/v1/cron/run", async (c) => {
  if (!authorized(c.env, c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const dryRun = c.req.query("dry_run") === "true";
  const fetchStats = await runFetchPass(c.env, null);
  const dispatchStats = await runDispatchPass(c.env, dryRun);
  return c.json({ fetch: fetchStats, dispatch: dispatchStats });
});
