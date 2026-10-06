/**
 * Discord delivery.
 *
 * Uses a webhook rather than a gateway bot: a Worker has no long-lived socket,
 * and a webhook is a single POST that either succeeds or does not. The Python
 * backend used a bot token + channel ids; a webhook removes the token from the
 * picture entirely.
 */
import type { Env } from "../config";
import { getLogger } from "../logger";

const logger = getLogger("discord");

export interface SendResult {
  ok: boolean;
  status: number;
  errorCode: string;
  errorMessage: string;
}

/**
 * POST embeds to a webhook.
 *
 * 429 is retried once honouring Retry-After; 5xx is retried once with a short
 * backoff. 4xx other than 429 is permanent — retrying a malformed payload just
 * burns quota, so it is reported as a failure for the caller to park.
 */
export async function sendEmbeds(
  webhookUrl: string,
  embeds: Array<Record<string, unknown>>,
  opts: { retries?: number } = {},
): Promise<SendResult> {
  const retries = opts.retries ?? 1;
  const body = JSON.stringify({ embeds: embeds.slice(0, 10) });

  let last: SendResult = { ok: false, status: 0, errorCode: "NETWORK", errorMessage: "no attempt" };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok || res.status === 204) {
        return { ok: true, status: res.status, errorCode: "", errorMessage: "" };
      }

      const text = await res.text().catch(() => "");

      if (res.status === 429 && attempt < retries) {
        const retryAfter = Number.parseFloat(res.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000;
        logger.warn("discord rate limited", { waitMs });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        last = {
          ok: false,
          status: res.status,
          errorCode: `HTTP_${res.status}`,
          errorMessage: text.slice(0, 300),
        };
        continue;
      }

      return {
        ok: false,
        status: res.status,
        errorCode: `HTTP_${res.status}`,
        errorMessage: text.slice(0, 300),
      };
    } catch (err) {
      last = {
        ok: false,
        status: 0,
        errorCode: "NETWORK",
        errorMessage: String(err).slice(0, 300),
      };
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  return last;
}

/** The chapter feed webhook, or null when unconfigured. */
export function chapterWebhook(env: Env): string | null {
  return (env.DISCORD_WEBHOOK_URL ?? "").trim() || null;
}

/** The admin/report webhook — alerts go here, never to the chapter feed. */
export function adminWebhook(env: Env): string | null {
  return (env.ADMIN_REPORT_WEBHOOK_URL ?? "").trim() || null;
}
