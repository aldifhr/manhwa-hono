# manhwa-hono

A Hono / Cloudflare Workers port of the `manhwa-scanner` Python backend.

Tracks manhwa chapters across three sources (shinigami, voratoon, ikiru),
keeps a per-source whitelist, and posts new chapters to Discord.

The Python backend in `manhwa-scanner` is unchanged and still runs the live
service. This repo is the port, built alongside it.

## Why

The Python backend runs on a VPS with Postgres, Redis and a systemd scheduler.
This version runs the same pipeline on Workers + D1, so the tracker survives
without a machine to babysit.

## Sources

| source | access | notes |
|---|---|---|
| shinigami | `api.shngm.io/v1` | not behind Cloudflare, plain fetch works |
| ikiru | `09.ikiru.wtf` | Cloudflare-fronted, but a Worker's own egress reaches it |
| voratoon | `api.voratoon.com` | **blocked per-IP at Cloudflare's edge** — needs the proxy below |

### The voratoon egress problem

`api.voratoon.com` returns 403 with no `cf-ray` header for the VPS's IP. That is
a per-IP block, not TLS fingerprinting: curl, curl_cffi (chrome/124/131) and
tls-client (chrome_120/124/131, safari_16_0, firefox_120, chrome_133) all fail
identically. A Worker on Cloudflare's own network reaches it fine, so set
`VORATOON_PROXY_URL` to a Worker that forwards the request (see
`manhwa-scanner/relay/voratoon/worker.js`).

## Setup

```bash
npm install
wrangler d1 create manhwa          # paste the id into wrangler.toml
wrangler d1 execute manhwa --remote --file=./schema.sql
wrangler secret put DISCORD_WEBHOOK_URL
wrangler secret put MONITOR_AUTH_TOKEN
npm run deploy
```

## Commands

```bash
npm run dev            # local worker + local D1
npm test               # vitest
npm run typecheck      # tsc --noEmit
npm run db:local       # apply schema to the local D1
```

## API

| method | path | auth | purpose |
|---|---|---|---|
| GET | `/health` | no | DB connectivity |
| GET | `/api/v1/whitelist` | no | list subscriptions |
| POST | `/api/v1/whitelist` | bearer | subscribe a (title, source) |
| DELETE | `/api/v1/whitelist/:titleKey/:source` | bearer | unsubscribe |
| GET | `/api/v1/chapters` | no | recent chapters |
| POST | `/api/v1/cron/fetch` | bearer | scrape + persist |
| POST | `/api/v1/cron/dispatch` | bearer | send new chapters (`?dry_run=true` to preview) |
| POST | `/api/v1/cron/run` | bearer | fetch then dispatch |

## Design notes worth knowing before changing anything

**Whitelist matching is cross-source; the badge is per source.** A series is one
series whichever site carries it, so `filterWhitelisted()` keys on the title
alone and FCFS (`title|chapter`, source-agnostic) decides which source wins the
race. The badge answers a different question — "is this (title, source)
subscribed" — and is deliberately stricter.

**Every send path must be whitelist-gated.** There are two: `dispatch()` (the
caller filters) and `retryFailedDispatches()` (checks itself, and fails CLOSED if
the whitelist cannot be loaded). A `failed_dispatches` row outlives the whitelist
entry that produced it, so without that check a cancelled series keeps notifying
forever. `test/whitelist-paths.test.ts` pins both.

**Claim expiry is load-bearing.** The claim read filters on `expires_at`, so the
`ON CONFLICT` write must too — `DO NOTHING` lets an expired claim block
re-claiming permanently, and the chapter is never sent.

**ikiru timestamps are mislabelled.** The API emits WIB wall-clock (UTC+7) with a
`Z` suffix. Parsing naively puts every chapter 7 hours in the future and the
freshness window then drops the entire feed. `parseIkiruTs()` shifts it back.

**ikiru chapter URLs use a hyphen**: `/manga/{slug}/chapter-{n}`. The slash form
404s, which makes every Discord link dead while the chapter still looks
collected.

**Voratoon's catalogue field is `chapter`** (a list of `{id, number, updatedAt}`),
not `latestChapter`, and series metadata lives under `metadata` with genres at
`metadata.genre`.
