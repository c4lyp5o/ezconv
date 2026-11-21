import { imageMimeFor } from "./file-config";
import { humanBytes } from "./format";
import { hasImageEdits, imageCanvas } from "./image-tools";

export const COMPRESSION_PRESETS = [
	{ value: "best-effort", label: "Best effort — preserve detail" },
	{ value: "balanced", label: "Balanced" },
	{ value: "best-compression", label: "Best compression — smaller, lower quality" },
	{ value: "percentage", label: "Target percentage reduction" },
	{ value: "size", label: "Target file size" },
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
	const minQuality = Number(options.minQuality ?? 0.3);
	const targetBytes = Number(options.targetMB ?? 2) * 1024 * 1024;
	if (!Number.isFinite(minQuality) || minQuality < 0.2 || minQuality > 0.95)
		throw new Error("Minimum quality must be between 20% and 95%");
	if (
		mode === "size" &&
		(!Number.isFinite(targetBytes) || targetBytes <= 0 || targetBytes > 1024 * 1024 * 1024)
	)
		throw new Error("Choose a target size greater than 0 and at most 1024 MB");
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
	return {
		mode,
		reduction,
		targetBytes,
		minQuality,
		steps: steps[mode === "size" ? "percentage" : mode].map((s) => ({
			...s,
			quality: Math.max(minQuality, s.quality),
		})),
	};
}

export function compressionTarget(before, plan) {
	return plan.mode === "size"
		? plan.targetBytes
		: plan.mode === "percentage"
			? before * (1 - plan.reduction / 100)
			: null;
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
	if (plan.mode === "size" && after > plan.targetBytes)
		warnings.push(
			`Could not fit under ${humanBytes(plan.targetBytes)} at the selected quality floor; returned the smallest result found.`,
		);
	return warnings;
}

export async function compressImage(arrayBuffer, ext, options, imageOptions = {}) {
	const plan = compressionPlan(options);
	const outputExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "png";
	const mime = imageMimeFor(outputExt);
	const image = await imageCanvas(arrayBuffer, ext, imageOptions);
	const edited = hasImageEdits(imageOptions);
	let best = outputExt === ext && !edited ? arrayBuffer : null;
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
				compressionTarget(arrayBuffer.byteLength, plan) !== null &&
				best.byteLength <= compressionTarget(arrayBuffer.byteLength, plan)
			)
				break;
		}
	} finally {
		image.width = image.height = 1;
	}
	const warnings = compressionWarnings(arrayBuffer.byteLength, best.byteLength, plan);
	if ((outputExt !== ext || edited) && best.byteLength >= arrayBuffer.byteLength) {
		warnings[0] = "The edited or converted output is larger than the original.";
	}
	if (usedScale < 1) warnings.push(`Image dimensions reduced to ${Math.round(usedScale * 100)}%.`);
	if (ext === "gif") warnings.push("GIF animation flattened to a single frame.");
	if (outputExt !== ext)
		warnings.push(`Saved as ${outputExt.toUpperCase()} for browser encoding support.`);
	return { outBuffer: best, ext: outputExt, mime, warnings };
}
