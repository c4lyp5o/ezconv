import DOMPurify from "dompurify";

export async function rasterizeSvg(buffer) {
	const source = new TextDecoder().decode(buffer);
	const clean = DOMPurify.sanitize(source, {
		USE_PROFILES: { svg: true, svgFilters: true },
		FORBID_TAGS: ["script", "foreignObject", "image", "feImage"],
	});
	const url = URL.createObjectURL(new Blob([clean], { type: "image/svg+xml" }));
	const image = new Image();
	try {
		image.src = url;
		await image.decode();
		const width = image.naturalWidth,
			height = image.naturalHeight;
		if (!width || !height || width > 12000 || height > 12000 || width * height > 40_000_000)
			throw new Error("SVG dimensions exceed the image processing limits");
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		try {
			canvas.getContext("2d").drawImage(image, 0, 0);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
			if (!blob) throw new Error("Could not render SVG");
			return blob.arrayBuffer();
		} finally {
			canvas.width = canvas.height = 1;
		}
	} finally {
		URL.revokeObjectURL(url);
	}
}
