import { PDFDocument } from "pdf-lib";
import { createArchive } from "./archive";
import { convertPicture } from "./image-tools";
import { openRenderer } from "./pdf-compression";

export function pageIndices(range, count) {
	if (!range?.trim()) return Array.from({ length: count }, (_, i) => i);
	const pages = [];
	for (const part of range.split(",")) {
		const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
		if (!match) throw new Error("Use page numbers such as 1-3,5");
		const start = Number(match[1]),
			end = Number(match[2] || start);
		if (start < 1 || end < start || end > count)
			throw new Error(`Page range must be within 1-${count}`);
		for (let n = start; n <= end; n++) if (!pages.includes(n - 1)) pages.push(n - 1);
	}
	return pages;
}

export async function combinePdfs(buffers) {
	const output = await PDFDocument.create();
	for (const buffer of buffers) {
		const source = await PDFDocument.load(buffer);
		const pages = await output.copyPages(source, source.getPageIndices());
		for (const page of pages) output.addPage(page);
	}
	return (await output.save()).buffer;
}

export async function picturesToPdf(files, options = {}, perFileOptions = []) {
	const output = await PDFDocument.create();
	for (const [index, file] of files.entries()) {
		const ext = file.name.split(".").pop().toLowerCase();
		let input = await file.arrayBuffer();
		if (ext === "svg") {
			const { rasterizeSvg } = await import("./svg-tools");
			input = await rasterizeSvg(input);
		}
		const buffer = await convertPicture(input, ext === "svg" ? "png" : ext, "png", 0.92, {
			...options,
			...perFileOptions[index],
		});
		const image = await output.embedPng(buffer);
		const scale = Math.min(1, 14400 / Math.max(image.width, image.height));
		const width = image.width * scale,
			height = image.height * scale;
		output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
	}
	return (await output.save()).buffer;
}

export async function processPdf(buffer, target, options = {}, onProgress = () => {}) {
	if (["pdf-pages", "pdf-split"].includes(target)) {
		const source = await PDFDocument.load(buffer);
		const indices = pageIndices(options.pages, source.getPageCount());
		const results = [];
		if (target === "pdf-pages") {
			const output = await PDFDocument.create();
			for (const page of await output.copyPages(source, indices)) output.addPage(page);
			return {
				outBuffer: (await output.save()).buffer,
				mime: "application/pdf",
				suffix: "pages.pdf",
				warnings: [],
			};
		}
		for (const index of indices) {
			const output = await PDFDocument.create();
			output.addPage((await output.copyPages(source, [index]))[0]);
			results.push({ name: `page-${index + 1}.pdf`, blob: await output.save() });
			onProgress(results.length / indices.length);
		}
		return {
			outBuffer: await createArchive(results).generateAsync({ type: "arraybuffer" }),
			mime: "application/zip",
			suffix: "pages.zip",
			warnings: [],
		};
	}
	const { pdf, close } = await openRenderer(buffer);
	try {
		const indices = pageIndices(options.pages, pdf.numPages);
		const results = [];
		const dpi = Number(options.dpi || 144);
		if (!Number.isFinite(dpi) || dpi < 36 || dpi > 300)
			throw new Error("PDF image resolution must be between 36 and 300 DPI");
		for (const index of indices) {
			const page = await pdf.getPage(index + 1);
			const size = page.getViewport({ scale: 1 });
			const scale = Math.min(
				dpi / 72,
				4096 / Math.max(size.width, size.height),
				Math.sqrt(12_000_000 / (size.width * size.height)),
			);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement("canvas");
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			try {
				await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "white" })
					.promise;
				const mime = target === "png" ? "image/png" : "image/jpeg";
				const blob = await new Promise((resolve) =>
					canvas.toBlob(resolve, mime, Number(options.quality ?? 0.9)),
				);
				if (!blob) throw new Error("Could not encode PDF page");
				results.push({
					name: `page-${index + 1}.${target}`,
					blob: new Uint8Array(await blob.arrayBuffer()),
				});
			} finally {
				canvas.width = canvas.height = 1;
				page.cleanup();
			}
			onProgress(results.length / indices.length);
		}
		return {
			outBuffer: await createArchive(results).generateAsync({ type: "arraybuffer" }),
			mime: "application/zip",
			suffix: `${target}-pages.zip`,
			warnings: ["Pages exported as images inside a ZIP."],
		};
	} finally {
		await close();
	}
}
