export const IMAGE_EXTENSIONS = [
	"jpg",
	"jpeg",
	"png",
	"gif",
	"webp",
	"bmp",
	"svg",
];
export const AUDIO_EXTENSIONS = ["mp3", "wav", "aac", "flac", "ogg", "m4a"];
export const VIDEO_EXTENSIONS = ["mp4", "avi", "mkv", "mov", "webm", "flv"];
export const DATA_EXTENSIONS = ["json", "csv", "xlsx", "xls"];

// Canvas can only ENCODE these — gif/bmp/svg targets would silently download
// PNG bytes with the wrong extension, so they are inputs-only
export const CANVAS_OUTPUT_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

// Real MIME types per extension (canvas rejects shorthand like "image/jpg"
// and falls back to PNG, which is exactly the corruption this map prevents)
export const IMAGE_MIME = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	svg: "image/svg+xml",
};

export function imageMimeFor(ext) {
	return IMAGE_MIME[ext] || "application/octet-stream";
}

export const ALL_EXTENSIONS = [
	...IMAGE_EXTENSIONS,
	...AUDIO_EXTENSIONS,
	...VIDEO_EXTENSIONS,
	...DATA_EXTENSIONS,
];

export function getFileCategory(ext) {
	if (IMAGE_EXTENSIONS.includes(ext)) return "image";
	if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
	if (VIDEO_EXTENSIONS.includes(ext)) return "video";
	if (DATA_EXTENSIONS.includes(ext)) return "data";
	return null;
}
