import { PDFDocument } from "pdf-lib";
import { compressionPlan, compressionWarnings } from "./compression";

// PDF rendering uses DOM canvas/font APIs. Load it only for lossy PDF presets.
async function openRenderer(buffer) {
	const pdfjs = await import("pdfjs-dist");
	const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
	pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
	const assetBase = import.meta.env.DEV ? "/node_modules/pdfjs-dist/" : "/pdf/";
	const task = pdfjs.getDocument({
		data: new Uint8Array(buffer.slice(0)),
		isEvalSupported: false,
		useSystemFonts: true,
		cMapUrl: `${assetBase}cmaps/`,
		cMapPacked: true,
		standardFontDataUrl: `${assetBase}standard_fonts/`,
		wasmUrl: `${assetBase}wasm/`,
	});
	try {
		return { pdf: await task.promise, close: () => task.destroy() };
	} catch (err) {
		await task.destroy();
		throw err;
	}
}

async function rasterize(pdf, step, onProgress) {
	const output = await PDFDocument.create();
	for (let n = 1; n <= pdf.numPages; n++) {
		const page = await pdf.getPage(n);
		const size = page.getViewport({ scale: 1 });
		// Bound per-page allocation even for posters and malicious page dimensions.
		const scale = Math.min(
			step.dpi / 72,
			4096 / Math.max(size.width, size.height),
			Math.sqrt(12_000_000 / (size.width * size.height)),
		);
		const viewport = page.getViewport({ scale });
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.ceil(viewport.width));
		canvas.height = Math.max(1, Math.ceil(viewport.height));
		try {
			await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "white" })
				.promise;
			const blob = await new Promise((resolve) =>
				canvas.toBlob(resolve, "image/jpeg", step.quality),
			);
			if (!blob) throw new Error("Could not encode PDF page");
			const image = await output.embedJpg(await blob.arrayBuffer());
			output.addPage([size.width, size.height]).drawImage(image, {
				x: 0,
				y: 0,
				width: size.width,
				height: size.height,
			});
		} finally {
			canvas.width = canvas.height = 1;
			page.cleanup();
		}
		onProgress(n / pdf.numPages);
		// Yield between pages so controls/status can paint.
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	return output.save({ useObjectStreams: true });
}

export async function compressPdf(buffer, options, onProgress = () => {}) {
	const plan = compressionPlan(options);
	const source = await PDFDocument.load(buffer, { updateMetadata: false });
	let best = new Uint8Array(buffer);
	let flattened = false;
	const optimized = await source.save({ useObjectStreams: true });
	if (optimized.byteLength < best.byteLength) best = optimized;
	const targetMet = () => best.byteLength <= buffer.byteLength * (1 - plan.reduction / 100);
	if (plan.mode !== "best-effort" && !(plan.mode === "percentage" && targetMet())) {
		const { pdf, close } = await openRenderer(buffer);
		try {
			for (const [index, step] of plan.steps.entries()) {
				const bytes = await rasterize(pdf, step, (ratio) =>
					onProgress((index + ratio) / plan.steps.length),
				);
				if (bytes.byteLength < best.byteLength) {
					best = bytes;
					flattened = true;
				}
				if (plan.mode === "percentage" && targetMet()) break;
			}
		} finally {
			await close();
		}
	}
	const warnings = compressionWarnings(buffer.byteLength, best.byteLength, plan);
	if (flattened)
		warnings.push(
			"PDF pages rebuilt as images: text, links, forms and accessibility tags are not preserved.",
		);
	return {
		outBuffer: best.buffer.slice(best.byteOffset, best.byteOffset + best.byteLength),
		mime: "application/pdf",
		warnings,
	};
}
