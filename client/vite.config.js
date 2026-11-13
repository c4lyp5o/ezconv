import { readdirSync, readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/

// Footer: the running version and the source link, baked in at build time.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const APP_DEFINE = {
	__APP_VERSION__: JSON.stringify(pkg.version),
	__APP_REPO__: JSON.stringify("https://github.com/c4lyp5o/ezconv"),
};

export default defineConfig({
	define: APP_DEFINE,
	server: {
		port: 3000,
	},
	optimizeDeps: {
		exclude: ["@ffmpeg/ffmpeg"],
	},
	plugins: [
		{
			name: "local-pdf-assets",
			generateBundle() {
				for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
					const root = new URL(`./node_modules/pdfjs-dist/${dir}/`, import.meta.url);
					for (const file of readdirSync(root)) {
						this.emitFile({
							type: "asset",
							fileName: `pdf/${dir}/${file}`,
							source: readFileSync(new URL(file, root)),
						});
					}
				}
			},
		},
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
		tailwindcss(),
	],
	build: {
		outDir: "../dist",
		emptyOutDir: true,
	},
});
