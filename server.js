import { serve } from "bun";

const PORT = Number(process.env.PORT) || 5000;
// loopback by default; set HOST=0.0.0.0 to serve the LAN (phone test-drives)
const HOST = process.env.HOST || "127.0.0.1";

serve({
	port: PORT,
	hostname: HOST,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		if (path === "/") path = "/index.html";

		try {
			const file = Bun.file(`./dist${path}`);
			if (!(await file.exists())) {
				return new Response("Not found", { status: 404 });
			}

			const headers = {
				"Content-Type": file.type,
				"X-Content-Type-Options": "nosniff",
				// hashed assets never change; everything else must revalidate
				"Cache-Control": path.startsWith("/assets/")
					? "public, max-age=31536000, immutable"
					: "no-cache",
			};
			// stream the file — no whole-file buffer for the 32 MB wasm
			return new Response(file, { headers });
		} catch {
			return new Response("Not found", { status: 404 });
		}
	},
});

console.log(`Server running: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
