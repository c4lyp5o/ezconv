// ezconv service worker: the app is fully client-side, so once the shell and
// assets are cached it keeps converting offline (the ffmpeg core is local too)
const CACHE = "ezconv-v1";

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (e) => {
	e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== "GET" || url.origin !== location.origin) return;

	// hashed assets (including the 32 MB wasm core) are immutable: cache-first
	if (url.pathname.startsWith("/assets/")) {
		e.respondWith(
			caches.match(e.request).then(
				(hit) =>
					hit ||
					fetch(e.request).then((res) => {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(e.request, copy));
						return res;
					}),
			),
		);
		return;
	}

	// navigations and the manifest: network-first with offline fallback
	e.respondWith(
		fetch(e.request)
			.then((res) => {
				const copy = res.clone();
				caches.open(CACHE).then((c) => c.put(e.request, copy));
				return res;
			})
			.catch(() => caches.match(e.request)),
	);
});
