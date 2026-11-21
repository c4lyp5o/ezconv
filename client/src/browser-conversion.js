import { compressImage } from "./compression";
import { convertPicture } from "./image-tools";
export function isBrowserJob(job) {
	return (
		job.ext === "svg" ||
		!!job.sourceFiles ||
		job.category === "document" ||
		job.category === "text" ||
		(job.category === "image" && job.target === "pdf")
	);
}

export async function runBrowserJob(job, compressionOptions, onProgress, quality = 0.92) {
	if (job.ext === "svg" && job.target !== "pdf") {
		const { rasterizeSvg } = await import("./svg-tools");
		const buffer = await rasterizeSvg(await job.file.arrayBuffer());
		if (job.target === "compress") {
			const options =
				compressionOptions.mode === "percentage"
					? {
							...compressionOptions,
							mode: "size",
							targetMB:
								(job.file.size * (1 - Number(compressionOptions.reduction) / 100)) / 1024 / 1024,
						}
					: compressionOptions;
			const result = await compressImage(buffer, "png", options, job.options);
			return {
				...result,
				suffix: "compressed.png",
				warnings: [...result.warnings, "SVG rasterized to PNG; external images are omitted."],
			};
		}
		return {
			outBuffer: await convertPicture(buffer, "png", job.target, quality, job.options),
			mime: job.target === "jpg" || job.target === "jpeg" ? "image/jpeg" : `image/${job.target}`,
			suffix: job.target,
			warnings: ["SVG rasterized; external images are omitted."],
		};
	}

	if (job.sourceFiles || (job.category === "image" && job.target === "pdf")) {
		const { combinePdfs, picturesToPdf } = await import("./pdf-tools");
		const files = job.sourceFiles || [job.file];
		const outBuffer =
			job.ext === "pdf-bundle"
				? await combinePdfs(await Promise.all(files.map((file) => file.arrayBuffer())))
				: await picturesToPdf(files, job.options, job.sourceOptions);
		return {
			outBuffer,
			mime: "application/pdf",
			suffix: "pdf",
			warnings:
				job.ext === "pdf-bundle"
					? [
							"Combined pages follow queue order. Document-level bookmarks/forms are not retained when merging PDFs.",
						]
					: [],
		};
	}
	if (job.category === "document") {
		const buffer = await job.file.arrayBuffer();
		if (job.target === "compress") {
			const { compressPdf } = await import("./pdf-compression");
			return {
				...(await compressPdf(buffer, compressionOptions, onProgress)),
				suffix: "compressed.pdf",
			};
		}
		const { processPdf } = await import("./pdf-tools");
		return processPdf(buffer, job.target, { ...job.options, quality }, onProgress);
	}
	const { markdownHtml, textPdf } = await import("./text-tools");
	const text = await job.file.text();
	if (job.target === "html")
		return {
			outBuffer: new TextEncoder().encode(markdownHtml(text)).buffer,
			mime: "text/html;charset=utf-8",
			suffix: "html",
			warnings: ["External images and active content are omitted."],
		};
	return { ...(await textPdf(text, job.ext !== "txt")), suffix: "pdf" };
}
