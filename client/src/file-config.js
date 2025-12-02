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
