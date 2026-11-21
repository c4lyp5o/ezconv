import { imageMimeFor } from "./file-config";

export function hasImageEdits(options = {}) {
	return !!(
		options.width ||
		options.height ||
		options.rotate ||
		options.cropWidth ||
		options.cropHeight ||
		options.flatten ||
		options.stripMetadata
	);
}

export async function imageCanvas(buffer, ext, options = {}) {
	const image = await createImageBitmap(new Blob([buffer], { type: imageMimeFor(ext) }));
	try {
		const x = Number(options.cropX || 0),
			y = Number(options.cropY || 0);
		const width = Number(options.cropWidth || image.width - x),
			height = Number(options.cropHeight || image.height - y);
		if (
			![x, y, width, height].every(Number.isFinite) ||
			x < 0 ||
			y < 0 ||
			width <= 0 ||
			height <= 0 ||
			x + width > image.width ||
			y + height > image.height
		)
			throw new Error("Crop must fit inside the image (values are pixels)");
		const maxWidth = Number(options.width || width),
			maxHeight = Number(options.height || height);
		if (![maxWidth, maxHeight].every((n) => Number.isFinite(n) && n > 0 && n <= 12000))
			throw new Error("Image dimensions must be between 1 and 12000 pixels");
		const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
		const w = Math.max(1, Math.round(width * ratio)),
			h = Math.max(1, Math.round(height * ratio));
		const angle = Number(options.rotate || 0);
		if (![0, 90, 180, 270].includes(angle))
			throw new Error("Choose a rotation of 0, 90, 180 or 270 degrees");
		if (w * h > 40_000_000) throw new Error("Image exceeds the 40 megapixel processing limit");
		const swapped = angle === 90 || angle === 270;
		const canvas = new OffscreenCanvas(swapped ? h : w, swapped ? w : h);
		const ctx = canvas.getContext("2d");
		if (options.flatten) {
			ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(options.background || "")
				? options.background
				: "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate((angle * Math.PI) / 180);
		ctx.drawImage(image, x, y, width, height, -w / 2, -h / 2, w, h);
		return canvas;
	} finally {
		image.close();
	}
}

export async function convertPicture(buffer, ext, target, quality = 0.92, options = {}) {
	const canvas = await imageCanvas(buffer, ext, {
		...options,
		flatten: options.flatten || ["jpg", "jpeg"].includes(target),
	});
	try {
		const mime = imageMimeFor(target);
		const blob = await canvas.convertToBlob({ type: mime, quality });
		if (blob.type !== mime) throw new Error(`This browser cannot encode ${target}`);
		return blob.arrayBuffer();
	} finally {
		canvas.width = canvas.height = 1;
	}
}
