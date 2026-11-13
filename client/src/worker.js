import wasmURL from "@ffmpeg/core/wasm?url";
import coreURL from "@ffmpeg/core?url";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { compressImage } from "./compression";
import { convertData } from "./data-conversion";
import {
	AUDIO_EXTENSIONS,
	DATA_EXTENSIONS,
	IMAGE_EXTENSIONS,
	imageMimeFor,
	VIDEO_EXTENSIONS,
} from "./file-config";
import { convertPicture } from "./image-tools";
import { runMediaConversion } from "./media-files";

const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

// Singleton instance for FFmpeg
let ffmpegInstance = null;

// tag every worker message with the active job id — the queue runs one at a
// time, so the UI can attribute answers to the right file
let currentJobId = null;
const post = (msg, transfer) => {
	postMessage({ ...msg, jobId: currentJobId }, transfer || []);
};

// Initialize FFmpeg on first use — the core files are bundled assets served
// by our own server (no third-party CDN fetch, works offline)
const initFFmpeg = async () => {
	if (ffmpegInstance) return ffmpegInstance;

	try {
		post({ status: "ffmpeg-loading" });
		post({ status: "log", message: "Loading FFmpeg core..." });

		const ff = new FFmpeg();
		await ff.load({ coreURL, wasmURL });

		// real event API: setLogger/setProgress only exist on the inner ffmpeg,
		// the public class emits "log" and "progress" events
		ff.on("log", ({ type, message }) => {
			post({ status: "ffmpeg-log", message: `[${type}] ${message}` });
		});
		ff.on("progress", ({ progress }) => {
			post({ status: "ffmpeg-progress", ratio: progress });
		});

		post({ status: "ffmpeg-ready" });
		console.log("[worker] FFmpeg ready");
		ffmpegInstance = ff;
		return ffmpegInstance;
	} catch (err) {
		console.error("[worker] FFmpeg init failed", err);
		throw err;
	}
};

// Build ffmpeg args for a media conversion (pure, exported for tests)
const LOSSY_AUDIO = ["mp3", "aac", "ogg", "m4a"];
const SCALE_WIDTHS = { 1080: 1920, 720: 1280, 480: 854 };

export const buildMediaArgs = ({
	inputName,
	outputName,
	fromExt,
	toExt,
	resolution,
	bitrate,
	trimStart,
	trimEnd,
	animated,
}) => {
	const start = Number(trimStart || 0),
		end = trimEnd === "" || trimEnd == null ? null : Number(trimEnd);
	if (
		!Number.isFinite(start) ||
		start < 0 ||
		(end !== null && (!Number.isFinite(end) || end <= start))
	)
		throw new Error("Trim end must be greater than start (seconds)");
	const args = ["-y", "-threads", "1"];
	if (start) args.push("-ss", String(start));
	args.push("-i", inputName);
	if (end !== null) args.push("-t", String(end - start));
	if (
		fromExt === toExt &&
		MEDIA_EXTENSIONS.includes(fromExt) &&
		!start &&
		end === null &&
		!resolution &&
		!bitrate
	)
		return [...args, "-c", "copy", outputName];
	const width = SCALE_WIDTHS[resolution];
	const scaleFilter = width ? `scale='min(${width},iw)':'-2'` : null;
	const audioBitrate = bitrate ? ["-b:a", `${bitrate}k`] : [];
	if (AUDIO_EXTENSIONS.includes(toExt)) {
		const codecs = {
			mp3: "libmp3lame",
			wav: "pcm_s16le",
			aac: "aac",
			flac: "flac",
			ogg: "libvorbis",
			m4a: "aac",
		};
		args.push("-vn", "-map", "0:a:0", "-c:a", codecs[toExt]);
		if (LOSSY_AUDIO.includes(toExt)) args.push(...audioBitrate);
		return [...args, outputName];
	}
	if (toExt === "gif" || animated) {
		args.push("-an", "-vf", ["fps=12", scaleFilter || "scale='min(640,iw)':-2"].join(","));
		if (toExt === "gif") args.push("-loop", "0");
		else args.push("-c:v", "libwebp_anim", "-quality", "70", "-loop", "0");
		return [...args, outputName];
	}
	if (VIDEO_EXTENSIONS.includes(toExt)) {
		const codec =
			toExt === "webm"
				? ["-c:v", "libvpx", "-b:v", "1M", "-c:a", "libvorbis"]
				: [
						"-c:v",
						"libx264",
						"-preset",
						"veryfast",
						"-crf",
						"28",
						"-pix_fmt",
						"yuv420p",
						"-c:a",
						"aac",
					];
		return [
			...args,
			...(scaleFilter ? ["-vf", scaleFilter] : []),
			...codec,
			...audioBitrate,
			outputName,
		];
	}
	return [...args, outputName];
};

// Media conversion using FFmpeg
const convertMedia = async (arrayBuffer, fromExt, toExt, mediaOptions = {}) => {
	try {
		const ff = await initFFmpeg();

		const inputName = `input.${fromExt}`;
		const outputName = `output.${toExt}`;

		post({ status: "log", message: `Writing ${inputName}` });

		const args = buildMediaArgs({
			inputName,
			outputName,
			fromExt,
			toExt,
			resolution: mediaOptions.resolution,
			bitrate: mediaOptions.bitrate,
			trimStart: mediaOptions.trimStart,
			trimEnd: mediaOptions.trimEnd,
			animated: mediaOptions.animated,
		});

		post({
			status: "log",
			message: `Running ffmpeg ${args.join(" ")}`,
		});
		const outBuffer = await runMediaConversion(ff, inputName, outputName, arrayBuffer, args);
		post({
			status: "log",
			message: `Conversion finished: ${outputName} (${outBuffer.byteLength} bytes)`,
		});
		return outBuffer;
	} catch (err) {
		console.error("[worker] Media conversion failed", err);
		throw new Error(`Media conversion failed: ${err.message}. Please try another format.`);
	}
};

const handleConvert = async ({
	filename,
	target,
	ext,
	text,
	arrayBuffer,
	quality,
	mediaOptions,
	jobId,
	compressionOptions,
	imageOptions,
}) => {
	currentJobId = jobId ?? null;
	try {
		let outName = `${filename.replace(/\.[^.]+$/, "")}.${target}`;
		const warnings = [];
		let mime = "application/octet-stream";
		let outBuffer;

		if (
			(ext === "gif" && VIDEO_EXTENSIONS.includes(target)) ||
			target === "animated-webp" ||
			(MEDIA_EXTENSIONS.includes(ext) && target === "gif")
		) {
			const actualTarget = target === "animated-webp" ? "webp" : target;
			outBuffer = await convertMedia(arrayBuffer, ext, actualTarget, {
				...mediaOptions,
				animated: target === "animated-webp",
			});
			mime =
				actualTarget === "webp"
					? "image/webp"
					: actualTarget === "gif"
						? "image/gif"
						: actualTarget === "webm"
							? "video/webm"
							: "video/mp4";
			outName = `${filename.replace(/\.[^.]+$/, "")}.${actualTarget}`;
		} else if (target === "compress" && IMAGE_EXTENSIONS.includes(ext)) {
			const result = await compressImage(arrayBuffer, ext, compressionOptions, imageOptions);
			({ outBuffer, mime } = result);
			warnings.push(...result.warnings);
			outName = `${filename.replace(/\.[^.]+$/, "")}.compressed.${result.ext}`;
		} else if (DATA_EXTENSIONS.includes(ext)) {
			if (ext === target) throw new Error(`Unsupported conversion: ${ext} to ${target}`);
			const result = convertData({ ext, target, text, arrayBuffer });
			({ outBuffer, mime } = result);
			warnings.push(...result.warnings);
		} else if (IMAGE_EXTENSIONS.includes(ext)) {
			// Convert image format using Canvas API
			if (ext === "gif") {
				warnings.push("gif animation flattened to a single frame");
			}
			outBuffer = await convertPicture(arrayBuffer, ext, target, quality, imageOptions);
			mime = imageMimeFor(target);
		} else if (MEDIA_EXTENSIONS.includes(ext)) {
			// Convert using FFmpeg
			outBuffer = await convertMedia(arrayBuffer, ext, target, mediaOptions);
			const mimeMap = {
				mp3: "audio/mpeg",
				wav: "audio/wav",
				aac: "audio/aac",
				flac: "audio/flac",
				ogg: "audio/ogg",
				m4a: "audio/mp4",
				mp4: "video/mp4",
				avi: "video/avi",
				mkv: "video/x-matroska",
				mov: "video/quicktime",
				webm: "video/webm",
				flv: "video/x-flv",
			};
			mime = mimeMap[target] || "application/octet-stream";
		} else {
			throw new Error("Unsupported input format");
		}

		// No branch handled this pairing — refuse instead of "succeeding" with junk
		if (!outBuffer) {
			throw new Error(`Unsupported conversion: ${ext} to ${target}`);
		}

		// Transfer the array buffer back to the main thread
		post({ status: "done", filename: outName, buffer: outBuffer, mime, warnings }, [outBuffer]);
	} catch (err) {
		post({ status: "error", message: err.message || String(err) });
		console.error("[worker] Conversion error", err);
	}
};

// One conversion at a time: later messages queue behind the running one,
// so two converts can never interleave on the shared ffmpeg/filesystem state
let queue = Promise.resolve();

self.onmessage = (e) => {
	const { action } = e.data;
	if (action !== "convert") return;
	queue = queue.then(() => handleConvert(e.data));
};
