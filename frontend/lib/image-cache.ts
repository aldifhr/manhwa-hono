// Global image pool — persists via globalThis (HMR/serverless reuse)
// Fresh 1h, stale 24h, coalesced fetch. Evicts oldest-first, no byte counter/sweeper.

import { NextResponse } from "next/server";

export interface CacheEntry {
  data: ArrayBuffer;
  contentType: string;
  timestamp: number;
}
export interface ResolvedResult {
  ok: boolean;
  status?: number;
  data?: ArrayBuffer;
  contentType?: string;
}

const FRESH_TTL = 60 * 60 * 1000;
const STALE_TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

type CacheStore = Map<string, CacheEntry>;
type PendingStore = Map<string, Promise<ResolvedResult>>;

declare global {
  var __imgCache: CacheStore | undefined;
  var __imgPending: PendingStore | undefined;
}

const cache: CacheStore = (globalThis.__imgCache ??= new Map());
const pending: PendingStore = (globalThis.__imgPending ??= new Map());

export function getFresh(key: string): CacheEntry | undefined {
  const e = cache.get(key);
  if (e && Date.now() - e.timestamp < FRESH_TTL) return e;
  if (e && Date.now() - e.timestamp >= STALE_TTL) cache.delete(key);
  return undefined;
}
export function getStale(key: string): CacheEntry | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.timestamp < STALE_TTL) return e;
  cache.delete(key);
  return undefined;
}
export function setCache(
  key: string,
  data: ArrayBuffer,
  contentType: string
): void {
  cache.set(key, { data, contentType, timestamp: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
}

export function coalesceFetch(
  key: string,
  fetcher: () => Promise<ResolvedResult>
): Promise<ResolvedResult> {
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const p = fetcher().finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

const IMAGE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400";
export function cacheHitResponse(
  entry: CacheEntry,
  extraHeaders?: Record<string, string>
) {
  return new NextResponse(entry.data, {
    headers: {
      "Content-Type": entry.contentType,
      "Cache-Control": IMAGE_CACHE_CONTROL,
      ...extraHeaders,
    },
  });
}
export function imageResponse(
  data: ArrayBuffer,
  contentType: string,
  extraHeaders?: Record<string, string>
) {
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": IMAGE_CACHE_CONTROL,
      ...extraHeaders,
    },
  });
}
