/**
 * Worker entry point.
 *
 * Two ways in:
 *   fetch   — the Hono HTTP API (see api/app.ts)
 *   scheduled — the cron triggers declared in wrangler.toml
 *
 * The scheduled handler runs the two passes on independent schedules: a fast
 * fetch pass every 5 minutes, and a dispatch pass on the same tick. Splitting
 * them matters because a slow source (shinigami has been observed at 24s) must
 * not delay notification of chapters another source already found.
 */
import { app } from "./api/app";
import type { Env } from "./config";
import { getLogger } from "./logger";
import { runDispatchPass, runFetchPass } from "./cron/pipeline";
import { sendEmbeds, adminWebhook } from "./discord/client";

const logger = getLogger("worker");

/**
 * Which pass a cron trigger runs.
 *
 * Cloudflare gives the trigger's cron string in `controller.cron`, so the two
 * schedules can be told apart without guessing.
 */
function isFetchTrigger(cron: string): boolean {
  // The fetch pass is the frequent one (every 5 min); dispatch runs on the
  // same tick but is derived from the schedule below.
  return cron === "*/5 * * * *";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const cron = controller.cron ?? "";
    logger.info("scheduled tick", { cron });

    // Dispatch-only tick: run dispatch pass when cron is */10.
    if (cron === "*/10 * * * *") {
      ctx.waitUntil(
        (async () => {
          try {
            const dispatchStats = await runDispatchPass(env, false);
            if (dispatchStats.status === "error") {
              const hook = adminWebhook(env);
              if (hook) {
                await sendEmbeds(hook, [
                  {
                    title: "⚠️ Dispatch error",
                    color: 0xef4444,
                    description: `dispatch: \`${dispatchStats.status}\` (sent ${dispatchStats.sent})`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }
            }
          } catch (err) {
            logger.error("dispatch tick failed", { err: String(err).slice(0, 300) });
          }
        })(),
      );
      return;
    }

    // Fetch-only tick (*/5): scrape and persist.
    ctx.waitUntil(
      (async () => {
        try {
          const fetchStats = await runFetchPass(env, null);

          // Alert only on a hard failure — a healthy tick must stay silent so
          // the admin channel does not become noise.
          if (fetchStats.status === "error") {
            const hook = adminWebhook(env);
            if (hook) {
              await sendEmbeds(hook, [
                {
                  title: "⚠️ Pipeline error",
                  color: 0xef4444,
                  description: `fetch: \`${fetchStats.status}\` (${fetchStats.fetched} items)`,
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
          }
        } catch (err) {
          logger.error("scheduled run failed", { err: String(err).slice(0, 300) });
          const hook = adminWebhook(env);
          if (hook) {
            await sendEmbeds(hook, [
              {
                title: "⚠️ Scheduled run threw",
                color: 0xef4444,
                description: `\`\`\`${String(err).slice(0, 400)}\`\`\``,
                timestamp: new Date().toISOString(),
              },
            ]).catch(() => undefined);
          }
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;

export { isFetchTrigger };
