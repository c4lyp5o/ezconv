import {
	AUDIO_EXTENSIONS,
	CANVAS_OUTPUT_EXTENSIONS,
	DATA_EXTENSIONS,
	getFileCategory,
	VIDEO_EXTENSIONS,
} from "./file-config";

export function getFileExtension(filename) {
	return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2).toLowerCase();
}

export function humanBytes(n) {
	if (!Number.isFinite(n) || n < 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let v = n;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i += 1;
	}
	return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// signed percentage change from -> to, e.g. "-34%" or "+12%"
export function sizeNote(from, to) {
	if (!from || !to) return "";
	const pct = Math.round((1 - to / from) * 100);
	return pct >= 0 ? `-${pct}%` : `+${-pct}%`;
}

export function targetOptionsFor(ext) {
	if (!ext) return [];
	const category = getFileCategory(ext);
	if (category === "data") {
		// For data, it never makes sense to convert to the same type
		return DATA_EXTENSIONS.filter((e) => e !== ext && e !== "xls"); // xls is not produced
	}
	if (category === "image") {
		// Canvas can only ENCODE png/jpeg/webp — gif/bmp/svg targets would
		// silently download PNG bytes with the wrong name, so not offered.
		// jpg and jpeg are one format: converting between them is just a rename.
		const sameFormat = ext === "jpg" || ext === "jpeg" ? ["jpg", "jpeg"] : [ext];
		return CANVAS_OUTPUT_EXTENSIONS.filter((e) => !sameFormat.includes(e));
	}
	if (category === "audio") {
		// For audio/video, allow same-extension to allow for remuxing/repair
		return AUDIO_EXTENSIONS;
	}
	if (category === "video") {
		return VIDEO_EXTENSIONS;
	}
	return [];
}

export function defaultTargetFor(ext, category) {
	if (category === "data") {
		if (ext === "json") return "csv";
		if (ext === "csv") return "json";
		return "csv";
	}
	// never default to the input's own format
	if (category === "image") return ext === "png" ? "jpg" : "png";
	if (category === "audio") return "mp3";
	if (category === "video") return "mp4";
	return "";
}
