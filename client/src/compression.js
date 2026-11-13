import { imageMimeFor } from "./file-config";

export const COMPRESSION_PRESETS = [
	{ value: "best-effort", label: "Best effort — preserve detail" },
	{ value: "balanced", label: "Balanced" },
	{ value: "best-compression", label: "Best compression — smaller, lower quality" },
	{ value: "percentage", label: "Target percentage reduction" },
];

export function compressionPlan(options = {}) {
	const mode = options.mode || "best-effort";
	if (!COMPRESSION_PRESETS.some((p) => p.value === mode)) {
		throw new Error("Unknown compression preset");
	}
	const reduction = Number(options.reduction ?? 50);
	if (mode === "percentage" && (!Number.isFinite(reduction) || reduction < 1 || reduction > 90)) {
		throw new Error("Choose a reduction between 1% and 90%");
	}
	const steps = {
		"best-effort": [{ quality: 0.85, scale: 1, dpi: 150 }],
		balanced: [{ quality: 0.72, scale: 0.85, dpi: 120 }],
		"best-compression": [{ quality: 0.42, scale: 0.6, dpi: 72 }],
		percentage: [
			{ quality: 0.9, scale: 1, dpi: 150 },
			{ quality: 0.75, scale: 1, dpi: 120 },
			{ quality: 0.6, scale: 0.85, dpi: 96 },
			{ quality: 0.45, scale: 0.65, dpi: 72 },
			{ quality: 0.3, scale: 0.45, dpi: 54 },
		],
	};
	return { mode, reduction, steps: steps[mode] };
}

export function compressionWarnings(before, after, plan) {
	const warnings = [];
	if (after >= before)
		warnings.push("Already compact: original returned because compression did not reduce size.");
	if (plan.mode === "percentage" && after > before * (1 - plan.reduction / 100)) {
		warnings.push(
			`Could not reach ${plan.reduction}% reduction; returned the smallest result found.`,
		);
	}
	return warnings;
}

export async function compressImage(arrayBuffer, ext, options) {
	const plan = compressionPlan(options);
	const outputExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "png";
	const mime = imageMimeFor(outputExt);
	const image = await createImageBitmap(new Blob([arrayBuffer], { type: imageMimeFor(ext) }));
	let best = outputExt === ext ? arrayBuffer : null;
	let usedScale = 1;
	try {
		for (const step of plan.steps) {
			const canvas = new OffscreenCanvas(
				Math.max(1, Math.round(image.width * step.scale)),
				Math.max(1, Math.round(image.height * step.scale)),
			);
			const ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			const blob = await canvas.convertToBlob({ type: mime, quality: step.quality });
			if (blob.type !== mime)
				throw new Error(`This browser cannot encode ${outputExt.toUpperCase()}`);
			if (!best || blob.size < best.byteLength) {
				best = await blob.arrayBuffer();
				usedScale = step.scale;
			}
			canvas.width = canvas.height = 1;
			if (
				plan.mode === "percentage" &&
				best.byteLength <= arrayBuffer.byteLength * (1 - plan.reduction / 100)
			)
				break;
		}
	} finally {
		image.close();
	}
	const warnings = compressionWarnings(arrayBuffer.byteLength, best.byteLength, plan);
	if (outputExt !== ext && best.byteLength >= arrayBuffer.byteLength) {
		warnings[0] = "Compression did not reduce size; the output format differs from the original.";
	}
	if (usedScale < 1) warnings.push(`Image dimensions reduced to ${Math.round(usedScale * 100)}%.`);
	if (ext === "gif") warnings.push("GIF animation flattened to a single frame.");
	if (outputExt !== ext)
		warnings.push(`Saved as ${outputExt.toUpperCase()} for browser encoding support.`);
	return { outBuffer: best, ext: outputExt, mime, warnings };
}
