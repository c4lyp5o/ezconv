// Same-origin static assets only. Cache writes must never block conversion or
// persist a temporary server error as an immutable asset.
const CACHE = "ezconv-v2.0.0";

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== location.origin) return;

	let cacheWrite = Promise.resolve();
	const fromNetwork = async () => {
		const response = await fetch(request);
		// Partial/range responses cannot be stored by Cache.put either.
		if (response.ok && response.status === 200) {
			const copy = response.clone();
			cacheWrite = caches
				.open(CACHE)
				.then((cache) => cache.put(request, copy))
				.catch(() => {});
		}
		return response;
	};
	const fromCache = async () => {
		try {
			const current = await (await caches.open(CACHE)).match(request);
			if (current?.ok) return current;
			// Older caches support still-open tabs, but never reuse cached errors.
			const previous = await caches.match(request);
			return previous?.ok ? previous : null;
		} catch {
			return null;
		}
	};
	const response = url.pathname.startsWith("/assets/")
		? fromCache().then((hit) => hit || fromNetwork())
		: fromNetwork().catch(async () => (await fromCache()) || Response.error());

	event.respondWith(response);
	// Register synchronously, and keep any background cache write alive.
	event.waitUntil(response.then(() => cacheWrite).catch(() => {}));
});
