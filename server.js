import { serve } from "bun";

serve({
	port: 5000,
	async fetch(req) {
		const url = new URL(req.url);
		let path = url.pathname;

		if (path === "/") path = "/index.html";

		try {
			const file = Bun.file(`./dist${path}`);
			return new Response(await file.arrayBuffer(), {
				headers: { "Content-Type": file.type },
			});
		} catch {
			return new Response("Not found", { status: 404 });
		}
	},
});

console.log("Server running: http://localhost:5000");
