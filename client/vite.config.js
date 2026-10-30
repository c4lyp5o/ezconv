import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	server: {
		port: 3000,
	},
	optimizeDeps: {
		exclude: ["@ffmpeg/ffmpeg"],
	},
	plugins: [
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
