const CACHE_NAME = "manhwa-images-v6"; // bumped — force invalidate stale v5 covers
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // SWR window: serve cache instantly while this fresh, else network-first
const MAX_ENTRIES = 800;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop old cache versions on activate
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ).then(() => clients.claim()),
  );
});

function isMangaImage(url) {
  if (!/^https?:$/.test(url.protocol)) return false;
  return (
    /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url.pathname) ||
    url.hostname.includes("shinigami") ||
    url.hostname.includes("shngm")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isImage =
    event.request.destination === "image" ||
    isMangaImage(url);

  if (!isImage) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const cachedDate = cached && cached.headers.get("sw-cached-at");
      const fresh =
        cachedDate && Date.now() - Number(cachedDate) < MAX_AGE_MS;

      // Stale-while-revalidate: while the cache entry is within MAX_AGE_MS,
      // serve it immediately and kick off a background refresh so the next
      // load is up to date. Once the entry is older than MAX_AGE_MS, go
      // network-first — the current request waits for the network and only
      // falls back to the cache if the fetch fails. This guarantees a cover
      // is never served older than ~6h even if background refreshes kept
      // failing while the tab was closed.
      const networkPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            // stamp cache time
            const headers = new Headers(cloned.headers);
            headers.set("sw-cached-at", String(Date.now()));
            const stamped = new Response(cloned.body, {
              status: cloned.status,
              statusText: cloned.statusText,
              headers,
            });
            cache.put(event.request, stamped);
            trimCache(cache);
          }
          return response;
        })
        .catch(() => {
          // network failed — fall through to cached or placeholder
          if (cached) return cached;
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect fill="#1a1a2e" width="200" height="280"/><text fill="#666" font-size="14" text-anchor="middle" x="100" y="140">No Image</text></svg>',
            { headers: { "Content-Type": "image/svg+xml" } },
          );
        });

      // Fresh cache entry → serve it now, refresh in the background.
      // Stale (or missing) entry → network-first (fetch() already falls back
      // to the cache / placeholder on failure).
      if (cached && fresh) {
        networkPromise.catch(() => {}); // fire-and-forget background refresh
        return cached;
      }
      return networkPromise;
    }),
  );
});

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    const toDelete = keys.slice(0, keys.length - MAX_ENTRIES);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

// Limit cache to MAX_ENTRIES
self.addEventListener("message", (event) => {
  if (event.data === "trim-cache") {
    caches.open(CACHE_NAME).then((cache) => trimCache(cache));
  }
});
