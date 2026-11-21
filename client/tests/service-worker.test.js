// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/sw.js", "utf8");
function harness() {
	const handlers = {},
		saved = new Map(),
		legacy = new Map();
	const key = (request) => request.url;
	const put = vi.fn(async (request, response) => {
		saved.set(key(request), response);
	});
	const caches = {
		open: async () => ({ match: async (request) => saved.get(key(request)), put }),
		match: async (request) => legacy.get(key(request)) || saved.get(key(request)),
	};
	const fetch = vi.fn();
	runInNewContext(source, {
		self: {
			addEventListener: (name, handler) => {
				handlers[name] = handler;
			},
		},
		location: { origin: "https://app.test" },
		URL,
		Response,
		caches,
		fetch,
	});
	async function request(path) {
		let response;
		const writes = [];
		handlers.fetch({
			request: { url: `https://app.test${path}`, method: "GET" },
			respondWith: (promise) => {
				response = promise;
			},
			waitUntil: (promise) => writes.push(promise),
		});
		const result = await response;
		await Promise.all(writes);
		return result;
	}
	return { request, fetch, put, saved, legacy };
}

describe("service worker cache resilience", () => {
	it("does not cache an asset 404 and retries after recovery", async () => {
		const h = harness();
		h.fetch
			.mockResolvedValueOnce(new Response("missing", { status: 404 }))
			.mockResolvedValueOnce(new Response("fixed"));
		expect((await h.request("/assets/core.js")).status).toBe(404);
		expect(h.put).not.toHaveBeenCalled();
		expect(await (await h.request("/assets/core.js")).text()).toBe("fixed");
		expect(h.put).toHaveBeenCalledOnce();
		await h.request("/assets/core.js");
		expect(h.fetch).toHaveBeenCalledTimes(2);
	});
	it("ignores previously cached errors, including old cache generations", async () => {
		const h = harness();
		h.legacy.set("https://app.test/assets/core.js", new Response("bad", { status: 500 }));
		h.fetch.mockResolvedValue(new Response("good"));
		expect(await (await h.request("/assets/core.js")).text()).toBe("good");
		await h.request("/assets/core.js");
		expect(h.fetch).toHaveBeenCalledOnce();
	});
	it("keeps a successful shell when the server later fails", async () => {
		const h = harness();
		h.fetch
			.mockResolvedValueOnce(new Response("app"))
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockRejectedValueOnce(new Error("offline"));
		await h.request("/");
		expect((await h.request("/")).status).toBe(503);
		expect(await (await h.request("/")).text()).toBe("app");
		expect(h.put).toHaveBeenCalledOnce();
	});
	it("returns fetched assets even when cache storage fails", async () => {
		const h = harness();
		h.put.mockRejectedValue(new Error("quota"));
		h.fetch.mockResolvedValue(new Response("asset"));
		expect(await (await h.request("/assets/core.js")).text()).toBe("asset");
	});
	it("does not cache partial responses", async () => {
		const h = harness();
		h.fetch.mockResolvedValue(new Response("part", { status: 206 }));
		await h.request("/assets/core.wasm");
		expect(h.put).not.toHaveBeenCalled();
	});
});
