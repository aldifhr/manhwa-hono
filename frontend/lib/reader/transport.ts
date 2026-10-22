// transport — low-level fetch seam (csrf + 401 + abort), testable via injection
import { withCsrf } from "@/lib/csrf";
import { parseErrorMessage } from "@/lib/fetchError";

let _handling401 = false;
let _refreshPromise: Promise<boolean> | null = null;
async function handle401() {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/login") return false;
  if (_handling401 && _refreshPromise) return _refreshPromise;
  _handling401 = true;
  _refreshPromise = (async () => {
    try {
      const { refreshSession } = await import("@/lib/server-api");
      const ok = await refreshSession();
      if (!ok) window.location.href = "/login";
      return ok;
    } catch {
      window.location.href = "/login";
      return false;
    } finally {
      _handling401 = false;
      // jangan langsung null — biarkan pending caller lain await promise yang sama; reset 1s setelah selesai
      setTimeout(() => { _refreshPromise = null; }, 1000);
    }
  })();
  return _refreshPromise;
}

export type FetchImpl = typeof fetch;

// Klasifikasi endpoint: publik boleh HTTP cache (private SWR), privat jangan
// credentials: include + Cache-Control private → browser cache per-user (Vary: Cookie)
// Privat tanpa cache biar React Query yang jadi source of truth (stale/gc per P1)
// Publik: /rss (flat), /public/stats, /sources/health, /dashboard-snapshot (anon, aggregate)
// Privat: whitelist, dispatch-history, excluded, continue-reading, auth — must-revalidate no-store
const PUBLIC_RE = /\/rss(\?|$)|^\/api\/public\/stats|^\/api\/v1\/public\/stats|^\/api\/v1\/sources\/health|\/dashboard-snapshot/;
const PRIVATE_RE = /\/whitelist|\/dispatch-history|\/excluded-titles|\/continue-reading|auth|\/queue|\/failed-dispatches/;
function cacheForPath(path: string, init?: RequestInit): RequestCache | undefined {
  // Mutasi tidak pernah cache
  const m = (init?.method ?? "GET").toUpperCase();
  if (m !== "GET" && m !== "HEAD") return "no-store";
  // Fix nav-refresh bug: PUBLIC yang sebelumnya `undefined` (hormati HTTP cache)
  // bikin client navigation dapat stale 30s dari browser cache.
  // Sekarang semua GET pakai no-store, biar TanStack Query yang jadi source of truth.
  if (PUBLIC_RE.test(path)) return "no-store";
  if (PRIVATE_RE.test(path)) return "no-store";
  return "no-store";
}

export async function readerFetch<T>(
  path: string,
  init?: RequestInit,
  fetchImpl: FetchImpl = fetch
): Promise<T> {
  const cache = cacheForPath(path, init);
  const baseInit: RequestInit = cache ? { cache } : {};
  const hasSignal = !!(init?.signal || (baseInit as RequestInit).signal);
  const timeoutSignal = hasSignal ? undefined : AbortSignal.timeout(15_000);
  const baseWithTimeout: RequestInit = timeoutSignal ? { ...baseInit, signal: timeoutSignal } : baseInit;
  const mergedInit = init ? { ...baseWithTimeout, ...init, ...(cache && !init.cache ? { cache } : {}), ...(timeoutSignal && !init.signal ? { signal: timeoutSignal } : {}) } : (cache || timeoutSignal ? { ...baseWithTimeout } as RequestInit : undefined);
  const csrfInit = mergedInit
    ? (withCsrf(mergedInit as RequestInit) as RequestInit)
    : undefined;
  let res = await fetchImpl(path, { ...(csrfInit as RequestInit), credentials: "include" });
  if (res.status === 204) return { success: true, data: { results: [] } } as T;
  if (res.status === 401) {
    const m2 = (mergedInit?.method ?? "GET").toUpperCase();
    const isIdempotentRetry = m2 === "GET" || m2 === "HEAD";
    if (!isIdempotentRetry) {
      const text = await res.text().catch(() => res.statusText);
      const msg = parseErrorMessage(res.status, text);
      void handle401(); // tetap refresh session tapi jangan retry mutasi
      throw new Error(`401 Unauthorized: ${msg}`);
    }
    const refreshed = await handle401();
    if (refreshed) {
      // retry sekali dengan cookie baru — clone init, jangan reuse consumed stream
      const retryInit: RequestInit = { ...(mergedInit as RequestInit) };
      // body string aman di-retry, stream tidak — sudah guard di atas
      const retryCsrf = withCsrf(retryInit as RequestInit) as RequestInit;
      res = await fetchImpl(path, { ...(retryCsrf as RequestInit), credentials: "include" });
      if (res.status === 204) return { success: true, data: { results: [] } } as T;
      if (res.ok) return res.json() as Promise<T>;
    }
    const text = await res.text().catch(() => res.statusText);
    const msg = parseErrorMessage(res.status, text);
    throw new Error(`401 Unauthorized: ${msg}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const msg = parseErrorMessage(res.status, text);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// triggers N parallel fetches if N components mount before first resolves; inflight collapses to 1)
const _inflightPaginated = new Map<string, Promise<unknown[]>>();

export async function paginatedGet<T>(
  basePath: string,
  params: URLSearchParams,
  map: (r: unknown) => T,
  signal?: AbortSignal,
  fetchImpl: FetchImpl = fetch,
  hardCap = 100
): Promise<T[]> {
  const pageSize = Number(
    params.get("page_size") ?? params.get("limit") ?? 100
  );
  // Respect per-endpoint bulk limit: whitelist/dispatch support 1000, RSS capped 100
  const cap = hardCap;
  const inflightKey = `${basePath}?${params.toString()}|cap=${cap}`;
  if (_inflightPaginated.has(inflightKey) && !signal?.aborted) {
    return _inflightPaginated.get(inflightKey)! as Promise<T[]>;
  }
  const promise = (async (): Promise<T[]> => {
    const q = new URLSearchParams(params); // clone to avoid mutating caller
    if (pageSize > cap) {
      q.set(q.has("page_size") ? "page_size" : "limit", String(cap));
      const first = await readerFetch<{
        success: boolean;
        data: { results: unknown[]; totalPages?: number; total_pages?: number };
      }>(`${basePath}?${q}`, signal ? { signal } : undefined, fetchImpl);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const totalPages = (first.data?.totalPages ??
        (first.data as { total_pages?: number })?.total_pages ??
        1) as number;
      const firstRows = (first.data?.results ?? []).map(map);
      if (totalPages <= 1) return firstRows;
      const fetchers = Array.from({ length: totalPages - 1 }, (_, i) => () => {
        const p = new URLSearchParams(q);
        p.set("page", String(i + 2));
        p.set(q.has("page_size") ? "page_size" : "limit", String(cap));
        return readerFetch<{ success: boolean; data: { results: unknown[] } }>(
          `${basePath}?${p}`,
          signal ? { signal } : undefined,
          fetchImpl
        );
      });
      // tapi bulk whitelist/history butuh komplit. Sekarang bulk sudah single-shot hardCap 1000 (whitelist/dispatch),
      // jadi pagination >cap hanya untuk legacy RSS bulk (deprecated). Tetap strict untuk bulk: failedPages→throw.
      const batched: unknown[] = [];
      let failedPages = 0;
      const isBulkCompleteNeed = !basePath.includes("/rss"); // whitelist/dispatch butuh 100% komplit
      for (let i = 0; i < fetchers.length; i += 4) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const batch = await Promise.allSettled(
          fetchers.slice(i, i + 4).map((f) => f())
        );
        for (const r of batch) {
          if (r.status === "fulfilled")
            batched.push(...(r.value.data?.results ?? []));
          else if ((r.reason as Error)?.name === "AbortError") throw r.reason;
          else {
            failedPages++;
            const msg = `[paginatedGet] ${basePath} page failed (${failedPages})`;
            console.warn(msg, r.reason);
            try { console.error(msg, { basePath, failedPages, reason: String(r.reason) }); } catch {}
          }
        }
      }
      if (failedPages > 0) {
        if (isBulkCompleteNeed) throw new Error(`paginatedGet ${basePath} partial failure: ${failedPages} pages failed — dataset incomplete`);
        if (batched.length === 0 && firstRows.length === 0) throw new Error(`paginatedGet all pages failed (${failedPages})`);
        console.warn(`[paginatedGet] partial success (infinite tolerant): ${failedPages} pages failed, returning ${firstRows.length + batched.length} rows`);
      }
      return [...firstRows, ...batched.map(map)];
    }
    const data = await readerFetch<{
      success: boolean;
      data: { results: unknown[] };
    }>(`${basePath}?${q}`, signal ? { signal } : undefined, fetchImpl);
    return (data.data?.results ?? []).map(map);
  })();
  _inflightPaginated.set(inflightKey, promise as Promise<unknown[]>);
  try {
    return await promise;
  } finally {
    _inflightPaginated.delete(inflightKey);
  }
}
